// Lektionsformat (.plenum): Prüfen, Reparieren, Versionen, Gliederung für die Klasse
import { TYPES, resolveType } from './types/index.js';
import { normObject, normField } from './fields.js';
import { COLORS, COLOR_NAMES, ICON_NAMES } from './palette.js';
import { newId, isObj, asArr, str } from './util.js';
import { LIBRARY_NAMES } from './graphics.js';

export const FORMAT = 'plenum-lektion';
export const VERSION = 1;
export const MAX_SLIDES = 200;

// Präsentationsdesigns (gelten am Beamer, auf den Handys und in der Vorschau)
export const THEMES = [
  { value: 'standard', label: 'Standard', desc: 'Hell mit Punktraster' },
  { value: 'clean', label: 'Klar', desc: 'Weiß, flach, feine Linien' },
  { value: 'dark', label: 'Nacht', desc: 'Dunkel mit Leuchten und Raster' },
  { value: 'aurora', label: 'Aurora', desc: 'Farbverlauf mit Glaskarten' },
  { value: 'chalk', label: 'Tafel', desc: 'Grünes Brett, Kreide, Holzrahmen' },
  { value: 'paper', label: 'Papier', desc: 'Liniertes Heft mit Textmarker' },
  { value: 'playful', label: 'Bunt', desc: 'Konfetti und Sticker-Look' },
  { value: 'blueprint', label: 'Blaupause', desc: 'Technisches Raster, weiße Linien' },
  { value: 'contrast', label: 'Kontrast', desc: 'Schwarz auf Weiß, gut lesbar' },
];
export const LESSON_FIELDS = [
  { key: 'title', kind: 'text', label: 'Titel der Lektion', max: 90, required: true, default: 'Neue Lektion' },
  { key: 'subject', kind: 'text', label: 'Fach', max: 40, optional: true },
  { key: 'grade', kind: 'text', label: 'Schulstufe / Klasse', max: 40, optional: true },
  { key: 'description', kind: 'textarea', label: 'Beschreibung', max: 400, optional: true },
  { key: 'theme', kind: 'select', label: 'Design', options: THEMES.map((t) => ({ value: t.value, label: t.label })), default: 'standard' },
  // Folien ohne Aufgabe (Titel, Info, Zusammenfassung, Quellen) auch auf den Geräten der Klasse zeigen?
  { key: 'studentSlides', kind: 'bool', label: 'Folien ohne Aufgabe auch auf den Geräten der Klasse zeigen', default: false },
];

// Grafik je Folie: Bibliothek (lib:), Symbol (icon:) oder eigenes Bild (media:, eingebettet in die Lektion)
export const GRAPHIC_POS = [
  { value: 'right', label: 'Rechts' }, { value: 'left', label: 'Links' }, { value: 'top', label: 'Oben' },
  { value: 'corner', label: 'Ecke' }, { value: 'background', label: 'Hintergrund' },
];
export const GRAPHIC_SIZES = [{ value: 's', label: 'Klein' }, { value: 'm', label: 'Mittel' }, { value: 'l', label: 'Groß' }];
export const MEDIA_TYPES = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'];
export const MEDIA_MAX_CHARS = 4_000_000; // Base64, entspricht etwa 3 MB
const POS_SYN = { rechts: 'right', links: 'left', oben: 'top', hintergrund: 'background', ecke: 'corner' };
const SIZE_SYN = { klein: 's', small: 's', mittel: 'm', medium: 'm', groß: 'l', gross: 'l', large: 'l' };

function normMedia(raw, r) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, m] of Object.entries(raw)) {
    if (!/^[\w-]{1,40}$/.test(id) || !isObj(m)) continue;
    const data = str(m.data);
    if (!MEDIA_TYPES.includes(m.mime) || !data || data.length > MEDIA_MAX_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(data)) { r.note(`Bild „${str(m.name).slice(0, 40) || id}“ ist ungültig oder zu groß – entfernt`); continue; }
    out[id] = { mime: m.mime, data, w: Math.max(0, Math.round(+m.w || 0)), h: Math.max(0, Math.round(+m.h || 0)), name: str(m.name).slice(0, 120) };
  }
  return out;
}
export function normGraphic(g, media, r, p) {
  if (typeof g === 'string') g = { src: g };
  if (!isObj(g)) return null;
  let src = str(g.src ?? g.name ?? g.grafik).trim();
  if (LIBRARY_NAMES.includes(src.toLowerCase())) src = `lib:${src.toLowerCase()}`;
  const k = src.indexOf(':'), kind = src.slice(0, k), name = src.slice(k + 1);
  const ok = (kind === 'lib' && LIBRARY_NAMES.includes(name)) || (kind === 'icon' && ICON_NAMES.includes(name)) || (kind === 'media' && !!media[name]);
  if (!ok) { if (src) r.note(`${p}: Grafik „${src.slice(0, 40)}“ nicht gefunden – entfernt`); return null; }
  const pos = POS_SYN[str(g.pos).toLowerCase()] || g.pos, size = SIZE_SYN[str(g.size).toLowerCase()] || g.size;
  const out = { src: `${kind}:${name}`, pos: GRAPHIC_POS.some((x) => x.value === pos) ? pos : 'right', size: GRAPHIC_SIZES.some((x) => x.value === size) ? size : 'm' };
  const cap = str(g.caption).replace(/\s+/g, ' ').trim().slice(0, 140);
  if (cap) out.caption = cap;
  return out;
}
const COMMON_KEYS = ['id', 'type', 'section'];
const okId = (v) => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);

