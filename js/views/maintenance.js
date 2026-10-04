/* Entretiens : plan d'entretien (rappels date / km) et historique. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { reminderStatus, currentKm, daysUntil } from '../core/calc.js';
import { MAINTENANCE_TYPES, presetReminders, makeId, fieldKey, isBike } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { km, euro, toNumber, numInput, intInput, positive, LEVEL_LABEL, fieldsOf } from './common.js';
import { readJSON, write } from '../services/storage.js';
import { pushReminderToCarnet } from '../services/carnet-sync.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });

/* Rappels déjà envoyés vers Carnet, pour ne pas les renvoyer en double tant
 * que leur échéance n'a pas changé : clé = `${reminderId}@${échéance}`. */
const SENT_KEY = 'garage_reminders_sent';
let sent = new Set(readJSON(SENT_KEY, []));
const saveSent = () => write(SENT_KEY, JSON.stringify([...sent]));
const sentKey = (id, s) => `${id}@${s.nextDate || s.nextKm || 'na'}`;

function reminderCard(r, current) {
  const s = reminderStatus(r, current);
  const byKm = r.everyKm && r.lastKm ? (current - r.lastKm) / r.everyKm : 0;
  const byDate = r.everyMonths && r.lastDate ? -daysUntil(r.lastDate) / (r.everyMonths * 30.44) : 0;
  const ratio = Math.max(0, Math.min(1, Math.max(byKm, byDate)));
  // Un seul « tous les » devant les deux critères (pas de répétition) pour rester court sur une ligne.
  const everyParts = [r.everyKm ? km(r.everyKm) : '', r.everyMonths ? `${r.everyMonths} mois` : ''].filter(Boolean);
  const every = everyParts.length ? `Tous les ${everyParts.join(' ou ')}` : '';
  const next = [s.nextKm ? km(s.nextKm) : '', s.nextDate ? fmtDate(s.nextDate) : ''].filter(Boolean).join(' ou ');
  const last = r.lastDate || r.lastKm ? `Dernier : ${[r.lastDate ? fmtDate(r.lastDate) : '', r.lastKm ? km(r.lastKm) : ''].filter(Boolean).join(' · ')}` : 'Dernière fois inconnue : touchez pour la renseigner';
  const canSend = s.level === 'late' || s.level === 'soon';
  const isSent = canSend && sent.has(sentKey(r.id, s));
  return `<article class="due card is-${s.level}" data-reminder="${esc(r.id)}">
    <div class="due__head">
      <span class="row__icon">${icon('wrench', 18)}</span>
      <button type="button" class="due__body" data-reminder-edit aria-label="Modifier le rappel ${esc(r.label)}"><span class="due__title">${esc(r.label)}</span><span class="due__sub">${esc(every)}</span></button>
      <span class="level is-${s.level}">${LEVEL_LABEL[s.level]}</span>
    </div>
    ${s.level !== 'unknown' ? `<div class="due__bar"><span style="--value:${Math.round(ratio * 100)}%"></span></div>` : ''}
    <div class="due__foot"><span>${next ? `Prochain : ${esc(next)}` : esc(last)}</span>
      <div class="due__actions">
        ${canSend ? `<button type="button" class="icon-btn icon-btn--sm" data-reminder-send ${isSent ? 'disabled' : ''} aria-label="${isSent ? 'Déjà envoyée à Carnet' : 'Envoyer à Carnet'}" title="${isSent ? 'Envoyée ✓' : 'Carnet'}">${icon(isSent ? 'check' : 'upload', 16)}</button>` : ''}
        <button type="button" class="icon-btn icon-btn--sm" data-reminder-done aria-label="Marquer comme fait" title="Fait">${icon('check', 16)}</button>
      </div>
    </div>
    ${next ? `<p class="due__sub">${esc(last)}</p>` : ''}
  </article>`;
}

