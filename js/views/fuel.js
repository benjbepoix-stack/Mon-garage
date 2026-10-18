/* Carburant / recharge : estimation mensuelle (consommation × prix × km moyen),
   seule façon de compter le carburant dans les coûts — pas de saisie de plein par plein. */
import { $, parseNumber } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, fromKey, addDays, dateKey } from '../core/dates.js';
import { monthOf, costSummary, activeFuelEstimate } from '../core/calc.js';
import { isElectric, makeId } from '../core/schema.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { km, euro, toNumber, numInput, fieldsOf } from './common.js';
import { hasMarketPrice, marketPrice } from '../services/fuel-price.js';

/* ---------- Estimation mensuelle ---------- */
const FUEL_ESTIMATE_CATEGORY = 'Carburant';
const avgKmPerMonth = s => (s.monthsOwned ? s.km / s.monthsOwned : 0);
let lastFuelSummary = null;

function refreshFuelEstimate() {
  const s = lastFuelSummary;
  if (!s) return;
  const avgKm = avgKmPerMonth(s);
  $('#ffKmMonth').textContent = avgKm ? `≈ ${km(Math.round(avgKm))} / mois` : '—';
  const consumptionValue = toNumber($('#ffConsumption').value) || 0;
  const price = priceInput() || 0;
  const estimate = (consumptionValue / 100) * avgKm * price;
  $('#ffEstimate').textContent = estimate
    ? `≈ ${euro(estimate)} / mois`
    : avgKm
      ? 'Renseignez la consommation et le prix pour estimer le coût mensuel.'
      : 'Renseignez l’achat (date, kilométrage) pour estimer le km moyen par mois.';
}

export function renderFuel(v, f) {
  const s = costSummary(v, f);
  lastFuelSummary = s;
  const ev = isElectric(v);
  $('#ffConsumptionLabel').textContent = ev ? 'Conso. · kWh/100 km' : 'Conso. · L/100 km';
  $('#ffPriceLabel').textContent = ev ? 'Prix · €/kWh' : 'Prix · €/L';
  const active = activeFuelEstimate(f);
  if (document.activeElement !== $('#ffConsumption')) $('#ffConsumption').value = active ? numInput(active.fuelConsumption) : '';
  if (document.activeElement !== $('#ffPrice')) $('#ffPrice').value = active ? priceText(active.fuelPrice) : '';
  $('#ffPriceAutoRow').hidden = !hasMarketPrice(v);
  $('#ffPriceAuto').checked = hasMarketPrice(v) && (active ? active.fuelPriceAuto : true);
  syncPriceAuto(v);
  refreshFuelEstimate();
}

/* ---------- Prix moyen France (actualisé chaque mois) ---------- */
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const priceText = n => (n ? String(n).replace('.', ',') : '');
// Au millième d'euro près (1,689 €/L), comme les prix affichés en station.
const priceInput = () => {
  const n = parseNumber($('#ffPrice').value);
  return n && n > 0 ? Math.round(n * 1000) / 1000 : null;
};
const isPriceAuto = v => hasMarketPrice(v) && $('#ffPriceAuto').checked;

/** Case cochée : le prix affiché est le prix moyen du mois (non modifiable) ; sans prix connu, saisie libre en attendant. */
function syncPriceAuto(v) {
  const auto = isPriceAuto(v);
  const market = auto ? marketPrice(v) : null;
  $('#ffPrice').readOnly = Boolean(market);
  if (market) $('#ffPrice').value = priceText(market.price);
  const [y, m] = (market?.month || '').split('-').map(Number);
  $('#ffPriceAutoHelp').textContent = !auto
    ? ''
    : market
      ? `Moyenne en ${MONTHS[m - 1]} ${y}`
      : 'Prix moyen indisponible pour l’instant : saisissez-le, il sera remplacé à la prochaine actualisation.';
}

/**
 * Enregistre (ou met à jour) l'estimation mensuelle. Première activation : on rattrape
 * l'historique depuis l'achat du véhicule (si connu) en appliquant la consommation et le
 * prix saisis à toute la période déjà écoulée. Ensuite, modifier ces deux champs ne change
 * jamais les mois déjà passés : une nouvelle période démarre au 1er du mois en cours (l'ancienne
 * se clôt à la fin du mois précédent), sauf si la précédente mise à jour date déjà de ce mois-ci
 * (ajustement sur place). La bascule se fait sur une frontière de mois, jamais en plein mois : les
 * coûts se comptent par mois entier (pas de prorata journalier, voir fixedFor dans calc.js), donc
 * clôturer l'ancienne période « hier » tout en démarrant la nouvelle « aujourd'hui » du même mois
 * faisait compter les deux en entier pour ce mois-là (carburant doublé le mois de la bascule).
 */
