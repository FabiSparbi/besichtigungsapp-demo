import { escapeHTML, formatDatumZeit, formatZeit, formatDauer, gpsText } from './hilfen.js';
import { einstellung, medienLaden } from './speicher.js';
import { navigiere } from './router.js';
// ---------- API-Key-Test ----------

/* Modell für Protokollerzeugung und Key-Test — an einer Stelle gepflegt,
   damit beide nicht auseinanderlaufen. */
const KI_MODELL = 'claude-opus-4-8';

/** Minimaler Ping an die Messages-API (1 Token), um den Key zu verifizieren. */
async function testeApiKey(schluessel) {
  const antwort = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': schluessel,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: KI_MODELL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  });
  if (antwort.ok) return { ok: true };
  let detail = '';
  try { detail = (await antwort.json()).error?.message || ''; } catch (_) {}
  if (antwort.status === 401) return { ok: false, meldung: 'Key ungültig (401).' };
  return { ok: false, meldung: detail || `HTTP ${antwort.status}` };
}

/* System-Prompt der Protokollerzeugung — genutzt von der In-App-Generierung
   (KI-Protokoll) und, mit Anleitungs-Kopf, als protokoll-prompt.txt im Export. */
const PROTOKOLL_SYSTEM = `Du bist Assistent eines Baugutachters. Beigefügt sind die Rohdaten einer
Gebäudebesichtigung (protokoll-rohdaten.md) — chronologische Foto-Labels mit
GPS-Koordinaten und transkribierte Sprachnotizen — sowie ggf. die Fotos selbst.

Erstelle daraus ein professionelles Besichtigungsprotokoll in deutscher Sprache.

ZWECK
Das Protokoll dokumentiert wertrelevante Feststellungen am Gebäude
(Zustand, Mängel, Ausstattung, bauliche Details) als Grundlage für eine
spätere Schätzung des Gebäudewerts.

VORGEHEN
1. Gruppiere Fotos und Sprachnotizen thematisch (z. B. nach Geschoss/Raum/
   Bauteil), erkennbar aus Labels, Transkripten und zeitlicher Abfolge.
2. Verknüpfe jede Feststellung mit den zugehörigen Foto-Dateinamen als
   Beleg-Referenz, z. B. (Foto: 002_rueckraum-hinten.jpg).
3. Unterscheide klar zwischen dokumentierten Beobachtungen (aus den Rohdaten)
   und deiner Einordnung (als solche kennzeichnen). Erfinde keine
   Feststellungen, die nicht in den Rohdaten stehen.
4. Korrigiere offensichtliche Spracherkennungs-Verwechslungen aus dem Kontext
   und kennzeichne sie als [erkannt: X, vermutlich gemeint: Y].
5. Markiere typischerweise wertrelevante Feststellungen (Feuchteschäden,
   Modernisierungsstand, Bauteilzustand) in einer eigenen Zusammenfassung —
   ohne selbst einen Wert zu schätzen.

STRUKTUR
1. Kopfdaten (Objekt, Adresse, Datum, Bearbeiter)
2. Zusammenfassung der wesentlichen Feststellungen
3. Feststellungen im Detail (thematisch gegliedert, mit Foto-Referenzen)
4. Auffälligkeiten / potenziell wertrelevante Punkte
5. Offene Punkte / empfohlene Nachprüfungen
6. Anlagenverzeichnis (alle Fotos mit Label und ggf. GPS)

FORMAT
Sachlicher Gutachter-Ton, vollständige Sätze. Lücken oder unklare
Transkripte als [unklar: …] kennzeichnen statt raten.`;

/* Liegt jedem Export bei, damit das Paket selbsterklärend ist. */
const PROTOKOLL_PROMPT = `ANLEITUNG: Diese Datei zusammen mit protokoll-rohdaten.md
(und optional den Fotos aus fotos/) in claude.ai hochladen bzw. einfügen.

---

` + PROTOKOLL_SYSTEM;

