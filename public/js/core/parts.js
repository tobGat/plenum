// Wiederverwendbare Bausteine der Folien (Kopf, Diagramm-Rahmen, Rückmeldung, Ring …)
import { html, raw, esc } from './dom.js';
import { ic, IC } from './icons.js';
import { chartFromSpec } from '../charts.js';
import { COLORS } from '/shared/palette.js';
import { libSvg, BLOB } from '/shared/graphics.js';

export const colorOf = (name) => COLORS[name] || COLORS.indigo;

// ---------- Designs: Akzentfarben passend zum Hintergrund ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Platzhalter am Schülergerät, wenn eine Folie nur am Beamer gezeigt wird
export const lookUp = () => html`<div class="lookup"><div class="lookup-i">${ic('eye')}</div><h2>Schau nach vorne</h2><p>Diese Folie wird vorne gezeigt. Sobald du etwas tun kannst, geht es hier automatisch weiter.</p></div>`;

export function mix(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
const DARK_BG = { dark: '#111a2c', chalk: '#21402f', blueprint: '#12406f' };
// helle Töne (zart/hell) werden auf dunklen Designs zu dunklen Tönungen, der dunkle Ton zu einem hellen (für Text)
export function themeCols(col, theme) {
  const bg = DARK_BG[theme];
  if (!bg) return col;
  const lift = theme === 'dark' ? 0.08 : 0.24; // auf Tafel und Blaupause heller, damit die Akzente wie Kreide/Lichtpause wirken
  const c = mix(col.c, '#ffffff', lift);
  return { ...col, c, d: mix(col.c, '#ffffff', theme === 'dark' ? 0.42 : 0.58), s: mix(col.c, bg, 0.8), l: mix(col.c, bg, 0.52) };
}
// Design auf das App-Element, Farben auf die Wurzel (wie bisher)
export function applyTheme(appEl, theme, col) {
  const t = theme || 'standard';
  if (appEl && appEl.dataset.theme !== t) appEl.dataset.theme = t;
  const k = themeCols(col, t), rs = document.documentElement.style;
  rs.setProperty('--c', k.c); rs.setProperty('--c-d', k.d); rs.setProperty('--c-s', k.s); rs.setProperty('--c-l', k.l);
  return k;
}

// ---------- Grafiken (Bibliothek, Symbol, eigenes Bild) ----------
export const iconGfx = (name) => `<svg class="gfx" viewBox="0 0 200 200" aria-hidden="true"><path class="gs" d="${BLOB}"/><g class="gico" transform="translate(46 46) scale(4.5)">${IC[name] || IC.star}</g></svg>`;
// g.src: lib:name | icon:name | media:id (→ mediaUrl) | /media/… (Adresse vom Server)
export function gfxHtml(g, mediaUrl, cls = '') {
  if (!g || !g.src) return '';
  let inner, photo = false;
  if (g.src.startsWith('lib:')) inner = raw(libSvg(g.src.slice(4), { bg: g.pos !== 'background', label: g.caption }));
  else if (g.src.startsWith('icon:')) inner = raw(iconGfx(g.src.slice(5)));
  else { photo = true; inner = html`<img src="${g.src.startsWith('media:') ? (mediaUrl ? mediaUrl(g.src.slice(6)) : '') : g.src}" alt="${g.caption || ''}" draggable="false">`; }
  return html`<figure class="sfig${photo ? ' photo' : ''}${cls ? ' ' + cls : ''}">${inner}${g.caption ? html`<figcaption>${g.caption}</figcaption>` : ''}</figure>`;
}
export const isPhoto = (g) => !!g && !g.src.startsWith('lib:') && !g.src.startsWith('icon:');
// Folie mit Grafik: rechts/links (Spalte), oben (über dem Inhalt), Ecke (neben dem Titel), Hintergrund
export function withGraphic(head, body, g, mediaUrl) {
  if (!g || !g.src) return html`<div class="wrap">${head}${body}</div>`;
  const fig = gfxHtml(g, mediaUrl), sz = `gs-${g.size || 'm'}`;
  if (g.pos === 'top') return html`<div class="wrap hasg g-top ${sz}">${head}${fig}${body}</div>`;
  if (g.pos === 'corner') return html`<div class="wrap hasg g-corner ${sz}">${fig}${head}${body}</div>`;
  if (g.pos === 'background') return html`<div class="wrap hasg g-bg ${sz}">${fig}${head}${body}</div>`;
  return html`<div class="wrap hasg g-side g-${g.pos === 'left' ? 'left' : 'right'} ${sz}">${fig}<div class="wmain">${head}${body}</div></div>`;
}

// Hinweis für die Lehrkraft: so viele Geräte haben Plenum gerade nicht im Vordergrund (anonym, nur die Anzahl)
export const awayBadge = (n) => (n > 0 ? html`<span class="awaybadge" title="${n === 1 ? 'Ein Gerät hat' : `${n} Geräte haben`} Plenum gerade nicht im Vordergrund (anderer Tab oder anderes Programm). Anonym – Plenum weiß nicht, wer es ist.">${ic('eyeoff')}<b>${n}</b> nicht in Plenum</span>` : '');

export function shead(title, section) {
  return html`<div class="shead"><div class="kicker"><span class="kic">${ic(section.icon)}</span>${section.name}</div><h2>${title}</h2></div>`;
}
const fictional = (src) => /fiktiv|beispieldaten/i.test(src || '');
export function srcLine(src) { return src ? html`<div class="src">${fictional(src) ? html`<span class="badge-demo">Beispieldaten</span> ` : ''}${src}</div>` : ''; }
export function chartBox(spec, key, extraTitle) {
  if (!spec) return '';
  return html`<div class="chartbox anim">${spec.title ? html`<h4>${spec.title}${extraTitle || ''}</h4>` : ''}${raw(chartFromSpec(spec, key))}${srcLine(spec.source)}</div>`;
}
// Inhalt mit optionalem Diagramm daneben
export function withChart(spec, key, inner, source) {
  return spec ? html`<div class="grid2"><div>${chartBox(spec, key)}</div><div>${inner}</div></div>${srcLine(source)}` : html`${inner}${srcLine(source)}`;
}
export const fb = (ok, text) => html`<div class="fb ${ok ? 'ok' : 'no'}" role="status">${ic(ok ? 'check' : 'x')}<span>${text}</span></div>`;

// Fortschrittsring; mit key gleitet er vom letzten Wert zum neuen
const RING = {};
export function ring(r, key, size = 44, cls = '') {
  r = Math.max(0, Math.min(1, r || 0));
  const R = size / 2 - 4, C = 2 * Math.PI * R, p = key && key in RING ? RING[key] : 0, h = size / 2;
  if (key) RING[key] = r;
  return raw(`<svg class="ring${cls ? ' ' + cls : ''}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle class="rt" cx="${h}" cy="${h}" r="${R}"/><circle class="rv" cx="${h}" cy="${h}" r="${R}" transform="rotate(-90 ${h} ${h})" style="stroke-dasharray:${C.toFixed(2)};--c0:${(C * (1 - p)).toFixed(2)};--c1:${(C * (1 - r)).toFixed(2)}"/></svg>`);
}
export const resetRings = (prefix) => { for (const k in RING) if (k.endsWith(prefix)) delete RING[k]; };

// Antwort-Balken (Auswertung); Breite gleitet per animWidths()
const WPREV = {};
// cls: Zusatzklasse (z. B. „lt“ für dunkle Schrift auf hellem Balken); sep: Trenner zwischen Beschriftung und Prozentwert
export function seg(key, v, n, color, label, cls = '', sep = ' ') {
  const p = n ? (v / n) * 100 : 0, from = WPREV[key] || 0;
  WPREV[key] = p;
  if (!p) return '';
  const pc = Math.round(p);
  return raw(`<div class="seg${cls ? ' ' + cls : ''}" data-w="${p.toFixed(2)}" style="width:${from.toFixed(2)}%;background:${color}" title="${esc(label || '')}${label ? ': ' : ''}${v} von ${n} (${pc} %)">${p >= 11 && label ? `${esc(label)}${sep}${pc} %` : p >= 6 ? `${pc} %` : ''}</div>`);
}
export const resetSegs = (prefix) => { for (const k in WPREV) if (k.startsWith(prefix)) delete WPREV[k]; };
export function animWidths(root = document) {
  const els = [...root.querySelectorAll('.seg[data-w], .wbar[data-w]')];
  if (!els.length) return;
  void document.body.offsetWidth;
  requestAnimationFrame(() => els.forEach((e) => { e.style.width = `${e.dataset.w}%`; e.removeAttribute('data-w'); }));
}
export const eRow = (label, tag, bar, num, sub) => html`<div class="erow"><div class="el">${label}${tag ? html` <span class="etag">${tag}</span>` : ''}</div><div class="eline"><div class="ebar">${bar}</div><div class="enum">${num}</div></div>${sub ? html`<div class="esub">${sub}</div>` : ''}</div>`;
export const OKC = '#16a34a', NOCS = ['#dc2626', '#f97316', '#b45309', '#be123c'];
