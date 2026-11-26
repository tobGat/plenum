// Editor-Vorschau (im iframe /preview): zeichnet eine Folie wie am Beamer oder am Handy.
// Mit „Beispielantworten“ entstehen Auswertungen über dieselben accept/aggregate-Funktionen wie am Server.
import { html, raw, delegate } from '../core/dom.js';
import { ic, logo } from '../core/icons.js';
import { fit } from '../core/fit.js';
import { initOverlay } from '../core/overlay.js';
import { shead, colorOf, animWidths, resetSegs, resetRings, applyTheme, withGraphic, lookUp } from '../core/parts.js';
import { CH, chartReset } from '../charts.js';
import { RENDER } from '../types/index.js';
import { TYPES } from '/shared/types/index.js';
import { hash } from '/shared/util.js';
const hnum = (s) => parseInt(hash(s), 36) >>> 0; // hash() liefert Base-36-Text

const root = document.getElementById('root');
initOverlay();
let M = null; // { lesson, slideId, mode: 'host'|'student', demo, joinUrl }
// Eigene Bilder kommen nur bei Änderungen mit (media + mediaRev), damit das Tippen schnell bleibt
let MEDIA = {}, mediaRev = -1;
const URLS = {};
// Druck (PDF-Export, /preview?print=1): ohne Animationen und Bedienelemente; eigene Bilder kommen direkt vom Server
const PRINT = /[?&]print=1/.test(location.search);
if (PRINT) document.body.classList.add('print');
const mediaUrl = (id) => { if (PRINT) return M && M.lesson ? `/media/${M.lesson.id}/${id}` : ''; const m = MEDIA[id]; if (!m) return ''; const k = `${id}|${m.data.length}`; return URLS[k] || (URLS[k] = `data:${m.mime};base64,${m.data}`); };
let shownKey = '', content = null, frameMode = '';
const prefs = {}, local = {};
const N = 14;
const NICKS = ['Fuchs 12', 'Eule 7', 'Luchs 31', 'Wal 44', 'Falke 9', 'Igel 23', 'Otter 5', 'Biber 18', 'Dachs 40', 'Robbe 2'];
const WORDS = ['spannend', 'Zahlen', 'Team', 'neu', 'schwierig', 'Ideen', 'Spaß', 'Fragen', 'wichtig', 'Zahlen', 'spannend', 'Zukunft'];
const TEXTS = ['Ich finde das sehr interessant.', 'Mehr Beispiele aus dem Alltag wären gut.', 'Das war mir neu!', 'Können wir das in Gruppen ausprobieren?', 'Mich überrascht das Ergebnis.', 'Ich bin noch unsicher bei der Auswertung.'];

// kleiner deterministischer Zufall: Vorschau springt beim Tippen nicht
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const flatSort = (s) => s.categories.flatMap((c, ci) => c.items.map(() => ci));

function demo(s) {
  const def = TYPES[s.type];
  if (!def.aggregate) return { agg: null, online: 0 };
  const R = rng(hnum(s.id + s.type)), subs = {}, now = Date.now();
  if (s.type === 'leaderboard') {
    const ranking = NICKS.map((nick, i) => ({ nick, total: Math.round(3900 - i * 330 - R() * 200) })).sort((a, b) => b.total - a.total).map((x, i) => ({ ...x, rank: i + 1 }));
    return { agg: def.aggregate(s, {}, { ranking }), online: N };
  }
  const qMeta = { phase: 'running', startedAt: now - 60000, endsAt: now + 60000 };
  for (let k = 0; k < N; k++) {
    const cid = 'd' + k, ctx = { cid, prev: undefined, group: k % 2 ? 'b' : 'a', meta: s.type === 'quiz' ? qMeta : {}, now, newId: () => `a${k}` };
    let d = null;
    const pickBiased = (n, good) => (good >= 0 && R() < 0.62 ? good : Math.floor(R() * n));
    switch (s.type) {
      case 'mc': d = { choice: pickBiased(s.options.length, s.options.findIndex((o) => o.correct)) }; break;
      case 'quiz': d = { choice: pickBiased(s.options.length, s.options.findIndex((o) => o.correct)) }; ctx.now = qMeta.startedAt + R() * s.time * 1000; break;
      case 'truefalse': d = { answers: s.items.map((it) => (R() < 0.72 ? it.correct : !it.correct)) }; break;
      case 'sort': { const cats = s.categories.length; d = { answers: flatSort(s).map((c) => (R() < 0.7 ? c : Math.floor(R() * cats))) }; break; }
      case 'task': if (R() < 0.7) d = { done: true }; break;
      case 'poll': {
        const n = s.options.length, w = s.options.map((_, i) => 1 + ((hnum(s.id + i) % 5)));
        const one = () => { let x = R() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < n; i++) { x -= w[i]; if (x <= 0) return i; } return n - 1; };
        d = { choices: s.multi ? [...new Set([one(), one(), one()].slice(0, 1 + Math.floor(R() * 3)))] : [one()] };
        break;
      }
      case 'scale': d = { values: s.statements.map((_, i) => Math.max(1, Math.min(s.steps, Math.round(s.steps * (0.35 + 0.1 * i) + (R() - 0.5) * s.steps * 0.7)))) }; break;
      case 'wordcloud': d = { words: [WORDS[Math.floor(R() * WORDS.length)], WORDS[Math.floor(R() * WORDS.length)]].slice(0, s.maxWords) }; break;
      case 'open': if (k < 6) d = { text: TEXTS[k] }; break;
      default: break;
    }
    if (!d || !def.accept) continue;
    const v = def.accept(s, d, ctx);
    if (v != null) subs[cid] = v;
  }
  const meta = s.type === 'quiz' ? { ...qMeta, phase: 'revealed' } : s.type === 'open' || s.type === 'wordcloud' ? { showAll: true } : {};
  return { agg: def.aggregate(s, subs, { meta, now, extraWords: [] }), online: N };
}

