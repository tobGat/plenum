// Live-Typen: Umfrage (inkl. Split-Experiment), Skala, Wortwolke, offene Antworten
import { F, fp, okInt } from './common.js';
import { isFlagged } from '../filter.js';
import { str } from '../util.js';

export const poll = {
  type: 'poll', label: 'Umfrage', icon: 'bars', group: 'Live', live: true,
  desc: 'Abstimmung mit 2–8 Antworten, vorne als Live-Diagramm (Säulen, Balken, Kreis, Prozent, „y-Achse kürzen“). multi=true erlaubt Mehrfachnennung. Optional Vergleichswerte (z. B. Österreich in %) oder ein Split-Experiment: splitA/splitB sind zwei Fassungen der Frage (z. B. neutral und suggestiv); die Geräte bekommen abwechselnd A oder B.',
  fields: [F.title, F.questionOpt, F.hint,
    { key: 'options', kind: 'strlist', label: 'Antworten', min: 2, max: 8, itemMax: 60 },
    { key: 'multi', kind: 'bool', label: 'Mehrfachnennung erlaubt', default: false },
    { key: 'compareName', kind: 'text', label: 'Vergleich: Bezeichnung (z. B. „Österreich 11–17 J.“)', max: 40, optional: true },
    { key: 'compareValues', kind: 'numlist', label: 'Vergleich: Werte in % (je Antwort einer)', optional: true },
    { key: 'compareSource', kind: 'text', label: 'Vergleich: Quelle', max: 300, optional: true },
    { key: 'splitA', kind: 'textarea', label: 'Split-Experiment: Frage A', max: 240, optional: true },
    { key: 'splitB', kind: 'textarea', label: 'Split-Experiment: Frage B', max: 240, optional: true },
    { key: 'splitLabelA', kind: 'text', label: 'Bezeichnung A', max: 30, optional: true },
    { key: 'splitLabelB', kind: 'text', label: 'Bezeichnung B', max: 30, optional: true },
    F.discussion, F.notes],
  sample: { type: 'poll', title: 'Wie kommst du in die Schule?', hint: 'Mehrfachnennung möglich.', options: ['zu Fuß', 'Fahrrad', 'Bus', 'Auto'], multi: true, discussion: 'Warum passt hier kein Kreisdiagramm?' },
  repair(s, r, p) {
    if (s.compareValues && s.compareValues.length !== s.options.length) { r.note(`${p}: Vergleichswerte passen nicht zu den Antworten – entfernt`); delete s.compareValues; }
    if (!s.compareValues) { delete s.compareName; delete s.compareSource; }
    if (!!s.splitA !== !!s.splitB) { r.note(`${p}: Split-Experiment braucht Frage A und B – entfernt`); delete s.splitA; delete s.splitB; }
    if (!s.splitA) { delete s.splitLabelA; delete s.splitLabelB; }
  },
  toStudent: (s, ctx) => ({ title: s.title, question: s.splitA ? (ctx.group === 'b' ? s.splitB : s.splitA) : s.question, hint: s.hint, options: s.options, multi: s.multi, mine: ctx.mine ? ctx.mine.c : null }),
  accept(s, d, ctx) {
    if (!d || !Array.isArray(d.choices)) return null;
    const c = [...new Set(d.choices.filter((i) => okInt(i, 0, s.options.length - 1)))];
    if (!c.length || (!s.multi && c.length > 1)) return null;
    return s.splitA ? { c, g: ctx.group } : { c };
  },
  aggregate(s, subs) {
    const agg = (list) => { const counts = {}; list.forEach((x) => x.c.forEach((i) => { counts[i] = (counts[i] || 0) + 1; })); return { counts, n: list.length }; };
    const all = Object.values(subs);
    if (!s.splitA) return { ...agg(all), done: all.length };
    const A = agg(all.filter((x) => x.g !== 'b')), B = agg(all.filter((x) => x.g === 'b'));
    const counts = {}; for (const k of new Set([...Object.keys(A.counts), ...Object.keys(B.counts)])) counts[k] = (A.counts[k] || 0) + (B.counts[k] || 0);
    return { counts, n: all.length, A, B, done: all.length };
  },
  fingerprint: (s) => fp(s.options, s.multi, s.splitA, s.splitB),
};

export const scale = {
  type: 'scale', label: 'Skala', icon: 'scale', group: 'Live', live: true,
  desc: '1–6 Aussagen, die die Klasse auf einer Skala (3–10 Stufen) bewertet, z. B. „trifft nicht zu … trifft voll zu“. Vorne Mittelwert und Verteilung.',
  fields: [F.title, F.questionOpt,
    { key: 'statements', kind: 'strlist', label: 'Aussagen', min: 1, max: 6, itemMax: 120 },
    { key: 'steps', kind: 'int', label: 'Stufen', min: 3, max: 10, default: 5 },
    { key: 'minLabel', kind: 'text', label: 'Beschriftung links', max: 30, default: 'trifft nicht zu' },
    { key: 'maxLabel', kind: 'text', label: 'Beschriftung rechts', max: 30, default: 'trifft voll zu' },
    F.discussion, F.notes],
  sample: { type: 'scale', title: 'Wie sicher fühlst du dich?', statements: ['Ich kann den Wasserkreislauf erklären.', 'Ich weiß, wie viel Wasser ich täglich verbrauche.'], steps: 5, minLabel: 'gar nicht', maxLabel: 'sehr sicher' },
  toStudent: (s, ctx) => ({ title: s.title, question: s.question, statements: s.statements, steps: s.steps, minLabel: s.minLabel, maxLabel: s.maxLabel, mine: ctx.mine ?? null }),
  accept(s, d) {
    if (!d || !Array.isArray(d.values) || d.values.length !== s.statements.length) return null;
    return d.values.every((v) => v === null || okInt(v, 1, s.steps)) && d.values.some((v) => v !== null) ? d.values.slice() : null;
  },
  aggregate(s, subs) {
    const items = s.statements.map(() => ({ counts: {}, n: 0, sum: 0 }));
    const all = Object.values(subs);
    all.forEach((a) => a.forEach((v, i) => { if (v === null) return; const it = items[i]; it.counts[v] = (it.counts[v] || 0) + 1; it.n++; it.sum += v; }));
    return { items: items.map((it) => ({ counts: it.counts, n: it.n, mean: it.n ? it.sum / it.n : null })), students: all.length, done: all.length };
  },
  fingerprint: (s) => fp(s.statements, s.steps),
};

