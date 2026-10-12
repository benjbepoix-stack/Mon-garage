/* Accueil : cartes des véhicules et vélos, avec la prochaine échéance. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts, currentKm } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, photoHtml } from './common.js';
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

const TAB_OF = { reminder: 'maintenance', doc: 'docs', part: 'parts' };
const count = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const kmLabel = n => `${Math.round(n).toLocaleString('fr-FR')} km`;

/** Une ligne par véhicule : vignette, nom, marque / modèle, kilométrage et état en bout de ligne. */
function row(v) {
  const f = fieldsOf(v.id);
  const urgent = alerts(v, f).filter(a => a.level === 'late' || a.level === 'soon');
  const late = urgent.filter(a => a.level === 'late').length;
  const hasImg = v.hasPhoto && store.photo(v.id);
  // Juste la marque, le modèle et (pour un véhicule) la plaque : pas d'année ni de carburant ici.
  const sub = [v.brand, v.model, ...(isBike(v) ? [] : [v.plate])].filter(Boolean).join(' ');
  const km = currentKm(v, f);
  const state = late ? `<span class="vrow__state is-late">${count(late, 'en retard', 'en retard')}</span>`
    : urgent.length ? `<span class="vrow__state is-soon">${count(urgent.length, 'à prévoir', 'à prévoir')}</span>`
    : '<span class="vrow__state">À jour</span>';
  return `<li class="vrow">
    ${hasImg
      ? `<button type="button" class="vrow__photo has-img" data-photo aria-label="Voir la photo de ${esc(v.name)} en grand">${photoHtml(v, 22)}</button>`
      : `<span class="vrow__photo" aria-hidden="true">${photoHtml(v, 22)}</span>`}
    <button type="button" class="vrow__main" data-vehicle="${esc(v.id)}" aria-label="Ouvrir ${esc(v.name)}">
      <span class="vrow__text">
        <span class="vrow__name">${esc(v.name)}</span>
        ${sub ? `<span class="vrow__sub">${esc(sub)}</span>` : ''}
      </span>
      <span class="vrow__end">
        ${km ? `<span class="vrow__km">${kmLabel(km)}</span>` : ''}
        ${state}
      </span>
    </button>
  </li>`;
}

/** Échéances en retard ou proches, tous véhicules actifs confondus, les plus urgentes d'abord. */
function dueList(active) {
  const order = { late: 0, soon: 1 };
  return active
    .flatMap(v => alerts(v, fieldsOf(v.id)).filter(a => a.level in order).map(a => ({ ...a, vehicle: v })))
    .sort((a, b) => order[a.level] - order[b.level] || a.score - b.score);
}

function renderSummary(active, watch) {
  const late = watch.filter(a => a.level === 'late');
  const soon = watch.length - late.length;
  const level = !active.length ? 'empty' : late.length ? 'late' : soon ? 'soon' : 'ok';
  const title = {
    empty: 'Votre garage est vide.',
    late: `${count(late.length, 'échéance', 'échéances')} en retard.`,
    soon: `${count(soon, 'échéance', 'échéances')} à prévoir.`,
    ok: 'Tout est à jour.'
  }[level];
  const names = [...new Set(watch.map(a => a.vehicle.name))];
  const sub = {
    empty: 'Ajoutez un véhicule ou un vélo pour suivre son entretien.',
    late: `Concerne ${names.join(', ')}.${soon ? ` ${count(soon, 'autre échéance arrive', 'autres échéances arrivent')} sous 30 jours.` : ''}`,
    soon: `Concerne ${names.join(', ')}, sous 30 jours.`,
    ok: 'Rien à prévoir dans les 30 prochains jours.'
  }[level];
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#summary').dataset.level = level;
  $('#summaryDate').textContent = today.charAt(0).toUpperCase() + today.slice(1);
  $('#summaryTitle').textContent = title;
  $('#summarySub').textContent = sub;

  const shown = watch.slice(0, 5);
  $('#dueSection').hidden = !shown.length;
  $('#dueList').innerHTML = shown.map(a => `<li><a class="watch" href="#/v/${encodeURIComponent(a.vehicle.id)}/${TAB_OF[a.kind] || ''}">
      <span class="watch__text"><span class="watch__title">${esc(a.title)}</span><span class="watch__vehicle">${esc(a.vehicle.name)}</span></span>
      <span class="watch__when is-${a.level}">${esc(a.text)}</span>
    </a></li>`).join('');
  $('#dueMore').hidden = watch.length <= shown.length;
  $('#dueMore').textContent = `Et ${count(watch.length - shown.length, 'autre', 'autres')}, dans les fiches.`;
}

export function renderHome() {
  const all = store.vehicles();
  const active = all.filter(v => !v.archived);
  const archived = all.filter(v => v.archived);
  const cars = active.filter(v => !isBike(v));
  const bikes = active.filter(isBike);
  renderSummary(active, dueList(active));
  $('#vehicleCount').textContent = cars.length;
  $('#bikeCount').textContent = bikes.length;
  $('#vehicleCards').innerHTML = cars.length ? cars.map(row).join('') : '<li class="vlist__empty">Aucun véhicule pour l’instant.</li>';
  $('#bikeCards').innerHTML = bikes.length ? bikes.map(row).join('') : '<li class="vlist__empty">Aucun vélo pour l’instant.</li>';
  $('#archivesLink').hidden = !archived.length;
  if (archived.length) $('#archivesLinkLabel').textContent = `Archives (${archived.length})`;
}
