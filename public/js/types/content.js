// Darstellung: Titel, Info, Lückentext, Labor, Zusammenfassung, Quellen
import { html, raw, md, richLines, fmt } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { chartBox, withChart, srcLine, colorOf, themeCols, gfxHtml, isPhoto } from '../core/parts.js';
import { svgBar } from '../charts.js';
import { CHART_COLORS } from '/shared/palette.js';

// Titelbild-Motive (weiß auf der Farbfläche, in Akzentfarben beim Aufbau „zentriert“)
function heroArt(kind = 'chart') {
  const svg = (body) => raw(`<svg class="hero-art" viewBox="0 0 300 170" aria-hidden="true">${body}</svg>`);
  if (kind === 'none') return '';
  if (kind === 'bubbles') return svg('<path class="ha-p" style="--i:0" d="M30 14h132a18 18 0 0 1 18 18v42a18 18 0 0 1-18 18H86l-28 22 7-22H30a18 18 0 0 1-18-18V32a18 18 0 0 1 18-18z"/>'
    + [0, 1, 2].map((k) => `<circle class="ha-p2" style="--i:${k + 1}" cx="${62 + k * 32}" cy="53" r="9"/>`).join('')
    + '<path class="ha-p2" style="--i:4" d="M132 70h138a18 18 0 0 1 18 18v42a18 18 0 0 1-18 18h-20l8 20-30-20h-96a18 18 0 0 1-18-18V88a18 18 0 0 1 18-18z"/>'
    + [[150, 30], [180, 50], [210, 38]].map(([x, h], k) => `<rect class="ha-ac" style="--i:${k + 5}" x="${x}" y="${134 - h}" width="22" height="${h}" rx="5"/>`).join(''));
  if (kind === 'shapes') return svg('<circle class="ha-s1" style="--i:0" cx="78" cy="78" r="58"/><rect class="ha-s2" style="--i:1" x="146" y="22" width="92" height="92" rx="22" transform="rotate(12 192 68)"/><path class="ha-s3" style="--i:2" d="M196 160l46-80 46 80z"/><circle class="ha-s4" style="--i:3" cx="150" cy="138" r="18"/><circle class="ha-s4" style="--i:4" cx="40" cy="150" r="8"/>');
  if (kind === 'waves') return svg([[40, 'ha-w'], [80, 'ha-w2'], [120, 'ha-w3']].map(([y, c], k) => `<path class="${c}" style="--i:${k}" pathLength="1" d="M8 ${y} C58 ${y - 34} 98 ${y + 34} 150 ${y} S242 ${y - 34} 292 ${y}"/>`).join('') + '<circle class="ha-s4" style="--i:3" cx="232" cy="28" r="12"/>');
  if (kind === 'dots') {
    const on = new Set([3, 12, 13, 20, 21, 22, 29, 30, 31, 38]);
    let s = '';
    for (let r = 0; r < 5; r++) for (let q = 0; q < 9; q++) { const n = r * 9 + q; s += `<circle class="ha-g${on.has(n) ? ' on' : ''}" style="--i:${n}" cx="${22 + q * 32}" cy="${22 + r * 32}" r="${on.has(n) ? 10 : 7}"/>`; }
    return svg(s);
  }
  const v = [34, 50, 44, 66, 60, 86], X = (i) => 22 + i * 46, Y = (h) => 150 - h * 1.3;
  return svg(`${v.map((h, i) => `<rect class="ha-b${i === v.length - 1 ? ' hi' : ''}" style="--i:${i}" x="${X(i)}" y="${Y(h)}" width="30" height="${150 - Y(h)}" rx="6"/>`).join('')}<line class="ha-a" x1="10" x2="290" y1="150" y2="150"/><polyline class="ha-l" pathLength="1" points="${v.map((h, i) => `${X(i) + 15},${Y(h) - 16}`).join(' ')}"/>${v.map((h, i) => `<circle class="ha-d" style="--i:${i}" cx="${X(i) + 15}" cy="${Y(h) - 16}" r="5"/>`).join('')}`);
}
// Titel-Kopf: Aufbau (Farbfläche, geteilt, zentriert) mit Motiv oder Grafik
function heroHtml({ kicker, title: t, subtitle, art, layout, graphic, mediaUrl, join, small }) {
  const lay = layout === 'split' || layout === 'center' ? layout : 'card';
  const vis = graphic && graphic.src ? gfxHtml(graphic, mediaUrl) : heroArt(art);
  const visHtml = vis ? html`<div class="hero-vis${isPhoto(graphic) ? ' photo' : ''}">${vis}</div>` : '';
  return html`<div class="hero anim lay-${lay}${vis ? '' : ' no-vis'}${small ? ' small' : ''}"><div class="hero-txt">${kicker ? html`<div class="hero-k">${kicker}</div>` : ''}<h1>${t}</h1>${subtitle ? html`<p>${subtitle}</p>` : ''}${join || ''}</div>${small && lay === 'card' ? '' : visHtml}</div>`;
}
const findSec = (lesson, name) => lesson.sections.find((x) => x.name.toLowerCase() === String(name || '').toLowerCase());

