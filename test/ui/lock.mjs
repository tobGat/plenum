// UI-Test der Sperre gegen ständiges Umstimmen: Nach zwei Änderungen ist die Antwort am Gerät fixiert,
// die Lehrkraft sieht nur die Anzahl („1 fixiert“); die Einstellung ist im Dialog wählbar.
// Aufruf: node main/launch.cjs test/ui/lock.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish } from './lib.mjs';

const check = (c, m) => { if (!c) report(m); };
const LESSON = { title: 'Sperre-Test', sections: [{ name: 'Einstieg', color: 'teal', icon: 'compass' }], slides: [
  { type: 'poll', section: 'Einstieg', title: 'Lieblingsfach', question: 'Was magst du am liebsten?', options: ['Mathematik', 'Sport', 'Musik'] },
  { type: 'scale', section: 'Einstieg', title: 'Einschätzung', statements: ['Ich fühle mich sicher.', 'Ich brauche noch Übung.'], steps: 5 },
] };

async function main() {
  const { srv, base } = await startTestServer(3360);
  const host = makeWin(1280, 720, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');

  // Einstellung: Vorgabe „höchstens zweimal“
  await mustClick(host, '[data-action="settings"]', 'Einstellungen');
  await waitFor(host, `document.getElementById('setChanges')`, 4000, 'Einstellung „Antwort ändern“');
  check((await js(host, `document.getElementById('setChanges').value`)) === '2', 'Vorgabe ist nicht „höchstens zweimal“');
  await sleep(500); await shot(host, 's01-einstellung');
  await mustClick(host, '[data-x="close"]', 'Einstellungen schließen');

  const L = await js(host, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify({ lesson: LESSON }))}}).then(r=>r.json())`);
  await js(host, 'location.reload()');
  await waitFor(host, `document.querySelector('[data-action="present"][data-id="${L.id}"]')`, 8000, 'Lektion in der Bibliothek');
  await mustClick(host, `[data-action="present"][data-id="${L.id}"]`, 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

  const tab = makeWin(420, 820, 'persist:x', 'Handy');
  await tab.loadURL(`${base}/`);
  await waitFor(tab, `document.querySelectorAll('.vopt').length === 3`, 8000, 'Umfrage am Gerät');
  const vote = async (i) => { await js(tab, `document.querySelectorAll('.vopt')[${i}].click()`); await sleep(350); };
  const selected = () => js(tab, `[...document.querySelectorAll('.vopt')].findIndex(e=>e.classList.contains('sel'))`);
  await vote(0);
  check(/noch ändern/.test(await js(tab, `document.getElementById('content').innerText`)), 'Hinweis „noch ändern“ fehlt nach der ersten Antwort');
  await vote(1);
  check(/noch einmal ändern/.test(await js(tab, `document.getElementById('toasts').innerText`)), 'Ansage „noch einmal ändern“ fehlt');
  check(!(await js(tab, `document.querySelector('.locknote')`)), 'zu früh fixiert');
  await vote(2);
  await waitFor(tab, `document.querySelector('.locknote')`, 3000, 'Hinweis „fixiert“');
  check(await js(tab, `document.getElementById('content').classList.contains('locked')`), 'Aufgabe ist nicht gesperrt');
  check(!/noch ändern/.test(await js(tab, `document.getElementById('content').innerText`)), '„noch ändern“ steht trotz Sperre da');
  check((await js(tab, `getComputedStyle(document.querySelector('.vopt')).pointerEvents`)) === 'none', 'Antworten sind noch anklickbar');
  check(await js(tab, `document.documentElement.scrollWidth <= innerWidth`), 'Seite am Handy zu breit');
  await sleep(500); await shot(tab, 's02-fixiert');
  // Ein trotzdem gesendeter Versuch wird abgelehnt, die gezählte Antwort bleibt
  await vote(0);
  await sleep(400);
  check((await selected()) === 2, `Gezählte Antwort bleibt nicht stehen (${await selected()})`);

  // Lehrkraft: nur die Anzahl
  await waitFor(host, `document.querySelector('.lockbadge')`, 3000, 'Plakette „fixiert“');
  check(/1\s*fixiert/.test(await js(host, `document.querySelector('.lockbadge').innerText`)), 'Plakette zeigt nicht „1 fixiert“');
  await sleep(600); await shot(host, 's03-beamer');

  // Nächste Aufgabe: wieder frei, Plakette weg; Skala – Überschreiben zählt, weitere Aussagen nicht
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  await waitFor(tab, `document.querySelectorAll('.sq-btns').length === 2`, 5000, 'Skala am Gerät');
  check(!(await js(host, `document.querySelector('.lockbadge')`)), 'Plakette bleibt nach dem Weiterblättern');
  check(!(await js(tab, `document.querySelector('.locknote')`)), 'Sperre gilt noch bei der nächsten Aufgabe');
  const rate = async (row, v) => { await js(tab, `document.querySelectorAll('.sq-btns')[${row}].querySelectorAll('.sq-b')[${v - 1}].click()`); await sleep(350); };
  await rate(0, 1); await rate(0, 2); await rate(0, 3);
  await waitFor(tab, `document.querySelector('.locknote')`, 3000, 'Skala fixiert');
  await rate(1, 4); // zweite Aussage war noch offen → geht weiterhin
  check((await js(tab, `[...document.querySelectorAll('.sq-btns')[1].querySelectorAll('.sq-b')].findIndex(e=>e.classList.contains('on'))`)) === 3, 'Offene Aussage lässt sich nach der Sperre nicht mehr bewerten');
  await sleep(400); await shot(tab, 's04-skala');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