function withEstimate(v, f, { consumption, price, priceAuto }) {
  const s = costSummary(v, f);
  const amount = Math.round((consumption / 100) * avgKmPerMonth(s) * price * 100) / 100;
  const fields = { amount, fuelConsumption: consumption, fuelPrice: price, fuelPriceAuto: priceAuto };
  const today = todayKey();
  const active = activeFuelEstimate(f);
  const hasHistory = f.fixed.some(x => x.category === FUEL_ESTIMATE_CATEGORY && x.auto);
  let list = f.fixed;
  if (active && monthOf(active.start) === monthOf(today)) {
    // Déjà modifié ce mois-ci et aucun mois passé ne dépend de cette valeur : on ajuste sur place.
    return list.map(x => (x === active ? { ...x, ...fields } : x));
  }
  const start = hasHistory ? `${monthOf(today)}-01` : v.purchaseDate || today;
  if (active) {
    const monthEnd = dateKey(addDays(fromKey(start), -1));
    list = list.map(x => (x === active ? { ...x, end: monthEnd > active.start ? monthEnd : active.start } : x));
  }
  return [...list, { id: makeId(), category: FUEL_ESTIMATE_CATEGORY, label: '', period: 'month', start, end: '', auto: true, ...fields }];
}

function saveFuelEstimate() {
  const v = store.active();
  const f = fieldsOf(v.id);
  const consumption = toNumber($('#ffConsumption').value);
  const price = priceInput();
  if (!consumption || !price) return toastError('Indiquez la consommation et le prix.');
  const hasHistory = f.fixed.some(x => x.category === FUEL_ESTIMATE_CATEGORY && x.auto);
  store.setField('fixed', withEstimate(v, f, { consumption, price, priceAuto: isPriceAuto(v) }), v.id);
  toast(hasHistory ? 'Estimation carburant mise à jour' : 'Estimation activée, appliquée depuis l’achat');
  renderFuel(v, fieldsOf(v.id));
}

/**
 * Actualisation mensuelle : chaque estimation réglée sur le prix moyen reprend le prix du
 * mois dès qu'il change, sous forme d'une nouvelle période au 1er du mois (les mois passés
 * gardent leur prix, comme pour une mise à jour à la main).
 */
export function applyMarketPrices() {
  for (const v of store.vehicles()) {
    if (v.archived) continue;
    const f = fieldsOf(v.id);
    const active = activeFuelEstimate(f);
    const market = active?.fuelPriceAuto ? marketPrice(v) : null;
    if (!market || Math.abs(market.price - active.fuelPrice) < 0.0005) continue;
    const list = withEstimate(v, f, { consumption: active.fuelConsumption, price: market.price, priceAuto: true });
    // Km moyen inconnu (montant nul) : on garde la période en cours plutôt que de la clore sans relève.
    if (!list.some(x => x.auto && !x.end && x.amount > 0)) continue;
    store.setField('fixed', list, v.id);
  }
}

/** Efface l'historique estimé (toutes les périodes auto) pour pouvoir rattraper à nouveau depuis l'achat. */
async function resetFuelEstimate() {
  const v = store.active();
  const f = fieldsOf(v.id);
  const hasAny = f.fixed.some(x => x.category === FUEL_ESTIMATE_CATEGORY && x.auto);
  if (hasAny) {
    const ok = await confirmDialog({
      title: 'Réinitialiser l’estimation ?',
      message: 'L’historique déjà calculé est effacé. La prochaine saisie sera rattrapée depuis l’achat du véhicule.',
      confirmLabel: 'Réinitialiser',
      danger: true
    });
    if (!ok) return;
    store.setField('fixed', f.fixed.filter(x => !(x.category === FUEL_ESTIMATE_CATEGORY && x.auto)), v.id);
    toast('Estimation réinitialisée');
  }
  $('#ffConsumption').value = '';
  $('#ffPrice').value = '';
  renderFuel(v, fieldsOf(v.id));
}

export function initFuel() {
  $('#ffConsumption').addEventListener('input', refreshFuelEstimate);
  $('#ffPrice').addEventListener('input', refreshFuelEstimate);
  $('#ffPriceAuto').addEventListener('change', () => {
    const v = store.active();
    syncPriceAuto(v);
    if (!isPriceAuto(v)) $('#ffPrice').focus();
    refreshFuelEstimate();
  });
  $('#ffSave').addEventListener('click', saveFuelEstimate);
  $('#ffReset').addEventListener('click', resetFuelEstimate);
}
