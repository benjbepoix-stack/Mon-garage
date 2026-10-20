/*
 * Mouvement « physique » partagé : ressorts interruptibles qui gardent la vitesse
 * du doigt, projection d'un geste lancé, résistance en bout de course, petite
 * vibration aux moments qui comptent. Mouvement réduit : on saute à la fin.
 */
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => Boolean(media?.matches);

/**
 * Anime une valeur de `from` vers `to` (ressort ; damping 1 = sans rebond).
 * @returns {() => void} arrêt (la valeur reste là où elle est)
 */
export function spring(from, to, { velocity = 0, response = 0.35, damping = 1 } = {}, onUpdate, onDone) {
  if (reducedMotion()) {
    onUpdate(to);
    onDone?.();
    return () => {};
  }
  const k = (2 * Math.PI / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  let x = from;
  let v = velocity;
  let last = performance.now();
  let raf = 0;
  let stopped = false;
  const tick = now => {
    if (stopped) return;
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      v += (-k * (x - to) - c * v) * h;
      x += v * h;
    }
    onUpdate(x);
    if (Math.abs(v) < 0.5 && Math.abs(x - to) < 0.3) {
      onUpdate(to);
      onDone?.();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

/** Distance parcourue par un geste lancé à `velocity` px/s (décélération du défilement). */
export const project = (velocity, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

/** Résistance au-delà d'une limite : plus on tire, moins ça suit. */
export const rubberband = (overshoot, dimension, constant = 0.55) => (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

/** Vitesse d'un geste (px/s) sur ses 90 dernières millisecondes. */
export function velocityTracker() {
  const points = [];
  return {
    push(x) {
      const t = performance.now();
      points.push([x, t]);
      while (points.length > 2 && t - points[0][1] > 90) points.shift();
    },
    velocity() {
      if (points.length < 2) return 0;
      const [x0, t0] = points[0];
      const [x1, t1] = points[points.length - 1];
      return ((x1 - x0) / Math.max(1, t1 - t0)) * 1000;
    },
    reset() {
      points.length = 0;
    }
  };
}

/** Petite vibration (Android) ; silencieuse là où l'appareil ne le permet pas. */
export function buzz(pattern = 10) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sans vibration */
  }
}
