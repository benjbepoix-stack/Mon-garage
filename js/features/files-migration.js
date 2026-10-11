/*
 * Migration des pièces jointes vers le stockage à part (js/services/files.js).
 *
 * Avant, le contenu des fichiers des documents (data URL) était dans le nœud
 * synchronisé : tout était téléchargé à chaque ouverture et renvoyé à chaque
 * modification. Pour chaque fichier encore « en ligne » (`file` présent), on
 * le range dans le nouveau stockage puis on retire la data URL du document —
 * jamais avant que la copie locale soit faite, ni, si un compte est utilisé
 * sur cet appareil, avant que la copie cloud soit confirmée. Sinon le fichier
 * reste dans le document (le normaliseur accepte les deux formats) et la
 * migration est retentée plus tard (prochaine réception des données, prochain
 * lancement).
 */
import * as store from '../core/store.js';
import { fieldKey } from '../core/schema.js';
import { saveFile, filesEpoch } from '../services/files.js';

let running = false;
let again = false;

/**
 * Range les fichiers encore contenus dans les documents.
 * @param {{ needsCloud: () => boolean }} options needsCloud : copie cloud exigée (compte utilisé sur l'appareil)
 * @returns {Promise<number>} nombre de fichiers rangés
 */
export async function migrateInlineFiles({ needsCloud }) {
  if (running) {
    again = true; // nouvelles données reçues pendant la migration : un tour de plus
    return 0;
  }
  running = true;
  let moved = 0;
  try {
    do {
      again = false;
      const epoch = filesEpoch();
      const shared = sharedIds();
      for (const v of store.vehicles()) {
        // Changement de compte : on s'arrête (le nouveau compte relance la migration une fois chargé).
        if (filesEpoch() !== epoch) break;
        // Un id porté par plusieurs pièces jointes : laissé dans le document (une copie écraserait l'autre).
        const inline = store.field('docs', v.id).flatMap(d => d.files.filter(f => f.file && !shared.has(f.id)));
        if (!inline.length) continue;
        const saved = new Map(); // id du fichier rangé → data URL
        for (const f of inline) {
          // eslint-disable-next-line no-await-in-loop
          const { local, cloud } = await saveFile(f.id, f.file, { waitCloud: true, epoch });
          if (local && (cloud || !needsCloud())) saved.set(f.id, f.file);
        }
        if (saved.size && filesEpoch() === epoch) moved += strip(v.id, saved);
      }
    } while (again);
  } catch (error) {
    console.warn('[files] migration interrompue', error);
  } finally {
    running = false;
  }
  return moved;
}

/** Ids de fichiers portés par plusieurs pièces jointes (tous véhicules confondus). */
function sharedIds() {
  const seen = new Set();
  const shared = new Set();
  store.vehicles().forEach(v =>
    store.field('docs', v.id).forEach(d =>
      d.files.forEach(f => {
        if (seen.has(f.id)) shared.add(f.id);
        seen.add(f.id);
      })
    )
  );
  return shared;
}

/**
 * Retire la data URL des pièces jointes rangées. Les documents sont relus : ils ont pu changer
 * pendant les copies (seul un fichier au contenu identique à la copie est allégé).
 */
function strip(vehicleId, saved) {
  const current = store.field('docs', vehicleId);
  // Repli sur le contenu (ancien fichier sans id stable, renommé par une relecture) : uniquement vers
  // une copie dont l'id n'est plus dans les documents, et une seule fois — jamais une pièce jointe
  // partagée par deux documents (supprimer l'un effacerait le fichier de l'autre).
  const present = new Set(current.flatMap(d => d.files.map(f => f.id)));
  const byData = new Map([...saved].filter(([id]) => !present.has(id)).map(([id, data]) => [data, id]));
  let count = 0;
  const docs = current.map(d => ({
    ...d,
    files: d.files.map(f => {
      if (!f.file) return f;
      let id = saved.get(f.id) === f.file ? f.id : null;
      if (!id && byData.has(f.file)) {
        id = byData.get(f.file);
        byData.delete(f.file);
      }
      if (!id) return f;
      count++;
      return { id, name: f.name, mime: f.mime };
    })
  }));
  if (count) store.setKeys({ [fieldKey(vehicleId, 'docs')]: docs });
  return count;
}
