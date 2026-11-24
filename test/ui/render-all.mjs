// Zeigt jede Folie einer beliebigen Lektion am Beamer und am Handy und prüft: keine JS-Fehler, kein Scrollen am Beamer.
// Nützlich für importierte oder KI-erstellte Lektionen.
// Aufruf: node main/launch.cjs test/ui/render-all.mjs <lektion.plenum> [Ausgabeordner]   (UI_W/UI_H für andere Auflösungen)
import { app, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { OUT, sleep, report, makeWin, js, waitFor, mustClick, shot, finish } from './lib.mjs';
import { startServer } from '../../server/index.js';

const file = process.argv.find((a) => a.endsWith('.plenum'));

const W = +(process.env.UI_W || 1280), H = +(process.env.UI_H || 720);

async function main() {
  if (!file) { console.error('Bitte eine .plenum-Datei angeben.'); app.exit(2); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plenum-render-'));
  fs.mkdirSync(path.join(tmp, 'lessons'));
  fs.copyFileSync(file, path.join(tmp, 'lessons', path.basename(file)));
  const srv = await startServer({ port: 3220, host: '127.0.0.1', tries: 10, token: 'rtest', lessonsDir: path.join(tmp, 'lessons'), dataDir: path.join(tmp, 'data'), samplesDir: path.join(tmp, 'none'), appVersion: '1.0.0', log: { error: (...a) => report('Server: ' + a.join(' ')), info() {} } });
  const base = `http://127.0.0.1:${srv.port}`;
  await session.fromPartition('host').cookies.set({ url: base, name: 'plenum_host', value: 'rtest', httpOnly: true, sameSite: 'strict' });
  const L = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`${L.title}: ${L.slides.length} Folien bei ${W}×${H}`);

  const host = makeWin(W, H, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelector('#content .wrap')`, 5000, 'Präsentation');
  // Beitritts-Fenster öffnet sich beim Start automatisch (nach einer /info-Abfrage) – abwarten, dann schließen
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster beim Start');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  const phone = makeWin(390, 760, 'p1', 'Handy');
  await phone.loadURL(`${base}/`);
  await waitFor(phone, `document.querySelector('#content')?.innerText.trim().length > 0`, 8000, 'Handy verbunden');

  let scrollers = 0;
  for (let n = 0; n < L.slides.length; n++) {
    if (n) await mustClick(host, '[data-action="next"]', `Weiter zu ${n + 1}`);
    await sleep(900);
    const r = await js(host, `(()=>{const m=document.getElementById('content'); const se=document.scrollingElement; return {over: m.scrollHeight-m.clientHeight, doc: se.scrollHeight-se.clientHeight, warn: !!m.querySelector('.warn') && m.innerText.includes('konnte nicht angezeigt')};})()`);
    const tag = `${String(n + 1).padStart(2, '0')}-${L.slides[n].type}`;
    if (r.warn) report(`Folie ${n + 1} (${L.slides[n].type}) konnte nicht angezeigt werden`);
    if (r.over > 2 || r.doc > 2) { report(`Beamer Folie ${n + 1} (${L.slides[n].type}) scrollt (${Math.max(r.over, r.doc)}px)`); await shot(host, `scroll-${tag}`); }
    const pr = await js(phone, `(()=>{const se=document.scrollingElement; return {wide: se.scrollWidth-se.clientWidth, doc: se.scrollHeight-se.clientHeight};})()`);
    if (pr.wide > 2 || pr.doc > 2) report(`Handy Folie ${n + 1}: Seite zu breit/hoch (${pr.wide}/${pr.doc}px)`);
    if (process.env.UI_SHOTS) await shot(host, tag);
    else if (n % 10 === 0) await shot(host, tag);
    scrollers += r.over > 2 ? 1 : 0;
  }
  finish(srv, `${L.slides.length} Folien gezeigt.`);
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
