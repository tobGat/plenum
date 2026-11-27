// Themenserie (.plenumserie): Themenkarten auf einem Raster, mit Pfeilen verbunden („danach kommt“).
// Eine Karte verweist auf eine Lektion (lesson = Lektions-ID) oder ist eine freie Karte mit eigenem Text.
// Ohne DOM – wird von Server (Prüfung, Ablage) und Browser (Editor) genutzt.
import { COLOR_NAMES, ICON_NAMES } from './palette.js';
import { LIBRARY_NAMES } from './graphics.js';
import { newId, isObj, asArr, str } from './util.js';

export const SERIES_FORMAT = 'plenum-serie';
export const SERIES_VERSION = 1;
export const MAX_CARDS = 200;
export const MAX_COL = 59, MAX_ROW = 59;

// Aussehen der Serie in der Übersicht: Farbe und entweder eine Grafik (Illustration/Symbol) oder ein eigenes Bild (eingebettet)
export const LOOK_IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'];
export const LOOK_IMAGE_MAX = 900_000; // Base64-Zeichen, etwa 650 kB
export function normLook(k) {
  if (!isObj(k)) return null;
  const out = {};
  if (COLOR_NAMES.includes(k.color)) out.color = k.color;
  const g = str(k.graphic), i = g.indexOf(':'), kind = g.slice(0, i), name = g.slice(i + 1);
  const m = k.image;
  if (isObj(m) && LOOK_IMAGE_TYPES.includes(m.mime) && typeof m.data === 'string' && m.data.length > 0 && m.data.length <= LOOK_IMAGE_MAX && /^[A-Za-z0-9+/]+=*$/.test(m.data)) {
    out.image = { mime: m.mime, data: m.data, w: Math.max(0, Math.round(+m.w || 0)), h: Math.max(0, Math.round(+m.h || 0)) };
    // Ausschnitt: welcher Punkt des Bildes (in Prozent) in der Karte zu sehen ist – 50/50 = Mitte
    const pc = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(100, Math.round(+v))) : 50);
    if (isObj(k.pos) && (pc(k.pos.x) !== 50 || pc(k.pos.y) !== 50)) out.pos = { x: pc(k.pos.x), y: pc(k.pos.y) };
  } else if ((kind === 'lib' && LIBRARY_NAMES.includes(name)) || (kind === 'icon' && ICON_NAMES.includes(name))) out.graphic = g;
  return Object.keys(out).length ? out : null;
}
const okId = (v) => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);
const text = (v, max) => str(v).replace(/\s+/g, ' ').trim().slice(0, max);
const cell = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

// Prüfen und reparieren: ungültige Karten, doppelt belegte Zellen, doppelte Lektionen und unsinnige Pfeile fallen weg.
export function normalizeSeries(input) {
  let S = input;
  if (isObj(S) && isObj(S.series)) S = S.series;
  if (!isObj(S) || (S.format && S.format !== SERIES_FORMAT)) return null;
  if (Number.isInteger(S.version) && S.version > SERIES_VERSION) return null;
  const now = new Date().toISOString();
  const out = { format: SERIES_FORMAT, version: SERIES_VERSION, id: okId(S.id) ? S.id : newId('T'), title: text(S.title, 90) || 'Neue Themenserie',
    subject: text(S.subject, 40), grade: text(S.grade, 40), description: text(S.description, 400), createdAt: str(S.createdAt) || now, updatedAt: str(S.updatedAt) || now, cards: [], links: [] };
  const look = normLook(S.look);
  if (look) out.look = look;
  const ids = new Set(), cells = new Set(), lessons = new Set();
  for (const c of asArr(S.cards).slice(0, MAX_CARDS * 2)) {
    if (!isObj(c) || out.cards.length >= MAX_CARDS) continue;
    const col = cell(c.col, MAX_COL), row = cell(c.row, MAX_ROW);
    if (col === null || row === null || cells.has(`${col}|${row}`)) continue;
    const lesson = okId(c.lesson) ? c.lesson : '';
    if (lesson && lessons.has(lesson)) continue;
    const card = { id: okId(c.id) && !ids.has(c.id) ? c.id : newId('k'), col, row, title: text(c.title, 90) || (lesson ? 'Lektion' : 'Thema') };
    if (lesson) { card.lesson = lesson; lessons.add(lesson); }
    else {
      const note = text(c.note, 160);
      if (note) card.note = note;
      if (COLOR_NAMES.includes(c.color)) card.color = c.color;
      if (ICON_NAMES.includes(c.icon)) card.icon = c.icon;
    }
    ids.add(card.id); cells.add(`${col}|${row}`);
    out.cards.push(card);
  }
  const seen = new Set();
  for (const l of asArr(S.links)) {
    if (!isObj(l) || !ids.has(l.from) || !ids.has(l.to) || l.from === l.to) continue;
    if (seen.has(`${l.from}>${l.to}`) || seen.has(`${l.to}>${l.from}`)) continue; // kein doppelter Pfeil, kein Gegenpfeil
    seen.add(`${l.from}>${l.to}`);
    out.links.push({ from: l.from, to: l.to });
  }
  return out;
}

