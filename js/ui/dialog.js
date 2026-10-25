/*
 * Système de modales unifié :
 * - feuille glissante (bottom sheet) sur mobile, boîte centrée sur ordinateur ;
 * - pile de modales (une confirmation peut s'ouvrir au-dessus d'une autre) ;
 * - fermeture par Échap, clic sur le fond ou bouton [data-close] ;
 * - blocage du défilement et restitution du focus.
 * Remplace aussi confirm()/prompt() natifs par des dialogues élégants.
 */
import { esc } from '../core/utils.js';
import { icon } from './icons.js';
import { startWizard } from './wizard.js';
import { buzz, reducedMotion } from './motion.js';

const stack = [];
const ANIMATION_MS = 320;

/* ---------- Ouverture depuis un bouton + (comme Mon budget) ---------- */
const PLUS = '.fab, .add-btn, .home-add__btn';
const SPRING = 'cubic-bezier(.34, 1.5, .64, 1)';
const REVEAL_MS = 560;
const SHRINK_MS = 460;
let lastPlus = null;

/** Bouton + touché à l'instant (Safari ne lui donne pas le focus : on retient le clic). */
function takePlus() {
  const hit = lastPlus && performance.now() - lastPlus.at < 800 ? lastPlus.el : null;
  lastPlus = null;
  return hit?.isConnected && hit.offsetParent ? hit : null;
}

/**
 * Passage bouton ⇄ feuille : la feuille part du bouton (même place, même taille, même couleur,
 * découpée en rond) et s'agrandit jusqu'à sa position.
 */
function morph(sheet, btn) {
  const r = sheet.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const side = Math.min(r.width, r.height);
  const k = Math.max(b.width, b.height) / side;
  const dx = b.left + b.width / 2 - (r.left + r.width / 2);
  const dy = b.top + b.height / 2 - (r.top + r.height / 2);
  const far = Math.ceil(Math.hypot(r.width, r.height) / 2);
  const fill = getComputedStyle(btn).backgroundColor;
  const bg = getComputedStyle(sheet).backgroundColor;
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${k})`, clipPath: `circle(${side / 2}px at 50% 50%)`, backgroundColor: fill },
    { transform: 'none', clipPath: `circle(${far}px at 50% 50%)`, backgroundColor: bg }
  ];
}

/** La feuille s'agrandit à partir du bouton, puis son contenu arrive en cascade. */
function reveal(sheet, from) {
  sheet.animate(morph(sheet, from), { duration: REVEAL_MS, easing: 'cubic-bezier(.3, .9, .2, 1)' });
  [...sheet.children].forEach((n, i) => n.animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 160 + i * 45, easing: 'cubic-bezier(.2, .9, .25, 1)', fill: 'backwards' }));
}

/** Inverse : la feuille se referme dans le bouton, qui rebondit. */
function shrink(sheet, to) {
  [...sheet.children].forEach(n => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
  sheet.animate(morph(sheet, to).reverse(), { duration: SHRINK_MS, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' });
  setTimeout(() => to.animate([{ transform: 'scale(.86)' }, { transform: 'none' }], { duration: 520, easing: SPRING }), SHRINK_MS - 40);
}

function syncLock() {
  document.documentElement.classList.toggle('is-locked', stack.length > 0);
}

export function openSheet(target, { onClose, focus = true } = {}) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  if (stack.some(s => s.el === el)) return;
  const sheet = el.querySelector(':scope > .sheet');
  const from = sheet && !reducedMotion() ? takePlus() : null;
  stack.push({ el, onClose, returnFocus: document.activeElement, from });
  sheet?.getAnimations({ subtree: true }).forEach(a => a.cancel());
  startWizard(el);
  el.classList.toggle('is-reveal', Boolean(from));
  el.hidden = false;
  void el.offsetWidth; // force le reflow pour déclencher la transition
  el.classList.add('is-open');
  if (from) {
    buzz(6);
    reveal(sheet, from);
  }
  syncLock();
  if (focus) {
    const first = el.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button:not([data-close])');
    // Pas d'autofocus sur mobile tactile : le clavier iOS masquerait la feuille.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    setTimeout(() => (touch ? el.querySelector('.sheet')?.focus({ preventScroll: true }) : first?.focus({ preventScroll: true })), 60);
  }
}

export function closeSheet(target) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  const index = stack.findIndex(s => s.el === el);
  if (index === -1) return;
  const [entry] = stack.splice(index, 1);
  const sheet = el.querySelector(':scope > .sheet');
  const into = entry.from?.isConnected && entry.from.offsetParent ? entry.from : null;
  if (into) shrink(sheet, into);
  else el.classList.remove('is-reveal');
  el.classList.remove('is-open');
  setTimeout(() => {
    if (el.classList.contains('is-open')) return;
    el.hidden = true;
    el.classList.remove('is-reveal');
    sheet?.getAnimations({ subtree: true }).forEach(a => a.cancel());
  }, into ? SHRINK_MS : ANIMATION_MS);
  syncLock();
  entry.returnFocus?.focus?.({ preventScroll: true });
  entry.onClose?.();
}

export const isOpen = id => stack.some(s => s.el.id === id);
/** Ferme toutes les fenêtres ouvertes (déconnexion : rien de l'ancien compte au-dessus de l'écran de connexion). */
export function closeAllSheets() {
  while (stack.length) closeSheet(stack[stack.length - 1].el);
}
export const closeTop = () => stack.length && closeSheet(stack[stack.length - 1].el);

export function initDialogs() {
  document.addEventListener('click', e => {
    const el = e.target.closest?.(PLUS);
    lastPlus = el ? { el, at: performance.now() } : null;
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && stack.length) {
      e.preventDefault();
      closeTop();
    }
  });
  document.addEventListener('click', e => {
    const closer = e.target.closest('[data-close]');
    if (closer) {
      closeSheet(closer.closest('.sheet-backdrop'));
      return;
    }
    if (e.target.classList?.contains('sheet-backdrop')) closeSheet(e.target);
  });
}

/* ---------- Dialogues dynamiques ---------- */
function buildDialog(inner) {
  const el = document.createElement('div');
  el.className = 'sheet-backdrop sheet-backdrop--dialog';
  el.hidden = true;
  el.innerHTML = `<div class="sheet sheet--dialog" role="alertdialog" aria-modal="true" tabindex="-1">${inner}</div>`;
  document.body.appendChild(el);
  return el;
}

const dispose = el => setTimeout(() => el.remove(), ANIMATION_MS + 50);

/** Affiche une photo en grand (plein écran, fond sombre, fermeture au clic/Échap). */
export function openPhotoLightbox(src, alt = '') {
  if (!src) return;
  const el = document.createElement('div');
  el.className = 'sheet-backdrop sheet-backdrop--dialog sheet-backdrop--photo';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet sheet--photo" role="dialog" aria-modal="true" tabindex="-1">
      <button type="button" class="icon-btn icon-btn--glass photo-lightbox__close" data-close aria-label="Fermer">${icon('close', 20)}</button>
      <img class="photo-lightbox__img" src="${src}" alt="${esc(alt)}">
    </div>`;
  document.body.appendChild(el);
  openSheet(el, { focus: false, onClose: () => dispose(el) });
}