export const title = {
  host(s, c) {
    const kicker = s.kicker || [c.lesson.subject, c.lesson.grade].filter(Boolean).join(' · ');
    const join = c.joinUrl ? html`<button class="joinpill" data-action="join">${ic('wifi')}Mitmachen: <b>${c.joinUrl}</b>${ic('qr')}</button>` : '';
    return html`${heroHtml({ kicker, title: s.title, subtitle: s.subtitle, art: s.art, layout: s.layout, graphic: s.graphic, mediaUrl: c.mediaUrl, join })}
      ${(s.topics || []).length ? html`<div class="tiles">${s.topics.map((t, i) => { const sec = findSec(c.lesson, t.section); const col = themeCols(colorOf(sec ? sec.color : c.sec.color), c.theme);
        return html`<button class="tile anim" style="--i:${i + 2};--tc:${col.c};--ts:${col.s}" data-action="t:goto" data-sec="${sec ? sec.id : ''}"><span class="tile-ic">${ic(sec ? sec.icon : 'star')}</span><span class="tile-b"><span class="tile-n">${String(i + 1).padStart(2, '0')}</span><span class="tile-t">${t.text}</span></span></button>`; })}</div>` : ''}`;
  },
  hostActions: { goto(el, c) { const sid = el.dataset.sec; const first = c.lesson.slides.find((x) => x.section === sid); if (first) c.goto(first.id); } },
  student(d, c) {
    return html`${heroHtml({ kicker: d.kicker, title: d.title, subtitle: d.subtitle, art: d.art, layout: d.layout, graphic: c && c.p ? c.p.graphic : null, small: true })}
      ${(d.topics || []).length ? html`<ol class="toclist">${d.topics.map((t, i) => html`<li class="anim" style="--i:${i + 1}"><span>${String(i + 1).padStart(2, '0')}</span>${t}</li>`)}</ol>` : ''}`;
  },
};

function infoCard(k, i) {
  const mm = k.title.match(/^(\d+)\s*·\s*(.+)$/), t = mm ? mm[2] : k.title, call = /^(Merke|Regel|Achtung|Wichtig|Tipp|Was heißt das)/i.test(t);
  return html`<div class="card info anim${call ? ' callout' : ''}" style="--i:${i}"><div class="ihead">${call ? html`<span class="inum ico">${ic(/^Achtung/i.test(t) ? 'alert' : 'bulb')}</span>` : html`<span class="inum">${mm ? mm[1] : String(i + 1).padStart(2, '0')}</span>`}<h3>${t}</h3></div>${richLines(k.text)}</div>`;
}
const infoBody = (s, key) => withChart(s.chart, key, html`<div class="grid${s.chart ? ' one' : ''}">${(s.cards || []).map(infoCard)}</div>`, s.source);
export const info = { host: (s, c) => infoBody(s, c.key), student: (d, c) => infoBody(d, c.key) };

function gapBody(s, local, key) {
  const st = local.gap || (local.gap = {}), seen = local.seen || (local.seen = {});
  let i = -1;
  const parts = String(s.text || '').split(/(\[\[[^\]]+\]\])/g).map((part) => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/);
    if (!m) return md(part);
    i++;
    const sol = m[1].split('|').map((x) => x.trim()).filter(Boolean).join(' / ');
    if (!(st.all || st[i])) return html`<button class="gap" data-action="t:reveal" data-i="${i}" aria-label="Lösung zeigen">?</button>`;
    const nw = !seen[i]; seen[i] = 1;
    return html`<span class="gap open${nw ? ' new' : ''}">${sol}</span>`;
  });
  return withChart(s.chart, key, html`${s.tip ? html`<div class="tip anim">${ic('bulb')}<span>${s.tip}</span></div>` : ''}<div class="filltext anim" style="--i:1">${parts}</div><div class="bar"><button class="btn" data-action="t:revealAll">${ic('eye')}Alle Lösungen zeigen</button></div>`, s.source);
}
const gapActions = { reveal(el, c) { (c.local.gap || (c.local.gap = {}))[el.dataset.i] = true; c.render(); }, revealAll(el, c) { (c.local.gap || (c.local.gap = {})).all = true; c.render(); } };
export const gap = { host: (s, c) => gapBody(s, c.local, c.key), student: (d, c) => gapBody(d, c.local, c.key), hostActions: gapActions, studentActions: gapActions };

