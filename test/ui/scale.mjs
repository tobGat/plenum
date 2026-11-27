// UI-Test der Skala am Beamer: Leerzustand mit großen Aussagen, Auswertung als Zeile mit Säulen und Mittelwert,
// Vorher/Nachher-Vergleich bei gleichen Aussagen auf einer späteren Folie – auch im sehr breiten Fenster.
// Aufruf: node main/launch.cjs test/ui/scale.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish } from './lib.mjs';

const check = (c, m) => { if (!c) report(m); };
const ST = ['Ich kann erzählen, wo und wann Mozart gelebt hat.', 'Ich kenne Mozarts Familie.', 'Ich kann mindestens zwei Werke von Mozart nennen.', 'Ich kann die Geschichte der Zauberflöte erzählen.'];
const LESSON = { title: 'Mozart', theme: 'playful', sections: [{ name: 'Einstieg', color: 'blue' }, { name: 'Abschluss', color: 'blue' }], slides: [
  { type: 'scale', section: 'Einstieg', title: 'Wie sicher bist du?', question: 'Schätze dich ein.', statements: ST, steps: 5, minLabel: 'noch gar nicht', maxLabel: 'sehr sicher' },
  { type: 'info', section: 'Einstieg', title: 'Mozart', cards: [{ title: 'Leben', text: 'Geboren 1756 in Salzburg.' }] },
  { type: 'scale', section: 'Abschluss', title: 'Und jetzt? Wie sicher bist du?', question: 'Schätze dich noch einmal ein.', statements: [...ST.slice(0, 3), 'Ich möchte mehr über Mozart wissen.'], steps: 5, minLabel: 'noch gar nicht', maxLabel: 'sehr sicher', discussion: 'Vergleicht mit dem Beginn der Stunde: Was hat sich verändert?' },
] };

