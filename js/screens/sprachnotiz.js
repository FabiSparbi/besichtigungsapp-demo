import { $, escapeHTML, pad, formatDauer } from '../hilfen.js';
import { speichereDaten, medienSpeichern } from '../speicher.js';
import { bildschirmWachhalten, wachhalterFreigeben, erstelleErkennung,
         erkennungsFehlerText } from '../medien.js';
import { kopfzeile, bindeZurueck, navigiere, setzeAufraeumFn } from '../router.js';
// ---------- Screen 5: Sprachnotiz ----------

function zeigeSprachnotiz(app, b) {
  if (!b) return navigiere({ name: 'liste' });

  let stream = null, rekorder = null, erkennung = null, timer = null;
  let stuecke = [], startZeit = 0, dauer = 0, transkript = '';
  let mime = '';

  setzeAufraeumFn(() => {
    if (timer) clearInterval(timer);
    if (rekorder && rekorder.state !== 'inactive') rekorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (erkennung) erkennung.stoppen();
    wachhalterFreigeben();
  });
  bildschirmWachhalten();

  phaseBereit();

  function phaseBereit(hinweis) {
    app.innerHTML = `
      ${kopfzeile('Sprachnotiz', { name: 'detail', id: b.id })}
      <div class="inhalt ohne-leiste zentriert" style="min-height:70dvh">
        <div style="color:var(--sekundaer);font-size:15px;max-width:290px">Sprachnotiz zur Besichtigung aufnehmen — sie wird automatisch transkribiert.</div>
        ${hinweis ? `<div style="color:var(--orange);font-size:13px">${escapeHTML(hinweis)}</div>` : ''}
        <button class="aufnahme-knopf" id="s-start">🎙️</button>
        <div style="color:var(--sekundaer);font-size:13px">Tippen zum Starten</div>
      </div>`;
    bindeZurueck({ name: 'detail', id: b.id });
    $('#s-start').onclick = starteAufnahme;
  }

  async function starteAufnahme() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_) {
      return phaseBereit('Kein Mikrofon-Zugriff (HTTPS + Berechtigung nötig).');
    }
    mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', '']
      .find(m => m === '' || MediaRecorder.isTypeSupported(m));
    stuecke = [];
    rekorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    rekorder.ondataavailable = e => { if (e.data.size) stuecke.push(e.data); };
    rekorder.onstop = () => {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      phaseBearbeiten();
    };
    rekorder.start();
    startZeit = Date.now();

    app.innerHTML = `
      ${kopfzeile('Aufnahme läuft', null)}
      <div class="inhalt ohne-leiste zentriert" style="min-height:70dvh">
        <span class="mikro puls" style="font-size:40px">🎙️</span>
        <div class="timer" id="s-timer">00:00</div>
        <div id="s-live" style="min-height:64px;max-width:330px;font-size:15px;color:var(--sekundaer)">Transkript erscheint hier live …</div>
        <button class="aufnahme-knopf" id="s-stopp"><span class="stopp"></span></button>
        <div style="color:var(--sekundaer);font-size:13px">Tippen zum Stoppen</div>
      </div>`;

    transkript = '';
    erkennung = erstelleErkennung(text => {
      transkript = text;
      const el = $('#s-live');
      if (el) { el.textContent = text || 'Transkript erscheint hier live …'; el.style.color = 'var(--text)'; }
    }, code => {
      const el = $('#s-live');
      if (el) { el.textContent = erkennungsFehlerText(code); el.style.color = 'var(--orange)'; }
    });
    if (erkennung) {
      erkennung.starten();
    } else {
      $('#s-live').textContent = erkennungsFehlerText('nicht-vorhanden');
      $('#s-live').style.color = 'var(--orange)';
    }
    timer = setInterval(() => {
      $('#s-timer').textContent = formatDauer((Date.now() - startZeit) / 1000);
    }, 250);
    $('#s-stopp').onclick = () => {
      dauer = (Date.now() - startZeit) / 1000;
      clearInterval(timer); timer = null;
      if (erkennung) { erkennung.stoppen(); }
      rekorder.stop();
    };
  }

  function phaseBearbeiten() {
    setTimeout(() => {
      app.innerHTML = `
        ${kopfzeile('Sprachnotiz', null)}
        <div class="inhalt ohne-leiste">
          <div class="fussnote" style="margin:0 4px 8px">Aufnahme: ${formatDauer(dauer)} — Transkript (editierbar):</div>
          <textarea class="transkript" id="s-text">${escapeHTML(transkript)}</textarea>
          ${transkript ? '' : '<div class="fussnote" style="margin-top:8px;color:var(--orange)">Kein Text erkannt — bitte manuell eingeben (die Audiodatei bleibt als Beleg erhalten).</div>'}
          <button class="btn btn-primaer" id="s-speichern" style="margin-top:14px">✓ Sprachnotiz speichern</button>
          <button class="btn btn-rot" id="s-verwerfen">Verwerfen &amp; neu aufnehmen</button>
        </div>`;
      $('#s-speichern').onclick = async () => {
        const blob = new Blob(stuecke, { type: mime || 'audio/webm' });
        const endung = (mime && mime.startsWith('audio/mp4')) ? 'm4a' : 'webm';
        let nr = b.sprachnotizen.length + 1;
        let name = `sprachnotiz-${pad(nr)}.${endung}`;
        while (b.sprachnotizen.some(n => n.dateiname === name)) {
          nr++; name = `sprachnotiz-${pad(nr)}.${endung}`;
        }
        const notiz = {
          id: crypto.randomUUID(),
          dateiname: name,
          transkript: $('#s-text').value.trim() || null,
          dauer,
          aufgenommenAm: new Date(startZeit).toISOString()
        };
        await medienSpeichern(notiz.id, blob);
        b.sprachnotizen.push(notiz);
        speichereDaten();
        navigiere({ name: 'detail', id: b.id });
      };
      $('#s-verwerfen').onclick = () => { stuecke = []; transkript = ''; phaseBereit(); };
    }, 300); // Erkennung kurz nachlaufen lassen
  }
}

export { zeigeSprachnotiz };
