import { $ } from '../hilfen.js';
import { besichtigungen, speichereDaten } from '../speicher.js';
import { kopfzeile, bindeZurueck, navigiere } from '../router.js';
// ---------- Screen 2: Neue Besichtigung ----------

function zeigeNeu(app) {
  app.innerHTML = `
    ${kopfzeile('Neue Besichtigung', { name: 'liste' })}
    <div class="inhalt ohne-leiste">
      <div class="feldgruppe">
        <label>Titel *</label>
        <input id="f-titel" placeholder="z. B. Adresse oder Kurzname" autocomplete="off">
        <div class="trenner"></div>
        <label>Adresse (optional)</label>
        <input id="f-adresse" placeholder="Straße, Ort" autocomplete="off">
        <div class="trenner"></div>
        <label>Freitextnotiz (optional)</label>
        <textarea id="f-notiz" rows="3" placeholder="Auftrag, Besonderheiten …"></textarea>
      </div>
      <button class="btn btn-primaer" id="f-anlegen" disabled>Anlegen</button>
    </div>`;

  bindeZurueck({ name: 'liste' });
  const titel = $('#f-titel');
  titel.oninput = () => { $('#f-anlegen').disabled = !titel.value.trim(); };
  $('#f-anlegen').onclick = () => {
    const b = {
      id: crypto.randomUUID(),
      titel: titel.value.trim(),
      adresse: $('#f-adresse').value.trim() || null,
      freitextNotiz: $('#f-notiz').value.trim() || null,
      erstelltAm: new Date().toISOString(),
      abgeschlossenAm: null,
      status: 'offen',
      fotos: [],
      sprachnotizen: []
    };
    besichtigungen.unshift(b);
    speichereDaten();
    navigiere({ name: 'detail', id: b.id });
  };
  titel.focus();
}

export { zeigeNeu };
