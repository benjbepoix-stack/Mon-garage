/* Service worker : chaque ouverture vérifie auprès du serveur si les fichiers
   ont changé (requête conditionnelle) ; la dernière version reçue sert de
   secours hors ligne. L'app-shell est aussi pré-mis en cache à l'installation,
   pour qu'un tout premier lancement hors ligne (au garage, en concession…)
   affiche l'app au lieu d'un écran blanc. */
const CACHE = 'mon-garage-v15';
// pdf.js (visionneuse PDF des documents) : servi par cdnjs, version figée → cache d'abord.
const PDFJS_PREFIX = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/theme.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/styles.css',
  './css/views/garage.css',
  './js/main.js',
  './js/config/firebase-config.js',
  './js/core/calc.js',
  './js/core/dates.js',
  './js/core/schema.js',
  './js/core/store.js',
  './js/core/utils.js',
  './js/core/validation.js',
  './js/features/calendar-prompt.js',
  './js/features/ics.js',
  './js/features/overdue-prompt.js',
  './js/features/resale-dossier.js',
  './js/services/firebase.js',
  './js/services/storage.js',
  './js/services/carnet-sync.js',
  './js/ui/attachment-viewer.js',
  './js/ui/charts.js',
  './js/ui/dialog.js',
  './js/ui/icons.js',
  './js/ui/status.js',
  './js/ui/theme.js',
  './js/ui/toast.js',
  './js/views/common.js',
  './js/views/costs.js',
  './js/views/detail.js',
  './js/views/docs.js',
  './js/views/fuel.js',
  './js/views/home.js',
  './js/views/maintenance.js',
  './js/views/parts.js',
  './js/views/vehicles.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

async function precache() {
  const cache = await caches.open(CACHE);
  // addAll échouerait en bloc au premier fichier manquant ; on isole chaque échec
  // pour que le reste de l'app-shell reste disponible hors ligne.
  await Promise.all(
    PRECACHE_URLS.map(url => cache.add(url).catch(err => console.warn('[sw] précache échoué:', url, err)))
  );
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && e.request.url.startsWith(PDFJS_PREFIX)) {
    e.respondWith(
      caches.match(e.request).then(
        hit =>
          hit ||
          fetch(e.request).then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(e.request, copy));
            }
            return res;
          })
      )
    );
    return;
  }
  // Firebase (auth + base de données), polices… : non concernés.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
