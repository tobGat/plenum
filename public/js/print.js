// Druckseite für den PDF-Export (nur Lehrkraft): zeichnet jede Folie in einem eigenen iframe mit der Editor-Vorschau,
// weil Layout, Designs und fit() genau eine Folie pro Dokument erwarten. Electron druckt die Seite dann mit printToPDF.
// Parameter: lesson, variant (blank|solution|results), state, format (slides|handout), notes=1, light=1
import { api } from './core/api.js';
import { TYPES } from '/shared/types/index.js';
import { scaleBefore } from '/shared/types/live.js';

const q = new URLSearchParams(location.search);
const O = {
  lesson: q.get('lesson') || '',
  variant: ['solution', 'results'].includes(q.get('variant')) ? q.get('variant') : 'blank',
  state: q.get('state') || '',
  format: q.get('format') === 'handout' ? 'handout' : 'slides',
  notes: q.get('notes') === '1',
  light: q.get('light') === '1',
};
// Themenserie statt Lektion: die Matrix als eine Seite (Größe folgt dem Inhalt) – für PDF und Bild
const SERIES = q.get('series') || '';
// Planung: die Themen der Serie als Tabelle (A4 quer) – Reihenfolge entlang der Pfeile, mit Inhalten, Umfang und Platz für Datum und Notizen
async function planMain() {
  if (!/^[\w-]{1,80}$/.test(SERIES)) throw new Error('Themenserie fehlt.');
  const [{ orderedCards }, { COLORS }, S, list] = await Promise.all([import('/shared/series.js'), import('/shared/palette.js'), api(`/series/${SERIES}`), api('/lessons')]);
  const meta = Object.fromEntries(list.map((l) => [l.id, l]));
  const cards = orderedCards(S), num = Object.fromEntries(cards.map((c, i) => [c.id, i + 1]));
  const full = {};
  await Promise.all(cards.filter((c) => c.lesson && meta[c.lesson]).map(async (c) => { try { full[c.lesson] = await api(`/lessons/${c.lesson}`); } catch { /* fehlt */ } }));
  page.textContent = '@page{size:A4 landscape;margin:12mm 12mm 14mm;@bottom-right{content:counter(page) " / " counter(pages);font:9pt Inter,system-ui,sans-serif;color:#6b7280}@bottom-left{content:"Plenum · Themenserie";font:9pt Inter,system-ui,sans-serif;color:#9ca3af}}';
  document.body.classList.remove('f-slides'); document.body.classList.add('f-plan');
  document.title = `${S.title} – Planung`;
  const nLessons = cards.filter((c) => c.lesson && full[c.lesson]).length, nSlides = Object.values(full).reduce((n, L) => n + L.slides.length, 0);
  const head = el('div', 'phead'), left = el('div');
  left.append(el('div', 'pkick', 'Themenserie · Planung'), el('h1', '', S.title));
  if (S.description) left.append(el('p', 'pdesc', S.description));
  const right = el('div', 'pmeta');
  [[S.subject, 'Fach'], [S.grade, 'Schulstufe'], [`${cards.length} ${cards.length === 1 ? 'Thema' : 'Themen'}${nLessons ? `, davon ${nLessons} mit Präsentation` : ''}`, 'Umfang'], [nSlides ? `${nSlides} Folien` : '', 'Folien'], [new Date().toLocaleDateString('de-AT'), 'Stand']]
    .filter(([v]) => v).forEach(([v, l]) => { const r = el('div'); r.append(el('span', '', l), el('b', '', v)); right.append(r); });
  head.append(left, right);
  const table = el('table', 'ptable'), thead = el('thead'), hr = el('tr'), tbody = el('tbody');
  [['Nr.', 'c-nr'], ['Thema', 'c-topic'], ['Inhalte', 'c-content'], ['Umfang', 'c-size'], ['Baut auf', 'c-pre'], ['Datum', 'c-date'], ['Notizen', 'c-note']].forEach(([t, c]) => hr.append(el('th', c, t)));
  thead.append(hr); table.append(thead, tbody);
  // Zählung der Mitmach-Folien je Typ, z. B. „2 × Umfrage, 1 × Quiz“
  const interactive = (L) => { const n = {}; L.slides.forEach((s) => { const d = TYPES[s.type]; if (d && !d.passive) n[d.label] = (n[d.label] || 0) + 1; }); return Object.entries(n).map(([k, v]) => `${v} × ${k}`).join(', '); };
  cards.forEach((c, i) => {
    const L = c.lesson ? full[c.lesson] : null, m = c.lesson ? meta[c.lesson] : null, tr = el('tr', c.lesson ? (L ? '' : 'gone') : 'free');
    const col = COLORS[(m && m.card && m.card.color) || c.color || (c.lesson ? 'indigo' : 'slate')] || COLORS.indigo;
    const nr = el('td', 'c-nr'); const badge = el('span', 'pnr', String(i + 1)); badge.style.background = col.c; nr.append(badge);
    const topic = el('td', 'c-topic'); topic.append(el('b', '', L ? L.title : c.title));
    const sub = L ? [L.subject !== S.subject ? L.subject : '', L.grade !== S.grade ? L.grade : ''].filter(Boolean).join(' · ') : c.lesson ? 'Lektion nicht mehr vorhanden' : 'Platzhalter – noch ohne Präsentation';
    if (sub) topic.append(el('small', '', sub));
    const content = el('td', 'c-content');
    if (L) {
      if (L.description) content.append(el('p', '', L.description));
      const secs = L.sections.filter((x) => L.slides.some((s) => s.section === x.id)).map((x) => x.name);
      if (secs.length > 1 || (secs.length === 1 && !L.description)) { const ul = el('ul'); secs.forEach((x) => ul.append(el('li', '', x))); content.append(ul); }
    } else if (c.note) content.append(el('p', '', c.note));
    const size = el('td', 'c-size');
    if (L) { size.append(el('b', '', `${L.slides.length} ${L.slides.length === 1 ? 'Folie' : 'Folien'}`)); const it = interactive(L); if (it) size.append(el('small', '', it)); }
    const pre = el('td', 'c-pre'), before = S.links.filter((l) => l.to === c.id).map((l) => num[l.from]).filter(Boolean).sort((a, b) => a - b);
    pre.textContent = before.length ? before.map((n) => `Nr. ${n}`).join(', ') : '–';
    tr.append(nr, topic, content, size, pre, el('td', 'c-date'), el('td', 'c-note'));
    tbody.append(tr);
  });
  pages.append(head, table);
  if (!cards.length) pages.append(el('p', 'pempty', 'Diese Themenserie hat noch keine Karten.'));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return { ok: true, slides: cards.length, over: [], title: S.title };
}
async function seriesMain() {
  if (!/^[\w-]{1,80}$/.test(SERIES)) throw new Error('Themenserie fehlt.');
  const [{ staticMap }, S, lessons] = await Promise.all([import('./editor/seriesmap.js'), api(`/series/${SERIES}`), api('/lessons')]);
  const map = staticMap(S, Object.fromEntries(lessons.map((l) => [l.id, l])));
  const box = el('div', 'sprint');
  box.append(el('h1', '', S.title), el('div', 'sp-sub', [S.subject, S.grade, `${S.cards.length} ${S.cards.length === 1 ? 'Karte' : 'Karten'}`, new Date().toLocaleDateString('de-AT')].filter(Boolean).join(' · ')));
  const holder = el('div'); holder.innerHTML = String(map.html); box.append(holder);
  pages.append(box);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const r = box.getBoundingClientRect(), w = Math.ceil(r.width), h = Math.ceil(r.height);
  page.textContent = `@page{size:${w}px ${h}px;margin:0}`;
  document.title = S.title;
  return { ok: true, slides: S.cards.length, over: [], title: S.title, width: w, height: h };
}

