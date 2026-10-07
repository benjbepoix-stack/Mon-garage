/*
 * Factures jointes à un entretien ou à une autre dépense : elles sont rangées
 * automatiquement dans l'onglet Documents, sous forme d'un document « Facture »
 * relié à sa saisie d'origine (`sourceId`). Une seule source de vérité : les
 * fichiers vivent dans le document, le formulaire d'entretien ou de dépense
 * ne fait que l'alimenter.
 */
import { makeId } from '../core/schema.js';
import { formatKey } from '../core/dates.js';

export const SOURCE_LABEL = { maintenance: 'Entretien', expense: 'Dépense' };

export const linkedDoc = (docs, sourceId) => (sourceId ? docs.find(d => d.sourceId === sourceId) || null : null);

/**
 * Liste des documents après enregistrement d'une saisie et de ses pièces jointes.
 * - fichiers joints : document « Facture » créé ou mis à jour (libellé = saisie + date) ;
 * - plus aucun fichier : le document relié est retiré, sauf s'il porte une
 *   information ajoutée à la main depuis l'onglet Documents (échéance, note) —
 *   il est alors conservé, sans pièce jointe.
 */
export function withLinkedDoc(docs, { source, sourceId, title, date, files }) {
  const existing = linkedDoc(docs, sourceId);
  const label = `${title} — ${formatKey(date, { day: 'numeric', month: 'short', year: 'numeric' })}`.slice(0, 120);
  if (files.length) {
    const doc = existing
      ? { ...existing, label, files }
      : { id: makeId(), type: 'Facture', label, expiry: '', note: '', files, source, sourceId };
    return existing ? docs.map(d => (d === existing ? doc : d)) : [...docs, doc];
  }
  if (!existing) return docs;
  if (existing.expiry || existing.note) return docs.map(d => (d === existing ? { ...existing, files: [] } : d));
  return docs.filter(d => d !== existing);
}

/** Documents après suppression de la saisie d'origine : la facture reliée part avec elle. */
export const withoutLinkedDoc = (docs, sourceId) => docs.filter(d => d.sourceId !== sourceId);
