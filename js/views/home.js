/* Accueil : cartes des véhicules et vélos, avec la prochaine échéance. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { icon } from '../ui/icons.js';
import { fieldsOf, kmOf, km, photoHtml } from './common.js';

function card(v) {
  const f = fieldsOf(v.id);
  const next = alerts(v, f)[0];
  const pills = isBike(v) ? [v.bikeType, v.bikeSize, v.bikeGroupset, kmOf(v, f) ? km(kmOf(v, f)) : ''] : [v.year, kmOf(v, f) ? km(kmOf(v, f)) : '', v.fuel, v.plate];
  return `<button type="button" class="gcard" data-vehicle="${esc(v.id)}" aria-label="Ouvrir ${esc(v.name)}">
    <div class="gcard__photo">${photoHtml(v, 56)}
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
}
