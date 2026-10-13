/*
 * Formulaires en questions : un formulaire marqué data-wizard est découpé en pages.
 * Chaque `.wz-step` est une question (data-q) ; les questions consécutives d'un même
 * data-group partagent une page (« petites étapes »), sans data-group elles ont chacune
 * la leur (« une question par écran »). Une dernière page récapitule les réponses,
 * avec « Modifier » sur chaque ligne, et porte le bouton Enregistrer (le submit
 * d'origine du formulaire, validation comprise, reste inchangé).
 *
 * Attributs d'une question :
 * - data-q : la question affichée en titre ; data-r : libellé court du récapitulatif ;
 * - data-optional : bouton « Passer » tant qu'elle est vide ;
 * - data-chips : les choix d'un <select> (ou d'une <datalist>) deviennent des boutons ;
 * - data-auto : en page seule, toucher un choix passe à la suite ;
 * - data-quick="today,yesterday" / "1y,2y" : raccourcis de date.
 * Une question masquée par l'appli (attribut hidden, ex. data-kind, data-loan) est sautée.
 */
import { esc } from '../core/utils.js';
import { todayKey, formatKey } from '../core/dates.js';

const QUICK = {
  today: ['Aujourd’hui', () => todayKey()],
  yesterday: ['Hier', () => shift({ days: -1 })],
  '1y': ['Dans 1 an', () => shift({ months: 12 })],
  '2y': ['Dans 2 ans', () => shift({ months: 24 })]
};

