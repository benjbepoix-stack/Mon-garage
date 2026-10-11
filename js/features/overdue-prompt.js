/*
 * Pop-up au démarrage : rappels d'entretien en retard, tous véhicules confondus,
 * en une seule liste (un appui sur une ligne ouvre l'enregistrement de l'entretien,
 * un bouton pour fermer). Un seul passage par session.
 */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts } from '../core/calc.js';
import { fieldsOf } from '../views/common.js';
import { openSheet, closeSheet } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';

let items = [];
let onView = null;
let checked = false;

function collectOverdue() {
  const out = [];
  store.vehicles().filter(v => !v.archived).forEach(v => {
    const f = fieldsOf(v.id);
    alerts(v, f)
      .filter(a => a.kind === 'reminder' && a.level === 'late')
      .forEach(a => out.push({ vehicleId: v.id, vehicleName: v.name, reminderId: a.id, title: a.title, text: a.text }));
  });
  return out;
}

function render() {
  const n = items.length;
  $('#overdueContent').innerHTML = `
    <div class="dialog__icon dialog__icon--danger">${icon('wrench', 22)}</div>
    <h2 class="dialog__title" id="overdueTitle">${n > 1 ? `${n} entretiens en retard` : 'Entretien en retard'}</h2>
    <div class="ov-list">${items
      .map(
        (x, i) => `<button type="button" class="ov-row" data-overdue="${i}">
          <span class="ov-row__icon">${icon('wrench', 16)}</span>
          <span class="ov-row__body"><strong>${esc(x.vehicleName)} · ${esc(x.title)}</strong><span>${esc(x.text.charAt(0).toUpperCase() + x.text.slice(1))}</span></span>
          ${icon('chevronRight', 16)}
        </button>`
      )
      .join('')}</div>
    <p class="dialog__message">Touchez un entretien une fois fait pour l’enregistrer.</p>
    <div class="dialog__actions dialog__actions--stack"><button type="button" class="btn btn--primary" data-close>Fermer</button></div>`;
}

/** À appeler une fois l'application prête (données chargées, écran de connexion masqué). */
export function checkOverdue() {
  if (checked) return;
  checked = true;
  items = collectOverdue();
  if (!items.length) return;
  render();
  openSheet('overdueSheet', { focus: false });
}

export function initOverduePrompt({ onView: handler } = {}) {
  onView = handler || null;
  $('#overdueContent').addEventListener('click', e => {
    const item = items[Number(e.target.closest('[data-overdue]')?.dataset.overdue)];
    if (!item) return;
    closeSheet('overdueSheet');
    onView?.(item.vehicleId, item.reminderId);
  });
}
