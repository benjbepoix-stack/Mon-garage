/*
 * Pièces jointes des documents (photos, PDF), hors du nœud synchronisé.
 * Le document ne garde que les métadonnées ({ id, name, mime }) ; le contenu
 * (data URL) est rangé :
 * - sur l'appareil, dans IndexedDB (base mon_garage_files) — le localStorage
 *   de Safari est limité à ~5 Mo ;
 * - dans le cloud, sous users/<uid>/garage_files/<id>, lu à la demande.
 * Un envoi impossible (hors ligne, sans compte) reste en attente et est
 * retenté au lancement suivant ; une suppression aussi.
 */
import { canUseCloudFiles, cloudFilePut, cloudFileGet, cloudFileDelete, currentUser } from './firebase.js';
import { readJSON, write } from './storage.js';

const DB_NAME = 'mon_garage_files';
const STORE = 'files';
const PENDING_KEY = 'garage_files_pending';
const DELETED_KEY = 'garage_files_deleted';
const CLOUD_WAIT = 15000;

/**
 * Incrémenté au changement de compte (clearLocalFiles) : une copie ou un envoi commencé pour
 * l'ancien compte est abandonné, jamais rangé ni envoyé dans le nouveau.
 */
let epoch = 0;
export const filesEpoch = () => epoch;
const owner = () => currentUser()?.uid || null;

/** Identifiant utilisable comme clé Firebase (pas de « . # $ [ ] / »). */
export const isFileId = id => typeof id === 'string' && /^[\w-]{1,60}$/.test(id);

/** Type d'une data URL (« data:image/jpeg;base64,… » → « image/jpeg »). */
export const mimeOf = data => {
  const s = String(data || '');
  const end = s.search(/[;,]/);
  return s.startsWith('data:') && end > 5 ? s.slice(5, end).toLowerCase() : '';
};

/* ---------- Copie locale (IndexedDB) ---------- */
let dbPromise = null;
function idb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(error => {
    dbPromise = null; // nouvel essai au prochain accès
    throw error;
  });
  return dbPromise;
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
async function localGet(id) {
  try {
    return (await tx('readonly', s => s.get(id))) || null;
  } catch (error) {
    console.warn('[files] lecture locale impossible', error);
    return null;
  }
}
async function localPut(id, data) {
  try {
    await tx('readwrite', s => s.put(data, id));
    return (await localGet(id)) === data; // relu : la copie est bien là
  } catch (error) {
    console.warn('[files] copie locale impossible', error);
    return false;
  }
}
async function localDelete(id) {
  try {
    await tx('readwrite', s => s.delete(id));
  } catch {
    /* rien à supprimer */
  }
}

/* ---------- Files d'attente (envois et suppressions) ---------- */
const queue = key => new Set(readJSON(key, []));
const saveQueue = (key, set) => write(key, JSON.stringify([...set]));
function mark(key, id, on) {
  const q = queue(key);
  if (on === q.has(id)) return;
  if (on) q.add(id);
  else q.delete(id);
  saveQueue(key, q);
}
const withTimeout = (p, ms) => Promise.race([p, new Promise(resolve => setTimeout(() => resolve(false), ms))]);

/** Envoi dans le compte `uid` (celui de l'enregistrement) : refusé si un autre compte est connecté entre-temps. */
async function upload(id, data, uid) {
  if (!canUseCloudFiles() || !uid || owner() !== uid) return false;
  try {
    await cloudFilePut(id, data);
    mark(PENDING_KEY, id, false);
    return true;
  } catch (error) {
    console.warn('[files] envoi impossible', id, error);
    return false;
  }
}

/**
 * Enregistre un fichier (data URL) : copie locale tout de suite, copie cloud dès que possible.
 * `waitCloud` : attendre la confirmation du cloud (sinon envoi en arrière-plan, hors ligne
 * la base Firebase ne répond qu'au retour du réseau). `epoch` : valeur de filesEpoch() au début
 * de l'opération appelante — refusé si le compte a changé depuis.
 * @returns {Promise<{ local: boolean, cloud: boolean }>}
 */
export async function saveFile(id, data, { waitCloud = false, epoch: expected = epoch } = {}) {
  if (!isFileId(id) || typeof data !== 'string' || !data.startsWith('data:')) return { local: false, cloud: false };
  if (expected !== epoch) return { local: false, cloud: false };
  const start = epoch;
  const uid = owner();
  const local = await localPut(id, data);
  if (start !== epoch) {
    // Compte changé pendant la copie : le fichier de l'ancien compte ne reste pas sur l'appareil.
    if (local) await localDelete(id);
    return { local: false, cloud: false };
  }
  mark(DELETED_KEY, id, false);
  if (local) mark(PENDING_KEY, id, true); // retiré dès que le cloud confirme
  const sending = upload(id, data, uid);
  // Sans copie locale, seul le cloud garde le fichier : on attend sa réponse.
  const cloud = waitCloud || !local ? await withTimeout(sending, CLOUD_WAIT) : false;
  return { local, cloud };
}

/** Lit un fichier : copie locale, sinon cloud (puis mise en cache sur l'appareil). */
export async function getFile(id) {
  if (!isFileId(id)) return null;
  const local = await localGet(id);
  if (local) return local;
  if (!canUseCloudFiles()) return null;
  const start = epoch;
  const remote = await cloudFileGet(id);
  if (typeof remote !== 'string') return null;
  if (start === epoch) await localPut(id, remote); // pas de copie si le compte a changé entre-temps
  return remote;
}

/** Supprime un fichier (appareil + cloud) ; hors ligne, la suppression cloud est retentée plus tard. */
export async function deleteFile(id) {
  if (!isFileId(id)) return;
  await localDelete(id);
  mark(PENDING_KEY, id, false);
  if (!canUseCloudFiles()) return mark(DELETED_KEY, id, true);
  try {
    await cloudFileDelete(id);
    mark(DELETED_KEY, id, false);
  } catch {
    mark(DELETED_KEY, id, true);
  }
}

/** Fichiers de plusieurs pièces jointes à supprimer (métadonnées de documents). */
export const deleteFiles = files => (files || []).forEach(f => f?.id && deleteFile(f.id));

/** Changement de compte sur l'appareil : fichiers et envois en attente de l'ancien compte oubliés. */
export async function clearLocalFiles() {
  epoch++;
  saveQueue(PENDING_KEY, new Set());
  saveQueue(DELETED_KEY, new Set());
  try {
    await tx('readwrite', s => s.clear());
  } catch {
    /* rien à effacer */
  }
}

/** Renvoie les fichiers et suppressions restés en attente (à appeler une fois connecté). */
export async function retryPendingFiles() {
  if (!canUseCloudFiles()) return;
  const start = epoch;
  const uid = owner();
  for (const id of queue(PENDING_KEY)) {
    // eslint-disable-next-line no-await-in-loop
    const data = await localGet(id);
    if (start !== epoch) return; // changement de compte : la file de l'ancien compte est abandonnée
    if (!data) mark(PENDING_KEY, id, false);
    // eslint-disable-next-line no-await-in-loop
    else await upload(id, data, uid);
  }
  for (const id of queue(DELETED_KEY)) {
    if (start !== epoch || owner() !== uid) return;
    try {
      // eslint-disable-next-line no-await-in-loop
      await cloudFileDelete(id);
      mark(DELETED_KEY, id, false);
    } catch {
      /* retenté au prochain lancement */
    }
  }
}
