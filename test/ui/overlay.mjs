// UI-Test der Dialoge: Text markieren und außerhalb loslassen schließt nicht, Klick daneben schließt.
// Aufruf: node main/launch.cjs test/ui/overlay.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, startTestServer, finish } from './lib.mjs';

async function main() {
  const { srv, base } = await startTestServer(3260);
  const w = makeWin(1366, 768, 'host', 'Host');
  await w.loadURL(`${base}/host`);
  await waitFor(w, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  await mustClick(w, '[data-action="ai"]', 'Mit KI erstellen');
  await waitFor(w, `document.querySelector('#aiSubject')`, 4000, 'Dialog');
  const r = await js(w, `(()=>{const b=document.querySelector('#aiSubject').getBoundingClientRect(); return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`);
  const mouse = (type, x, y) => w.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  const open = () => js(w, `!!document.querySelector('#aiSubject')`);
  // im Feld drücken, nach links aus dem Dialog ziehen, loslassen
  mouse('mouseDown', r.x, r.y); mouse('mouseMove', 180, r.y); mouse('mouseUp', 120, r.y); await sleep(300);
  if (!(await open())) report('Dialog schließt beim Markieren von Text (Maus außerhalb losgelassen)');
  for (const ch of ['B', 'i', 'o']) { for (const type of ['keyDown', 'char', 'keyUp']) w.webContents.sendInputEvent({ type, keyCode: ch }); await sleep(80); }
  if ((await js(w, `document.querySelector('#aiSubject')?.value`)) !== 'Bio') report('Tippen im Feld „Fach“ funktioniert nicht');
  // echter Klick neben den Dialog schließt weiterhin
  mouse('mouseDown', 120, r.y); mouse('mouseUp', 120, r.y); await sleep(300);
  if (await open()) report('Klick neben den Dialog schließt nicht');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
