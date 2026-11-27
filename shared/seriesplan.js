// Themenserie mit KI planen: Plenum schreibt den Auftrag (Prompt) für einen KI-Chat und baut aus der Antwort eine Serie
// mit Platzhalter-Karten in passender Reihenfolge. Die KI erstellt dabei keine Inhalte – nur Titel, Stichworte und Abfolge.
import { newSeries, normalizeSeries, MAX_COL, MAX_ROW } from './series.js';
import { newId, isObj, asArr, str } from './util.js';

export const PLAN_MAX = 40; // höchstens so viele Themen aus einer Antwort
const text = (v, max) => str(v).replace(/\s+/g, ' ').trim().slice(0, max);

// branch = false (Vorgabe): eine einfache Abfolge ohne Verzweigungen – die Themen stehen in der Reihenfolge des Unterrichts.
// branch = true: die KI darf parallele Themen angeben („nach“).
export function buildSeriesPrompt({ topic = '', subject = '', grade = '', count = 8, notes = '', branch = false } = {}) {
  const n = Math.max(2, Math.min(PLAN_MAX, parseInt(count, 10) || 8));
  const example = { titel: 'Titel der Themenserie', fach: subject || 'Fach', schulstufe: grade || 'Schulstufe', beschreibung: 'Ein bis zwei Sätze: Worum geht es, was können die Schüler:innen am Ende?',
    themen: ['Erstes Thema', 'Zweites Thema', 'Drittes Thema'].map((titel, i) => ({ nr: i + 1, titel, notiz: 'Schwerpunkt in Stichworten', ...(branch ? { nach: i ? [i] : [] } : {}) })) };
  return [
    'Du hilfst einer Lehrkraft, eine Themenserie (Unterrichtsreihe) zu planen. Sie wird in der Unterrichts-App „Plenum“ als Matrix aus Themenkarten angelegt.',
    '',
    'AUFGABE:',
    `Thema der Serie: ${text(topic, 200) || '(siehe Wünsche)'}`,
    ...(subject ? [`Fach: ${text(subject, 40)}`] : []),
    ...(grade ? [`Schulstufe / Klasse: ${text(grade, 40)}`] : []),
    `Umfang: genau ${n} Themen. Ein Thema entspricht einer Unterrichtseinheit (eine Stunde oder Doppelstunde).`,
    ...(notes ? [`Wünsche der Lehrkraft: ${text(notes, 600)}`] : []),
    '',
    'REGELN:',
    '1. Erstelle KEINE Unterrichtsinhalte, Folien, Aufgaben oder Texte – nur die Abfolge der Themen.',
    '2. Die Themen bauen sinnvoll aufeinander auf: vom Einstieg über Erarbeitung und Übung bis zu Wiederholung oder Abschluss.',
    '3. „titel“: kurz und konkret, höchstens 50 Zeichen, ohne Nummer davor.',
    '4. „notiz“: Schwerpunkt oder Lernziel in Stichworten, höchstens 120 Zeichen.',
    ...(branch
      ? ['5. „nach“: die Nummern der Themen, die unmittelbar vorher behandelt sein müssen. Beim ersten Thema leer ([]). Im Normalfall ist es genau das vorige Thema.',
        '6. Eine Verzweigung (zwei Themen mit demselben Vorgänger) nur, wenn die beiden Themen wirklich unabhängig sind und in beliebiger Reihenfolge unterrichtet werden können. Im Zweifel keine Verzweigung, sondern eine einfache Abfolge.']
      : ['5. Die Themen stehen in genau der Reihenfolge, in der sie unterrichtet werden – eine einfache Abfolge ohne Verzweigungen und ohne parallele Themen.',
        '6. Jedes Thema baut auf dem vorigen auf; gib keine Felder für Vorgänger oder Abhängigkeiten an.']),
    '7. Antworte ausschließlich mit einem JSON-Codeblock in genau dieser Form, ohne Text davor oder danach:',
    '',
    '```json',
    JSON.stringify(example, null, 2),
    '```',
  ].join('\n');
}

