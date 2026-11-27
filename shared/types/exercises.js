// Aufgaben mit Selbstkontrolle (mc, truefalse, sort) und Arbeitsauftrag (task)
import { F, shuffled, fp, okInt, changedAny, changedSlot } from './common.js';

export const mc = {
  type: 'mc', label: 'Multiple Choice', icon: 'vote', group: 'Aufgaben', selfCheck: true, live: true,
  desc: 'Frage mit 2–6 Antworten, genau eine richtig. Die Klasse bekommt sofort Rückmeldung; vorne gibt es eine Auswertung. Optional mit Diagramm daneben.',
  fields: [F.title, F.question, { key: 'options', kind: 'choices', label: 'Antworten', min: 2, max: 6, correct: 'one', itemMax: 140 },
    F.explanation, F.chart, F.source, F.notes],
  sample: { type: 'mc', title: 'Wasser-Quiz', question: 'Wie viel Prozent der Erde sind mit Wasser bedeckt?', options: [{ text: 'etwa 30 %', correct: false }, { text: 'etwa 70 %', correct: true }, { text: 'etwa 90 %', correct: false }], explanation: 'Rund 71 % der Erdoberfläche sind von Wasser bedeckt.' },
  toStudent: (s, ctx) => ({ title: s.title, question: s.question, options: s.options.map((o) => o.text), correct: s.options.findIndex((o) => o.correct), explanation: s.explanation, chart: s.chart, source: s.source, mine: ctx.mine ?? null }),
  accept: (s, d) => (d && okInt(d.choice, 0, s.options.length - 1) ? d.choice : null),
  aggregate(s, subs) {
    const v = Object.values(subs), counts = {}, ci = s.options.findIndex((o) => o.correct);
    v.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    return { counts, n: v.length, done: v.length, ok: v.filter((c) => c === ci).length, total: v.length };
  },
  changes: changedAny,
  fingerprint: (s) => fp(s.options),
};

export const truefalse = {
  type: 'truefalse', label: 'Richtig / Falsch', icon: 'check', group: 'Aufgaben', selfCheck: true, live: true,
  desc: '2–8 Aussagen, die die Klasse als richtig oder falsch beurteilt (eigene Beschriftungen möglich, z. B. „fehlerlos“/„Fehler“). Je Aussage eine kurze Begründung.',
  fields: [F.title, F.question,
    { key: 'labels', kind: 'strlist', label: 'Beschriftung der zwei Knöpfe', max: 2, itemMax: 20, optional: true },
    { key: 'items', kind: 'objlist', label: 'Aussagen', min: 2, max: 8, fields: [
      { key: 'text', kind: 'textarea', label: 'Aussage', max: 220, required: true },
      { key: 'correct', kind: 'bool', label: 'Aussage stimmt', default: false },
      { key: 'explanation', kind: 'textarea', label: 'Begründung', max: 240, optional: true }] },
    F.chart, F.source, F.notes],
  sample: { type: 'truefalse', title: 'Stimmt das?', question: 'Richtig oder falsch?', items: [{ text: 'Wasser kocht auf Meereshöhe bei 100 °C.', correct: true, explanation: 'Bei normalem Luftdruck stimmt das.' }, { text: 'Eis ist schwerer als Wasser.', correct: false, explanation: 'Eis schwimmt, weil es leichter ist.' }] },
  repair(s) { if (s.labels && s.labels.length !== 2) delete s.labels; },
  toStudent: (s, ctx) => ({ title: s.title, question: s.question, labels: s.labels || ['Richtig', 'Falsch'], items: s.items, chart: s.chart, source: s.source, mine: ctx.mine ?? null }),
  accept(s, d) {
    if (!d || !Array.isArray(d.answers) || d.answers.length !== s.items.length) return null;
    return d.answers.every((a) => a === true || a === false || a === null) ? d.answers.slice() : null;
  },
  aggregate(s, subs) {
    const items = s.items.map(() => ({ right: 0, wrong: 0, n: 0 }));
    let students = 0, done = 0, ok = 0, total = 0;
    for (const a of Object.values(subs)) {
      let any = false;
      a.forEach((v, i) => { if (v === null) return; any = true; items[i].n++; v === s.items[i].correct ? items[i].right++ : items[i].wrong++; });
      if (any) students++;
      if (a.every((v) => v !== null)) { done++; total += a.length; ok += a.filter((v, i) => v === s.items[i].correct).length; }
    }
    return { items, students, done, ok, total };
  },
  changes: changedSlot,
  fingerprint: (s) => fp(s.items.map((i) => [i.text, i.correct])),
};

