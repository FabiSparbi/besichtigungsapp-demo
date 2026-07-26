import { $, escapeHTML, formatDatumZeit, slugErzeugen } from '../hilfen.js';
import { einstellung, speichereDaten } from '../speicher.js';
import { route, kopfzeile, bindeZurueck, navigiere, setzeAufraeumFn } from '../router.js';
import { rufeClaudeAuf, mdZuHtml } from '../ki.js';
// ---------- Screen: KI-Protokoll ----------

function zeigeProtokoll(app, b) {
  if (!b) return navigiere({ name: 'liste' });
  const neuErzeugen = route.neu === true;
  route.neu = false;

  app.innerHTML = `
    ${kopfzeile('KI-Protokoll', { name: 'detail', id: b.id })}
    <div class="inhalt ohne-leiste">
      <div class="fussnote" id="prot-status" style="margin:0 4px 10px"></div>
      <div class="protokoll-text" id="prot-inhalt"></div>
      <div id="prot-aktionen" hidden style="margin-top:14px">
        <button class="btn btn-primaer btn-klein" id="prot-teilen">Teilen / Sichern (.md)</button>
        <button class="btn btn-sekundaer btn-klein" id="prot-kopieren">Kopieren</button>
        <button class="btn btn-sekundaer btn-klein" id="prot-drucken">Drucken / PDF</button>
        <button class="btn btn-rot" id="prot-neu">Neu erstellen</button>
      </div>
    </div>`;
  bindeZurueck({ name: 'detail', id: b.id });

  const statusEl = $('#prot-status');
  const inhaltEl = $('#prot-inhalt');

  function zeigeFertig() {
    statusEl.textContent = 'Erstellt am ' + formatDatumZeit(b.protokoll.erstelltAm) +
      (b.protokoll.mitFotos ? ' · mit Foto-Analyse' : '');
    inhaltEl.innerHTML = mdZuHtml(b.protokoll.text);
    $('#prot-aktionen').hidden = false;
    $('#prot-kopieren').onclick = async () => {
      try { await navigator.clipboard.writeText(b.protokoll.text); alert('Protokoll kopiert.'); }
      catch (_) { alert('Kopieren nicht möglich.'); }
    };
    $('#prot-teilen').onclick = async () => {
      const name = `protokoll_${slugErzeugen(b.titel) || 'besichtigung'}.md`;
      const datei = new File([b.protokoll.text], name, { type: 'text/markdown' });
      if (navigator.canShare && navigator.canShare({ files: [datei] })) {
        try { await navigator.share({ files: [datei], title: 'Besichtigungsprotokoll' }); return; }
        catch (f) { if (f && f.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(datei);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };
    $('#prot-drucken').onclick = () => window.print();
    $('#prot-neu').onclick = () => {
      if (confirm('Vorhandenes Protokoll verwerfen und neu erstellen?')) {
        navigiere({ name: 'protokoll', id: b.id, neu: true });
      }
    };
  }

  const MAX_VERSUCHE = 3;

  async function erzeuge(versuch) {
    const steuerung = new AbortController();
    setzeAufraeumFn(() => steuerung.abort());
    statusEl.textContent = '⏳ Protokoll wird erstellt — der Text läuft live ein …';
    inhaltEl.textContent = '';
    $('#prot-aktionen').hidden = true;
    const mitFotos = einstellung('fotosAnalysieren', true) && b.fotos.length > 0;
    try {
      // Markdown schon während des Streamings rendern (gedrosselt auf ~300 ms)
      let letzteDarstellung = 0;
      const text = await rufeClaudeAuf(b, mitFotos, steuerung.signal, laufend => {
        const jetzt = Date.now();
        if (jetzt - letzteDarstellung < 300) return;
        letzteDarstellung = jetzt;
        inhaltEl.innerHTML = mdZuHtml(laufend);
      });
      b.protokoll = { text, erstelltAm: new Date().toISOString(), mitFotos };
      speichereDaten();
      zeigeFertig();
    } catch (fehler) {
      if (fehler.name === 'AbortError') return;
      // Überlast (429/529): exponentielles Backoff, bis zu MAX_VERSUCHE Anläufe
      if ((fehler.status === 429 || fehler.status === 529) && versuch < MAX_VERSUCHE) {
        const wartezeit = 5000 * versuch; // 5 s, dann 10 s
        statusEl.textContent = `API ausgelastet — neuer Versuch in ${wartezeit / 1000} Sekunden (${versuch + 1}/${MAX_VERSUCHE}) …`;
        const timeout = setTimeout(() => erzeuge(versuch + 1), wartezeit);
        setzeAufraeumFn(() => clearTimeout(timeout));
        return;
      }
      const meldung = fehler.status === 401
        ? 'API-Key ungültig — bitte in den Einstellungen prüfen.'
        : 'Fehler: ' + fehler.message;
      statusEl.textContent = '';
      inhaltEl.innerHTML = `<div style="color:var(--rot)">${escapeHTML(meldung)}</div>
        <button class="btn btn-sekundaer btn-klein" id="prot-retry" style="margin-top:12px">Erneut versuchen</button>`;
      $('#prot-retry').onclick = () => erzeuge(1);
    }
  }

  if (neuErzeugen || !b.protokoll) erzeuge(1);
  else zeigeFertig();
}

export { zeigeProtokoll };
