// Darstellung: Titel, Info, Lückentext, Labor, Zusammenfassung, Quellen
import { html, raw, md, richLines, fmt } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { chartBox, withChart, srcLine, colorOf, themeCols, gfxHtml, isPhoto } from '../core/parts.js';
import { svgBar } from '../charts.js';
import { CHART_COLORS } from '/shared/palette.js';
import { gapAlts, videoInfo, fmtTime } from '/shared/types/content.js';
import { shuffled } from '/shared/types/common.js';
import { takeDrop } from '../core/drag.js';

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

// Video: am Beamer zuerst nur ein Startbild – erst der Klick lädt das Video (bei YouTube also erst dann eine Verbindung dorthin).
// Die Geräte der Klasse zeigen nur die Beobachtungsaufträge.
const videoSide = (s, i0 = 1) => html`${s.intro ? html`<div class="card vintro anim" style="--i:${i0}">${richLines(s.intro)}</div>` : ''}
  ${(s.tasks || []).length ? html`<div class="card vtasks anim" style="--i:${i0 + 1}"><div class="vt-h">${ic('eye')}Achte beim Video auf</div><ol>${s.tasks.map((t) => html`<li>${t}</li>`)}</ol></div>` : ''}
  ${s.discussion ? html`<div class="hint anim" style="--i:${i0 + 2}">${ic('chat')}<span>${s.discussion}</span></div>` : ''}`;
export const video = {
  host(s, c) {
    const v = videoInfo(s.url, s.start, s.end), playing = !!c.local.play && !c.print && (v.kind === 'youtube' || v.kind === 'file');
    const span = v.from || v.to > v.from ? ` · ${v.from ? `ab ${fmtTime(v.from)}` : ''}${v.to > v.from ? `${v.from ? ' ' : ''}bis ${fmtTime(v.to)}` : ''}` : '';
    const open = v.watch ? html`<a class="vopen" href="${v.watch}" target="_blank" rel="noopener">${ic('link')}Im Browser öffnen</a>` : '';
    let stage;
    if (v.kind === 'none') stage = html`<div class="vposter off"><div class="vp-ic">${ic('alert')}</div><div class="vp-t">Keine gültige Video-Adresse</div><div class="vp-s">Bitte im Editor einen Link eintragen, z. B. von YouTube.</div></div>`;
    else if (playing) stage = v.kind === 'youtube'
      ? html`<iframe class="vframe" src="${v.embed}&autoplay=1" title="${s.title}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe>`
      : html`<video class="vframe" src="${v.src}" controls autoplay playsinline></video>`;
    else if (c.print) stage = html`<div class="vposter"><div class="vp-ic">${ic('play')}</div><div class="vp-t">${v.host}${span}</div><div class="vp-s vurl">${v.watch}</div></div>`;
    else if (v.kind === 'link') stage = html`<div class="vposter"><div class="vp-ic">${ic('link')}</div><div class="vp-t">Video auf ${v.host}</div><div class="vp-s">Dieses Video lässt sich nicht einbetten.</div><a class="btn primary big" href="${v.watch}" target="_blank" rel="noopener">${ic('play')}Im Browser öffnen</a></div>`;
    else stage = html`<button class="vposter" data-action="t:play" aria-label="Video abspielen"><span class="vp-ic play">${ic('play')}</span><span class="vp-t">Video abspielen</span><span class="vp-s">${v.host}${span}${v.kind === 'youtube' ? ' · der Klick lädt das Video von YouTube' : ''}</span></button>`;
    const bar = c.print || v.kind === 'none' ? '' : html`<div class="vbar">${playing ? html`<button class="btn" data-action="t:stop">${ic('stop')}Video schließen</button>` : ''}${v.kind === 'link' ? '' : open}</div>`;
    const side = videoSide(s);
    const has = !!(s.intro || (s.tasks || []).length || s.discussion);
    return html`<div class="${has ? 'grid2 vgrid' : 'vsolo'}"><div class="vstage anim">${stage}${bar}</div>${has ? html`<div>${side}</div>` : ''}</div>${srcLine(s.source)}`;
  },
  hostActions: { play(el, c) { c.local.play = true; c.render(); }, stop(el, c) { c.local.play = false; c.render(); } },
  student: (d) => html`<div class="card anim lookfront">${ic('monitor')}<div><h3>Das Video läuft vorne</h3><p>Schau zum Beamer${(d.tasks || []).length ? ' und achte auf die Fragen unten' : ''}.</p></div></div>${videoSide(d, 1)}`,
};

