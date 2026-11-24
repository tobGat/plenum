// Toleranter Import von Lektionen aus Chatbot-Antworten oder .plenum-Dateien
import JSON5 from 'json5';
import { normalizeLesson } from '../shared/schema.js';
import { isObj } from '../shared/util.js';

// JSON aus dem Text lösen: Codeblock bevorzugen, sonst erste ausgeglichene Klammer (String-bewusst)
export function extractJson(raw) {
  let t = String(raw || '').replace(/^﻿/, '').replace(/[​-‍⁠﻿]/g, '').replace(/ /g, ' ');
  const fence = t.match(/```[a-zA-Z0-9]*[ \t]*\r?\n?([\s\S]*?)(```|$)/);
  if (fence && /[{[]/.test(fence[1])) t = fence[1];
  const start = t.search(/[{[]/);
  if (start < 0) return { text: '', truncated: false };
  let depth = 0, inStr = false, q = '', esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === q) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  return end < 0 ? { text: t.slice(start), truncated: true } : { text: t.slice(start, end + 1), truncated: false };
}

// Typografische Anführungszeichen nur dort ersetzen, wo sie JSON-Struktur sind („…“ im Text bleibt)
export const fixQuotes = (t) => t.replace(/([{[,:]\s*)[“”„«»]/g, '$1"').replace(/[“”«»](\s*[:,}\]])/g, '"$1');

let lastError = '';
function tryParse(t) {
  try { return JSON.parse(t); } catch (e) { lastError = e.message; }
  try { return JSON5.parse(t); } catch (e) { lastError = e.message.replace(/^JSON5: /, ''); }
  return undefined;
}

// Abgeschnittene Antwort: bis zur letzten vollständigen Folie im "slides"-Array kürzen
function cutTruncated(t) {
  const k = t.search(/["']?slides["']?\s*:\s*\[/);
  if (k < 0) return null;
  const arr = t.indexOf('[', k);
  let depth = 0, inStr = false, q = '', esc = false, lastEnd = -1;
  for (let i = arr + 1; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === q) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) lastEnd = i; if (depth < 0) break; }
  }
  return lastEnd < 0 ? null : t.slice(0, lastEnd + 1) + ']}';
}

function findPlaceholders(v, out = []) {
  if (typeof v === 'string') { if (/^\s*(\.\.\.|…|\[\.\.\.\]|\[…\]|etc\.?)\s*$/i.test(v) || /weitere folien|und so weiter|usw\./i.test(v)) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => findPlaceholders(x, out));
  else if (isObj(v)) Object.values(v).forEach((x) => findPlaceholders(x, out));
  return out;
}

export function parseLessonText(raw, { appVersion = '', media = null } = {}) {
  const notes = [];
  const { text, truncated } = extractJson(raw);
  if (!text) return { lesson: null, errors: ['In der Antwort wurde kein JSON gefunden. Bitte die komplette Antwort des Chatbots einfügen.'], repairs: [], truncated: false };
  const fixed = fixQuotes(text);
  let data = tryParse(fixed);
  if (data === undefined && truncated) {
    const cut = cutTruncated(fixed);
    if (cut) { data = tryParse(cut); if (data !== undefined) notes.push('Die Antwort war abgeschnitten: Die vollständigen Folien wurden übernommen. Den Chatbot mit „weiter“ den Rest schreiben lassen und nachträglich einfügen.'); }
  }
  if (data === undefined) return { lesson: null, errors: [`Das JSON ist fehlerhaft und konnte nicht repariert werden (${lastError}). Tipp: Den Chatbot bitten, nur einen einzigen JSON-Codeblock ohne Kommentare auszugeben.`], repairs: [], truncated };
  if (fixed !== text) notes.push('Typografische Anführungszeichen in der JSON-Struktur ersetzt');
  const ph = findPlaceholders(data);
  if (ph.length) notes.push(`Platzhalter gefunden (${[...new Set(ph)].slice(0, 3).map((x) => `„${x}“`).join(', ')}) – bitte die KI alles vollständig ausschreiben lassen`);
  if (media && data && typeof data === 'object' && !Array.isArray(data) && !data.media) data.media = media;
  const r = normalizeLesson(data, { appVersion, lenient: true });
  if (r.lesson) r.lesson.slides.forEach((s, i) => {
    const src = [s.source, s.chart && s.chart.source, s.compareSource].filter(Boolean).join(' ');
    if (src && !/fiktiv|beispiel/i.test(src)) notes.push(`Folie ${i + 1}: Quelle „${src.slice(0, 80)}“ bitte prüfen`);
  });
  return { lesson: r.lesson, errors: r.errors, repairs: [...notes, ...r.repairs], truncated };
}

// Mehrere Lektionen (Sicherungsdatei) oder eine einzelne
export function parseImport(raw, opts) {
  const { text } = extractJson(raw);
  const data = text ? tryParse(fixQuotes(text)) : undefined;
  if (isObj(data) && data.format === 'plenum-sicherung' && Array.isArray(data.lessons)) {
    return { bundle: data.lessons.map((l) => normalizeLesson(l, opts)).filter((x) => x.lesson) };
  }
  return parseLessonText(raw, opts);
}
