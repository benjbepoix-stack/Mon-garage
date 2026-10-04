/* Coûts : coût réel depuis l'achat, coût mensuel, financement, frais fixes. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { costSummary, monthCosts, addMonths, monthOf, monthDiff } from '../core/calc.js';
import { LOAN_TYPES, FIXED_CATEGORIES, isBike, makeId, fieldKey } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { renderBarChart, renderDonut } from '../ui/charts.js';
import { euro, euroRound, km, toNumber, numInput, intInput, positive, capitalize, fieldsOf } from './common.js';

/* Catégorie gérée par l'estimation automatique de l'onglet Carburant : jamais proposée
   à la main ici, et jamais listée parmi les frais fixes (voir js/views/fuel.js). */
const FUEL_FIXED_CATEGORY = 'Carburant';

const WINDOW = 12;
let offset = 0;
const CATS = [
  ['loan', 'Financement', 'var(--series-1)'],
  ['maintenance', 'Entretien', 'var(--series-2)'],
  ['fuel', 'Carburant', 'var(--series-3)'],
  ['fixed', 'Frais fixes', 'var(--series-4)']
];
const monthLabel = (m, opts) => new Date(`${m}-01T12:00:00`).toLocaleDateString('fr-FR', opts);

function renderHero(v, s) {
  $('#costHero').innerHTML = `
    <p class="cost-hero__label">Coût réel depuis l’achat</p>
    <p class="cost-hero__value">${esc(euroRound(s.realCost))}</p>
    <p class="cost-hero__note">${esc(euroRound(s.paid))} payés${s.remainingDebt ? ` + ${euroRound(s.remainingDebt)} restant dû` : ''}${s.resale ? ` − ${euroRound(s.resale)} de revente estimée` : ''}</p>
    <div class="kpis">
      <div class="kpi"><span>Par mois</span><strong>${s.monthsOwned ? esc(euroRound(s.perMonth)) : '—'}</strong></div>
      <div class="kpi"><span>Au km</span><strong>${s.perKm ? esc(`${s.perKm.toFixed(2).replace('.', ',')} €`) : '—'}</strong></div>
      <div class="kpi"><span>Usage / mois</span><strong>${s.monthsOwned ? esc(euroRound(s.usagePerMonth)) : '—'}</strong></div>
    </div>`;
}

