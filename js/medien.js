// ---------- Wake Lock: Display bei Kamera/Aufnahme wach halten ----------

let wachhalter = null;
async function bildschirmWachhalten() {
  try {
    if (!('wakeLock' in navigator) || wachhalter) return;
    wachhalter = await navigator.wakeLock.request('screen');
    wachhalter.addEventListener('release', () => { wachhalter = null; });
  } catch (_) { /* nicht unterstützt oder verweigert — kein Problem */ }
}
function wachhalterFreigeben() {
  if (wachhalter) { wachhalter.release().catch(() => {}); wachhalter = null; }
}

// ---------- Spracherkennung (Safari/Chrome: webkitSpeechRecognition) ----------

function erstelleErkennung(aufText, aufFehler, startText = '') {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let gestoppt = false;
  let gesamt = String(startText).trim(); // vorhandener (ggf. korrigierter) Text, wird fortgesetzt
  let sitzung = '';   // finaler Text der laufenden Sitzung
  let anzeige = gesamt;
  const r = new SR();
  r.lang = 'de-DE';
  r.continuous = true;
  r.interimResults = true;
  r.onresult = e => {
    let zwischen = '';
    sitzung = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) sitzung += e.results[i][0].transcript + ' ';
      else zwischen += e.results[i][0].transcript;
    }
    anzeige = (gesamt + ' ' + sitzung + zwischen).replace(/\s+/g, ' ').trim();
    aufText(anzeige);
  };
  r.onerror = e => {
    if (e.error === 'aborted' || e.error === 'no-speech') return; // harmlos
    gestoppt = true; // sonst Endlosschleife über den Auto-Neustart in onend
    if (aufFehler) aufFehler(e.error);
  };
  // Chrome beendet die Erkennung nach Sprechpausen von selbst —
  // bei längeren Aufnahmen automatisch neu starten, Text bleibt erhalten.
  r.onend = () => {
    gesamt = (gesamt + ' ' + sitzung).replace(/\s+/g, ' ').trim();
    sitzung = '';
    if (!gestoppt) { try { r.start(); } catch (_) {} }
  };
  return {
    starten() { try { r.start(); } catch (_) {} },
    stoppen() { gestoppt = true; try { r.stop(); } catch (_) {} },
    text: () => anzeige
  };
}

// ---------- Linsen-Erkennung ----------

/**
 * Ordnet videoinput-Geräte den Objektiven zu (iPhone: 0,5× / 1× / 3×).
 * iOS meldet zusätzlich virtuelle Verbund-Kameras („Dual", „Triple") —
 * die duplizieren die physischen Linsen und werden ausgeblendet,
 * pro Linse bleibt genau ein Gerät übrig.
 */
function linsenErkennen(kameras) {
  const istFront = g => /front|user|selfie|facetime/i.test(g.label || '');
  const istVirtuell = g => /dual|triple|doppel|dreifach|virtual/i.test(g.label || '');

  let kandidaten = kameras.filter(g => !istFront(g));
  if (!kandidaten.length) kandidaten = kameras;
  const physisch = kandidaten.filter(g => !istVirtuell(g));
  if (physisch.length) kandidaten = physisch;

  let unbenannt = 0;
  const geraete = kandidaten.map(g => {
    const l = g.label || '';
    let name, rang;
    if (/ultra|0[.,]5/i.test(l)) { name = '0,5×'; rang = 0; }
    else if (/tele/i.test(l)) { name = '3×'; rang = 2; }
    else if (/back|rück|rueck|environment|weitwinkel|wide|haupt/i.test(l) || kandidaten.length === 1) { name = '1×'; rang = 1; }
    else { unbenannt += 1; name = 'Kam ' + unbenannt; rang = 3; }
    return { id: g.deviceId, name, rang };
  }).sort((a, c) => a.rang - c.rang);

  // Pro Linsen-Name nur das erste Gerät behalten — nie mehr „1× (2)", „1× (3)" …
  const gesehen = new Set();
  return geraete.filter(g => {
    if (gesehen.has(g.name)) return false;
    gesehen.add(g.name);
    return true;
  });
}

function kameraFehlerText(fehler) {
  switch (fehler && fehler.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Kamera-Zugriff verweigert — in der Adressleiste auf das Kamera-/Schloss-Symbol klicken, Kamera erlauben und die Seite neu laden.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Keine Kamera gefunden — ist eine Webcam angeschlossen/aktiviert?';
    case 'NotReadableError':
    case 'AbortError':
      return 'Die Kamera ist gerade von einem anderen Programm belegt (z. B. Teams/Zoom) — Programm schließen und Seite neu laden.';
    case 'SecurityError':
      return 'Kamera-Zugriff ist nur über localhost oder HTTPS möglich.';
    default:
      return `Keine Live-Vorschau möglich (${fehler && fehler.name ? fehler.name : 'unbekannter Fehler'}).`;
  }
}

function erkennungsFehlerText(code) {
  switch (code) {
    case 'nicht-vorhanden':
      return 'Dieser Browser hat keine Spracherkennung — am PC bitte Google Chrome verwenden. Text bitte eintippen.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofon-Zugriff für die Spracherkennung verweigert — im Browser erlauben (Schloss-Symbol in der Adressleiste).';
    case 'audio-capture':
      return 'Kein Mikrofon gefunden — bitte Mikrofon anschließen/aktivieren.';
    case 'network':
      return 'Spracherkennung nicht erreichbar — Internetverbindung prüfen bzw. am PC Google Chrome verwenden.';
    case 'language-not-supported':
      return 'Deutsch wird von der Spracherkennung dieses Browsers nicht unterstützt — bitte Google Chrome verwenden.';
    default:
      return `Spracherkennung-Fehler (${code}) — Text bitte eintippen.`;
  }
}

export { bildschirmWachhalten, wachhalterFreigeben, erstelleErkennung,
         linsenErkennen, kameraFehlerText, erkennungsFehlerText };
