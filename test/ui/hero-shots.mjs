// Bildschirmfotos für den Kopf der Website: Umfrage als Kreisdiagramm am Beamer und dieselbe Umfrage am Tablet.
// Aufruf: node main/launch.cjs test/ui/hero-shots.mjs <Ausgabeordner>
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sleep, makeWin, js, waitFor, mustClick, click, shot, startTestServer, finish } from './lib.mjs';

async function main() {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 'diagramme-und-umfragen.plenum'), 'utf8'));
  const at = L.slides.findIndex((s) => s.id === 's-schlaf');
  const { srv, base } = await startTestServer(3280);
  const host = makeWin(+(process.env.UI_W || 1280), +(process.env.UI_H || 720), 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  // 1 Tablet (für das Foto) und 11 kleine Geräte, die nur abstimmen
  const tablet = makeWin(1180, 820, 't0', 'Tablet');
  const votes = [1, 1, 2, 2, 2, 0, 0, 3, 3, 1, 2];
  const others = votes.map((_, k) => makeWin(420, 700, `v${k}`, `Gerät ${k + 1}`));
  for (const w of [tablet, ...others]) await w.loadURL(`${base}/`);
  for (const w of [tablet, ...others]) await waitFor(w, `document.querySelector('#content')?.innerText.trim().length > 0`, 8000, 'verbunden');
  for (let i = 0; i < at; i++) { await mustClick(host, '[data-action="next"]', 'Weiter'); await sleep(150); }
  await waitFor(tablet, `document.querySelector('.vopt')`, 6000, 'Umfrage am Tablet');
  await sleep(800);
  for (let k = 0; k < others.length; k++) { await click(others[k], `.vopt[data-i="${votes[k]}"]`); await sleep(60); }
  await click(tablet, '.vopt[data-i="2"]');
  await sleep(700); await shot(tablet, 'tablet-umfrage-kreis');
  await mustClick(host, '[data-action="t:set"][data-k="type"][data-v="pie"]', 'Kreisdiagramm');
  await sleep(1800); await shot(host, 'umfrage-kreis');
  await mustClick(host, '[data-action="t:set"][data-k="type"][data-v="bar"]', 'Säulen');
  await sleep(1500); await shot(host, 'umfrage-saeulen');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
