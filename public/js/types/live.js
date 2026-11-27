// Darstellung: Umfrage (inkl. Split, y-Achse kürzen), Skala, Wortwolke, offene Antworten
import { html, raw, md, fmt } from '../core/dom.js';
import { CHART_COLORS } from '/shared/palette.js';
import { ic } from '../core/icons.js';
import { scaleBefore } from '/shared/types/live.js';
import { fb, ring, seg, srcLine } from '../core/parts.js';
import { svgBar, svgHBar, svgPie } from '../charts.js';
import { cloudSvg, snapCloud, flipCloud } from '../wordcloud.js';

// Zweite Datenreihe (Vergleichswerte, Frage A): kräftige Kontrastfarbe statt Grau – Orange, bei warmen Abschnittsfarben Blau
const cmpColor = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '')); if (!m) return '#f97316'; const r = parseInt(m[1], 16), b = parseInt(m[3], 16); return r > 150 && r > b ? '#2563eb' : '#f97316'; };

const setAction = { set(el, c) { const k = el.dataset.k, v = el.dataset.v; c.prefs[k] = v === 'toggle' ? !c.prefs[k] : v; c.render(); } };
const discussion = (s, i = 4) => (s.discussion ? html`<div class="hint anim" style="--i:${i}">${ic('chat')}<span>${s.discussion}</span></div>` : '');

