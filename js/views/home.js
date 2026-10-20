/* Accueil « Rappels » : un carrousel des véhicules avec leur anneau « à jour », puis ce qu'il
   reste à régler (tous véhicules confondus). Un rappel se glisse vers la droite quand c'est fait. */
import { $, esc } from '../core/utils.js';
import * as store from '../core/store.js';
import { alerts, currentKm } from '../core/calc.js';
import { isBike } from '../core/schema.js';
import { fieldsOf, photoFrame, identity, kmLine } from './common.js';
import { tile, badge } from './alert-ui.js';
import { icon } from '../ui/icons.js';
import { spring, project, rubberband, velocityTracker, buzz, reducedMotion } from '../ui/motion.js';
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
const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;
const rings = new Map(); // dernier % affiché par véhicule : l'anneau part de là au rendu suivant
let onDone = () => {};
let current = 0; // carte affichée, conservée d'un rendu à l'autre
let list = [];

const ratioOf = all => (all.length ? all.filter(a => a.level === 'ok').length / all.length : 0);

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
  const pct = Math.round(ratioOf(all) * 100);
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
      <div class="ring" role="img" aria-label="${pct} % à jour" data-ring="${esc(v.id)}" data-pct="${all.length ? pct : 0}">
        <svg viewBox="0 0 80 80" aria-hidden="true"><circle class="ring__bg" cx="40" cy="40" r="${RING_R}"/><circle class="ring__fill" cx="40" cy="40" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/></svg>
        <span class="ring__label"><b>${all.length ? pct : '—'}</b>${all.length ? '<small>%</small>' : ''}</span>
      </div>
    </div>
  </article>`;
}

function animateRings() {
  $('#vehicleRail').querySelectorAll('[data-ring]').forEach(el => {
    const id = el.dataset.ring;
    const to = Number(el.dataset.pct);
    const from = rings.has(id) ? rings.get(id) : 0;
    rings.set(id, to);
    const fill = el.querySelector('.ring__fill');
    const label = el.querySelector('.ring__label b');
    const paint = p => {
      fill.style.strokeDashoffset = (RING_C * (1 - Math.max(0, p) / 100)).toFixed(2);
      if (label.textContent !== '—') label.textContent = Math.round(Math.max(0, Math.min(100, p)));
    };
    paint(from);
    if (from !== to) requestAnimationFrame(() => spring(from, to, { response: 0.9, damping: 0.8 }, paint));
  });
}

/** Ligne d'échéance ; un rappel se glisse (fait), un document ou un composant s'ouvre au toucher. */
function row(v, a, swipe) {
  const inner = `${tile(a.title, a.kind, a.level)}
      <span class="row__body"><span class="row__title">${esc(a.title)}</span><span class="row__sub">${esc(`${v.name} · ${a.text}`)}</span></span>
      ${badge(a.level)}`;
  if (!swipe || a.kind !== 'reminder') {
    return `<a class="trow" href="#/v/${encodeURIComponent(v.id)}/${TAB_OF[a.kind] || ''}">${inner}</a>`;
  }
  return `<div class="sw" data-swipe data-vid="${esc(v.id)}" data-rid="${esc(a.id)}">
    <div class="sw__under" aria-hidden="true"><span class="sw__check">${icon('check', 22)}</span><span>C’est fait</span></div>
    <div class="sw__front trow" tabindex="0" role="button" aria-label="${esc(a.title)}, ${esc(v.name)} : noter que c’est fait">${inner}</div>
  </div>`;
}

const pad = rail => parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0;

function show(i, smooth = true) {
  const rail = $('#vehicleRail');
  const cards = rail.children;
  if (!cards[i]) return;
  rail.scrollTo({ left: cards[i].offsetLeft - pad(rail), behavior: smooth ? 'smooth' : 'auto' });
}

/** Véhicule affiché dans le carrousel de l'accueil (pour le bouton +). */
export const shownVehicle = () => list[current] || null;

export function renderHome() {
  const all = store.vehicles();
  const active = all.filter(v => !v.archived);
  list = [...active.filter(v => !isBike(v)), ...active.filter(isBike)];
  const rail = $('#vehicleRail');
  $('#homeEmpty').hidden = !!list.length;
  $('#homeArchives').hidden = !all.some(v => v.archived);
  rail.hidden = !list.length;
  rail.classList.toggle('rail--single', list.length === 1);
  rail.innerHTML = list.map(card).join('');
  current = Math.min(current, Math.max(0, list.length - 1));
  requestAnimationFrame(() => show(current, false));
  animateRings();

  const items = list.flatMap(v => alerts(v, fieldsOf(v.id)).map(a => ({ v, a })));
  const todo = items.filter(x => x.a.level === 'late' || x.a.level === 'soon').sort((x, y) => (x.a.level === y.a.level ? x.a.score - y.a.score : x.a.level === 'late' ? -1 : 1));
  const later = items.filter(x => x.a.level === 'ok').sort((x, y) => y.a.score - x.a.score).slice(0, 5);
  $('#todoSection').hidden = !todo.length;
  $('#todoCount').textContent = todo.length || '';
  $('#todoList').innerHTML = todo.map(x => row(x.v, x.a, true)).join('');
  $('#todoHint').hidden = !todo.some(x => x.a.kind === 'reminder');
  $('#todoCalm').hidden = !list.length || !!todo.length || !items.length;
  $('#laterSection').hidden = !later.length;
  $('#laterList').innerHTML = later.map(x => row(x.v, x.a, false)).join('');
  nudgeOnce();
}

/** Une seule fois par session : la première ligne glissable s'entrouvre pour montrer le geste. */
function nudgeOnce() {
  if (reducedMotion()) return;
  try {
    if (sessionStorage.getItem('garage_swipe_nudge')) return;
  } catch {
    return;
  }
  const front = $('#todoList .sw__front');
  if (!front) return;
  try {
    sessionStorage.setItem('garage_swipe_nudge', '1');
  } catch {
    /* sans mémoire de session */
  }
  setTimeout(() => {
    if (!front.isConnected) return;
    spring(0, 64, { response: 0.45 }, x => (front.style.transform = `translateX(${x}px)`), () =>
      setTimeout(() => spring(64, 0, { response: 0.5, damping: 0.7 }, x => (front.style.transform = `translateX(${x}px)`)), 260));
  }, 700);
}

/* ---------- Glisser « c'est fait » ---------- */
function attachSwipe(root) {
  let sw = null;
  let front = null;
  let x0 = 0;
  let y0 = 0;
  let x = 0;
  let locked = null;
  let stop = () => {};
  const tracker = velocityTracker();
  const paint = (el, f, val) => {
    f.style.transform = `translateX(${val}px)`;
    el.style.setProperty('--p', Math.min(1, Math.max(0, val / (el.clientWidth * 0.35))).toFixed(3));
  };
  const set = val => {
    x = val;
    paint(sw, front, val);
    sw.classList.toggle('is-armed', val > sw.clientWidth * 0.35);
  };

  root.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-swipe]');
    if (!el || el.classList.contains('is-busy') || e.button > 0) return;
    stop();
    sw = el;
    front = el.querySelector('.sw__front');
    x0 = e.clientX;
    y0 = e.clientY;
    locked = null;
    x = 0;
    tracker.reset();
    tracker.push(0);
  });
  root.addEventListener('pointermove', e => {
    if (!sw) return;
    const dx = e.clientX - x0;
    if (locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(e.clientY - y0) < 8) return;
      locked = Math.abs(dx) > Math.abs(e.clientY - y0) ? 'x' : 'y';
      if (locked === 'x') {
        sw.setPointerCapture(e.pointerId);
        sw.classList.add('is-dragging');
      }
    }
    if (locked !== 'x') return;
    const wasArmed = sw.classList.contains('is-armed');
    set(dx < 0 ? rubberband(dx, sw.clientWidth) : dx);
    if (!wasArmed && sw.classList.contains('is-armed')) buzz(8);
    tracker.push(x);
  });
  const end = cancel => {
    if (!sw) return;
    const el = sw;
    const f = front;
    sw = null;
    el.classList.remove('is-dragging');
    if (locked !== 'x') {
      // Simple toucher : on ouvre aussi la saisie.
      if (locked === null && !cancel) commit(el, f, 0);
      return;
    }
    const velocity = cancel ? 0 : tracker.velocity();
    if (!cancel && x > 24 && x + project(velocity) > el.clientWidth * 0.35) commit(el, f, velocity);
    else {
      el.classList.remove('is-armed');
      stop = spring(x, 0, { velocity, response: 0.4 }, val => paint(el, f, val));
    }
  };
  root.addEventListener('pointerup', () => end(false));
  root.addEventListener('pointercancel', () => end(true));
  root.addEventListener('keydown', e => {
    const el = e.target.closest('[data-swipe]');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      commit(el, el.querySelector('.sw__front'), 0);
    }
  });

  function commit(el, f, velocity) {
    el.classList.add('is-busy', 'is-armed');
    buzz(12);
    const at = () => parseFloat(/translateX\(([-\d.]+)px\)/.exec(f.style.transform)?.[1] || 0);
    spring(at(), el.clientWidth * 0.42, { velocity, response: 0.35 }, val => paint(el, f, val));
    onDone(el.dataset.vid, el.dataset.rid, saved => {
      // Enregistré : la liste est redessinée par le store (le rappel quitte « À régler »).
      if (saved || !el.isConnected) return;
      el.classList.remove('is-busy', 'is-armed');
      spring(at(), 0, { response: 0.45 }, val => paint(el, f, val));
    });
  }
}

/** onReminderDone(vehicleId, reminderId, done(saved)) : ouvre la saisie de l'entretien pour ce rappel. */
export function initHome({ onReminderDone } = {}) {
  onDone = onReminderDone || onDone;
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
      current = best;
    });
  }, { passive: true });
  attachSwipe($('#todoList'));
}
