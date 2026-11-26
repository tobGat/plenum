// Schülerseite: verbindet sich ohne Code mit der laufenden Präsentation, zeigt nur die aktuelle Folie
import { io } from '/socket.io/socket.io.esm.min.js';
import { html, raw, delegate, toast } from './core/dom.js';
import { ic, logo } from './core/icons.js';
import { fit, autoFit } from './core/fit.js';
import { overlay, closeOv, initOverlay, prompt } from './core/overlay.js';
import { shead, colorOf, animWidths, resetSegs, applyTheme, themeCols, withGraphic, lookUp } from './core/parts.js';
import { CH, chartReset } from './charts.js';
import { RENDER } from './types/index.js';

const PROTO = 1;
function cid() {
  let c;
  try { c = localStorage.getItem('plenum_cid'); if (!c) { const a = new Uint8Array(12); crypto.getRandomValues(a); c = 'c' + Array.from(a, (b) => (b % 36).toString(36)).join(''); localStorage.setItem('plenum_cid', c); } }
  catch { c = window._cid || (window._cid = 'c' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36)); }
  return c;
}

const root = document.getElementById('root');
root.innerHTML = String(html`<div id="app" class="student"><header id="hd"><div class="brand">${raw(logo())}<span class="chap" id="hchap">Plenum</span></div><div class="secpill" id="hsec"></div><div class="hspace"></div><div id="hroom"></div><div id="hnum"></div></header>
  <div id="prog"><div id="pbar"></div></div><main id="content" tabindex="-1"></main>
  <nav id="nav" hidden><button class="nb" id="prev" data-action="prev">${ic('arrowl')}<span>Zurück</span></button><span class="navinfo" id="navinfo"></span><button class="nb" id="next" data-action="next"><span>Weiter</span>${ic('arrow')}</button></nav></div>`);
const $ = (id) => document.getElementById(id), content = $('content');
initOverlay();
autoFit(content);

const socket = io({ transports: ['websocket', 'polling'] });
let P = null, outline = [], nick = '', freeNicks = false, joined = false, lastId = null, hostIndex = 0, waitTimer = null;
const local = {};
const loader = raw('<div class="loader"><i></i><i></i><i></i><i></i></div>');

function waiting(title, text) { overlay(html`${loader}<h2>${title}</h2><p class="ov-sub">${text}</p>`, { closable: false }); }

function join() {
  clearTimeout(waitTimer);
  socket.emit('join', { cid: cid(), proto: PROTO }, (r) => {
    r = r || {};
    if (r.reload) { location.reload(); return; }
    if (!r.ok) {
      joined = false;
      if (r.full) return waiting('Die Klasse ist voll', 'Es sind bereits sehr viele Geräte verbunden.');
      waiting('Gleich geht es los', 'Die Präsentation ist noch nicht gestartet. Diese Seite verbindet sich automatisch, sobald es losgeht.');
      waitTimer = setTimeout(join, 4000);
      return;
    }
    joined = true; outline = r.outline || []; nick = r.nick || ''; freeNicks = !!r.freeNicks;
    $('hchap').textContent = r.title || 'Plenum';
    closeOv();
    show(r.slide);
    awaySent = false; checkAway();
  });
}

// Anwesenheit: meldet anonym, ob diese Seite gerade im Vordergrund ist – die Lehrkraft sieht nur die Anzahl.
// Kurzes Wegschalten (unter 2 s) zählt nicht. Die Testansicht am Computer der Lehrkraft meldet nichts.
const PRESENCE = !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) || /[?&]presence=1/.test(location.search);
let awaySent = false, awayTimer = null;
const isAway = () => document.hidden || !document.hasFocus();
function sendAway(v) { if (!PRESENCE || !joined || v === awaySent) return; awaySent = v; socket.emit('away', v); }
function checkAway() {
  clearTimeout(awayTimer);
  if (!isAway()) sendAway(false);
  else awayTimer = setTimeout(() => { if (isAway()) sendAway(true); }, 2000);
}
document.addEventListener('visibilitychange', checkAway);
['blur', 'focus', 'pageshow'].forEach((ev) => window.addEventListener(ev, checkAway));

function show(p) {
  if (!p) return;
  const prevSame = P && P.id === p.id;
  P = p; hostIndex = p.hostIndex;
  const L = local[p.id] || (local[p.id] = {});
  // Lehrkraft hat zurückgesetzt oder das Quiz neu gestartet → eigene Eingaben verwerfen
  if (prevSame && ((p.data.mine == null && L._sub) || (p.type === 'quiz' && (p.data.phase === 'ready' || p.data.phase === 'idle')))) for (const k in L) delete L[k];
  render(p.id !== lastId);
}