const flat = (s) => s.categories.flatMap((c, ci) => c.items.map((text) => ({ text, cat: ci })));

export const sort = {
  type: 'sort', label: 'Zuordnen', icon: 'puzzle', group: 'Aufgaben', selfCheck: true, live: true,
  desc: 'Begriffe 2–4 Kategorien zuordnen. Die Kategorien enthalten ihre richtigen Begriffe; die App mischt sie für die Klasse.',
  fields: [F.title, F.question,
    { key: 'categories', kind: 'objlist', label: 'Kategorien', min: 2, max: 4, fields: [
      { key: 'name', kind: 'text', label: 'Kategorie', max: 40, required: true },
      { key: 'items', kind: 'strlist', label: 'Begriffe dieser Kategorie', min: 1, max: 8, itemMax: 90 }] },
    F.source, F.notes],
  sample: { type: 'sort', title: 'Zuordnen', question: 'Fest, flüssig oder gasförmig?', categories: [{ name: 'fest', items: ['Eis', 'Schnee'] }, { name: 'flüssig', items: ['Regen'] }, { name: 'gasförmig', items: ['Wasserdampf'] }] },
  repair(s, r, p) { if (flat(s).length > 14) r.note(`${p}: viele Begriffe – eventuell schwer lesbar`); },
  toStudent: (s, ctx) => ({ title: s.title, question: s.question, categories: s.categories.map((c) => c.name),
    items: shuffled(flat(s).map((it, i) => ({ i, text: it.text, cat: it.cat })), (ctx.cid || '') + s.id), source: s.source, mine: ctx.mine ?? null }),
  accept(s, d) {
    const n = flat(s).length;
    if (!d || !Array.isArray(d.answers) || d.answers.length !== n) return null;
    return d.answers.every((a) => a === null || okInt(a, 0, s.categories.length - 1)) ? d.answers.slice() : null;
  },
  aggregate(s, subs) {
    const fl = flat(s), items = fl.map((it) => ({ c: {}, n: 0, cat: it.cat }));
    let students = 0, done = 0, ok = 0, total = 0;
    for (const a of Object.values(subs)) {
      let any = false;
      a.forEach((v, i) => { if (v === null) return; any = true; items[i].n++; items[i].c[v] = (items[i].c[v] || 0) + 1; });
      if (any) students++;
      if (a.every((v) => v !== null)) { done++; total += a.length; ok += a.filter((v, i) => v === fl[i].cat).length; }
    }
    return { items, students, done, ok, total };
  },
  changes: changedSlot,
  fingerprint: (s) => fp(s.categories),
};

export const task = {
  type: 'task', label: 'Arbeitsauftrag', icon: 'notebook', group: 'Aufgaben', live: true,
  desc: 'Auftrag, der außerhalb der App erledigt wird (z. B. im Buch oder Heft): bis zu 4 Teilaufträge mit Kennung, Seite, Sozialform. Die Klasse tippt „Ich bin fertig“, vorne sieht man, wie viele fertig sind.',
  fields: [F.title, { key: 'pages', kind: 'text', label: 'Material / Seiten (z. B. „Buch S. 41–42“)', max: 40, optional: true },
    { key: 'tasks', kind: 'objlist', label: 'Teilaufträge', min: 1, max: 4, fields: [
      { key: 'label', kind: 'text', label: 'Kennung (z. B. Ü2)', max: 12, optional: true },
      { key: 'page', kind: 'text', label: 'Seite', max: 20, optional: true },
      { key: 'form', kind: 'text', label: 'Sozialform (allein, zu zweit, in der Gruppe, ins Heft …)', max: 40, optional: true },
      { key: 'text', kind: 'textarea', label: 'Auftrag (Zeilen mit „a) …“ werden Schritte)', max: 500, required: true }] },
    { key: 'note', kind: 'textarea', label: 'Hinweis', max: 240, optional: true }, F.notes],
  sample: { type: 'task', title: 'Zuerst im Heft', pages: 'Heft', tasks: [{ label: 'A1', form: 'allein, dann zu zweit', text: 'a) Notiere drei Orte, an denen du Wasser verbrauchst.\nb) Vergleicht zu zweit.' }] },
  toStudent: (s, ctx) => ({ title: s.title, pages: s.pages, tasks: s.tasks, note: s.note, mine: ctx.mine ?? null }),
  accept: (s, d) => (d && d.done === true ? true : null),
  aggregate: (s, subs) => ({ done: Object.keys(subs).length }),
  fingerprint: () => 'task',
};
