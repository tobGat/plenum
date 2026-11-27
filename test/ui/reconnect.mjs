// UI-Test: Schülergeräte finden nach einer Unterbrechung von selbst zurück – ohne dass die Präsentation neu gestartet wird.
// Geprüft werden: vom Server getrennt, Leitung gekappt, „tote“ Verbindung (Gerät hält sie für offen, der Server hört nicht mehr zu).
// Aufruf: node main/launch.cjs test/ui/reconnect.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, startTestServer, finish } from './lib.mjs';

const check = (c, m) => { if (!c) report(m); };
const LESSON = { title: 'Pause-Test', sections: [{ name: 'Einstieg' }], slides: [
  { type: 'poll', section: 'Einstieg', title: 'Erste Frage', question: 'A oder B?', options: ['A', 'B'] },
  { type: 'wordcloud', section: 'Einstieg', title: 'Zweite Frage', question: 'Ein Begriff?', maxWords: 2 },
  { type: 'poll', section: 'Einstieg', title: 'Dritte Frage', question: 'C oder D?', options: ['C', 'D'] },
] };

async function main() {
  const { srv, base } = await startTestServer(3370);
  const host = makeWin(1280, 720, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  const L = await js(host, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify({ lesson: LESSON }))}}).then(r=>r.json())`);
  await js(host, 'location.reload()');
  await waitFor(host, `document.querySelector('[data-action="present"][data-id="${L.id}"]')`, 8000, 'Lektion in der Bibliothek');
  await mustClick(host, `[data-action="present"][data-id="${L.id}"]`, 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

  const tab = makeWin(420, 820, 'persist:x', 'Handy');
  await tab.loadURL(`${base}/`);
  await waitFor(tab, `document.querySelectorAll('.vopt').length === 2`, 8000, 'Umfrage am Gerät');
  const students = () => [...srv.io.sockets.sockets.values()].filter((s) => s.data.cid);
  const next = () => js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  const overlayText = () => js(tab, `document.getElementById('ov').innerText`);
  check(students().length === 1, `Ein Gerät erwartet, verbunden sind ${students().length}`);

  // 1. Vom Server getrennt (socket.io verbindet dann nicht von selbst neu)
  let old = students()[0].id;
  students()[0].disconnect(true);
  await waitFor(tab, `!document.getElementById('ov').innerHTML`, 6000, 'Hinweis verschwindet nach Trennung durch den Server');
  check(students().length === 1 && students()[0].id !== old, 'Gerät hat sich nach der Trennung durch den Server nicht neu verbunden');

  // 2. Leitung gekappt (wie WLAN weg): Hinweis erscheint und verschwindet wieder, die inzwischen gewechselte Folie ist da
  old = students()[0].id;
  students()[0].conn.transport.socket.terminate();
  await sleep(150);
  await next();
  await waitFor(tab, `document.querySelector('.wordform') && !document.getElementById('ov').innerHTML`, 8000, 'Neue Folie nach gekappter Leitung');
  check(students().length === 1 && students()[0].id !== old, 'Gerät hat sich nach gekappter Leitung nicht neu verbunden');

  // Rückkehr zur Seite ohne Unterbrechung: Getipptes bleibt stehen (kein Neuzeichnen)
  await js(tab, `(()=>{const i=document.querySelector('.wordform input'); i.value='Halbfertig'; })()`);
  await js(tab, `window.dispatchEvent(new Event('online'))`);
  await sleep(700);
  check((await js(tab, `document.querySelector('.wordform input').value`)) === 'Halbfertig', 'Rückkehr zur Seite löscht getippten Text');

  // 3. Tote Verbindung nach einer Pause: Der Server liest nichts mehr von diesem Gerät, das Gerät merkt es nicht.
  //    Kommt das Kind zur Seite zurück, prüft sie die Verbindung, bekommt keine Antwort und baut sie neu auf.
  old = students()[0].id;
  students()[0].conn.transport.socket._socket.pause();
  await sleep(1700);
  await js(tab, `window.dispatchEvent(new Event('focus'))`);
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !(students().some((s) => s.id !== old && s.connected))) await sleep(200);
  check(students().some((s) => s.id !== old), 'Tote Verbindung wird nicht neu aufgebaut');
  students().filter((s) => s.id === old).forEach((s) => s.disconnect(true));
  await sleep(300);
  await next();
  await waitFor(tab, `document.querySelectorAll('.vopt').length === 2 && !document.getElementById('ov').innerHTML`, 6000, 'Dritte Folie nach toter Verbindung');
  // Antwort kommt an
  await js(tab, `document.querySelectorAll('.vopt')[1].click()`);
  await sleep(500);
  const slide3 = L.slides[2].id;
  check(srv.rooms.hostState().aggs[slide3]?.n === 1, 'Antwort nach dem Wiederverbinden kommt nicht an');
  check(!(await overlayText()), `Hinweis steht noch da: ${await overlayText()}`);

  // 4. Präsentation beendet und neu gestartet: Gerät steigt von selbst wieder ein
  await js(host, `fetch('/api/host/info').then(()=>0)`);
  srv.rooms.stop();
  await waitFor(tab, `/beendet/.test(document.getElementById('ov').innerText)`, 4000, 'Hinweis „beendet“');
  srv.rooms.present(L.id);
  await waitFor(tab, `!document.getElementById('ov').innerHTML && document.querySelectorAll('.vopt').length === 2`, 6000, 'Wiedereinstieg nach Neustart');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