const VARIANT = { blank: '', solution: 'mit Lösungen', results: 'mit Ergebnissen' };
const pages = document.getElementById('pages');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// Seitenformat: @page lässt sich nicht per Klasse umschalten, deshalb als eigene Regel
const page = document.createElement('style');
page.textContent = O.format === 'handout'
  ? '@page{size:A4 portrait;margin:12mm 12mm 14mm;@bottom-center{content:counter(page) " / " counter(pages);font:9pt Inter,system-ui,sans-serif;color:#6b7280}}'
  : '@page{size:1280px 720px;margin:0}';
document.head.appendChild(page);
document.body.classList.add(`f-${O.format}`);

// Eine Folie zeichnen: iframe laden, Daten schicken, auf „fertig“ warten
function drawSlide(frame, msg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { removeEventListener('message', onMsg); reject(new Error(`Folie „${msg.title}“ wurde nicht fertig gezeichnet.`)); }, 30000);
    function onMsg(e) {
      if (e.origin !== location.origin || e.source !== frame.contentWindow || !e.data) return;
      if (e.data.type === 'preview-ready') frame.contentWindow.postMessage(msg.data, location.origin);
      else if (e.data.type === 'printed') { clearTimeout(timer); removeEventListener('message', onMsg); resolve(e.data); }
    }
    addEventListener('message', onMsg);
    frame.src = '/preview?print=1';
  });
}

