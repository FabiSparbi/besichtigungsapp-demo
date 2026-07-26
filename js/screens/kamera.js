import { $, escapeHTML, pad, slugErzeugen, slugEindeutig, slugAusDateiname } from '../hilfen.js';
import { speichereDaten, medienSpeichern } from '../speicher.js';
import { bildschirmWachhalten, wachhalterFreigeben, erstelleErkennung,
         linsenErkennen, kameraFehlerText, erkennungsFehlerText } from '../medien.js';
import { navigiere, setzeAufraeumFn } from '../router.js';
// ---------- Screen 4: Kamera mit gesprochenem Label ----------

function zeigeKamera(app, b) {
  if (!b) return navigiere({ name: 'liste' });

  let stream = null, gpsWaechter = null;
  let koordinaten = null;
  let fotoBlob = null, fotoURL = null;
  let erkennung = null, labelText = '';
  // Kamera-Auswahl & Zoom
  let videoEl = null, spur = null;
  let geraete = [], aktuelleDeviceId = null;
  let zoomFaktor = 1, zoomMin = 1, zoomMax = 5, zoomModus = 'digital';

  setzeAufraeumFn(() => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (gpsWaechter !== null) navigator.geolocation.clearWatch(gpsWaechter);
    if (erkennung) erkennung.stoppen();
    if (fotoURL) URL.revokeObjectURL(fotoURL);
    wachhalterFreigeben();
  });
  bildschirmWachhalten();

  const naechsteNr = () => (b.fotos.length ? Math.max(...b.fotos.map(f => f.laufendeNr)) : 0) + 1;
  function dateinameVorschau() {
    const nr = naechsteNr();
    let slug = slugErzeugen(labelText.trim() || `foto-${nr}`) || `foto-${nr}`;
    slug = slugEindeutig(slug, new Set(b.fotos.map(f => slugAusDateiname(f.dateiname))));
    return `${pad(nr, 3)}_${slug}.jpg`;
  }

  // GPS im Hintergrund mitlaufen lassen (kein Fix ist ok, Spec §7.1)
  if (navigator.geolocation) {
    gpsWaechter = navigator.geolocation.watchPosition(
      p => { koordinaten = { lat: p.coords.latitude, lon: p.coords.longitude }; aktualisiereGPSBadge(); },
      () => {}, { enableHighAccuracy: true, maximumAge: 30000 }
    );
  }
  function aktualisiereGPSBadge() {
    const badge = $('#gps-badge');
    if (!badge) return;
    badge.textContent = koordinaten ? '📍 GPS' : '📍 kein GPS';
    badge.className = 'gps-badge ' + (koordinaten ? 'ok' : 'fehlt');
  }

  phaseLive();

  /** Startet den Kamerastream (optional mit fester Linse) und ermittelt Zoom-Fähigkeiten. */
  async function starteStream(deviceId) {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    const wunsch = deviceId
      ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1920 } }, audio: false }
      : { video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false };
    stream = await navigator.mediaDevices.getUserMedia(wunsch);
    spur = stream.getVideoTracks()[0];
    aktuelleDeviceId = (spur.getSettings && spur.getSettings().deviceId) || deviceId || null;
    videoEl.srcObject = stream;

    // Hardware-Zoom (iOS 17+/Android), sonst Digital-Zoom via Transform + Bildausschnitt
    zoomFaktor = 1;
    const faehigkeiten = spur.getCapabilities ? spur.getCapabilities() : {};
    if (faehigkeiten.zoom && typeof faehigkeiten.zoom.max === 'number') {
      zoomModus = 'hardware';
      zoomMin = Math.max(1, faehigkeiten.zoom.min || 1);
      zoomMax = faehigkeiten.zoom.max;
      zoomFaktor = zoomMin;
    } else {
      zoomModus = 'digital'; zoomMin = 1; zoomMax = 5;
    }
    wendeZoomAn();
    await ladeLinsen();
    zeichneLinsen();
  }

  function wendeZoomAn() {
    const badge = $('#ka-zoom');
    if (badge) {
      badge.textContent = (Math.round(zoomFaktor * 10) / 10).toLocaleString('de-DE') + '×';
      // Nur zeigen, wenn wirklich gezoomt ist — Tipp darauf setzt zurück.
      badge.hidden = zoomFaktor <= zoomMin + 0.001;
    }
    if (!videoEl) return;
    if (zoomModus === 'hardware' && spur) {
      spur.applyConstraints({ advanced: [{ zoom: zoomFaktor }] }).catch(() => {});
      videoEl.style.transform = '';
    } else {
      videoEl.style.transform = zoomFaktor > 1.001 ? `scale(${zoomFaktor})` : '';
    }
  }

  /** Erkennt die Objektive des Geräts (iPhone: Ultraweitwinkel/Weitwinkel/Tele als eigene Kameras). */
  async function ladeLinsen() {
    if (geraete.length) return;
    try {
      const alle = await navigator.mediaDevices.enumerateDevices();
      geraete = linsenErkennen(alle.filter(g => g.kind === 'videoinput'));
    } catch (_) { geraete = []; }
  }

  function zeichneLinsen() {
    const reihe = $('#ka-linsen');
    if (!reihe) return;
    if (geraete.length < 2) { reihe.innerHTML = ''; return; }
    // Falls der aktive Stream keinem Button entspricht (z. B. iOS-Standardkamera
    // mit eigener virtueller Geräte-ID), die 1×-Linse als aktiv markieren.
    let aktivId = aktuelleDeviceId;
    if (!geraete.some(g => g.id === aktivId)) {
      const standard = geraete.find(g => g.name === '1×');
      if (standard) aktivId = standard.id;
    }
    reihe.innerHTML = '<div class="linsen-gruppe">' + geraete.map(g =>
      `<button class="linse ${g.id === aktivId ? 'aktiv' : ''}" data-linse="${escapeHTML(g.id)}">${escapeHTML(g.name)}</button>`
    ).join('') + '</div>';
    reihe.querySelectorAll('[data-linse]').forEach(knopf => {
      knopf.onclick = async () => {
        if (knopf.dataset.linse === aktuelleDeviceId) return;
        try {
          await starteStream(knopf.dataset.linse);
        } catch (_) {
          // Linse nicht startbar → zurück zur vorherigen
          starteStream(aktuelleDeviceId).catch(() => {});
        }
      };
    });
  }

  async function phaseLive() {
    app.innerHTML = `
      <div class="kamera">
        <video id="video" autoplay playsinline muted></video>
        <div class="kamera-top">
          <button class="rund" id="ka-zu">✕</button>
          <button class="zoom-badge" id="ka-zoom" hidden title="Zoom zurücksetzen">1×</button>
          <span class="gps-badge fehlt" id="gps-badge">📍 kein GPS</span>
        </div>
        <div class="kamera-linsen" id="ka-linsen"></div>
        <div class="kamera-unten">
          <button class="rund" id="ka-galerie" aria-label="Foto aus Datei wählen">🖼️</button>
          <button class="ausloeser" id="ausloeser" aria-label="Foto auslösen"></button>
          <button class="rund" style="visibility:hidden" tabindex="-1"></button>
        </div>
        <input type="file" accept="image/*" capture="environment" id="ka-fallback" hidden>
        <input type="file" accept="image/*" id="ka-datei" hidden>
      </div>`;
    $('#ka-zu').onclick = () => navigiere({ name: 'detail', id: b.id });
    const dateiWahl = $('#ka-datei');
    $('#ka-galerie').onclick = () => dateiWahl.click();
    dateiWahl.onchange = () => { if (dateiWahl.files[0]) fotoAufgenommen(dateiWahl.files[0]); };
    aktualisiereGPSBadge();

    videoEl = $('#video');

    // Zoom-Gesten: Pinch (Touch), Mausrad (Desktop), Tipp auf Badge = zurücksetzen
    const wurzel = app.querySelector('.kamera');
    let pinchStart = null, pinchZoom = 1;
    const abstand = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    wurzel.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { pinchStart = abstand(e.touches); pinchZoom = zoomFaktor; }
    }, { passive: true });
    wurzel.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinchStart && stream) {
        e.preventDefault();
        zoomFaktor = Math.min(zoomMax, Math.max(zoomMin, pinchZoom * abstand(e.touches) / pinchStart));
        wendeZoomAn();
      }
    }, { passive: false });
    wurzel.addEventListener('touchend', () => { pinchStart = null; }, { passive: true });
    wurzel.addEventListener('wheel', e => {
      if (!stream) return;
      e.preventDefault();
      zoomFaktor = Math.min(zoomMax, Math.max(zoomMin, zoomFaktor * (e.deltaY < 0 ? 1.1 : 0.9)));
      wendeZoomAn();
    }, { passive: false });
    $('#ka-zoom').onclick = () => { zoomFaktor = zoomMin; wendeZoomAn(); };

    try {
      await starteStream(aktuelleDeviceId);
      $('#ausloeser').onclick = () => {
        if (!videoEl || !stream) return;
        const vb = videoEl.videoWidth || 1280, vh = videoEl.videoHeight || 960;
        let sx = 0, sy = 0, sw = vb, sh = vh;
        if (zoomModus === 'digital' && zoomFaktor > 1.001) {
          // Digital-Zoom: mittigen Bildausschnitt passend zum Vorschau-Zoom aufnehmen
          sw = Math.max(1, Math.round(vb / zoomFaktor));
          sh = Math.max(1, Math.round(vh / zoomFaktor));
          sx = Math.round((vb - sw) / 2);
          sy = Math.round((vh - sh) / 2);
        }
        const leinwand = document.createElement('canvas');
        leinwand.width = sw;
        leinwand.height = sh;
        leinwand.getContext('2d').drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);
        leinwand.toBlob(blob => { if (blob) fotoAufgenommen(blob); }, 'image/jpeg', 0.9);
      };
    } catch (fehler) {
      // Kein Live-Kamerazugriff → konkreten Grund anzeigen, Auslöser als Fallback
      videoEl.remove();
      videoEl = null;
      const fallback = $('#ka-fallback');
      $('#ausloeser').onclick = () => fallback.click();
      fallback.onchange = () => { if (fallback.files[0]) fotoAufgenommen(fallback.files[0]); };
      $('.kamera-top').insertAdjacentHTML('afterend',
        `<div style="position:relative;text-align:center;padding:24px;color:#bbb;font-size:14px">${escapeHTML(kameraFehlerText(fehler))}<br>Der Auslöser öffnet Kamera-App bzw. Dateiauswahl, 🖼️ wählt eine Bilddatei.</div>`);
    }
  }

  function fotoAufgenommen(blob) {
    fotoBlob = blob;
    fotoURL = URL.createObjectURL(blob);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    phaseLabel();
  }

  function phaseLabel(fortsetzen) {
    if (!fortsetzen) labelText = '';
    app.innerHTML = `
      <div class="kamera">
        <div class="kamera-scroll">
          <img class="vorschau" src="${fotoURL}" alt="Aufgenommenes Foto">
          <div class="mikro-bereich">
            <span class="mikro puls" id="mikro">🎙️</span>
            <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:6px">${fortsetzen ? 'Weitersprechen — der Text wird ergänzt …' : 'Label jetzt einsprechen …'}</div>
            <div class="live-text" id="live-text">${escapeHTML(labelText) || '…'}</div>
          </div>
          <button class="btn btn-primaer" id="ka-fertig">✓ Label fertig</button>
        </div>
      </div>`;

    erkennung = erstelleErkennung(text => {
      labelText = text;
      const el = $('#live-text');
      if (el) el.textContent = text || '…';
    }, code => {
      const el = $('#live-text');
      if (el) el.textContent = erkennungsFehlerText(code);
      const mikro = $('#mikro');
      if (mikro) mikro.classList.remove('puls');
    }, fortsetzen ? labelText : '');
    if (erkennung) {
      erkennung.starten();
    } else {
      $('#mikro').classList.remove('puls');
      $('#live-text').textContent = erkennungsFehlerText('nicht-vorhanden');
    }
    $('#ka-fertig').onclick = () => {
      if (erkennung) { erkennung.stoppen(); erkennung = null; }
      setTimeout(phaseBestaetigen, 250); // letzten Wörtern kurz Zeit geben
    };
  }

  function phaseBestaetigen() {
    app.innerHTML = `
      <div class="kamera">
        <div class="kamera-scroll">
          <img class="vorschau" src="${fotoURL}" alt="Aufgenommenes Foto" style="max-height:36dvh">
          <div class="beschriftung-dunkel">Label (editierbar)</div>
          <input class="feld-dunkel" id="ka-label" value="${escapeHTML(labelText)}" placeholder="Label eingeben …">
          <div class="datei-vorschau" id="ka-dateiname"></div>
          ${labelText ? '' : '<div class="kamera-hinweis">Kein Sprach-Input erkannt — bitte Label eintippen.</div>'}
          <div style="margin-top:18px">
            <button class="btn btn-primaer" id="ka-weiter">📷 Speichern — nächstes Foto</button>
            ${(window.SpeechRecognition || window.webkitSpeechRecognition)
              ? '<button class="btn btn-sekundaer" id="ka-sprechen" style="background:rgba(255,255,255,0.14);color:#fff">🎙️ Weiter einsprechen</button>' : ''}
            <button class="btn btn-sekundaer" id="ka-schliessen" style="background:rgba(255,255,255,0.14);color:#fff">Speichern &amp; Schließen</button>
            <button class="btn btn-rot" id="ka-wiederholen">Foto wiederholen</button>
          </div>
        </div>
      </div>`;

    const eingabe = $('#ka-label');
    const zeigeName = () => {
      labelText = eingabe.value;
      $('#ka-dateiname').textContent = 'Dateiname: ' + dateinameVorschau();
    };
    eingabe.oninput = zeigeName;
    zeigeName();

    async function speichern(weiter) {
      const nr = naechsteNr();
      const label = eingabe.value.trim();
      const foto = {
        id: crypto.randomUUID(),
        laufendeNr: nr,
        dateiname: dateinameVorschau(),
        labelText: label || `Foto ${nr}`,
        transkriptRoh: labelText.trim() || null,
        aufgenommenAm: new Date().toISOString(),
        gpsLat: koordinaten ? koordinaten.lat : null,
        gpsLon: koordinaten ? koordinaten.lon : null
      };
      await medienSpeichern(foto.id, fotoBlob);
      b.fotos.push(foto);
      speichereDaten();
      URL.revokeObjectURL(fotoURL);
      fotoURL = null; fotoBlob = null;
      if (weiter) phaseLive();
      else navigiere({ name: 'detail', id: b.id });
    }
    $('#ka-weiter').onclick = () => speichern(true);
    $('#ka-schliessen').onclick = () => speichern(false);
    const sprechen = $('#ka-sprechen');
    if (sprechen) sprechen.onclick = () => {
      labelText = eingabe.value; // manuelle Korrekturen übernehmen, Erkennung setzt darauf auf
      phaseLabel(true);
    };
    $('#ka-wiederholen').onclick = () => {
      URL.revokeObjectURL(fotoURL); fotoURL = null; fotoBlob = null;
      phaseLive();
    };
  }
}

export { zeigeKamera };
