// Ablage: Lektionen als .plenum-Dateien (Dokumente\Plenum-Lektionen), Stände/Einstellungen im App-Datenordner.
import fs from 'node:fs';
import path from 'node:path';
import { normalizeLesson, newLesson, withNewIds } from '../shared/schema.js';
import { slug, isObj } from '../shared/util.js';

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
        index.set(id, { file, meta: { id, title: String(d.title || 'Ohne Titel'), subject: String(d.subject || ''), grade: String(d.grade || ''), slides: Array.isArray(d.slides) ? d.slides.length : 0, updatedAt: String(d.updatedAt || '') } });
      } catch { /* unlesbare Datei überspringen */ }
    }
  }
  function uniqueFile(title) {
    const base = slug(title);
    let f = path.join(dir, `${base}.plenum`), i = 2;
    while (fs.existsSync(f)) f = path.join(dir, `${base}-${i++}.plenum`);
    return f;
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
      index.set(L.id, { file, meta: { id: L.id, title: L.title, subject: L.subject || '', grade: L.grade || '', slides: L.slides.length, updatedAt: L.updatedAt } });
      return L;
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
