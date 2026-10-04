/* Thème clair / sombre et style graphique (réglés depuis la feuille Réglages), avec transition fluide et barre d'état iOS assortie. */
import { $, $$ } from '../core/utils.js';

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
}

/** Coche le thème actif dans la feuille Réglages. */
export function renderThemeSwitch(theme) {
  const el = $('#themeSwitch');
  if (!el) return;
  $$('input[name="theme"]', el).forEach(r => (r.checked = r.value === theme));
}

/** Sélecteur de style graphique (feuille Réglages). */
export function renderStylePicker(styles, current) {
  const el = $('#stylePicker');
  if (!el) return;
  el.innerHTML = styles.map(x => `<button type="button" class="style-chip" data-style-pick="${x.id}" aria-pressed="${x.id === current}">
    <span class="style-chip__swatch style-chip__swatch--${x.id}"></span>
    <span class="style-chip__text"><strong>${x.name}</strong><small>${x.hint}</small></span>
  </button>`).join('');
}
