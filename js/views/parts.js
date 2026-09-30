/* Vélos : usure des composants au kilomètre (chaîne, pneus, plaquettes…). */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { todayKey, formatKey } from '../core/dates.js';
import { partStatus, currentKm } from '../core/calc.js';
import { DEFAULT_PARTS, makeId, fieldKey } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { km, euro, toNumber, numInput, intInput, positive, LEVEL_LABEL, fieldsOf } from './common.js';

function card(p, current) {
  const s = partStatus(p, current);
  const since = [p.installedDate ? `depuis le ${formatKey(p.installedDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : '', `monté à ${km(p.installedKm)}`].filter(Boolean).join(' · ');
  return `<article class="due card is-${s.level}" data-part="${esc(p.id)}">
    <div class="due__head">
      <span class="row__icon">${icon('gear', 18)}</span>
      <button type="button" class="due__body" data-part-edit aria-label="Modifier ${esc(p.name)}"><span class="due__title">${esc(p.name)}</span><span class="due__sub">${esc(since)}</span></button>
      <span class="level is-${s.level}">${s.level === 'late' ? 'À changer' : LEVEL_LABEL[s.level]}</span>
    </div>
    <div class="due__bar"><span style="--value:${Math.round(Math.min(1, s.ratio) * 100)}%"></span></div>
    <div class="due__foot"><span>${esc(km(s.used))} / ${esc(km(p.limitKm))}${s.left > 0 ? ` · reste ${esc(km(s.left))}` : ''}</span>
      <button type="button" class="btn btn--soft btn--sm" data-part-replace>${icon('refresh', 15)}<span>Remplacé</span></button></div>
  </article>`;
}

export function renderParts(v, f) {
  const current = currentKm(v, f);
  $('#partsSub').textContent = `Compteur : ${km(current)} — mettez-le à jour après vos sorties`;
  $('#partList').innerHTML = f.parts.length ? f.parts.map(p => card(p, current)).join('') : '<div class="empty-card">Aucun composant suivi.</div>';
}

export function openPart(id = null) {
  const v = store.active();
  const p = id ? store.field('parts', v.id).find(x => x.id === id) : null;
  const form = $('#partForm');
  form.reset();
  clearErrors(form);
  $('#paChoices').innerHTML = DEFAULT_PARTS.map(x => `<option value="${esc(x.name)}">`).join('');
  form.elements.editId.value = p ? p.id : '';
  form.elements.name.value = p?.name || '';
  form.elements.limitKm.value = intInput(p?.limitKm);
  form.elements.cost.value = p ? numInput(p.cost) : '';
  form.elements.installedDate.value = p ? p.installedDate : todayKey();
  form.elements.installedKm.value = intInput(p ? p.installedKm : currentKm(v, fieldsOf(v.id))) || '0';
  $('#partTitle').textContent = p ? p.name : 'Nouveau composant';
  $('#partDelete').hidden = !p;
  openSheet('partSheet', { focus: false });
}

const schema = {
  name: [rules.required('Le nom'), rules.maxLength(60)],
  limitKm: [positive('La durée de vie', { required: true, integer: true, max: 1000000 }), v => (toNumber(v) === 0 ? 'Indiquez une durée de vie.' : null)],
  cost: [positive('Le prix', { max: 100000 })],
  installedDate: [rules.date(), v => (v && v > todayKey() ? 'Cette date est dans le futur.' : null)],
  installedKm: [positive('Le kilométrage', { integer: true, max: 3000000 })]
};

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const val = formValues(form);
  const { valid, errors } = validate(val, schema);
  if (!valid) return showErrors(form, errors);
  const v = store.active();
  const list = store.field('parts', v.id);
  const item = { id: val.editId || makeId(), name: val.name, limitKm: toNumber(val.limitKm), cost: toNumber(val.cost) || 0, installedDate: val.installedDate, installedKm: toNumber(val.installedKm) || 0 };
  store.setField('parts', val.editId ? list.map(p => (p.id === val.editId ? item : p)) : [...list, item], v.id);
  closeSheet('partSheet');
  toast(val.editId ? 'Composant modifié' : 'Composant ajouté');
}

/** Remplacement : remet l'usure à zéro et ajoute l'entretien (avec le prix du composant). */
async function replace(id) {
  const v = store.active();
  const f = fieldsOf(v.id);
  const p = f.parts.find(x => x.id === id);
  if (!p) return;
  const current = currentKm(v, f);
  const ok = await confirmDialog({
    title: `${p.name} remplacé ?`,
    message: `L’usure repart de zéro à ${km(current)}.${p.cost ? ` Un entretien de ${euro(p.cost)} est ajouté à l’historique.` : ''}`,
    confirmLabel: 'Confirmer'
  });
  if (!ok) return;
  const today = todayKey();
  const patch = { [fieldKey(v.id, 'parts')]: f.parts.map(x => (x.id === id ? { ...x, installedKm: current, installedDate: today } : x)) };
  patch[fieldKey(v.id, 'maintenance')] = [...f.maintenance, { id: makeId(), type: 'Réparation', label: `Remplacement ${p.name.toLowerCase()}`, date: today, km: current, cost: p.cost || 0, garage: '', note: '' }];
  store.setKeys(patch);
  toast(`${p.name} : compteur remis à zéro`);
}

async function remove() {
  const v = store.active();
  const id = $('#partForm').elements.editId.value;
  const list = store.field('parts', v.id);
  const p = list.find(x => x.id === id);
  if (!p || !(await confirmDialog({ title: `Ne plus suivre « ${p.name} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('parts', list.filter(x => x !== p), v.id);
  closeSheet('partSheet');
  toast('Composant supprimé');
}

export function initParts() {
  $('#partForm').addEventListener('submit', onSubmit);
  $('#partDelete').addEventListener('click', remove);
  $('#partList').addEventListener('click', e => {
    const c = e.target.closest('[data-part]');
    if (!c) return;
    if (e.target.closest('[data-part-replace]')) return replace(c.dataset.part);
    if (e.target.closest('[data-part-edit]')) openPart(c.dataset.part);
  });
}
