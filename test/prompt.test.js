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

test('Umfang: genau, von–bis oder offen', () => {
  const base = { topic: 'Wasser', types: ['mc'] };
  const r = buildPrompt({ ...base, countMode: 'range', countMin: 14, countMax: 8 });
  assert.match(r, /UMFANG: mindestens 8 und höchstens 14 Folien/); assert.match(r, /Mindestens 8 und höchstens 14 Folien./); assert.doesNotMatch(r, /[Gg]enau d+ Folien/);
  const o = buildPrompt({ ...base, countMode: 'open', count: 9 });
  assert.match(o, /UMFANG: so viele Folien, wie das Thema sinnvoll braucht/); assert.doesNotMatch(o, /[Gg]enau d+ Folien/);
  assert.match(buildPrompt({ ...base, countMode: 'range', countMin: 10, countMax: 10 }), /genau 10 Folien/);
  assert.match(buildPrompt({ ...base, count: 7 }), /genau 7 Folien/, 'ohne Angabe wie bisher');
  assert.match(templateJson({ ...base, countMode: 'range', countMin: 6, countMax: 9 })._anleitung, /mindestens 6 und höchstens 9 Folien/);
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

test('Import: gerade Anführungszeichen und Zeilenumbrüche mitten im Text werden repariert', () => {
  const wrap = (text) => '```json\n{ "title": "Test", "slides": [\n {"type":"info","title":"A","cards":[{"title":"x","text":' + text + '}]},\n {"type":"mc","title":"Q","question":"Was heißt "der"?","options":[{"text":"Artikel, also "der", "die"","correct":true},{"text":"nichts","correct":false}]}\n]}\n```';
  const cases = [
    ['"Das Wort "der" ist ein Artikel."', 'Das Wort „der“ ist ein Artikel.'],
    ['"Er nennt es „das Diagramm" und\nschreibt weiter."', 'Er nennt es „das Diagramm“ und\nschreibt weiter.'],
    ['"Zitat: "Ende""', 'Zitat: „Ende“'],
    ['"a "b", c und d"', 'a „b“, c und d'],
  ];
  for (const [src, want] of cases) {
    const r = parseLessonText(wrap(src));
    assert.ok(r.lesson, r.errors.join(' '));
    assert.equal(r.lesson.slides[0].cards[0].text, want);
    assert.equal(r.lesson.slides[1].options[0].text, 'Artikel, also „der“, „die“');
    assert.match(r.repairs.join(' '), /Anführungszeichen oder Zeilenumbrüchen im Text repariert/);
  }
  // gültiges JSON mit „…“, im Text bleibt unverändert und ohne Reparaturhinweis
  const ok = parseLessonText('{"title":"T","slides":[{"type":"info","title":"A","cards":[{"title":"x","text":"„Hallo“, sagte sie."}]}]}');
  assert.equal(ok.lesson.slides[0].cards[0].text, '„Hallo“, sagte sie.');
  assert.doesNotMatch(ok.repairs.join(' '), /Anführungszeichen/);
  // nicht reparierbar: Meldung zeigt die Stelle
  const bad = parseLessonText('{"title":"T","slides":[{"type":"info","title":"A" "cards":[]}]}');
  assert.equal(bad.lesson, null); assert.match(bad.errors[0], /Stelle \(Zeile 1\): .*"title":"A" "cards"/);
});
