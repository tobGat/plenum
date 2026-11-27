// Zeichnen einer Themenserie: Karten auf dem Raster und Pfeile dazwischen. Wird vom Serien-Editor, von der
// Vorschau in der Bibliothek und vom Druck (PDF/Bild) benutzt – reine Darstellung, ohne Ereignisse.
import { html, raw } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { colorOf, iconGfx } from '../core/parts.js';
import { libSvg } from '/shared/graphics.js';

// Rastermaße in px (bei Zoom 100 %)
export const G = { cw: 204, ch: 104, gx: 68, gy: 52, pad: 44 };
G.px = G.cw + G.gx; G.py = G.ch + G.gy;
export const cellX = (col) => G.pad + col * G.px;
export const cellY = (row) => G.pad + row * G.py;

const gfx = (src) => (src.startsWith('lib:') ? libSvg(src.slice(4)) : iconGfx(src.slice(5)));
const vars = (c) => `--lc:${c.c};--lcs:${c.s};--c:${c.c};--c-s:${c.s};--c-d:${c.d};--c-l:${c.l}`;

// Aussehen einer Karte: Lektion (Farbe und Grafik ihrer Bibliothekskarte) oder freie Karte
export function cardLook(card, lessons) {
  const L = card.lesson ? lessons[card.lesson] : null;
  if (card.lesson) return { L, gone: !L, title: L ? L.title : card.title, meta: L ? [L.subject, L.grade].filter(Boolean).join(' · ') || 'Lektion' : 'Lektion nicht mehr vorhanden',
    color: colorOf((L && L.card && L.card.color) || (L ? 'indigo' : 'slate')), graphic: L && L.card && L.card.graphic ? L.card.graphic : '', image: L && L.card && L.card.imgv ? { src: `/api/host/lessons/${L.id}/cardimage?v=${L.card.imgv}`, pos: L.card.pos } : null, info: L ? `${L.slides} ${L.slides === 1 ? 'Folie' : 'Folien'}` : '' };
  return { L: null, gone: false, free: true, title: card.title, meta: 'Platzhalter', color: colorOf(card.color || 'slate'), graphic: card.icon ? `icon:${card.icon}` : '', info: card.note || 'noch ohne Präsentation' };
}

// sides: Seiten mit Pfeil-Anfasser (right, left, top, bottom) – dort, wo daneben noch Platz für eine Karte ist
const HANDLE_IC = { right: 'arrow', left: 'arrowl', top: 'up', bottom: 'down' };
export function cardHtml(card, lessons, { sel = false, readonly = false, off = { col: 0, row: 0 }, sides = [] } = {}) {
  const k = cardLook(card, lessons);
  return html`<div class="scard${k.free ? ' free' : ''}${k.gone ? ' gone' : ''}${sel ? ' sel' : ''}" data-card="${card.id}" style="left:${cellX(card.col - off.col)}px;top:${cellY(card.row - off.row)}px;${vars(k.color)}" ${readonly ? '' : raw('tabindex="0"')} role="group" aria-label="${k.title}">
    <div class="sc-band"></div><div class="sc-body"><div class="sc-tt"><div class="sc-meta">${k.gone ? ic('alert') : ''}${k.meta}</div><div class="sc-title">${k.title}</div>${k.info ? html`<div class="sc-info">${k.info}</div>` : ''}</div>
    ${k.image ? html`<span class="sc-gfx photo"><img src="${k.image.src}" alt="" draggable="false" style="object-position:${k.image.pos ? k.image.pos.x : 50}% ${k.image.pos ? k.image.pos.y : 50}%"></span>` : k.graphic ? html`<span class="sc-gfx">${raw(gfx(k.graphic))}</span>` : ''}</div>
    ${readonly ? '' : sides.map((sd) => html`<span class="shandle h-${sd}" data-handle="${card.id}" data-side="${sd}" title="Ziehen, um einen Pfeil zu einer anderen Karte zu legen" aria-hidden="true">${ic(HANDLE_IC[sd])}</span>`)}</div>`;
}