// Protokoll für Reparaturen (gesammelte Hinweise) und Fehler (Folie unbrauchbar)
export function reporter() {
  const repairs = [], errors = [];
  return { repairs, errors, note: (t) => repairs.push(t), error: (t) => errors.push(t) };
}

// Migrationskette: version n → n+1 (bisher nur Version 1)
const MIGRATIONS = {};

export function normalizeLesson(input, opts = {}) {
  const r = reporter();
  let L = input;
  if (Array.isArray(L)) L = { slides: L };
  if (isObj(L) && isObj(L.lesson)) L = L.lesson;
  if (isObj(L) && isObj(L.lektion)) L = L.lektion;
  if (!isObj(L)) { r.error('Keine Lektion gefunden (erwartet wird ein JSON-Objekt mit „slides“)'); return { lesson: null, ...r }; }
  if (L.format && L.format !== FORMAT && !opts.lenient) r.note(`Unbekanntes Format „${str(L.format)}“ – wird als Plenum-Lektion gelesen`);
  let version = Number.isInteger(L.version) ? L.version : VERSION;
  if (version > VERSION) { r.error('Diese Lektion stammt aus einer neueren Plenum-Version. Bitte Plenum aktualisieren.'); return { lesson: null, ...r }; }
  while (version < VERSION) { L = MIGRATIONS[version](L); version++; }

  const now = new Date().toISOString();
  const lesson = { format: FORMAT, version: VERSION, id: okId(L.id) ? L.id : newId('L'), createdAt: str(L.createdAt) || now, updatedAt: str(L.updatedAt) || now, appVersion: str(opts.appVersion || L.appVersion) };
  Object.assign(lesson, normObject(L, LESSON_FIELDS, r, 'Lektion'));

  // Abschnitte; auch Folien, die eine KI in Abschnitten verschachtelt hat
  let rawSlides = asArr(L.slides ?? L.folien);
  const rawSections = asArr(L.sections ?? L.abschnitte);
  const sections = [];
  const used = new Set();
  rawSections.forEach((sec, i) => {
    if (typeof sec === 'string') sec = { name: sec };
    if (!isObj(sec)) return;
    let id = okId(sec.id) && !used.has(sec.id) ? sec.id : newId('S');
    used.add(id);
    const color = COLOR_NAMES.includes(sec.color) ? sec.color : COLOR_NAMES[i % (COLOR_NAMES.length - 1)];
    const icon = ICON_NAMES.includes(sec.icon) ? sec.icon : 'compass';
    const name = normField({ kind: 'text', max: 40, label: 'Abschnitt' }, sec.name ?? sec.title, r, `Abschnitt ${i + 1}`) || `Abschnitt ${i + 1}`;
    sections.push({ id, name, color, icon });
    if (Array.isArray(sec.slides)) rawSlides = rawSlides.concat(sec.slides.map((s) => (isObj(s) ? { section: id, ...s } : s)));
  });
  const findSection = (ref) => {
    if (ref == null || ref === '') return null;
    const s = str(ref).trim().toLowerCase();
    return sections.find((x) => x.id === ref) || sections.find((x) => x.name.toLowerCase() === s) || (Number.isInteger(ref) ? sections[ref] : null);
  };

  const media = normMedia(L.media, r);
  const slides = [];
  const ids = new Set();
  if (rawSlides.length > MAX_SLIDES) { r.note(`Mehr als ${MAX_SLIDES} Folien – der Rest wurde weggelassen`); rawSlides = rawSlides.slice(0, MAX_SLIDES); }
  rawSlides.forEach((raw, i) => {
    const p = `Folie ${i + 1}`;
    if (!isObj(raw)) { r.note(`${p}: kein Objekt – übersprungen`); return; }
    const type = resolveType(raw.type ?? raw.typ);
    if (!type) { r.error(`${p}: unbekannter Typ „${str(raw.type)}“ – übersprungen`); return; }
    if (type !== raw.type) r.note(`${p}: Typ „${str(raw.type)}“ als „${type}“ gelesen`);
    const def = TYPES[type];
    const sr = reporter();
    const s = { id: okId(raw.id) && !ids.has(raw.id) ? raw.id : newId('s'), type };
    if (raw.id && s.id !== raw.id) r.note(`${p}: doppelte oder ungültige ID ersetzt`);
    ids.add(s.id);
    let sec = findSection(raw.section ?? raw.abschnitt);
    if (!sec && (raw.section || raw.abschnitt)) {
      sec = { id: newId('S'), name: str(raw.section ?? raw.abschnitt).slice(0, 40), color: COLOR_NAMES[sections.length % (COLOR_NAMES.length - 1)], icon: 'compass' };
      sections.push(sec);
      r.note(`Abschnitt „${sec.name}“ angelegt`);
    }
    if (!sec) sec = sections[sections.length - 1] || (sections.push({ id: newId('S'), name: 'Allgemein', color: 'indigo', icon: 'compass' }), sections[0]);
    s.section = sec.id;
    Object.assign(s, normObject(raw, def.fields, sr, `${p} (${def.label})`));
    if (raw.graphic ?? raw.grafik) { const g = normGraphic(raw.graphic ?? raw.grafik, media, sr, p); if (g) s.graphic = g; }
    if (def.repair) def.repair(s, sr, `${p} (${def.label})`);
    r.repairs.push(...sr.repairs);
    if (sr.errors.length) { r.errors.push(...sr.errors.map((e) => e + (opts.keepBroken ? '' : ' – Folie übersprungen'))); if (!opts.keepBroken) return; s._invalid = sr.errors; }
    slides.push(s);
  });
  if (!sections.length) sections.push({ id: newId('S'), name: 'Allgemein', color: 'indigo', icon: 'compass' });
  lesson.sections = sections.filter((sec) => slides.some((s) => s.section === sec.id) || opts.keepEmptySections);
  if (!lesson.sections.length) lesson.sections = [sections[0]];
  lesson.slides = slides;
  // nur Bilder behalten, die eine Folie verwendet
  const usedMedia = new Set(slides.map((s) => s.graphic && s.graphic.src.startsWith('media:') && s.graphic.src.slice(6)).filter(Boolean));
  const keep = Object.fromEntries(Object.entries(media).filter(([id]) => usedMedia.has(id)));
  if (Object.keys(keep).length) lesson.media = keep;
  if (!slides.length) r.error('Die Lektion enthält keine gültige Folie');
  return { lesson, ...r };
}

