/* Page Garage : les véhicules l'un sous l'autre, avec ce qu'il reste à régler. Toucher une carte ouvre son entretien. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts, currentKm } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { fieldsOf, photoFrame, identity, kmLine } from './common.js';
import { scheduleAlertsSync } from '../services/carnet-sync.js';

/**
 * Résumé des échéances d'un véhicule, pour Carnet (lecture seule) : tout ce
 * qui est en retard ou à moins de 30 jours (8 maximum), avec la date
 * d'échéance quand elle existe (`due`, AAAA-MM-JJ) pour que Carnet puisse
 * l'afficher dans son calendrier et anticiper un rendez-vous. Un véhicule à
 * jour n'a rien à signaler.
 */
function alertsDigest(v, f) {
  const urgent = alerts(v, f).filter(a => a.level === 'late' || a.level === 'soon').slice(0, 8);
  return {
    vehicleId: v.id,
    vehicleName: String(v.name || '').slice(0, 100),
    kind: isBike(v) ? 'bike' : 'vehicle',
    updatedAt: new Date().toISOString(),
    alerts: urgent.map(a => ({ id: a.id, level: a.level, title: a.title, text: a.text, ...(a.due ? { due: a.due } : {}) }))
  };
}

/**
 * Synchronise (best-effort) le résumé des échéances des véhicules actifs vers Carnet,
 * quel que soit l'écran affiché. Les véhicules archivés (vendus, accidentés…) n'y figurent pas.
 */
export function publishAlerts() {
  const active = store.vehicles().filter(v => !v.archived);
  scheduleAlertsSync(Object.fromEntries(active.map(v => [v.id, alertsDigest(v, fieldsOf(v.id))])));
}




function stateLine(all) {
  const due = all.filter(a => a.level !== 'ok').length;
  if (!all.length) return 'Aucune échéance suivie';
  return due ? `${due} chose${due > 1 ? 's' : ''} à régler` : 'Tout est à jour';
}

/** Une carte par véhicule : nom, photo, compteur, état et anneau. La carte ouvre la fiche. */
function card(v) {
  const f = fieldsOf(v.id);
  const all = alerts(v, f);
  const sub = identity(v);
  return `<article class="vcard" id="vcard-${esc(v.id)}" data-id="${esc(v.id)}" data-vehicle="${esc(v.id)}">
    <header class="vcard__head">
      <div class="vcard__titles">
        <h2 class="vcard__name"><button type="button" class="vcard__open" data-vehicle="${esc(v.id)}" aria-label="Ouvrir la fiche ${esc(v.name)}">${esc(v.name)}</button></h2>
        ${sub ? `<p class="vcard__sub">${sub}</p>` : ''}
      </div>
      ${photoFrame(v, 'vcard__photo')}
    </header>
    <div class="vcard__foot">
      <div>
        ${kmLine(currentKm(v, f), 'vcard__km', `data-km="${esc(v.id)}"`)}
        <p class="vcard__state${all.some(a => a.level === 'late') ? ' is-late' : ''}">${esc(stateLine(all))}</p>
      </div>
    </div>
  </article>`;
}

export function renderHome() {
  const all = store.vehicles();
  const active = all.filter(v => !v.archived);
  const list = [...active.filter(v => !isBike(v)), ...active.filter(isBike)];
  const archived = all.length - active.length;
  $('#homeEmpty').hidden = !!list.length;
  $('#homeArchives').hidden = !archived;
  $('#homeArchivesLabel').textContent = `Archives (${archived})`;
  $('#vehicleRail').innerHTML = list.map(card).join('');
}

export function initHome() {}
