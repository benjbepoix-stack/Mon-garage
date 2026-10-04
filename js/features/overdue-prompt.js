/*
 * Pop-up au démarrage : rappels d'entretien en retard, tous véhicules confondus.
 * Un seul passage par session ; défilement par « Suivant » puis « Terminé »
 * quand plusieurs rappels sont en retard.
 */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts } from '../core/calc.js';
import { fieldsOf } from '../views/common.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';

let items = [];
let index = 0;
let onView = null;
let checked = false;

function collectOverdue() {
  const out = [];
  store.vehicles().forEach(v => {
    const f = fieldsOf(v.id);
    alerts(v, f)
      .filter(a => a.kind === 'reminder' && a.level === 'late')
      .forEach(a => out.push({ vehicleId: v.id, vehicleName: v.name, reminderId: a.id, title: a.title, text: a.text }));
  });
  return out;
}

function render() {
  const n = items.length;
  const item = items[index];
  const last = index === n - 1;
  $('#overdueContent').innerHTML = `
    <div class="dialog__icon dialog__icon--danger">${icon('wrench', 22)}</div>
    <h2 class="dialog__title" id="overdueTitle">Entretien en retard</h2>
    ${n > 1 ? `<p class="dialog__message">Rappel ${index + 1} sur ${n}</p>` : ''}
    <div class="cal-card">
      <div class="cal-card__title">${esc(item.vehicleName)}</div>
      <div class="cal-card__row">${icon('wrench', 16)}<span>${esc(item.title)}</span></div>
      <div class="cal-card__row">${icon('clock', 16)}<span>${esc(item.text)}</span></div>
    </div>
    <div class="dialog__actions dialog__actions--stack">
      <button type="button" class="btn btn--soft" data-overdue="view">${icon('chevronRight', 18)}<span>Voir ce rappel</span></button>
      <button type="button" class="btn btn--primary" data-overdue="${last ? 'done' : 'next'}">${last ? 'Terminé' : 'Suivant'}</button>
    </div>`;
}

/** À appeler une fois l'application prête (données chargées, écran de connexion masqué). */
export function checkOverdue() {
  if (checked) return;
  checked = true;
  items = collectOverdue();
  if (!items.length) return;
  index = 0;
  render();
  openSheet('overdueSheet', { focus: false });
}

export function initOverduePrompt({ onView: handler } = {}) {
  onView = handler || null;
  $('#overdueContent').addEventListener('click', e => {
    const btn = e.target.closest('[data-overdue]');
    if (!btn) return;
    const action = btn.dataset.overdue;
    if (action === 'next') {
      index = Math.min(index + 1, items.length - 1);
      render();
    } else if (action === 'done') {
      closeSheet('overdueSheet');
    } else if (action === 'view') {
      const item = items[index];
      closeSheet('overdueSheet');
      onView?.(item.vehicleId, item.reminderId);
    }
  });
}