// Prüfen einer einzelnen Folie (Editor-Hinweise), ohne sie zu verändern
export function checkSlide(slide) {
  const def = TYPES[slide.type];
  const r = reporter();
  if (!def) { r.error('Unbekannter Typ'); return r; }
  const s = normObject(JSON.parse(JSON.stringify(slide)), def.fields, r, def.label);
  s.id = slide.id;
  if (def.repair) def.repair(s, r, def.label);
  return r;
}

export function newSlide(type, sectionId) {
  const def = TYPES[type];
  const s = { ...JSON.parse(JSON.stringify(def.sample)), ...(def.fresh ? JSON.parse(JSON.stringify(def.fresh)) : {}) };
  s.id = newId('s');
  s.section = sectionId;
  return s;
}

export function newLesson(title = 'Neue Lektion') {
  const sec = { id: newId('S'), name: 'Einstieg', color: 'indigo', icon: 'compass' };
  const t = newSlide('title', sec.id);
  t.title = title; t.subtitle = ''; t.kicker = ''; t.topics = [];
  const now = new Date().toISOString();
  return { format: FORMAT, version: VERSION, id: newId('L'), createdAt: now, updatedAt: now, appVersion: '', title, subject: '', grade: '', description: '', sections: [sec], slides: [t] };
}

// Kopie mit neuen IDs (Duplizieren, Import als Kopie)
export function withNewIds(lesson) {
  const L = JSON.parse(JSON.stringify(lesson));
  const map = {};
  L.id = newId('L');
  L.sections.forEach((s) => { map[s.id] = newId('S'); s.id = map[s.id]; });
  L.slides.forEach((s) => { s.id = newId('s'); s.section = map[s.section] || L.sections[0].id; });
  const now = new Date().toISOString();
  L.createdAt = now; L.updatedAt = now;
  return L;
}

export const fingerprint = (slide) => { const d = TYPES[slide.type]; return d && d.fingerprint ? d.fingerprint(slide) : ''; };
export const sectionOf = (lesson, slide) => lesson.sections.find((s) => s.id === slide.section) || lesson.sections[0];
export const colorOf = (name) => COLORS[name] || COLORS.indigo;

// Gliederung ohne Lösungen (für Schülergeräte im eigenen Tempo)
export const outline = (lesson) => lesson.slides.map((s) => { const sec = sectionOf(lesson, s); return { id: s.id, title: s.title, type: s.type, section: sec.name, color: sec.color, icon: sec.icon }; });
export { COMMON_KEYS };
