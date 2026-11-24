// Server-Tests: node --test test/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { io as ioc } from 'socket.io-client';
import { startServer } from '../server/index.js';
import { TYPE_LIST } from '../shared/types/index.js';
import { QUIZ_READY_MS } from '../shared/types/quiz.js';

const TOKEN = 'testtoken123';
let S, base, dir;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, opt = {}) => fetch(`${base}/api/host${p}`, { ...opt, headers: { cookie: `plenum_host=${TOKEN}`, 'content-type': 'application/json', ...(opt.headers || {}) } });
const conn = (host) => new Promise((r) => { const s = ioc(base, { transports: ['websocket'], forceNew: true, extraHeaders: host ? { cookie: `plenum_host=${TOKEN}` } : {} }); s.on('connect', () => r(s)); });
const emit = (s, ev, ...a) => new Promise((r) => s.emit(ev, ...a, r));
const once = (s, ev, ms = 3000) => new Promise((r) => { const t = setTimeout(() => r('TIMEOUT'), ms); s.once(ev, (d) => { clearTimeout(t); r(d); }); });
const sockets = [];
async function student(cid) { const s = await conn(false); sockets.push(s); const r = await emit(s, 'join', { cid, proto: 1 }); return { s, r }; }

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plenum-test-'));
  S = await startServer({ port: 3180, host: '127.0.0.1', token: TOKEN, lessonsDir: path.join(dir, 'lektionen'), dataDir: path.join(dir, 'daten'), samplesDir: path.join(dir, 'keine'), appVersion: 'test', log: { error() {} } });
  base = `http://127.0.0.1:${S.port}`;
});
after(() => { sockets.forEach((s) => s.close()); S.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Lehrkraft-Bereich nur mit Token, Host und Origin', async () => {
  assert.equal((await fetch(`${base}/api/host/lessons`)).status, 403);
  assert.equal((await api('/lessons')).status, 200);
  assert.equal((await api('/lessons', { headers: { origin: 'http://boese.example' } })).status, 403);
  const h = await fetch(`${base}/`); assert.match(h.headers.get('content-security-policy'), /script-src 'self'/);
  const fake = await conn(false);
  const r = await Promise.race([emit(fake, 'host:state'), wait(400).then(() => 'TIMEOUT')]);
  assert.equal(r, 'TIMEOUT', 'ohne Token wird host:state nicht beantwortet');
  fake.close();
});

let lessonId;
test('Lektionen anlegen, speichern, duplizieren, exportieren, löschen', async () => {
  const lesson = { title: 'Alle Typen', sections: [{ name: 'A' }, { name: 'B' }], slides: TYPE_LIST.map((t, i) => ({ ...t.sample, section: i < 8 ? 'A' : 'B' })) };
  let r = await (await api('/lessons', { method: 'POST', body: JSON.stringify({ lesson }) })).json();
  assert.equal(r.slides.length, TYPE_LIST.length); lessonId = r.id;
  r.title = 'Alle Typen (geändert)';
  const put = await (await api(`/lessons/${lessonId}`, { method: 'PUT', body: JSON.stringify(r) })).json();
  assert.equal(put.lesson.title, 'Alle Typen (geändert)');
  const list = await (await api('/lessons')).json();
  assert.equal(list.length, 1);
  const dup = await (await api(`/lessons/${lessonId}/duplicate`, { method: 'POST' })).json();
  assert.notEqual(dup.id, lessonId); assert.notEqual(dup.slides[0].id, r.slides[0].id);
  const ex = await api(`/lessons/${lessonId}/export`); assert.match(ex.headers.get('content-disposition'), /\.plenum/);
  assert.equal((await (await api(`/lessons/${dup.id}`, { method: 'DELETE' })).json()).ok, true);
  assert.equal(fs.readdirSync(path.join(dir, 'lektionen')).filter((f) => f.endsWith('.plenum')).length, 1);
});

test('Import aus Chatbot-Antwort: Codeblock, Kommas, Anführungszeichen, Abbruch', async () => {
  const txt = 'Hier ist deine Lektion:\n```json\n{ "title": “Wasser”, "slides": [ {"type":"multiple_choice","title":"Q","question":"Wie „nass“ ist Wasser?","options":[{"text":"sehr","correct":true},{"text":"gar nicht","correct":false},],}, {"type":"umfrage","title":"P","options":["a","b"]}, {"type":"info","title":"abgeschn';
  const r = await (await api('/import/parse', { method: 'POST', body: JSON.stringify({ text: txt }) })).json();
  assert.ok(r.lesson, JSON.stringify(r.errors));
  assert.equal(r.lesson.slides.length, 2);
  assert.equal(r.lesson.slides[0].type, 'mc');
  assert.equal(r.lesson.slides[0].question, 'Wie „nass“ ist Wasser?');
  assert.ok(r.repairs.some((x) => /abgeschnitten/.test(x)));
  const bad = await (await api('/import/parse', { method: 'POST', body: JSON.stringify({ text: 'kein json hier' }) })).json();
  assert.equal(bad.lesson, null);
});

