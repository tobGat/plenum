// Darstellung: Multiple Choice, Richtig/Falsch, Zuordnen (mit Auswertung) und Arbeitsauftrag
import { html, md, richLines, fmt, pct } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { withChart, fb, ring, seg, eRow, OKC, NOCS, srcLine } from '../core/parts.js';
import { shuffled } from '/shared/types/common.js';

const L6 = 'ABCDEF';
// Auswertung als Balkenzeilen (nur Lehrkraft)
function evalBox(s, c, rows, legend) {
  const a = c.agg || {}, students = a.students ?? a.n ?? 0, avg = a.total ? fmt((a.ok / a.total) * 100) : null;
  return html`<div class="chartbox evalbox anim${s.chart ? ' stack' : ''}"><div class="ev-h">${ic('bars')}<h4>Auswertung: So hat die Klasse geantwortet</h4></div>
    <div class="esum">${students ? `${students} ${students === 1 ? 'Person hat' : 'Personen haben'} geantwortet${avg ? ` · im Schnitt ${avg} % richtig` : ''}` : 'Noch keine Antworten. Das Diagramm füllt sich live, sobald die Klasse arbeitet.'}</div>
    <div class="elg">${legend}</div><div class="erows${rows.length >= 7 && !s.chart ? ' cols' : ''}">${rows}</div>
    <div class="src">Quelle: Übung in unserer Klasse, ${(c.date ? new Date(c.date) : new Date()).toLocaleDateString('de-AT')}, ${students} Teilnehmende.</div></div>`;
}
const lg = (a, b) => html`<span><i style="background:${OKC}"></i>${a}</span><span><i style="background:${NOCS[0]}"></i>${b}</span>`;

export const mc = {
  host(s, c) {
    const q = html`<div class="qbox anim">${md(s.question)}</div>`;
    if (c.prefs.eval) {
      const a = c.agg || { counts: {}, n: 0 }, K = (i) => `${s.id}|${i}`;
      const rows = s.options.map((o, i) => { const v = a.counts[i] || 0; return eRow(html`<b>${L6[i]}</b> ${o.text}`, o.correct ? '✓ richtig' : '', seg(K(i), v, a.n, o.correct ? OKC : NOCS[0], ''), `${v} von ${a.n}`); });
      return withChart(s.chart, c.key, html`${q}${evalBox(s, c, rows, lg('richtige Antwort', 'falsche Antworten'))}${s.explanation ? fb(true, s.explanation) : ''}`, s.source);
    }
    // c.solution (PDF „Mit Lösungen“): richtige Antwort markiert, Erklärung darunter
    const sol = !!c.solution;
    return withChart(s.chart, c.key, html`${q}<div class="opts">${s.options.map((o, i) => html`<div class="opt static anim${sol && o.correct ? ' ok' : ''}" style="--i:${i + 1}"><span class="bd">${L6[i]}</span><span class="ot">${o.text}</span>${sol && o.correct ? ic('check', 'mk') : ''}</div>`)}</div>${sol && s.explanation ? fb(true, s.explanation) : ''}`, s.source);
  },
  student(d, c) {
    const st = c.local.mc ?? d.mine, done = st != null;
    return withChart(d.chart, c.key, html`<div class="qbox anim">${md(d.question)}</div><div class="opts">${d.options.map((o, i) => {
      const cl = done ? (i === d.correct ? 'ok' : i === st ? 'no' : '') : '';
      return html`<button class="opt anim ${cl}" style="--i:${i + 1}" ${done ? 'disabled' : ''} data-action="t:pick" data-i="${i}"><span class="bd">${L6[i]}</span><span class="ot">${o}</span>${cl === 'ok' ? ic('check', 'mk') : cl === 'no' ? ic('x', 'mk') : ''}</button>`;
    })}</div>${done ? fb(st === d.correct, `${st === d.correct ? 'Richtig! ' : 'Leider nicht. '}${d.explanation || ''}`) : ''}`, d.source);
  },
  studentActions: { pick(el, c) { if ((c.local.mc ?? c.p.data.mine) != null) return; c.local.mc = +el.dataset.i; c.render(); c.submit({ choice: +el.dataset.i }); } },
};

function scoreBox(ok, n) { return html`<div class="score">${ring(ok / n, null, 48, ok === n ? 'ok' : '')}<div><b>${ok} von ${n}</b> richtig</div></div>`; }