function maintenanceRow(x) {
  const sub = [fmtDate(x.date), x.km ? km(x.km) : '', x.garage].filter(Boolean).join(' · ');
  return `<div class="row" data-edit data-maintenance="${esc(x.id)}">
    <span class="row__icon">${icon('wrench', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(x.type)}${x.label ? ` <span class="row__soft">· ${esc(x.label)}</span>` : ''}</span><span class="row__sub">${esc(sub)}</span></div>
    <div class="row__amount">${x.cost ? esc(euro(x.cost)) : '—'}</div>
  </div>`;
}

export function renderMaintenance(v, f) {
  const current = currentKm(v, f);
  $('#reminderList').innerHTML = f.reminders.length
    ? f.reminders.map(r => reminderCard(r, current)).join('')
    : `<div class="empty-card">Aucun rappel. Ajoutez par exemple ${isBike(v) ? 'la révision tous les 3 000 km ou 6 mois' : 'la vidange tous les 15 000 km ou 1 an'}.</div>`;
  const total = f.maintenance.reduce((s, x) => s + x.cost, 0);
  $('#maintenanceSub').textContent = f.maintenance.length ? `${f.maintenance.length} entretien${f.maintenance.length > 1 ? 's' : ''} · ${euro(total)}` : '';
  $('#maintenanceList').innerHTML = f.maintenance.length ? f.maintenance.map(maintenanceRow).join('') : '<div class="empty-state"><p>Aucun entretien enregistré.</p></div>';
}

/* ---------- Entretien ---------- */
export function openMaintenance(id = null, { reminderId = '' } = {}) {
  const v = store.active();
  const f = fieldsOf(v.id);
  const x = id ? f.maintenance.find(m => m.id === id) : null;
  const form = $('#maintenanceForm');
  form.reset();
  clearErrors(form);
  const bike = isBike(v);
  const types = MAINTENANCE_TYPES[v.kind];
  const reminder = f.reminders.find(r => r.id === reminderId);
  form.elements.type.innerHTML = types.map(t => `<option>${esc(t)}</option>`).join('');
  form.elements.editId.value = x ? x.id : '';
  form.elements.type.value = x?.type || (reminder && types.find(t => t.toLowerCase() === reminder.label.toLowerCase())) || types[0];
  form.elements.label.value = x?.label || (reminder && !types.includes(reminder.label) ? reminder.label : '');
  form.elements.label.placeholder = bike ? 'Ex. Réglage dérailleur' : 'Ex. Vidange + filtres';
  form.elements.date.value = x?.date || todayKey();
  form.elements.km.value = intInput(x ? x.km : currentKm(v, f));
  form.elements.cost.value = x ? numInput(x.cost) : '';
  form.elements.garage.value = x?.garage || '';
  $('#maGarageLabel').innerHTML = `${bike ? 'Atelier' : 'Garage'} <span class="field__opt">(facultatif)</span>`;
  form.elements.note.value = x?.note || '';
  // Pré-coche le rappel correspondant au type choisi (ou celui d'où vient « Fait ») ; les autres restent décochables/cochables à la main.
  const match = reminder || (!x && f.reminders.find(r => r.label.toLowerCase() === form.elements.type.value.toLowerCase()));
  const preChecked = new Set(match ? [match.id] : []);
  $('#maReminderList').innerHTML = f.reminders.length
    ? f.reminders
        .map(
          r =>
            `<label class="check-row"><input type="checkbox" name="reminders" value="${esc(r.id)}" ${preChecked.has(r.id) ? 'checked' : ''}><span>${esc(r.label)}</span></label>`
        )
        .join('')
    : '<p class="check-list__empty">Aucun rappel créé pour l’instant.</p>';
  $('#maReminderField').hidden = !f.reminders.length;
  // Vélo uniquement : remise à zéro de l'usure d'un ou plusieurs composants (chaîne, pneus…) en même temps que l'entretien.
  if (bike && f.parts.length) {
    const matchPart = !x && f.parts.find(p => p.name.toLowerCase() === form.elements.type.value.toLowerCase());
    const prePart = new Set(matchPart ? [matchPart.id] : []);
    $('#maPartList').innerHTML = f.parts
      .map(p => `<label class="check-row"><input type="checkbox" name="parts" value="${esc(p.id)}" ${prePart.has(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`)
      .join('');
  }
  $('#maPartField').hidden = !(bike && f.parts.length);
  $('#maintenanceTitle').textContent = x ? 'Modifier l’entretien' : 'Nouvel entretien';
  $('#maintenanceDelete').hidden = !x;
  openSheet('maintenanceSheet', { focus: false });
}

