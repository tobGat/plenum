// Plenum-Server: Express + Socket.io. Lehrkraft-Bereich nur am eigenen PC mit Start-Token, Klasse über das lokale Netz.
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import compression from 'compression';
import QRCode from 'qrcode';
import { createStore } from './store.js';
import { createRooms, stateAggs } from './rooms.js';
import { parseImport } from './aiimport.js';
import { normalizeLesson, withNewIds } from '../shared/schema.js';
import { slug, isObj } from '../shared/util.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSP_HOST = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-src 'self' https://www.youtube-nocookie.com; media-src 'self' https: http:; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";

// IPv4-Adressen im lokalen Netz, echte Adapter (WLAN/LAN) zuerst
export function lanAddresses(port) {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254.')) continue;
      const virtual = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Docker|Loopback|Bluetooth|TAP|Tailscale|ZeroTier|VPN/i.test(name);
      const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      list.push({ name, address: a.address, url: `http://${a.address}:${port}`, rank: (virtual ? 2 : 0) + (priv ? 0 : 1) });
    }
  }
  return list.sort((a, b) => a.rank - b.rank).map(({ rank, ...x }) => x);
}

export async function startServer(opts) {
  const { port: firstPort = 3080, host = '0.0.0.0', tries = 10, token, lessonsDir, dataDir, samplesDir = path.join(ROOT, 'samples'), appVersion = '', isStore = false, log = console } = opts;
  const store = createStore({ lessonsDir, dataDir, samplesDir, appVersion });
  store.ensureSamples();
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 1e5 });
  const rooms = createRooms({ io, store, extraWords: () => store.settings.extraWords || [] });
  let port = firstPort;

  // ---------- Schutz des Lehrkraft-Bereichs ----------
  const isLoop = (a) => /^(127\.|::1$|::ffff:127\.)/.test(String(a || ''));
  const hostOk = (h) => h === `127.0.0.1:${port}` || h === `localhost:${port}`;
  const cookieOf = (headers) => (String(headers.cookie || '').match(/(?:^|;\s*)plenum_host=([^;]+)/) || [])[1];
  const originOk = (headers) => !headers.origin || hostOk(String(headers.origin).replace(/^https?:\/\//, ''));
  const authed = (headers, addr) => !!token && isLoop(addr) && hostOk(headers.host) && originOk(headers) && cookieOf(headers) === token;

  app.disable('x-powered-by');
  app.use(compression());
  app.use((req, res, next) => { res.set({ 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next(); });
  const page = (f, headers = {}) => (req, res) => res.sendFile(path.join(ROOT, 'public', f), { headers: { 'Cache-Control': 'no-store', ...headers } });
  // Nur die Seiten der Lehrkraft dürfen Videos einbetten (Video-Folie): YouTube über youtube-nocookie und direkte Videodateien.
  // Die Seite der Klasse behält die strenge Richtlinie – Schülergeräte laden nie etwas aus dem Internet.
  const hostPage = (f) => page(f, { 'Content-Security-Policy': CSP_HOST });
  app.get('/host', (req, res, next) => (isLoop(req.socket.remoteAddress) && hostOk(req.headers.host) ? next() : res.redirect('/')), hostPage('host.html'));
  app.get('/preview', (req, res, next) => (authed(req.headers, req.socket.remoteAddress) ? next() : res.status(403).end()), hostPage('preview.html'));
  app.get('/print', (req, res, next) => (authed(req.headers, req.socket.remoteAddress) ? next() : res.status(403).end()), page('print.html'));
  app.get('/', page('index.html'));
  // Eingebettete Bilder einer Lektion: für die Lehrkraft immer, für die Klasse nur, solange diese Lektion präsentiert wird
  app.get('/media/:lessonId/:mediaId', (req, res) => {
    const { lessonId, mediaId } = req.params;
    const live = rooms.room && rooms.room.lesson.id === lessonId;
    if (!live && !authed(req.headers, req.socket.remoteAddress)) return res.status(404).end();
    const L = live ? rooms.room.lesson : store.get(lessonId);
    const m = L && L.media && Object.prototype.hasOwnProperty.call(L.media, mediaId) ? L.media[mediaId] : null;
    if (!m) return res.status(404).end();
    res.set({ 'Content-Type': m.mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.end(Buffer.from(m.data, 'base64'));
  });
  app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: 0 }));
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: 0, index: false }));

  // ---------- REST für Bibliothek & Editor ----------
  const api = express.Router();
  api.use((req, res, next) => (authed(req.headers, req.socket.remoteAddress) ? next() : res.status(403).json({ error: 'Nur in der Plenum-App verfügbar.' })));
  api.use(express.json({ limit: '80mb' })); // Lektionen mit eingebetteten Bildern
  const presentingId = () => rooms.room && rooms.room.lesson.id;
  const fail = (res, code, error) => res.status(code).json({ error });
  const download = (res, name, data) => { res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`); res.type('application/octet-stream').send(JSON.stringify(data, null, 2)); };

  api.get('/info', (req, res) => res.json({ version: appVersion, port, urls: lanAddresses(port), lessonsDir: store.lessonsDir, store: isStore, settings: store.settings, presenting: presentingId() || null }));
  api.get('/lessons', (req, res) => res.json(store.list()));
  api.get('/lessons/:id', (req, res) => { const L = store.get(req.params.id); return L ? res.json(L) : fail(res, 404, 'Lektion nicht gefunden'); });
  api.post('/lessons', (req, res) => {
    try {
      let L;
      if (isObj(req.body?.lesson)) { const r = normalizeLesson(req.body.lesson, { appVersion }); if (!r.lesson) return fail(res, 400, r.errors.join(' ')); L = r.lesson; }
      res.json(store.create(L));
    } catch (e) { fail(res, 400, e.message); }
  });
  api.put('/lessons/:id', (req, res) => {
    if (!isObj(req.body) || req.body.id !== req.params.id) return fail(res, 400, 'Ungültige Lektion');
    try { res.json({ lesson: store.save(req.body), presenting: presentingId() === req.params.id }); } catch (e) { fail(res, 400, e.message); }
  });
  api.post('/lessons/:id/duplicate', (req, res) => { const L = store.duplicate(req.params.id); return L ? res.json(L) : fail(res, 404, 'Lektion nicht gefunden'); });
  api.delete('/lessons/:id', (req, res) => {
    if (presentingId() === req.params.id) return fail(res, 409, 'Diese Lektion wird gerade präsentiert.');
    return store.remove(req.params.id) ? res.json({ ok: true }) : fail(res, 404, 'Lektion nicht gefunden');
  });
  api.get('/lessons/:id/export', (req, res) => { const L = store.get(req.params.id); return L ? download(res, `${slug(L.title)}.plenum`, L) : fail(res, 404, 'Lektion nicht gefunden'); });
  // Auswertungen für den PDF-Export: gespeicherter Stand oder (_live) die laufende Präsentation dieser Lektion
  api.get('/lessons/:id/results/:stateId', (req, res) => {
    const { id, stateId } = req.params, L = store.get(id);
    if (!L || !/^[\w-]{1,40}$/.test(stateId)) return fail(res, 404, 'Lektion oder Stand nicht gefunden');
    if (stateId === '_live') {
      if (presentingId() !== id) return fail(res, 404, 'Diese Lektion wird gerade nicht präsentiert.');
      const st = rooms.hostState();
      return res.json({ aggs: st.aggs, online: st.online, changed: st.changed || [], name: st.slot ? st.slot.name : 'Aktuelle Präsentation', savedAt: new Date().toISOString(), live: true });
    }
    const d = store.loadState(id, stateId);
    return d ? res.json(stateAggs(L, d, { extraWords: store.settings.extraWords || [] })) : fail(res, 404, 'Stand nicht gefunden');
  });
  api.get('/backup', (req, res) => download(res, `plenum-sicherung-${new Date().toISOString().slice(0, 10)}.json`, { format: 'plenum-sicherung', version: 1, createdAt: new Date().toISOString(), lessons: store.list().map((m) => store.get(m.id)).filter(Boolean) }));
  api.post('/import/parse', (req, res) => {
    const base = req.body?.baseLessonId ? store.get(String(req.body.baseLessonId)) : null; // Überarbeiten: Bilder der Lektion behalten
    res.json(parseImport(String(req.body?.text || '').slice(0, 80e6), { appVersion, media: base && base.media ? base.media : null }));
  });
  api.post('/import/commit', (req, res) => {
    const list = Array.isArray(req.body?.lessons) ? req.body.lessons : [req.body?.lesson];
    const mode = req.body?.mode;
    try {
      const saved = list.map((raw) => {
        const r = normalizeLesson(raw, { appVersion });
        if (!r.lesson) throw new Error(r.errors.join(' '));
        let L = r.lesson;
        if (mode === 'replace' && presentingId() === L.id) throw new Error('Diese Lektion wird gerade präsentiert.');
        if (mode === 'copy' || (mode !== 'replace' && store.has(L.id))) L = withNewIds(L);
        return store.save(L);
      });
      res.json(saved.length === 1 ? saved[0] : saved);
    } catch (e) { fail(res, 400, e.message); }
  });
  api.get('/states/:lessonId', (req, res) => res.json(store.statesOf(req.params.lessonId)));
  // Stand löschen (':stateId' = '_all' löscht alle Stände der Lektion)
  api.delete('/states/:lessonId/:stateId', (req, res) => {
    const { lessonId, stateId } = req.params;
    if (!/^[\w-]{1,80}$/.test(lessonId) || !/^[\w-]{1,40}$/.test(stateId)) return fail(res, 400, 'Ungültige Angabe');
    if (presentingId() === lessonId) return fail(res, 409, 'Diese Lektion wird gerade präsentiert. Stände lassen sich dort über „Speichern“ löschen.');
    const ids = stateId === '_all' ? store.statesOf(lessonId).map((x) => x.id) : [stateId];
    ids.forEach((id) => store.deleteState(lessonId, id));
    res.json(store.statesOf(lessonId));
  });
  api.get('/qr', async (req, res) => {
    const u = String(req.query.u || '');
    if (!/^https?:\/\/[\w.:-]{3,60}\/?$/.test(u)) return fail(res, 400, 'Ungültige Adresse');
    res.type('image/svg+xml').send(await QRCode.toString(u, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } }));
  });
  api.post('/lessonsDir', (req, res) => {
    const dir = String(req.body?.dir || '');
    if (!path.isAbsolute(dir)) return fail(res, 400, 'Ungültiger Ordner');
    try { store.setLessonsDir(dir); res.json({ lessonsDir: store.lessonsDir }); } catch (e) { fail(res, 400, e.message); }
  });
  api.get('/settings', (req, res) => res.json(store.settings));
  // Ende des lokalen Fehlerprotokolls (für „Fehlerbericht kopieren“ in der Hilfe)
  api.get('/log', (req, res) => {
    let text = '';
    try { const f = path.join(dataDir, 'logs', 'plenum.log'); const st = fs.statSync(f); const fd = fs.openSync(f, 'r'); const n = Math.min(st.size, 24000); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); text = b.toString('utf8'); } catch { /* noch kein Protokoll */ }
    res.json({ text, version: appVersion, os: `${os.type()} ${os.release()}`, store: isStore });
  });
  api.put('/settings', (req, res) => {
    const b = req.body || {}, patch = {};
    if (typeof b.adapter === 'string') patch.adapter = b.adapter.slice(0, 60);
    if (Array.isArray(b.extraWords)) patch.extraWords = b.extraWords.map((w) => String(w).trim().slice(0, 30)).filter(Boolean).slice(0, 200);
    if (typeof b.seenWelcome === 'boolean') patch.seenWelcome = b.seenWelcome;
    res.json(store.setSettings(patch));
  });
  app.use('/api/host', api);

  // ---------- Live-Verbindung ----------
  io.on('connection', (socket) => {
    const hs = socket.handshake;
    const isHost = authed(hs.headers, hs.address);
    const on = (ev, fn) => socket.on(ev, (...args) => {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      try { const r = fn(...args); if (cb) cb(r === undefined ? { ok: true } : r); } catch (e) { log.error?.(`Fehler bei ${ev}:`, e); if (cb) cb({ ok: false, error: 'Interner Fehler' }); }
    });
    if (isHost) {
      socket.join('h');
      on('host:state', () => rooms.hostState());
      on('host:present', (d) => rooms.present(d?.lessonId, d?.stateId));
      on('host:stop', () => rooms.stop());
      on('host:slide', (sid) => rooms.setSlide(sid));
      on('host:sync', (v) => rooms.setSync(v));
      on('host:reset', (sid) => rooms.reset(sid));
      on('host:quiz', (d) => rooms.quiz(d?.slideId, d?.action));
      on('host:moderate', (d) => rooms.moderate(d?.slideId, d?.action, d?.key));
      on('host:freeNicks', (v) => rooms.setFreeNicks(v));
      on('host:nick', (d) => rooms.setNick(d?.cid, d?.name ?? null, true));
      on('host:clearRanking', () => rooms.clearRanking());
      on('host:states', () => rooms.listStates());
      on('host:saveAs', (name) => rooms.saveAs(name));
      on('host:loadState', (id) => rooms.loadState(id));
      on('host:deleteState', (id) => rooms.deleteState(id));
      on('host:clearRoom', () => rooms.clearRoom());
      on('host:applyLesson', (id) => { const L = store.get(id); return L ? rooms.applyLesson(L) : { ok: false }; });
    }
    on('join', (d) => rooms.join(socket, d));
    on('goto', (sid) => rooms.goto(socket, sid));
    on('submit', (d) => rooms.submit(socket, d?.slideId, d?.data));
    on('nick', (name) => rooms.setNick(socket.data.cid, name, false));
    on('away', (v) => rooms.setAway(socket, v));
    socket.on('disconnect', () => rooms.left());
  });

  // Port suchen (belegt oder von Windows reserviert → nächster), innerhalb des Firewall-Bereichs
  await new Promise((resolve, reject) => {
    const attempt = (p, left) => {
      port = p;
      const onErr = (e) => { server.off('listening', onOk); if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && left > 1) attempt(p + 1, left - 1); else reject(e); };
      const onOk = () => { server.off('error', onErr); resolve(); };
      server.once('error', onErr);
      server.once('listening', onOk);
      server.listen(p, host);
    };
    attempt(firstPort, tries);
  });

  return { server, io, store, rooms, get port() { return port; }, flush: () => rooms.flush(), close: () => { rooms.flush(); io.close(); server.close(); } };
}

// Direktstart zum Entwickeln/Testen: node server/index.js
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const base = path.join(os.tmpdir(), 'plenum-dev');
  const token = process.env.PLENUM_TOKEN || 'dev';
  startServer({ token, lessonsDir: path.join(base, 'lektionen'), dataDir: path.join(base, 'daten'), appVersion: 'dev' })
    .then((s) => console.log(`Plenum-Server auf Port ${s.port} (Token „${token}“)`));
}
