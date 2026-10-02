/* Thème clair / sombre et style graphique, avec transition fluide et barre d'état iOS assortie. */
import { $ } from '../core/utils.js';
import { icon } from './icons.js';

export function applyTheme(theme, style, { animate = false } = {}) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-transition');
    setTimeout(() => root.classList.remove('theme-transition'), 450);
  }
  root.dataset.theme = theme;
  root.dataset.style = style;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  const btn = $('#themeToggle');
  if (btn) {
    const light = theme === 'light';
    btn.innerHTML = icon(light ? 'moon' : 'sun', 20);
    btn.setAttribute('aria-label', light ? 'Activer le mode sombre' : 'Activer le mode clair');
  }
}

/** Sélecteur de style graphique (accueil). */
export function renderStylePicker(styles, current) {
  const el = $('#stylePicker');
  if (!el) return;
  el.innerHTML = styles.map(x => `<button type="button" class="style-chip" data-style-pick="${x.id}" aria-pressed="${x.id === current}">
    <span class="style-chip__swatch style-chip__swatch--${x.id}"></span>
    <span class="style-chip__text"><strong>${x.name}</strong><small>${x.hint}</small></span>
  </button>`).join('');
}
