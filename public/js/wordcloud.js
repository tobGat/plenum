// Wortwolke: Spiral-Layout (häufige Begriffe größer); beim Aktualisieren gleiten Wörter zur neuen Position (FLIP)
import { esc } from './core/dom.js';
import { CHART_COLORS } from '/shared/palette.js';

const W = 960, H = 420;

// Wortbreite mit der tatsächlich verwendeten Überschriften-Schrift messen (je Design verschieden);
// ohne Canvas (ältere Geräte) großzügig schätzen. So überschneiden sich Wörter nicht.
let mctx = null;
function measurer() {
  let family = '"Lexend", sans-serif';
  try {
    const el = document.getElementById('app') || document.body;
    family = getComputedStyle(el).getPropertyValue('--head').trim() || family;
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  } catch { mctx = null; }
  return (text, size) => {
    if (mctx) { try { mctx.font = `700 ${size}px ${family}`; return mctx.measureText(text).width; } catch { /* schätzen */ } }
    return text.length * size * 0.68;
  };
}

export function cloudSvg(words) {
  if (!words.length) return `<svg class="wcloud" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wortwolke"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="wc-empty">Noch keine Begriffe – die Wolke füllt sich live.</text></svg>`;
  const list = words.slice(0, 80), max = Math.max(...list.map((w) => w.n)), min = Math.min(...list.map((w) => w.n));
  const n = list.length; // wenige Begriffe → größer, viele → kleiner
  const big = n <= 6 ? 112 : n <= 12 ? 94 : n <= 20 ? 76 : n <= 40 ? 58 : 46, small = n <= 12 ? 30 : n <= 20 ? 24 : n <= 40 ? 18 : 14;
  const placed = [], width = measurer();
  let out = '';
  list.forEach((w, i) => {
    let size = Math.round(small + (max === min ? 0.6 : (w.n - min) / (max - min)) * (big - small));
    for (let shrink = 0; shrink < 5; shrink++, size = Math.round(size * 0.8)) {
      const bw = width(w.text, size) * 1.04 + size * 0.5, bh = size * 1.22;
      let pos = null;
      for (let t = 0; t < 1500 && !pos; t += 0.17) {
        const r = 2.1 * t, x = W / 2 + r * Math.cos(t) * 1.75, y = H / 2 + r * Math.sin(t) * 0.82;
        const R = { x: x - bw / 2, y: y - bh / 2, w: bw, h: bh };
        if (R.x < 4 || R.y < 4 || R.x + R.w > W - 4 || R.y + R.h > H - 4) continue;
        if (placed.some((p) => R.x < p.x + p.w && R.x + R.w > p.x && R.y < p.y + p.h && R.y + R.h > p.y)) continue;
        pos = { x, y, R };
      }
      if (pos) {
        placed.push(pos.R);
        out += `<text data-k="${esc(w.key)}" x="${pos.x.toFixed(1)}" y="${(pos.y + size * 0.36).toFixed(1)}" font-size="${size}" fill="${CHART_COLORS[i % CHART_COLORS.length]}" text-anchor="middle" class="wc-w" style="--i:${i}">${esc(w.text)}<title>${esc(w.text)}: ${w.n}</title></text>`;
        break;
      }
    }
  });
  return `<svg class="wcloud" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wortwolke">${out}</svg>`;
}

// Positionen vor dem Neuzeichnen merken …
export function snapCloud(root) {
  const m = new Map();
  root.querySelectorAll('.wc-w[data-k]').forEach((el) => { try { const b = el.getBBox(); m.set(el.dataset.k, { x: b.x + b.width / 2, y: b.y + b.height / 2, s: +el.getAttribute('font-size') }); } catch { /* unsichtbar */ } });
  return m;
}
// … und danach sanft von dort zur neuen Position gleiten; neue Wörter ploppen auf
export function flipCloud(root, prev) {
  if (!prev || !prev.size) return;
  root.querySelectorAll('.wc-w[data-k]').forEach((el) => {
    const p = prev.get(el.dataset.k);
    if (!p) { el.classList.add('wc-new'); return; }
    let b; try { b = el.getBBox(); } catch { return; }
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2, s = p.s / (+el.getAttribute('font-size') || 1);
    if ((Math.abs(p.x - cx) > 1 || Math.abs(p.y - cy) > 1 || Math.abs(s - 1) > 0.02) && el.animate) {
      el.style.transformOrigin = `${cx}px ${cy}px`;
      el.animate([{ transform: `translate(${p.x - cx}px,${p.y - cy}px) scale(${s})` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
  });
}