function studentPayload(s, i) {
  const L = M.lesson, sec = L.sections.find((x) => x.id === s.section) || L.sections[0], def = TYPES[s.type], now = Date.now();
  const ctx = { cid: 'preview', group: 'a', mine: undefined, now,
    meta: s.type === 'quiz' ? { phase: 'running', startedAt: now - 1000, endsAt: now + s.time * 1000 } : undefined,
    me: s.type === 'leaderboard' ? { rank: 3, total: 2480, nick: 'Fuchs 12', players: 24 } : undefined };
  const graphic = s.graphic ? { ...s.graphic, src: s.graphic.src.startsWith('media:') ? mediaUrl(s.graphic.src.slice(6)) : s.graphic.src } : null;
  return { id: s.id, type: s.type, index: i, total: L.slides.length, hostIndex: i, sync: true, section: { name: sec.name, color: sec.color, icon: sec.icon }, theme: L.theme || 'standard', graphic,
    data: def.toStudent ? def.toStudent(s, ctx) : { title: s.title } };
}

// Kontext für Schüler-Renderer; Abschicken wird lokal mit accept() geprüft (wie am Server)
function sctx(s, i, secCol) {
  const p = studentPayload(s, i);
  return { p, sec: secCol, local: local[s.id] || (local[s.id] = {}), key: 'c', next: M.lesson.slides[i + 1], render: () => render(),
    submit: async (data) => {
      const def = TYPES[s.type], now = Date.now();
      const v = def.accept ? def.accept(s, data, { cid: 'preview', group: 'a', meta: { phase: 'running', startedAt: now - 1000, endsAt: now + 9e5 }, now, newId: () => 'p' + now }) : null;
      return { ok: v != null, mine: s.type === 'open' && v ? v.map((a) => a.text) : s.type === 'poll' && v ? v.c : v };
    } };
}

function frame(mode) {
  if (frameMode === mode) return;
  frameMode = mode;
  document.body.classList.toggle('pv-phone', mode === 'student');
  root.innerHTML = String(html`<div id="app" class="${mode === 'student' ? 'student' : 'present'}"><header id="hd"><div class="brand">${raw(logo())}</div><div class="secpill" id="hsec"></div><div class="hspace"></div><div id="hnum"></div></header>
    <div id="prog"><div id="pbar"></div></div><main id="content" tabindex="-1"></main></div>`);
  content = document.getElementById('content');
  shownKey = '';
}

function current() {
  const L = M.lesson, i = Math.max(0, L.slides.findIndex((x) => x.id === M.slideId));
  return { s: L.slides[i], i };
}

