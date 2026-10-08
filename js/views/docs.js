/* Documents & échéances : assurance, contrôle technique, garanties… */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { docStatus } from '../core/calc.js';
import { DOC_TYPES, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { openAttachment } from '../ui/attachment-viewer.js';
import { createFileField } from '../ui/file-field.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { offerCalendar } from '../features/calendar-prompt.js';
import { SOURCE_LABEL } from '../features/linked-doc.js';
import { LEVEL_LABEL } from './common.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'long', year: 'numeric' });

let fileField = null;

function row(d) {
  const s = docStatus(d);
  const n = d.files.length;
  const when = d.expiry ? (s.daysLeft < 0 ? `Expiré le ${fmtDate(d.expiry)}` : `Échéance le ${fmtDate(d.expiry)}`) : 'Sans date d’échéance';
  return `<div class="row" data-edit data-doc="${esc(d.id)}">
    <span class="row__icon">${icon('doc', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(d.type)}${d.label ? ` <span class="row__soft">· ${esc(d.label)}</span>` : ''}</span><span class="row__sub">${esc(when)}</span>
      ${d.expiry || d.source ? `<span class="row__tags">${d.expiry ? `<span class="level is-${s.level}">${s.level === 'late' ? 'Expiré' : LEVEL_LABEL[s.level]}</span>` : ''}${d.source ? `<span class="level is-none">${SOURCE_LABEL[d.source]}</span>` : ''}</span>` : ''}</div>
    ${n ? `<button type="button" class="icon-btn icon-btn--sm" data-doc-file="${esc(d.id)}" aria-label="${n > 1 ? `Voir les pièces jointes (${n})` : 'Voir la pièce jointe'}" title="${n > 1 ? `${n} pièces jointes` : 'Pièce jointe'}">${icon('paperclip', 17)}${n > 1 ? `<span class="icon-btn__badge">${n}</span>` : ''}</button>` : ''}
    ${d.expiry && s.daysLeft >= 0 ? `<button type="button" class="icon-btn icon-btn--sm" data-doc-cal aria-label="Ajouter l’échéance au calendrier">${icon('calendarPlus', 17)}</button>` : ''}
  </div>`;
}

export function renderDocs(v, f) {
  const soon = f.docs.filter(d => ['late', 'soon'].includes(docStatus(d).level)).length;
  $('#docsSub').textContent = f.docs.length ? `${f.docs.length} document${f.docs.length > 1 ? 's' : ''}${soon ? ` · ${soon} à renouveler` : ''}` : '';
  $('#docList').innerHTML = f.docs.length ? f.docs.map(row).join('') : `<div class="empty-state"><p>Aucun document. Ajoutez ${v.kind === 'bike' ? 'la facture et la garantie' : 'l’assurance et le contrôle technique'} avec leur date d’échéance pour être prévenu à temps.</p></div>`;
}

export function openDoc(id = null) {
  const v = store.active();
  const d = id ? store.field('docs', v.id).find(x => x.id === id) : null;
  const form = $('#docForm');
  form.reset();
  clearErrors(form);
  form.elements.type.innerHTML = DOC_TYPES[v.kind].map(t => `<option>${esc(t)}</option>`).join('');
  form.elements.editId.value = d ? d.id : '';
  form.elements.type.value = d?.type || DOC_TYPES[v.kind][0];
  form.elements.label.value = d?.label || '';
  form.elements.expiry.value = d?.expiry || '';
  form.elements.note.value = d?.note || '';
  fileField.set(d?.files || []);
  $('#docTitle').textContent = d ? 'Modifier le document' : 'Nouveau document';
  $('#docDelete').hidden = !d;
  openSheet('docSheet', { focus: false });
}

const schema = { label: [rules.maxLength(120)], expiry: [rules.date()], note: [rules.maxLength(1000)] };

function calendarEvent(v, d) {
  return { id: `garage-${v.id}-doc-${d.id}`, title: `🚗 ${d.type}${d.label ? ` · ${d.label}` : ''} — ${v.name}`, date: d.expiry, description: d.note, alarmMinutes: 0 };
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, schema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const list = store.field('docs', v.id);
  const existing = val.editId ? list.find(x => x.id === val.editId) : null;
  // Un document relié à un entretien ou à une dépense garde ce lien (source, sourceId).
  const item = { ...(existing || {}), id: val.editId || makeId(), type: val.type, label: val.label, expiry: val.expiry, note: val.note, files: fileField.get() };
  store.setField('docs', val.editId ? list.map(x => (x.id === val.editId ? item : x)) : [...list, item], v.id);
  closeSheet('docSheet');
  // Proposé seulement pour une échéance nouvelle ou modifiée (pas à chaque retouche du document).
  if (item.expiry && item.expiry >= todayKey() && item.expiry !== existing?.expiry) offerCalendar(calendarEvent(v, item), { heading: 'Ajouter l’échéance au calendrier ?' });
  else toast(val.editId ? 'Document modifié' : 'Document ajouté');
}

async function remove() {
  const v = store.active();
  const id = $('#docForm').elements.editId.value;
  const list = store.field('docs', v.id);
  const d = list.find(x => x.id === id);
  const message = d?.source ? `${d.label}. ${d.source === 'expense' ? 'La dépense reste enregistrée' : 'L’entretien reste enregistré'}, sans facture.` : d?.type;
  if (!d || !(await confirmDialog({ title: 'Supprimer ce document ?', message, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('docs', list.filter(x => x !== d), v.id);
  closeSheet('docSheet');
  toast('Document supprimé');
}

export function initDocs() {
  $('#docForm').addEventListener('submit', onSubmit);
  $('#docDelete').addEventListener('click', remove);
  fileField = createFileField({ list: '#docFilesList', input: '#docFileInput', label: '#docFileLabel' });
  $('#docList').addEventListener('click', e => {
    const fileBtn = e.target.closest('[data-doc-file]');
    if (fileBtn) {
      const d = store.field('docs', store.active().id).find(x => x.id === fileBtn.dataset.docFile);
      if (!d?.files.length) return;
      // Une seule pièce jointe : ouverture directe. Plusieurs : la fiche liste chacune individuellement.
      if (d.files.length === 1) openAttachment(d.files[0].file, d.files[0].fileName);
      else openDoc(d.id);
      return;
    }
    const r = e.target.closest('[data-doc]');
    if (!r) return;
    const v = store.active();
    const d = store.field('docs', v.id).find(x => x.id === r.dataset.doc);
    if (e.target.closest('[data-doc-cal]') && d) return offerCalendar(calendarEvent(v, d), { heading: 'Ajouter au calendrier ?' });
    openDoc(r.dataset.doc);
  });
}
