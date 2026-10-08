/*
 * Store central : table plate de clés, persistance locale et synchronisation
 * cloud fine (chaque clé modifiée est envoyée seule).
 * Les écritures non confirmées sont conservées (garage_unsynced) et renvoyées
 * au prochain lancement.
 */
import { readJSON, write } from '../services/storage.js';
import { sameJSON } from './utils.js';
import { normalizeKey, isKnownKey, fieldKey, photoKey, DEFAULTS, FIELDS, DEFAULT_REMINDERS, DEFAULT_PARTS, makeId, STYLES } from './schema.js';

export const BASE = 'mon_garage_v2_';
const UNSYNCED_KEY = 'garage_unsynced';
const LEGACY_KEY = 'monGarage_v1';

const data = {};
const listeners = new Set();
let cloudSink = null;
let unsynced = {};

function persist(key) {
  try {
    if (key in data) localStorage.setItem(BASE + key, JSON.stringify(data[key]));
    else localStorage.removeItem(BASE + key);
  } catch (error) {
    console.warn('[store] écriture locale impossible', key, error);
  }
}
const persistUnsynced = () => write(UNSYNCED_KEY, JSON.stringify(unsynced));

function notify(keys, source) {
  listeners.forEach(fn => {
    try {
      fn(keys, source);
    } catch (error) {
      console.error('[store] erreur dans un abonné', error);
    }
  });
}

/** Reprise des données de la première version (monGarage_v1 : { vehicles, bikes }). */
function migrateLegacy() {
  const old = readJSON(LEGACY_KEY, null);
  if (!old || data.vehicles) return;
  const list = [];
  const patch = {};
  const take = (items, kind) =>
    (Array.isArray(items) ? items : []).forEach(item => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.id || makeId());
      const { photo, ...rest } = item;
      list.push({ ...rest, id, kind, hasPhoto: Boolean(photo) });
      if (photo) patch[photoKey(id)] = photo;
      // Même plan d'entretien de départ qu'un véhicule créé dans l'app
      patch[fieldKey(id, 'reminders')] = DEFAULT_REMINDERS[kind].map(r => ({ ...r, id: makeId() }));
      if (kind === 'bike') patch[fieldKey(id, 'parts')] = DEFAULT_PARTS.map(p => ({ ...p, id: makeId(), installedKm: Number(item.mileage) || 0 }));
    });
  take(old.vehicles, 'vehicle');
  take(old.bikes, 'bike');
  if (!list.length) return;
  setKeys({ ...patch, vehicles: list });
}

/**
 * Purge ponctuelle des pleins saisis à la main (clé v_<id>_fuel) : cette fonctionnalité a
 * été retirée (carburant compté uniquement par estimation), mais les données restaient en
 * mémoire sans être ni visibles ni modifiables, et continuaient pourtant à être comptées —
 * on les efface une bonne fois pour toutes, localement et côté cloud.
 */
function purgeLegacyFuel() {
  // Ces clés ne sont plus dans FIELDS (isKnownKey les ignore désormais) : setKeys() ne les
  // verrait jamais, d'où une suppression directe, localStorage puis file d'attente cloud.
  let changed = false;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      const m = k && k.startsWith(BASE) ? /^v_(.+)_fuel$/.exec(k.slice(BASE.length)) : null;
      if (!m) continue;
      localStorage.removeItem(k);
      unsynced[`v_${m[1]}_fuel`] = true;
      changed = true;
    }
  } catch (error) {
    console.warn('[store] purge carburant impossible', error);
  }
  if (changed) persistUnsynced();
}

export function loadLocal() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(BASE)) continue;
      const key = k.slice(BASE.length);
      if (!isKnownKey(key)) continue;
      const value = normalizeKey(key, readJSON(k, null));
      if (value !== null) data[key] = value;
    }
  } catch (error) {
    console.warn('[store] lecture locale impossible', error);
  }
  const saved = readJSON(UNSYNCED_KEY, {});
  unsynced = saved && typeof saved === 'object' ? saved : {};
  migrateLegacy();
  purgeLegacyFuel();
}

export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

/* ---------- Lecture ---------- */
export const vehicles = () => data.vehicles || [];
export const vehicle = id => vehicles().find(v => v.id === id) || null;
export const activeId = () => (vehicle(data.activeId) ? data.activeId : null);
export const active = () => vehicle(activeId());
export const theme = () => data.theme || 'dark';
/** Un seul style graphique (Acier) : le même rendu pour tous les comptes, anciens comme nouveaux. */
export const style = () => STYLES[0].id;
export const photo = id => data[photoKey(id)] || '';

/** Champ d'un véhicule (copie modifiable). */
export function field(name, id = activeId()) {
  const value = id ? data[fieldKey(id, name)] : undefined;
  return structuredClone(value === undefined ? DEFAULTS[name] : value);
}

/* ---------- Écriture ---------- */
/** Enregistre un ensemble de clés : { clé: valeur } ; valeur null = suppression. */
export function setKeys(patch) {
  const payload = {};
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw === null || raw === undefined ? null : normalizeKey(key, raw);
    if (value === null) {
      if (!(key in data)) continue;
      delete data[key];
    } else {
      data[key] = value;
    }
    persist(key);
    payload[key] = key in data ? data[key] : null;
    unsynced[key] = true;
  }
  persistUnsynced();
  if (Object.keys(payload).length) cloudSink?.(payload);
  notify(Object.keys(payload), 'local');
}

export const setField = (name, value, id = activeId()) => id && setKeys({ [fieldKey(id, name)]: value });

/** Met à jour un véhicule (fusion des champs). */
export function updateVehicle(id, changes) {
  setKeys({ vehicles: vehicles().map(v => (v.id === id ? { ...v, ...changes } : v)) });
}

/** Clés à supprimer pour retirer un véhicule. */
export function removalPatch(id) {
  const patch = { [photoKey(id)]: null };
  FIELDS.forEach(f => (patch[fieldKey(id, f)] = null));
  return patch;
}

/* ---------- Synchronisation ---------- */
export function setCloudSink(fn) {
  cloudSink = fn;
  const keys = Object.keys(unsynced);
  if (keys.length) cloudSink(Object.fromEntries(keys.map(k => [k, k in data ? data[k] : null])));
}

export function acknowledge(keys) {
  let changed = false;
  keys.forEach(k => {
    if (unsynced[k]) {
      delete unsynced[k];
      changed = true;
    }
  });
  if (changed) persistUnsynced();
}

/** Applique l'état distant complet. */
export function applyRemote(remote) {
  const incoming = remote && typeof remote === 'object' ? remote : {};
  const keys = new Set([...Object.keys(data), ...Object.keys(incoming)].filter(isKnownKey));
  const changed = [];
  for (const key of keys) {
    if (unsynced[key]) continue; // modification locale en cours d'envoi
    if (key in incoming) {
      const next = normalizeKey(key, incoming[key]);
      if (next === null || sameJSON(next, data[key])) continue;
      data[key] = next;
    } else {
      if (!(key in data)) continue;
      delete data[key];
    }
    persist(key);
    changed.push(key);
  }
  if (changed.length) notify(changed, 'remote');
  return changed;
}

/** Efface toutes les données locales (changement de compte). */
export function resetLocal() {
  Object.keys(data).forEach(k => {
    delete data[k];
    persist(k);
  });
  unsynced = {};
  persistUnsynced();
  notify(['vehicles'], 'reset');
}

export const cloudSnapshot = () => structuredClone(data);