let host, L;
test('Präsentieren, Beitritt ohne Code, nur aktuelle Folie an die Klasse', async () => {
  host = await conn(true); sockets.push(host);
  const w = await student('waiting1');
  assert.equal(w.r.wait, true);
  const startEv = once(w.s, 'start');
  const st = await emit(host, 'host:present', { lessonId });
  assert.equal(st.presenting, true); L = st.lesson;
  assert.notEqual(await startEv, 'TIMEOUT');
  const a = await student('studentAAA');
  assert.equal(a.r.ok, true);
  assert.equal(a.r.slide.type, 'title');
  assert.ok(!JSON.stringify(a.r).includes('"correct":true'), 'keine Lösungen der anderen Folien');
});

const goto = async (type) => { const s = L.slides.find((x) => x.type === type); host.emit('host:slide', s.id); await wait(80); return s; };

test('Multiple Choice: Antwort zählt, Auswertung kommt bei der Lehrkraft an', async () => {
  const s = await goto('mc');
  const { s: st } = await student('studentBBB');
  const aggEv = once(host, 'agg');
  const r = await emit(st, 'submit', { slideId: s.id, data: { choice: 1 } });
  assert.equal(r.ok, true);
  const agg = await aggEv;
  assert.equal(agg.data.n, 1); assert.equal(agg.data.ok, 1);
  assert.equal((await emit(st, 'submit', { slideId: s.id, data: { choice: 99 } })).ok, false);
});

test('Split-Umfrage: Gruppen abwechselnd, jede sieht ihre Frage', async () => {
  const s = L.slides.find((x) => x.type === 'poll');
  s.splitA = 'Neutral?'; s.splitB = 'Suggestiv?';
  await api(`/lessons/${lessonId}`, { method: 'PUT', body: JSON.stringify(L) });
  const ap = await emit(host, 'host:applyLesson', lessonId); L = ap.lesson;
  host.emit('host:slide', s.id); await wait(80);
  const qs = [];
  for (let i = 0; i < 4; i++) {
    const { s: so, r } = await student(`split${i}xyz`);
    qs.push(r.slide.data.question);
    await emit(so, 'submit', { slideId: s.id, data: { choices: [0] } });
  }
  assert.equal(qs.filter((q) => q === 'Neutral?').length, 2, qs.join('|'));
  const st = await emit(host, 'host:state');
  assert.equal(st.aggs[s.id].A.n + st.aggs[s.id].B.n, 4);
});

test('Quiz: Server-Uhr, erste Antwort zählt, Lösung erst bei Auflösung, Rangliste', async () => {
  const s = await goto('quiz');
  s.time = 5;
  const { s: q1 } = await student('quizzer1');
  const { s: q2 } = await student('quizzer2');
  assert.equal((await emit(q1, 'submit', { slideId: s.id, data: { choice: 0 } })).ok, false, 'vor dem Start keine Antwort');
  host.emit('host:quiz', { slideId: s.id, action: 'start' });
  const ready = await once(q1, 'slide');
  assert.equal(ready.data.phase, 'ready');
  const running = await once(q1, 'slide', QUIZ_READY_MS + 1500);
  assert.equal(running.data.phase, 'running');
  assert.equal(running.data.correct, undefined, 'keine Lösung während des Laufs');
  assert.equal((await emit(q1, 'submit', { slideId: s.id, data: { choice: 0 } })).ok, true);
  assert.equal((await emit(q1, 'submit', { slideId: s.id, data: { choice: 1 } })).ok, false, 'nur die erste Antwort');
  await emit(q2, 'submit', { slideId: s.id, data: { choice: 1 } });
  host.emit('host:quiz', { slideId: s.id, action: 'stop' });
  await wait(100);
  const rev = once(q1, 'slide');
  host.emit('host:quiz', { slideId: s.id, action: 'reveal' });
  const r = await rev;
  assert.equal(r.data.phase, 'revealed'); assert.equal(r.data.correct, 0); assert.ok(r.data.points > 500);
  const lb = L.slides.find((x) => x.type === 'leaderboard');
  const st = await emit(host, 'host:state');
  assert.equal(st.aggs[lb.id].ranking[0].rank, 1);
  assert.match(st.aggs[lb.id].ranking[0].nick, /^\S+ \d+$/, 'automatischer Spitzname');
  assert.equal((await emit(q1, 'nick', 'Max')).ok, false, 'freie Namen standardmäßig aus');
  host.emit('host:freeNicks', true); await wait(50);
  assert.equal((await emit(q1, 'nick', 'Arschloch')).ok, false, 'Filter');
  assert.equal((await emit(q1, 'nick', 'Max')).ok, true);
});

