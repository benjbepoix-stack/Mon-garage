/* Accueil : cartes des véhicules et vélos, avec la prochaine échéance. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, photoHtml } from './common.js';
import { scheduleAlertsSync } from '../services/carnet-sync.js';

let knownVehicleIds = new Set();

/**
 * Résumé des échéances d'un véhicule, pour le widget en lecture seule de
 * Carnet (3 plus urgentes, retard et bientôt uniquement — un véhicule à
 * jour n'a rien à signaler).
 */
function alertsDigest(v, f) {
  const urgent = alerts(v, f).filter(a => a.level === 'late' || a.level === 'soon').slice(0, 3);
  return {
    vehicleId: v.id,
    vehicleName: String(v.name || '').slice(0, 100),
    kind: isBike(v) ? 'bike' : 'vehicle',
    updatedAt: new Date().toISOString(),
    alerts: urgent.map(a => ({ id: a.id, level: a.level, title: a.title, text: a.text }))
  };
}

/** Synchronise (best-effort) le résumé des échéances de tous les véhicules vers Carnet. */
function syncAlerts(all) {
  const digests = new Map();
  const currentIds = new Set();
  all.forEach(v => {
    currentIds.add(v.id);
    digests.set(v.id, alertsDigest(v, fieldsOf(v.id)));
  });
  knownVehicleIds.forEach(id => {
    if (!currentIds.has(id)) digests.set(id, null); // véhicule supprimé : efface son résumé
  });
  knownVehicleIds = currentIds;
  scheduleAlertsSync(digests);
}

function card(v) {
  const f = fieldsOf(v.id);
  const next = alerts(v, f)[0];
  const hasImg = v.hasPhoto && store.photo(v.id);
  // Juste la marque, le modèle et (pour un véhicule) la plaque : pas d'année, de km ni de carburant ici.
  const sub = [v.brand, v.model, ...(isBike(v) ? [] : [v.plate])].filter(Boolean).join(' · ');
  return `<article class="gcard">
    ${hasImg
      ? `<button type="button" class="gcard__photo has-img" data-photo aria-label="Voir la photo de ${esc(v.name)} en grand">${photoHtml(v, 34)}</button>`
      : `<div class="gcard__photo">${photoHtml(v, 34)}</div>`}
    <button type="button" class="gcard__main" data-vehicle="${esc(v.id)}" aria-label="Ouvrir ${esc(v.name)}">
      <div class="gcard__text">
        <div class="gcard__name">${esc(v.name)}</div>
        ${sub ? `<div class="gcard__sub">${esc(sub)}</div>` : ''}
        ${next ? `<span class="gcard__alert is-${next.level}"><i></i><span>${esc(next.title)} · ${esc(next.text)}</span></span>` : ''}
      </div>
      <span class="gcard__chevron">${icon('chevronRight', 20)}</span>
    </button>
  </article>`;
}

export function renderHome() {
  const all = store.vehicles();
  const active = all.filter(v => !v.archived);
  const archived = all.filter(v => v.archived);
  const cars = active.filter(v => !isBike(v));
  const bikes = active.filter(isBike);
  $('#vehicleCount').textContent = cars.length;
  $('#bikeCount').textContent = bikes.length;
  $('#vehicleCards').innerHTML = cars.length ? cars.map(card).join('') : '<div class="empty-card">Aucun véhicule dans ton garage.</div>';
  $('#bikeCards').innerHTML = bikes.length ? bikes.map(card).join('') : '<div class="empty-card">Aucun vélo dans ton garage.</div>';
  $('#archivesLink').hidden = !archived.length;
  if (archived.length) $('#archivesLinkLabel').textContent = `Archives (${archived.length})`;
  // Les véhicules archivés (vendus, accidentés…) ne remontent pas d'échéances vers Carnet.
  syncAlerts(active);
}
