/*
 * Compteur et « route » de la fiche : les chiffres du compteur défilent comme un
 * vrai totaliseur, et les prochains entretiens au kilomètre sont des panneaux
 * posés sur la route, à leur kilométrage. La route se fait glisser au doigt ;
 * une mise à jour du compteur fait avancer la voiture vers les panneaux.
 */
import { esc } from '../core/utils.js';
import { reminderStatus, partStatus } from '../core/calc.js';
import { icon } from '../ui/icons.js';
import { spring, project, rubberband, velocityTracker, buzz, reducedMotion } from '../ui/motion.js';
import { intFmt } from './common.js';
import { alertIcon } from './alert-ui.js';

const DIGIT_H = 1; // hauteur d'un chiffre, en em (voir .odo__col span)
const CAR_X = 56; // position de la voiture dans la piste au départ (px)
let pending = null; // { id, from } : compteur à faire défiler au prochain rendu de ce véhicule

/** À appeler juste avant d'enregistrer un nouveau relevé : le prochain rendu anime from → nouveau compteur. */
export function queueKmRoll(id, from) {
  pending = { id, from };
}

/** Panneaux : rappels au kilomètre (prochaine échéance) et, pour un vélo, usure des composants. */
function signsOf(v, f, km) {
  const out = [];
  f.reminders.forEach(r => {
    const s = reminderStatus(r, v, km);
    if (s.nextKm !== null && s.level !== 'unknown') out.push({ km: s.nextKm, title: r.label, level: s.level });
  });
  f.parts.forEach(p => {
    if (!p.limitKm) return;
    const s = partStatus(p, km);
    out.push({ km: (p.installedKm || 0) + p.limitKm, title: p.name, level: s.level });
  });
  return out.sort((a, b) => a.km - b.km);
}

const LANE_H = 38; // hauteur d'un étage de panneaux (pastille + marge)
const LABEL_GAP = 10; // espace minimal entre deux pastilles d'un même étage
const ROAD_H = 44;

/**
 * Range les panneaux en étages sans aucun chevauchement : chaque pastille va sur le
 * plus bas étage où elle tient (sa largeur réelle est mesurée), la route descend
 * d'autant d'étages. Les kilométrages trop proches sous la route ne sont écrits qu'une fois.
 */
function layoutSigns(road, track) {
  const els = [...track.querySelectorAll('.road__sign')];
  const lanes = []; // bord droit occupé, par étage (0 = juste au-dessus de la route)
  const placed = els.map(el => {
    const x = parseFloat(el.style.left);
    const w = el.querySelector('.road__label').offsetWidth;
    let lane = lanes.findIndex(right => right + LABEL_GAP <= x - w / 2);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = x + w / 2;
    return { el, x, lane };
  });
  const n = Math.max(1, lanes.length);
  const asphalt = n * LANE_H + 14;
  let lastTick = -Infinity;
  placed.forEach(({ el, x, lane }) => {
    const top = (n - 1 - lane) * LANE_H;
    el.style.top = `${top}px`;
    el.querySelector('.road__pole').style.height = `${asphalt - top - 30}px`;
    const tick = el.querySelector('.road__tick');
    tick.style.top = `${asphalt + ROAD_H + 6 - top}px`;
    tick.hidden = x - lastTick < 56;
    if (!tick.hidden) lastTick = x;
  });
  road.style.height = `${asphalt + ROAD_H + 26}px`;
  track.querySelector('.road__asphalt').style.top = `${asphalt}px`;
  track.querySelector('.road__car').style.top = `${asphalt}px`;
}

export function odometerHtml(n) {
  const digits = String(Math.max(0, Math.round(n))).split('');
  return digits
    .map((_, i) => {
      const fromRight = digits.length - 1 - i;
      const gap = i > 0 && fromRight % 3 === 2 ? ' odo__col--gap' : '';
      return `<span class="odo__col${gap}" aria-hidden="true">${Array.from({ length: 11 }, (_, k) => `<span>${k % 10}</span>`).join('')}</span>`;
    })
    .join('');
}