function erzeugeProtokollRohdaten(b, fotos, notizen) {
  let md = `# Besichtigung: ${b.titel}\n`;
  md += `- Adresse: ${b.adresse || '—'}\n`;
  md += `- Erstellt: ${formatDatumZeit(b.erstelltAm)}\n`;
  md += `- Abgeschlossen: ${b.abgeschlossenAm ? formatDatumZeit(b.abgeschlossenAm) : '—'}\n`;
  md += `- Freitextnotiz: ${b.freitextNotiz || '—'}\n`;
  md += `\n## Fotos (chronologisch)\n`;
  if (!fotos.length) md += '_keine Fotos erfasst_\n';
  fotos.forEach((f, i) => {
    md += `${i + 1}. [${f.dateiname}] Label: "${f.labelText}" — aufgenommen ${formatZeit(f.aufgenommenAm)} — GPS: ${gpsText(f.gpsLat, f.gpsLon) || 'nicht verfügbar'}\n`;
  });
  md += `\n## Sprachnotizen (chronologisch, transkribiert)\n`;
  if (!notizen.length) md += '_keine Sprachnotizen erfasst_\n';
  notizen.forEach((n, i) => {
    md += `${i + 1}. (${formatDauer(n.dauer)}, aufgenommen ${formatZeit(n.aufgenommenAm)})\n`;
    md += `   "${n.transkript || `[kein Transkript vorhanden — siehe Audiodatei ${n.dateiname}]`}"\n`;
  });
  return md;
}

// ---------- KI-Protokoll (docs/KONZEPT-PWA-PROTOKOLL.md) ----------

/** Verkleinert ein Foto auf maxKante Pixel und liefert Base64-JPEG (ohne data:-Präfix). */
async function verkleinereBild(blob, maxKante) {
  const bild = await new Promise((ok, nein) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); nein(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
  const faktor = Math.min(1, maxKante / Math.max(bild.width, bild.height));
  const leinwand = document.createElement('canvas');
  leinwand.width = Math.max(1, Math.round(bild.width * faktor));
  leinwand.height = Math.max(1, Math.round(bild.height * faktor));
  leinwand.getContext('2d').drawImage(bild, 0, 0, leinwand.width, leinwand.height);
  return leinwand.toDataURL('image/jpeg', 0.8).split(',')[1];
}

/** Ruft die Claude API direkt aus dem Browser auf (SSE-Streaming) und liefert den Protokolltext. */
async function rufeClaudeAuf(b, mitFotos, signal, aufText) {
  const schluessel = localStorage.getItem('anthropicApiKey');
  const fotos = [...b.fotos].sort((a, c) => a.aufgenommenAm < c.aufgenommenAm ? -1 : 1);
  const notizen = [...b.sprachnotizen].sort((a, c) => a.aufgenommenAm < c.aufgenommenAm ? -1 : 1);
  const rohdaten = erzeugeProtokollRohdaten(b, fotos, notizen);

  const inhalte = [];
  if (mitFotos) {
    for (const foto of fotos) {
      const blob = await medienLaden(foto.id);
      if (!blob) continue;
      try {
        inhalte.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: await verkleinereBild(blob, 1024) }
        });
      } catch (_) { /* einzelnes defektes Bild überspringen */ }
    }
  }
  inhalte.push({
    type: 'text',
    text: 'Anbei die Rohdaten der Besichtigung (protokoll-rohdaten.md).' +
      (mitFotos && inhalte.length ? ' Die vorangestellten Bilder sind die referenzierten Fotos in chronologischer Reihenfolge (gleiche Reihenfolge wie die Fotoliste).' : '') +
      '\n\n' + rohdaten
  });

  const antwort = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': schluessel,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: KI_MODELL,
      max_tokens: 16000,
      stream: true,
      thinking: { type: 'adaptive' },
      system: PROTOKOLL_SYSTEM,
      messages: [{ role: 'user', content: inhalte }]
    })
  });

  if (!antwort.ok) {
    let detail = '';
    try { detail = (await antwort.json()).error?.message || ''; } catch (_) {}
    const fehler = new Error(detail || 'HTTP ' + antwort.status);
    fehler.status = antwort.status;
    throw fehler;
  }

  // SSE-Stream lesen: text_delta-Ereignisse akkumulieren
  const leser = antwort.body.getReader();
  const dekoder = new TextDecoder();
  let puffer = '', text = '';
  while (true) {
    const { done, value } = await leser.read();
    if (done) break;
    puffer += dekoder.decode(value, { stream: true });
    const zeilen = puffer.split('\n');
    puffer = zeilen.pop();
    for (const zeile of zeilen) {
      if (!zeile.startsWith('data: ')) continue;
      let ereignis;
      try { ereignis = JSON.parse(zeile.slice(6)); } catch (_) { continue; }
      if (ereignis.type === 'content_block_delta' && ereignis.delta && ereignis.delta.type === 'text_delta') {
        text += ereignis.delta.text;
        aufText(text);
      } else if (ereignis.type === 'error') {
        throw new Error((ereignis.error && ereignis.error.message) || 'Stream-Fehler');
      }
    }
  }
  if (!text.trim()) throw new Error('Leere Antwort erhalten — bitte erneut versuchen.');
  return text;
}