const maintenanceSchema = {
  type: [rules.required('Le type')],
  label: [rules.maxLength(120)],
  date: [rules.date({ required: true })],
  km: [positive('Le kilométrage', { integer: true, max: 3000000 })],
  cost: [positive('Le coût', { max: 1000000 })],
  garage: [rules.maxLength(80)],
  note: [rules.maxLength(1000)]
};

function onMaintenanceSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, maintenanceSchema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const f = fieldsOf(v.id);
  const existing = val.editId ? f.maintenance.find(m => m.id === val.editId) : null;
  const item = { id: existing ? existing.id : makeId(), type: val.type, label: val.label, date: val.date, km: toNumber(val.km) || 0, cost: toNumber(val.cost) || 0, garage: val.garage, note: val.note };
  const list = existing ? f.maintenance.map(m => (m === existing ? item : m)) : [...f.maintenance, item];
  const patch = { maintenance: list };
  // Remise à zéro de l'usure des composants (vélo) cochés, comme le bouton « Remplacé » de l'onglet Usure.
  const checkedPartIds = new Set($$('#maPartList input[name="parts"]:checked').map(c => c.value));
  if (checkedPartIds.size) {
    patch.parts = f.parts.map(p => (checkedPartIds.has(p.id) ? { ...p, installedKm: item.km || p.installedKm, installedDate: item.date } : p));
  }
  // Remise à zéro de tous les rappels cochés (si cet entretien est le plus récent pour chacun)
  const checkedIds = new Set($$('#maReminderList input[name="reminders"]:checked').map(c => c.value));
  if (checkedIds.size) {
    patch.reminders = f.reminders.map(r => (checkedIds.has(r.id) && (!r.lastDate || item.date >= r.lastDate) ? { ...r, lastDate: item.date, lastKm: item.km || r.lastKm } : r));
  }
  store.setKeys(Object.fromEntries(Object.entries(patch).map(([k, value]) => [fieldKey(v.id, k), value])));
  closeSheet('maintenanceSheet');
  toast(existing ? 'Entretien modifié' : 'Entretien enregistré');
}

