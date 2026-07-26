// ---------- Persistenz: Metadaten in localStorage, Medien in IndexedDB ----------

// Einzige Quelle der Wahrheit. Bewusst const: ES-Module erlauben kein
// Neuzuweisen importierter Bindings — Änderungen laufen über Mutationen
// bzw. über entferneBesichtigung().
const besichtigungen = JSON.parse(localStorage.getItem('besichtigungen') || '[]');

function speichereDaten() {
  try {
    localStorage.setItem('besichtigungen', JSON.stringify(besichtigungen));
  } catch (fehler) {
    // Voller Speicher (QuotaExceededError) darf nicht stumm verschluckt werden.
    alert('Speichern fehlgeschlagen — der Browser-Speicher ist voll oder blockiert.\n' +
      'Bitte ein Backup exportieren (Einstellungen) und alte Besichtigungen löschen.');
  }
}
function einstellung(name, standard) {
  const wert = localStorage.getItem(name);
  return wert === null ? standard : wert === '1';
}

/** Entfernt eine Besichtigung aus dem Zustand (in-place, siehe const oben). */
function entferneBesichtigung(id) {
  const index = besichtigungen.findIndex(b => b.id === id);
  if (index >= 0) besichtigungen.splice(index, 1);
}

let dbPromise = null;
function oeffneDB() {
  if (!dbPromise) {
    dbPromise = new Promise((ok, nein) => {
      const anfrage = indexedDB.open('besichtigung-prototyp', 1);
      anfrage.onupgradeneeded = () => anfrage.result.createObjectStore('medien');
      anfrage.onsuccess = () => ok(anfrage.result);
      anfrage.onerror = () => nein(anfrage.error);
    });
  }
  return dbPromise;
}
async function medienSpeichern(schluessel, blob) {
  const db = await oeffneDB();
  return new Promise((ok, nein) => {
    const tx = db.transaction('medien', 'readwrite');
    tx.objectStore('medien').put(blob, schluessel);
    tx.oncomplete = ok;
    tx.onerror = () => nein(tx.error);
  });
}
async function medienLaden(schluessel) {
  const db = await oeffneDB();
  return new Promise((ok, nein) => {
    const anfrage = db.transaction('medien').objectStore('medien').get(schluessel);
    anfrage.onsuccess = () => ok(anfrage.result || null);
    anfrage.onerror = () => nein(anfrage.error);
  });
}
async function medienLoeschen(schluessel) {
  const db = await oeffneDB();
  db.transaction('medien', 'readwrite').objectStore('medien').delete(schluessel);
}
async function medienAlleSchluessel() {
  const db = await oeffneDB();
  return new Promise((ok, nein) => {
    const anfrage = db.transaction('medien').objectStore('medien').getAllKeys();
    anfrage.onsuccess = () => ok(anfrage.result || []);
    anfrage.onerror = () => nein(anfrage.error);
  });
}

/** Start-Abgleich: Blobs ohne Metadaten-Referenz entfernen (z. B. wenn der
    Metadaten-Write nach dem Blob-Write abgebrochen wurde). */
async function raeumeVerwaisteMedienAuf() {
  try {
    const referenziert = new Set();
    for (const b of besichtigungen) {
      b.fotos.forEach(f => referenziert.add(f.id));
      b.sprachnotizen.forEach(n => referenziert.add(n.id));
    }
    for (const schluessel of await medienAlleSchluessel()) {
      if (!referenziert.has(schluessel)) await medienLoeschen(schluessel);
    }
  } catch (_) { /* Aufräumen ist Best-Effort */ }
}

const urlCache = new Map();
async function medienURL(schluessel) {
  if (urlCache.has(schluessel)) return urlCache.get(schluessel);
  const blob = await medienLaden(schluessel);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(schluessel, url);
  return url;
}

export { besichtigungen, speichereDaten, einstellung, entferneBesichtigung,
         medienSpeichern, medienLaden, medienLoeschen, medienAlleSchluessel,
         raeumeVerwaisteMedienAuf, medienURL };