/**
 * Confirmation asynchrone.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  return new Promise(resolve => {
    let result = false;
    const el = buildDialog(`
      <div class="dialog__icon ${danger ? 'dialog__icon--danger' : ''}">${icon(danger ? 'trash' : 'info', 22)}</div>
      <h2 class="dialog__title">${esc(title)}</h2>
      ${message ? `<p class="dialog__message">${esc(message)}</p>` : ''}
      <div class="dialog__actions">
        <button type="button" class="btn btn--ghost" data-close>${esc(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm>${esc(confirmLabel)}</button>
      </div>`);
    el.querySelector('[data-confirm]').addEventListener('click', () => {
      result = true;
      closeSheet(el);
    });
    openSheet(el, {
      focus: false,
      onClose: () => {
        dispose(el);
        resolve(result);
      }
    });
    setTimeout(() => el.querySelector('[data-confirm]').focus(), 60);
  });
}

/**
 * Saisie de texte asynchrone (remplace prompt()).
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, label = '', value = '', placeholder = '', maxLength = 80, confirmLabel = 'Enregistrer' }) {
  return new Promise(resolve => {
    let result = null;
    const el = buildDialog(`
      <form class="dialog__form" novalidate>
        <h2 class="dialog__title">${esc(title)}</h2>
        <div class="field">
          ${label ? `<label class="field__label" for="prompt-input">${esc(label)}</label>` : ''}
          <input id="prompt-input" class="input" name="value" maxlength="${maxLength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" required>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-close>Annuler</button>
          <button type="submit" class="btn btn--primary">${esc(confirmLabel)}</button>
        </div>
      </form>`);
    const form = el.querySelector('form');
    const input = form.querySelector('input');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      result = v;
      closeSheet(el);
    });
    openSheet(el, {
      focus: false,
      onClose: () => {
        dispose(el);
        resolve(result);
      }
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 80);
  });
}