export const truefalse = {
  host(s, c) {
    const L = s.labels || ['Richtig', 'Falsch'], q = html`<div class="qbox anim">${md(s.question)}</div>`;
    if (c.prefs.eval) {
      const a = c.agg || { items: [] };
      const rows = s.items.map((it, i) => { const x = a.items[i] || { right: 0, wrong: 0, n: 0 }; return eRow(it.text, `Lösung: ${it.correct ? L[0] : L[1]}`, html`${seg(`${s.id}|${i}|r`, x.right, x.n, OKC, '✓')}${seg(`${s.id}|${i}|w`, x.wrong, x.n, NOCS[0], '✗')}`, `n = ${x.n}`, it.explanation); });
      return withChart(s.chart, c.key, html`${q}${evalBox(s, c, rows, lg('richtig beurteilt', 'falsch beurteilt'))}`, s.source);
    }
    const sol = !!c.solution, ch = (it, v) => html`<span class="choice${sol && it.correct === v ? ' good' : ''}">${L[v ? 0 : 1]}</span>`;
    return withChart(s.chart, c.key, html`${q}<div class="items${s.items.length >= 6 ? ' two' : ''}">${s.items.map((it, i) => html`<div class="item anim" style="--i:${i + 1}"><span class="inr">${i + 1}</span><div class="tx">${it.text}</div><div class="choices">${ch(it, true)}${ch(it, false)}</div>${sol && it.explanation ? html`<div class="ex">${it.explanation}</div>` : ''}</div>`)}</div>`, s.source);
  },
  student(d, c) {
    const st = c.local.tf || (c.local.tf = d.mine ? d.mine.slice() : d.items.map(() => null));
    let n = 0, ok = 0;
    const rows = d.items.map((it, i) => {
      const a = st[i], done = a !== null && a !== undefined;
      if (done) { n++; if (a === it.correct) ok++; }
      const b = (v, l) => { const pick = done && a === v; return html`<button class="choice${pick ? (a === it.correct ? ' good' : ' bad') : ''}${done && !pick && v === it.correct ? ' right' : ''}" ${done ? 'disabled' : ''} data-action="t:answer" data-i="${i}" data-v="${v}">${l}</button>`; };
      return html`<div class="item anim ${done ? (a === it.correct ? 'ok' : 'no') : ''}" style="--i:${i + 1}"><span class="inr">${done ? ic(a === it.correct ? 'check' : 'x') : i + 1}</span><div class="tx">${it.text}</div><div class="choices">${b(true, d.labels[0])}${b(false, d.labels[1])}</div>${done && it.explanation ? html`<div class="ex">${it.explanation}</div>` : ''}</div>`;
    });
    return withChart(d.chart, c.key, html`<div class="qbox anim">${md(d.question)}</div><div class="items">${rows}</div>${n === d.items.length ? scoreBox(ok, n) : ''}`, d.source);
  },
  studentActions: { answer(el, c) { const st = c.local.tf, i = +el.dataset.i; if (st[i] !== null && st[i] !== undefined) return; st[i] = el.dataset.v === 'true'; c.render(); c.submit({ answers: st }); } },
};