async function removeMaintenance() {
  const v = store.active();
  const id = $('#maintenanceForm').elements.editId.value;
  const list = store.field('maintenance', v.id);
  const x = list.find(m => m.id === id);
  if (!x || !(await confirmDialog({ title: 'Supprimer cet entretien ?', message: `${x.type} — ${fmtDate(x.date)}`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('maintenance', list.filter(m => m !== x), v.id);
  closeSheet('maintenanceSheet');
  toast('Entretien supprimé');
}

/* ---------- Rappel ---------- */
export function openReminder(id = null) {
  const v = store.active();
  const r = id ? store.field('reminders', v.id).find(x => x.id === id) : null;
  const form = $('#reminderForm');
  form.reset();
  clearErrors(form);
  $('#reChoices').innerHTML = [...new Set([...presetReminders(v).map(x => x.label), ...MAINTENANCE_TYPES[v.kind]])].map(t => `<option value="${esc(t)}">`).join('');
  form.elements.label.placeholder = isBike(v) ? 'Ex. Chaîne' : 'Ex. Vidange';
  form.elements.editId.value = r ? r.id : '';
  form.elements.label.value = r?.label || '';
  form.elements.everyKm.value = intInput(r?.everyKm);
  form.elements.everyMonths.value = intInput(r?.everyMonths);
  form.elements.lastDate.value = r?.lastDate || '';
  form.elements.lastKm.value = intInput(r?.lastKm);
  $('#reminderTitle').textContent = r ? `Rappel · ${r.label}` : 'Nouveau rappel';
  $('#reminderDelete').hidden = !r;
  openSheet('reminderSheet', { focus: false });
}

const reminderSchema = {
  label: [rules.required('Le nom'), rules.maxLength(60)],
  everyKm: [positive('L’intervalle', { integer: true, max: 1000000 }), (v, all) => (!toNumber(v) && !toNumber(all.everyMonths) ? 'Indiquez un intervalle en km et/ou en mois.' : null)],
  everyMonths: [positive('L’intervalle', { integer: true, max: 240 })],
  lastDate: [rules.date(), v => (v && v > todayKey() ? 'Cette date est dans le futur.' : null)],
  lastKm: [positive('Le kilométrage', { integer: true, max: 3000000 })]
};

function onReminderSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, reminderSchema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const list = store.field('reminders', v.id);
  const item = { id: val.editId || makeId(), label: val.label, everyKm: toNumber(val.everyKm) || 0, everyMonths: toNumber(val.everyMonths) || 0, lastDate: val.lastDate, lastKm: toNumber(val.lastKm) || 0 };
  store.setField('reminders', val.editId ? list.map(r => (r.id === val.editId ? item : r)) : [...list, item], v.id);
  closeSheet('reminderSheet');
  toast(val.editId ? 'Rappel modifié' : 'Rappel ajouté');
}

async function removeReminder() {
  const v = store.active();
  const id = $('#reminderForm').elements.editId.value;
  const list = store.field('reminders', v.id);
  const r = list.find(x => x.id === id);
  if (!r || !(await confirmDialog({ title: `Supprimer le rappel « ${r.label} » ?`, message: 'L’historique des entretiens est conservé.', confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('reminders', list.filter(x => x !== r), v.id);
  closeSheet('reminderSheet');
  toast('Rappel supprimé');
}

/** Envoie un rappel d'entretien comme tâche datée dans le planning de Carnet. */
async function sendReminderToCarnet(card) {
  const v = store.active();
  const f = fieldsOf(v.id);
  const r = f.reminders.find(x => x.id === card.dataset.reminder);
  if (!r) return;
  const s = reminderStatus(r, currentKm(v, f));
  const key = sentKey(r.id, s);
  if (sent.has(key)) return;
  const noteParts = [s.nextKm ? `vers ${km(s.nextKm)}` : '', s.nextDate ? `vers le ${fmtDate(s.nextDate)}` : ''].filter(Boolean);
  try {
    await pushReminderToCarnet({ vehicleName: v.name, label: r.label, date: s.nextDate || '', note: noteParts.join(' · ') });
    sent.add(key);
    saveSent();
    toast(`${r.label} envoyé au planning de Carnet`);
    renderMaintenance(v, f);
  } catch (error) {
    toastError(`Carnet injoignable : ${error.message}`);
  }
}

export function initMaintenance() {
  $('#maintenanceForm').addEventListener('submit', onMaintenanceSubmit);
  $('#maintenanceDelete').addEventListener('click', removeMaintenance);
  $('#maReminderList').addEventListener('change', e => {
    e.target.closest('.check-row')?.classList.toggle('is-checked', e.target.checked);
  });
  $('#maPartList').addEventListener('change', e => {
    e.target.closest('.check-row')?.classList.toggle('is-checked', e.target.checked);
  });
  $('#reminderForm').addEventListener('submit', onReminderSubmit);
  $('#reminderDelete').addEventListener('click', removeReminder);
  $('#panel-maintenance').addEventListener('click', e => {
    const card = e.target.closest('[data-reminder]');
    if (card && e.target.closest('[data-reminder-send]')) return sendReminderToCarnet(card);
    if (card && e.target.closest('[data-reminder-done]')) return openMaintenance(null, { reminderId: card.dataset.reminder });
    if (card && e.target.closest('[data-reminder-edit]')) return openReminder(card.dataset.reminder);
    const row = e.target.closest('[data-maintenance]');
    if (row) openMaintenance(row.dataset.maintenance);
  });
}
