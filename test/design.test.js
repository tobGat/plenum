// Designs, Grafiken und eingebettete Bilder: Prüfen/Reparieren der Lektion und Ausliefern der Bilder
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeLesson } from '../shared/schema.js';
import { LIBRARY, libSvg } from '../shared/graphics.js';
import { buildPrompt } from '../shared/prompt.js';
import { startServer } from '../server/index.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const base = (slides, extra = {}) => ({ title: 'T', sections: [{ name: 'A' }], slides, ...extra });

test('Grafiken: Bibliothek, Symbol, eigenes Bild; ungültige werden entfernt', () => {
  const r = normalizeLesson(base([
    { type: 'info', title: 'a', cards: [{ title: 'x' }], graphic: { src: 'lib:rakete', pos: 'rechts', size: 'groß', caption: '  Rakete  ' } },
    { type: 'info', title: 'b', cards: [{ title: 'x' }], graphic: 'globus' },
    { type: 'info', title: 'c', cards: [{ title: 'x' }], graphic: { src: 'icon:bulb', pos: 'quer' } },
    { type: 'info', title: 'd', cards: [{ title: 'x' }], graphic: { src: 'media:m1', pos: 'background' } },
    { type: 'info', title: 'e', cards: [{ title: 'x' }], graphic: { src: 'lib:gibtsnicht' } },
  ], { media: { m1: { mime: 'image/png', data: PNG, w: 1, h: 1, name: 'x.png' }, m2: { mime: 'image/png', data: PNG, w: 1, h: 1 } } }));
  const g = r.lesson.slides.map((s) => s.graphic || null);
  assert.deepEqual(g[0], { src: 'lib:rakete', pos: 'right', size: 'l', caption: 'Rakete' });
  assert.deepEqual(g[1], { src: 'lib:globus', pos: 'right', size: 'm' });
  assert.deepEqual(g[2], { src: 'icon:bulb', pos: 'right', size: 'm' });
  assert.equal(g[3].src, 'media:m1');
  assert.equal(g[4], null);
  assert.ok(r.repairs.some((x) => /gibtsnicht/.test(x)));
  assert.deepEqual(Object.keys(r.lesson.media), ['m1'], 'ungenutztes Bild m2 wird entfernt');
});

test('Bilder: falscher Typ oder ungültige Daten werden entfernt; Design hat einen Standard', () => {
  const r = normalizeLesson(base([{ type: 'info', title: 'a', cards: [{ title: 'x' }], graphic: { src: 'media:bad' } }],
    { media: { bad: { mime: 'image/svg+xml', data: PNG } } }));
  assert.equal(r.lesson.media, undefined);
  assert.equal(r.lesson.slides[0].graphic, undefined);
  assert.equal(r.lesson.theme, 'standard');
  assert.equal(normalizeLesson(base([{ type: 'title', title: 'x' }], { theme: 'chalk' })).lesson.theme, 'chalk');
  assert.equal(normalizeLesson(base([{ type: 'title', title: 'x' }], { theme: 'neon' })).lesson.theme, 'standard');
  const t = normalizeLesson(base([{ type: 'title', title: 'x', art: 'waves', layout: 'center' }])).lesson.slides[0];
  assert.equal(t.art, 'waves'); assert.equal(t.layout, 'center');
});

test('Bibliothek: jede Grafik ist gültiges SVG; Prompt nennt Designs und Grafiken', () => {
  assert.ok(LIBRARY.length >= 35);
  for (const g of LIBRARY) {
    const s = libSvg(g.name);
    assert.match(s, /^<svg class="gfx" viewBox="0 0 200 200"/, g.name);
    assert.equal((s.match(/</g) || []).length > 3, true, g.name);
    assert.doesNotMatch(s, /undefined|NaN/, g.name);
  }
  const p = buildPrompt({ topic: 'X' });
  assert.match(p, /"theme": Design, einer von "standard"/);
  assert.match(p, /"graphic": \{ "src": "lib:NAME"/);
  assert.match(p, /rakete \(Rakete\)/);
});

test('Bilder ausliefern: Lehrkraft immer, Klasse nur während der Präsentation dieser Lektion', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plenum-design-'));
  const srv = await startServer({ port: 3290, host: '127.0.0.1', tries: 5, token: 'tok', lessonsDir: path.join(tmp, 'l'), dataDir: path.join(tmp, 'd'), samplesDir: path.join(tmp, 'none'), log: { error() {}, info() {} } });
  const url = `http://127.0.0.1:${srv.port}`;
  const L = srv.store.create(normalizeLesson(base([{ type: 'info', title: 'a', cards: [{ title: 'x' }], graphic: { src: 'media:m1' } }],
    { media: { m1: { mime: 'image/png', data: PNG, w: 1, h: 1 } } })).lesson);
  const host = { cookie: 'plenum_host=tok' };
  try {
    let r = await fetch(`${url}/media/${L.id}/m1`, { headers: host });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await r.arrayBuffer()).toString('base64'), PNG);
    assert.equal((await fetch(`${url}/media/${L.id}/m1`)).status, 404, 'ohne Präsentation nicht für die Klasse');
    assert.equal((await fetch(`${url}/media/${L.id}/gibtsnicht`, { headers: host })).status, 404);
    srv.rooms.present(L.id);
    assert.equal((await fetch(`${url}/media/${L.id}/m1`)).status, 200, 'während der Präsentation für die Klasse');
    assert.equal((await fetch(`${url}/media/${L.id}/__proto__`)).status, 404);
  } finally { srv.close(); }
});
