/* Fiche véhicule / vélo : création, modification, photo, suppression. */
import { $, $$, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { FUELS, BIKE_TYPES, DEFAULT_PARTS, presetReminders, fieldKey, photoKey, makeId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { toNumber, intInput, positive, compressPhoto } from './common.js';

let photo = null; // data-URL en cours, '' = retirée, null = inchangée
let onDeleted = () => {};

const form = () => $('#vehicleForm');
const kind = () => form().elements.kind.value;

function syncKind() {
  const k = kind();
  $$('#vehicleForm [data-kind]').forEach(el => (el.hidden = el.dataset.kind !== k));
  const edit = Boolean(form().elements.editId.value);
  $('#vehicleTitle').textContent = `${edit ? 'Modifier' : 'Ajouter'} ${k === 'bike' ? 'un vélo' : 'un véhicule'}`;
  $('#veName').placeholder = k === 'bike' ? 'Ex. Canyon Ultimate' : 'Ex. Audi A5 Coupé';
}

function showPhoto(src) {
  $('#photoPreview').hidden = !src;
  if (src) $('#photoPreview').src = src;
  else $('#photoPreview').removeAttribute('src');
  $('#photoEmpty').hidden = Boolean(src);
  $('#photoRemove').hidden = !src;
}

export function openVehicle(k = 'vehicle', id = null) {
  const v = id ? store.vehicle(id) : null;
  const f = form();
  f.reset();
  clearErrors(f);
  photo = null;
  f.elements.editId.value = v ? v.id : '';
  f.elements.kind.value = v ? v.kind : k;
  $$('#kindSwitch input').forEach(i => (i.disabled = Boolean(v)));
  if (v) {
    ['name', 'brand', 'model', 'plate', 'fuel', 'bikeType', 'bikeSize', 'bikeGroupset', 'bikeWheels', 'notes'].forEach(key => (f.elements[key].value = v[key] || ''));
    f.elements.year.value = v.year || '';
    f.elements.mileage.value = intInput(v.mileage);
  }
  showPhoto(v?.hasPhoto ? store.photo(v.id) : '');
  $('#vehicleDelete').hidden = !v;
  syncKind();
  openSheet('vehicleSheet', { focus: false });
}

const schema = {
  name: [rules.required('Le nom'), rules.maxLength(80)],
  brand: [rules.maxLength(60)],
  model: [rules.maxLength(60)],
  year: [positive('L’année', { integer: true, max: 2100 }), v => (v && (Number(v) < 1900 || Number(v) > new Date().getFullYear() + 1) ? 'Année invalide.' : null)],
  mileage: [positive('Le kilométrage', { integer: true, max: 3000000 })],
  plate: [rules.maxLength(20)],
  notes: [rules.maxLength(2000)]
};

function onSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, schema);
  if (!valid) return showErrors(f, errors);
  const existing = v.editId ? store.vehicle(v.editId) : null;
  const id = existing ? existing.id : makeId();
  const info = {
    id,
    kind: existing ? existing.kind : v.kind === 'bike' ? 'bike' : 'vehicle',
    name: v.name,
    brand: v.brand,
    model: v.model,
    year: v.year,
    mileage: toNumber(v.mileage) || 0,
    fuel: v.fuel,
    plate: v.plate,
    bikeType: v.bikeType,
    bikeSize: v.bikeSize,
    bikeGroupset: v.bikeGroupset,
    bikeWheels: v.bikeWheels,
    notes: v.notes,
    hasPhoto: photo === null ? Boolean(existing?.hasPhoto) : Boolean(photo)
  };
  const patch = {};
  if (photo !== null) patch[photoKey(id)] = photo || null;
  if (existing) {
    patch.vehicles = store.vehicles().map(x => (x.id === id ? { ...x, ...info } : x));
  } else {
    patch.vehicles = [...store.vehicles(), info];
    // Plan d'entretien proposé selon la motorisation (ou le type de vélo), et composants
    // proposés pour les vélos — préconisations généralisées, modifiables ensuite.
    patch[fieldKey(id, 'reminders')] = presetReminders(info).map(r => ({ ...r, id: makeId() }));
    if (info.kind === 'bike') patch[fieldKey(id, 'parts')] = DEFAULT_PARTS.map(p => ({ ...p, id: makeId(), installedKm: info.mileage, installedDate: '' }));
  }
  store.setKeys(patch);
  closeSheet('vehicleSheet');
  toast(existing ? 'Fiche modifiée' : 'Ajouté au garage · plan d’entretien pré-rempli');
}

async function remove() {
  const id = form().elements.editId.value;
  const v = store.vehicle(id);
  if (!v) return;
  const ok = await confirmDialog({
    title: `Supprimer ${v.name} ?`,
    message: 'Toutes ses données (entretiens, carburant, coûts, documents) seront supprimées sur tous vos appareils. Cette action est irréversible.',
    confirmLabel: 'Supprimer définitivement',
    danger: true
  });
  if (!ok) return;
  store.setKeys({ ...store.removalPatch(id), vehicles: store.vehicles().filter(x => x.id !== id) });
  closeSheet('vehicleSheet');
  toast(`${v.name} supprimé`);
  onDeleted(id);
}

export function initVehicles({ deleted }) {
  onDeleted = deleted;
  $('#veFuel').innerHTML = `<option value="">Choisir</option>${FUELS.map(x => `<option>${esc(x)}</option>`).join('')}`;
  $('#veBikeType').innerHTML = `<option value="">Choisir</option>${BIKE_TYPES.map(x => `<option>${esc(x)}</option>`).join('')}`;
  form().addEventListener('submit', onSubmit);
  $('#kindSwitch').addEventListener('change', syncKind);
  $('#vehicleDelete').addEventListener('click', remove);
  $('#photoRemove').addEventListener('click', () => {
    photo = '';
    $('#photoInput').value = '';
    showPhoto('');
  });
  $('#photoInput').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      photo = await compressPhoto(file);
      showPhoto(photo);
    } catch {
      toastError('Cette image n’a pas pu être lue.');
    }
  });
}
