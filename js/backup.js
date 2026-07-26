import { formatDatumZeit, isoDatum, slugErzeugen } from './hilfen.js';
import { besichtigungen, speichereDaten, einstellung, medienLaden, medienSpeichern } from './speicher.js';
import { zipErstellen, zipLesen } from './zip.js';
import { PROTOKOLL_PROMPT, erzeugeProtokollRohdaten } from './ki.js';
// ---------- Backup: kompletter Speicherstand als ZIP ----------

const BACKUP_VERSION = 1;

async function exportiereBackup() {
  const encoder = new TextEncoder();
  const eintraege = [];
  const medienTypen = {};

  for (const b of besichtigungen) {
    for (const m of [...b.fotos, ...b.sprachnotizen]) {
      const blob = await medienLaden(m.id);
      if (!blob) continue;
      medienTypen[m.id] = blob.type || '';
      eintraege.push({ name: `medien/${m.id}`, daten: new Uint8Array(await blob.arrayBuffer()) });
    }
  }
  eintraege.unshift({
    name: 'backup.json',
    daten: encoder.encode(JSON.stringify({
      version: BACKUP_VERSION,
      exportiertAm: new Date().toISOString(),
      besichtigungen,
      medienTypen
    }, null, 2))
  });

  const name = `Besichtigung_Backup_${isoDatum(new Date().toISOString())}.zip`;
  const zipBlob = zipErstellen(eintraege);
  const datei = new File([zipBlob], name, { type: 'application/zip' });
  if (navigator.canShare && navigator.canShare({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: 'Besichtigungs-Backup' }); return; }
    catch (f) { if (f && f.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Spielt ein Backup-ZIP ein. Besichtigungen mit gleicher ID werden ersetzt,
    neue werden ergänzt — bestehende andere bleiben unberührt. */
async function importiereBackup(datei) {
  const dateien = zipLesen(await datei.arrayBuffer());
  const backupBytes = dateien.get('backup.json');
  if (!backupBytes) throw new Error('backup.json fehlt — kein Backup dieser App.');
  const backup = JSON.parse(new TextDecoder().decode(backupBytes));
  if (!Array.isArray(backup.besichtigungen)) throw new Error('Backup-Inhalt unlesbar.');
  if (backup.version > BACKUP_VERSION) throw new Error('Backup stammt aus einer neueren App-Version.');

  if (!confirm(`Backup vom ${formatDatumZeit(backup.exportiertAm)} mit ` +
    `${backup.besichtigungen.length} Besichtigung(en) einspielen?\n` +
    'Besichtigungen mit gleicher ID werden ersetzt, andere bleiben erhalten.')) return false;

  const typen = backup.medienTypen || {};
  for (const [name, daten] of dateien) {
    if (!name.startsWith('medien/')) continue;
    const id = name.slice('medien/'.length);
    await medienSpeichern(id, new Blob([daten], { type: typen[id] || '' }));
  }
  for (const neu of backup.besichtigungen) {
    const index = besichtigungen.findIndex(x => x.id === neu.id);
    if (index >= 0) besichtigungen[index] = neu;
    else besichtigungen.push(neu);
  }
  speichereDaten();
  return true;
}

// ---------- Export einer Besichtigung (Spec 7.4) ----------

async function exportiere(b) {
  const ueberzug = document.createElement('div');
  ueberzug.className = 'ueberzug';
  ueberzug.innerHTML = '<div class="box">Export-Paket wird erstellt …</div>';
  document.body.appendChild(ueberzug);

  try {
    const audioAn = einstellung('audioMitExportieren', true);
    const fotos = [...b.fotos].sort((a, c) => a.aufgenommenAm < c.aufgenommenAm ? -1 : 1);
    const notizen = [...b.sprachnotizen].sort((a, c) => a.aufgenommenAm < c.aufgenommenAm ? -1 : 1);
    const encoder = new TextEncoder();
    const basis = `Besichtigung_${slugErzeugen(b.titel) || 'export'}_${isoDatum(b.erstelltAm)}`;

    const eintraege = [
      { name: `${basis}/protokoll-rohdaten.md`, daten: encoder.encode(erzeugeProtokollRohdaten(b, fotos, notizen)) },
      { name: `${basis}/protokoll-prompt.txt`, daten: encoder.encode(PROTOKOLL_PROMPT) },
      ...(b.protokoll && b.protokoll.text
        ? [{ name: `${basis}/protokoll.md`, daten: encoder.encode(b.protokoll.text) }]
        : []),
      {
        name: `${basis}/manifest.json`,
        daten: encoder.encode(JSON.stringify({
          titel: b.titel, adresse: b.adresse, erstelltAm: b.erstelltAm,
          abgeschlossenAm: b.abgeschlossenAm, freitextNotiz: b.freitextNotiz,
          exportiertAm: new Date().toISOString(),
          audioEnthalten: audioAn && notizen.length > 0,
          fotos: fotos.map(f => ({
            laufendeNr: f.laufendeNr, dateiname: f.dateiname, label: f.labelText,
            transkriptRoh: f.transkriptRoh, aufgenommenAm: f.aufgenommenAm,
            gpsLat: f.gpsLat, gpsLon: f.gpsLon
          })),
          sprachnotizen: notizen.map(n => ({
            dateiname: n.dateiname, transkript: n.transkript,
            dauerSekunden: n.dauer, aufgenommenAm: n.aufgenommenAm
          }))
        }, null, 2))
      }
    ];

    for (const f of fotos) {
      const blob = await medienLaden(f.id);
      if (blob) eintraege.push({ name: `${basis}/fotos/${f.dateiname}`, daten: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (audioAn) {
      for (const n of notizen) {
        const blob = await medienLaden(n.id);
        if (blob) eintraege.push({ name: `${basis}/sprachnotizen/${n.dateiname}`, daten: new Uint8Array(await blob.arrayBuffer()) });
      }
    }

    const zipBlob = zipErstellen(eintraege);
    const datei = new File([zipBlob], `${basis}.zip`, { type: 'application/zip' });

    // iOS-Share-Sheet wie in der echten App (AirDrop, „In Dateien sichern" …), sonst Download
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      try {
        await navigator.share({ files: [datei], title: b.titel });
        return;
      } catch (fehler) {
        if (fehler && fehler.name === 'AbortError') return; // Nutzer hat abgebrochen
      }
    }
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${basis}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (fehler) {
    alert('Export fehlgeschlagen: ' + fehler.message);
  } finally {
    ueberzug.remove();
  }
}

export { BACKUP_VERSION, exportiereBackup, importiereBackup, exportiere };
