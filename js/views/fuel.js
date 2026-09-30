/* Carburant / recharge : pleins, consommation, coût au km, dépenses mensuelles. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { consumption, unitPrice, currentKm, addMonths, monthOf } from '../core/calc.js';
import { isElectric, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { renderBarChart } from '../ui/charts.js';
import { km, euro, euroRound, dec, toNumber, numInput, intInput, positive, capitalize } from './common.js';

const unitOf = v => (isElectric(v) ? 'kWh' : 'L');
const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });

function row(v, x) {
  const u = unitOf(v);
  const price = unitPrice(x);
  const sub = [fmtDate(x.date), x.km ? km(x.km) : '', x.full ? '' : 'partiel'].filter(Boolean).join(' · ');
  return `<div class="row" data-edit data-fuel="${esc(x.id)}">
    <span class="row__icon">${icon(isElectric(v) ? 'bolt' : 'fuel', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(dec(x.qty, 2))} ${u}${price ? ` <span class="row__soft">· ${esc(dec(price, 3))} €/${u}</span>` : ''}</span><span class="row__sub">${esc(sub)}</span></div>
    <div class="row__amount">${esc(euro(x.total))}</div>
  </div>`;
}

export function renderFuel(v, f) {
  const u = unitOf(v);
  const ev = isElectric(v);
  const c = consumption(f.fuel);
  const month = monthOf(todayKey());
  const year = todayKey().slice(0, 4);
  const sum = pred => f.fuel.filter(pred).reduce((s, x) => s + x.total, 0);
  $('#fuelStats').innerHTML = [
    [c ? `${dec(c.per100, 1)}` : '—', `${u}/100 km`],
    [c ? `${dec(c.costPerKm * 100, 2)} €` : '—', 'pour 100 km'],
    [euroRound(sum(x => x.date.startsWith(year))), `en ${year}`]
  ]
    .map(([val, l]) => `<div class="stat"><strong>${esc(val)}</strong><span>${esc(l)}</span></div>`)
    .join('');
  $('#fuelChartTitle').textContent = ev ? 'Dépenses de recharge' : 'Dépenses de carburant';
  $('#fuelListTitle').textContent = ev ? 'Recharges' : 'Pleins';
  const groups = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(month, i - 11);
    const d = new Date(`${m}-01T12:00:00`);
    return { key: m, label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''), title: capitalize(d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })), values: { spent: sum(x => x.date.startsWith(m)) } };
  });
  renderBarChart($('#fuelChart'), groups, {
    bars: [{ key: 'spent', label: ev ? 'Recharge' : 'Carburant', color: 'var(--series-1)' }],
    fmt: euro,
    axisFmt: n => `${Math.round(n)} €`,
    highlight: month
  });
  $('#fuelList').innerHTML = f.fuel.length
    ? f.fuel.map(x => row(v, x)).join('')
    : `<div class="empty-state"><p>Aucun${ev ? 'e recharge' : ' plein'}. Notez le compteur à chaque ${ev ? 'recharge' : 'plein'} : la consommation se calcule toute seule.</p></div>`;
  $('#panel-fuel .add-btn').setAttribute('aria-label', ev ? 'Ajouter une recharge' : 'Ajouter un plein');
}

export function openFuel(id = null) {
  const v = store.active();
  const list = store.field('fuel', v.id);
  const x = id ? list.find(e => e.id === id) : null;
  const form = $('#fuelForm');
  form.reset();
  clearErrors(form);
  const ev = isElectric(v);
  form.elements.editId.value = x ? x.id : '';
  form.elements.date.value = x?.date || todayKey();
  form.elements.km.value = intInput(x ? x.km : '');
  form.elements.km.placeholder = `Dernier : ${intInput(currentKm(v, { maintenance: store.field('maintenance', v.id), fuel: list })) || '—'}`;
  form.elements.qty.value = x ? numInput(x.qty) : '';
  form.elements.total.value = x ? numInput(x.total) : '';
  form.elements.full.checked = x ? x.full : true;
  $('#fuQtyLabel').textContent = ev ? 'Énergie (kWh)' : 'Litres';
  $('#fuFullLabel').textContent = ev ? 'Recharge complète (100 %)' : 'Plein complet';
  $('#fuHelp').textContent = `La consommation est calculée entre deux ${ev ? 'recharges complètes' : 'pleins complets'}.`;
  $('#fuelTitle').textContent = x ? (ev ? 'Modifier la recharge' : 'Modifier le plein') : ev ? 'Nouvelle recharge' : 'Nouveau plein';
  $('#fuelDelete').hidden = !x;
  openSheet('fuelSheet', { focus: false });
}

const schema = {
  date: [rules.date({ required: true })],
  km: [positive('Le compteur', { integer: true, max: 3000000 })],
  qty: [positive('La quantité', { required: true, max: 10000 }), v => (toNumber(v) === 0 ? 'La quantité doit être supérieure à 0.' : null)],
  total: [positive('Le montant', { required: true, max: 100000 })]
};

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, schema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const list = store.field('fuel', v.id);
  const item = { id: val.editId || makeId(), date: val.date, km: toNumber(val.km) || 0, qty: toNumber(val.qty), total: toNumber(val.total), full: form.elements.full.checked };
  store.setField('fuel', val.editId ? list.map(x => (x.id === val.editId ? item : x)) : [...list, item], v.id);
  closeSheet('fuelSheet');
  toast(`${isElectric(v) ? 'Recharge' : 'Plein'} enregistré${isElectric(v) ? 'e' : ''} · ${euro(item.total)}`);
}

async function remove() {
  const v = store.active();
  const id = $('#fuelForm').elements.editId.value;
  const list = store.field('fuel', v.id);
  const x = list.find(e => e.id === id);
  if (!x || !(await confirmDialog({ title: 'Supprimer cette saisie ?', message: `${fmtDate(x.date)} · ${euro(x.total)}`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('fuel', list.filter(e => e !== x), v.id);
  closeSheet('fuelSheet');
  toast('Saisie supprimée');
}

export function initFuel() {
  $('#fuelForm').addEventListener('submit', onSubmit);
  $('#fuelDelete').addEventListener('click', remove);
  $('#fuelList').addEventListener('click', e => {
    const r = e.target.closest('[data-fuel]');
    if (r) openFuel(r.dataset.fuel);
  });
}
