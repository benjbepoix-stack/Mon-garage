/*
 * Liaison avec l'app Carnet (Mon tableau de bord) : même projet Firebase et
 * même compte. Garage écrit par le SDK dans le nœud de Carnet du compte
 * connecté, users/<uid>/carnet/garage_alerts ; Carnet le lit sans jamais l'écrire.
 *
 * Résumé des échéances (section « Garage » de Carnet, en lecture seule) :
 * en arrière-plan, Garage publie pour chaque véhicule actif ce qui est en
 * retard ou à moins de 30 jours. Le nœud est réécrit en entier à chaque
 * changement : un véhicule vendu, archivé ou supprimé (ici ou sur un autre
 * appareil) disparaît donc aussi de Carnet. Best-effort : une erreur est
 * ignorée et retentée au prochain changement. Sans compte (mode local) :
 * rien n'est publié.
 *
 * L'ancien bouton « Envoyer à Carnet » (une tâche par rappel) a été retiré :
 * Carnet affiche déjà ces échéances automatiquement, il créait des doublons.
 */
import { linkSet, currentUser } from './firebase.js';

const PATH = 'carnet/garage_alerts';

let lastSent = null;
let timer = null;
let pending = null;
let readyUid = null; // compte dont les données sont chargées

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flushAlertsSync, 1500);
}

/**
 * Changement de compte ou déconnexion : envoi en attente et autorisation abandonnés (rien
 * de l'ancien compte n'est publié dans le nouveau ; republication une fois ses données chargées).
 */
export function resetAlertsSync() {
  clearTimeout(timer);
  timer = null;
  pending = null;
  readyUid = null;
}

/**
 * À appeler une fois les données du compte réellement chargées : un appareil pas
 * encore synchronisé (liste vide) effacerait sinon les échéances affichées dans Carnet.
 */
export function enableAlertsSync() {
  readyUid = currentUser()?.uid || null;
  if (pending && readyUid) schedule();
}

/** `digests` : { vehicleId: digest } pour tous les véhicules actifs. */
export function scheduleAlertsSync(digests) {
  pending = digests;
  if (readyUid) schedule();
}

async function flushAlertsSync() {
  const uid = currentUser()?.uid;
  // Pas de compte, ou compte dont les données ne sont pas encore chargées : on attend.
  if (!pending || !uid || uid !== readyUid) return;
  const digests = pending;
  pending = null;
  // updatedAt exclu de la comparaison : on n'envoie que si le contenu a changé.
  const key = `${uid}:${JSON.stringify(Object.values(digests).map(d => ({ ...d, updatedAt: '' })))}`;
  if (key === lastSent) return;
  try {
    await linkSet(PATH, digests);
    lastSent = key;
  } catch {
    /* best-effort */
  }
}
