/* Documents & échéances : assurance, contrôle technique, garanties… */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { docStatus } from '../core/calc.js';
import { DOC_TYPES, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { openAttachment } from '../ui/attachment-viewer.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { offerCalendar } from '../features/calendar-prompt.js';
import { LEVEL_LABEL, readDocFile } from './common.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'long', year: 'numeric' });
const MAX_FILES = 10;

let pendingFiles = [];

function row(d) {
  const s = docStatus(d);
  const n = d.files.length;
  const when = d.expiry ? (s.daysLeft < 0 ? `Expiré le ${fmtDate(d.expiry)}` : `Échéance le ${fmtDate(d.expiry)}`) : 'Sans date d’échéance';
  return `<div class="row" data-edit data-doc="${esc(d.id)}">
    <span class="row__icon">${icon('doc', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(d.type)}${d.label ? ` <span class="row__soft">· ${esc(d.label)}</span>` : ''}</span><span class="row__sub">${esc(when)}</span>
      ${d.expiry ? `<span class="row__tags"><span class="level is-${s.level}">${s.level === 'late' ? 'Expiré' : LEVEL_LABEL[s.level]}</span></span>` : ''}</div>
    ${n ? `<button type="button" class="icon-btn icon-btn--sm" data-doc-file="${esc(d.id)}" aria-label="${n > 1 ? `Voir les pièces jointes (${n})` : 'Voir la pièce jointe'}" title="${n > 1 ? `${n} pièces jointes` : 'Pièce jointe'}">${icon('paperclip', 17)}${n > 1 ? `<span class="icon-btn__badge">${n}</span>` : ''}</button>` : ''}
    ${d.expiry && s.daysLeft >= 0 ? `<button type="button" class="icon-btn icon-btn--sm" data-doc-cal aria-label="Ajouter l’échéance au calendrier">${icon('calendarPlus', 17)}</button>` : ''}
  </div>`;
}

function renderPendingFiles() {
  $('#docFilesList').innerHTML = pendingFiles
    .map(
      (pf, i) => `<div class="file-attach__current" data-file-index="${i}">
        <span class="file-attach__icon">${pf.file.startsWith('data:image/') ? icon('image', 16) : icon('doc', 16)}</span>
        <span class="file-attach__name">${esc(pf.fileName || (pf.file.startsWith('data:image/') ? 'Photo' : 'Document PDF'))}</span>
        <button type="button" class="icon-btn icon-btn--sm" data-file-remove="${i}" aria-label="Retirer cette pièce jointe">${icon('close', 16)}</button>
      </div>`
    )
    .join('');
  $('#docFileLabel').querySelector('span:last-of-type').textContent = pendingFiles.length ? 'Ajouter d’autres fichiers' : 'Ajouter des fichiers';
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
  pendingFiles = d?.files ? d.files.map(x => ({ ...x })) : [];
  $('#docFileInput').value = '';
  renderPendingFiles();
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
  const item = { id: val.editId || makeId(), type: val.type, label: val.label, expiry: val.expiry, note: val.note, files: pendingFiles };
  store.setField('docs', val.editId ? list.map(x => (x.id === val.editId ? item : x)) : [...list, item], v.id);
  closeSheet('docSheet');
  if (item.expiry && item.expiry >= todayKey()) offerCalendar(calendarEvent(v, item), { heading: 'Ajouter l’échéance au calendrier ?' });
  else toast(val.editId ? 'Document modifié' : 'Document ajouté');
}

async function remove() {
  const v = store.active();
  const id = $('#docForm').elements.editId.value;
  const list = store.field('docs', v.id);
  const d = list.find(x => x.id === id);
  if (!d || !(await confirmDialog({ title: 'Supprimer ce document ?', message: d.type, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('docs', list.filter(x => x !== d), v.id);
  closeSheet('docSheet');
  toast('Document supprimé');
}

export function initDocs() {
  $('#docForm').addEventListener('submit', onSubmit);
  $('#docDelete').addEventListener('click', remove);
  $('#docFileInput').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const room = MAX_FILES - pendingFiles.length;
    if (room <= 0) {
      toastError(`${MAX_FILES} pièces jointes maximum par document.`);
      e.target.value = '';
      return;
    }
    const errors = [];
    for (const file of files.slice(0, room)) {
      // eslint-disable-next-line no-await-in-loop
      try {
        const data = await readDocFile(file);
        pendingFiles.push({ id: makeId(), file: data, fileName: file.name });
      } catch (error) {
        errors.push(`${file.name} : ${error.message}`);
      }
    }
    if (files.length > room) errors.push(`${MAX_FILES} pièces jointes maximum par document : ${files.length - room} fichier(s) ignoré(s).`);
    renderPendingFiles();
    if (errors.length) toastError(errors.join(' '));
    e.target.value = '';
  });
  $('#docFilesList').addEventListener('click', e => {
    const removeBtn = e.target.closest('[data-file-remove]');
    if (removeBtn) {
      pendingFiles.splice(Number(removeBtn.dataset.fileRemove), 1);
      renderPendingFiles();
      return;
    }
    const pill = e.target.closest('[data-file-index]');
    if (pill) {
      const pf = pendingFiles[Number(pill.dataset.fileIndex)];
      if (pf) openAttachment(pf.file, pf.fileName);
    }
  });
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
