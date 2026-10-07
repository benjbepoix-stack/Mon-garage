/*
 * Liaison avec l'app Mon Budget : les dépenses saisies ici (entretiens et
 * autres dépenses) sont publiées dans la base de Mon Budget, sous
 * budget/linked/garage, pour y apparaître sans double saisie. Mon Budget les
 * lit (lecture seule) et les compte dans ses dépenses du mois.
 *
 * - Uniquement à partir du 1er octobre 2026 (date de mise en place du lien) :
 *   ce qui précède a déjà été saisi à la main dans Mon Budget.
 * - Montants en centimes (format de Mon Budget), aucune pièce jointe envoyée.
 * - Best-effort, comme le lien avec Carnet : une erreur (hors ligne, règles
 *   pas encore publiées côté Mon Budget) est ignorée et retentée au prochain
 *   changement.
 */
const DB_URL = 'https://mon-budget-ade0b-default-rtdb.europe-west1.firebasedatabase.app';
export const LINK_START = '2026-10-01';

let lastSent = null;
let timer = null;
let pending = null;
let enabled = false;

/**
 * À appeler une fois les données réellement chargées (cloud reçu, ou mode
 * local) : évite de publier une liste vide depuis un appareil pas encore
 * synchronisé, ce qui effacerait momentanément les dépenses côté Mon Budget.
 */
export function enableBudgetSync() {
  enabled = true;
  if (pending) {
    clearTimeout(timer);
    timer = setTimeout(flush, 2000);
  }
}

/**
 * entries : [{ vehicle, field }] avec field = { maintenance, expenses }.
 * Construit la liste publiée et planifie l'envoi (court débounce).
 */
export function scheduleBudgetSync(entries) {
  const items = {};
  entries.forEach(({ vehicle, field }) => {
    field.maintenance
      .filter(x => x.date >= LINK_START && x.cost > 0)
      .forEach(x => {
        items[`${vehicle.id}_${x.id}`] = { date: x.date, amount: Math.round(x.cost * 100), label: `${vehicle.name} · ${x.type}${x.label ? ` (${x.label})` : ''}`.slice(0, 120), kind: 'Entretien' };
      });
    field.expenses
      .filter(x => x.date >= LINK_START && x.cost > 0)
      .forEach(x => {
        items[`${vehicle.id}_${x.id}`] = { date: x.date, amount: Math.round(x.cost * 100), label: `${vehicle.name} · ${x.label}`.slice(0, 120), kind: x.category };
      });
  });
  pending = items;
  if (!enabled) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 2000);
}

async function flush() {
  const items = pending;
  pending = null;
  if (!items) return;
  const key = JSON.stringify(items);
  if (key === lastSent) return;
  try {
    const res = await fetch(`${DB_URL}/budget/linked/garage.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedAt: Date.now(), items })
    });
    if (res.ok) lastSent = key;
  } catch {
    /* best-effort */
  }
}
