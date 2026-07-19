/* Service Worker der Demo-PWA.
   Strategie: Netzwerk zuerst (damit Updates sofort ankommen),
   Cache als Fallback (damit die App offline startet). */

const CACHE = 'besichtigung-demo-v2';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', ereignis => {
  ereignis.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
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
