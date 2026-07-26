import { $, escapeHTML, formatDatumZeit, formatDauer, zeigeGespeichert } from '../hilfen.js';
import { speichereDaten, medienLoeschen, medienURL } from '../speicher.js';
import { kopfzeile, bindeZurueck, navigiere } from '../router.js';
// ---------- Screen 6b: Sprachnotiz-Detail ----------

function zeigeNotizDetail(app, b, notizId) {
  if (!b) return navigiere({ name: 'liste' });
  const notiz = b.sprachnotizen.find(n => n.id === notizId);
  if (!notiz) return navigiere({ name: 'detail', id: b.id });

  app.innerHTML = `
    ${kopfzeile('Sprachnotiz', { name: 'detail', id: b.id }, '<button class="rechts" id="nd-loeschen" style="color:var(--rot)">Löschen</button>')}
    <div class="inhalt ohne-leiste">
      <div class="metabox" style="margin-top:0">
        <div class="m-zeile"><b>Datei</b><span>${escapeHTML(notiz.dateiname)}</span></div>
        <div class="m-zeile"><b>Aufgenommen</b><span>${formatDauer(notiz.dauer)} · ${formatDatumZeit(notiz.aufgenommenAm)}</span></div>
        <audio controls id="nd-audio"></audio>
      </div>
      <div class="sektion-titel">Transkript (editierbar)</div>
      <textarea class="transkript" id="nd-text">${escapeHTML(notiz.transkript || '')}</textarea>
      <button class="btn btn-primaer" id="nd-speichern" hidden style="margin-top:12px">✓ Transkript speichern</button>
    </div>`;

  bindeZurueck({ name: 'detail', id: b.id });
  medienURL(notiz.id).then(url => { if (url) $('#nd-audio').src = url; });

  const feld = $('#nd-text');
  feld.oninput = () => {
    $('#nd-speichern').hidden = feld.value.trim() === (notiz.transkript || '');
  };
  $('#nd-speichern').onclick = () => {
    notiz.transkript = feld.value.trim() || null;
    speichereDaten();
    $('#nd-speichern').hidden = true;
    zeigeGespeichert(feld);
  };
  $('#nd-loeschen').onclick = () => {
    if (!confirm('Sprachnotiz endgültig löschen?')) return;
    medienLoeschen(notiz.id);
    b.sprachnotizen = b.sprachnotizen.filter(n => n.id !== notiz.id);
    speichereDaten();
    navigiere({ name: 'detail', id: b.id });
  };
}

export { zeigeNotizDetail };
