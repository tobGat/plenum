// KI-Prompt: enthält Vorgaben und nur die gewählten Typen; Beispiel und Vorlage sind gültige Lektionen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, buildRevisePrompt, templateJson, exampleLesson, DEFAULT_TYPES } from '../shared/prompt.js';
import { normalizeLesson } from '../shared/schema.js';
import { TYPE_LIST } from '../shared/types/index.js';
import { parseLessonText } from '../server/aiimport.js';

test('Prompt: Thema, Umfang, Regeln und nur gewählte Typen', () => {
  const p = buildPrompt({ topic: 'Photosynthese', subject: 'Biologie', grade: '6. Schulstufe', count: 9, types: ['mc', 'poll', 'leaderboard'], notes: 'Schulgarten' });
  assert.match(p, /THEMA: Photosynthese/);
  assert.match(p, /genau 9 Folien/);
  assert.match(p, /Schulgarten/);
  assert.match(p, /Beispieldaten \(fiktiv\)/);
  assert.match(p, /"mc" – Multiple Choice/);
  assert.match(p, /"title" – Titelfolie/, 'Titelfolie ist immer dabei');
  assert.doesNotMatch(p, /"wordcloud" – /, 'nicht gewählte Typen fehlen');
  assert.doesNotMatch(p, /"leaderboard" – /, 'Rangliste ohne Quiz wird weggelassen');
  assert.ok(p.length < 12000, `Prompt zu lang: ${p.length}`);
});

test('Material: Hinweis im Prompt, Buch-Aufträge als eigene Folie, Thema optional', () => {
  const material = { desc: 'Buch S. 40–42, Ü2–Ü4' };
  const p = buildPrompt({ topic: '', count: 8, types: ['mc', 'poll'], material });
  assert.match(p, /THEMA: siehe angehängtes Material/);
  assert.match(p, /Ich hänge dir in diesem Chat Material an \(Fotos, Scans, Screenshots oder PDF\): Buch S\. 40–42, Ü2–Ü4/);
  assert.match(p, /„Zuerst im Buch: Ü2 und Ü3“/);
  assert.match(p, /"task" – Arbeitsauftrag/, 'Arbeitsauftrag wird für Buch-Material ergänzt');
  assert.match(p, /„Bitte die Dateien anhängen\.“/);
  assert.match(buildPrompt({ topic: 'X', material: { desc: '' } }), /Material an \(Fotos, Scans, Screenshots oder PDF\)\.\n/);
  const o = buildPrompt({ topic: 'X', types: ['mc'], material, materialUse: 'orient' });
  assert.match(o, /verweise nicht auf Buchseiten/);
  assert.doesNotMatch(o, /"task" – /);
  assert.doesNotMatch(buildPrompt({ topic: 'X' }), /MATERIAL:/, 'ohne Material kein Abschnitt');
  assert.match(templateJson({ types: ['mc'], count: 5, material })._anleitung, /weiteren angehängten Dateien \(Buch S\. 40–42, Ü2–Ü4\)/);
});

test('Beispiel und Vorlage sind gültige Lektionen (alle Typen)', () => {
  const all = TYPE_LIST.map((t) => t.type);
  const ex = normalizeLesson(exampleLesson(all), {});
  assert.deepEqual(ex.errors, []);
  assert.equal(ex.lesson.slides.length, all.length);
  const { _anleitung, ...tpl } = templateJson({ types: DEFAULT_TYPES, count: 10, topic: 'Wasser' });
  assert.match(_anleitung, /„Wasser“/);
  const r = normalizeLesson(tpl, {});
  assert.ok(r.lesson);
  assert.deepEqual(r.errors, []);
});

test('Überarbeiten: Prompt enthält Lektion mit IDs; Antwort behält IDs', () => {
  const L = normalizeLesson(exampleLesson(['title', 'mc', 'poll']), {}).lesson;
  const p = buildRevisePrompt({ lesson: L, wish: 'einfacher' });
  assert.match(p, /ÄNDERUNGSWUNSCH: einfacher/);
  assert.ok(p.includes(`"id":"${L.slides[1].id}"`));
  // simulierte Antwort: Folie 2 geändert, Folie 3 entfernt, neue Folie ohne id
  const ans = JSON.parse(JSON.stringify(L));
  ans.slides[1].title = 'Leichter: Wasser-Quiz';
  ans.slides.splice(2, 1);
  ans.slides.push({ type: 'wordcloud', section: L.sections[0].name, title: 'Neu', question: 'Begriffe?' });
  const r = parseLessonText('Hier ist die überarbeitete Lektion:\n```json\n' + JSON.stringify(ans) + '\n```');
  assert.ok(r.lesson);
  assert.equal(r.lesson.id, L.id);
  assert.equal(r.lesson.slides[1].id, L.slides[1].id);
  assert.equal(r.lesson.slides[1].title, 'Leichter: Wasser-Quiz');
  assert.ok(r.lesson.slides[2].id && r.lesson.slides[2].id !== L.slides[2].id);
});