export const poll = {
  host(s, c) {
    const v = c.prefs; if (!v.type) v.type = s.multi ? 'hbar' : 'bar';
    const a = c.agg || { counts: {}, n: 0 }, A = a.A || { counts: {}, n: 0 }, B = a.B || { counts: {}, n: 0 };
    // Druck (PDF) ohne Ergebnisse: Frage und Antwortmöglichkeiten als Liste statt eines leeren Diagramms
    if (c.print && !c.results) {
      const qs = s.splitA ? html`<div class="grid2">${[[s.splitLabelA || 'Frage A', s.splitA], [s.splitLabelB || 'Frage B', s.splitB]].map(([lab, q], j) => html`<div class="card qcmp" style="--qc:${j ? c.sec.c : cmpColor(c.sec.c)}"><div class="qlab">${lab}</div><p>„${q}“</p></div>`)}</div>` : html`<div class="qbox anim">${md(s.question || s.title)}</div>`;
      return html`${qs}${s.hint ? html`<div class="tip anim">${ic('vote')}<span>${s.hint}</span></div>` : ''}
        <div class="opts printopts">${s.options.map((o, i) => html`<div class="opt static"><span class="bd pbox${s.multi ? '' : ' round'}"></span><span class="ot">${o}</span></div>`)}</div>
        ${s.multi && !s.hint ? html`<div class="note">${ic('vote')}<span>Mehrfachnennung möglich.</span></div>` : ''}${discussion(s)}`;
    }
    if (c.print && c.results && s.splitA && a.n > 0) v.reveal = true; // beide Fragevarianten nebeneinander zeigen
    const cnt = s.options.map((_, i) => a.counts[i] || 0), base = a.n, canPct = base > 0, rev = !!s.splitA && !!v.reveal && canPct;
    const usePct = (v.pct || v.cmp || rev) && canPct, vals = usePct ? cnt.map((x) => Math.round((x / base) * 1000) / 10) : cnt;
    const pctOf = (X, i) => (X.n ? Math.round(((X.counts[i] || 0) / X.n) * 1000) / 10 : 0);
    let type = v.type; if (s.multi && type === 'pie') type = 'hbar'; if (rev && type === 'pie') type = 'bar';
    let series = [{ name: 'Unsere Klasse', values: vals, color: c.sec.c }];
    if (rev) series = [{ name: `${s.splitLabelA || 'Frage A'} · ${A.n} Befragte`, values: s.options.map((_, i) => pctOf(A, i)), color: cmpColor(c.sec.c) }, { name: `${s.splitLabelB || 'Frage B'} · ${B.n} Befragte`, values: s.options.map((_, i) => pctOf(B, i)), color: c.sec.c }];
    else if (s.compareValues && v.cmp && canPct) series.push({ name: s.compareName || 'Vergleich', values: s.compareValues, color: cmpColor(c.sec.c) });
    if (series.length === 1) series[0].colors = s.options.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    const canCut = type === 'bar' && canPct; let ymin;
    if (canCut && v.cut) { const all = series.flatMap((x) => x.values), pos = all.filter((x) => x > 0), lo = pos.length ? Math.min(...pos) : 0, hi = Math.max(...all); if (hi > lo && lo > 0) ymin = lo >= 4 ? Math.floor(lo * 0.75) : +(lo * 0.75).toFixed(1); }
    const unit = usePct ? ' %' : '';
    const ml = Math.min(230, Math.max(110, 8 * Math.max(...s.options.map((o) => o.length)) + 24));
    const chart = type === 'pie' ? svgPie({ key: 'v-pie', labels: s.options, values: cnt, center: base === 1 ? 'Stimme' : 'Stimmen' })
      : type === 'hbar' ? svgHBar({ key: 'v-hbar', labels: s.options, series, unit, xmax: usePct ? 100 : undefined, ml })
        : svgBar({ key: 'v-bar', labels: s.options, series, unit, ymin, ymax: usePct && ymin === undefined ? 100 : undefined, int: !usePct });
    const sb = (k, l, i, dis) => html`<button class="${type === k ? 'on' : ''}" ${dis ? 'disabled title="Hier nicht möglich"' : ''} data-action="t:set" data-k="type" data-v="${k}">${ic(i)}${l}</button>`;
    const tg = (on, dis, k, l, cls) => html`<button class="tgl${on ? ' on' : ''}${cls ? ' ' + cls : ''}" ${dis ? 'disabled' : ''} data-action="t:set" data-k="${k}" data-v="toggle"><i></i>${l}</button>`;
    const left = html`<div class="toolbar">${c.joinUrl ? html`<button class="joinhint" data-action="join">${ic('wifi')}${c.joinUrl}</button>` : ''}<div class="segctl">${sb('bar', 'Säulen', 'bars')}${sb('hbar', 'Balken', 'hbars')}${sb('pie', 'Kreis', 'pie', s.multi || rev)}</div>
      ${tg(usePct, !canPct || rev, 'pct', 'in Prozent')}${s.compareValues ? tg(v.cmp, !canPct, 'cmp', s.compareName ? `Vergleich: ${s.compareName}` : 'Vergleich') : ''}${type === 'bar' ? tg(v.cut && canCut, !canCut, 'cut', 'y-Achse kürzen', 'red') : ''}${s.splitA ? tg(rev, !canPct, 'reveal', 'Gruppen vergleichen') : ''}</div>
      <div class="chartbox anim"><h4>${s.question || s.title}<span class="unit">${usePct ? (rev ? 'Angaben in % der jeweiligen Gruppe' : 'Angaben in %') : 'Anzahl der Stimmen'}</span>${ymin !== undefined ? html`<span class="unit cut">y-Achse beginnt bei ${fmt(ymin)}!</span>` : ''}</h4>${raw(chart)}
      <div class="src">Quelle: Abstimmung in unserer Klasse, ${(c.date ? new Date(c.date) : new Date()).toLocaleDateString('de-AT')}${s.multi ? ', Mehrfachnennung möglich' : ''}, ${base} Befragte.${rev ? ' Zwei Gruppen mit unterschiedlicher Fragestellung.' : ''}${s.compareValues && v.cmp && s.compareSource ? ` Vergleich: ${s.compareSource}` : ''}</div></div>`;
    let right = html`<div class="card part anim" style="--i:1">${ring(c.online ? base / c.online : base ? 1 : 0, `vt:${s.id}`, 78)}<div><div class="part-n">${base}<small> von ${c.online}</small></div><div class="part-l">haben abgestimmt</div></div></div>`;
    if (rev) right = html`${right}${[['A', s.splitA, A, cmpColor(c.sec.c), s.splitLabelA || 'Frage A'], ['B', s.splitB, B, c.sec.c, s.splitLabelB || 'Frage B']].map(([g, q, X, col, lab], j) => html`<div class="card qcmp anim" style="--i:${2 + j};--qc:${col}"><div class="qlab">${lab} · ${X.n} Befragte</div><p>„${q}“</p></div>`)}`;
    else if (s.hint) right = html`${right}<div class="note anim" style="--i:2">${ic('vote')}<span>${s.hint}</span></div>`;
    if (s.multi) right = html`${right}<div class="note anim" style="--i:3">${ic('pie')}<span>Bei Mehrfachnennungen ergeben die Anteile zusammen mehr als 100 %. Deshalb ist hier kein Kreisdiagramm möglich.</span></div>`;
    if (!s.splitA || rev) right = html`${right}${discussion(s)}`;
    return html`<div class="grid2" style="grid-template-columns:1.55fr 1fr"><div>${left}</div><div>${right}<div class="bar"><button class="btn" data-action="reset">${ic('refresh')}Abstimmung zurücksetzen</button></div></div></div>`;
  },
  hostActions: setAction,
  student(d, c) {
    const sel = c.local.sel || (c.local.sel = d.mine ? d.mine.slice() : []), sent = c.local.sent ?? !!d.mine;
    return html`${d.question ? html`<div class="qbox anim">${md(d.question)}</div>` : ''}${d.hint ? html`<div class="tip anim">${ic('vote')}<span>${d.hint}</span></div>` : ''}
      <div class="vopts">${d.options.map((o, i) => { const on = sel.includes(i); return html`<button class="vopt anim${on ? ' sel' : ''}${d.multi ? ' multi' : ''}" style="--i:${i + 1}" data-action="t:vote" data-i="${i}"><span class="vk">${on ? ic('check') : ''}</span><span>${o}</span></button>`; })}</div>
      ${d.multi ? html`<button class="btn primary big" ${sel.length ? '' : 'disabled'} data-action="t:send">${ic('send')}${sent ? 'Auswahl ändern und neu abschicken' : 'Abschicken'}</button>` : ''}
      ${sent ? fb(true, `Deine Stimme ist gezählt. Das Ergebnis siehst du vorne.${c.canChange ? ' Du kannst deine Auswahl noch ändern.' : ''}`) : ''}`;
  },
  studentActions: {
    vote(el, c) { const i = +el.dataset.i, d = c.p.data; if (d.multi) { const s = c.local.sel; const k = s.indexOf(i); k >= 0 ? s.splice(k, 1) : s.push(i); c.local.sent = false; c.render(); } else { c.local.sel = [i]; c.local.sent = true; c.render(); c.submit({ choices: [i] }); } },
    send(el, c) { if (!c.local.sel.length) return; c.local.sent = true; c.render(); c.submit({ choices: c.local.sel }); },
  },
};

