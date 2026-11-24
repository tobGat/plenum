// Wandelt die Lektion aus „Diagramme live“ (public/index.html + public/charts.js) in eine Plenum-Lektion um.
// NUR FÜR DIE PRIVATE NUTZUNG: Die Lektion enthält Aufgaben aus einem Schulbuch und darf nicht veröffentlicht werden.
// Aufruf: node scripts/convert-diagramme-live.cjs "<Ordner von Diagramme live>" [Zieldatei.plenum]
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const src = process.argv[2];
if (!src) { console.error('Aufruf: node scripts/convert-diagramme-live.cjs "<Ordner von Diagramme live>" [Zieldatei.plenum]'); process.exit(1); }
const pub = fs.existsSync(path.join(src, 'public', 'index.html')) ? path.join(src, 'public') : src;
const out = process.argv[3] || path.join(os.homedir(), 'Documents', 'Plenum-Lektionen', 'diagramme-beschreiben-und-erklaeren-privat.plenum');

// Alte Skripte in einer Sandbox ausführen; Diagrammfunktionen liefern statt SVG eine deklarative Beschreibung
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('SLIDES'));
if (!inline) { console.error('Keine Folien (SLIDES) in index.html gefunden.'); process.exit(1); }
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(pub, 'charts.js'), 'utf8'), ctx, { filename: 'charts.js' });
const ser = (series) => (series || []).map((s, i) => ({ name: String(s.name || (i ? `Reihe ${i + 1}` : 'Werte')), values: s.values }));
ctx.svgBar = (o) => ({ type: 'bar', labels: o.labels, series: ser(o.series), unit: String(o.unit || '').trim() });
ctx.svgHBar = (o) => ({ type: 'hbar', labels: o.labels, series: ser(o.series), unit: String(o.unit || '').trim() });
ctx.svgPie = (o) => ({ type: 'pie', labels: o.labels, series: [{ name: 'Werte', values: o.values || (o.series && o.series[0].values) }] });
ctx.svgLine = (o) => ({ type: 'line', labels: o.labels, series: o.series ? ser(o.series).slice(0, 1) : [{ name: 'Werte', values: o.values }], unit: String(o.unit || '').trim() });
vm.runInContext(inline, ctx, { filename: 'index.html' });
const { SLIDES, SOURCES, D } = vm.runInContext('({ SLIDES, SOURCES, D })', ctx);

const ICON = { Start: 'compass', Sachtexte: 'book', 'Diagramme lesen': 'bars', Beeinflussen: 'eye', Rechtschreibung: 'pen', Wortproviant: 'list', Schreiben: 'notebook', Textzusammenhang: 'link', Projekt: 'clipboard', Abschluss: 'flag' };
const COLORS = ['indigo', 'teal', 'blue', 'rose', 'violet', 'amber', 'emerald', 'cyan', 'fuchsia', 'slate'];
const secNames = [...new Set(SLIDES.map((s) => s.sec))];
const sections = secNames.map((name, i) => ({ id: `S-${i + 1}`, name, color: COLORS[i % COLORS.length], icon: ICON[name] || 'star' }));
const secId = (name) => sections.find((x) => x.name === name).id;
const noQuelle = (t) => String(t || '').replace(/^Quelle:\s*/, '');
const chartOf = (s) => {
  if (typeof s.chart !== 'function') return undefined;
  const c = s.chart();
  return { ...c, title: s.ct || '', source: s.src || '' };
};

const slides = SLIDES.map((s) => {
  const base = { id: s.id, section: secId(s.sec), title: s.title };
  switch (s.type) {
    case 'intro': return { ...base, type: 'title', kicker: 'Deutsch · 4. Klasse', subtitle: s.sub, topics: (s.topics || []).map(([text, section]) => ({ text, section })) };
    case 'info': { const chart = chartOf(s); return { ...base, type: 'info', cards: s.cards.map((c) => ({ title: c.t, text: c.x })), chart, source: chart ? undefined : s.src }; }
    case 'book': return { ...base, type: 'task', pages: s.pages, tasks: s.tasks.map((t) => ({ label: t.n, page: t.p, form: t.f, text: t.t })), note: s.note };
    case 'mc': { const chart = chartOf(s); return { ...base, type: 'mc', question: s.q, options: s.opts.map((text, i) => ({ text, correct: i === s.a })), explanation: s.e, chart, source: chart ? undefined : s.src }; }
    case 'truefalse': return { ...base, type: 'truefalse', question: s.q, labels: s.labels, items: s.items.map((i) => ({ text: i.t, correct: i.a, explanation: i.e })) };
    case 'sort': return { ...base, type: 'sort', question: s.q, categories: s.cats.map((name, ci) => ({ name, items: s.items.filter((i) => i.c === ci).map((i) => i.t) })) };
    case 'fill': return { ...base, type: 'gap', tip: s.tip, text: s.text, chart: chartOf(s), source: s.src };
    case 'vote': {
      const p = { ...base, type: 'poll', hint: s.hint, options: s.opts, multi: !!s.multi, discussion: s.after };
      if (s.compare) Object.assign(p, { compareName: s.cmpName, compareValues: s.compare, compareSource: noQuelle(s.src) });
      else if (s.src && (p.discussion || '').length + s.src.length < 390) p.discussion = `${p.discussion || ''}\n${s.src}`.trim();
      if (s.split) Object.assign(p, { splitA: s.split.a, splitB: s.split.b, splitLabelA: s.split.la, splitLabelB: s.split.lb });
      return p;
    }
    case 'lab': return { ...base, type: 'lab', chart: { type: 'bar', title: D.tote.title, labels: D.tote.labels, series: [{ name: 'Getötete', values: D.tote.v }], source: D.tote.src }, task: 'Stellt ein möglichst alarmierendes und ein beruhigendes Diagramm ein. Was habt ihr verändert?', source: D.tote.src };
    case 'summary': return { ...base, type: 'summary', items: s.items.map(([icon, title, text, section]) => ({ icon, title, text, section })) };
    case 'sources': return { ...base, type: 'sources', intro: 'Diagramme aus dem Schulbuch werden nur im Buch gezeigt.', items: SOURCES.map(([title, url]) => ({ title, url })) };
    default: console.warn(`Unbekannter Typ „${s.type}“ (${s.id}) – übersprungen`); return null;
  }
}).filter(Boolean);

const now = new Date().toISOString();
const lesson = { format: 'plenum-lektion', version: 1, id: 'L-diagramme-live-privat', createdAt: now, updatedAt: now, appVersion: '1.0.0',
  title: 'Diagramme beschreiben und erklären', subject: 'Deutsch', grade: '4. Klasse',
  description: 'Private Fassung mit Aufgaben aus dem Schulbuch – nur für den eigenen Unterricht, nicht weitergeben oder veröffentlichen.', sections, slides };

import(path.join(__dirname, '..', 'shared', 'schema.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:')).then(({ normalizeLesson }) => {
  const r = normalizeLesson(lesson, { appVersion: '1.0.0' });
  if (!r.lesson) { console.error('Umwandlung fehlgeschlagen:', r.errors); process.exit(1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r.lesson, null, 2));
  console.log(`✓ ${r.lesson.slides.length} Folien in ${r.lesson.sections.length} Abschnitten → ${out}`);
  if (r.errors.length) console.log('Fehler:', r.errors);
  if (r.repairs.length) console.log(`${r.repairs.length} Anpassungen:\n- ` + r.repairs.join('\n- '));
  console.log('Hinweis: nur für die private Nutzung (enthält Schulbuch-Aufgaben).');
});