/** Place chaque colonne : seule la dernière roule en continu, les autres tournent quand la précédente passe de 9 à 0. */
function drawOdometer(box, value) {
  const cols = box.querySelectorAll('.odo__col');
  const n = cols.length;
  cols.forEach((col, i) => {
    const place = 10 ** (n - 1 - i);
    const below = value % place;
    const pos = place === 1 ? value % 10 : (Math.floor(value / place) % 10) + Math.max(0, below - (place - 1));
    col.style.transform = `translateY(${-pos * DIGIT_H}em)`;
  });
}

export function heroRoadHtml(v, f, km) {
  const signs = signsOf(v, f, km);
  return `
    <div class="odo" aria-label="${esc(intFmt(km))} km"><span class="odo__digits">${odometerHtml(Math.max(km, pending?.id === v.id ? km : 0))}</span><small>km</small></div>
    ${signs.length ? `<div class="road" data-road><div class="road__track"><div class="road__asphalt"></div><div class="road__car">${icon(v.kind === 'bike' ? 'bike' : 'car', 22)}</div></div></div>
    <p class="road__look" data-road-look></p>` : ''}
    <form class="kmform" data-kmform novalidate>
      <input class="input" name="km" inputmode="numeric" autocomplete="off" placeholder="Nouveau kilométrage" aria-label="Nouveau kilométrage au compteur">
      <button type="submit" class="btn btn--primary">Valider</button>
    </form>
    <p class="kmform__err" data-kmerr role="alert"></p>`;
}

/**
 * Branche le compteur, la route et le champ de relevé d'une fiche déjà rendue.
 * onSubmit(value) enregistre le relevé (validation faite ici).
 */
