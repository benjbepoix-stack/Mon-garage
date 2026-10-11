/*
 * Firebase : authentification (e-mail / mot de passe) + Realtime Database.
 *
 * - SDK chargé dynamiquement : si Firebase est injoignable, l'app propose de
 *   continuer hors ligne avec les données de l'appareil.
 * - Session conservée sur l'appareil (même stockage que l'ancienne version :
 *   aucune reconnexion nécessaire après la mise à jour).
 * - Données : users/<uid>/garage — écritures clé par clé (`update`).
 * - Pièces jointes des documents : users/<uid>/garage_files/<id>, hors du nœud
 *   synchronisé (lues à la demande, voir js/services/files.js).
 * - Liens avec Carnet et Mon budget (même projet, même compte) :
 *   users/<uid>/carnet/garage_alerts et users/<uid>/budget/linked/garage (`linkSet`).
 * - Tant que la configuration n'est pas renseignée, l'app fonctionne en local.
 */
import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from '../config/firebase-config.js';

const SDK = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
const LOAD_TIMEOUT = 12000;
const WRITE_DELAY = 250;

let appMod, authMod, dbMod, auth, db;
let user = null;
let rootRef = null;
let ready = false;
let connected = null;
let fatal = null;
let inflight = 0;
let buffer = {};
let flushTimer = null;
let unsubscribeData = null;
/** Incrémenté à chaque changement de compte : les réponses d'une session précédente sont ignorées. */
let session = 0;
let handlers = { onUser: () => {}, onRemote: () => {}, onStatus: () => {}, onError: () => {}, onAck: () => {}, onReady: () => {}, getSnapshot: () => ({}) };

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(msg)), ms))]);
const clean = v => JSON.parse(JSON.stringify(v));

function emitStatus() {
  let status;
  if (fatal) status = 'local';
  else if (connected === false) status = 'offline';
  else if (!ready) status = 'connecting';
  else if (inflight > 0 || Object.keys(buffer).length) status = 'syncing';
  else status = 'online';
  handlers.onStatus(status, fatal);
}

export function describeAuthError(error) {
  const map = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cette adresse e-mail.',
    'auth/missing-password': 'Indiquez votre mot de passe.',
    'auth/email-already-in-use': 'Cette adresse possède déjà un compte : utilisez « Se connecter ».',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/operation-not-allowed': 'La connexion e-mail / mot de passe n’est pas activée dans Firebase (Authentication → Sign-in method).',
    'auth/network-request-failed': 'Connexion Internet indisponible.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.'
  };
  return map[error?.code] || 'Une erreur est survenue. Réessayez.';
}

function describeDbError(error) {
  const code = String(error?.code || error?.message || '');
  if (/permission/i.test(code)) return 'Accès refusé par les règles Firebase.';
  return 'Synchronisation indisponible.';
}

/* ---------- Écritures ---------- */
function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!ready || fatal || !rootRef || !Object.keys(buffer).length) return emitStatus();
  const payload = clean(buffer);
  const id = session;
  buffer = {};
  inflight++;
  emitStatus();
  dbMod
    .update(rootRef, payload)
    .then(() => id === session && handlers.onAck(Object.keys(payload)))
    .catch(error => {
      console.error('[firebase] écriture refusée', error);
      // Écriture d'un compte précédent (déconnexion entre-temps) : sans effet sur le compte actuel.
      if (id === session) handlers.onError(describeDbError(error));
    })
    .finally(() => {
      inflight--;
      emitStatus();
    });
}

export function pushCloud(payload) {
  Object.assign(buffer, payload);
  if (fatal) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, WRITE_DELAY);
  emitStatus();
}

export const flushNow = () => flushTimer && flush();

/** Abandonne les écritures en attente (changement de compte). */
export function clearPending() {
  clearTimeout(flushTimer);
  flushTimer = null;
  buffer = {};
}

