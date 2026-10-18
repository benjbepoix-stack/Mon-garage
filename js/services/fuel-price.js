/*
 * Prix moyen des carburants en France, actualisé une fois par mois.
 * Source : données publiques du ministère de l'Économie (flux instantané des prix
 * relevés en station, data.economie.gouv.fr) ; on en tire la moyenne nationale par
 * carburant. Le résultat est gardé sur l'appareil : une seule requête par mois, et
 * sans réseau on garde le dernier prix connu.
 */
import { readJSON, write } from './storage.js';
import { todayKey } from '../core/dates.js';

const CACHE_KEY = 'garage_fuel_prices';
const API = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
// Champs du jeu de données (prix en €/L) ; l'essence prend le SP95-E10, le plus distribué.
const FIELDS = { gazole: 'gazole_prix', e10: 'e10_prix', sp95: 'sp95_prix', sp98: 'sp98_prix', gplc: 'gplc_prix' };
const FUEL_FIELD = { Diesel: 'gazole', Essence: 'e10', Hybride: 'e10', 'Hybride rechargeable': 'e10', GPL: 'gplc' };

const monthNow = () => todayKey().slice(0, 7);
const readCache = () => {
  const c = readJSON(CACHE_KEY, null);
  return c && typeof c === 'object' && c.prices && typeof c.month === 'string' ? c : null;
};

/** Le prix moyen est-il proposé pour cette motorisation ? */
export const hasMarketPrice = v => Boolean(FUEL_FIELD[v?.fuel]);

/** Prix moyen connu pour le véhicule : { price, month } (mois du relevé), ou null. */
export function marketPrice(v) {
  const key = FUEL_FIELD[v?.fuel];
  const c = readCache();
  const price = key && c ? Number(c.prices[key]) : 0;
  return price > 0 ? { price: Math.round(price * 1000) / 1000, month: c.month } : null;
}

let pending = null;

/** Récupère les prix du mois s'ils ne sont pas déjà en cache. Résout à true si de nouveaux prix sont arrivés. */
export function refreshMarketPrices() {
  if (readCache()?.month === monthNow()) return Promise.resolve(false);
  if (pending) return pending;
  const select = Object.entries(FIELDS).map(([k, f]) => `avg(${f}) as ${k}`).join(',');
  pending = fetch(`${API}?select=${encodeURIComponent(select)}&limit=1`, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(json => {
      const row = json?.results?.[0] || {};
      const prices = {};
      for (const k of Object.keys(FIELDS)) {
        let n = Number(row[k]);
        if (n > 10) n /= 1000; // ancien format en millièmes d'euro
        if (n > 0.3 && n < 5) prices[k] = n;
      }
      if (!Object.keys(prices).length) throw new Error('réponse sans prix');
      write(CACHE_KEY, { month: monthNow(), fetchedAt: new Date().toISOString(), prices });
      return true;
    })
    .catch(error => {
      console.warn('[carburant] prix moyen indisponible, dernier prix connu conservé', error);
      return false;
    })
    .finally(() => (pending = null));
  return pending;
}
