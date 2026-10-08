/*
 * Liaison avec l'app Carnet (Mon tableau de bord), base Firebase partagée
 * sans mot de passe (même « choix assumé » que Trace et Échappée).
 *
 * Résumé des échéances (section « Garage » de Carnet, en lecture seule) :
 * en arrière-plan, Garage publie pour chaque véhicule actif ce qui est en
 * retard ou à moins de 30 jours. Le nœud `app/garage_alerts` est réécrit en
 * entier à chaque changement : un véhicule vendu, archivé ou supprimé (ici ou
 * sur un autre appareil) disparaît donc aussi de Carnet. Best-effort : une
 * erreur (hors ligne, règles Firebase pas encore déployées côté Carnet…) est
 * ignorée et retentée au prochain changement.
 *
 * L'ancien bouton « Envoyer à Carnet » (une tâche par rappel) a été retiré :
 * Carnet affiche déjà ces échéances automatiquement, il créait des doublons.
 */
const DB_URL = 'https://dashboard---projet-default-rtdb.europe-west1.firebasedatabase.app';

let lastSent = null;
let timer = null;
let pending = null;
let enabled = false;

/**
 * À appeler une fois les données du compte réellement chargées : un appareil pas
 * encore synchronisé (liste vide) effacerait sinon les échéances affichées dans Carnet.
 */
export function enableAlertsSync() {
  enabled = true;
  if (pending) schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flushAlertsSync, 1500);
}

/** `digests` : { vehicleId: digest } pour tous les véhicules actifs. */
export function scheduleAlertsSync(digests) {
  pending = digests;
  if (enabled) schedule();
}

async function flushAlertsSync() {
  const digests = pending;
  pending = null;
  if (!digests) return;
  // updatedAt exclu de la comparaison : on n'envoie que si le contenu a changé.
  const key = JSON.stringify(Object.values(digests).map(d => ({ ...d, updatedAt: '' })));
  if (key === lastSent) return;
  try {
    const res = await fetch(`${DB_URL}/app/garage_alerts.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(digests)
    });
    if (res.ok) lastSent = key;
  } catch {
    /* best-effort */
  }
}
