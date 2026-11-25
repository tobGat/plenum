// Bildschirmfotos der Schüleransicht auf Tablet (iPad quer) und Laptop – für die Website.
// Aufruf: node main/launch.cjs test/ui/device-shots.mjs <Ausgabeordner>
import { app } from 'electron';
import { sleep, makeWin, js, waitFor, mustClick, click, shot, startTestServer, finish } from './lib.mjs';

async function main() {
  const { srv, base } = await startTestServer(3240);
  const host = makeWin(+(process.env.UI_W || 1280), +(process.env.UI_H || 720), 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  const tablet = makeWin(1180, 820, 't1', 'Tablet'), laptop = makeWin(1366, 768, 'l1', 'Laptop');
  await tablet.loadURL(`${base}/`); await laptop.loadURL(`${base}/`);
  await waitFor(tablet, `document.querySelector('#content')?.innerText.trim().length > 0`, 8000, 'Tablet verbunden');
  await waitFor(laptop, `document.querySelector('#content')?.innerText.trim().length > 0`, 8000, 'Laptop verbunden');
  const go = async (n) => { for (let i = 0; i < n; i++) { await mustClick(host, '[data-action="next"]', 'Weiter'); await sleep(250); } await sleep(900); };

  await go(1); // Wortwolke
  await js(tablet, `(()=>{const f=document.querySelector('form.wordform'); const w=['Zahlen','Balken','Statistik']; f.querySelectorAll('input').forEach((x,k)=>x.value=w[k]||'');})()`);
  await sleep(300); await shot(tablet, 'tablet-wortwolke');
  await go(5); // Folie 7: Umfrage
  for (const k of [0, 1, 3]) await click(tablet, `.vopt[data-i="${k}"]`);
  await sleep(400); await shot(tablet, 'tablet-umfrage');
  await go(4); // Folie 11: Richtig/Falsch
  for (const [k, v] of [[0, 'true'], [1, 'false'], [2, 'true']]) await click(laptop, `[data-action="t:answer"][data-i="${k}"][data-v="${v}"]`);
  await sleep(500); await shot(laptop, 'laptop-aufgabe');
  await go(13); // Folie 24: Quiz
  await mustClick(host, '[data-action="quiz"][data-q="start"]', 'Quiz starten');
  await sleep(3400);
  await shot(tablet, 'tablet-quiz'); await shot(laptop, 'laptop-quiz');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