function renderChart(v, f, s) {
  const now = monthOf(todayKey());
  const first = s.first || now;
  const maxOffset = Math.max(0, monthDiff(first, now) + 1 - WINDOW);
  offset = Math.min(offset, maxOffset);
  const end = addMonths(now, -offset);
  const groups = Array.from({ length: WINDOW }, (_, i) => {
    const m = addMonths(end, i - WINDOW + 1);
    const c = monthCosts(v, f, m, s.schedule);
    return { key: m, label: monthLabel(m, { month: 'short' }).replace('.', ''), title: capitalize(monthLabel(m, { month: 'long', year: 'numeric' })), values: c, extra: c.purchase };
  });
  const total = groups.reduce((t, g) => t + CATS.reduce((x, [k]) => x + g.values[k], 0), 0);
  $('#costRange').textContent = `${groups[0].title} → ${groups[WINDOW - 1].title} · ${euroRound(total)} hors achat`;
  $('#costOlder').disabled = offset >= maxOffset;
  $('#costNewer').disabled = offset === 0;
  const cats = isBike(v) ? CATS.filter(([k]) => k !== 'fuel') : CATS;
  renderBarChart($('#costChart'), groups, {
    bars: cats.map(([key, label, color]) => ({ key, label, color })),
    stacked: true,
    fmt: euro,
    axisFmt: n => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(n)} €`),
    highlight: now,
    extra: g => (g.extra ? `<span class="chart-tip__row">Achat / apport<b>${esc(euro(g.extra))}</b></span>` : '')
  });
}

function renderSplit(s) {
  const entries = [['purchase', s.schedule.type === 'credit' ? 'Apport' : s.schedule.type === 'none' ? 'Achat' : 'Premier loyer', 'var(--series-5)'], ...CATS]
    .map(([k, label, color]) => [label, Math.round(s.totals[k]), color])
    .filter(([, n]) => n > 0);
  $('#costSplitSub').textContent = s.first ? `Depuis ${monthLabel(s.first, { month: 'long', year: 'numeric' })}` : 'Renseignez l’achat et vos dépenses';
  renderDonut({ donut: $('#costDonut'), legend: $('#costLegend'), total: $('#costDonutTotal') }, entries, 'Aucune dépense enregistrée.', { format: euroRound });
}

function renderFinance(v, f, s) {
  const sch = s.schedule;
  const facts = [];
  if (v.purchasePrice || v.purchaseDate) facts.push(['Achat', [v.purchasePrice ? euro(v.purchasePrice) : '', v.purchaseDate ? formatKey(v.purchaseDate, { day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).join(' · ')]);
  if (v.purchaseKm) facts.push(['Km à l’achat', km(v.purchaseKm)]);
  facts.push(['Financement', LOAN_TYPES[sch.type]]);
  let progress = '';
  if (sch.type !== 'none' && sch.months) {
    const now = monthOf(todayKey());
    const first = sch.type === 'credit' ? sch.startMonth : addMonths(sch.startMonth, 1);
    const done = Math.max(0, Math.min(sch.months, monthDiff(first, now) + 1));
    if (sch.type === 'credit') facts.push(['Montant emprunté', euro(sch.principal)], ['Taux', `${String(f.loan.rate || 0).replace('.', ',')} %`]);
    else if (f.loan.firstPayment) facts.push(['Premier loyer', euro(f.loan.firstPayment)]);
    facts.push([sch.type === 'credit' ? 'Mensualité' : 'Loyer', euro(sch.monthly)], ['Échéances', `${done} / ${sch.months} · fin ${monthLabel(sch.endMonth, { month: 'short', year: 'numeric' })}`]);
    if (sch.type === 'credit' && f.loan.earlyPayoffAmount && f.loan.earlyPayoffDate) {
      facts.push(['Solde anticipé', `${euro(f.loan.earlyPayoffAmount)} · ${formatKey(f.loan.earlyPayoffDate, { day: 'numeric', month: 'short', year: 'numeric' })}`]);
    }
    if (sch.type === 'credit') facts.push(['Capital restant dû', euro(s.remainingDebt)], ['Coût du crédit (intérêts)', euro(sch.interest)]);
    if (sch.type === 'loa' && f.loan.residual) facts.push(['Option d’achat', euro(f.loan.residual)]);
    progress = `<div class="finance-progress"><div class="due__bar"><span style="--value:${Math.round((done / sch.months) * 100)}%"></span></div></div>`;
  }
  if (v.resaleValue) facts.push(['Valeur de revente estimée', euro(v.resaleValue)]);
  const empty = !v.purchasePrice && !v.purchaseDate && sch.type === 'none';
  $('#financeCard').innerHTML = empty
    ? `<div class="empty-state"><p>Indiquez le prix, la date d’achat et le financement (crédit, LOA, LLD) pour calculer le coût réel.</p><button type="button" class="btn btn--soft btn--sm" data-open="purchase">Renseigner l’achat</button></div>`
    : `<dl class="facts">${facts.map(([k, val]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>${progress}`;
}

function renderFixed(f) {
  const list = f.fixed.filter(x => !(x.category === FUEL_FIXED_CATEGORY && x.auto));
  $('#fixedList').innerHTML = list.length
    ? list
        .map(x => {
          const sub = [x.period === 'year' ? `${euro(x.amount)} / an` : 'Mensuel', `depuis ${formatKey(x.start, { month: 'short', year: 'numeric' })}`, x.end ? `jusqu’à ${formatKey(x.end, { month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ');
          return `<div class="row" data-edit data-fixed="${esc(x.id)}"><span class="row__icon">${icon('repeat', 18)}</span>
            <div class="row__body"><span class="row__title">${esc(x.category)}${x.label ? ` <span class="row__soft">· ${esc(x.label)}</span>` : ''}</span><span class="row__sub">${esc(sub)}</span></div>
            <div class="row__amount">${esc(euro(x.period === 'year' ? x.amount / 12 : x.amount))}<small>/ mois</small></div></div>`;
        })
        .join('')
    : '<div class="empty-state"><p>Aucun frais fixe. Ajoutez par exemple votre assurance.</p></div>';
}

export function renderCosts(v, f) {
  const s = costSummary(v, f);
  renderHero(v, s);
  renderChart(v, f, s);
  renderSplit(s);
  renderFinance(v, f, s);
  renderFixed(f);
}

/* ---------- Achat & financement ---------- */
function syncLoan() {
  const form = $('#purchaseForm');
  const type = form.elements.type.value;
  const show = { credit: type === 'credit', lease: type === 'loa' || type === 'lld', any: type !== 'none', loa: type === 'loa' };
  $$('#purchaseForm [data-loan]').forEach(el => (el.hidden = !show[el.dataset.loan]));
  const lease = type === 'loa' || type === 'lld';
  $('#loMonthsLabel').textContent = lease ? 'Nombre de loyers' : 'Durée (mois)';
  $('#loMonthlyLabel').textContent = lease ? 'Loyer mensuel · €' : 'Mensualité · €';
  form.elements.monthly.placeholder = lease ? '0,00' : 'Calculée si vide';
  $('#loStartLabel').textContent = lease ? 'Début du contrat' : 'Première échéance';
}

export function openPurchase() {
  const v = store.active();
  const loan = store.field('loan', v.id);
  const form = $('#purchaseForm');
  form.reset();
  clearErrors(form);
  const set = (name, value) => (form.elements[name].value = value);
  set('purchaseDate', v.purchaseDate);
  set('purchaseKm', intInput(v.purchaseKm));
  set('purchasePrice', numInput(v.purchasePrice));
  set('resaleValue', numInput(v.resaleValue));
  set('type', loan.type);
  set('principal', numInput(loan.principal));
  set('rate', numInput(loan.rate));
  set('months', intInput(loan.months));
  set('monthly', numInput(loan.monthly));
  set('start', loan.start);
  set('firstPayment', numInput(loan.firstPayment));
  set('residual', numInput(loan.residual));
  set('earlyPayoffAmount', numInput(loan.earlyPayoffAmount));
  set('earlyPayoffDate', loan.earlyPayoffDate || '');
  syncLoan();
  openSheet('purchaseSheet', { focus: false });
}

const money = label => [positive(label, { max: 10000000 })];
const purchaseSchema = {
  purchaseDate: [rules.date(), v => (v && v > todayKey() ? 'La date d’achat est dans le futur.' : null)],
  purchaseKm: [positive('Le kilométrage', { integer: true, max: 3000000 })],
  purchasePrice: money('Le prix'),
  resaleValue: money('La valeur'),
  principal: [...money('Le montant'), (v, all) => (all.type === 'credit' && !toNumber(v) ? 'Indiquez le montant emprunté.' : null), (v, all) => (all.type === 'credit' && toNumber(all.purchasePrice) && toNumber(v) > toNumber(all.purchasePrice) ? 'Supérieur au prix d’achat.' : null)],
  rate: [positive('Le taux', { max: 30 })],
  months: [positive('La durée', { integer: true, max: 120 }), (v, all) => (all.type !== 'none' && !toNumber(v) ? 'Indiquez la durée.' : null)],
  monthly: [...money('La mensualité'), (v, all) => ((all.type === 'loa' || all.type === 'lld') && !toNumber(v) ? 'Indiquez le loyer.' : null)],
  start: [rules.date(), (v, all) => (all.type !== 'none' && !v && !all.purchaseDate ? 'Indiquez la date de début.' : null)],
  firstPayment: money('Le montant'),
  residual: money('Le montant'),
  earlyPayoffAmount: money('Le montant'),
  earlyPayoffDate: [rules.date(), (v, all) => (v && all.purchaseDate && v < all.purchaseDate ? 'Précède la date d’achat.' : null)]
};

function onPurchaseSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, purchaseSchema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const n = k => toNumber(val[k]) || 0;
  const loan =
    val.type === 'none'
      ? { type: 'none' }
      : { type: val.type, principal: n('principal'), rate: n('rate'), months: n('months'), monthly: n('monthly'), start: val.start || val.purchaseDate, firstPayment: n('firstPayment'), residual: n('residual'), earlyPayoffAmount: n('earlyPayoffAmount'), earlyPayoffDate: val.type === 'credit' ? val.earlyPayoffDate || '' : '' };
  store.setKeys({
    vehicles: store.vehicles().map(x => (x.id === v.id ? { ...x, purchaseDate: val.purchaseDate, purchaseKm: n('purchaseKm'), purchasePrice: n('purchasePrice'), resaleValue: n('resaleValue') } : x)),
    [fieldKey(v.id, 'loan')]: loan
  });
  closeSheet('purchaseSheet');
  toast('Achat et financement enregistrés');
}

/* ---------- Frais fixes ---------- */
export function openFixed(id = null) {
  const v = store.active();
  const x = id ? store.field('fixed', v.id).find(e => e.id === id) : null;
  const form = $('#fixedForm');
  form.reset();
  clearErrors(form);
  form.elements.editId.value = x ? x.id : '';
  form.elements.category.value = x?.category || FIXED_CATEGORIES[0];
  form.elements.label.value = x?.label || '';
  form.elements.amount.value = x ? numInput(x.amount) : '';
  form.elements.period.value = x?.period || 'month';
  form.elements.start.value = x?.start || v.purchaseDate || todayKey();
  form.elements.end.value = x?.end || '';
  $('#fixedTitle').textContent = x ? 'Modifier le frais fixe' : 'Nouveau frais fixe';
  $('#fixedDelete').hidden = !x;
  openSheet('fixedSheet', { focus: false });
}

const fixedSchema = {
  label: [rules.maxLength(80)],
  amount: [positive('Le montant', { required: true, max: 1000000 }), v => (toNumber(v) === 0 ? 'Le montant doit être supérieur à 0.' : null)],
  start: [rules.date({ required: true })],
  end: [rules.date(), (v, all) => (v && all.start && v < all.start ? 'La fin précède le début.' : null)]
};

function onFixedSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, fixedSchema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const list = store.field('fixed', v.id);
  const existing = val.editId ? list.find(x => x.id === val.editId) : null;
  // L'amount modifié à la main sort l'entrée du suivi automatique carburant (sinon la prochaine
  // mise à jour de l'estimation l'écraserait sans que ce choix manuel soit visible).
  const item = { id: val.editId || makeId(), category: val.category, label: val.label, amount: toNumber(val.amount), period: val.period, start: val.start, end: val.end };
  store.setField('fixed', val.editId ? list.map(x => (x.id === val.editId ? item : x)) : [...list, item], v.id);
  closeSheet('fixedSheet');
  toast(val.editId ? (existing?.auto ? 'Frais modifié · détaché de l’estimation carburant automatique' : 'Frais modifié') : 'Frais ajouté');
}

async function removeFixed() {
  const v = store.active();
  const id = $('#fixedForm').elements.editId.value;
  const list = store.field('fixed', v.id);
  const x = list.find(e => e.id === id);
  if (!x || !(await confirmDialog({ title: 'Supprimer ce frais ?', message: `${x.category}${x.label ? ` · ${x.label}` : ''}`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('fixed', list.filter(e => e !== x), v.id);
  closeSheet('fixedSheet');
  toast('Frais supprimé');
}

export function initCosts() {
  $('#loType').innerHTML = Object.entries(LOAN_TYPES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  // « Carburant » est géré automatiquement depuis l'onglet Carburant (estimation mensuelle) : pas proposable ici.
  $('#fiCategory').innerHTML = FIXED_CATEGORIES.filter(c => c !== FUEL_FIXED_CATEGORY).map(c => `<option>${esc(c)}</option>`).join('');
  $('#loType').addEventListener('change', syncLoan);
  $('#purchaseForm').addEventListener('submit', onPurchaseSubmit);
  $('#fixedForm').addEventListener('submit', onFixedSubmit);
  $('#fixedDelete').addEventListener('click', removeFixed);
  $('#fixedList').addEventListener('click', e => {
    const r = e.target.closest('[data-fixed]');
    if (r) openFixed(r.dataset.fixed);
  });
  $('#costOlder').addEventListener('click', () => {
    offset++;
    const v = store.active();
    renderCosts(v, fieldsOf(v.id));
  });
  $('#costNewer').addEventListener('click', () => {
    offset = Math.max(0, offset - 1);
    const v = store.active();
    renderCosts(v, fieldsOf(v.id));
  });
}

export const resetCostWindow = () => (offset = 0);
