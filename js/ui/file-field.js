/*
 * Champ « pièces jointes » réutilisable (photos ou PDF) : liste des fichiers
 * en attente, ajout multiple, retrait, aperçu. Utilisé par les documents, les
 * entretiens et les autres dépenses (dont la facture est rangée
 * automatiquement dans l'onglet Documents).
 *
 * Les fichiers ne sont écrits qu'à l'enregistrement du formulaire (`commit`) :
 * nouveaux fichiers rangés hors du nœud synchronisé (appareil + cloud, voir
 * js/services/files.js), fichiers retirés supprimés. Le document ne garde que
 * leurs métadonnées { id, name, mime }.
 */
import { $, esc } from '../core/utils.js';
import { makeId } from '../core/schema.js';
import { icon } from './icons.js';
import { toastError } from './toast.js';
import { openAttachment } from './attachment-viewer.js';
import { readDocFile } from '../views/common.js';
import { saveFile, deleteFile, mimeOf, filesEpoch } from '../services/files.js';

export const MAX_FILES = 10;

const isImage = f => (f.mime || mimeOf(f.data || f.file)).startsWith('image/');
const nameOf = f => f.name || (isImage(f) ? 'Photo' : 'Document PDF');

/**
 * @param {{ list: string, input: string, label: string, empty?: string, more?: string }} ids
 * @returns {{ set(files): void, commit(): Promise<Array> }}
 */
export function createFileField({ list, input, label, empty = 'Ajouter des fichiers', more = 'Ajouter d’autres fichiers' }) {
  let files = []; // { id, name, mime, data? (nouveau fichier, pas encore enregistré), file? (ancien format) }
  let removed = []; // pièces jointes enregistrées retirées du formulaire

  const render = () => {
    $(list).innerHTML = files
      .map(
        (f, i) => `<div class="file-attach__current" data-file-index="${i}">
        <span class="file-attach__icon">${icon(isImage(f) ? 'image' : 'doc', 16)}</span>
        <span class="file-attach__name">${esc(nameOf(f))}</span>
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
        files.push({ id: makeId(), name: file.name, mime: mimeOf(data), data });
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
      const [f] = files.splice(Number(removeBtn.dataset.fileRemove), 1);
      if (f && !f.data) removed.push(f.id);
      render();
      return;
    }
    const pill = e.target.closest('[data-file-index]');
    const f = pill && files[Number(pill.dataset.fileIndex)];
    if (f) openAttachment(f);
  });

  return {
    /** Pièces jointes déjà enregistrées (métadonnées) à afficher dans le formulaire. */
    set(next) {
      files = (next || []).map(x => ({ ...x }));
      removed = [];
      $(input).value = '';
      render();
    },
    /**
     * Range les nouveaux fichiers (appareil + cloud), supprime les retirés ; retourne la liste à
     * stocker dans le document. Un fichier qu'aucun stockage n'a pu garder (IndexedDB indisponible
     * et pas de compte) reste dans le document comme avant : rien n'est perdu, la migration le
     * rangera plus tard (js/features/files-migration.js).
     */
    async commit() {
      const out = [];
      const epoch = filesEpoch(); // compte changé pendant l'enregistrement : rien n'est rangé pour l'autre compte
      for (const f of files) {
        if (!f.data) {
          out.push({ ...f });
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const { local, cloud } = await saveFile(f.id, f.data, { epoch });
        out.push(local || cloud ? { id: f.id, name: f.name, mime: f.mime } : { id: f.id, name: f.name, mime: f.mime, file: f.data });
      }
      if (filesEpoch() === epoch) removed.forEach(id => deleteFile(id));
      removed = [];
      files = out.map(x => ({ ...x }));
      return out;
    }
  };
}