function render() {
  if (!M || !M.lesson || !M.lesson.slides.length) return;
  frame(M.mode);
  const { s, i } = current(), L = M.lesson, R = RENDER[s.type];
  if (!R) return;
  const P = PRINT ? M.print || { variant: 'blank' } : null, theme = (P && P.theme) || L.theme;
  const sec = L.sections.find((x) => x.id === s.section) || L.sections[0], col = applyTheme(document.getElementById('app'), theme, colorOf(sec.color));
  const key = `${M.mode}|${s.id}|${M.demo}`, fresh = key !== shownKey;
  shownKey = key;
  document.getElementById('hsec').innerHTML = String(html`${ic(sec.icon)}<span>${sec.name}</span>`);
  document.getElementById('hnum').innerHTML = `<b>${i + 1}</b> / ${L.slides.length}`;
  document.getElementById('pbar').style.width = `${((i + 1) / L.slides.length) * 100}%`;
  if (fresh) { chartReset(s.id); resetSegs(`${s.id}|`); resetRings(`:${s.id}`); for (const k in local) delete local[k]; }
  CH.ctx = s.id; CH.seq = 0;
  const secCol = { ...col, name: sec.name, icon: sec.icon, color: sec.color };
  const snap = !fresh && R.snap ? R.snap(content) : null;
  let body;
  try {
    if (M.mode === 'student') {
      const c = sctx(s, i, secCol);
      const hidden = !!TYPES[s.type].passive && !L.studentSlides;
      body = hidden ? lookUp() : R.student ? R.student(c.p.data, c) : html`<div class="card">${s.title}</div>`;
      content.innerHTML = String(withGraphic(s.type === 'title' || hidden ? '' : shead(s.title, secCol), body, s.type === 'title' || hidden ? null : c.p.graphic));
    } else {
      const D = P ? { agg: P.agg || null, online: P.online || 0 } : M.demo ? demo(s) : { agg: null, online: 0 };
      const pr = prefs[s.id] || (prefs[s.id] = {});
      if (M.demo && ['mc', 'truefalse', 'sort'].includes(s.type) && pr.eval === undefined) pr.eval = true;
      if (!M.demo && fresh) pr.eval = false;
      const c = { lesson: L, sec: secCol, agg: D.agg, prefs: pr, local: local[s.id] || (local[s.id] = {}), key: 'c', online: D.online, joinUrl: M.joinUrl || '',
        next: L.slides[i + 1], render: () => render(), goto: () => {}, theme: theme || 'standard', mediaUrl };
      if (P) {
        // Druck: mit Ergebnissen die Auswertung, mit Lösungen die markierten Antworten, sonst nur die Fragen
        const has = !!D.agg && ((D.agg.n || 0) > 0 || (D.agg.students || 0) > 0 || (D.agg.ranking || []).length > 0);
        pr.eval = has && ['mc', 'truefalse', 'sort'].includes(s.type);
        Object.assign(c, { print: true, solution: P.variant !== 'blank', results: has, date: P.date || null });
        if (c.solution) c.local.gap = { all: true };
      }
      body = R.host(s, c);
      content.innerHTML = String(withGraphic(s.type === 'title' ? '' : shead(s.title, secCol), body, s.type === 'title' ? null : s.graphic, mediaUrl));
    }
  } catch (e) {
    console.error(e);
    content.innerHTML = String(html`<div class="wrap"><div class="warn">${ic('alert')}<span>Diese Folie kann noch nicht angezeigt werden – bitte die markierten Felder prüfen.</span></div></div>`);
  }
  content.classList.toggle('enter', fresh && !PRINT);
  if (R.flip && snap) R.flip(content, snap);
  fit(content);
  animWidths(content);
}

// Druck: warten, bis Schriften und Bilder da sind, dann noch einmal zeichnen (die Wortwolke misst Text) und „fertig“ melden
async function settle(slideId) {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch { /* ohne Schrift-API weiter */ }
  render();
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 8000); }))));
  await frame(); await frame();
  fit(content);
  await frame(); await frame(); // animWidths() setzt die Balkenbreiten im nächsten Frame
  window.parent.postMessage({ type: 'printed', slideId, over: content ? content.scrollHeight - content.clientHeight : 0 }, location.origin);
}

// Bedienelemente der Folie funktionieren auch in der Vorschau (z. B. Diagrammart, Lücken aufdecken, Labor)
const typeAct = (kind) => (el) => {
  if (!M) return;
  const { s, i } = current(), R = RENDER[s.type], name = (el.dataset[kind === 'change' ? 'change' : 'action'] || '').slice(2);
  const L = M.lesson, sec = L.sections.find((x) => x.id === s.section) || L.sections[0], secCol = { ...colorOf(sec.color), name: sec.name, icon: sec.icon };
  const loc = local[s.id] || (local[s.id] = {});
  if (M.mode === 'student') {
    const f = R.studentActions && R.studentActions[name];
    if (f) f(el, sctx(s, i, secCol));
  } else {
    const f = R.hostActions && R.hostActions[name];
    if (f) f(el, { lesson: L, sec: secCol, agg: M.demo ? demo(s).agg : null, prefs: prefs[s.id] || (prefs[s.id] = {}), local: loc, key: 'c', online: M.demo ? N : 0, render: () => render(), goto: () => {} });
  }
};
const proxy = (kind) => new Proxy({}, { get: (t, k) => (String(k).startsWith('t:') ? typeAct(kind) : undefined) });
delegate(document.body, 'click', proxy('click'));
delegate(document.body, 'submit', proxy('click'));
delegate(document.body, 'change', proxy('change'), 'change');

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'render') return;
  if (e.data.media && e.data.mediaRev !== mediaRev) { MEDIA = e.data.media; mediaRev = e.data.mediaRev; }
  M = e.data;
  render();
  if (PRINT) settle(M.slideId);
});
window.addEventListener('resize', () => { if (content) fit(content); });
window.parent.postMessage({ type: 'preview-ready' }, location.origin);
