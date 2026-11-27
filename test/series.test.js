// Themenserien: Format prüfen und reparieren
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeriesPrompt, seriesFromPlan } from '../shared/seriesplan.js';
import { parseSeriesPlan } from '../server/aiimport.js';
import { normalizeSeries, newSeries, seriesWithNewIds, orderedCards, nextLessons } from '../shared/series.js';

test('normalizeSeries: doppelte Zellen, doppelte Lektionen und unsinnige Pfeile fallen weg', () => {
  const S = normalizeSeries({ title: '  Wasser  ', cards: [
    { id: 'a', col: 0, row: 0, lesson: 'L1', title: 'Eins' }, { id: 'b', col: 1, row: 0, title: 'Frei', note: 'Notiz', color: 'teal', icon: 'flag' },
    { id: 'c', col: 1, row: 0, title: 'gleiche Zelle' }, { id: 'd', col: 2, row: 0, lesson: 'L1', title: 'gleiche Lektion' },
    { id: 'a', col: 3, row: 1, title: 'doppelte ID' }, { id: 'e', col: -1, row: 0, title: 'außerhalb' }, { id: 'f', col: 2, row: 2, title: 'x', color: 'pink', icon: 'nix' }],
  links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'a' }, { from: 'a', to: 'zzz' }, { from: 'b', to: 'f' }] });
  assert.equal(S.title, 'Wasser'); assert.equal(S.format, 'plenum-serie');
  assert.equal(S.cards.length, 4);
  assert.deepEqual(S.cards[1], { id: 'b', col: 1, row: 0, title: 'Frei', note: 'Notiz', color: 'teal', icon: 'flag' });
  assert.notEqual(S.cards[2].id, 'a', 'doppelte ID wird ersetzt');
  assert.deepEqual(S.cards[3], { id: 'f', col: 2, row: 2, title: 'x' });
  assert.deepEqual(S.links, [{ from: 'a', to: 'b' }, { from: 'b', to: 'f' }]);
  assert.equal(normalizeSeries('x'), null); assert.equal(normalizeSeries({ format: 'plenum-lektion' }), null); assert.equal(normalizeSeries({ version: 99 }), null);
  assert.equal(normalizeSeries({ cards: Array.from({ length: 300 }, (_, i) => ({ col: i % 60, row: Math.floor(i / 60), title: 't' })) }).cards.length, 200);
});

test('Neue IDs behalten Pfeile und schreiben Lektionen um; Reihenfolge folgt den Pfeilen', () => {
  const S = normalizeSeries({ cards: [{ id: 'a', col: 2, row: 0, lesson: 'L1', title: 'A' }, { id: 'b', col: 0, row: 0, title: 'B' }, { id: 'c', col: 1, row: 0, title: 'C' }], links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] });
  const C = seriesWithNewIds(S, { L1: 'L9' });
  assert.notEqual(C.id, S.id); assert.equal(C.cards[0].lesson, 'L9'); assert.equal(C.links.length, 2);
  assert.equal(C.links[0].from, C.cards[0].id); assert.equal(C.links[0].to, C.cards[1].id);
  assert.deepEqual(orderedCards(S).map((c) => c.title), ['A', 'B', 'C']);
  const loop = normalizeSeries({ cards: S.cards, links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }] });
  assert.equal(orderedCards(loop).length, 3, 'ein Kreis bricht die Reihenfolge nicht');
  assert.equal(newSeries().cards.length, 0);
});

