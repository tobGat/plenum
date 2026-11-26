// Druckseite für den PDF-Export (nur Lehrkraft): zeichnet jede Folie in einem eigenen iframe mit der Editor-Vorschau,
// weil Layout, Designs und fit() genau eine Folie pro Dokument erwarten. Electron druckt die Seite dann mit printToPDF.
// Parameter: lesson, variant (blank|solution|results), state, format (slides|handout), notes=1, light=1
import { api } from './core/api.js';
import { TYPES } from '/shared/types/index.js';

const q = new URLSearchParams(location.search);
const O = {
  lesson: q.get('lesson') || '',
  variant: ['solution', 'results'].includes(q.get('variant')) ? q.get('variant') : 'blank',
  state: q.get('state') || '',
  format: q.get('format') === 'handout' ? 'handout' : 'slides',
  notes: q.get('notes') === '1',
  light: q.get('light') === '1',
};
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
    jobs.push({ frame, title: s.title, data: { type: 'render', lesson: lean, slideId: s.id, mode: 'host', demo: false, joinUrl: '',
      print: { variant: O.variant, agg, online: R ? R.online || 0 : 0, date: R ? R.savedAt || null : null, theme: O.light ? 'clean' : null } } });
  }
  // höchstens vier Folien gleichzeitig im Aufbau
  let next = 0; const over = [];
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) { const j = jobs[next++]; const r = await drawSlide(j.frame, j); if (r.over > 2) over.push(j.title); }
  }));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return { ok: true, slides: slides.length, over, title: L.title };
}

window.printReady = main().catch((e) => {
  pages.innerHTML = ''; pages.append(el('div', 'perr', `Das PDF konnte nicht vorbereitet werden: ${e.message || e}`));
  return { ok: false, error: String(e.message || e) };
});