export const lab = {
  host(s, c) {
    const ch = s.chart, L = Object.assign({ ymin: 0, from: 0, red: false }, c.local.lab || {});
    const labels = ch.labels.slice(L.from), vals = ch.series[0].values.slice(L.from);
    const a = vals[vals.length - 2], b = vals[vals.length - 1], real = a ? Math.round((b / a - 1) * 1000) / 10 : 0;
    const max = Math.max(...ch.series[0].values), minV = Math.min(...ch.series[0].values);
    const step = Math.max(1, Math.round(max / 50));
    const vis = a - L.ymin > 0 ? Math.round(((b - L.ymin) / (a - L.ymin)) * 10) / 10 : null, manip = L.ymin > 0 && vis;
    const chart = svgBar({ key: 'lab', labels, series: [{ name: ch.series[0].name, values: vals, color: L.red ? '#dc2626' : CHART_COLORS[0] }], unit: ch.unit ? ' ' + ch.unit : '', ymin: L.ymin, ymax: L.ymin > 0 ? Math.ceil(max * 1.04) : undefined });
    return html`<div class="grid2"><div><div class="chartbox anim">${ch.title ? html`<h4>${ch.title}</h4>` : ''}${raw(chart)}${srcLine(ch.source || s.source)}</div></div><div>
      <div class="card ctl anim" style="--i:1"><h3>${ic('eye')}Stellt das Diagramm ein</h3>
        <label for="lab_ymin">y-Achse beginnt bei <b>${fmt(L.ymin)}</b></label><input id="lab_ymin" type="range" min="0" max="${Math.max(0, Math.floor(minV * 0.95))}" step="${step}" value="${L.ymin}" data-change="t:labSet" data-k="ymin">
        <label for="lab_from">Erster Wert <b>${labels[0]}</b></label><input id="lab_from" type="range" min="0" max="${Math.max(0, ch.labels.length - 2)}" step="1" value="${L.from}" data-change="t:labSet" data-k="from">
        <div class="bar"><button class="tgl${L.red ? ' on red' : ''}" data-action="t:labRed"><i></i>Alarmfarbe Rot</button><button class="btn" data-action="t:labReset">${ic('refresh')}Ehrliche Darstellung</button></div></div>
      ${vals.length >= 2 ? html`<div class="duo anim" style="--i:2"><div class="kpi"><small>Tatsächliche Veränderung ${labels[labels.length - 2]} → ${labels[labels.length - 1]}</small><b>${real > 0 ? '+' : ''}${fmt(real)} %</b></div><div class="kpi${manip ? ' alarm' : ''}"><small>So wirkt es im Diagramm</small><b>${manip ? `${fmt(vis)}-mal so hoch` : 'echtes Verhältnis'}</b></div></div>` : ''}
      ${s.task ? html`<div class="hint anim" style="--i:3">${ic('users')}<span>${s.task}</span></div>` : ''}</div></div>`;
  },
  hostActions: {
    labSet(el, c) { (c.local.lab || (c.local.lab = {}))[el.dataset.k] = +el.value; c.render(); const f = document.getElementById(el.id); if (f) f.focus(); },
    labRed(el, c) { const L = c.local.lab || (c.local.lab = {}); L.red = !L.red; c.render(); },
    labReset(el, c) { c.local.lab = {}; c.render(); },
  },
  student: (d) => html`<div class="card anim lookfront">${ic('monitor')}<div><h3>Schaut nach vorne</h3>${d.task ? html`<p>${d.task}</p>` : ''}</div></div>`,
};

export const summary = {
  host: (s, c) => html`<div class="sumgrid">${(s.items || []).map((it, i) => { const sec = findSec(c.lesson, it.section), col = themeCols(colorOf(sec ? sec.color : c.sec.color), c.theme);
    return html`<div class="sumtile anim" style="--i:${i};--tc:${col.c};--ts:${col.s}"><span class="tile-ic">${ic(it.icon)}</span><div><h3>${it.title}</h3><p>${it.text}</p></div></div>`; })}</div>`,
  student: (d, c) => html`<div class="sumgrid">${(d.items || []).map((it, i) => html`<div class="sumtile anim" style="--i:${i};--tc:${c.sec.c};--ts:${c.sec.s}"><span class="tile-ic">${ic(it.icon)}</span><div><h3>${it.title}</h3><p>${it.text}</p></div></div>`)}</div>`,
};

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const sourcesBody = (s) => html`${s.intro ? html`<p class="lead anim">${s.intro}</p>` : ''}<ol class="srclist">${(s.items || []).map((q, i) => html`<li class="anim" style="--i:${i + 1}"><span class="sn">${i + 1}</span><div><div class="st">${q.title}</div>${q.url ? html`<a href="${q.url}" target="_blank" rel="noopener noreferrer">${ic('globe')}${hostOf(q.url)}</a>` : ''}</div></li>`)}</ol>`;
export const sources = { host: sourcesBody, student: sourcesBody };