test('nextLessons: folgt den Pfeilen, überspringt Platzhalter und fehlende Lektionen', () => {
  const S = normalizeSeries({ cards: [{ id: 'a', col: 0, row: 0, lesson: 'L1', title: 'A' }, { id: 'p', col: 1, row: 0, title: 'Schularbeit' }, { id: 'b', col: 2, row: 0, lesson: 'L2', title: 'B' },
    { id: 'c', col: 0, row: 1, lesson: 'L3', title: 'C' }, { id: 'g', col: 1, row: 1, lesson: 'L4', title: 'gelöscht' }, { id: 'd', col: 2, row: 1, lesson: 'L5', title: 'D' }],
  links: [{ from: 'a', to: 'p' }, { from: 'p', to: 'b' }, { from: 'a', to: 'c' }, { from: 'c', to: 'g' }, { from: 'g', to: 'd' }, { from: 'd', to: 'a' }] });
  assert.deepEqual(nextLessons(S, 'L1'), [{ lesson: 'L3', title: 'C', skipped: [] }, { lesson: 'L2', title: 'B', skipped: ['Schularbeit'] }]);
  assert.deepEqual(nextLessons(S, 'L3', (id) => id !== 'L4'), [{ lesson: 'L5', title: 'D', skipped: ['gelöscht'] }]);
  assert.deepEqual(nextLessons(S, 'L2'), [], 'ohne Pfeil kein nächstes Thema');
  assert.deepEqual(nextLessons(S, 'L5').map((n) => n.lesson), ['L1'], 'ein Kreis läuft nicht endlos');
  assert.deepEqual(nextLessons(S, 'gibt-es-nicht'), []);
});

test('Themenserie mit KI planen: Prompt und Aufbau der Matrix aus der Antwort', () => {
  const p = buildSeriesPrompt({ topic: 'Bruchrechnen', subject: 'Mathematik', grade: '6. Schulstufe', count: 6, notes: 'mit Wiederholung' });
  assert.match(p, /Thema der Serie: Bruchrechnen/); assert.match(p, /genau 6 Themen/); assert.match(p, /KEINE Unterrichtsinhalte/); assert.match(p, /"themen"/); assert.match(p, /mit Wiederholung/);
  // Kette: sechs Themen ohne „nach“ → hin und her in Zeilen zu vier, fünf Pfeile, nur Platzhalter
  const chain = seriesFromPlan({ titel: 'Brüche', themen: ['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => ({ nr: i + 1, titel: t, notiz: 'n' + t })) }, { subject: 'Mathematik' });
  assert.equal(chain.errors.length, 0);
  assert.equal(chain.series.title, 'Brüche'); assert.equal(chain.series.subject, 'Mathematik');
  assert.deepEqual(chain.series.cards.map((c) => [c.title, c.col, c.row]), [['A', 0, 0], ['B', 1, 0], ['C', 2, 0], ['D', 3, 0], ['E', 3, 1], ['F', 2, 1]]);
  assert.equal(chain.series.links.length, 5); assert.ok(chain.series.cards.every((c) => !c.lesson && c.note));
  // Verzweigung: B und C nach A, D nach beiden → Spalten nach Tiefe
  const br = seriesFromPlan({ themen: [{ nr: 1, titel: 'A', nach: [] }, { nr: 2, titel: 'B', nach: [1] }, { nr: 3, titel: 'C', nach: [1] }, { nr: 4, titel: 'D', nach: [2, 3] }] });
  assert.deepEqual(br.series.cards.map((c) => [c.title, c.col, c.row]), [['A', 0, 0], ['B', 1, 0], ['C', 1, 1], ['D', 2, 0]]);
  assert.equal(br.series.links.length, 4);
  // Kreis und unbekannte Vorgänger werden entschärft
  const loop = seriesFromPlan({ themen: [{ nr: 1, titel: 'A', nach: [2] }, { nr: 2, titel: 'B', nach: [1] }, { nr: 3, titel: 'C', nach: [9] }] });
  assert.equal(loop.series.cards.length, 3); assert.equal(loop.series.links.length, 1); assert.ok(loop.notes.length >= 2);
  assert.equal(seriesFromPlan({ foo: 1 }).series, null);
  // Antwort mit Text und Codeblock
  const r = parseSeriesPlan('Gerne!\n```json\n{"titel":"Zellen","themen":[{"nr":1,"titel":"Aufbau","nach":[]},{"nr":2,"titel":"Teilung","nach":[1]}]}\n```\nViel Erfolg!');
  assert.equal(r.series.title, 'Zellen'); assert.deepEqual(r.order.map((c) => c.title), ['Aufbau', 'Teilung']);
  assert.equal(parseSeriesPlan('kein JSON').series, null);
});
