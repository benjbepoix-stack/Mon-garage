/*
 * Thème Auto / Sombre / Clair et style graphique (réglés depuis la feuille
 * Réglages), avec transition fluide et barre d'état iOS assortie. « Auto » suit
 * le réglage clair / sombre de l'appareil, en direct ; data-theme vaut
 * toujours dark ou light (le CSS ne connaît que ces deux valeurs).
 */
import { $, $$ } from '../core/utils.js';

const BAR_COLORS = { dark: '#16171c', light: '#f4f4f7' };
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
let choice = 'auto';
let currentStyle = 'acier';

/** auto → dark ou light selon l'appareil. */
export const resolveTheme = theme => (theme === 'dark' || theme === 'light' ? theme : media?.matches ? 'light' : 'dark');

export function applyTheme(theme, style, { animate = false } = {}) {
  choice = theme;
  currentStyle = style;
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  if (animate && root.dataset.theme !== resolved) {
    root.classList.add('theme-transition');
    setTimeout(() => root.classList.remove('theme-transition'), 450);
  }
  root.dataset.theme = resolved;
  root.dataset.style = style;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLORS[resolved]);
}

// Choix « Auto » : bascule en même temps que l'appareil (mode sombre automatique le soir…).
media?.addEventListener?.('change', () => {
  if (choice === 'auto') applyTheme(choice, currentStyle, { animate: true });
});

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