export function newSeries(title = 'Neue Themenserie') {
  const now = new Date().toISOString();
  return { format: SERIES_FORMAT, version: SERIES_VERSION, id: newId('T'), title, subject: '', grade: '', description: '', createdAt: now, updatedAt: now, cards: [], links: [] };
}

// Kopie mit neuen IDs (Duplizieren, Import als Kopie); lessonMap schreibt Lektions-IDs um (alte ID → neue ID)
export function seriesWithNewIds(series, lessonMap = {}) {
  const S = JSON.parse(JSON.stringify(series)), map = {};
  S.id = newId('T');
  S.cards.forEach((c) => { map[c.id] = newId('k'); c.id = map[c.id]; if (c.lesson && lessonMap[c.lesson]) c.lesson = lessonMap[c.lesson]; });
  S.links = S.links.map((l) => ({ from: map[l.from], to: map[l.to] })).filter((l) => l.from && l.to);
  const now = new Date().toISOString();
  S.createdAt = now; S.updatedAt = now;
  return S;
}

// Reihenfolge der Karten entlang der Pfeile (Vorgänger zuerst), sonst zeilenweise – für Listen und Zählungen
export function orderedCards(series) {
  const byPos = [...series.cards].sort((a, b) => a.row - b.row || a.col - b.col), indeg = {}, next = {};
  byPos.forEach((c) => { indeg[c.id] = 0; next[c.id] = []; });
  series.links.forEach((l) => { if (l.to in indeg && l.from in next) { indeg[l.to]++; next[l.from].push(l.to); } });
  const out = [], done = new Set(), byId = Object.fromEntries(byPos.map((c) => [c.id, c]));
  let queue = byPos.filter((c) => !indeg[c.id]);
  while (out.length < byPos.length) {
    if (!queue.length) queue = [byPos.find((c) => !done.has(c.id))]; // Kreis: an der ersten offenen Karte aufbrechen
    const c = queue.shift();
    if (done.has(c.id)) continue;
    done.add(c.id); out.push(c);
    next[c.id].forEach((id) => { if (--indeg[id] <= 0 && !done.has(id)) queue.push(byId[id]); });
  }
  return out;
}

// Nächste Themen nach einer Lektion: den Pfeilen folgen. Platzhalter (freie Karten ohne Lektion) und Karten, deren
// Lektion es nicht mehr gibt, werden übersprungen und als „skipped“ genannt. hasLesson(id) prüft, ob die Lektion existiert.
export function nextLessons(series, lessonId, hasLesson = () => true) {
  const start = series.cards.find((c) => c.lesson === lessonId);
  if (!start) return [];
  const byId = Object.fromEntries(series.cards.map((c) => [c.id, c])), out = [], seen = new Set([start.id]);
  const walk = (id, skipped) => {
    for (const l of series.links) {
      if (l.from !== id || seen.has(l.to)) continue;
      seen.add(l.to);
      const c = byId[l.to];
      if (!c) continue;
      if (c.lesson && hasLesson(c.lesson)) out.push({ lesson: c.lesson, title: c.title, skipped });
      else walk(c.id, [...skipped, c.title]);
    }
  };
  walk(start.id, []);
  return out.sort((a, b) => a.skipped.length - b.skipped.length);
}