const GAP_RE = /(\[\[[^\]]+\]\])/g, isGap = (part) => /^\[\[[^\]]+\]\]$/.test(part);
// Beamer: Lücken bleiben verdeckt, die Lehrkraft deckt zum Besprechen auf; darunter der Fortschritt der Klasse
function gapHost(s, c) {
  const st = c.local.gap || (c.local.gap = {}), seen = c.local.seen || (c.local.seen = {}), alts = gapAlts(s.text);
  let i = -1;
  const parts = String(s.text || '').split(GAP_RE).map((part) => {
    if (!isGap(part)) return md(part);
    i++;
    if (!(st.all || st[i])) return c.print ? html`<span class="gap blank"></span>` : html`<button class="gap" data-action="t:reveal" data-i="${i}" aria-label="Lösung zeigen">?</button>`;
    const nw = !seen[i]; seen[i] = 1;
    return html`<span class="gap open${nw ? ' new' : ''}">${(alts[i] || []).join(' / ')}</span>`;
  });
  // Druck ohne Lösungen: Wortkasten wie auf den Geräten (Lösungswörter und zusätzliche Wörter, gemischt)
  const bank = c.print && !st.all ? html`<div class="wordbank static anim">${shuffled([...alts.map((a) => a[0]), ...(s.extra || [])], `druck${s.id}`).map((w) => html`<span class="wchip">${w}</span>`)}</div>` : '';
  return withChart(s.chart, c.key, html`${s.tip ? html`<div class="tip anim">${ic('bulb')}<span>${s.tip}</span></div>` : ''}<div class="filltext anim" style="--i:1">${parts}</div>${bank}
    <div class="bar"><button class="btn" data-action="t:revealAll">${ic('eye')}Alle Lösungen zeigen</button><span class="gapprog muted">Die Klasse zieht die Wörter aus dem Wortkasten in die Lücken.</span></div>`, s.source);
}
const gapHostActions = { reveal(el, c) { (c.local.gap || (c.local.gap = {}))[el.dataset.i] = true; c.render(); }, revealAll(el, c) { (c.local.gap || (c.local.gap = {})).all = true; c.render(); } };

