/*
 * Champ « pièces jointes » réutilisable (photos ou PDF) : liste des fichiers
 * en attente, ajout multiple, retrait, aperçu. Utilisé par les documents, les
 * entretiens et les autres dépenses (dont la facture est rangée
 * automatiquement dans l'onglet Documents).
 */
import { $, esc } from '../core/utils.js';
import { makeId } from '../core/schema.js';
import { icon } from './icons.js';
import { toastError } from './toast.js';
import { openAttachment } from './attachment-viewer.js';
import { readDocFile } from '../views/common.js';

export const MAX_FILES = 10;

/**
 * @param {{ list: string, input: string, label: string, empty?: string, more?: string }} ids
 * @returns {{ set(files): void, get(): Array }}
 */
export function createFileField({ list, input, label, empty = 'Ajouter des fichiers', more = 'Ajouter d’autres fichiers' }) {
  let files = [];

  const render = () => {
    $(list).innerHTML = files
      .map(
        (pf, i) => `<div class="file-attach__current" data-file-index="${i}">
        <span class="file-attach__icon">${icon(pf.file.startsWith('data:image/') ? 'image' : 'doc', 16)}</span>
        <span class="file-attach__name">${esc(pf.fileName || (pf.file.startsWith('data:image/') ? 'Photo' : 'Document PDF'))}</span>
        <button type="button" class="icon-btn icon-btn--sm" data-file-remove="${i}" aria-label="Retirer cette pièce jointe">${icon('close', 16)}</button>
      </div>`
      )
      .join('');
    $(label).querySelector('span:last-of-type').textContent = files.length ? more : empty;
  };

  $(input).addEventListener('change', async e => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      toastError(`${MAX_FILES} pièces jointes maximum.`);
      e.target.value = '';
      return;
    }
    const errors = [];
    for (const file of picked.slice(0, room)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await readDocFile(file);
        files.push({ id: makeId(), file: data, fileName: file.name });
      } catch (error) {
        errors.push(`${file.name} : ${error.message}`);
      }
    }
    if (picked.length > room) errors.push(`${MAX_FILES} pièces jointes maximum : ${picked.length - room} fichier(s) ignoré(s).`);
    render();
    if (errors.length) toastError(errors.join(' '));
    e.target.value = '';
  });

  $(list).addEventListener('click', e => {
    const removeBtn = e.target.closest('[data-file-remove]');
    if (removeBtn) {
      files.splice(Number(removeBtn.dataset.fileRemove), 1);
      render();
      return;
    }
    const pill = e.target.closest('[data-file-index]');
    const pf = pill && files[Number(pill.dataset.fileIndex)];
    if (pf) openAttachment(pf.file, pf.fileName);
  });

  return {
    set(next) {
      files = (next || []).map(x => ({ ...x }));
      $(input).value = '';
      render();
    },
    get: () => files.map(x => ({ ...x }))
  };
}
