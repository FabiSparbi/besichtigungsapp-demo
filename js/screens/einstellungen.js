import { $, escapeHTML } from '../hilfen.js';
import { einstellung } from '../speicher.js';
import { kopfzeile, bindeZurueck } from '../router.js';
import { testeApiKey } from '../ki.js';
import { exportiereBackup, importiereBackup } from '../backup.js';
// ---------- Screen 8: Einstellungen ----------

function zeigeEinstellungen(app) {
  const audioAn = einstellung('audioMitExportieren', true);
  app.innerHTML = `
    ${kopfzeile('Einstellungen', { name: 'liste' })}
    <div class="inhalt ohne-leiste">
      <div class="schalter-zeile">
        <span>Audiodateien mitexportieren</span>
        <input type="checkbox" id="e-audio" ${audioAn ? 'checked' : ''}>
      </div>
      <div class="fussnote" style="margin-top:8px">Wenn aktiv, enthält das Export-ZIP zusätzlich die Audiodateien als Fallback bei fehlerhaften Transkripten.</div>
      <div class="sektion-titel">KI-Protokoll</div>
      <div class="feldgruppe" style="margin-bottom:10px">
        <label>Anthropic API-Key</label>
        <input id="e-key" type="password" placeholder="sk-ant-…" autocomplete="off"
               value="${escapeHTML(localStorage.getItem('anthropicApiKey') || '')}">
      </div>
      <button class="btn btn-sekundaer btn-klein" id="e-key-test">Key testen</button>
      <div class="fussnote" id="e-key-status" style="margin:-2px 4px 14px"></div>
      <div class="schalter-zeile">
        <span>Fotos mitanalysieren</span>
        <input type="checkbox" id="e-fotos" ${einstellung('fotosAnalysieren', true) ? 'checked' : ''}>
      </div>
      <div class="fussnote" style="margin-top:8px">Der Key wird nur lokal auf diesem Gerät gespeichert und direkt an die Anthropic-API gesendet — er landet nie auf einem anderen Server. Empfehlung: eigener Workspace mit Ausgabenlimit (console.anthropic.com). „Fotos mitanalysieren" ergänzt im Protokoll „aus Foto erkennbar…"-Feststellungen.</div>
      <div class="sektion-titel">Backup</div>
      <button class="btn btn-primaer btn-klein" id="e-backup-export">Backup exportieren (ZIP)</button>
      <button class="btn btn-sekundaer btn-klein" id="e-backup-import">Backup einspielen …</button>
      <input type="file" accept=".zip,application/zip" id="e-backup-datei" hidden>
      <div class="fussnote" id="e-backup-status" style="margin:-2px 4px 14px">Browser-Speicher kann vom System geräumt werden — regelmäßige Backups sichern alle Besichtigungen samt Fotos und Audio.</div>
      <div class="sektion-titel">Über diesen Prototyp</div>
      <div class="metabox" style="margin-top:0">
        <div class="m-zeile">Dies ist eine Web-Demo der geplanten iOS-App. Unterschiede zur echten App:</div>
        <div class="m-zeile" style="font-size:13px;color:var(--sekundaer)">
          · Spracherkennung läuft über den Browser (Internet nötig), in der App on-device und offline<br>
          · Daten liegen im Browser-Speicher, in der App dauerhaft und robust auf dem Gerät<br>
          · Der Export (protokoll-rohdaten.md, manifest.json, Fotos, Audio) entspricht bereits dem echten Format
        </div>
      </div>
    </div>`;
  bindeZurueck({ name: 'liste' });
  $('#e-audio').onchange = ev => localStorage.setItem('audioMitExportieren', ev.target.checked ? '1' : '0');
  $('#e-fotos').onchange = ev => localStorage.setItem('fotosAnalysieren', ev.target.checked ? '1' : '0');
  const keyStatus = $('#e-key-status');
  $('#e-key').onchange = ev => {
    const wert = ev.target.value.trim();
    if (wert) localStorage.setItem('anthropicApiKey', wert);
    else localStorage.removeItem('anthropicApiKey');
    keyStatus.textContent = (wert && !wert.startsWith('sk-ant-'))
      ? '⚠️ Ungewöhnliches Format — Anthropic-Keys beginnen üblicherweise mit „sk-ant-".'
      : '';
  };
  $('#e-key-test').onclick = async ev => {
    const schluessel = $('#e-key').value.trim();
    if (!schluessel) { keyStatus.textContent = 'Bitte zuerst einen Key eintragen.'; return; }
    localStorage.setItem('anthropicApiKey', schluessel);
    ev.target.disabled = true;
    keyStatus.textContent = '⏳ Teste Key …';
    try {
      const ergebnis = await testeApiKey(schluessel);
      keyStatus.textContent = ergebnis.ok ? '✅ Key funktioniert.' : '❌ ' + ergebnis.meldung;
    } catch (fehler) {
      keyStatus.textContent = '❌ Netzwerkfehler: ' + fehler.message;
    } finally {
      ev.target.disabled = false;
    }
  };

  const backupStatus = $('#e-backup-status');
  $('#e-backup-export').onclick = async ev => {
    ev.target.disabled = true;
    backupStatus.textContent = '⏳ Backup wird erstellt …';
    try {
      await exportiereBackup();
      backupStatus.textContent = '✅ Backup erstellt.';
    } catch (fehler) {
      backupStatus.textContent = '❌ Backup fehlgeschlagen: ' + fehler.message;
    } finally {
      ev.target.disabled = false;
    }
  };
  const backupDatei = $('#e-backup-datei');
  $('#e-backup-import').onclick = () => backupDatei.click();
  backupDatei.onchange = async () => {
    const datei = backupDatei.files[0];
    backupDatei.value = '';
    if (!datei) return;
    backupStatus.textContent = '⏳ Backup wird eingespielt …';
    try {
      const uebernommen = await importiereBackup(datei);
      backupStatus.textContent = uebernommen ? '✅ Backup eingespielt.' : '';
    } catch (fehler) {
      backupStatus.textContent = '❌ Import fehlgeschlagen: ' + fehler.message;
    }
  };
}

export { zeigeEinstellungen };
