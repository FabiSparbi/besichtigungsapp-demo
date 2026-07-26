import { $, escapeHTML, formatDatum } from '../hilfen.js';
import { besichtigungen } from '../speicher.js';
import { kopfzeile, navigiere } from '../router.js';
// ---------- Screen 1: Besichtigungsliste ----------

function zeigeListe(app) {
  const offene = besichtigungen.filter(b => b.status === 'offen');
  const zu = besichtigungen.filter(b => b.status === 'abgeschlossen');

  const kartenHTML = liste => liste.map(b => `
    <div class="karte" data-id="${b.id}">
      <h3>${escapeHTML(b.titel)}</h3>
      ${b.adresse ? `<div class="unterzeile">${escapeHTML(b.adresse)}</div>` : ''}
      <div class="meta">${formatDatum(b.erstelltAm)} · ${b.fotos.length} Fotos · ${b.sprachnotizen.length} Notizen</div>
    </div>`).join('');

  app.innerHTML = `
    ${kopfzeile('Besichtigungen', null, '<button class="rechts" id="k-neu" style="font-size:24px">＋</button>')}
    <div class="inhalt ohne-leiste">
      <div class="hinweisbanner">Prototyp — Demo der geplanten iOS-App. Daten bleiben lokal in diesem Browser.</div>
      ${besichtigungen.length === 0 ? `
        <div class="leer"><span class="symbol">🏠</span>Noch keine Besichtigungen.<br>Mit „＋" die erste anlegen.</div>` : `
        ${offene.length ? `<div class="sektion-titel">Offen</div>${kartenHTML(offene)}` : ''}
        ${zu.length ? `<div class="sektion-titel">Abgeschlossen</div>${kartenHTML(zu)}` : ''}`}
      <button class="btn btn-sekundaer btn-klein" id="k-einstellungen" style="margin-top:18px">⚙️ Einstellungen</button>
    </div>`;

  $('#k-neu').onclick = () => navigiere({ name: 'neu' });
  $('#k-einstellungen').onclick = () => navigiere({ name: 'einstellungen' });
  app.querySelectorAll('.karte[data-id]').forEach(el => {
    el.onclick = () => navigiere({ name: 'detail', id: el.dataset.id });
  });
}

export { zeigeListe };