function render(fresh) {
  const p = P, R = RENDER[p.type], col = applyTheme($('app'), p.theme, colorOf(p.section.color));
  $('hsec').innerHTML = String(html`${ic(p.section.icon)}<span>${p.section.name}</span>`);
  $('hnum').innerHTML = `<b>${p.index + 1}</b> / ${p.total}`;
  $('pbar').style.width = `${((p.index + 1) / p.total) * 100}%`;
  renderRoom();
  const nav = $('nav'); nav.hidden = p.sync;
  if (!p.sync) { $('prev').disabled = p.index === 0; $('next').disabled = p.index >= outline.length - 1; $('navinfo').textContent = outline[p.index] ? outline[p.index].title : ''; }
  if (fresh) { chartReset(p.id); resetSegs(`${p.id}|`); }
  CH.ctx = p.id; CH.seq = 0;
  const sec = { ...col, name: p.section.name, icon: p.section.icon };
  let body;
  try { body = p.hidden ? lookUp() : R.student ? R.student(p.data, ctx()) : html`<div class="card">${p.data.title}</div>`; } catch (e) { console.error(e); body = html`<div class="warn">${ic('alert')}<span>Diese Folie konnte nicht angezeigt werden.</span></div>`; }
  content.classList.toggle('enter', !!fresh);
  content.innerHTML = String(withGraphic(p.type === 'title' || p.hidden ? '' : shead(p.data.title, sec), body, p.type === 'title' ? null : p.graphic));
  if (fresh) { lastId = p.id; content.scrollTop = 0; }
  fit(content);
  animWidths(content);
}
function renderRoom() {
  const showNick = outline.some((o) => o.type === 'quiz' || o.type === 'leaderboard');
  $('hroom').innerHTML = String(html`<span class="livebadge"><span class="pulse"></span>Verbunden</span>
    ${showNick && nick ? html`<button class="hbtn nickbtn" ${freeNicks ? '' : 'disabled'} data-action="nick" title="${freeNicks ? 'Spitznamen ändern' : 'Dein Spitzname im Quiz'}">${ic('user')}<span>${nick}</span></button>` : ''}
    ${P && !P.sync && P.index !== hostIndex ? html`<button class="hbtn" data-action="toHost">${ic('arrow')}<span>Zur Folie vorne</span></button>` : ''}`);
}

function ctx() {
  const p = P;
  return { p, sec: { ...themeCols(colorOf(p.section.color), p.theme), name: p.section.name, icon: p.section.icon }, local: local[p.id], key: 'c', next: outline[p.index + 1],
    render: () => { content.classList.remove('enter'); render(false); },
    submit: (data) => new Promise((resolve) => {
      local[p.id]._sub = true;
      socket.timeout(5000).emit('submit', { slideId: p.id, data }, (err, r) => {
        if (err || !r || !r.ok) toast(err ? 'Keine Verbindung – bitte nochmal versuchen.' : 'Das hat nicht geklappt. Ist die Frage noch offen?', 'err');
        resolve(err ? { ok: false } : r);
      });
    }) };
}

const actions = {
  prev: () => { const o = outline[P.index - 1]; if (o) socket.emit('goto', o.id); },
  next: () => { const o = outline[P.index + 1]; if (o) socket.emit('goto', o.id); },
  toHost: () => { const o = outline[hostIndex]; if (o) socket.emit('goto', o.id); },
  nick: async () => {
    const n = await prompt('Spitznamen ändern', 'Erscheint in der Rangliste. Bitte keinen echten vollen Namen verwenden.', nick, { max: 16, ok: 'Übernehmen' });
    if (n) socket.emit('nick', n, (r) => { if (r && r.ok) { nick = r.nick; renderRoom(); } else toast(r?.error || 'Nicht möglich', 'err'); });
  },
};
const typeAct = (kind) => (el, e) => { const fn = (RENDER[P.type][`studentActions`] || {})[el.dataset[kind].slice(2)]; if (fn) fn(el, ctx(), e); };
const handlers = new Proxy(actions, { get: (t, k) => (String(k).startsWith('t:') ? typeAct('action') : t[k]) });
delegate(document.body, 'click', handlers);
delegate(document.body, 'submit', handlers);
delegate(document.body, 'change', new Proxy({}, { get: (t, k) => (String(k).startsWith('t:') ? typeAct('change') : undefined) }), 'change');
setInterval(() => document.querySelectorAll('[data-countdown]').forEach((el) => { const ms = Math.max(0, +el.dataset.countdown - Date.now()); const b = el.querySelector('b'); if (b) b.textContent = Math.ceil(ms / 1000); }), 250);

socket.on('connect', join);
socket.on('start', join);
socket.on('slide', show);
socket.on('lesson', (d) => { outline = d.outline || outline; $('hchap').textContent = d.title || 'Plenum'; });
socket.on('hostSlide', (i) => { hostIndex = i; renderRoom(); });
socket.on('nick', (n) => { nick = n; renderRoom(); });
socket.on('nickRules', (d) => { freeNicks = !!d.freeNicks; renderRoom(); });
socket.on('stopped', () => { joined = false; waiting('Die Präsentation ist beendet', 'Sobald die Lehrkraft wieder startet, verbindet sich diese Seite automatisch.'); });
socket.on('disconnect', () => { if (joined) waiting('Verbindung unterbrochen', 'Die Seite verbindet sich automatisch wieder, sobald die Präsentation erreichbar ist.'); });