/** Minimaler Markdown-Renderer für die Protokoll-Anzeige (Überschriften, Listen, Fett). */
function mdZuHtml(md) {
  let html = '', listeOffen = false, absatz = [];
  const inline = t => escapeHTML(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const schliesseAbsatz = () => { if (absatz.length) { html += '<p>' + absatz.join('<br>') + '</p>'; absatz = []; } };
  const schliesseListe = () => { if (listeOffen) { html += '</ul>'; listeOffen = false; } };
  for (const zeile of md.split('\n')) {
    const t = zeile.trim();
    if (!t) { schliesseAbsatz(); schliesseListe(); continue; }
    const ueberschrift = t.match(/^(#{1,4})\s+(.*)/);
    if (ueberschrift) {
      schliesseAbsatz(); schliesseListe();
      const stufe = Math.min(ueberschrift[1].length + 1, 5);
      html += `<h${stufe}>${inline(ueberschrift[2])}</h${stufe}>`;
      continue;
    }
    const punkt = t.match(/^[-*•]\s+(.*)/) || t.match(/^\d+[.)]\s+(.*)/);
    if (punkt) {
      schliesseAbsatz();
      if (!listeOffen) { html += '<ul>'; listeOffen = true; }
      html += '<li>' + inline(punkt[1]) + '</li>';
      continue;
    }
    schliesseListe();
    absatz.push(inline(t));
  }
  schliesseAbsatz(); schliesseListe();
  return html;
}

/** Bereich „KI-Protokoll" im Detail-Screen (nur bei abgeschlossener Besichtigung). */
function kiProtokollSektion(b) {
  const online = navigator.onLine;
  const vorhanden = b.protokoll && b.protokoll.text;
  return `
    <div class="sektion-titel">KI-Protokoll</div>
    <div class="karte" style="cursor:default">
      ${vorhanden ? `
        <div class="unterzeile" style="margin-bottom:10px">Erstellt am ${formatDatumZeit(b.protokoll.erstelltAm)}${b.protokoll.mitFotos ? ' · mit Foto-Analyse' : ''}</div>
        <button class="btn btn-primaer btn-klein" id="d-prot-anzeigen">Protokoll anzeigen</button>
        <button class="btn btn-sekundaer btn-klein" id="d-prot-neu" ${online ? '' : 'disabled'} style="margin-bottom:0">Neu erstellen</button>`
      : `
        <div class="unterzeile" style="margin-bottom:10px">Erzeugt per Claude ein Besichtigungsprotokoll aus den Rohdaten${einstellung('fotosAnalysieren', true) && b.fotos.length ? ' und Fotos' : ''}.</div>
        <button class="btn btn-primaer btn-klein" id="d-prot-erstellen" ${online ? '' : 'disabled'} style="margin-bottom:0">✨ KI-Protokoll erstellen</button>`}
      ${online ? '' : '<div class="fussnote" style="margin:10px 0 0">Offline — die Protokollerzeugung braucht Internet.</div>'}
    </div>`;
}

/** Einstieg vom Detail-Screen: Key prüfen, Erstnutzungs-Hinweis, dann Erzeugung starten. */
function starteKiProtokoll(b) {
  if (!localStorage.getItem('anthropicApiKey')) {
    alert('Bitte zuerst den Anthropic API-Key in den Einstellungen hinterlegen.');
    navigiere({ name: 'einstellungen' });
    return;
  }
  if (!localStorage.getItem('protokollHinweisOk')) {
    const mitFotos = einstellung('fotosAnalysieren', true) && b.fotos.length > 0;
    if (!confirm('Zur Protokollerzeugung werden die Transkripte' + (mitFotos ? ' und Fotos' : '') +
      ' dieser Besichtigung an Anthropic (Claude API) übertragen. Fortfahren?')) return;
    localStorage.setItem('protokollHinweisOk', '1');
  }
  navigiere({ name: 'protokoll', id: b.id, neu: true });
}

export { KI_MODELL, testeApiKey, PROTOKOLL_SYSTEM, PROTOKOLL_PROMPT, erzeugeProtokollRohdaten,
         rufeClaudeAuf, mdZuHtml, kiProtokollSektion, starteKiProtokoll };