const stepColor = (k, steps) => `color-mix(in srgb, var(--c) ${Math.round(18 + (82 * k) / Math.max(1, steps - 1))}%, #ffffff)`;
export const scale = {
  host(s, c) {
    const a = c.agg || { items: [], students: 0 };
    // Druck (PDF) ohne Ergebnisse: Aussagen mit leerer Skala zum Ankreuzen
    if (c.print && !c.results) {
      return html`${s.question ? html`<div class="qbox anim">${md(s.question)}</div>` : ''}<div class="esum sr-sum"><span></span><span class="sr-key"><b>1</b> = ${s.minLabel}<i>…</i><b>${s.steps}</b> = ${s.maxLabel}</span></div>
        <div class="scalerows">${s.statements.map((st) => html`<div class="scalerow card"><div class="sr-h"><span class="sr-t">${st}</span></div><div class="sr-boxes">${Array.from({ length: s.steps }, (_, k) => html`<span class="sr-box">${k + 1}</span>`)}</div></div>`)}</div>${discussion(s, s.statements.length + 2)}`;
    }
    const keyHtml = html`<span class="sr-key"><b>1</b> = ${s.minLabel}<i>…</i><b>${s.steps}</b> = ${s.maxLabel}</span>`;
    // Noch keine Antworten: die Aussagen groß zum Vorlesen, die Auswertung erscheint mit der ersten Antwort
    if (!a.students) {
      return html`${s.question ? html`<div class="qbox anim">${md(s.question)}</div>` : ''}<ol class="scwait${s.statements.length >= 4 ? ' two' : ''}">${s.statements.map((st, i) => html`<li class="card anim" style="--i:${i + 1}"><span class="scn">${i + 1}</span><span>${st}</span></li>`)}</ol>
        <div class="scwait-f anim" style="--i:${s.statements.length + 1}">${keyHtml}<span class="scwait-t">${ic('clock')}Wartet auf Antworten …</span></div>${discussion(s, s.statements.length + 2)}`;
    }
    // Vorher/Nachher: frühere Skala derselben Lektion mit gleichen Aussagen
    const before = c.lesson && c.aggOf ? scaleBefore(c.lesson, s) : null, ba = before ? c.aggOf(before.slideId) : null;
    const prevOf = (i) => { const k = before && ba && ba.items ? before.map[i] : -1, it = k >= 0 ? ba.items[k] : null; return it && it.n ? it.mean : null; };
    const pos = (m) => (((m - 0.5) / s.steps) * 100).toFixed(1); // Mitte der Säule von Stufe m
    const rows = s.statements.map((st, i) => {
      const x = a.items[i] || { counts: {}, n: 0, mean: null }, m = x.mean, pm = prevOf(i), max = Math.max(1, ...Object.values(x.counts));
      const d = m != null && pm != null ? m - pm : null;
      return html`<div class="scrow card anim" style="--i:${i + 1}"><div class="sc-t">${st}</div>
        <div class="sc-chart"><div class="sc-cols">${Array.from({ length: s.steps }, (_, k) => { const n = x.counts[k + 1] || 0; return html`<div class="sc-col"><b class="sc-v">${n || ''}</b><i class="sc-bar${n ? '' : ' zero'}" style="height:${n ? Math.max(6, (n / max) * 100).toFixed(1) : 0}%;background:${stepColor(k, s.steps)}"></i></div>`; })}</div>
          <div class="sc-ks">${Array.from({ length: s.steps }, (_, k) => html`<span>${k + 1}</span>`)}${pm != null ? html`<i class="sc-mark prev" style="left:${pos(pm)}%" title="vorher"></i>` : ''}${m != null ? html`<i class="sc-mark" style="left:${pos(m)}%"></i>` : ''}</div></div>
        <div class="sc-mean"><span class="sc-m"><small>Ø</small>${m == null ? '–' : fmt(m)}</span><span class="sc-n">n = ${x.n}</span>
          ${d != null ? html`<span class="sc-d${Math.abs(d) < 0.05 ? ' same' : ''}">${Math.abs(d) < 0.05 ? '= gleich' : `${d > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(d))}`}<small>vorher ${fmt(pm)}</small></span>` : ''}</div></div>`;
    });
    const cmp = before && ba && ba.students ? html`<span class="sc-cmp">${ic('refresh')}Vergleich mit Folie ${before.index + 1}</span>` : '';
    // Die Bedeutung der Skala steht einmal oben statt unter jeder Aussage – so bleibt mehr Platz für große Schrift
    return html`${s.question ? html`<div class="qbox anim">${md(s.question)}</div>` : ''}<div class="esum sr-sum anim"><span>${cmp}</span>${keyHtml}</div><div class="scrows${s.statements.length >= 4 ? ' two' : ''}">${rows}</div>${discussion(s, s.statements.length + 2)}`;
  },
  student(d, c) {
    const vals = c.local.vals || (c.local.vals = d.mine ? d.mine.slice() : d.statements.map(() => null));
    return html`${d.question ? html`<div class="qbox anim">${md(d.question)}</div>` : ''}${d.statements.map((st, i) => html`<div class="card scale-q anim" style="--i:${i + 1}"><p class="sq-t">${st}</p>
      <div class="sq-btns" role="radiogroup">${Array.from({ length: d.steps }, (_, k) => html`<button class="sq-b${vals[i] === k + 1 ? ' on' : ''}" role="radio" aria-checked="${vals[i] === k + 1}" data-action="t:rate" data-i="${i}" data-v="${k + 1}" style="--sc:${stepColor(k, d.steps)}">${k + 1}</button>`)}</div>
      <div class="sr-lab"><span>${d.minLabel}</span><span>${d.maxLabel}</span></div></div>`)}
      ${vals.some((v) => v !== null) ? fb(true, `Gespeichert.${c.canChange ? ' Du kannst deine Bewertung noch ändern.' : ''}`) : ''}`;
  },
  studentActions: { rate(el, c) { c.local.vals[+el.dataset.i] = +el.dataset.v; c.render(); c.submit({ values: c.local.vals }); } },
};