test('Wortwolke und offene Antworten: Filter hält zurück, Freigabe zeigt', async () => {
  const w = await goto('wordcloud');
  const { s: so } = await student('cloudy1');
  await emit(so, 'submit', { slideId: w.id, data: { words: ['Meer', 'meer', 'Scheiße'] } });
  let st = await emit(host, 'host:state');
  const words = st.aggs[w.id].words;
  assert.equal(words.length, 2, 'doppelte zusammengefasst');
  assert.equal(words.find((x) => x.key === 'scheiße').visible, false);
  host.emit('host:moderate', { slideId: w.id, action: 'hide', key: 'meer' }); await wait(50);
  st = await emit(host, 'host:state');
  assert.equal(st.aggs[w.id].words.find((x) => x.key === 'meer').visible, false);
  const o = await goto('open');
  const r1 = await emit(so, 'submit', { slideId: o.id, data: { text: 'Duschen statt baden' } });
  assert.equal(r1.ok, true);
  st = await emit(host, 'host:state');
  const item = st.aggs[o.id].items[0];
  assert.equal(item.visible, false, 'erst nach Freigabe');
  host.emit('host:moderate', { slideId: o.id, action: 'show', key: item.id }); await wait(50);
  st = await emit(host, 'host:state');
  assert.equal(st.aggs[o.id].items[0].visible, true);
});

test('Stände: speichern, laden, geänderte Folien erkennen', async () => {
  const mcSlide = L.slides.find((x) => x.type === 'mc');
  const r = await emit(host, 'host:saveAs', 'Klasse 4a');
  assert.equal(r.ok, true); assert.equal(r.slot.id, 'klasse-4a');
  const list = await emit(host, 'host:states');
  assert.ok(list.some((x) => x.id === 'klasse-4a'));
  await emit(host, 'host:clearRoom');
  assert.equal(Object.keys((await emit(host, 'host:state')).aggs[mcSlide.id].counts).length, 0);
  // Lektion ändern: andere Antworten → Fingerabdruck anders
  mcSlide.options[0].text = 'ganz neue Antwort';
  await api(`/lessons/${lessonId}`, { method: 'PUT', body: JSON.stringify(L) });
  await emit(host, 'host:present', { lessonId });
  const ld = await emit(host, 'host:loadState', 'klasse-4a');
  assert.equal(ld.ok, true);
  assert.ok(ld.changed.includes(mcSlide.id), 'geänderte Folie markiert');
  assert.equal(ld.slot.name, 'Klasse 4a');
});

test('Folien ohne Aufgabe: standardmäßig nur vorne, auf Wunsch auch auf den Geräten', async () => {
  const info = await goto('info');
  const a = await student('hiddenAAA');
  assert.equal(a.r.slide.hidden, true);
  assert.deepEqual(a.r.slide.data, { title: info.title }, 'kein Inhalt der Info-Folie am Gerät');
  await goto('mc');
  const mcP = await emit(a.s, 'join', { cid: 'hiddenAAA', proto: 1 });
  assert.equal(mcP.slide.hidden, false); assert.ok(mcP.slide.data.options, 'Aufgaben erscheinen wie bisher');
  // Im freien Modus (nicht „Alle folgen“) lesen die Geräte selbstständig → Inhalt sichtbar
  await goto('info'); host.emit('host:sync', false); await wait(80);
  assert.equal((await emit(a.s, 'join', { cid: 'hiddenAAA', proto: 1 })).slide.hidden, false);
  await emit(host, 'host:stop');
  L.studentSlides = true;
  const put = await (await api(`/lessons/${lessonId}`, { method: 'PUT', body: JSON.stringify(L) })).json();
  assert.equal(put.lesson.studentSlides, true);
  const st = await emit(host, 'host:present', { lessonId }); L = st.lesson;
  await goto('info');
  const b = await emit(a.s, 'join', { cid: 'hiddenAAA', proto: 1 });
  assert.equal(b.slide.hidden, false); assert.ok(b.slide.data.cards, 'Info-Folie mit Inhalt');
});

test('Stände löschen: einzeln und alle, nicht während der Präsentation', async () => {
  await emit(host, 'host:saveAs', 'Klasse 3b');
  assert.equal((await api(`/states/${lessonId}/klasse-3b`, { method: 'DELETE' })).status, 409);
  await emit(host, 'host:stop');
  let list = await (await api(`/states/${lessonId}`)).json();
  assert.ok(list.length >= 2, 'mehrere Stände vorhanden');
  assert.equal((await api(`/states/${lessonId}/..%2Fx`, { method: 'DELETE' })).status, 400);
  list = await (await api(`/states/${lessonId}/klasse-3b`, { method: 'DELETE' })).json();
  assert.ok(!list.some((x) => x.id === 'klasse-3b') && list.length >= 1);
  list = await (await api(`/states/${lessonId}/_all`, { method: 'DELETE' })).json();
  assert.deepEqual(list, []);
  assert.equal((await (await api('/lessons')).json()).find((x) => x.id === lessonId).lastState, null);
});

test('Port belegt → nächster Port im Bereich', async () => {
  const blocker = net.createServer().listen(3190, '127.0.0.1');
  await new Promise((r) => blocker.once('listening', r));
  const S2 = await startServer({ port: 3190, host: '127.0.0.1', token: 'x', lessonsDir: path.join(dir, 'l2'), dataDir: path.join(dir, 'd2'), samplesDir: path.join(dir, 'keine'), log: { error() {} } });
  assert.equal(S2.port, 3191);
  S2.close(); blocker.close();
});
