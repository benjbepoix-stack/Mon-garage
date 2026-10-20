/* Page Entretien d'un véhicule : compteur et route, à régler, plan d'entretien, historique, documents, note. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, kmOf, km, photoFrame, intInput, toNumber, positive, identity } from './common.js';
import { row, attachSwipe, nudgeOnce } from './todo.js';
import { heroRoadHtml, mountRoad } from './road.js';
import { renderMaintenance } from './maintenance.js';
import { renderParts } from './parts.js';
import { renderDocs } from './docs.js';
import { openResaleDossier } from '../features/resale-dossier.js';

const SECTION = { maintenance: 'panel-maintenance', parts: 'panel-parts', docs: 'panel-docs', history: 'historySection' };

/** Fait défiler la page jusqu'à une rubrique (maintenance, parts, docs, history). */
export function scrollToSection(key) {
  const el = document.getElementById(SECTION[key] || key);
  if (el && !el.hidden) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 76), behavior: 'smooth' });
}

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

function renderTodo(v, list) {
  // Un document et un rappel du même nom (contrôle technique) : une seule ligne, celle qui se glisse.
  const seen = new Set();
  const todo = list
    .filter(a => a.level === 'late' || a.level === 'soon')
    .sort((a, b) => (a.kind === 'reminder' ? 0 : 1) - (b.kind === 'reminder' ? 0 : 1))
    .filter(a => {
      const key = a.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.level === b.level ? a.score - b.score : a.level === 'late' ? -1 : 1));
  $('#todoSection').hidden = !todo.length;
  $('#todoCount').textContent = todo.length || '';
  $('#todoList').innerHTML = todo.map(a => row(v, a, true)).join('');
  $('#todoHint').hidden = !todo.some(a => a.kind === 'reminder');
  nudgeOnce();
}

function renderNote(v) {
  $('#panel-overview').innerHTML = `
    <section class="section card note-card">
      <header class="card__head"><h2 class="card__title">${icon('note', 18)}<span>Note</span></h2><button type="button" class="link-btn" data-edit-note>${v.notes ? 'Modifier' : 'Ajouter'}</button></header>
      ${v.notes ? `<p class="notes-text">${esc(v.notes)}</p>` : '<p class="card__sub">Un mot sur ce véhicule : pression des pneus, code radio, garage habituel…</p>'}
    </section>
    <section class="section">
      <button type="button" class="btn btn--soft btn--block" data-action="resale-dossier">${icon('doc', 18)}<span>Exporter le dossier de revente</span></button>
    </section>`;
}

export function renderDetail() {
  const v = store.active();
  if (!v) return;
  const f = fieldsOf(v.id);
  const list = alerts(v, f);
  renderHero(v, f);
  renderTodo(v, list);
  renderMaintenance(v, f);
  $('#panel-parts').hidden = !isBike(v);
  if (isBike(v)) renderParts(v, f);
  renderDocs(v, f);
  renderNote(v);
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

export function initDetail({ onReminderDone, onEditNote }) {
  attachSwipe($('#todoList'), onReminderDone);
  $('#todoList').addEventListener('click', e => {
    const b = e.target.closest('button[data-goto]');
    if (b) scrollToSection(b.dataset.goto);
  });
  $('#panel-overview').addEventListener('click', e => {
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