// Moderation (Wortwolke & offene Antworten): Liste nur aufgeklappt sichtbar
function modBar(s, a, kind, visibleCount, pending) {
  return html`<div class="modbar anim"><span>${a.students} ${a.students === 1 ? 'Person' : 'Personen'} · ${visibleCount} ${kind} sichtbar${pending ? ` · ${pending} zurückgehalten/ausgeblendet` : ''}</span>
    <span class="modbtns">${s.approval ? html`<button class="btn" data-action="moderate" data-mod="${a.showAll ? 'hideAll' : 'showAll'}">${ic(a.showAll ? 'eyeoff' : 'eye')}${a.showAll ? 'Freigabe zurücknehmen' : 'Alle freigeben'}</button>` : ''}<button class="btn" data-action="t:set" data-k="mod" data-v="toggle">${ic('settings')}Moderation${pending ? ` (${pending})` : ''}</button></span></div>`;
}
const modItem = (key, text, x) => html`<button class="modchip${x.visible ? ' vis' : ''}${x.flagged ? ' flag' : ''}" data-action="moderate" data-mod="${x.visible ? 'hide' : 'show'}" data-key="${key}" title="${x.visible ? 'Ausblenden' : 'Anzeigen'}">${ic(x.flagged ? 'alert' : x.visible ? 'eye' : 'eyeoff')}${text}${x.n > 1 ? html` <small>${x.n}×</small>` : ''}</button>`;