async function main() {
  if (!/^[\w-]{1,80}$/.test(O.lesson)) throw new Error('Lektion fehlt.');
  const L = await api(`/lessons/${O.lesson}`);
  const R = O.variant === 'results' ? await api(`/lessons/${O.lesson}/results/${encodeURIComponent(O.state || '_auto')}`) : null;
  const lean = { ...L, media: undefined }; // eigene Bilder lädt die Vorschau im Druck über /media/…
  // Rangliste nur mit echten Punkten (laufende Präsentation) – Spitznamen stehen in keinem gespeicherten Stand
  const slides = L.slides.filter((s) => s.type !== 'leaderboard' || (R && R.aggs[s.id] && (R.aggs[s.id].ranking || []).length));
  document.title = `${L.title}${VARIANT[O.variant] ? ` – ${VARIANT[O.variant]}` : ''}`;

  const jobs = [];
  if (O.format === 'handout') {
    const head = el('div', 'hhead'), left = el('div');
    left.append(el('h1', '', L.title), el('div', 'hsub', [L.subject, L.grade, VARIANT[O.variant]].filter(Boolean).join(' · ')));
    head.append(left, el('div', 'hmeta', R ? `${R.name || 'Stand'} · ${new Date(R.savedAt || Date.now()).toLocaleDateString('de-AT')}` : new Date().toLocaleDateString('de-AT')));
    pages.append(head);
  }
  for (const s of slides) {
    const frame = el('iframe'); frame.setAttribute('title', s.title); frame.setAttribute('scrolling', 'no');
    if (O.format === 'handout') {
      const row = el('div', 'hrow'), thumb = el('div', 'thumb'), side = el('div', 'hside');
      thumb.append(frame);
      side.append(el('div', 'hnum', `${L.slides.indexOf(s) + 1} · ${TYPES[s.type] ? TYPES[s.type].label : s.type}`), el('div', 'htitle', s.title));
      if (O.notes && s.notes) { const n = el('div', 'hnotes'); n.append(el('b', '', 'Notizen'), document.createTextNode(s.notes)); side.append(n); }
      side.append(el('div', 'hlines'));
      row.append(thumb, side); pages.append(row);
    } else { const pg = el('div', 'pg'); pg.append(frame); pages.append(pg); }
    const agg = R && !(R.changed || []).includes(s.id) ? R.aggs[s.id] ?? null : null;
    // Skala: Auswertung der früheren Folie mit denselben Aussagen für den Vorher/Nachher-Vergleich
    const sb = R && s.type === 'scale' ? scaleBefore(L, s) : null, before = sb && R.aggs[sb.slideId] && !(R.changed || []).includes(sb.slideId) ? { [sb.slideId]: R.aggs[sb.slideId] } : null;
    jobs.push({ frame, title: s.title, data: { type: 'render', lesson: lean, slideId: s.id, mode: 'host', demo: false, joinUrl: '',
      print: { variant: O.variant, agg, before, online: R ? R.online || 0 : 0, date: R ? R.savedAt || null : null, theme: O.light ? 'clean' : null } } });
  }
  // höchstens vier Folien gleichzeitig im Aufbau
  let next = 0; const over = [];
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) { const j = jobs[next++]; const r = await drawSlide(j.frame, j); if (r.over > 2) over.push(j.title); }
  }));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return { ok: true, slides: slides.length, over, title: L.title };
}

window.printReady = (SERIES ? (q.get('plan') === '1' ? planMain() : seriesMain()) : main()).catch((e) => {
  pages.innerHTML = ''; pages.append(el('div', 'perr', `Das PDF konnte nicht vorbereitet werden: ${e.message || e}`));
  return { ok: false, error: String(e.message || e) };
});
