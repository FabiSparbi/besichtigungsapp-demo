import { $, escapeHTML } from './hilfen.js';
import { besichtigungen } from './speicher.js';

// ---------- Router ----------
// Die Screens tragen sich über registriereScreens() aus app.js ein — so
// importiert der Router keinen Screen und es entstehen keine Import-Zyklen.

let route = { name: 'liste' };
let aufraeumFn = null;
const screens = {};

function registriereScreens(map) {
  Object.assign(screens, map);
}

/** Screens hinterlegen hier ihre Abbau-Logik (Streams, Timer, ObjectURLs …). */
function setzeAufraeumFn(fn) {
  aufraeumFn = fn;
}

function navigiere(neueRoute) {
  if (aufraeumFn) { try { aufraeumFn(); } catch (_) {} aufraeumFn = null; }
  route = neueRoute;
  window.scrollTo(0, 0);
  render();
}

function holeBesichtigung(id) {
  return besichtigungen.find(b => b.id === id);
}

function render() {
  const app = $('#app');
  switch (route.name) {
    case 'liste': return screens.liste(app);
    case 'neu': return screens.neu(app);
    case 'detail': return screens.detail(app, holeBesichtigung(route.id));
    case 'kamera': return screens.kamera(app, holeBesichtigung(route.id));
    case 'sprachnotiz': return screens.sprachnotiz(app, holeBesichtigung(route.id));
    case 'fotoDetail': return screens.fotoDetail(app, holeBesichtigung(route.id), route.fotoId);
    case 'notizDetail': return screens.notizDetail(app, holeBesichtigung(route.id), route.notizId);
    case 'protokoll': return screens.protokoll(app, holeBesichtigung(route.id));
    case 'einstellungen': return screens.einstellungen(app);
  }
}

function kopfzeile(titel, zurueckRoute, rechtsHTML = '<span class="platz"></span>') {
  return `<div class="kopf">
    ${zurueckRoute ? `<button id="k-zurueck">‹ Zurück</button>` : '<span class="platz"></span>'}
    <h1>${escapeHTML(titel)}</h1>
    ${rechtsHTML}
  </div>`;
}
function bindeZurueck(zurueckRoute) {
  const btn = $('#k-zurueck');
  if (btn) btn.onclick = () => navigiere(zurueckRoute);
}

export { route, navigiere, holeBesichtigung, kopfzeile, bindeZurueck,
         setzeAufraeumFn, registriereScreens, render };
