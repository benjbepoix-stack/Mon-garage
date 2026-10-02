/* Utilitaires d'affichage partagés. */
import { parseNumber } from '../core/utils.js';
import { icon } from '../ui/icons.js';
import * as store from '../core/store.js';
import { currentKm } from '../core/calc.js';
import { FIELDS, isBike } from '../core/schema.js';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eurRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Montants ronds sans décimales (180 €), sinon deux décimales (75,50 €). */
export const euro = v => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return Number.isInteger(n) ? eurRound.format(n) : eur.format(n);
};
export const euroRound = v => eurRound.format(Math.round(Number(v) || 0));
export const km = v => `${int.format(Math.round(Number(v) || 0))} km`;
export const intFmt = v => int.format(Math.round(Number(v) || 0));
export const dec = (v, d = 1) => (Number(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Saisie « 12,5 » / « 75 000 » -> nombre (2 décimales max), sinon null. */
export function toNumber(v) {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n * 100) / 100;
}
export const numInput = n => (n ? String(n).replace('.', ',') : '');
export const intInput = n => (n ? String(Math.round(n)) : '');

export const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Tous les champs d'un véhicule (copies). */
export function fieldsOf(id = store.activeId()) {
  return Object.fromEntries(FIELDS.map(f => [f, store.field(f, id)]));
}

export const kmOf = (v, f = fieldsOf(v.id)) => currentKm(v, f);

export const kindIcon = (v, size = 22) => icon(isBike(v) ? 'bike' : 'car', size);

export function photoHtml(v, size = 44, { full = false } = {}) {
  const src = v.hasPhoto ? store.photo(v.id) : '';
  if (!src) return kindIcon(v, size);
  // full : photo entière (non recadrée) sur un fond flouté de la même image
  return full ? `<img class="photo-fill" src="${src}" alt="" aria-hidden="true"><img class="photo-main" src="${src}" alt="" loading="lazy">` : `<img src="${src}" alt="" loading="lazy">`;
}

export const LEVEL_LABEL = { late: 'En retard', soon: 'Bientôt', ok: 'À jour', unknown: 'À renseigner', none: 'Sans échéance' };

/** Validation « nombre positif » pour les champs numériques facultatifs. */
export const positive = (label, { required = false, max = 1e7, integer = false } = {}) => v => {
  if (v === '' || v === null || v === undefined) return required ? `${label} est obligatoire.` : null;
  const n = parseNumber(v);
  if (n === null || n < 0) return 'Nombre positif attendu.';
  if (integer && !Number.isInteger(n)) return 'Nombre entier attendu.';
  if (n > max) return `Maximum ${int.format(max)}.`;
  return null;
};

/** Réduit une photo (max 1200 px, JPEG) pour la stocker légèrement. */
export function compressPhoto(file, maxSide = 1200, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}
