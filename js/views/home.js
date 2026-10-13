/* Accueil : cartes des véhicules et vélos, avec la prochaine échéance. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts, currentKm } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { fieldsOf, photoFrame, lineWidth, identity, kmLine } from './common.js';
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

/** Une carte par véhicule dans le carrousel : nom, photo, compteur et les trois échéances les plus proches. La carte entière ouvre la fiche. */
function card(v) {
  const f = fieldsOf(v.id);
  const shown = alerts(v, f).slice(0, 3);
  const sub = identity(v);
  return `<article class="vcard" id="vcard-${esc(v.id)}" data-id="${esc(v.id)}" data-vehicle="${esc(v.id)}">
    <header class="vcard__head">
      <div class="vcard__titles">
        <h2 class="vcard__name"><button type="button" class="vcard__open" data-vehicle="${esc(v.id)}" aria-label="Ouvrir la fiche ${esc(v.name)}">${esc(v.name)}</button></h2>
        ${sub ? `<p class="vcard__sub">${sub}</p>` : ''}
      </div>
      ${photoFrame(v, 'vcard__photo')}
    </header>
    ${kmLine(currentKm(v, f), 'vcard__km', `data-km="${esc(v.id)}"`)}
    ${shown.length
      ? `<ul class="vcard__due">${shown.map(a => `<li><a class="is-${a.level}" href="#/v/${encodeURIComponent(v.id)}/${TAB_OF[a.kind] || ''}">
          <span class="vcard__due-title">${esc(a.title)}</span><em>${esc(a.text)}</em><span class="tick" style="--v:${lineWidth(a)}%"></span></a></li>`).join('')}</ul>`
      : '<p class="vcard__ok">Aucune échéance suivie pour l’instant.</p>'}
  </article>`;
}

/** Marge d'accrochage du carrousel (la carte s'aligne sur la gouttière de la page). */
const pad = rail => parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0;

let current = 0; // carte affichée, conservée d'un rendu à l'autre

function show(i, smooth = true) {
  const rail = $('#vehicleRail');
  const cards = rail.children;
  if (!cards[i]) return;
  rail.scrollTo({ left: cards[i].offsetLeft - pad(rail), behavior: smooth ? 'smooth' : 'auto' });
}

function mark(i) {
  current = i;
  [...$('#vehicleNames').children].forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
}

export function renderHome() {
  const all = store.vehicles();
  const active = all.filter(v => !v.archived);
  const archived = all.filter(v => v.archived);
  const list = [...active.filter(v => !isBike(v)), ...active.filter(isBike)];
  const lateOf = v => alerts(v, fieldsOf(v.id)).some(a => a.level === 'late');
  const rail = $('#vehicleRail');
  $('#homeEmpty').hidden = !!list.length;
  $('#vehicleNames').innerHTML = list.map((v, i) => `<button type="button" data-goto-card="${i}" aria-current="false">${esc(v.name)}${lateOf(v) ? '<span class="dot" aria-label="en retard"></span>' : ''}</button>`).join('');
  rail.innerHTML = list.map(card).join('');
  current = Math.min(current, Math.max(0, list.length - 1));
  mark(current);
  requestAnimationFrame(() => show(current, false));
  $('#archivesLink').hidden = !archived.length;
  if (archived.length) $('#archivesLinkLabel').textContent = `Archives (${archived.length})`;
}

export function initHome() {
  const rail = $('#vehicleRail');
  let raf = 0;
  rail.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const cards = [...rail.children];
      if (!cards.length) return;
      const x = rail.scrollLeft + pad(rail);
      let best = 0;
      cards.forEach((c, i) => { if (Math.abs(c.offsetLeft - x) < Math.abs(cards[best].offsetLeft - x)) best = i; });
      if (best !== current) mark(best);
    });
  }, { passive: true });
  $('#vehicleNames').addEventListener('click', e => {
    const b = e.target.closest('[data-goto-card]');
    if (!b) return;
    const i = Number(b.dataset.gotoCard);
    mark(i);
    show(i);
  });
}