function shift({ days = 0, months = 0 }) {
  const d = new Date(`${todayKey()}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Masqué par l'appli entre l'élément et la question (le fond de la feuille, encore caché à l'ouverture, ne compte pas). */
function hiddenWithin(el, step) {
  for (let n = el; n && n !== step.parentElement; n = n.parentElement) if (n.hidden) return true;
  return false;
}

const controls = step => [...step.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(el => !hiddenWithin(el, step));
const isActive = step => !step.hidden && controls(step).length > 0;

/** Réponse lisible d'une question, pour le récapitulatif. */
function answer(step) {
  const parts = [];
  controls(step).forEach(el => {
    if (el.type === 'file') {
      const list = el.closest('.field, .wz-step').querySelector('[id$="FilesList"]');
      const n = list ? list.children.length : 0;
      const img = step.querySelector('img:not([hidden])[src]');
      if (n) parts.push(n > 1 ? `${n} fichiers` : '1 fichier');
      else if (img) parts.push('Ajoutée');
      return;
    }
    if (el.type === 'radio') return;
    if (el.type === 'checkbox') {
      if (el.checked) parts.push(el.closest('label')?.textContent.trim() || 'Oui');
      return;
    }
    if (el.tagName === 'SELECT') {
      if (el.value) parts.push(el.selectedOptions[0]?.textContent.trim() || el.value);
      return;
    }
    if (!el.value) return;
    if (el.type === 'date') parts.push(formatKey(el.value, { day: 'numeric', month: 'short', year: 'numeric' }));
    else parts.push(`${el.value}${el.dataset.unit ? ` ${el.dataset.unit}` : ''}`);
  });
  return parts.join(' · ');
}

const isEmpty = step => !answer(step);

function setup(form) {
  const sheet = form.closest('.sheet');
  const steps = [...form.querySelectorAll(':scope > .wz-step')];
  [...form.children].forEach(el => {
    if (!el.classList.contains('wz-step') && !(el.tagName === 'INPUT' && el.type === 'hidden')) el.classList.add('wz-tail');
  });
  steps.forEach(step => {
    step.insertAdjacentHTML('afterbegin', `<h3 class="wz-q">${esc(step.dataset.q || '')}</h3>`);
    if (step.querySelectorAll('.field').length <= 1) step.classList.add('wz-solo');
    if (step.dataset.chips !== undefined) step.querySelector('select, input[list]')?.insertAdjacentHTML('afterend', '<div class="wz-chips"></div>');
    if (step.dataset.quick) {
      const input = step.querySelector('input[type=date]');
      input?.insertAdjacentHTML('beforebegin', `<div class="wz-chips wz-chips--quick">${step.dataset.quick.split(',').map(k => `<button type="button" class="wz-chip" data-quick="${k}">${QUICK[k][0]}</button>`).join('')}</div>`);
    }
  });

  const progress = document.createElement('div');
  progress.className = 'wz-bar';
  sheet.querySelector('.sheet__head').after(progress);
  const head = document.createElement('div');
  head.className = 'wz-head';
  form.prepend(head);
  const recap = document.createElement('div');
  recap.className = 'wz-recap';
  steps[steps.length - 1].after(recap); // avant les boutons Archiver / Supprimer
  const foot = document.createElement('div');
  foot.className = 'wz-foot';
  foot.innerHTML = `<button type="button" class="btn btn--ghost wz-back">Retour</button>
    <button type="button" class="link-btn wz-skip">Passer</button>
    <button type="button" class="btn btn--primary wz-next">Suivant</button>
    <button type="submit" class="btn btn--primary wz-save">Enregistrer</button>`;
  form.append(foot);

  let page = 0;
  let backToRecap = false; // arrivé depuis « Modifier » du récapitulatif : Suivant y ramène directement
  const pages = () => {
    const out = [];
    steps.filter(isActive).forEach(s => {
      const last = out[out.length - 1];
      if (last && s.dataset.group && last[0].dataset.group === s.dataset.group) last.push(s);
      else out.push([s]);
    });
    return out;
  };

  function chips(step) {
    const box = step.querySelector('.wz-chips:not(.wz-chips--quick)');
    if (!box) return;
    const src = step.querySelector('select, input[list]');
    const opts = src.tagName === 'SELECT'
      ? [...src.options].filter(o => o.value !== '').map(o => [o.value, o.textContent.trim()])
      : [...(src.list?.options || [])].map(o => [o.value, o.value]);
    box.innerHTML = opts.map(([v, t]) => `<button type="button" class="wz-chip" data-value="${esc(v)}" aria-pressed="${src.value === v}">${esc(t)}</button>`).join('');
  }

  function render() {
    const P = pages();
    const total = P.length + 1;
    page = Math.max(0, Math.min(page, P.length));
    const onRecap = page === P.length;
    const current = onRecap ? [] : P[page];
    form.classList.toggle('is-recap', onRecap);
    steps.forEach(s => s.classList.toggle('wz-on', current.includes(s)));
    const grouped = current.length > 1 || Boolean(current[0]?.dataset.group);
    form.classList.toggle('wz-grouped', grouped);
    head.innerHTML = onRecap
      ? `<p class="wz-kicker">Récapitulatif</p>`
      : grouped
        ? `<p class="wz-kicker">Étape ${page + 1} sur ${P.length}</p><h3 class="wz-title">${esc(current[0].dataset.group)}</h3>`
        : '';
    current.forEach(chips);
    if (onRecap) {
      recap.innerHTML = `<dl class="wz-list">${P.flat()
        .map(s => `<div><dt>${esc(s.dataset.r || s.dataset.q)}</dt><dd>${esc(answer(s) || '—')}</dd><button type="button" class="wz-edit" data-goto="${steps.indexOf(s)}" aria-label="Modifier : ${esc(s.dataset.r || s.dataset.q)}">Modifier</button></div>`)
        .join('')}</dl>`;
    }
    progress.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i <= page ? 'on' : ''}"></i>`).join('');
    foot.querySelector('.wz-back').hidden = page === 0;
    foot.querySelector('.wz-next').hidden = onRecap;
    foot.querySelector('.wz-next').textContent = backToRecap ? 'OK' : 'Suivant';
    foot.querySelector('.wz-save').hidden = !onRecap;
    foot.querySelector('.wz-skip').hidden = onRecap || !current.every(s => s.dataset.optional !== undefined && isEmpty(s));
    form.scrollTop = 0;
  }

  const go = delta => {
    if (delta > 0 && backToRecap) page = pages().length;
    else page += delta;
    if (page >= pages().length) backToRecap = false;
    render();
    // Clavier : premier champ de la page, sauf sur écran tactile (le clavier masquerait la feuille).
    if (!window.matchMedia('(pointer: coarse)').matches) form.querySelector('.wz-on input:not([type=hidden]):not([type=file]):not([type=checkbox]), .wz-on textarea')?.focus({ preventScroll: true });
  };

  form.addEventListener('wizard:start', () => {
    // Modification (ou fiche déjà remplie, comme l'achat) : on ouvre sur le récapitulatif.
    const edit = form.elements.editId
      ? Boolean(form.elements.editId.value)
      : [...form.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])')].some(i => i.value);
    page = edit ? pages().length : 0;
    backToRecap = false;
    render();
  });
  // Entrée dans un champ : page suivante (le vrai envoi n'a lieu que depuis le récapitulatif).
  form.addEventListener('submit', e => {
    if (!form.classList.contains('is-recap')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      go(1);
      return;
    }
    // Erreur de validation : retour à la page de la question concernée.
    setTimeout(() => {
      const bad = form.querySelector('[aria-invalid="true"]');
      const step = bad?.closest('.wz-step');
      if (!step) return;
      page = pages().findIndex(p => p.includes(step));
      backToRecap = true;
      render();
      bad.focus({ preventScroll: true });
    });
  }, true);
  foot.addEventListener('click', e => {
    if (e.target.closest('.wz-back')) {
      backToRecap = false;
      go(-1);
    }
    else if (e.target.closest('.wz-next, .wz-skip')) go(1);
  });
  form.addEventListener('click', e => {
    const chip = e.target.closest('.wz-chip');
    if (chip) {
      const step = chip.closest('.wz-step');
      if (chip.dataset.quick) {
        const input = step.querySelector('input[type=date]');
        input.value = QUICK[chip.dataset.quick][1]();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const src = step.querySelector('select, input[list]');
        src.value = chip.dataset.value;
        src.dispatchEvent(new Event('input', { bubbles: true }));
        src.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const P = pages();
      if (step.dataset.auto !== undefined && P[page]?.length === 1) go(1);
      else render();
      return;
    }
    const edit = e.target.closest('.wz-edit');
    if (edit) {
      const step = steps[Number(edit.dataset.goto)];
      page = pages().findIndex(p => p.includes(step));
      backToRecap = true;
      render();
    }
  });
  // Une réponse saisie fait disparaître « Passer » ; un choix qui change les questions suivantes (financement) met les pages à jour.
  form.addEventListener('input', () => {
    const current = pages()[page] || [];
    foot.querySelector('.wz-skip').hidden = form.classList.contains('is-recap') || !current.every(s => s.dataset.optional !== undefined && isEmpty(s));
  });
  form.addEventListener('change', e => {
    if (e.target.matches('input[type=file], input[type=checkbox]')) setTimeout(render);
  });
}

export function initWizards() {
  document.querySelectorAll('form[data-wizard]').forEach(setup);
}

/** À appeler une fois le formulaire rempli, juste avant d'ouvrir sa feuille (voir openSheet). */
export function startWizard(root) {
  root.querySelectorAll('form[data-wizard]').forEach(f => f.dispatchEvent(new Event('wizard:start')));
}
