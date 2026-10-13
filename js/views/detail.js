/* Fiche d'un véhicule : en-tête, onglets, mise à jour du compteur, aperçu. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts, costSummary } from '../core/calc.js';
import { isBike, isElectric } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, kmOf, km, euroRound, photoFrame, lineWidth, intInput, toNumber, positive, identity, kmLine } from './common.js';
import { renderMaintenance } from './maintenance.js';
import { renderFuel } from './fuel.js';
import { renderParts } from './parts.js';
import { renderCosts } from './costs.js';
import { renderDocs } from './docs.js';
import { openResaleDossier } from '../features/resale-dossier.js';

let tab = 'overview';

/** Onglets de la fiche : libellés courts, les 5 tiennent sur un écran de 375 px sans défilement. */
export function tabsFor(v) {
  return isBike(v)
    ? [['overview', 'Aperçu'], ['parts', 'Usure'], ['maintenance', 'Entretien'], ['costs', 'Coûts'], ['docs', 'Docs']]
    : [['overview', 'Aperçu'], ['maintenance', 'Entretien'], ['fuel', isElectric(v) ? 'Recharge' : 'Carburant'], ['costs', 'Coûts'], ['docs', 'Docs']];
}

export const currentTab = () => tab;
export function setTab(name, v = store.active()) {
  tab = v && tabsFor(v).some(([k]) => k === name) ? name : 'overview';
}

const ALERT_TAB = { reminder: 'maintenance', doc: 'docs', part: 'parts' };

function renderHero(v, f) {
  const sub = identity(v, isBike(v) ? [v.bikeType] : []);
  $('#vehicleHero').innerHTML = `
    <div class="vhero__body">
      ${sub || v.archived ? `<p class="vhero__sub">${sub}${v.archived ? ` <span class="level is-late">Archivé · ${esc(v.archivedReason)}</span>` : ''}</p>` : ''}
      ${kmLine(kmOf(v, f), 'vhero__km', 'data-open="km"')}
    </div>
    ${photoFrame(v, 'vhero__photo')}`;
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
  const summary = costSummary(v, f);
  const kpis = [
    ['Coût / mois', summary.monthsOwned ? euroRound(summary.perMonth) : '—'],
    ['Coût au km', summary.perKm ? `${summary.perKm.toFixed(2).replace('.', ',')} €` : '—']
  ];
  const urgent = list.filter(a => a.level === 'late' || a.level === 'soon');
  const next = list.filter(a => !urgent.includes(a)).slice(0, 4);
  const item = a => `<li class="is-${a.level}" data-goto="${ALERT_TAB[a.kind]}"><span class="clist__t">${esc(a.title)}</span><small>${esc(a.text)}</small></li>`;
  $('#panel-overview').innerHTML = `
    <section class="section">
      <header class="section__head"><h2 class="section__title">À régler</h2>${urgent.length ? `<span class="section__count">${urgent.length}</span>` : ''}</header>
      ${urgent.length
        ? `<div class="crail">${urgent.map(a => `<article class="cc is-${a.level}" data-goto="${ALERT_TAB[a.kind]}">
            <h3 class="cc__t">${esc(a.title)}</h3><p class="cc__big">${esc(a.text)}</p><span class="tick" style="--v:${lineWidth(a)}%"></span></article>`).join('')}</div>`
        : `<p class="calm">${list.length ? 'Rien à régler dans les 30 prochains jours.' : `Aucune échéance suivie. Ajoutez des rappels d’entretien${isBike(v) ? ', des composants' : ''} ou des documents avec leur date.`}</p>`}
    </section>
    <section class="section">
      <header class="section__head"><h2 class="section__title">${isBike(v) ? 'Ce vélo' : 'Ce véhicule'}</h2></header>
      <div class="kpis kpis--2">${kpis.map(([l, val]) => `<div class="kpi"><span>${l}</span><strong>${esc(val)}</strong></div>`).join('')}</div>
    </section>
    ${next.length ? `<section class="section">
      <header class="section__head"><h2 class="section__title">Ensuite</h2></header>
      <ul class="clist">${next.map(item).join('')}</ul>
    </section>` : ''}
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
