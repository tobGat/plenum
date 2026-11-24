// Kleine Hilfsfunktionen für Server und Browser (ohne DOM, ohne node:-Module)

// Zufällige ID (funktioniert auch auf Schülergeräten ohne „sicheren Kontext“)
export function newId(prefix = '') {
  const a = new Uint8Array(9);
  globalThis.crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

// Kurzer, stabiler Hash (FNV-1a) – für Fingerabdrücke von Folien
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const asArr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
export const str = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

// Zahl aus Texten wie „12,5“, „1.234“, „45 %“, „3 Mio.“
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = str(v).trim().replace(/\s|%|€| /g, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,5
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ''); // 1,234.5
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

// Dateiname aus einem Titel
export function slug(s, max = 50) {
  return str(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'lektion';
}

export const clone = (v) => JSON.parse(JSON.stringify(v));
