// Misst die tatsächliche Schriftgröße aller Texte am Beamer (Schriftgröße × Zoom aus fit(), bei Diagrammen × SVG-Maßstab)
// für jede Folie der Beispiel- und Demo-Lektionen – mit und ohne Beispielantworten. Bedienelemente der Lehrkraft zählen nicht.
// Aufruf: node main/launch.cjs test/ui/fontsizes.mjs [Ausgabeordner]   (FS_MIN = Untergrenze in px, FS_LIST=1 listet alles unter 17 px)
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { sleep, report, makeWin, js, waitFor, shot, startTestServer, finish, OUT } from './lib.mjs';
import { LESSONS } from './showcase-data.mjs';

const W = +(process.env.UI_W || 1280), H = +(process.env.UI_H || 720);
// Untergrenze auch auf sehr vollen Folien (dort verkleinert fit() alles gemeinsam)
const MIN = +(process.env.FS_MIN || 11.5), LIST = +(process.env.FS_LIST ? 17 : MIN);
const strip = (L) => ({ ...L, slides: L.slides.map(({ demo, ...s }) => s) });

// Läuft in der Vorschau-Seite: alle sichtbaren Texte mit ihrer tatsächlichen Größe
const MEASURE = `(() => {
  const ct = document.getElementById('content'); if (!ct) return null;
  const wrap = ct.querySelector('.wrap'), zoom = wrap ? parseFloat(wrap.style.zoom || '1') || 1 : 1;
  const out = [], seen = new Set();
  const skip = (el) => el.closest('button,select,input,textarea,.toolbar,.modbar,.modlist,.bar,title');
  const walker = document.createTreeWalker(ct, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (!text) continue;
    const el = n.parentElement; if (!el || skip(el)) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (parseFloat(cs.fontSize) === 0) continue; // absichtlich unsichtbarer Text (z. B. Balken ohne Beschriftung)
    let px = parseFloat(cs.fontSize) * zoom;
    const svg = el.closest('svg');
    if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) px = parseFloat(cs.fontSize) * (svg.getBoundingClientRect().width / svg.viewBox.baseVal.width);
    const cls = (e) => (e ? (e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].filter((c) => !/^(anim|new|on)$/.test(c)).join('.') : '')) : '');
    const key = cls(el.parentElement) + ' > ' + cls(el);
    if (seen.has(key)) { const o = out.find((x) => x.key === key); if (px < o.px) { o.px = px; o.text = text; } continue; }
    seen.add(key); out.push({ key, px, text: text.slice(0, 40) });
  }
  return { zoom, over: ct.scrollHeight - ct.clientHeight, items: out };
})()`;

async function main() {
  const { srv, base } = await startTestServer(3310);
  const w = makeWin(W, H, 'host', 'Vorschau');
  await w.loadURL(`${base}/host`);
  await waitFor(w, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  for (const L of LESSONS) await js(w, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify({ lesson: strip(L) }))}}).then(r=>r.json())`);
  const lessons = await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>Promise.all(l.map(m=>fetch('/api/host/lessons/'+m.id).then(r=>r.json()))))`);
  await w.loadURL(`${base}/preview`);
  await waitFor(w, `document.getElementById('root')`, 5000, 'Vorschau-Seite');
  await sleep(400);

  const rows = new Map(); // Schlüssel → kleinster Wert samt Fundstelle
  const zooms = [];
  let shots = 0;
  for (const L of lessons) {
    await js(w, `window.__L = ${JSON.stringify(JSON.stringify({ ...L, media: undefined }))}; true`);
    for (const [i, s] of L.slides.entries()) {
      for (const demo of [true, false]) {
        await js(w, `window.postMessage({ type: 'render', lesson: JSON.parse(window.__L), slideId: ${JSON.stringify(s.id)}, mode: 'host', demo: ${demo}, joinUrl: '' }, location.origin); true`);
        await sleep(demo ? 1300 : 500);
        const m = await js(w, MEASURE);
        if (!m) { report(`Folie ${i + 1} „${s.title}“ nicht gezeichnet`); continue; }
        if (demo) zooms.push({ zoom: m.zoom, where: `${L.title} · ${i + 1} ${s.type}` });
        if (m.over > 2 && demo) report(`${L.title} · Folie ${i + 1} (${s.type}) läuft über (${m.over}px)`);
        for (const it of m.items) {
          const key = `${s.type} | ${it.key}`, old = rows.get(key);
          if (!old || it.px < old.px) rows.set(key, { px: it.px, text: it.text, where: `${L.title} · ${i + 1}${demo ? '' : ' (leer)'}`, zoom: m.zoom });
        }
        if (demo && process.env.FS_SHOTS && (process.env.FS_SHOTS === 'all' || process.env.FS_SHOTS.split(',').includes(s.type))) await shot(w, `fs-${String(++shots).padStart(2, '0')}-${s.type}-${(L.theme || 'standard')}`);
      }
    }
  }
  const list = [...rows.entries()].map(([key, v]) => ({ key, ...v })).filter((x) => x.px < LIST).sort((a, b) => a.px - b.px);
  const lines = list.map((x) => `${x.px.toFixed(1).padStart(5)} px  ${x.key}   „${x.text}“   [${x.where}, Zoom ${x.zoom}]`);
  fs.writeFileSync(path.join(OUT, 'fontsizes.txt'), lines.join('\n'));
  console.log(lines.join('\n'));
  zooms.sort((a, b) => a.zoom - b.zoom);
  console.log(`\nKleinster Zoom: ${zooms.slice(0, 5).map((z) => `${z.zoom} (${z.where})`).join(', ')}`);
  for (const x of list) if (x.px < MIN) report(`Schrift zu klein: ${x.px.toFixed(1)} px – ${x.key} „${x.text}“ (${x.where})`);
  finish(srv, `${rows.size} Textarten gemessen bei ${W}×${H}, Untergrenze ${MIN} px.`);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
