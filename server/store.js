// Ablage: Lektionen als .plenum-Dateien (Dokumente\Plenum-Lektionen), Stände/Einstellungen im App-Datenordner.
import fs from 'node:fs';
import path from 'node:path';
import { normalizeLesson, newLesson, withNewIds, normCard } from '../shared/schema.js';
import { slug, isObj } from '../shared/util.js';
import { normalizeSeries, newSeries, seriesWithNewIds, normLook } from '../shared/series.js';
import { hash } from '../shared/util.js';

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const okId = (v) => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);

// Atomar schreiben; OneDrive & Virenscanner sperren Dateien kurz → mehrfach versuchen
export function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch { /* egal */ } throw e; }
      sleep(60 * (i + 1));
    }
  }
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));

// Suchtexte einer Lektion für die Stichwortsuche in der Bibliothek: Beschreibung und je Folie alle sichtbaren Texte
// (Überschrift, Fragen, Antworten, Karten, Notizen …) – ohne IDs, Adressen, Farben und Bilddaten.
const SKIP_KEYS = new Set(['id', 'type', 'section', 'graphic', 'url', 'color', 'icon', 'art', 'layout', 'start', 'end']);
function collectText(v, out) {
  if (typeof v === 'string') { if (v.trim()) out.push(v.trim()); } else if (Array.isArray(v)) v.forEach((x) => collectText(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!SKIP_KEYS.has(k)) collectText(x, out);
}
export function searchTexts(d) {
  return { desc: String(d.description || '').slice(0, 600), texts: (Array.isArray(d.slides) ? d.slides : []).map((s) => { const out = []; collectText(s, out); return out.join(' · ').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').slice(0, 2000); }) };
}

// Karte für die Listen: ohne Bilddaten; imgv ändert sich mit dem Bild (Adresse /lessons/<id>/cardimage)
const imgV = (m) => hash(m.data.slice(0, 400) + m.data.length);
function cardMeta(card) {
  const c = normCard(card);
  return c ? { color: c.color || '', graphic: c.graphic || '', imgv: c.image ? imgV(c.image) : '', pos: c.pos || null } : null;
}

export function createStore({ lessonsDir, dataDir, samplesDir, appVersion = '' }) {
  const statesDir = path.join(dataDir, 'states');
  const settingsFile = path.join(dataDir, 'settings.json');
  fs.mkdirSync(dataDir, { recursive: true });
  let settings = {};
  try { settings = readJson(settingsFile); } catch { settings = {}; }
  let dir = settings.lessonsDir || lessonsDir;
  const index = new Map(); // id -> { file, meta }

  function ensureDir() { fs.mkdirSync(dir, { recursive: true }); }
  function scan() {
    ensureDir();
    index.clear();
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.plenum')) continue;
      const file = path.join(dir, f);
      try {
        const d = readJson(file);
        let id = okId(d.id) ? d.id : null;
        if (!id || index.has(id)) { // Konfliktkopie (z. B. OneDrive) → eigene ID
          const fixed = normalizeLesson(d, { keepBroken: true, keepEmptySections: true }).lesson;
          if (!fixed) continue;
          const copy = index.has(fixed.id) ? withNewIds(fixed) : fixed;
          writeAtomic(file, JSON.stringify(copy, null, 2));
          id = copy.id; d.title = copy.title; d.slides = copy.slides; d.updatedAt = copy.updatedAt;
        }
        index.set(id, { file, meta: { id, title: String(d.title || 'Ohne Titel'), subject: String(d.subject || ''), grade: String(d.grade || ''), slides: Array.isArray(d.slides) ? d.slides.length : 0, updatedAt: String(d.updatedAt || ''), card: cardMeta(d.card), ...searchTexts(d) } });
      } catch { /* unlesbare Datei überspringen */ }
    }
  }
  function uniqueFile(title, ext = '.plenum') {
    const base = slug(title);
    let f = path.join(dir, `${base}${ext}`), i = 2;
    while (fs.existsSync(f)) f = path.join(dir, `${base}-${i++}${ext}`);
    return f;
  }
  // Themenserien: *.plenumserie im selben Ordner. Die Liste enthält die Karten in Kurzform (Vorschau, Suche).
  const SEXT = '.plenumserie';
  const sIndex = new Map(); // id -> { file, meta }
  const sMeta = (S) => ({ id: S.id, title: S.title, subject: S.subject, grade: S.grade, description: S.description, updatedAt: S.updatedAt, links: S.links.length,
    // Aussehen ohne Bilddaten; imgv ändert sich mit dem Bild (für die Adresse /series/<id>/image)
    look: S.look ? { color: S.look.color || '', graphic: S.look.graphic || '', imgv: S.look.image ? imgV(S.look.image) : '', pos: S.look.pos || null } : null,
    cards: S.cards.map((c) => ({ id: c.id, col: c.col, row: c.row, title: c.title, lesson: c.lesson || '', color: c.color || '' })), arrows: S.links });
  function scanSeries() {
    ensureDir();
    sIndex.clear();
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(SEXT)) continue;
      const file = path.join(dir, f);
      try {
        let S = normalizeSeries(readJson(file));
        if (!S) continue;
        if (sIndex.has(S.id)) { S = seriesWithNewIds(S); writeAtomic(file, JSON.stringify(S, null, 2)); } // Konfliktkopie → eigene ID
        sIndex.set(S.id, { file, meta: sMeta(S) });
      } catch { /* unlesbare Datei überspringen */ }
    }
  }

  const store = {
    get lessonsDir() { return dir; },
    setLessonsDir(d) { dir = d; settings.lessonsDir = d; store.saveSettings(); scan(); },
    list() {
      scan();
      return [...index.values()].map((x) => ({ ...x.meta, lastState: store.latestState(x.meta.id) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    has: (id) => { if (!index.has(id)) scan(); return index.has(id); },
    get(id) {
      if (!index.has(id)) scan();
      const e = index.get(id);
      if (!e) return null;
      return normalizeLesson(readJson(e.file), { keepBroken: true, keepEmptySections: true, appVersion }).lesson;
    },
    save(lesson) {
      const r = normalizeLesson(lesson, { keepBroken: true, keepEmptySections: true, appVersion });
      if (!r.lesson) throw new Error(r.errors.join('; '));
      const L = r.lesson;
      L.updatedAt = new Date().toISOString();
      L.slides.forEach((s) => delete s._invalid);
      if (!index.has(L.id)) scan();
      const file = index.get(L.id)?.file || uniqueFile(L.title);
      writeAtomic(file, JSON.stringify(L, null, 2));
      index.set(L.id, { file, meta: { id: L.id, title: L.title, subject: L.subject || '', grade: L.grade || '', slides: L.slides.length, updatedAt: L.updatedAt, card: cardMeta(L.card), ...searchTexts(L) } });
      return L;
    },
    // Farbe und Grafik der Karte in der Bibliothek: steht in der Lektionsdatei (wandert mit), ändert aber „geändert am“ nicht
    setCard(id, card) {
      if (!index.has(id)) scan();
      const e = index.get(id);
      if (!e) return null;
      // image: Objekt = neues Bild, null = entfernen, undefined = vorhandenes behalten; eine Grafik ersetzt das Bild
      const d = readJson(e.file), next = { ...(isObj(card) ? card : {}) };
      if (next.image === undefined && !next.graphic && isObj(d.card)) next.image = d.card.image;
      const c = normCard(next);
      if (c) d.card = c; else delete d.card;
      writeAtomic(e.file, JSON.stringify(d, null, 2));
      e.meta.card = cardMeta(c);
      return e.meta.card;
    },
    create(lesson) {
      let L = lesson || newLesson();
      if (store.has(L.id)) L = withNewIds(L);
      return store.save(L);
    },
    duplicate(id) {
      const L = store.get(id);
      if (!L) return null;
      const c = withNewIds(L);
      c.title = `${L.title} (Kopie)`.slice(0, 90);
      return store.save(c);
    },
    remove(id) {
      const e = index.get(id) || (scan(), index.get(id));
      if (!e) return false;
      fs.rmSync(e.file, { force: true });
      fs.rmSync(path.join(statesDir, id), { recursive: true, force: true });
      index.delete(id);
      return true;
    },
    fileOf: (id) => index.get(id)?.file,

    // ---------- Themenserien ----------
    listSeries() { scanSeries(); return [...sIndex.values()].map((x) => x.meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    hasSeries: (id) => { if (!sIndex.has(id)) scanSeries(); return sIndex.has(id); },
    getSeries(id) {
      if (!sIndex.has(id)) scanSeries();
      const e = sIndex.get(id);
      return e ? normalizeSeries(readJson(e.file)) : null;
    },
    // keepLook: Aussehen (Farbe, Grafik, Bild) aus der vorhandenen Datei behalten – der Serien-Editor schickt es nicht mit
    saveSeries(series, { keepLook = false } = {}) {
      const S = normalizeSeries(series);
      if (!S) throw new Error('Ungültige Themenserie');
      if (keepLook) { const old = store.getSeries(S.id); if (old && old.look) S.look = old.look; else delete S.look; }
      S.updatedAt = new Date().toISOString();
      if (!sIndex.has(S.id)) scanSeries();
      const file = sIndex.get(S.id)?.file || uniqueFile(S.title, SEXT);
      writeAtomic(file, JSON.stringify(S, null, 2));
      sIndex.set(S.id, { file, meta: sMeta(S) });
      return S;
    },
    // Aussehen in der Übersicht setzen (ändert „geändert am“ nicht). image: Objekt = neues Bild, null = entfernen, undefined = behalten
    setSeriesLook(id, look) {
      const S = store.getSeries(id);
      if (!S) return null;
      const next = { color: look && look.color, graphic: look && look.graphic, image: look && look.image === undefined ? S.look && S.look.image : look && look.image, pos: look && look.pos };
      if (next.graphic) next.image = null;
      const k = normLook(next);
      if (k) S.look = k; else delete S.look;
      writeAtomic(sIndex.get(id).file, JSON.stringify(S, null, 2));
      sIndex.get(id).meta = sMeta(S);
      return sIndex.get(id).meta.look;
    },
    createSeries(series) {
      let S = series ? normalizeSeries(series) : newSeries();
      if (!S) throw new Error('Ungültige Themenserie');
      if (store.hasSeries(S.id)) S = seriesWithNewIds(S);
      return store.saveSeries(S);
    },
    duplicateSeries(id) {
      const S = store.getSeries(id);
      if (!S) return null;
      const c = seriesWithNewIds(S);
      c.title = `${S.title} (Kopie)`.slice(0, 90);
      return store.saveSeries(c);
    },
    removeSeries(id) {
      const e = sIndex.get(id) || (scanSeries(), sIndex.get(id));
      if (!e) return false;
      fs.rmSync(e.file, { force: true });
      sIndex.delete(id);
      return true;
    },

    // ---------- Stände je Lektion: states/<lektion>/<stand>.json ----------
    statesOf(lessonId) {
      const d = path.join(statesDir, lessonId);
      let out = [];
      try {
        out = fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => {
          try { const s = readJson(path.join(d, f)); return { id: f.slice(0, -5), name: String(s.name || f), savedAt: String(s.savedAt || ''), slideId: s.slideId, votes: Object.values(s.subs || {}).reduce((n, x) => n + Object.keys(x || {}).length, 0) }; } catch { return null; }
        }).filter(Boolean);
      } catch { /* noch keine */ }
      return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    },
    latestState(lessonId) { return store.statesOf(lessonId)[0] || null; },
    saveState(lessonId, stateId, data) {
      const d = path.join(statesDir, lessonId);
      fs.mkdirSync(d, { recursive: true });
      writeAtomic(path.join(d, `${stateId}.json`), JSON.stringify(data));
    },
    loadState(lessonId, stateId) { try { return readJson(path.join(statesDir, lessonId, `${stateId}.json`)); } catch { return null; } },
    deleteState(lessonId, stateId) { fs.rmSync(path.join(statesDir, lessonId, `${stateId}.json`), { force: true }); },

    // ---------- Einstellungen ----------
    get settings() { return settings; },
    setSettings(patch) { if (isObj(patch)) Object.assign(settings, patch); store.saveSettings(); return settings; },
    saveSettings() { writeAtomic(settingsFile, JSON.stringify(settings, null, 2)); },

    // Beim ersten Start die Beispiellektionen in den Lektionsordner kopieren
    ensureSamples() {
      ensureDir();
      if (settings.samplesCopied || !samplesDir || !fs.existsSync(samplesDir)) return;
      if (!fs.readdirSync(dir).some((f) => f.endsWith('.plenum'))) {
        for (const f of fs.readdirSync(samplesDir).filter((x) => x.endsWith('.plenum'))) {
          try { const L = normalizeLesson(readJson(path.join(samplesDir, f)), { appVersion }).lesson; if (L) store.create(L); } catch { /* defektes Beispiel */ }
        }
      }
      settings.samplesCopied = true;
      store.saveSettings();
    },
  };
  return store;
}
