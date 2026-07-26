import { $, escapeHTML, formatDatumZeit, formatZeit, formatDauer } from '../hilfen.js';
import { speichereDaten, entferneBesichtigung, medienLoeschen, medienURL } from '../speicher.js';
import { kopfzeile, bindeZurueck, navigiere, render } from '../router.js';
import { kiProtokollSektion, starteKiProtokoll } from '../ki.js';
import { exportiere } from '../backup.js';
// ---------- Screen 3: Besichtigungs-Detail (Hub) ----------

function zeigeDetail(app, b) {
  if (!b) return navigiere({ name: 'liste' });

  const eintraege = [
    ...b.fotos.map(f => ({ art: 'foto', datum: f.aufgenommenAm, f })),
    ...b.sprachnotizen.map(n => ({ art: 'notiz', datum: n.aufgenommenAm, n }))
  ].sort((a, c) => a.datum < c.datum ? -1 : 1);

  const eintragHTML = e => e.art === 'foto' ? `
    <div class="zeile" data-foto="${e.f.id}">
      <img class="mini" data-medien="${e.f.id}" alt="">
      <div class="zeileninfo">
        <div class="titelzeile">${escapeHTML(e.f.labelText)}</div>
        <div class="datei">${escapeHTML(e.f.dateiname)}</div>
        <div class="zeit">${formatZeit(e.f.aufgenommenAm)} Uhr</div>
      </div>
    </div>` : `
    <div class="zeile" data-notiz="${e.n.id}">
      <div class="mini audio">🎙️</div>
      <div class="zeileninfo">
        <div class="titelzeile">${escapeHTML(e.n.transkript || 'Kein Transkript')}</div>
        <div class="zeit">${formatDauer(e.n.dauer)} · ${formatZeit(e.n.aufgenommenAm)} Uhr</div>
      </div>
    </div>`;

  const istOffen = b.status === 'offen';

  app.innerHTML = `
    ${kopfzeile(b.titel, { name: 'liste' }, '<button class="rechts" id="k-export">Export</button>')}
    <div class="inhalt ${istOffen ? '' : 'ohne-leiste'}">
      <div class="metabox" style="margin-top:0">
        <div class="m-zeile"><b>Titel</b>
          <input id="d-titel" style="width:100%;border:none;background:none;font:inherit;font-size:14px;outline:none"
                 value="${escapeHTML(b.titel)}"></div>
        <div class="m-zeile"><b>Adresse</b>
          <input id="d-adresse" style="width:100%;border:none;background:none;font:inherit;font-size:14px;outline:none"
                 placeholder="optional …" value="${escapeHTML(b.adresse || '')}"></div>
        <div class="m-zeile"><b>Erstellt</b>${formatDatumZeit(b.erstelltAm)}</div>
        ${b.abgeschlossenAm ? `<div class="m-zeile"><b>Abgeschlossen</b>${formatDatumZeit(b.abgeschlossenAm)}</div>` : ''}
        <div class="m-zeile"><b>Status</b><span class="status-punkt ${istOffen ? 'offen' : 'zu'}">${istOffen ? 'Offen' : 'Abgeschlossen'}</span></div>
        <div class="m-zeile"><b>Freitextnotiz</b>
          <input id="d-notiz" style="width:100%;border:none;background:none;font:inherit;font-size:14px;outline:none"
                 placeholder="optional …" value="${escapeHTML(b.freitextNotiz || '')}"></div>
      </div>

      <div class="sektion-titel">Erfassungen (${eintraege.length})</div>
      ${eintraege.length === 0
        ? '<div class="leer" style="padding:28px">Noch nichts erfasst — unten Foto oder Sprachnotiz aufnehmen.</div>'
        : eintraege.map(eintragHTML).join('')}

      ${istOffen ? '' : kiProtokollSektion(b)}
      ${istOffen
        ? '<button class="btn btn-sekundaer btn-klein" id="d-abschliessen" style="margin-top:16px">✓ Abschließen &amp; Exportieren</button>'
        : '<button class="btn btn-sekundaer btn-klein" id="d-oeffnen" style="margin-top:16px">Wieder öffnen</button>'}
      <button class="btn btn-rot" id="d-loeschen">Besichtigung löschen</button>
    </div>
    ${istOffen ? `
    <div class="aktionsleiste">
      <button class="btn btn-primaer" id="d-foto" style="flex:1">📷 Foto</button>
      <button class="btn btn-sekundaer" id="d-sprachnotiz" style="flex:1">🎙️ Sprachnotiz</button>
    </div>` : ''}`;

  bindeZurueck({ name: 'liste' });
  $('#d-titel').onchange = ev => {
    const neu = ev.target.value.trim();
    if (!neu) { ev.target.value = b.titel; return; } // Titel ist Pflichtfeld
    b.titel = neu;
    speichereDaten();
    const h1 = app.querySelector('.kopf h1');
    if (h1) h1.textContent = neu;
  };
  $('#d-adresse').onchange = ev => { b.adresse = ev.target.value.trim() || null; speichereDaten(); };
  $('#d-notiz').onchange = ev => { b.freitextNotiz = ev.target.value.trim() || null; speichereDaten(); };
  $('#k-export').onclick = () => exportiere(b);
  if (istOffen) {
    $('#d-foto').onclick = () => navigiere({ name: 'kamera', id: b.id });
    $('#d-sprachnotiz').onclick = () => navigiere({ name: 'sprachnotiz', id: b.id });
    $('#d-abschliessen').onclick = () => {
      if (!confirm('Besichtigung abschließen und Export-Paket erstellen?')) return;
      b.status = 'abgeschlossen';
      b.abgeschlossenAm = new Date().toISOString();
      speichereDaten();
      exportiere(b).then(() => render());
    };
  } else {
    $('#d-oeffnen').onclick = () => {
      b.status = 'offen';
      b.abgeschlossenAm = null;
      speichereDaten();
      render();
    };
    const anzeigen = $('#d-prot-anzeigen');
    if (anzeigen) anzeigen.onclick = () => navigiere({ name: 'protokoll', id: b.id });
    const neuKnopf = $('#d-prot-neu');
    if (neuKnopf) neuKnopf.onclick = () => starteKiProtokoll(b);
    const erstellenKnopf = $('#d-prot-erstellen');
    if (erstellenKnopf) erstellenKnopf.onclick = () => starteKiProtokoll(b);
  }
  $('#d-loeschen').onclick = () => {
    if (!confirm('Besichtigung samt aller Fotos und Sprachnotizen endgültig löschen?')) return;
    b.fotos.forEach(f => medienLoeschen(f.id));
    b.sprachnotizen.forEach(n => medienLoeschen(n.id));
    entferneBesichtigung(b.id);
    speichereDaten();
    navigiere({ name: 'liste' });
  };
  app.querySelectorAll('[data-foto]').forEach(el => {
    el.onclick = () => navigiere({ name: 'fotoDetail', id: b.id, fotoId: el.dataset.foto });
  });
  app.querySelectorAll('[data-notiz]').forEach(el => {
    el.onclick = () => navigiere({ name: 'notizDetail', id: b.id, notizId: el.dataset.notiz });
  });
  ladeMiniaturen(app);
}

async function ladeMiniaturen(app) {
  for (const img of app.querySelectorAll('img[data-medien]')) {
    const url = await medienURL(img.dataset.medien);
    if (url) img.src = url;
  }
}

export { zeigeDetail, ladeMiniaturen };
