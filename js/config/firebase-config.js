/*
 * Configuration Firebase (application Web) du projet Mon Garage.
 * Ces valeurs ne sont pas des secrets : elles sont publiques par conception.
 * Les données sont protégées par l'authentification et les règles de
 * database.rules.json (chaque compte ne voit que ses propres données).
 *
 * Tant que FIREBASE_CONFIG vaut null, l'application fonctionne sur l'appareil
 * uniquement (sans connexion ni synchronisation).
 */
export const FIREBASE_SDK_VERSION = '12.19.0';

export const FIREBASE_CONFIG = null;