// Moderation: meta = { hidden:[schlüssel], approved:[schlüssel], showAll:bool }
const visibleBy = (meta, key, flagged, approval) => !(meta.hidden || []).includes(key) && ((meta.approved || []).includes(key) || (!flagged && (!approval || !!meta.showAll)));
export const normWord = (w) => str(w).replace(/\s+/g, ' ').trim().slice(0, 25);

export const wordcloud = {
  type: 'wordcloud', label: 'Wortwolke', icon: 'cloud', group: 'Live', live: true,
  desc: 'Die Klasse schickt bis zu 1–5 kurze Begriffe; vorne entsteht eine animierte Wortwolke (häufige Begriffe größer). Mit approval=true erscheinen Begriffe erst nach Freigabe.',
  fields: [F.title, F.question,
    { key: 'maxWords', kind: 'int', label: 'Begriffe pro Person', min: 1, max: 5, default: 3 },
    { key: 'approval', kind: 'bool', label: 'Begriffe erst nach Freigabe zeigen', default: false },
    F.discussion, F.notes],
  sample: { type: 'wordcloud', title: 'Woran denkst du bei Wasser?', question: 'Schreibe bis zu drei Begriffe.', maxWords: 3 },
  toStudent: (s, ctx) => ({ title: s.title, question: s.question, maxWords: s.maxWords, mine: ctx.mine ?? null }),
  accept(s, d) {
    if (!d || !Array.isArray(d.words)) return null;
    const seen = new Set(), out = [];
    for (const w of d.words.map(normWord)) { const k = w.toLowerCase(); if (w && !seen.has(k)) { seen.add(k); out.push(w); } }
    return out.length ? out.slice(0, s.maxWords) : null;
  },
  aggregate(s, subs, ctx = {}) {
    const meta = ctx.meta || {}, map = new Map();
    for (const list of Object.values(subs)) for (const w of list) {
      const k = w.toLowerCase(); const e = map.get(k) || { key: k, text: w, n: 0 }; e.n++; map.set(k, e);
    }
    const words = [...map.values()].map((e) => { const flagged = isFlagged(e.text, ctx.extraWords); return { ...e, flagged, hidden: !!meta.hidden?.includes(e.key), approved: !!meta.approved?.includes(e.key), visible: visibleBy(meta, e.key, flagged, s.approval) }; });
    words.sort((a, b) => b.n - a.n || a.text.localeCompare(b.text, 'de'));
    return { words, students: Object.keys(subs).length, done: Object.keys(subs).length, showAll: !!meta.showAll };
  },
  fingerprint: () => 'wordcloud',
};

export const open = {
  type: 'open', label: 'Offene Antworten', icon: 'chat', group: 'Live', live: true,
  desc: 'Freitext-Antworten (z. B. Meinungen, Fragen, Ideen). Sie erscheinen vorne als Karten, standardmäßig erst nach Freigabe durch die Lehrkraft.',
  fields: [F.title, F.question,
    { key: 'maxLength', kind: 'int', label: 'Zeichen pro Antwort', min: 40, max: 300, default: 200 },
    { key: 'maxAnswers', kind: 'int', label: 'Antworten pro Person', min: 1, max: 5, default: 1 },
    { key: 'approval', kind: 'bool', label: 'Antworten erst nach Freigabe zeigen', default: true },
    F.discussion, F.notes],
  sample: { type: 'open', title: 'Deine Idee', question: 'Wie könnte unsere Schule Wasser sparen?', maxLength: 200, maxAnswers: 2, approval: true },
  toStudent: (s, ctx) => ({ title: s.title, question: s.question, maxLength: s.maxLength, maxAnswers: s.maxAnswers, mine: (ctx.mine || []).map((a) => a.text) }),
  accept(s, d, ctx) {
    const text = str(d && d.text).replace(/\s+/g, ' ').trim().slice(0, s.maxLength);
    if (!text) return null;
    const prev = Array.isArray(ctx.prev) ? ctx.prev : [];
    const entry = { id: ctx.newId(), text, at: ctx.now };
    if (s.maxAnswers === 1) return [entry];
    return prev.length >= s.maxAnswers ? null : prev.concat(entry);
  },
  aggregate(s, subs, ctx = {}) {
    const meta = ctx.meta || {};
    const items = Object.values(subs).flat().map((a) => { const flagged = isFlagged(a.text, ctx.extraWords); return { id: a.id, text: a.text, at: a.at, flagged, hidden: !!meta.hidden?.includes(a.id), approved: !!meta.approved?.includes(a.id), visible: visibleBy(meta, a.id, flagged, s.approval) }; });
    items.sort((a, b) => a.at - b.at);
    return { items, students: Object.keys(subs).length, done: Object.keys(subs).length, showAll: !!meta.showAll };
  },
  fingerprint: () => 'open',
};
