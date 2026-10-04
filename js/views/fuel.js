/* Carburant / recharge : estimation mensuelle (consommation × prix × km moyen),
   seule façon de compter le carburant dans les coûts — pas de saisie de plein par plein. */
import { $ } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, fromKey, addDays, dateKey } from '../core/dates.js';
import { monthOf, costSummary } from '../core/calc.js';
import { isElectric, makeId } from '../core/schema.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { km, euro, toNumber, numInput, fieldsOf } from './common.js';

/* ---------- Estimation mensuelle ---------- */
const FUEL_ESTIMATE_CATEGORY = 'Carburant';
const activeEstimate = f => f.fixed.find(x => x.category === FUEL_ESTIMATE_CATEGORY && x.auto && !x.end);
const avgKmPerMonth = s => (s.monthsOwned ? s.km / s.monthsOwned : 0);
let lastFuelSummary = null;

function refreshFuelEstimate() {
  const s = lastFuelSummary;
  if (!s) return;
  const avgKm = avgKmPerMonth(s);
  $('#ffKmMonth').textContent = avgKm ? `≈ ${km(Math.round(avgKm))} / mois` : '—';
  const consumptionValue = toNumber($('#ffConsumption').value) || 0;
  const price = toNumber($('#ffPrice').value) || 0;
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
  $('#ffTitle').textContent = ev ? 'Recharge' : 'Carburant';
  $('#ffConsumptionLabel').textContent = ev ? 'Conso. · kWh/100 km' : 'Conso. · L/100 km';
  $('#ffPriceLabel').textContent = ev ? 'Prix · €/kWh' : 'Prix · €/L';
  const active = activeEstimate(f);
  if (document.activeElement !== $('#ffConsumption')) $('#ffConsumption').value = active ? numInput(active.fuelConsumption) : '';
  if (document.activeElement !== $('#ffPrice')) $('#ffPrice').value = active ? numInput(active.fuelPrice) : '';
  refreshFuelEstimate();
}

/**
 * Enregistre (ou met à jour) l'estimation mensuelle. Première activation : on rattrape
 * l'historique depuis l'achat du véhicule (si connu) en appliquant la consommation et le
 * prix saisis à toute la période déjà écoulée. Ensuite, modifier ces deux champs ne change
 * jamais les mois déjà passés : une nouvelle période démarre aujourd'hui (l'ancienne se clôt
 * hier), sauf si la précédente mise à jour date déjà de ce mois-ci (ajustement sur place).
 */
function saveFuelEstimate() {
  const v = store.active();
  const f = fieldsOf(v.id);
  const consumptionValue = toNumber($('#ffConsumption').value);
  const price = toNumber($('#ffPrice').value);
  if (!consumptionValue || !price) return toastError('Indiquez la consommation et le prix.');
  const s = costSummary(v, f);
  const avgKm = avgKmPerMonth(s);
  const amount = Math.round((consumptionValue / 100) * avgKm * price * 100) / 100;
  const today = todayKey();
  const active = activeEstimate(f);
  const hasHistory = f.fixed.some(x => x.category === FUEL_ESTIMATE_CATEGORY && x.auto);
  let list = f.fixed;
  if (active && monthOf(active.start) === monthOf(today)) {
    // Déjà modifié ce mois-ci et aucun mois passé ne dépend de cette valeur : on ajuste sur place.
    list = list.map(x => (x === active ? { ...x, amount, fuelConsumption: consumptionValue, fuelPrice: price } : x));
  } else {
    if (active) {
      const yesterday = dateKey(addDays(fromKey(today), -1));
      list = list.map(x => (x === active ? { ...x, end: yesterday > active.start ? yesterday : active.start } : x));
    }
    const start = hasHistory ? today : v.purchaseDate || today;
    list = [...list, { id: makeId(), category: FUEL_ESTIMATE_CATEGORY, label: '', amount, period: 'month', start, end: '', auto: true, fuelConsumption: consumptionValue, fuelPrice: price }];
  }
  store.setField('fixed', list, v.id);
  toast(hasHistory ? 'Estimation carburant mise à jour' : 'Estimation activée, appliquée depuis l’achat');
  renderFuel(v, fieldsOf(v.id));
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
  $('#ffSave').addEventListener('click', saveFuelEstimate);
  $('#ffReset').addEventListener('click', resetFuelEstimate);
}
