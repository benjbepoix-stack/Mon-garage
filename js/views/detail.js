/* Fiche d'un véhicule (onglet Garage) : photo, compteur et route, onglets, aperçu. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts } from '../core/calc.js';
import { isBike, isElectric } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, kmOf, km, photoFrame, intInput, toNumber, positive, identity } from './common.js';
import { tile, badge } from './alert-ui.js';
import { heroRoadHtml, mountRoad } from './road.js';
import { renderMaintenance } from './maintenance.js';
import { renderFuel } from './fuel.js';
import { renderParts } from './parts.js';
import { renderDocs } from './docs.js';
import { openResaleDossier } from '../features/resale-dossier.js';

let tab = 'overview';

/** Onglets de la fiche (les coûts ont leur propre écran dans la barre du bas). */
export function tabsFor(v) {
  return isBike(v)
    ? [['overview', 'Fiche'], ['maintenance', 'Entretiens'], ['parts', 'Usure'], ['docs', 'Docs']]
    : [['overview', 'Fiche'], ['maintenance', 'Entretiens'], ['fuel', isElectric(v) ? 'Recharge' : 'Carburant'], ['docs', 'Docs']];
}

export const currentTab = () => tab;
export function setTab(name, v = store.active()) {
  tab = v && tabsFor(v).some(([k]) => k === name) ? name : 'overview';
}

const ALERT_TAB = { reminder: 'maintenance', doc: 'docs', part: 'parts' };

function renderHero(v, f) {
  const sub = identity(v, isBike(v) ? [v.bikeType] : []);
  const current = kmOf(v, f);
  const hero = $('#vehicleHero');
  hero.innerHTML = `
    <div class="vhero__top">
      <div class="vhero__body">
        <h2 class="vhero__name">${esc(v.name)}</h2>
        ${sub || v.archived ? `<p class="vhero__sub">${sub}${v.archived ? ` <span class="badge is-late">Archivé · ${esc(v.archivedReason)}</span>` : ''}</p>` : ''}
      </div>
      ${photoFrame(v, 'vhero__photo')}
    </div>
    ${heroRoadHtml(v, f, current)}`;
  mountRoad(hero, v, f, current, value => {
    store.updateVehicle(v.id, { mileage: value });
    toast(`Compteur : ${km(value)}`);
  });
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
  const reminders = list.filter(a => a.kind === 'reminder' || a.kind === 'part' || a.kind === 'doc');
  const cardOf = a => `<article class="cc acard is-${a.level}" data-goto="${ALERT_TAB[a.kind]}"${a.kind === 'reminder' ? ` data-reminder-id="${esc(a.id)}"` : ''}>
      <div class="acard__top">${tile(a.title, a.kind, a.level)}${badge(a.level)}</div>
      <h3 class="cc__t">${esc(a.title)}</h3><p class="cc__big">${esc(a.text)}</p>
      ${a.kind === 'reminder' ? `<button type="button" class="acard__done" data-done aria-label="${esc(a.title)} : c’est fait">${icon('check', 16)}<span>Fait</span></button>` : ''}
    </article>`;
  $('#panel-overview').innerHTML = `
    <section class="section">
      <header class="section__head"><h2 class="section__title">Rappels</h2>${reminders.length ? `<span class="section__count">${reminders.length}</span>` : ''}</header>
      ${reminders.length
        ? `<div class="crail">${reminders.map(cardOf).join('')}</div>`
        : `<p class="calm">Aucune échéance suivie. Ajoutez des rappels d’entretien${isBike(v) ? ', des composants' : ''} ou des documents avec leur date.</p>`}
    </section>
    <section class="section card note-card">
      <header class="card__head"><h2 class="card__title">${icon('note', 18)}<span>Note</span></h2><button type="button" class="link-btn" data-edit-note>${v.notes ? 'Modifier' : 'Ajouter'}</button></header>
      ${v.notes ? `<p class="notes-text">${esc(v.notes)}</p>` : '<p class="card__sub">Un mot sur ce véhicule : pression des pneus, code radio, garage habituel…</p>'}
    </section>
    <section class="section">
      <button type="button" class="btn btn--soft btn--block" data-action="resale-dossier">${icon('doc', 18)}<span>Exporter le dossier de revente</span></button>
    </section>`;
}

const PANELS = { maintenance: renderMaintenance, fuel: renderFuel, parts: renderParts, docs: renderDocs };

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

export function initDetail({ onTab, onReminderDone, onEditNote }) {
  $('#vehicleTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) onTab(b.dataset.tab);
  });
  $('#panel-overview').addEventListener('click', e => {
    const row = e.target.closest('[data-goto]');
    if (row && e.target.closest('[data-done]')) return onReminderDone(row.dataset.reminderId);
    if (row) return onTab(row.dataset.goto);
    if (e.target.closest('[data-edit-note]')) return onEditNote();
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