// Aus der Antwort (schon als Objekt gelesen) eine Serie bauen. Liefert { series, errors, notes }.
// linear = true: Angaben zu Vorgängern („nach“) werden ignoriert – die Themen bilden eine einfache Kette in der gegebenen Reihenfolge.
export function seriesFromPlan(data, { subject = '', grade = '', linear = false } = {}) {
  const errors = [], notes = [];
  if (Array.isArray(data)) data = { themen: data };
  if (isObj(data) && isObj(data.serie)) data = data.serie;
  if (isObj(data) && isObj(data.themenserie)) data = data.themenserie;
  const raw = isObj(data) ? asArr(data.themen ?? data.topics ?? data.karten ?? data.cards) : [];
  let topics = raw.map((t) => (typeof t === 'string' ? { titel: t } : t)).filter(isObj).map((t) => ({ title: text(t.titel ?? t.title ?? t.thema, 60), note: text(t.notiz ?? t.note ?? t.beschreibung ?? t.schwerpunkt, 160), nr: t.nr ?? t.nummer ?? t.id, after: t.nach ?? t.after ?? t.vorher }))
    .filter((t) => t.title);
  if (!topics.length) { errors.push('In der Antwort wurden keine Themen gefunden (erwartet wird ein JSON-Objekt mit „themen“).'); return { series: null, errors, notes }; }
  if (topics.length > PLAN_MAX) { notes.push(`Mehr als ${PLAN_MAX} Themen – der Rest wurde weggelassen`); topics = topics.slice(0, PLAN_MAX); }

  // Vorgänger: Nummern laut „nr“ (sonst Position); fehlt „nach“, gilt das vorige Thema
  const byNr = new Map();
  topics.forEach((t, i) => { const k = Number.isFinite(+t.nr) && t.nr !== null && t.nr !== '' ? +t.nr : i + 1; if (!byNr.has(k)) byNr.set(k, i); });
  const preds = topics.map((t, i) => {
    if (linear || t.after === undefined || t.after === null) return i ? [i - 1] : [];
    const list = [...new Set(asArr(t.after).map((v) => byNr.get(+v)).filter((j) => j !== undefined && j !== i))];
    if (asArr(t.after).length && !list.length) notes.push(`„${t.title}“: Vorgänger nicht gefunden – ohne Pfeil angelegt`);
    return list;
  });
  // Kreise auflösen: Tiefe = längster Weg vom Anfang; Pfeile, die einen Kreis schließen würden, fallen weg
  const n = topics.length, depth = new Array(n).fill(-1), state = new Array(n).fill(0);
  const visit = (i) => {
    if (state[i] === 2) return depth[i];
    state[i] = 1;
    let d = 0;
    preds[i] = preds[i].filter((j) => { if (state[j] === 1) { notes.push(`„${topics[i].title}“ und „${topics[j].title}“ verweisen im Kreis – ein Pfeil wurde weggelassen`); return false; } d = Math.max(d, visit(j) + 1); return true; });
    state[i] = 2; depth[i] = d;
    return d;
  };
  for (let i = 0; i < n; i++) visit(i);

  const succ = topics.map(() => 0);
  preds.forEach((p) => p.forEach((j) => { succ[j]++; }));
  const chain = preds.every((p) => p.length <= 1) && succ.every((k) => k <= 1) && preds.filter((p) => !p.length).length === 1;
  const pos = new Array(n);
  if (chain) {
    // Eine einfache Kette läuft in Zeilen zu je vier Karten hin und her, so liegt jede Karte neben ihrer Vorgängerin
    const W = 4, order = [];
    let cur = preds.findIndex((p) => !p.length);
    while (cur !== undefined && cur >= 0 && order.length < n) { order.push(cur); const c = cur; cur = preds.findIndex((p) => p[0] === c); }
    order.forEach((i, k) => { const row = Math.floor(k / W), c = k % W; pos[i] = { col: row % 2 ? W - 1 - c : c, row }; });
  } else {
    // Verzweigt: Spalte = Tiefe, Zeile möglichst auf Höhe der ersten Vorgängerin
    const used = new Set();
    [...topics.keys()].sort((a, b) => depth[a] - depth[b] || a - b).forEach((i) => {
      const col = Math.min(depth[i], MAX_COL);
      let row = preds[i].length && pos[preds[i][0]] ? pos[preds[i][0]].row : 0;
      while (used.has(`${col}|${row}`) && row < MAX_ROW) row++;
      used.add(`${col}|${row}`); pos[i] = { col, row };
    });
  }
  const S = newSeries(text(data.titel ?? data.title, 90) || 'Neue Themenserie');
  S.subject = text(data.fach ?? data.subject, 40) || text(subject, 40);
  S.grade = text(data.schulstufe ?? data.grade ?? data.klasse, 40) || text(grade, 40);
  S.description = text(data.beschreibung ?? data.description, 400);
  const ids = topics.map(() => newId('k'));
  S.cards = topics.map((t, i) => ({ id: ids[i], col: pos[i].col, row: pos[i].row, title: t.title, ...(t.note ? { note: t.note } : {}) }));
  S.links = preds.flatMap((p, i) => p.map((j) => ({ from: ids[j], to: ids[i] })));
  const series = normalizeSeries(S);
  if (series.cards.length < topics.length) notes.push('Einige Themen ließen sich nicht platzieren und wurden weggelassen');
  return { series, errors, notes };
}
