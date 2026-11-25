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

// Häufigster Fehler von Chatbots: gerade Anführungszeichen mitten im Text ("Er sagte "Hallo" …") oder ein gerades
// Schlusszeichen nach „ – das beendet den JSON-Text zu früh. Ein " gilt nur als Ende, wenn danach JSON-Struktur folgt;
// sonst wird es zu „ bzw. “. Echte Zeilenumbrüche innerhalb von Texten werden maskiert.
export function fixInnerQuotes(t) {
  const start = t.search(/[{[]/);
  if (start < 0) return { text: t, count: 0 };
  let out = t.slice(0, start), inStr = false, esc = false, open = false, count = 0;
  const stack = []; // 'o' = Objekt, 'a' = Liste
  const closes = (i) => {
    const rest = t.slice(i + 1), m = rest.match(/^\s*(\S)/);
    if (!m) return true;
    if (m[1] === '}' || m[1] === ']' || m[1] === ':') return true;
    if (m[1] !== ',') return false;
    // In einem Objekt muss nach dem Komma ein Schlüssel ("name":) folgen, in einer Liste ein weiterer Wert
    if (stack[stack.length - 1] === 'o') return /^\s*,\s*("[^"\n]{0,60}"\s*:|[}\]]|$)/.test(rest);
    return /^\s*,\s*(["{[\]}]|-?\d|true\b|false\b|null\b|$)/.test(rest);
  };
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (!inStr) {
      if (ch === '"') { inStr = true; open = false; }
      else if (ch === '{') stack.push('o');
      else if (ch === '[') stack.push('a');
      else if (ch === '}' || ch === ']') stack.pop();
      out += ch; continue;
    }
    if (esc) { esc = false; out += ch; continue; }
    if (ch === '\\') { esc = true; out += ch; continue; }
    if (ch === '„') { open = true; out += ch; continue; }
    if (ch === '“' || ch === '”') { open = false; out += ch; continue; }
    if (ch === '\n') { out += '\\n'; count++; continue; }
    if (ch === '\r') continue;
    if (ch === '"') {
      if (closes(i)) { inStr = false; out += ch; continue; }
      out += open ? '“' : '„'; open = !open; count++; continue;
    }
    out += ch;
  }
  return { text: out, count };
}

// Stelle des Fehlers als kurzer Ausschnitt („Zeile:Spalte“ aus der Fehlermeldung)
function errorSpot(t, msg) {
  let m = msg.match(/at (\d+):(\d+)/), line, col;
  if (m) { line = +m[1]; col = +m[2]; }
  else if ((m = msg.match(/position (\d+)/))) { const pre = t.slice(0, +m[1]).split('\n'); line = pre.length; col = pre[pre.length - 1].length + 1; }
  else return '';
  const row = t.split('\n')[line - 1] || '';
  const a = Math.max(0, col - 45), cut = row.slice(a, col + 25).trim();
  return cut ? ` Stelle (Zeile ${line}): …${cut}…` : '';
}

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
  // erst unverändert versuchen: „…“, in Texten ist gültig und darf nicht angefasst werden
  let fixed = text;
  let data = tryParse(text);
  if (data === undefined) { fixed = fixQuotes(text); data = tryParse(fixed); }
  let wasTruncated = truncated;
  if (data === undefined) {
    const firstError = lastError;
    // zweiter Versuch: Anführungszeichen und Zeilenumbrüche innerhalb von Texten reparieren
    const fence = String(raw || '').match(/```[a-zA-Z0-9]*[ \t]*\r?\n?([\s\S]*?)(```|$)/);
    const rep = fixInnerQuotes(fixQuotes(fence && /[{[]/.test(fence[1]) ? fence[1] : String(raw || '')));
    if (rep.count) {
      const ex = extractJson(rep.text), f2 = ex.text;
      let d2 = tryParse(f2);
      if (d2 === undefined && ex.truncated) { const cut = cutTruncated(f2); if (cut) { d2 = tryParse(cut); if (d2 !== undefined) notes.push('Die Antwort war abgeschnitten: Die vollständigen Folien wurden übernommen. Den Chatbot mit „weiter“ den Rest schreiben lassen und nachträglich einfügen.'); } }
      if (d2 !== undefined) { data = d2; fixed = f2; wasTruncated = ex.truncated; notes.push(`${rep.count} ${rep.count === 1 ? 'Stelle' : 'Stellen'} mit Anführungszeichen oder Zeilenumbrüchen im Text repariert – bitte die betroffenen Texte kurz prüfen`); }
    }
    if (data === undefined) lastError = firstError;
  }
  if (data === undefined && truncated) {
    const cut = cutTruncated(fixed);
    if (cut) { data = tryParse(cut); if (data !== undefined) notes.push('Die Antwort war abgeschnitten: Die vollständigen Folien wurden übernommen. Den Chatbot mit „weiter“ den Rest schreiben lassen und nachträglich einfügen.'); }
  }
  if (data === undefined) return { lesson: null, errors: [`Das JSON ist fehlerhaft und konnte nicht repariert werden (${lastError}).${errorSpot(fixed, lastError)} Tipp: Den Chatbot bitten: „Gib die Lektion noch einmal als einen einzigen, gültigen JSON-Codeblock aus – ohne Kommentare und ohne gerade Anführungszeichen innerhalb von Texten.“`], repairs: [], truncated };
  if (fixed !== text && fixQuotes(text) !== text) notes.push('Typografische Anführungszeichen in der JSON-Struktur ersetzt');
  const ph = findPlaceholders(data);
  if (ph.length) notes.push(`Platzhalter gefunden (${[...new Set(ph)].slice(0, 3).map((x) => `„${x}“`).join(', ')}) – bitte die KI alles vollständig ausschreiben lassen`);
  if (media && data && typeof data === 'object' && !Array.isArray(data) && !data.media) data.media = media;
  const r = normalizeLesson(data, { appVersion, lenient: true });
  if (r.lesson) r.lesson.slides.forEach((s, i) => {
    const src = [s.source, s.chart && s.chart.source, s.compareSource].filter(Boolean).join(' ');
    if (src && !/fiktiv|beispiel/i.test(src)) notes.push(`Folie ${i + 1}: Quelle „${src.slice(0, 80)}“ bitte prüfen`);
  });
  return { lesson: r.lesson, errors: r.errors, repairs: [...notes, ...r.repairs], truncated: wasTruncated };
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
