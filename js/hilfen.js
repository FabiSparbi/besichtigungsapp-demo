// ---------- Hilfsfunktionen ----------

const $ = sel => document.querySelector(sel);

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const pad = (n, l = 2) => String(n).padStart(l, '0');

/** Kurze „Gespeichert"-Bestätigung unter einem Element einblenden. */
function zeigeGespeichert(nachElement) {
  if (!nachElement) return;
  const alt = document.getElementById('speicher-hinweis');
  if (alt) alt.remove();
  const el = document.createElement('div');
  el.id = 'speicher-hinweis';
  el.textContent = '✓ Gespeichert';
  el.style.cssText = 'color:var(--gruen);font-size:14px;font-weight:600;margin:6px 4px 10px';
  nachElement.insertAdjacentElement('afterend', el);
  setTimeout(() => el.remove(), 2000);
}

function formatDatum(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function formatDatumZeit(iso) {
  const d = new Date(iso);
  return `${formatDatum(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatZeit(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDauer(sek) {
  sek = Math.max(0, Math.round(sek));
  return `${pad(Math.floor(sek / 60))}:${pad(sek % 60)}`;
}
function isoDatum(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function gpsText(lat, lon) {
  if (lat == null || lon == null) return null;
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

// ---------- Slug-Logik (identisch zur iOS-App, Spec §7.1) ----------

function slugErzeugen(text, maxLaenge = 60) {
  let s = String(text).toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  let slug = '';
  for (const z of s) {
    if (/[a-z0-9]/.test(z)) slug += z;
    else if (/[\s\-_\/]/.test(z)) slug += '-';
  }
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (slug.length > maxLaenge) slug = slug.slice(0, maxLaenge).replace(/-$/, '');
  return slug;
}

function slugEindeutig(slug, vorhandene) {
  if (!vorhandene.has(slug)) return slug;
  let n = 2;
  while (vorhandene.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

function slugAusDateiname(name) {
  return name.replace(/\.[^.]+$/, '').replace(/^[^_]*_/, '');
}

export { $, escapeHTML, pad, zeigeGespeichert, formatDatum, formatDatumZeit, formatZeit,
         formatDauer, isoDatum, gpsText, slugErzeugen, slugEindeutig, slugAusDateiname };