export const wordcloud = {
  host(s, c) {
    const a = c.agg || { words: [], students: 0 }, vis = a.words.filter((w) => w.visible), pending = a.words.length - vis.length;
    if (c.print && !vis.length) return html`<div class="qbox anim">${md(s.question)}</div><div class="printbox"></div>${discussion(s, 3)}`; // Druck ohne Begriffe: Platz zum Sammeln
    return html`<div class="qbox anim">${md(s.question)}</div><div class="cloudbox anim">${raw(cloudSvg(vis))}</div>${modBar(s, a, 'Begriffe', vis.length, pending)}
      ${c.prefs.mod ? html`<div class="modlist anim">${a.words.length ? a.words.map((w) => modItem(w.key, w.text, w)) : html`<span class="muted">Noch keine Begriffe.</span>`}</div>` : discussion(s, 3)}`;
  },
  hostActions: setAction,
  snap: (root) => snapCloud(root),
  flip: (root, prev) => flipCloud(root, prev),
  student(d, c) {
    const words = c.local.words || (c.local.words = Array.from({ length: d.maxWords }, (_, i) => (d.mine || [])[i] || ''));
    const sent = c.local.sent ?? !!d.mine;
    return html`<div class="qbox anim">${md(d.question)}</div><form class="card wordform anim" data-action="t:send">${words.map((w, i) => html`<input class="field" name="w${i}" value="${w}" maxlength="25" autocomplete="off" placeholder="Begriff ${i + 1}" aria-label="Begriff ${i + 1}">`)}
      <button class="btn primary big">${ic('send')}${sent ? 'Begriffe ändern' : 'Abschicken'}</button></form>${sent ? fb(true, `Danke! Deine Begriffe sind in der Wolke.${c.canChange ? ' Du kannst sie noch ändern.' : ''}`) : ''}`;
  },
  studentActions: { send(el, c) { const words = [...el.querySelectorAll('input')].map((x) => x.value.trim()); c.local.words = words; if (!words.some(Boolean)) return; c.local.sent = true; c.render(); c.submit({ words: words.filter(Boolean) }); } },
};

export const open = {
  host(s, c) {
    const a = c.agg || { items: [], students: 0 }, vis = a.items.filter((x) => x.visible), pending = a.items.length - vis.length;
    if (c.print && !vis.length) return html`<div class="qbox anim">${md(s.question)}</div><div class="printbox lines"></div>${discussion(s, 3)}`; // Druck ohne Antworten: Schreiblinien
    return html`<div class="qbox anim">${md(s.question)}</div>
      <div class="wall anim">${vis.length ? vis.map((x, i) => html`<div class="wcard" style="--i:${i % 12}">${x.text}</div>`) : html`<div class="wall-empty">${a.items.length ? 'Antworten sind eingegangen – sie erscheinen nach der Freigabe.' : 'Noch keine Antworten.'}</div>`}</div>
      ${modBar(s, a, 'Antworten', vis.length, pending)}${c.prefs.mod ? html`<div class="modlist anim">${a.items.map((x) => modItem(x.id, x.text, x))}</div>` : discussion(s, 3)}`;
  },
  hostActions: setAction,
  student(d, c) {
    const mine = c.local.mine || d.mine || [], full = mine.length >= d.maxAnswers && d.maxAnswers > 1;
    return html`<div class="qbox anim">${md(d.question)}</div>${full ? '' : html`<form class="card wordform anim" data-action="t:send"><textarea class="field" name="t" maxlength="${d.maxLength}" rows="3" placeholder="Deine Antwort …" aria-label="Deine Antwort">${d.maxAnswers === 1 && mine[0] ? mine[0] : ''}</textarea>
      <div class="formrow"><small class="muted">${d.maxAnswers > 1 ? `Antwort ${mine.length + 1} von ${d.maxAnswers}` : c.canChange ? 'Du kannst deine Antwort noch ändern.' : ''}</small><button class="btn primary">${ic('send')}Senden</button></div></form>`}
      ${mine.length ? html`<div class="mine anim"><h4>Deine Antworten</h4>${mine.map((t) => html`<div class="wcard small">${t}</div>`)}</div>` : ''}`;
  },
  studentActions: { async send(el, c) { const t = el.querySelector('textarea').value.trim(); if (!t) return; const r = await c.submit({ text: t }); if (r && r.ok) { c.local.mine = r.mine; c.render(); } } },
};

export { srcLine };
