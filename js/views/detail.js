/* Fiche d'un véhicule : en-tête, onglets, mise à jour du compteur, aperçu. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts, costSummary, monthCosts, monthOf, COST_KEYS } from '../core/calc.js';
import { todayKey, formatKey } from '../core/dates.js';
import { isBike, isElectric } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, kmOf, km, euro, euroRound, photoHtml, intInput, toNumber, positive, capitalize } from './common.js';
import { renderMaintenance } from './maintenance.js';
import { renderFuel } from './fuel.js';
import { renderParts } from './parts.js';
import { renderCosts } from './costs.js';
import { renderDocs } from './docs.js';
import { openResaleDossier } from '../features/resale-dossier.js';

let tab = 'overview';

export function tabsFor(v) {
  return isBike(v)
    ? [['overview', 'Aperçu'], ['parts', 'Usure'], ['maintenance', 'Entretiens'], ['costs', 'Coûts'], ['docs', 'Documents']]
    : [['overview', 'Aperçu'], ['maintenance', 'Entretiens'], ['fuel', isElectric(v) ? 'Recharge' : 'Carburant'], ['costs', 'Coûts'], ['docs', 'Documents']];
}

export const currentTab = () => tab;
export function setTab(name, v = store.active()) {
  tab = v && tabsFor(v).some(([k]) => k === name) ? name : 'overview';
}

const ALERT_TAB = { reminder: 'maintenance', doc: 'docs', part: 'parts' };
const ALERT_ICON = { reminder: 'wrench', doc: 'doc', part: 'gear' };

function renderHero(v, f) {
  const sub = isBike(v) ? [v.brand, v.model, v.bikeType] : [v.brand, v.model, v.year, v.plate];
  $('#vehicleHero').innerHTML = `
    <div class="vhero__photo">${photoHtml(v, 34)}</div>
    <div class="vhero__body">
      <p class="vhero__sub">${esc(sub.filter(Boolean).join(' · ') || (isBike(v) ? 'Vélo' : 'Véhicule'))}${v.archived ? ` <span class="level is-late">Archivé · ${esc(v.archivedReason)}</span>` : ''}</p>
      <button type="button" class="vhero__km" data-open="km" aria-label="Mettre à jour le compteur">${icon('gauge', 17)}<span>${esc(km(kmOf(v, f)))}</span><small>Mettre à jour</small></button>
    </div>`;
}

function renderTabs(v, list) {
  const levelOf = key => {
    const l = list.filter(a => ALERT_TAB[a.kind] === key).map(a => a.level);
    return l.includes('late') ? 'late' : l.includes('soon') ? 'soon' : '';
  };
  $('#vehicleTabs').innerHTML = tabsFor(v)
    .map(([k, label]) => {
      const lvl = levelOf(k);
      return `<button type="button" class="vtab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${label}${lvl ? `<span class="dot ${lvl === 'soon' ? 'is-soon' : ''}" aria-label="${lvl === 'late' ? 'en retard' : 'bientôt'}"></span>` : ''}</button>`;
    })
    .join('');
}

function renderOverview(v, f, list) {
  const month = monthOf(todayKey());
  const costs = monthCosts(v, f, month);
  const thisMonth = COST_KEYS.reduce((s, k) => s + costs[k], 0);
  const summary = costSummary(v, f);
  const last = f.maintenance[0];
  const kpis = [
    ['Ce mois-ci', euro(thisMonth), capitalize(formatKey(`${month}-01`, { month: 'long' }))],
    ['Coût réel / mois', summary.monthsOwned ? euroRound(summary.perMonth) : '—', summary.monthsOwned ? `sur ${summary.monthsOwned} mois` : 'Renseignez l’achat'],
    ['Coût au km', summary.perKm ? `${summary.perKm.toFixed(2).replace('.', ',')} €` : '—', summary.km ? `${km(summary.km)} parcourus` : ''],
    ['Dernier entretien', last ? capitalize(formatKey(last.date, { day: 'numeric', month: 'short', year: 'numeric' })) : '—', last ? last.type : 'Aucun']
  ];
  const shown = list.slice(0, 6);
  $('#panel-overview').innerHTML = `
    <div class="kpis">${kpis.map(([l, val, s]) => `<div class="kpi"><span>${l}</span><strong>${esc(val)}</strong>${s ? `<small>${esc(s)}</small>` : ''}</div>`).join('')}</div>
    <section class="section">
      <header class="section__head"><h2 class="section__title">Prochaines échéances</h2></header>
      <div class="card card--list alert-list">${
        shown.length
          ? shown
              .map(
                a => `<div class="row" data-edit data-goto="${ALERT_TAB[a.kind]}"><span class="row__icon is-${a.level}">${icon(ALERT_ICON[a.kind], 18)}</span>
                  <div class="row__body"><span class="row__title">${esc(a.title)}</span><span class="row__sub">${esc(a.text)}</span></div>${icon('chevronRight', 16)}</div>`
              )
              .join('')
          : `<div class="empty-state"><p>Aucune échéance suivie. Ajoutez des rappels d’entretien${isBike(v) ? ', des composants' : ''} ou des documents avec leur date.</p></div>`
      }</div>
    </section>
    ${v.notes ? `<section class="section card"><h2 class="card__title">Notes</h2><p class="notes-text">${esc(v.notes)}</p></section>` : ''}
    <section class="section">
      <button type="button" class="btn btn--soft btn--block" data-action="resale-dossier">${icon('doc', 18)}<span>Exporter le dossier de revente</span></button>
    </section>`;
}

const PANELS = { maintenance: renderMaintenance, fuel: renderFuel, parts: renderParts, costs: renderCosts, docs: renderDocs };

export function renderDetail() {
  const v = store.active();
  if (!v) return;
  setTab(tab, v);
  const f = fieldsOf(v.id);
  const list = alerts(v, f);
  renderHero(v, f);
  renderTabs(v, list);
  $$('#detailView [data-panel]').forEach(p => (p.hidden = p.dataset.panel !== tab));
  if (tab === 'overview') renderOverview(v, f, list);
  else PANELS[tab](v, f);
}

/* ---------- Compteur ---------- */
function openKm() {
  const v = store.active();
  if (!v) return;
  const f = $('#kmForm');
  f.reset();
  clearErrors(f);
  const current = kmOf(v);
  f.elements.km.value = intInput(current);
  $('#kmHelp').textContent = current ? `Dernier relevé : ${km(current)}` : '';
  openSheet('kmSheet');
}

export function initDetail({ onTab }) {
  $('#vehicleTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) onTab(b.dataset.tab);
  });
  $('#panel-overview').addEventListener('click', e => {
    const row = e.target.closest('[data-goto]');
    if (row) return onTab(row.dataset.goto);
    if (e.target.closest('[data-action="resale-dossier"]')) {
      const v = store.active();
      if (v) openResaleDossier(v, fieldsOf(v.id));
    }
  });
  $('#kmForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const v = store.active();
    const { valid, errors } = validate(formValues(f), { km: [rules.required('Le kilométrage'), positive('Le kilométrage', { integer: true, max: 3000000 })] });
    if (!valid) return showErrors(f, errors);
    const value = toNumber(f.elements.km.value);
    const current = kmOf(v);
    if (value < current) return showErrors(f, { km: `Le compteur ne peut pas reculer (dernier relevé : ${km(current)}).` });
    store.updateVehicle(v.id, { mileage: value });
    closeSheet('kmSheet');
    toast(`Compteur : ${km(value)}`);
  });
}

export { openKm };
