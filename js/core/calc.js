/*
 * Calculs purs : kilométrage, financement, coûts mensuels et depuis l'achat,
 * consommation, échéances (rappels, documents, usure des composants).
 */
import { todayKey, fromKey } from './dates.js';

/* ---------- Mois ---------- */
export const monthOf = dateKey => dateKey.slice(0, 7);
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export function addMonthsToDate(dateKey, n) {
  const d = fromKey(dateKey);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const daysUntil = (dateKey, today = todayKey()) => Math.round((fromKey(dateKey) - fromKey(today)) / 86400000);

/* ---------- Kilométrage ---------- */
/** Kilométrage actuel : le plus grand relevé connu (fiche, entretiens, pleins). */
export function currentKm(v, f) {
  return Math.max(v?.mileage || 0, v?.purchaseKm || 0, ...(f.maintenance || []).map(x => x.km || 0), ...(f.fuel || []).map(x => x.km || 0));
}

/* ---------- Financement ---------- */
/**
 * Échéancier : { monthly, months, oneOffs: {mois: montant}, payments: {mois: montant},
 *                interest, remainingAt(mois), label }
 * - Comptant : prix d'achat au mois d'achat.
 * - Crédit : apport (prix - montant emprunté) au mois d'achat, mensualités à partir
 *   de la 1re échéance ; mensualité calculée si non saisie.
 * - LOA / LLD : premier loyer (apport) au mois de départ, puis N loyers mensuels.
 */
export function loanSchedule(v, loan) {
  const price = v?.purchasePrice || 0;
  const purchaseMonth = v?.purchaseDate ? monthOf(v.purchaseDate) : loan?.start ? monthOf(loan.start) : null;
  const oneOffs = {};
  const payments = {};
  const add = (map, month, amount) => month && amount > 0 && (map[month] = (map[month] || 0) + amount);
  const type = loan?.type || 'none';
  let monthly = 0;
  let months = 0;
  let interest = 0;
  let principal = 0;
  let rate = 0;
  let startMonth = null;

  if (type === 'none') {
    add(oneOffs, purchaseMonth, price);
  } else if (type === 'credit') {
    principal = Math.min(loan.principal || 0, price || Infinity);
    months = loan.months || 0;
    rate = (loan.rate || 0) / 1200;
    monthly = loan.monthly || (months ? (rate ? (principal * rate) / (1 - Math.pow(1 + rate, -months)) : principal / months) : 0);
    monthly = Math.round(monthly * 100) / 100;
    startMonth = loan.start ? monthOf(loan.start) : purchaseMonth;
    add(oneOffs, purchaseMonth || startMonth, Math.max(0, price - principal));
    for (let k = 0; k < months && startMonth; k++) add(payments, addMonths(startMonth, k), monthly);
    interest = Math.max(0, monthly * months - principal);
  } else {
    months = loan.months || 0;
    monthly = loan.monthly || 0;
    startMonth = loan.start ? monthOf(loan.start) : purchaseMonth;
    add(oneOffs, startMonth, loan.firstPayment || 0);
    for (let k = 1; k <= months && startMonth; k++) add(payments, addMonths(startMonth, k), monthly);
  }

  /** Capital restant dû après les échéances passées (crédit uniquement). */
  const remainingAt = month => {
    if (type !== 'credit' || !startMonth || !months) return 0;
    const paid = Math.max(0, Math.min(months, monthDiff(startMonth, month) + 1));
    if (paid >= months) return 0;
    const left = rate ? principal * Math.pow(1 + rate, paid) - (monthly * (Math.pow(1 + rate, paid) - 1)) / rate : principal - monthly * paid;
    return Math.max(0, Math.round(left * 100) / 100);
  };
  const endMonth = startMonth && months ? addMonths(startMonth, type === 'credit' ? months - 1 : months) : null;
  return { type, monthly, months, oneOffs, payments, interest, principal, startMonth, endMonth, remainingAt };
}

/* ---------- Coûts ---------- */
function fixedFor(item, month) {
  const start = monthOf(item.start);
  if (month < start || (item.end && month > monthOf(item.end))) return 0;
  return item.period === 'year' ? item.amount / 12 : item.amount;
}

export const COST_KEYS = ['purchase', 'loan', 'maintenance', 'fuel', 'fixed'];

/** Coûts d'un mois donné, par catégorie. */
export function monthCosts(v, f, month, schedule = loanSchedule(v, f.loan)) {
  const inMonth = x => x.date.startsWith(month);
  return {
    purchase: schedule.oneOffs[month] || 0,
    loan: schedule.payments[month] || 0,
    maintenance: f.maintenance.filter(inMonth).reduce((s, x) => s + x.cost, 0),
    fuel: f.fuel.filter(inMonth).reduce((s, x) => s + x.total, 0),
    fixed: f.fixed.reduce((s, x) => s + fixedFor(x, month), 0)
  };
}

/** Premier mois pertinent (achat, financement ou première saisie). */
export function firstMonth(v, f, schedule = loanSchedule(v, f.loan)) {
  const candidates = [v.purchaseDate, ...f.maintenance.map(x => x.date), ...f.fuel.map(x => x.date), ...f.fixed.map(x => x.start)].filter(Boolean).map(monthOf);
  if (schedule.startMonth) candidates.push(schedule.startMonth);
  candidates.push(...Object.keys(schedule.oneOffs));
  return candidates.sort()[0] || null;
}

/** Synthèse depuis l'achat jusqu'au mois en cours. */
export function costSummary(v, f, today = todayKey()) {
  const schedule = loanSchedule(v, f.loan);
  const now = monthOf(today);
  const first = firstMonth(v, f, schedule);
  const totals = Object.fromEntries(COST_KEYS.map(k => [k, 0]));
  if (first) {
    for (let m = first; m <= now; m = addMonths(m, 1)) {
      const c = monthCosts(v, f, m, schedule);
      COST_KEYS.forEach(k => (totals[k] += c[k]));
    }
  }
  const paid = COST_KEYS.reduce((s, k) => s + totals[k], 0);
  const remainingDebt = schedule.remainingAt(now);
  const resale = v.resaleValue || 0;
  const realCost = paid + remainingDebt - resale;
  const monthsOwned = first ? Math.max(1, monthDiff(first, now) + 1) : 0;
  const km = Math.max(0, currentKm(v, f) - (v.purchaseKm || 0));
  const usage = totals.maintenance + totals.fuel + totals.fixed;
  return {
    schedule,
    totals,
    paid,
    remainingDebt,
    resale,
    realCost,
    monthsOwned,
    perMonth: monthsOwned ? realCost / monthsOwned : 0,
    km,
    perKm: km ? realCost / km : 0,
    usagePerMonth: monthsOwned ? usage / monthsOwned : 0,
    first
  };
}

/* ---------- Consommation ---------- */
/**
 * Méthode du plein à plein : entre le premier et le dernier plein complet,
 * quantité ajoutée (hors premier plein) / distance.
 */
export function consumption(fuel) {
  const list = [...fuel].filter(x => x.km > 0).sort((a, b) => a.km - b.km || a.date.localeCompare(b.date));
  const fulls = list.filter(x => x.full);
  if (fulls.length < 2) return null;
  const a = fulls[0];
  const b = fulls[fulls.length - 1];
  const distance = b.km - a.km;
  if (distance <= 0) return null;
  const between = list.filter(x => x.km > a.km && x.km <= b.km);
  const qty = between.reduce((s, x) => s + x.qty, 0);
  const cost = between.reduce((s, x) => s + x.total, 0);
  return { per100: (qty / distance) * 100, costPerKm: cost / distance, distance };
}

/** Prix unitaire moyen (€/L ou €/kWh). */
export function unitPrice(entry) {
  return entry.qty ? entry.total / entry.qty : 0;
}

/* ---------- Échéances ---------- */
const SOON_DAYS = 30;

/** État d'un rappel d'entretien (date et/ou kilométrage, au premier atteint). */
export function reminderStatus(r, km, today = todayKey()) {
  const nextKm = r.everyKm && r.lastKm ? r.lastKm + r.everyKm : null;
  const nextDate = r.everyMonths && r.lastDate ? addMonthsToDate(r.lastDate, r.everyMonths) : null;
  if (nextKm === null && nextDate === null) return { level: 'unknown', nextKm, nextDate, kmLeft: null, daysLeft: null };
  const kmLeft = nextKm !== null ? nextKm - km : null;
  const daysLeft = nextDate ? daysUntil(nextDate, today) : null;
  const soonKm = r.everyKm ? Math.min(1500, Math.max(150, r.everyKm * 0.1)) : 0;
  let level = 'ok';
  if ((kmLeft !== null && kmLeft <= 0) || (daysLeft !== null && daysLeft < 0)) level = 'late';
  else if ((kmLeft !== null && kmLeft <= soonKm) || (daysLeft !== null && daysLeft <= SOON_DAYS)) level = 'soon';
  return { level, nextKm, nextDate, kmLeft, daysLeft };
}

export function docStatus(d, today = todayKey()) {
  if (!d.expiry) return { level: 'none', daysLeft: null };
  const daysLeft = daysUntil(d.expiry, today);
  return { level: daysLeft < 0 ? 'late' : daysLeft <= SOON_DAYS ? 'soon' : 'ok', daysLeft };
}

export function partStatus(p, km) {
  const used = Math.max(0, km - (p.installedKm || 0));
  const ratio = p.limitKm ? used / p.limitKm : 0;
  return { used, ratio, left: p.limitKm ? p.limitKm - used : null, level: ratio >= 1 ? 'late' : ratio >= 0.85 ? 'soon' : 'ok' };
}

const LEVEL_ORDER = { late: 0, soon: 1, ok: 2 };
const fmtKm = n => `${Math.round(Math.abs(n)).toLocaleString('fr-FR')} km`;
const fmtDays = n => (Math.abs(n) <= 1 ? (n < 0 ? 'hier' : n === 0 ? 'aujourd’hui' : 'demain') : `${Math.abs(n)} j`);

/** Toutes les échéances d'un véhicule, les plus urgentes d'abord. */
export function alerts(v, f, today = todayKey()) {
  const km = currentKm(v, f);
  const out = [];
  f.reminders.forEach(r => {
    const s = reminderStatus(r, km, today);
    if (s.level === 'unknown') return;
    // On retient le critère le plus proche (km ou date)
    const byKm = s.kmLeft !== null ? s.kmLeft / Math.max(1, r.everyKm) : Infinity;
    const byDate = s.daysLeft !== null ? s.daysLeft / Math.max(1, r.everyMonths * 30) : Infinity;
    const useKm = byKm <= byDate;
    const left = useKm ? s.kmLeft : s.daysLeft;
    const text = useKm ? (left <= 0 ? `dépassée de ${fmtKm(left)}` : `dans ${fmtKm(left)}`) : left < 0 ? `en retard de ${fmtDays(left)}` : `dans ${fmtDays(left)}`;
    out.push({ kind: 'reminder', id: r.id, level: s.level, title: r.label, text, score: Math.min(byKm, byDate) });
  });
  f.docs.forEach(d => {
    const s = docStatus(d, today);
    if (s.level === 'none') return;
    const text = s.daysLeft < 0 ? `expiré depuis ${fmtDays(s.daysLeft)}` : `expire dans ${fmtDays(s.daysLeft)}`;
    out.push({ kind: 'doc', id: d.id, level: s.level, title: d.label || d.type, text, score: s.daysLeft / 365 });
  });
  f.parts.forEach(p => {
    const s = partStatus(p, km);
    if (!p.limitKm) return;
    const text = s.left <= 0 ? `usée (+${fmtKm(s.left)})` : `${Math.round(s.ratio * 100)} % · reste ${fmtKm(s.left)}`;
    out.push({ kind: 'part', id: p.id, level: s.level, title: p.name, text, score: 1 - s.ratio });
  });
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.score - b.score);
}
