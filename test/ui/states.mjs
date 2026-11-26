// UI-Test: Folien ohne Aufgabe bleiben am Beamer („Schau nach vorne“), Stände in der Bibliothek löschen.
// Aufruf: node main/launch.cjs test/ui/states.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish, fullState } from './lib.mjs';

const check = (c, m) => { if (!c) report(m); };

async function main() {
  const { srv, base } = await startTestServer(3250);
  const host = makeWin(1280, 720, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

  // Titelfolie: am Gerät nur der Hinweis, nach vorne zu schauen
  const tab = makeWin(1180, 820, 't1', 'Tablet');
  await tab.loadURL(`${base}/`);
  await waitFor(tab, `document.querySelector('.lookup')`, 8000, 'Hinweis „Schau nach vorne“');
  check(!(await js(tab, `document.querySelector('.hero, .shead')`)), 'Titelfolie darf am Gerät nicht erscheinen');
  await shot(tab, 's01-schau-nach-vorne');
  await mustClick(host, '[data-action="next"]', 'Weiter');
  await waitFor(tab, `document.querySelector('form.wordform')`, 5000, 'Wortwolke am Gerät');

  // Anwesenheit: ein Gerät, das Plenum nicht im Vordergrund hat, erscheint vorne als Anzahl (die Testansicht über 127.0.0.1 meldet nur mit ?presence=1)
  check(!(await js(host, `document.querySelector('.awaybadge')`)), 'Anwesenheits-Hinweis ohne Anlass sichtbar');
  const away = makeWin(1180, 820, 't2', 'Tablet 2');
  await away.loadURL(`${base}/?presence=1`);
  await waitFor(away, `document.querySelector('form.wordform')`, 8000, 'zweites Gerät beigetreten');
  await js(away, `(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'));})()`);
  await waitFor(host, `document.querySelector('.awaybadge b')?.textContent === '1'`, 6000, 'Hinweis „1 nicht in Plenum“');
  await shot(host, 's01a-nicht-in-plenum');
  await js(away, `(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.hasFocus=()=>true; document.dispatchEvent(new Event('visibilitychange'));})()`);
  await waitFor(host, `!document.querySelector('.awaybadge')`, 4000, 'Hinweis verschwindet, wenn das Gerät zurück ist');
  away.destroy();
  await sleep(200);

  // Zwei Stände speichern, Präsentation beenden
  for (const name of ['Klasse 4a', 'Klasse 4b']) {
    await mustClick(host, '[data-action="states"]', 'Stände');
    await waitFor(host, `document.querySelector('form.saveform')`, 3000, 'Speichern-Formular');
    await js(host, `(()=>{const f=document.querySelector('form.saveform'); f.querySelector('input').value=${JSON.stringify(name)}; f.requestSubmit();})()`);
    await sleep(500);
    await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await sleep(200);
  }
  // Vollbild: Schaltfläche schaltet um und zeigt den Zustand; beim Beenden der Präsentation endet auch das Vollbild
  check((await js(host, `document.querySelector('[data-action="full"]')?.getAttribute('aria-pressed')`)) === 'false', 'Vollbild-Schaltfläche fehlt oder ist schon aktiv');
  await mustClick(host, '[data-action="full"]', 'Vollbild');
  await waitFor(host, `document.querySelector('[data-action="full"]').getAttribute('aria-pressed') === 'true'`, 3000, 'Vollbild-Schaltfläche aktiv');
  check(fullState.on, 'Vollbild wurde nicht eingeschaltet');
  await shot(host, 's01b-vollbild-schaltflaeche');
  await mustClick(host, '[data-action="full"]', 'Vollbild beenden');
  await waitFor(host, `document.querySelector('[data-action="full"]').getAttribute('aria-pressed') === 'false'`, 3000, 'Vollbild-Schaltfläche wieder aus');
  check(!fullState.on, 'Vollbild wurde nicht ausgeschaltet');
  await mustClick(host, '[data-action="full"]', 'Vollbild');
  await waitFor(host, `document.querySelector('[data-action="full"]').getAttribute('aria-pressed') === 'true'`, 3000, 'Vollbild-Schaltfläche aktiv');

  await mustClick(host, '[data-action="exit"]', 'Beenden');
  await mustClick(host, '#ov [data-r="1"]', 'Beenden bestätigen');
  await waitFor(host, `document.querySelector('.lcard')`, 6000, 'zurück in der Bibliothek');
  await sleep(200);
  check(!fullState.on, 'Vollbild bleibt nach dem Beenden der Präsentation an');

  // Bibliothek: Stände einzeln und gesamt löschen
  const slots = () => js(host, `[...document.querySelectorAll('#ov .slot .slot-n')].map(e=>e.textContent.trim())`);
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelectorAll('#ov .slot').length >= 2`, 4000, 'Stände im Dialog');
  await shot(host, 's02-staende');
  const before = await slots();
  await mustClick(host, '#ov [data-action="delState"][data-state="klasse-4a"]', 'Stand löschen');
  await mustClick(host, '#ov [data-r="1"]', 'Löschen bestätigen');
  await waitFor(host, `document.querySelectorAll('#ov .slot').length === ${before.length - 1}`, 4000, 'ein Stand weniger');
  check(!(await slots()).includes('Klasse 4a'), 'Klasse 4a noch vorhanden');
  if ((await slots()).length > 1) {
    await mustClick(host, '#ov [data-action="delState"][data-state="_all"]', 'Alle Stände löschen');
  } else {
    await mustClick(host, '#ov [data-action="delState"]', 'Letzten Stand löschen');
  }
  await mustClick(host, '#ov [data-r="1"]', 'Löschen bestätigen');
  await waitFor(host, `!document.querySelector('#ov .slot') && !document.querySelector('.lc-state')`, 4000, 'keine Stände mehr, Karte ohne „Letzter Stand“');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
