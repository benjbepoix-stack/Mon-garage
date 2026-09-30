/*
 * Configuration Firebase (application Web) du projet Mon Garage.
 * Ces valeurs ne sont pas des secrets : elles sont publiques par conception.
 * Les données sont protégées par l'authentification et les règles de
 * database.rules.json (chaque compte ne voit que ses propres données).
 *
 * Si FIREBASE_CONFIG vaut null, l'application fonctionne sur l'appareil
 * uniquement (sans connexion ni synchronisation).
 */
export const FIREBASE_SDK_VERSION = '12.19.0';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAdtuzUxcc7JIxtYDXh3dPmrXMP3HePBT4',
  authDomain: 'test-e27e9.firebaseapp.com',
  databaseURL: 'https://test-e27e9-default-rtdb.europe-west1.firebasedatabase.app/',
  projectId: 'test-e27e9',
  storageBucket: 'test-e27e9.firebasestorage.app',
  messagingSenderId: '435431704932',
  appId: '1:435431704932:web:abc6928490d225a1021271'
};
