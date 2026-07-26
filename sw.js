/* Service Worker der Demo-PWA.
   Strategie: Netzwerk zuerst (damit Updates sofort ankommen),
   Cache als Fallback (damit die App offline startet).
   Update-Ablauf: neuer Worker wartet, bis die Seite per
   SKIP_WAITING-Nachricht zustimmt (Update-Banner in index.html). */

const CACHE = 'baugutassist-v7';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './icon-192-dark.png', './icon-512-dark.png'];

self.addEventListener('install', ereignis => {
  // Kein skipWaiting hier — die Seite entscheidet über den Zeitpunkt (Update-Banner).
  ereignis.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', ereignis => {
  if (ereignis.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', ereignis => {
  ereignis.waitUntil(
    caches.keys()
      .then(schluessel => Promise.all(schluessel.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ereignis => {
  if (ereignis.request.method !== 'GET') return;
  // Nur eigene Ressourcen cachen — API- und Fremd-Antworten gehen direkt ans Netz.
  if (new URL(ereignis.request.url).origin !== self.location.origin) return;
  ereignis.respondWith(
    fetch(ereignis.request)
      .then(antwort => {
        const kopie = antwort.clone();
        caches.open(CACHE).then(cache => cache.put(ereignis.request, kopie)).catch(() => {});
        return antwort;
      })
      .catch(() =>
        caches.match(ereignis.request, { ignoreSearch: true })
          .then(treffer => treffer || caches.match('./index.html'))
      )
  );
});
