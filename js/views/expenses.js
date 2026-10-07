/*
 * Autres dépenses (onglet Coûts) : achats ponctuels hors entretien — roues
 * carbone, porte-vélo, équipement, accessoires… Comptées dans les coûts
 * (catégorie « Autres dépenses ») ; leur facture éventuelle est rangée dans
 * l'onglet Documents.
 */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { EXPENSE_CATEGORIES, makeId, fieldKey, isBike } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { createFileField } from '../ui/file-field.js';
import { openAttachment } from '../ui/attachment-viewer.js';
import { linkedDoc, withLinkedDoc, withoutLinkedDoc } from '../features/linked-doc.js';
import { euro, toNumber, numInput, positive, fieldsOf } from './common.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'short', year: 'numeric' });
let invoiceField = null;

function row(x, docs) {
  const n = linkedDoc(docs, x.id)?.files.length || 0;
  return `<div class="row" data-edit data-expense="${esc(x.id)}">
    <span class="row__icon">${icon('tag', 18)}</span>
    <div class="row__body"><span class="row__title">${esc(x.label)}</span><span class="row__sub">${esc([fmtDate(x.date), x.category].join(' · '))}</span></div>
    ${n ? `<button type="button" class="icon-btn icon-btn--sm" data-invoice aria-label="Voir la facture" title="Facture">${icon('paperclip', 16)}${n > 1 ? `<span class="icon-btn__badge">${n}</span>` : ''}</button>` : ''}
    <div class="row__amount">${esc(euro(x.cost))}</div>
  </div>`;
}

export function renderExpenses(v, f) {
  const total = f.expenses.reduce((s, x) => s + x.cost, 0);
  $('#expensesSub').textContent = f.expenses.length
    ? `${f.expenses.length} dépense${f.expenses.length > 1 ? 's' : ''} · ${euro(total)}`
    : isBike(v)
      ? 'Achats hors entretien : roues, accessoires, équipement…'
      : 'Achats hors entretien : équipement, accessoires, jantes…';
  $('#expenseList').innerHTML = f.expenses.length
    ? f.expenses.map(x => row(x, f.docs)).join('')
    : `<div class="empty-state"><p>Aucune autre dépense. Ajoutez par exemple ${isBike(v) ? 'de nouvelles roues carbone' : 'un coffre de toit ou des jantes hiver'}.</p></div>`;
}

export function openExpense(id = null) {
  const v = store.active();
  const f = fieldsOf(v.id);
  const x = id ? f.expenses.find(e => e.id === id) : null;
  const form = $('#expenseForm');
  form.reset();
  clearErrors(form);
  const cats = EXPENSE_CATEGORIES[v.kind];
  form.elements.category.innerHTML = [...new Set([...cats, ...(x && !cats.includes(x.category) ? [x.category] : [])])].map(c => `<option>${esc(c)}</option>`).join('');
  form.elements.editId.value = x ? x.id : '';
  form.elements.label.value = x?.label || '';
  form.elements.label.placeholder = isBike(v) ? 'Ex. Nouvelles roues carbone' : 'Ex. Coffre de toit';
  form.elements.category.value = x?.category || cats[0];
  form.elements.date.value = x?.date || todayKey();
  form.elements.cost.value = x ? numInput(x.cost) : '';
  form.elements.note.value = x?.note || '';
  invoiceField.set(x ? linkedDoc(f.docs, x.id)?.files : []);
  $('#expenseTitle').textContent = x ? 'Modifier la dépense' : 'Nouvelle dépense';
  $('#expenseDelete').hidden = !x;
  openSheet('expenseSheet', { focus: false });
}

const schema = {
  label: [rules.required('La dépense'), rules.maxLength(120)],
  date: [rules.date({ required: true })],
  cost: [positive('Le montant', { required: true, max: 1000000 }), v => (toNumber(v) === 0 ? 'Le montant doit être supérieur à 0.' : null)],
  note: [rules.maxLength(1000)]
};

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, schema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const f = fieldsOf(v.id);
  const item = { id: val.editId || makeId(), date: val.date, category: val.category, label: val.label, cost: toNumber(val.cost), note: val.note };
  const list = val.editId ? f.expenses.map(x => (x.id === val.editId ? item : x)) : [...f.expenses, item];
  store.setKeys({
    [fieldKey(v.id, 'expenses')]: list,
    [fieldKey(v.id, 'docs')]: withLinkedDoc(f.docs, { source: 'expense', sourceId: item.id, title: item.label, date: item.date, files: invoiceField.get() })
  });
  closeSheet('expenseSheet');
  toast(val.editId ? 'Dépense modifiée' : 'Dépense ajoutée');
}

async function remove() {
  const v = store.active();
  const f = fieldsOf(v.id);
  const id = $('#expenseForm').elements.editId.value;
  const x = f.expenses.find(e => e.id === id);
  const invoice = x && linkedDoc(f.docs, x.id);
  if (!x || !(await confirmDialog({ title: 'Supprimer cette dépense ?', message: `${x.label} — ${euro(x.cost)}${invoice ? ' · sa facture sera aussi retirée des documents' : ''}`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setKeys({ [fieldKey(v.id, 'expenses')]: f.expenses.filter(e => e !== x), [fieldKey(v.id, 'docs')]: withoutLinkedDoc(f.docs, x.id) });
  closeSheet('expenseSheet');
  toast('Dépense supprimée');
}

export function initExpenses() {
  invoiceField = createFileField({ list: '#exFilesList', input: '#exFileInput', label: '#exFileLabel', empty: 'Joindre la facture', more: 'Ajouter un fichier' });
  $('#expenseForm').addEventListener('submit', onSubmit);
  $('#expenseDelete').addEventListener('click', remove);
  $('#expenseList').addEventListener('click', e => {
    const r = e.target.closest('[data-expense]');
    if (!r) return;
    if (e.target.closest('[data-invoice]')) {
      const files = linkedDoc(store.field('docs', store.activeId()), r.dataset.expense)?.files || [];
      if (files.length === 1) return openAttachment(files[0].file, files[0].fileName);
    }
    openExpense(r.dataset.expense);
  });
}