// Schülergerät: Wörter aus dem Wortkasten in die Lücken ziehen (oder Wort antippen, dann Lücke), danach prüfen.
// Zustand: place = Lücke → Wort-ID, ok = geprüft und richtig (fest), pick = angetipptes Wort, bad = eben falsch (für die Animation)
function gapState(d, local) {
  if (local.g) return local.g;
  const alts = gapAlts(d.text), g = local.g = { place: {}, ok: {}, pick: null, tries: 0, bad: {} };
  (d.mine || []).forEach((txt, i) => { // schon abgegebene richtige Wörter wiederherstellen
    if (txt == null || !alts[i] || !alts[i].includes(txt)) return;
    const used = new Set(Object.values(g.place)), chip = d.bank.find((x) => x.text === txt && !used.has(x.id));
    if (chip) { g.place[i] = chip.id; g.ok[i] = true; }
  });
  if (d.mine) g.tries = 1;
  return g;
}
function gapStudent(d, c) {
  const g = gapState(d, c.local), n = gapAlts(d.text).length, byId = new Map(d.bank.map((x) => [x.id, x]));
  const used = new Set(Object.values(g.place)), bad = g.bad, picking = g.pick !== null;
  g.bad = {};
  let i = -1, open = 0;
  const parts = String(d.text || '').split(GAP_RE).map((part) => {
    if (!isGap(part)) return md(part);
    i++;
    const chip = byId.get(g.place[i]);
    if (g.ok[i] && chip) return html`<span class="gap open">${chip.text}</span>`;
    if (chip) { open++; return html`<button class="gap filled" data-action="t:place" data-drop="1" data-drag="${chip.id}" data-i="${i}" title="Antippen legt das Wort zurück">${chip.text}</button>`; }
    return html`<button class="gap blank${bad[i] ? ' bad' : ''}${picking ? ' target' : ''}" data-action="t:place" data-drop="1" data-i="${i}" aria-label="Lücke ${i + 1}"></button>`;
  });
  const okN = Object.keys(g.ok).length, all = n > 0 && okN === n, rest = d.bank.filter((x) => !used.has(x.id));
  const bank = all ? '' : html`<div class="wordbank anim" data-drop="1" data-action="t:unplace" aria-label="Wortkasten">${rest.length
    ? rest.map((x) => html`<button class="wchip${g.pick === x.id ? ' on' : ''}" data-action="t:pick" data-drag="${x.id}" data-id="${x.id}">${x.text}</button>`)
    : html`<span class="muted">Alle Wörter sind eingesetzt – jetzt prüfen.</span>`}</div>`;
  const foot = all
    ? html`<div class="fb ok anim">${ic('check')}<span><b>Alles richtig!</b> ${g.tries > 1 ? `Geschafft in ${g.tries} Versuchen.` : 'Gleich beim ersten Versuch.'}</span></div>`
    : html`<div class="bar"><button class="btn primary" data-action="t:check" ${open ? '' : 'disabled'}>${ic('check')}Prüfen</button><span class="muted">${g.tries && Object.keys(bad).length ? 'Falsche Wörter sind zurück im Wortkasten – versuch es noch einmal.' : okN ? `${okN} von ${n} richtig` : open ? 'Fertig eingesetzt? Dann prüfen.' : 'Ziehe die Wörter in die Lücken.'}</span></div>`;
  return withChart(d.chart, c.key, html`${d.tip ? html`<div class="tip anim">${ic('bulb')}<span>${d.tip}</span></div>` : ''}${bank}<div class="filltext anim" style="--i:1">${parts}</div>${foot}`, d.source);
}
const gapFree = (g, id) => { for (const k of Object.keys(g.place)) if (String(g.place[k]) === String(id) && !g.ok[k]) delete g.place[k]; };
const gapStudentActions = {
  pick(el, c) { const g = c.local.g, id = +el.dataset.id; g.pick = g.pick === id ? null : id; c.render(); },
  place(el, c) {
    const g = c.local.g, i = +el.dataset.i, dv = takeDrop();
    if (g.ok[i]) return;
    const val = dv !== null ? +dv : g.pick;
    if (val === null || val === undefined) { if (g.place[i] !== undefined) { delete g.place[i]; c.render(); } return; } // antippen: Wort zurücklegen
    if (Object.keys(g.ok).some((k) => g.place[k] === val)) return; // dieses Wort sitzt schon fest
    gapFree(g, val);
    g.place[i] = val; g.pick = null; c.render();
  },
  unplace(el, c) { const dv = takeDrop(); if (dv === null) return; gapFree(c.local.g, dv); c.render(); },
  check(el, c) {
    const g = c.local.g, d = c.p.data, alts = gapAlts(d.text), byId = new Map(d.bank.map((x) => [x.id, x]));
    g.tries++; g.bad = {}; g.pick = null;
    for (const k of Object.keys(g.place)) {
      if (g.ok[k]) continue;
      const chip = byId.get(g.place[k]);
      if (chip && alts[k] && alts[k].includes(chip.text)) g.ok[k] = true; else { delete g.place[k]; g.bad[k] = 1; }
    }
    c.render();
    c.submit({ answers: alts.map((_, k) => (g.ok[k] ? byId.get(g.place[k]).text : null)) });
  },
};
export const gap = { host: gapHost, student: gapStudent, hostActions: gapHostActions, studentActions: gapStudentActions };

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
