/* ============================================================
   BaugutAssist — klickbarer Web-Prototyp (Demo ohne Xcode)
   Bildet die Flows der echten iOS-App nach (Spec §7/§8):
   Fotos mit (gesprochenem) Label, Sprachnotizen mit Transkript,
   Export als ZIP mit protokoll-rohdaten.md + manifest.json.

   Einstiegspunkt: registriert die Screens beim Router, startet das
   erste Rendern und kümmert sich um den Service Worker.
   ============================================================ */

import { registriereScreens, render } from './js/router.js';
import { raeumeVerwaisteMedienAuf } from './js/speicher.js';
import { zeigeListe } from './js/screens/liste.js';
import { zeigeNeu } from './js/screens/neu.js';
import { zeigeDetail } from './js/screens/detail.js';
import { zeigeKamera } from './js/screens/kamera.js';
import { zeigeSprachnotiz } from './js/screens/sprachnotiz.js';
import { zeigeFotoDetail } from './js/screens/fotoDetail.js';
import { zeigeNotizDetail } from './js/screens/notizDetail.js';
import { zeigeEinstellungen } from './js/screens/einstellungen.js';
import { zeigeProtokoll } from './js/screens/protokoll.js';

registriereScreens({
  liste: zeigeListe,
  neu: zeigeNeu,
  detail: zeigeDetail,
  kamera: zeigeKamera,
  sprachnotiz: zeigeSprachnotiz,
  fotoDetail: zeigeFotoDetail,
  notizDetail: zeigeNotizDetail,
  einstellungen: zeigeEinstellungen,
  protokoll: zeigeProtokoll
});

// ---------- Start ----------
render();
raeumeVerwaisteMedienAuf(); // Best-Effort im Hintergrund

// PWA: Service Worker registrieren; bei neuer Version dezentes Update-Banner
// zeigen statt still zu aktivieren (sw.js wartet auf SKIP_WAITING).
function zeigeUpdateBanner(registrierung) {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.id = 'update-banner';
  banner.innerHTML = '<span>Neue Version verfügbar</span><button id="update-jetzt">Neu laden</button>';
  document.body.appendChild(banner);
  banner.querySelector('#update-jetzt').onclick = () => {
    if (registrierung.waiting) registrierung.waiting.postMessage('SKIP_WAITING');
    else location.reload();
  };
}

if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').then(registrierung => {
    const beobachte = worker => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        // "installed" + vorhandener Controller = Update wartet (kein Erstbesuch)
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          zeigeUpdateBanner(registrierung);
        }
      });
    };
    if (registrierung.waiting && navigator.serviceWorker.controller) zeigeUpdateBanner(registrierung);
    beobachte(registrierung.installing);
    registrierung.addEventListener('updatefound', () => beobachte(registrierung.installing));
  }).catch(() => {});

  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });
}