export const sort = {
  host(s, c) {
    const q = html`<div class="qbox anim">${md(s.question)}</div>`;
    const flat = s.categories.flatMap((cat, ci) => cat.items.map((text) => ({ text, cat: ci })));
    if (c.prefs.eval) {
      const a = c.agg || { items: [] };
      const rows = flat.map((it, i) => {
        const x = a.items[i] || { c: {}, n: 0 }, wrong = s.categories.map((cat, k) => [k, x.c[k] || 0]).filter(([k, v]) => k !== it.cat && v).sort((p, q2) => q2[1] - p[1]);
        return eRow(it.text, `Lösung: ${s.categories[it.cat].name}`, html`${seg(`${s.id}|${i}|c${it.cat}`, x.c[it.cat] || 0, x.n, OKC, s.categories[it.cat].name)}${wrong.map(([k, v], j) => seg(`${s.id}|${i}|c${k}`, v, x.n, NOCS[j % NOCS.length], s.categories[k].name))}`, `n = ${x.n}`);
      });
      return html`${q}${evalBox(s, c, rows, lg('richtig zugeordnet', 'falsch zugeordnet (mit gewählter Spalte)'))}${srcLine(s.source)}`;
    }
    // c.solution (PDF „Mit Lösungen“): Begriffe unter ihrer Kategorie
    if (c.solution) return html`${q}<div class="sortsol">${s.categories.map((cat, ci) => html`<div class="card sortgrp anim" style="--i:${ci + 1}"><span class="chip big">${cat.name}</span><div class="sortpool">${cat.items.map((text) => html`<span class="sortcard">${text}</span>`)}</div></div>`)}</div>${srcLine(s.source)}`;
    // Begriffe gemischt zeigen – in der Reihenfolge der Kategorien wäre die Lösung schon abzulesen
    return html`${q}<div class="sortcats anim">${s.categories.map((cat) => html`<span class="chip big">${cat.name}</span>`)}</div><div class="sortpool">${shuffled(flat, `beamer${s.id}`).map((it, i) => html`<span class="sortcard anim" style="--i:${i}">${it.text}</span>`)}</div>${srcLine(s.source)}`;
  },
  student(d, c) {
    const n = d.items.length, st = c.local.sort || (c.local.sort = d.mine ? d.mine.slice() : Array(n).fill(null));
    let cnt = 0, ok = 0;
    const two = n >= 6 && d.categories.join('').length <= 26;
    const rows = d.items.map((it, j) => {
      const a = st[it.i], done = a !== null && a !== undefined;
      if (done) { cnt++; if (a === it.cat) ok++; }
      return html`<div class="item anim ${done ? (a === it.cat ? 'ok' : 'no') : ''}" style="--i:${j + 1}"><span class="inr">${done ? ic(a === it.cat ? 'check' : 'x') : j + 1}</span><div class="tx">${it.text}</div><div class="choices">${d.categories.map((cat, k) => {
        const pick = done && a === k;
        return html`<button class="choice${pick ? (k === it.cat ? ' good' : ' bad') : ''}${done && !pick && k === it.cat ? ' right' : ''}" ${done ? 'disabled' : ''} data-action="t:place" data-i="${it.i}" data-k="${k}">${cat}</button>`;
      })}</div></div>`;
    });
    return html`<div class="qbox anim">${md(d.question)}</div><div class="items${two ? ' two' : ''}">${rows}</div>${cnt === n ? scoreBox(ok, n) : ''}${srcLine(d.source)}`;
  },
  studentActions: { place(el, c) { const st = c.local.sort, i = +el.dataset.i; if (st[i] !== null && st[i] !== undefined) return; st[i] = +el.dataset.k; c.render(); c.submit({ answers: st }); } },
};

function formChips(f) {
  const out = [], t = String(f || '');
  if (/allein/i.test(t)) out.push(html`<span class="chip">${ic('user')}allein</span>`);
  if (/dann/i.test(t) && out.length) out.push(html`<span class="arr">${ic('arrow')}</span>`);
  if (/zu zweit|partner/i.test(t)) out.push(html`<span class="chip">${ic('users')}zu zweit</span>`);
  if (/gruppe/i.test(t)) out.push(html`<span class="chip">${ic('users')}in der Gruppe</span>`);
  if (/heft/i.test(t)) out.push(html`<span class="chip">${ic('notebook')}ins Heft</span>`);
  if (!out.length && t) out.push(html`<span class="chip">${t}</span>`);
  return out;
}
function taskBody(s, c) {
  const n = s.tasks.length, nx = c.next;
  return html`<div class="bookhead anim"><span class="bk-ic">${ic('notebook')}</span><div><div class="bk-k">Arbeitsauftrag</div>${s.pages ? html`<div class="bk-p">${s.pages}</div>` : ''}</div></div>
    <div class="grid">${s.tasks.map((t, i) => html`<div class="card task anim" style="--i:${i + 1}"><div class="t-head">${t.label ? html`<span class="ue">${t.label}</span>` : ''}${t.page ? html`<span class="t-p">${t.page}</span>` : ''}<span class="chips">${formChips(t.form)}</span></div>${richLines(t.text, true)}</div>`)}</div>
    ${s.note ? html`<div class="hint anim" style="--i:${n + 1}">${ic('bulb')}<span>${s.note}</span></div>` : ''}
    ${nx ? html`<div class="next anim" style="--i:${n + 2}">${ic('arrow')}<span>${nx.type === 'gap' ? 'Danach vergleicht ihr eure Lösungen auf der nächsten Folie' : 'Danach geht es hier weiter'}: <b>${nx.title}</b></span></div>` : ''}`;
}
export const task = {
  host: taskBody,
  student(d, c) {
    const done = c.local.done ?? d.mine;
    return html`${taskBody(d, c)}${done ? fb(true, `Erledigt. ${c.p.sync ? 'Warte, bis es vorne weitergeht.' : 'Weiter geht es mit „Weiter“.'}`) : html`<button class="btn primary big" data-action="t:done">${ic('check')}Ich bin fertig</button>`}`;
  },
  studentActions: { done(el, c) { c.local.done = true; c.render(); c.submit({ done: true }); } },
};
