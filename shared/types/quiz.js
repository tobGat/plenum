// Quiz mit Zeitlimit und Punkten, Rangliste. Ablauf und Uhr steuert der Server (server/rooms.js).
// meta je Quizfolie: { phase: 'idle'|'ready'|'running'|'closed'|'revealed', startedAt, endsAt }
import { F, fp, okInt } from './common.js';

export const QUIZ_GRACE_MS = 400; // Kulanz nach Ablauf (Übertragungszeit)
export const QUIZ_READY_MS = 3000; // „Bereit?“ vor dem Start

export const quiz = {
  type: 'quiz', label: 'Quizfrage', icon: 'trophy', group: 'Live', live: true, quiz: true,
  desc: 'Quizfrage mit Zeitlimit (5–120 s) und 2–6 Antworten, genau eine richtig. Punkte für richtige und schnelle Antworten; die Lösung erscheint erst bei der Auflösung. Mehrere Quizfragen hintereinander, danach eine Rangliste.',
  fields: [F.title, F.question, { key: 'options', kind: 'choices', label: 'Antworten', min: 2, max: 6, correct: 'one', itemMax: 100 },
    { key: 'time', kind: 'int', label: 'Zeit in Sekunden', min: 5, max: 120, default: 20 },
    { key: 'points', kind: 'int', label: 'Punkte (Höchstwert)', min: 100, max: 2000, default: 1000 },
    F.explanation, F.notes],
  sample: { type: 'quiz', title: 'Quiz 1', question: 'Welches Gewässer ist das größte Österreichs?', options: [{ text: 'Neusiedler See', correct: true }, { text: 'Attersee', correct: false }, { text: 'Bodensee (Anteil)', correct: false }], time: 20 },
  toStudent(s, ctx) {
    const m = ctx.meta || { phase: 'idle' }, base = { title: s.title, phase: m.phase };
    if (m.phase === 'idle') return base;
    if (m.phase === 'ready') return { ...base, readyMs: Math.max(0, m.startedAt - ctx.now) };
    const q = { ...base, question: s.question, options: s.options.map((o) => o.text), time: s.time, mine: ctx.mine ? ctx.mine.c : null };
    if (m.phase === 'running') return { ...q, remainingMs: Math.max(0, m.endsAt - ctx.now) };
    if (m.phase === 'closed') return q;
    return { ...q, correct: s.options.findIndex((o) => o.correct), explanation: s.explanation, points: ctx.mine ? ctx.mine.p ?? 0 : 0 };
  },
  accept(s, d, ctx) {
    const m = ctx.meta || {};
    const open = m.phase === 'running' || (m.phase === 'closed' && ctx.now <= m.endsAt + QUIZ_GRACE_MS);
    if (!open || ctx.prev != null || !d || !okInt(d.choice, 0, s.options.length - 1)) return null;
    const t = Math.max(0, ctx.now - m.startedAt);
    const right = s.options[d.choice].correct;
    const p = right ? Math.round(s.points * (1 - 0.5 * Math.min(1, t / (s.time * 1000)))) : 0;
    return { c: d.choice, t, p };
  },
  aggregate(s, subs, ctx = {}) {
    const m = ctx.meta || { phase: 'idle' }, v = Object.values(subs), counts = {};
    v.forEach((x) => { counts[x.c] = (counts[x.c] || 0) + 1; });
    const revealed = m.phase === 'revealed';
    return { phase: m.phase, remainingMs: m.phase === 'running' ? Math.max(0, m.endsAt - (ctx.now || 0)) : 0, readyMs: m.phase === 'ready' ? Math.max(0, m.startedAt - (ctx.now || 0)) : 0,
      n: v.length, counts: m.phase === 'closed' || revealed ? counts : {}, correct: revealed ? s.options.findIndex((o) => o.correct) : null, done: v.length };
  },
  fingerprint: (s) => fp(s.options, s.time, s.points),
};

export const leaderboard = {
  type: 'leaderboard', label: 'Rangliste', icon: 'star', group: 'Live', live: true,
  desc: 'Zeigt die Punkte aller bisherigen Quizfragen: vorne die besten Plätze, auf jedem Gerät der eigene Platz.',
  fields: [F.title, { key: 'top', kind: 'int', label: 'Plätze vorne', min: 3, max: 10, default: 5 }, F.notes],
  sample: { type: 'leaderboard', title: 'Rangliste', top: 5 },
  toStudent: (s, ctx) => ({ title: s.title, me: ctx.me || null }),
  aggregate: (s, subs, ctx = {}) => ({ ranking: (ctx.ranking || []).slice(0, s.top), players: (ctx.ranking || []).length }),
  fingerprint: () => 'leaderboard',
};