export function mountRoad(hero, v, f, km, onSubmit) {
  const odo = hero.querySelector('.odo__digits');
  const road = hero.querySelector('[data-road]');
  const form = hero.querySelector('[data-kmform]');
  const err = hero.querySelector('[data-kmerr]');
  const input = form.elements.km;
  const roll = pending?.id === v.id && pending.from < km ? pending.from : null;
  pending = null;

  let scale = 0.05;
  let start = km;
  let offset = 0;
  let carKm = roll ?? km;
  let track;
  let car;
  let look;
  let signs = [];

  const toX = k => CAR_X + (k - start) * scale;
  const minOffset = () => Math.min(0, -(toX(signs[signs.length - 1]?.km ?? km) + 110 - road.clientWidth));

  function setOffset(x) {
    offset = x;
    track.style.transform = `translateX(${x}px)`;
    updateLook();
  }

  function updateLook() {
    if (!look) return;
    const center = -offset + road.clientWidth * 0.55;
    let best = null;
    signs.forEach(s => {
      if (s.km <= carKm) return;
      if (!best || Math.abs(toX(s.km) - center) < Math.abs(toX(best.km) - center)) best = s;
    });
    road.querySelectorAll('.road__sign').forEach(el => el.classList.toggle('is-near', best && Number(el.dataset.km) === best.km && el.dataset.title === best.title));
    const behind = signs.filter(s => s.km <= carKm);
    if (best) look.innerHTML = `<b>${esc(best.title)}</b> dans ${esc(intFmt(best.km - carKm))} km`;
    else if (behind.length) look.innerHTML = `<b>${esc(behind[behind.length - 1].title)}</b> : kilométrage dépassé`;
    else look.textContent = '';
  }

  if (road) {
    track = road.querySelector('.road__track');
    car = road.querySelector('.road__car');
    look = hero.querySelector('[data-road-look]');
    signs = signsOf(v, f, km);
    // Échelle : le premier panneau devant la voiture arrive vers le milieu de la route.
    const width = road.clientWidth || 320;
    const ahead = signs.find(s => s.km > km);
    const gap = ahead ? ahead.km - km : 2000;
    scale = Math.max(0.004, Math.min(0.6, (width * 0.55 - CAR_X) / Math.max(200, gap)));
    start = Math.min(km, ...signs.map(s => s.km), roll ?? km);
    // Panneaux en retard derrière la voiture : on garde un peu de recul pour les voir.
    if (start < km) start = Math.max(start, km - (CAR_X - 8) / scale);
    track.insertAdjacentHTML('beforeend', signs.map(s => `<div class="road__sign is-${s.level}" style="left:${toX(s.km)}px" data-km="${s.km}" data-title="${esc(s.title)}">
        <span class="road__label">${alertIcon(s.title, 'reminder', 14)}${esc(s.title)}</span><span class="road__pole"></span><span class="road__tick">${esc(intFmt(s.km))}</span></div>`).join(''));
    layoutSigns(road, track);
    car.style.transform = `translateX(${toX(carKm) - CAR_X}px)`;
    setOffset(0);
    attachDrag();
  }

  // Compteur : position de départ (ancien relevé si on vient de le mettre à jour), puis défilement.
  drawOdometer(odo, carKm);
  if (roll !== null) {
    const distance = km - roll;
    const response = Math.min(1.6, 0.6 + Math.log10(Math.max(10, distance)) * 0.22);
    requestAnimationFrame(() => {
      if (road) {
        const want = Math.min(0, -(toX(km) - CAR_X - 24));
        if (want < offset) spring(offset, Math.max(minOffset(), want), { response: response * 0.8 }, x => {
          offset = x;
          track.style.transform = `translateX(${x}px)`;
        });
      }
      const passed = signs.filter(s => s.km > roll && s.km <= km);
      spring(roll, km, { response }, value => {
        carKm = value;
        drawOdometer(odo, value);
        if (car) car.style.transform = `translateX(${toX(value) - CAR_X}px)`;
      }, () => {
        carKm = km;
        updateLook();
        if (passed.length) buzz([10, 40, 10]);
      });
    });
  }

  function attachDrag() {
    const tracker = velocityTracker();
    let dragging = false;
    let locked = null;
    let x0 = 0;
    let y0 = 0;
    let base = 0;
    let stop = () => {};
    road.addEventListener('pointerdown', e => {
      stop();
      dragging = true;
      locked = null;
      x0 = e.clientX;
      y0 = e.clientY;
      base = offset;
      tracker.reset();
      tracker.push(offset);
    });
    road.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - x0;
      if (locked === null) {
        if (Math.abs(dx) < 8 && Math.abs(e.clientY - y0) < 8) return;
        locked = Math.abs(dx) > Math.abs(e.clientY - y0) ? 'x' : 'y';
        if (locked === 'x') road.setPointerCapture(e.pointerId);
      }
      if (locked !== 'x') return;
      let x = base + dx;
      const lo = minOffset();
      if (x > 0) x = rubberband(x, road.clientWidth);
      if (x < lo) x = lo + rubberband(x - lo, road.clientWidth);
      setOffset(x);
      tracker.push(x);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (locked !== 'x') return;
      const velocity = tracker.velocity();
      const target = Math.max(minOffset(), Math.min(0, offset + project(velocity, 0.995)));
      stop = spring(offset, target, { velocity, response: 0.5 }, setOffset);
    };
    road.addEventListener('pointerup', end);
    road.addEventListener('pointercancel', end);
  }

  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 7);
    input.value = digits ? intFmt(Number(digits)) : '';
    err.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const value = Number(input.value.replace(/\D/g, ''));
    const fail = message => {
      err.textContent = message;
      input.setAttribute('aria-invalid', 'true');
      buzz([8, 40, 8]);
      if (!reducedMotion()) spring(-10, 0, { response: 0.25, damping: 0.3 }, x => (form.style.transform = `translateX(${x}px)`));
    };
    if (!value) return fail('Tapez le chiffre affiché au compteur.');
    if (value < km) return fail(`Le compteur ne peut pas reculer : il est déjà à ${intFmt(km)} km.`);
    if (value === km) return fail('C’est déjà le kilométrage enregistré.');
    if (value > 3000000) return fail('Kilométrage trop élevé.');
    input.blur();
    queueKmRoll(v.id, km);
    onSubmit(value);
  });
}
