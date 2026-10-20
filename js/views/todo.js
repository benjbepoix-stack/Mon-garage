/* Liste « À régler » de la page Entretien : un rappel se glisse vers la droite quand c'est fait. */
import { esc } from '../core/utils.js';
import { icon } from '../ui/icons.js';
import { tile, badge } from './alert-ui.js';
import { spring, project, rubberband, velocityTracker, buzz, reducedMotion } from '../ui/motion.js';

const TAB_OF = { reminder: 'maintenance', doc: 'docs', part: 'parts' };

/** Ligne d'échéance ; un rappel se glisse (fait), un document ou un composant s'ouvre au toucher. */
export function row(v, a, swipe) {
  const inner = `${tile(a.title, a.kind, a.level)}
      <span class="row__body"><span class="row__title">${esc(a.title)}</span><span class="row__sub">${esc(a.text)}</span></span>
      ${badge(a.level)}`;
  if (!swipe || a.kind !== 'reminder') {
    return `<button type="button" class="trow" data-goto="${TAB_OF[a.kind] || ''}">${inner}</button>`;
  }
  return `<div class="sw" data-swipe data-vid="${esc(v.id)}" data-rid="${esc(a.id)}">
    <div class="sw__under" aria-hidden="true"><span class="sw__check">${icon('check', 22)}</span><span>C’est fait</span></div>
    <div class="sw__front trow" tabindex="0" role="button" aria-label="${esc(a.title)}, ${esc(v.name)} : noter que c’est fait">${inner}</div>
  </div>`;
}

/** Une seule fois par session : la première ligne glissable s'entrouvre pour montrer le geste. */
export function nudgeOnce() {
  if (reducedMotion()) return;
  try {
    if (sessionStorage.getItem('garage_swipe_nudge')) return;
  } catch {
    return;
  }
  const front = document.querySelector('#todoList .sw__front');
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
/** onDone(vehicleId, reminderId, done(saved)) : ouvre la saisie de l'entretien. */
export function attachSwipe(root, onDone) {
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

