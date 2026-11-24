// Präsentationszustand: eine laufende Präsentation pro App (die Lehrkraft am eigenen PC).
// Schülergeräte bekommen nur die aktuelle Folie (toStudent), Antworten laufen über die Typ-Registry.
import { TYPES } from '../shared/types/index.js';
import { outline, fingerprint, sectionOf } from '../shared/schema.js';
import { QUIZ_READY_MS } from '../shared/types/quiz.js';
import { newId, hash, isObj, slug } from '../shared/util.js';
import { isFlagged } from '../shared/filter.js';

export const PROTO = 1; // Protokollversion: passt sie nicht, laden Schülerseiten neu
const MAX_CLIENTS = 150;
const ANIMALS = ['Fuchs', 'Dachs', 'Eule', 'Luchs', 'Biber', 'Igel', 'Otter', 'Falke', 'Wal', 'Panda', 'Koala', 'Gecko', 'Möwe', 'Hase', 'Reh',
  'Bär', 'Wolf', 'Kranich', 'Pinguin', 'Delfin', 'Elch', 'Lama', 'Tiger', 'Zebra', 'Kauz', 'Specht', 'Marder', 'Robbe', 'Fink', 'Hirsch'];
const okCid = (v) => typeof v === 'string' && /^[\w-]{6,40}$/.test(v);

// Gespeicherte Antworten prüfen (Stand-Dateien könnten beschädigt oder veraltet sein)
function shapeOk(s, v) {
  const n = s.type === 'truefalse' ? s.items.length : s.type === 'sort' ? s.categories.reduce((k, c) => k + c.items.length, 0) : s.type === 'scale' ? s.statements.length : 0;
  switch (s.type) {
    case 'mc': return Number.isInteger(v) && v >= 0 && v < s.options.length;
    case 'truefalse': case 'sort': case 'scale': return Array.isArray(v) && v.length === n;
    case 'poll': return isObj(v) && Array.isArray(v.c) && v.c.every((i) => Number.isInteger(i) && i >= 0 && i < s.options.length);
    case 'wordcloud': return Array.isArray(v) && v.every((w) => typeof w === 'string');
    case 'open': return Array.isArray(v) && v.every((a) => isObj(a) && typeof a.text === 'string' && typeof a.id === 'string');
    case 'quiz': return isObj(v) && Number.isInteger(v.c) && v.c >= 0 && v.c < s.options.length;
    case 'task': return v === true;
    default: return false;
  }
}

