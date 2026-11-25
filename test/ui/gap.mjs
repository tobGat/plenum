// UI-Test Lückentext: Wörter aus dem Wortkasten in die Lücken ziehen (echte Zeigerereignisse), prüfen, Fortschritt am Beamer.
// Aufruf: node main/launch.cjs test/ui/gap.mjs [Ausgabeordner]
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish } from './lib.mjs';
import { gapAlts } from '../../shared/types/content.js';

const check = (c, m) => { if (!c) report(m); };

async function main() {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 'diagramme-und-umfragen.plenum'), 'utf8'));
  const at = L.slides.findIndex((s) => s.type === 'gap'), alts = gapAlts(L.slides[at].text);
  const { srv, base } = await startTestServer(3270);
  const host = makeWin(+(process.env.UI_W || 1280), +(process.env.UI_H || 720), 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  const tab = makeWin(1180, 820, 't1', 'Tablet');
  await tab.loadURL(`${base}/`);
  await waitFor(tab, `document.querySelector('#content')?.innerText.trim().length > 0`, 8000, 'Tablet verbunden');
  for (let i = 0; i < at; i++) { await mustClick(host, '[data-action="next"]', 'Weiter'); await sleep(200); }
  await waitFor(tab, `document.querySelector('.wordbank .wchip')`, 6000, 'Wortkasten am Gerät');
  await sleep(900);
  check((await js(tab, `document.querySelectorAll('.wordbank .wchip').length`)) >= alts.length, 'Wortkasten enthält zu wenige Wörter');
  check((await js(tab, `document.querySelectorAll('.gap.blank').length`)) === alts.length, 'nicht alle Lücken sind leer');
  check(!(await js(tab, `document.querySelector('.filltext').innerText.includes(${JSON.stringify(alts[0][0])})`)), 'Lösung steht schon im Text');
  check(await js(tab, `document.querySelector('[data-action="t:check"]').disabled`), '„Prüfen“ sollte anfangs gesperrt sein');

  const mid = (sel) => js(tab, `(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
  const chipSel = async (text) => { const id = await js(tab, `(()=>{const c=[...document.querySelectorAll('.wordbank .wchip')].find(x=>x.textContent===${JSON.stringify(text)}); return c?c.dataset.id:null})()`); return id === null ? null : `.wchip[data-id="${id}"]`; };
  const mouse = (type, p) => tab.webContents.sendInputEvent({ type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  async function drag(fromSel, toSel) {
    const a = await mid(fromSel), b = await mid(toSel);
    if (!a || !b) { report(`Ziehen: Element fehlt (${fromSel} → ${toSel})`); return; }
    mouse('mouseDown', a);
    for (let k = 1; k <= 6; k++) { mouse('mouseMove', { x: Math.round(a.x + (b.x - a.x) * k / 6), y: Math.round(a.y + (b.y - a.y) * k / 6) }); await sleep(25); }
    if (!drag.shot) { drag.shot = true; await sleep(80); await shot(tab, 'g01-ziehen'); }
    mouse('mouseUp', b); await sleep(160);
  }
  const gapSel = (i) => `.filltext [data-i="${i}"]`;

  // 1. falsches Wort in Lücke 1 ziehen und prüfen → fliegt zurück
  await drag(await chipSel(alts[1][0]), gapSel(0));
  check((await js(tab, `document.querySelector('${gapSel(0)}').textContent`)) === alts[1][0], 'gezogenes Wort steht nicht in der Lücke');
  await mustClick(tab, '[data-action="t:check"]', 'Prüfen');
  await sleep(300);
  check(await js(tab, `document.querySelector('${gapSel(0)}').classList.contains('blank')`), 'falsches Wort blieb in der Lücke');
  check(!!(await chipSel(alts[1][0])), 'falsches Wort ist nicht zurück im Wortkasten');

  // 2. Wort von einer Lücke in eine andere ziehen und zurück in den Wortkasten
  await drag(await chipSel(alts[0][0]), gapSel(1));
  await drag(gapSel(1), gapSel(0));
  check((await js(tab, `document.querySelector('${gapSel(0)}').textContent`)) === alts[0][0] && (await js(tab, `document.querySelector('${gapSel(1)}').classList.contains('blank')`)), 'Umsetzen zwischen Lücken klappt nicht');
  await drag(gapSel(0), '.wordbank');
  check(await js(tab, `document.querySelector('${gapSel(0)}').classList.contains('blank')`), 'Zurückziehen in den Wortkasten klappt nicht');

  // 3. alle richtig einsetzen: abwechselnd ziehen und „Wort antippen, dann Lücke“
  for (let i = 0; i < alts.length; i++) {
    const sel = await chipSel(alts[i][0]);
    if (!sel) { report(`Wort „${alts[i][0]}“ fehlt im Wortkasten`); continue; }
    if (i % 2) { await mustClick(tab, sel, 'Wort antippen'); await mustClick(tab, gapSel(i), 'Lücke antippen'); await sleep(80); } else await drag(sel, gapSel(i));
  }
  await sleep(200); await shot(tab, 'g02-eingesetzt');
  await mustClick(tab, '[data-action="t:check"]', 'Prüfen');
  await waitFor(tab, `document.querySelector('.fb.ok') && document.querySelectorAll('.gap.open').length === ${alts.length}`, 3000, 'alles richtig');
  await sleep(300); await shot(tab, 'g03-richtig');
  await waitFor(host, `/^1\\s*von 1/.test(document.querySelector('#stats .stat')?.textContent.trim() || '')`, 4000, 'Fortschritt am Beamer');
  await shot(host, 'g04-beamer');

  // 4. Neu laden: der Stand bleibt
  await tab.loadURL(`${base}/`);
  await waitFor(tab, `document.querySelectorAll('.gap.open').length === ${alts.length}`, 6000, 'Stand nach Neuladen');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