/* ---------- Données de l'utilisateur ---------- */
function listen(u) {
  unsubscribeData?.();
  const id = ++session;
  ready = false;
  // Accès refusé pour la session précédente (ex. : mot de passe changé ailleurs) : nouvel essai pour ce compte.
  fatal = null;
  rootRef = dbMod.ref(db, `users/${u.uid}/garage`);
  let first = true;
  unsubscribeData = dbMod.onValue(
    rootRef,
    snap => {
      if (id !== session) return;
      const value = snap.val();
      if (first) {
        first = false;
        const hasData = value && typeof value === 'object' && Object.keys(value).length > 0;
        if (hasData) handlers.onRemote(value);
        else Object.assign(buffer, handlers.getSnapshot(), buffer); // compte vide : on envoie l'appareil
        ready = true;
        flush();
        handlers.onReady({ loaded: true });
        return;
      }
      handlers.onRemote(value || {});
    },
    error => {
      if (id !== session) return;
      console.error('[firebase] lecture refusée', error);
      fatal = describeDbError(error);
      emitStatus();
      handlers.onError(fatal);
      handlers.onReady({ loaded: false });
    }
  );
}

/* ---------- Initialisation ---------- */
export async function initFirebase(options) {
  handlers = { ...handlers, ...options };
  if (!isConfigured()) {
    fatal = 'Synchronisation non configurée : données enregistrées sur cet appareil.';
    emitStatus();
    return false;
  }
  emitStatus();
  try {
    [appMod, authMod, dbMod] = await withTimeout(
      Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`)]),
      LOAD_TIMEOUT,
      'timeout'
    );
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    auth = authMod.getAuth(app);
    db = dbMod.getDatabase(app);
    await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => {});
    dbMod.onValue(dbMod.ref(db, '.info/connected'), snap => {
      connected = snap.val() === true;
      emitStatus();
    });
    authMod.onAuthStateChanged(auth, u => {
      user = u;
      // onUser d'abord : l'app peut purger les données d'un autre compte avant la synchro.
      handlers.onUser(u);
      if (u) listen(u);
      else {
        session++;
        unsubscribeData?.();
        unsubscribeData = null;
        ready = false;
        rootRef = null;
      }
      emitStatus();
    });
    return true;
  } catch (error) {
    console.warn('[firebase] indisponible', error);
    fatal = 'Firebase est injoignable (connexion ?).';
    emitStatus();
    return false;
  }
}

export const currentUser = () => user;

/*
 * Pièces jointes des documents (photos, PDF) : rangées hors du nœud synchronisé
 * (users/<uid>/garage_files/<id>) pour ne jamais être téléchargées en bloc à
 * l'ouverture de l'app ni renvoyées à chaque modification — chacune est lue à la demande.
 */
const fileRef = id => dbMod.ref(db, `users/${user.uid}/garage_files/${id}`);
export const canUseCloudFiles = () => Boolean(user && dbMod && db && !fatal);
export async function cloudFilePut(id, dataUrl) {
  await dbMod.set(fileRef(id), dataUrl);
}
export async function cloudFileGet(id) {
  const snap = await withTimeout(dbMod.get(fileRef(id)), 20000, 'timeout');
  return snap.exists() ? snap.val() : null;
}
export async function cloudFileDelete(id) {
  await dbMod.remove(fileRef(id));
}

/*
 * Liens avec Carnet et Mon budget (même projet, même compte) : écrit `value`
 * sous users/<uid>/<path> (carnet/garage_alerts, budget/linked/garage).
 * Refusé sans compte connecté (rien n'est publié hors ligne ou en local) et si
 * la lecture du compte a échoué.
 */
export async function linkSet(path, value) {
  if (!user || !dbMod || !db) throw new Error('Aucun compte connecté.');
  if (fatal) throw new Error(fatal);
  const rel = String(path || '').split('/').filter(Boolean).join('/');
  if (!rel) throw new Error('Chemin vide.');
  await dbMod.set(dbMod.ref(db, `users/${user.uid}/${rel}`), clean(value));
}

export const isConfigured = () => Boolean(FIREBASE_CONFIG?.apiKey && FIREBASE_CONFIG?.databaseURL);

export async function signIn(email, password) {
  return authMod.signInWithEmailAndPassword(auth, email, password);
}
export async function signUp(email, password) {
  return authMod.createUserWithEmailAndPassword(auth, email, password);
}
export async function resetPassword(email) {
  return authMod.sendPasswordResetEmail(auth, email);
}
export async function signOutUser() {
  flushNow();
  return authMod.signOut(auth);
}