export function createRooms({ io, store, extraWords = () => [] }) {
  let room = null;
  const sockS = () => io.sockets.adapter.rooms.get('s') || new Set();
  const online = () => sockS().size;
  const slideOf = (id) => room && room.lesson.slides.find((s) => s.id === id);
  const groupOf = (cid, sid) => (((room.order[cid] ?? 0) + parseInt(hash(sid), 36)) % 2 ? 'b' : 'a');
  const toHost = (ev, d) => io.to('h').emit(ev, d);

  // ---------- Spitznamen & Rangliste ----------
  function autoNick() {
    const used = new Set(Object.values(room.nicks).map((n) => n.toLowerCase()));
    for (let i = 0; i < 400; i++) { const n = `${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]} ${1 + Math.floor(Math.random() * 99)}`; if (!used.has(n.toLowerCase())) return n; }
    return `Gast ${Object.keys(room.nicks).length + 1}`;
  }
  const nickOf = (cid) => room.nicks[cid] || (room.nicks[cid] = autoNick());
  function ranking() {
    const tot = {};
    for (const s of room.lesson.slides) if (s.type === 'quiz') for (const [cid, sub] of Object.entries(room.subs[s.id] || {})) tot[cid] = (tot[cid] || 0) + (sub.p || 0);
    const list = Object.entries(tot).map(([cid, total]) => ({ cid, total, nick: nickOf(cid) })).sort((a, b) => b.total - a.total || a.nick.localeCompare(b.nick, 'de'));
    let rank = 0, prev = null;
    list.forEach((x, i) => { if (x.total !== prev) { rank = i + 1; prev = x.total; } x.rank = rank; });
    return list;
  }

  // ---------- Auswertungen & Schülersicht ----------
  function aggOf(s) {
    const def = TYPES[s.type];
    if (!def.aggregate) return null;
    return def.aggregate(s, room.subs[s.id] || {}, { meta: room.meta[s.id] || {}, now: Date.now(), extraWords: extraWords(), ranking: s.type === 'leaderboard' ? ranking().map(({ cid, ...x }) => x) : undefined });
  }
  // Grafik für Geräte: eigene Bilder als Adresse (werden einzeln geladen und zwischengespeichert)
  const graphicFor = (s) => (s.graphic ? { ...s.graphic, src: s.graphic.src.startsWith('media:') ? `/media/${room.lesson.id}/${s.graphic.src.slice(6)}` : s.graphic.src } : null);
  function payloadFor(cid) {
    const sid = room.sync ? room.slideId : room.pos[cid] || room.slideId;
    const s = slideOf(sid) || room.lesson.slides[0];
    const def = TYPES[s.type], sec = sectionOf(room.lesson, s);
    const ctx = { cid, group: groupOf(cid, s.id), mine: room.subs[s.id]?.[cid], meta: room.meta[s.id], now: Date.now() };
    // Folien ohne Aufgabe bleiben am Beamer, außer die Lektion zeigt sie ausdrücklich auch auf den Geräten
    const hidden = room.sync && !!def.passive && !room.lesson.studentSlides;
    if (s.type === 'leaderboard') {
      const r = ranking(), me = r.find((x) => x.cid === cid);
      ctx.me = { rank: me ? me.rank : null, total: me ? me.total : 0, nick: nickOf(cid), players: r.length };
    }
    return { id: s.id, type: s.type, index: room.lesson.slides.indexOf(s), total: room.lesson.slides.length, hostIndex: room.lesson.slides.findIndex((x) => x.id === room.slideId),
      sync: room.sync, section: { name: sec.name, color: sec.color, icon: sec.icon }, theme: room.lesson.theme || 'standard', hidden, graphic: hidden ? null : graphicFor(s), data: !hidden && def.toStudent ? def.toStudent(s, ctx) : { title: s.title } };
  }
  const studentSockets = () => [...sockS()].map((id) => io.sockets.sockets.get(id)).filter((so) => so && so.data.cid);
  const pushStudent = (so) => so.emit('slide', payloadFor(so.data.cid));
  const pushAll = () => studentSockets().forEach(pushStudent);
  const pushOnSlide = (sid) => studentSockets().forEach((so) => { if ((room.sync ? room.slideId : room.pos[so.data.cid] || room.slideId) === sid) pushStudent(so); });
  function pushAgg(s) {
    toHost('agg', { slideId: s.id, data: aggOf(s) });
    if (s.type === 'quiz') room.lesson.slides.filter((x) => x.type === 'leaderboard').forEach((x) => { toHost('agg', { slideId: x.id, data: aggOf(x) }); pushOnSlide(x.id); });
  }
  const players = () => Object.keys(room.nicks).filter((c) => room.cids.has(c)).map((cid) => ({ cid, nick: room.nicks[cid] }));

  function hostState() {
    if (!room) return { presenting: false };
    const aggs = {};
    for (const s of room.lesson.slides) { const a = aggOf(s); if (a) aggs[s.id] = a; }
    return { presenting: true, lesson: room.lesson, slideId: room.slideId, sync: room.sync, aggs, online: online(), slot: room.slot, changed: room.changed, freeNicks: room.freeNicks, players: players() };
  }

  // ---------- Stände (automatisch und benannt) ----------
  function snapshot(name) {
    const meta = {};
    for (const [k, m] of Object.entries(room.meta)) {
      meta[k] = { ...m };
      if (m.phase === 'ready' || m.phase === 'running') { meta[k].phase = 'closed'; meta[k].endsAt = Math.min(m.endsAt, Date.now()); }
    }
    const fps = { ...room.orphanFps };
    for (const s of room.lesson.slides) if (room.subs[s.id]) fps[s.id] = fingerprint(s);
    return { version: 1, lessonId: room.lesson.id, name, savedAt: new Date().toISOString(), slideId: room.slideId, sync: room.sync, subs: { ...room.orphans, ...room.subs }, meta, order: room.order, fingerprints: fps };
  }
  const isEmpty = () => !Object.keys(room.subs).length && room.slideId === room.lesson.slides[0].id;
  function saveNow() {
    if (!room) return;
    clearTimeout(room.saveTimer); room.saveTimer = null;
    if (!room.slot && isEmpty()) return;
    const id = room.slot ? room.slot.id : '_auto';
    try { store.saveState(room.lesson.id, id, snapshot(room.slot ? room.slot.name : 'Letzte Sitzung (automatisch)')); } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); return; }
    if (id === '_auto') room.autoSaved = true;
    toHost('saved', { at: Date.now(), slot: room.slot });
  }
  function dirty() { const R = room; clearTimeout(R.saveTimer); R.saveTimer = setTimeout(() => { if (room === R) saveNow(); }, 1500); }
  const flush = () => { if (room && room.saveTimer) saveNow(); };

  function loadState(stateId) {
    const d = store.loadState(room.lesson.id, stateId);
    if (!d) return false;
    const subs = isObj(d.subs) ? d.subs : {}, fps = isObj(d.fingerprints) ? d.fingerprints : {};
    Object.assign(room, { subs: {}, meta: {}, orphans: {}, orphanFps: {}, changed: [] });
    for (const [sid, per] of Object.entries(subs)) {
      if (!isObj(per)) continue;
      const s = slideOf(sid);
      if (!s) { room.orphans[sid] = per; if (fps[sid]) room.orphanFps[sid] = fps[sid]; continue; } // Folie gelöscht: im Stand behalten
      const clean = {};
      for (const [cid, v] of Object.entries(per)) if (okCid(cid) && shapeOk(s, v)) clean[cid] = v;
      room.subs[sid] = clean;
      if (fps[sid] && fps[sid] !== fingerprint(s)) room.changed.push(sid);
    }
    if (isObj(d.meta)) for (const [sid, m] of Object.entries(d.meta)) if (slideOf(sid) && isObj(m)) room.meta[sid] = m;
    room.order = {};
    if (isObj(d.order)) for (const [cid, n] of Object.entries(d.order)) if (okCid(cid) && Number.isInteger(n) && n >= 0) room.order[cid] = n;
    room.nextIdx = Object.values(room.order).reduce((m, n) => Math.max(m, n + 1), 0);
    room.slideId = slideOf(d.slideId) ? d.slideId : room.lesson.slides[0].id;
    room.sync = d.sync !== false;
    room.slot = stateId === '_auto' ? null : { id: stateId, name: String(d.name || stateId).slice(0, 40) };
    return true;
  }
  function stopTimers() { if (room) Object.values(room.timers).forEach((t) => { clearTimeout(t.a); clearTimeout(t.b); }); }
  function attachConnected() {
    for (const so of studentSockets()) {
      room.cids.add(so.data.cid);
      if (!(so.data.cid in room.order)) room.order[so.data.cid] = room.nextIdx++;
      nickOf(so.data.cid);
    }
  }

  const api = {
    get room() { return room; },
    online, hostState, flush, PROTO,

    present(lessonId, stateId) {
      const lesson = store.get(lessonId);
      if (!lesson || !lesson.slides.length) return { error: 'Lektion nicht gefunden oder leer' };
      if (room) { flush(); stopTimers(); }
      room = { lesson, slideId: lesson.slides[0].id, sync: true, subs: {}, meta: {}, cids: new Set(), order: {}, nextIdx: 0, nicks: {}, pos: {},
        slot: null, changed: [], orphans: {}, orphanFps: {}, timers: {}, saveTimer: null, freeNicks: false, autoSaved: false };
      if (stateId) loadState(stateId);
      attachConnected();
      io.to('w').emit('start');
      io.to('s').emit('lesson', { outline: outline(lesson), title: lesson.title, theme: lesson.theme || 'standard' });
      pushAll();
      return hostState();
    },
    stop() {
      if (!room) return;
      flush(); stopTimers();
      room = null;
      io.to('s').emit('stopped');
      for (const so of studentSockets()) { so.leave('s'); so.join('w'); }
    },
    setSlide(sid) {
      if (!room || !slideOf(sid)) return;
      room.slideId = sid; dirty();
      toHost('slideChanged', { slideId: sid });
      if (room.sync) pushAll(); else studentSockets().forEach((so) => so.emit('hostSlide', room.lesson.slides.findIndex((x) => x.id === sid)));
    },
    setSync(on) { if (!room) return; room.sync = !!on; dirty(); toHost('syncChanged', { sync: room.sync }); pushAll(); },
    reset(sid) {
      const s = slideOf(sid);
      if (!s) return;
      if (room.timers[sid]) { clearTimeout(room.timers[sid].a); clearTimeout(room.timers[sid].b); }
      delete room.subs[sid]; delete room.meta[sid];
      room.changed = room.changed.filter((x) => x !== sid);
      dirty(); pushAgg(s); pushOnSlide(sid);
    },
    quiz(sid, action) {
      const s = slideOf(sid);
      if (!s || s.type !== 'quiz') return;
      const R = room, t = room.timers[sid] || (room.timers[sid] = {}), now = Date.now();
      const change = () => { if (room !== R) return; dirty(); pushAgg(s); pushOnSlide(sid); };
      clearTimeout(t.a); clearTimeout(t.b);
      const m = room.meta[sid];
      if (action === 'start') {
        delete room.subs[sid];
        const startedAt = now + QUIZ_READY_MS, endsAt = startedAt + s.time * 1000;
        room.meta[sid] = { phase: 'ready', startedAt, endsAt };
        t.a = setTimeout(() => { if (room === R && R.meta[sid]) { R.meta[sid].phase = 'running'; change(); } }, QUIZ_READY_MS);
        t.b = setTimeout(() => { if (room === R && R.meta[sid]) { R.meta[sid].phase = 'closed'; change(); } }, QUIZ_READY_MS + s.time * 1000);
      } else if (action === 'stop' && m && (m.phase === 'ready' || m.phase === 'running')) { m.phase = 'closed'; m.endsAt = Math.min(m.endsAt, now); }
      else if (action === 'reveal' && m && m.phase !== 'idle') { m.phase = 'revealed'; if (m.endsAt > now) m.endsAt = now; }
      else if (action === 'reset') { delete room.subs[sid]; delete room.meta[sid]; }
      change();
    },
    moderate(sid, action, key) {
      const s = slideOf(sid);
      if (!s || !['wordcloud', 'open'].includes(s.type)) return;
      const m = room.meta[sid] || (room.meta[sid] = {});
      m.hidden = m.hidden || []; m.approved = m.approved || [];
      const rm = (arr, k) => { const i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); };
      const k = String(key || '').slice(0, 60);
      if (action === 'hide') { rm(m.approved, k); if (!m.hidden.includes(k)) m.hidden.push(k); }
      else if (action === 'show') { rm(m.hidden, k); if (!m.approved.includes(k)) m.approved.push(k); }
      else if (action === 'showAll') m.showAll = true;
      else if (action === 'hideAll') { m.showAll = false; m.approved = []; }
      dirty(); pushAgg(s);
    },
    setFreeNicks(on) { if (!room) return; room.freeNicks = !!on; io.to('s').emit('nickRules', { freeNicks: room.freeNicks }); },
    setNick(cid, name, byHost) {
      if (!room || !okCid(cid)) return { ok: false };
      if (name == null) { room.nicks[cid] = autoNick(); }
      else {
        name = String(name).replace(/\s+/g, ' ').trim().slice(0, 16);
        if (name.length < 2) return { ok: false, error: 'Mindestens 2 Zeichen.' };
        if (!byHost && !room.freeNicks) return { ok: false, error: 'Eigene Spitznamen sind gerade nicht erlaubt.' };
        if (isFlagged(name, extraWords())) return { ok: false, error: 'Dieser Name ist nicht erlaubt.' };
        if (Object.entries(room.nicks).some(([c, n]) => c !== cid && n.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Diesen Namen gibt es schon.' };
        room.nicks[cid] = name;
      }
      room.lesson.slides.filter((x) => x.type === 'leaderboard').forEach((x) => { toHost('agg', { slideId: x.id, data: aggOf(x) }); pushOnSlide(x.id); });
      toHost('players', players());
      studentSockets().filter((so) => so.data.cid === cid).forEach((so) => so.emit('nick', room.nicks[cid]));
      return { ok: true, nick: room.nicks[cid] };
    },
    clearRanking() { if (!room) return; room.lesson.slides.filter((s) => s.type === 'quiz').forEach((s) => { delete room.subs[s.id]; delete room.meta[s.id]; }); room.nicks = {}; attachConnected(); dirty(); room.lesson.slides.forEach((s) => { if (s.type === 'quiz' || s.type === 'leaderboard') { pushAgg(s); pushOnSlide(s.id); } }); toHost('players', players()); },

    // Stände
    listStates() { return room ? store.statesOf(room.lesson.id) : []; },
    saveAs(name) {
      if (!room) return { ok: false };
      name = String(name || '').trim().slice(0, 40);
      if (!/[a-z0-9äöüß]/i.test(name)) return { ok: false, error: 'Bitte einen Namen mit Buchstaben oder Ziffern eingeben.' };
      if (!room.slot && room.autoSaved) { store.deleteState(room.lesson.id, '_auto'); room.autoSaved = false; }
      room.slot = { id: slug(name, 40), name };
      saveNow();
      return { ok: true, slot: room.slot };
    },
    loadState(stateId) {
      if (!room || !/^[\w-]{1,40}$/.test(String(stateId))) return { ok: false };
      saveNow();
      stopTimers();
      if (!loadState(stateId)) return { ok: false, error: 'Stand nicht gefunden' };
      attachConnected();
      pushAll();
      return { ok: true, ...hostState() };
    },
    deleteState(stateId) {
      if (!room || stateId === '_auto' || !/^[\w-]{1,40}$/.test(String(stateId))) return { ok: false };
      store.deleteState(room.lesson.id, stateId);
      if (room.slot && room.slot.id === stateId) room.slot = null;
      return { ok: true, slot: room.slot };
    },
    clearRoom() {
      if (!room) return { ok: false };
      saveNow(); stopTimers();
      Object.assign(room, { slideId: room.lesson.slides[0].id, sync: true, subs: {}, meta: {}, orphans: {}, orphanFps: {}, changed: [], slot: null, autoSaved: false, pos: {}, timers: {} });
      pushAll();
      return { ok: true, ...hostState() };
    },
    // Lektion während der Präsentation geändert („Änderungen übernehmen“): Antworten geänderter Folien verwerfen
    applyLesson(lesson) {
      if (!room || lesson.id !== room.lesson.id) return { ok: false };
      const oldFp = Object.fromEntries(room.lesson.slides.map((s) => [s.id, fingerprint(s)]));
      room.lesson = lesson;
      for (const sid of Object.keys(room.subs)) { const s = slideOf(sid); if (!s || oldFp[sid] !== fingerprint(s)) { delete room.subs[sid]; delete room.meta[sid]; } }
      if (!slideOf(room.slideId)) room.slideId = lesson.slides[0].id;
      dirty();
      io.to('s').emit('lesson', { outline: outline(lesson), title: lesson.title, theme: lesson.theme || 'standard' });
      pushAll();
      return { ok: true, ...hostState() };
    },

    // ---------- Klasse ----------
    join(socket, d) {
      if (!d || !okCid(d.cid)) return { ok: false };
      if (d.proto !== PROTO) return { ok: false, reload: true };
      socket.data.cid = d.cid;
      if (!room) { socket.join('w'); return { ok: false, wait: true }; }
      if (!room.cids.has(d.cid) && room.cids.size >= MAX_CLIENTS) return { ok: false, full: true };
      room.cids.add(d.cid);
      if (!(d.cid in room.order)) room.order[d.cid] = room.nextIdx++;
      socket.leave('w'); socket.join('s');
      toHost('online', online());
      toHost('players', players());
      return { ok: true, title: room.lesson.title, theme: room.lesson.theme || 'standard', outline: outline(room.lesson), nick: nickOf(d.cid), freeNicks: room.freeNicks, slide: payloadFor(d.cid) };
    },
    goto(socket, sid) { if (room && !room.sync && slideOf(sid) && socket.data.cid) { room.pos[socket.data.cid] = sid; pushStudent(socket); } },
    submit(socket, sid, data) {
      const cid = socket.data.cid, s = slideOf(sid);
      if (!room || !cid || !s || !room.cids.has(cid)) return { ok: false };
      const def = TYPES[s.type];
      if (!def.accept) return { ok: false };
      if (Object.keys(room.subs).length > 400 && !room.subs[sid]) return { ok: false };
      const prev = room.subs[sid]?.[cid];
      const v = def.accept(s, data, { cid, prev, group: groupOf(cid, sid), meta: room.meta[sid] || {}, now: Date.now(), newId: () => newId('a') });
      if (v == null) return { ok: false };
      (room.subs[sid] || (room.subs[sid] = {}))[cid] = v;
      dirty(); pushAgg(s);
      if (s.type === 'quiz') return { ok: true };
      return { ok: true, mine: s.type === 'open' ? v.map((a) => a.text) : s.type === 'poll' ? v.c : v };
    },
    left() { if (room) toHost('online', online()); },
  };
  return api;
}
