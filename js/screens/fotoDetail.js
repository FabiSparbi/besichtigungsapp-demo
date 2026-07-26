import { $, escapeHTML, pad, formatDatumZeit, gpsText, zeigeGespeichert,
         slugErzeugen, slugEindeutig, slugAusDateiname } from '../hilfen.js';
import { speichereDaten, medienLoeschen } from '../speicher.js';
import { kopfzeile, bindeZurueck, navigiere } from '../router.js';
import { ladeMiniaturen } from './detail.js';
// ---------- Screen 6a: Foto-Detail ----------

function zeigeFotoDetail(app, b, fotoId) {
  if (!b) return navigiere({ name: 'liste' });
  const foto = b.fotos.find(f => f.id === fotoId);
  if (!foto) return navigiere({ name: 'detail', id: b.id });

  app.innerHTML = `
    ${kopfzeile(`Foto ${foto.laufendeNr}`, { name: 'detail', id: b.id }, '<button class="rechts" id="fd-loeschen" style="color:var(--rot)">Löschen</button>')}
    <div class="inhalt ohne-leiste">
      <img class="grossbild" data-medien="${foto.id}" alt="">
      <div class="feldgruppe" style="margin-top:14px">
        <label>Label (editierbar)</label>
        <input id="fd-label" value="${escapeHTML(foto.labelText)}">
      </div>
      <button class="btn btn-primaer" id="fd-speichern" hidden>✓ Label speichern</button>
      <div class="metabox">
        <div class="m-zeile"><b>Dateiname</b><span id="fd-dateiname">${escapeHTML(foto.dateiname)}</span></div>
        <div class="m-zeile"><b>Aufgenommen</b><span>${formatDatumZeit(foto.aufgenommenAm)}</span></div>
        <div class="m-zeile"><b>GPS</b><span>${gpsText(foto.gpsLat, foto.gpsLon) || 'nicht verfügbar'}</span></div>
        ${foto.transkriptRoh ? `<div class="m-zeile"><b>Transkript (roh)</b><span>${escapeHTML(foto.transkriptRoh)}</span></div>` : ''}
      </div>
    </div>`;

  bindeZurueck({ name: 'detail', id: b.id });
  ladeMiniaturen(app);

  const eingabe = $('#fd-label');
  eingabe.oninput = () => {
    $('#fd-speichern').hidden = eingabe.value.trim() === foto.labelText;
  };
  $('#fd-speichern').onclick = () => {
    const label = eingabe.value.trim();
    foto.labelText = label || `Foto ${foto.laufendeNr}`;
    let slug = slugErzeugen(label || `foto-${foto.laufendeNr}`) || `foto-${foto.laufendeNr}`;
    const andere = new Set(b.fotos.filter(f => f.id !== foto.id).map(f => slugAusDateiname(f.dateiname)));
    foto.dateiname = `${pad(foto.laufendeNr, 3)}_${slugEindeutig(slug, andere)}.jpg`;
    speichereDaten();
    eingabe.value = foto.labelText;
    $('#fd-dateiname').textContent = foto.dateiname;
    $('#fd-speichern').hidden = true;
    zeigeGespeichert(eingabe.closest('.feldgruppe'));
  };
  $('#fd-loeschen').onclick = () => {
    if (!confirm('Foto endgültig löschen?')) return;
    medienLoeschen(foto.id);
    b.fotos = b.fotos.filter(f => f.id !== foto.id);
    speichereDaten();
    navigiere({ name: 'detail', id: b.id });
  };
}

export { zeigeFotoDetail };
