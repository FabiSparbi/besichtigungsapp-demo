// ---------- ZIP-Erzeugung (Store-Methode, ohne Bibliotheken) ----------

const crcTabelle = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(daten) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < daten.length; i++) c = crcTabelle[(c ^ daten[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipErstellen(eintraege) { // [{name, daten: Uint8Array}]
  const encoder = new TextEncoder();
  const teile = [], zentral = [];
  let offset = 0;
  for (const e of eintraege) {
    const nameBytes = encoder.encode(e.name);
    const crc = crc32(e.daten);
    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034b50, true);
    lokal.setUint16(4, 20, true);
    lokal.setUint16(6, 0x0800, true);          // UTF-8-Dateinamen
    lokal.setUint16(8, 0, true);               // Methode: Store
    lokal.setUint16(10, 0, true);
    lokal.setUint16(12, 0x58E1, true);         // festes Dummy-Datum
    lokal.setUint32(14, crc, true);
    lokal.setUint32(18, e.daten.length, true);
    lokal.setUint32(22, e.daten.length, true);
    lokal.setUint16(26, nameBytes.length, true);
    lokal.setUint16(28, 0, true);
    teile.push(new Uint8Array(lokal.buffer), nameBytes, e.daten);

    const zent = new DataView(new ArrayBuffer(46));
    zent.setUint32(0, 0x02014b50, true);
    zent.setUint16(4, 20, true);
    zent.setUint16(6, 20, true);
    zent.setUint16(8, 0x0800, true);
    zent.setUint16(10, 0, true);
    zent.setUint16(12, 0, true);
    zent.setUint16(14, 0x58E1, true);
    zent.setUint32(16, crc, true);
    zent.setUint32(20, e.daten.length, true);
    zent.setUint32(24, e.daten.length, true);
    zent.setUint16(28, nameBytes.length, true);
    zent.setUint32(42, offset, true);
    zentral.push(new Uint8Array(zent.buffer), nameBytes);
    offset += 30 + nameBytes.length + e.daten.length;
  }
  let zentralLaenge = 0;
  zentral.forEach(t => zentralLaenge += t.length);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(8, eintraege.length, true);
  ende.setUint16(10, eintraege.length, true);
  ende.setUint32(12, zentralLaenge, true);
  ende.setUint32(16, offset, true);
  return new Blob([...teile, ...zentral, new Uint8Array(ende.buffer)], { type: 'application/zip' });
}

/** Minimaler ZIP-Leser für Backups aus zipErstellen (nur Store-Methode).
    Liefert Map dateiname → Uint8Array. */
function zipLesen(puffer) {
  const dv = new DataView(puffer);
  // End-of-Central-Directory von hinten suchen (Kommentar max. 65535 Bytes)
  let eocd = -1;
  for (let i = puffer.byteLength - 22; i >= Math.max(0, puffer.byteLength - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei.');
  const anzahl = dv.getUint16(eocd + 10, true);
  let pos = dv.getUint32(eocd + 16, true);
  const dateien = new Map();
  const dekoder = new TextDecoder();
  for (let i = 0; i < anzahl; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP-Struktur ungültig.');
    const methode = dv.getUint16(pos + 10, true);
    const groesse = dv.getUint32(pos + 20, true);
    const nameLaenge = dv.getUint16(pos + 28, true);
    const extraLaenge = dv.getUint16(pos + 30, true);
    const kommentarLaenge = dv.getUint16(pos + 32, true);
    const lokalOffset = dv.getUint32(pos + 42, true);
    const name = dekoder.decode(new Uint8Array(puffer, pos + 46, nameLaenge));
    if (methode !== 0) throw new Error('Nur unkomprimierte Backups dieser App werden unterstützt.');
    // Datenposition über den lokalen Header ermitteln (Extra-Feld kann abweichen)
    const lokalNameLaenge = dv.getUint16(lokalOffset + 26, true);
    const lokalExtraLaenge = dv.getUint16(lokalOffset + 28, true);
    const datenStart = lokalOffset + 30 + lokalNameLaenge + lokalExtraLaenge;
    dateien.set(name, new Uint8Array(puffer, datenStart, groesse));
    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  return dateien;
}

export { zipErstellen, zipLesen };
