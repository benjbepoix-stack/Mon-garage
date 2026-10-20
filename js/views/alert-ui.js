/* Petits éléments partagés par les échéances : icône selon le sujet, pastille d'état. */
import { esc } from '../core/utils.js';
import { icon } from '../ui/icons.js';
import { LEVEL_LABEL } from './common.js';

const KEYWORDS = [
  [/vidange|huile|carbu|plein/i, 'fuel'],
  [/pneu|frein|plaquette|disque|pression/i, 'gauge'],
  [/batter|recharge|électri|bougie/i, 'bolt'],
  [/contr[ôo]le|assurance|carte grise|permis|vignette|crit/i, 'doc'],
  [/cha[iî]ne|cassette|dérailleur|vélo/i, 'bike']
];

/** Nom de l'icône d'une échéance ou d'un entretien d'après son intitulé. */
export function alertIconName(title, kind) {
  if (kind === 'doc') return 'doc';
  if (kind === 'part') return 'bike';
  return KEYWORDS.find(([re]) => re.test(title || ''))?.[1] || 'wrench';
}

export const alertIcon = (title, kind, size = 18) => icon(alertIconName(title, kind), size);

/** Pastille carrée avec l'icône (couleur selon l'état). */
export const tile = (title, kind, level = '') => `<span class="tile${level ? ` is-${level}` : ''}" aria-hidden="true">${alertIcon(title, kind, 20)}</span>`;

export const badge = level => `<span class="badge is-${level}">${esc(LEVEL_LABEL[level] || '')}</span>`;