// Pfeil von Karte a nach Karte b: an den einander zugewandten Kanten, sanft geschwungen
export function linkPath(a, b, off = { col: 0, row: 0 }) {
  const ax = cellX(a.col - off.col), ay = cellY(a.row - off.row), bx = cellX(b.col - off.col), by = cellY(b.row - off.row);
  const dx = bx - ax, dy = by - ay;
  let x1, y1, x2, y2, c1, c2;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) { // seitlich
    const dir = Math.sign(dx);
    x1 = ax + (dir > 0 ? G.cw : 0); y1 = ay + G.ch / 2; x2 = bx + (dir > 0 ? 0 : G.cw) - dir * 7; y2 = by + G.ch / 2;
    const k = Math.max(26, Math.abs(x2 - x1) / 2);
    c1 = [x1 + dir * k, y1]; c2 = [x2 - dir * k, y2];
  } else { // von oben nach unten oder umgekehrt
    const dir = Math.sign(dy) || 1;
    x1 = ax + G.cw / 2; y1 = ay + (dir > 0 ? G.ch : 0); x2 = bx + G.cw / 2; y2 = by + (dir > 0 ? 0 : G.ch) - dir * 7;
    const k = Math.max(22, Math.abs(y2 - y1) / 2);
    c1 = [x1, y1 + dir * k]; c2 = [x2, y2 - dir * k];
  }
  return { d: `M${x1} ${y1}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`, mid: [(x1 + x2) / 2, (y1 + y2) / 2] };
}

export function linksSvg(series, { selLink = -1, off = { col: 0, row: 0 }, w, h, id = 'sarrow' } = {}) {
  const by = Object.fromEntries(series.cards.map((c) => [c.id, c]));
  return html`<svg class="slinks" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs>
    <marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="shead"/></marker>
    <marker id="${id}-on" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="shead on"/></marker></defs>
    ${series.links.map((l, i) => { const a = by[l.from], b = by[l.to]; if (!a || !b) return ''; const p = linkPath(a, b, off); return html`<g class="slink${i === selLink ? ' sel' : ''}"><path class="sl-line" d="${p.d}" marker-end="url(#${id}${i === selLink ? '-on' : ''})"/><path class="sl-hit" d="${p.d}" data-link="${i}"/></g>`; })}
    <path class="sl-temp" id="sltemp" d="" marker-end="url(#${id}-on)"/></svg>`;
}

// Benutzter Bereich der Matrix (für Druck und Vorschau)
export function bounds(series) {
  if (!series.cards.length) return { col: 0, row: 0, cols: 1, rows: 1 };
  const cs = series.cards.map((c) => c.col), rs = series.cards.map((c) => c.row);
  const col = Math.min(...cs), row = Math.min(...rs);
  return { col, row, cols: Math.max(...cs) - col + 1, rows: Math.max(...rs) - row + 1 };
}
export const sizeOf = (cols, rows) => ({ w: G.pad * 2 + cols * G.px - G.gx, h: G.pad * 2 + rows * G.py - G.gy });

// Fertige Matrix ohne Bedienelemente, auf den benutzten Bereich zugeschnitten (Druck)
export function staticMap(series, lessons) {
  const b = bounds(series), { w, h } = sizeOf(b.cols, b.rows), off = { col: b.col, row: b.row };
  return { w, h, html: html`<div class="sgrid static" style="width:${w}px;height:${h}px">${linksSvg(series, { off, w, h })}${series.cards.map((c) => cardHtml(c, lessons, { readonly: true, off }))}</div>` };
}

// Kleine Vorschau für die Serienliste: Karten als farbige Felder, Pfeile als Linien
export function miniMap(meta, lessons) {
  const cards = meta.cards || [];
  if (!cards.length) return html`<div class="smini empty">${ic('puzzle')}<span>Noch keine Karten</span></div>`;
  const b = bounds({ cards }), W = 34, H = 20, GX = 14, GY = 12, w = b.cols * (W + GX) - GX + 8, h = b.rows * (H + GY) - GY + 8;
  const pos = (c) => [4 + (c.col - b.col) * (W + GX), 4 + (c.row - b.row) * (H + GY)], by = Object.fromEntries(cards.map((c) => [c.id, c]));
  return html`<div class="smini"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${(meta.arrows || []).map((l) => { const a = by[l.from], c = by[l.to]; if (!a || !c) return ''; const [x1, y1] = pos(a), [x2, y2] = pos(c); return html`<line x1="${x1 + W / 2}" y1="${y1 + H / 2}" x2="${x2 + W / 2}" y2="${y2 + H / 2}" class="sm-l"/>`; })}
    ${cards.map((c) => { const [x, y] = pos(c), L = c.lesson ? lessons[c.lesson] : null, col = colorOf(c.lesson ? (L && L.card && L.card.color) || (L ? 'indigo' : 'slate') : c.color || 'slate'); return html`<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="5" fill="${col.s}" stroke="${col.c}" stroke-width="1.5"/><rect x="${x}" y="${y}" width="${W}" height="5" rx="2.5" fill="${col.c}"/>`; })}</svg></div>`;
}
