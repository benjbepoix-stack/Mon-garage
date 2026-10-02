/* Accueil : cartes des véhicules et vélos, avec la prochaine échéance. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, kmOf, km, photoHtml } from './common.js';
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
  const pills = isBike(v) ? [v.bikeType, v.bikeSize, v.bikeGroupset, kmOf(v, f) ? km(kmOf(v, f)) : ''] : [v.year, kmOf(v, f) ? km(kmOf(v, f)) : '', v.fuel, v.plate];
  return `<button type="button" class="gcard" data-vehicle="${esc(v.id)}" aria-label="Ouvrir ${esc(v.name)}">
    <div class="gcard__photo${v.hasPhoto && store.photo(v.id) ? ' has-img' : ''}">${photoHtml(v, 56, { full: true })}
      ${next ? `<span class="gcard__alert is-${next.level}"><i></i><span>${esc(next.title)} · ${esc(next.text)}</span></span>` : ''}
    </div>
    <div class="gcard__body">
      <div class="gcard__text">
        <div class="gcard__name">${esc(v.name)}</div>
        ${v.brand || v.model ? `<div class="gcard__sub">${esc([v.brand, v.model].filter(Boolean).join(' · '))}</div>` : ''}
        ${pills.some(Boolean) ? `<div class="gcard__pills">${pills.filter(Boolean).map(p => `<span class="pill">${esc(p)}</span>`).join('')}</div>` : ''}
      </div>
      <span class="gcard__chevron">${icon('chevronRight', 20)}</span>
    </div>
  </button>`;
}

export function renderHome() {
  const all = store.vehicles();
  const cars = all.filter(v => !isBike(v));
  const bikes = all.filter(isBike);
  $('#vehicleCount').textContent = cars.length;
  $('#bikeCount').textContent = bikes.length;
  $('#vehicleCards').innerHTML = cars.length ? cars.map(card).join('') : '<div class="empty-card">Aucun véhicule dans ton garage.</div>';
  $('#bikeCards').innerHTML = bikes.length ? bikes.map(card).join('') : '<div class="empty-card">Aucun vélo dans ton garage.</div>';
  syncAlerts(all);
}
