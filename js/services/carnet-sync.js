/*
 * Liaison avec l'app Carnet (Mon tableau de bord), base Firebase partagée
 * sans mot de passe (même « choix assumé » que Trace et Échappée) :
 *
 *  - pushReminderToCarnet() : envoi manuel d'un rappel d'entretien comme
 *    tâche datée dans l'onglet Accueil de Carnet (action explicite,
 *    déclenchée par un bouton).
 *  - scheduleAlertsSync() : synchronisation automatique, en arrière-plan,
 *    d'un résumé des échéances par véhicule (pour le widget « Garage »
 *    affiché sur l'accueil de Carnet). Best-effort : une erreur (hors
 *    ligne, règles Firebase pas encore déployées côté Carnet…) est
 *    ignorée silencieusement et retentée au prochain changement.
 */
const DB_URL = 'https://dashboard---projet-default-rtdb.europe-west1.firebasedatabase.app';
const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Envoie un rappel d'entretien comme tâche datée dans le planning de Carnet. */
export async function pushReminderToCarnet({ vehicleName, label, date, note }) {
  const id = makeId();
  const payload = {
    id,
    title: `Entretien : ${vehicleName} — ${label}`.slice(0, 100),
    date: date || '',
    time: '',
    note: String(note || '').slice(0, 500)
  };
  const res = await fetch(`${DB_URL}/app/dashboard/tasks/${id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Carnet indisponible (${res.status})`);
  return id;
}

/* ---------- Résumé des échéances (widget en lecture seule côté Carnet) ---------- */
const lastSent = new Map();
let timer = null;
let pending = null;

/**
 * Planifie (avec un court débounce) l'envoi du résumé des échéances de
 * chaque véhicule. `digestsByVehicleId` : Map<vehicleId, digest|null>
 * (digest = { vehicleId, vehicleName, kind, updatedAt, alerts }, ou null
 * pour un véhicule supprimé — le nœud correspondant est alors effacé).
 */
export function scheduleAlertsSync(digestsByVehicleId) {
  pending = digestsByVehicleId;
  clearTimeout(timer);
  timer = setTimeout(flushAlertsSync, 1500);
}

async function flushAlertsSync() {
  const digests = pending;
  pending = null;
  if (!digests) return;
  for (const [vehicleId, digest] of digests) {
    // updatedAt exclu de la comparaison : on n'envoie que si le contenu a changé.
    const key = digest ? JSON.stringify({ ...digest, updatedAt: '' }) : null;
    if (lastSent.get(vehicleId) === key) continue; // rien de changé depuis le dernier envoi
    try {
      const res = await fetch(`${DB_URL}/app/garage_alerts/${vehicleId}.json`, {
        method: digest ? 'PUT' : 'DELETE',
        headers: digest ? { 'Content-Type': 'application/json' } : undefined,
        body: digest ? JSON.stringify(digest) : undefined
      });
      if (res.ok) {
        if (digest) lastSent.set(vehicleId, key);
        else lastSent.delete(vehicleId);
      }
      // Échec silencieux : pas de blocage de l'app Garage pour une fonctionnalité annexe.
    } catch {
      /* best-effort */
    }
  }
}