async function main() {
  const { srv, base } = await startTestServer(3390);
  const host = makeWin(1280, 720, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  const L = await js(host, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify({ lesson: LESSON }))}}).then(r=>r.json())`);
  await js(host, 'location.reload()');
  await waitFor(host, `document.querySelector('[data-action="present"][data-id="${L.id}"]')`, 8000, 'Lektion in der Bibliothek');
  await mustClick(host, `[data-action="present"][data-id="${L.id}"]`, 'Präsentieren');
  for (let i = 0; i < 25 && !(await js(host, `!!document.getElementById('ov').innerHTML`)); i++) await sleep(100);
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

  // Leerzustand: Aussagen groß, keine leeren Säulen
  await waitFor(host, `document.querySelectorAll('.scwait li').length === 4`, 5000, 'Leerzustand mit den Aussagen');
  check(!(await js(host, `document.querySelector('.scrow')`)) && /Wartet auf Antworten/.test(await js(host, `document.getElementById('content').innerText`)), 'Leerzustand zeigt schon eine Auswertung oder keinen Hinweis');
  await sleep(600); await shot(host, 'k01-leer');

  // Drei Geräte bewerten
  const tabs = [];
  for (const [i, part] of ['persist:x', 'persist:y', 'persist:z'].entries()) {
    const t = makeWin(420, 820, part, `Gerät ${i + 1}`);
    await t.loadURL(`${base}/`);
    await waitFor(t, `document.querySelectorAll('.sq-btns').length === 4`, 8000, `Skala am Gerät ${i + 1}`);
    tabs.push(t);
  }
  const rate = async (t, vals) => { for (const [row, v] of vals.entries()) { await js(t, `document.querySelectorAll('.sq-btns')[${row}].querySelectorAll('.sq-b')[${v - 1}].click()`); await sleep(120); } };
  await rate(tabs[0], [1, 2, 2, 1]); await rate(tabs[1], [2, 2, 3, 1]); await rate(tabs[2], [3, 1, 2, 2]);
  await waitFor(host, `document.querySelectorAll('.scrow').length === 4 && /von 3/.test(document.getElementById('content').innerText)`, 5000, 'Auswertung mit vier Zeilen');
  const row = (i) => js(host, `(()=>{const r=document.querySelectorAll('.scrow')[${i}]; return {mean:r.querySelector('.sc-m').textContent.replace('Ø','').trim(), n:r.querySelector('.sc-n').textContent, counts:[...r.querySelectorAll('.sc-v')].map(e=>e.textContent), heights:[...r.querySelectorAll('.sc-bar')].map(e=>Math.round(e.getBoundingClientRect().height)), delta:(r.querySelector('.sc-d')||{}).innerText||''};})()`);
  let r0 = await row(0);
  check(r0.mean === '2' && r0.n === 'n = 3' && JSON.stringify(r0.counts) === JSON.stringify(['1', '1', '1', '', '']), `Zeile 1: ${JSON.stringify(r0)}`);
  const r1 = await row(1);
  check(r1.mean === '1,7' && JSON.stringify(r1.counts) === JSON.stringify(['1', '2', '', '', '']) && r1.heights[1] > r1.heights[0] && r1.heights[2] === 0, `Zeile 2 (Säulenhöhen): ${JSON.stringify(r1)}`);
  check(!r0.delta, 'Erste Skala zeigt einen Vergleich');
  check(await js(host, `(()=>{const c=document.getElementById('content'); return c.scrollHeight <= c.clientHeight + 2;})()`), 'Skala scrollt am Beamer');
  const small = await js(host, `(()=>{const z=parseFloat(getComputedStyle(document.querySelector('#content .wrap')).zoom)||1; return [...document.querySelectorAll('.scrow *')].filter(e=>e.children.length===0&&e.textContent.trim()).map(e=>parseFloat(getComputedStyle(e).fontSize)*z).sort((a,b)=>a-b)[0];})()`);
  check(small >= 11.5, `Kleinste Schrift in der Auswertung: ${small} px`);
  await sleep(900); await shot(host, 'k02-auswertung');

  // Spätere Skala mit denselben Aussagen: Vorher/Nachher
  for (let i = 0; i < 2; i++) { await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`); await sleep(300); }
  await waitFor(tabs[0], `document.querySelectorAll('.sq-btns').length === 4 && !document.querySelector('.sq-b.on')`, 6000, 'zweite Skala am Gerät');
  await rate(tabs[0], [4, 2, 4, 5]); await rate(tabs[1], [4, 3, 3, 4]); await rate(tabs[2], [3, 1, 2, 5]);
  await waitFor(host, `document.querySelectorAll('.scrow .sc-d').length === 3`, 5000, 'Vergleich bei drei gleichen Aussagen');
  r0 = await row(0);
  check(r0.mean === '3,7' && /▲ \+1,7/.test(r0.delta) && /vorher 2/.test(r0.delta), `Vorher/Nachher Zeile 1: ${JSON.stringify(r0)}`);
  check(/= gleich/.test((await row(1)).delta) || /▲ \+0,3/.test((await row(1)).delta), `Vorher/Nachher Zeile 2: ${JSON.stringify(await row(1))}`);
  check(!(await row(3)).delta, 'Neue Aussage zeigt einen Vergleich');
  check(/Vergleich mit Folie 1/.test(await js(host, `document.querySelector('.sr-sum').innerText`)) && (await js(host, `document.querySelectorAll('.sc-mark.prev').length`)) === 3, 'Hinweis oder Zeiger auf die frühere Folie fehlt');
  await sleep(900); await shot(host, 'k03-vorher-nachher');

  // Sehr breites Fenster (wie am Beamer mit schmaler Höhe): Säulen bleiben kompakt, nichts scrollt
  host.setContentSize(1885, 787);
  await sleep(900);
  const wide = await js(host, `(()=>{const r=[...document.querySelectorAll('.scrow')].map(e=>e.getBoundingClientRect()); const ct=document.getElementById('content'); return {twoCols: Math.abs(r[0].top-r[1].top) < 2 && r[1].left > r[0].right - 2, scroll: ct.scrollHeight <= ct.clientHeight + 2};})()`);
  check(wide.scroll && wide.twoCols, `Breites Fenster: ${JSON.stringify(wide)}`);
  await shot(host, 'k04-breit');
  tabs.forEach((t) => t.destroy());
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
