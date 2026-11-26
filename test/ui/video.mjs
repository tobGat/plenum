// UI-Test der Video-Folie: Startbild am Beamer, Klick bettet das Video ein, Geräte der Klasse zeigen nur die Aufträge,
// die Seite der Klasse darf nichts von außen laden, im PDF steht die Adresse.
// Ohne VIDEO_NET=1 werden Anfragen an YouTube auf eine lokale Datei umgeleitet (der Test läuft dann auch ohne Internet).
// Aufruf: node main/launch.cjs test/ui/video.mjs [Ausgabeordner]
import { app, session } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish } from './lib.mjs';

const check = (c, m) => { if (!c) report(m); };
const NET = process.env.VIDEO_NET === '1';
const YT = 'https://youtu.be/jNQXAC9IVRw?t=5';
const LESSON = { title: 'Video-Test', subject: 'Biologie', grade: '6. Schulstufe', sections: [{ name: 'Einstieg', color: 'teal', icon: 'compass' }], slides: [
  { type: 'video', section: 'Einstieg', title: 'Video: Im Zoo', url: YT, end: '0:15', intro: 'Ein sehr kurzer Film aus dem Zoo.', tasks: ['Welches Tier ist zu sehen?', 'Was sagt der Sprecher über die Rüssel?'], discussion: 'Was ist dir aufgefallen?' },
  { type: 'film', section: 'Einstieg', title: 'Ohne Aufträge', url: 'www.youtube.com/watch?v=jNQXAC9IVRw' },
  { type: 'video', section: 'Einstieg', title: 'Andere Seite', url: 'https://example.org/filme/wasser', tasks: ['Achte auf die Stationen.'] },
  { type: 'video', section: 'Einstieg', title: 'Kaputt', url: 'javascript:alert(1)' },
] };

async function main() {
  const { srv, base } = await startTestServer(3350);
  if (!NET) for (const part of ['host', 'persist:x']) session.fromPartition(part).webRequest.onBeforeRequest({ urls: ['https://*.youtube-nocookie.com/*', 'https://*.youtube.com/*', 'https://*.ytimg.com/*', 'https://*.googlevideo.com/*', 'https://example.org/*'] }, (d, cb) => cb({ redirectURL: `${base}/license.txt` })); // statt YouTube eine lokale Datei – so entsteht kein Ladefehler
  const host = makeWin(1280, 720, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');

  // Sicherheitsrichtlinie: nur die Lehrkraft-Seiten dürfen YouTube einbetten
  const csp = await js(host, `Promise.all(['/host','/'].map(u=>fetch(u).then(r=>r.headers.get('content-security-policy'))))`);
  check(/frame-src 'self' https:\/\/www\.youtube-nocookie\.com/.test(csp[0]), 'Lehrkraft-Seite erlaubt das Einbetten nicht');
  check(!/youtube|https:/.test(csp[1]), `Seite der Klasse erlaubt Inhalte von außen: ${csp[1]}`);

  // Import: Synonym „film“, fehlendes https://, ungültige Adresse wird übersprungen
  const r = await js(host, `fetch('/api/host/import/parse',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify({ text: JSON.stringify(LESSON) }))}}).then(r=>r.json())`);
  check(r.lesson && r.lesson.slides.length === 3, `Import: ${r.lesson ? r.lesson.slides.length : 0} statt 3 Folien`);
  check(r.lesson && r.lesson.slides[1].type === 'video' && r.lesson.slides[1].url === 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'Import: Adresse ohne https:// nicht ergänzt');
  check((r.errors || []).some((e) => /Adresse des Videos ist ungültig/.test(e)), 'Import: ungültige Adresse nicht gemeldet');
  const L = await js(host, `fetch('/api/host/import/commit',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify({ lesson: r.lesson, mode: 'new' }))}}).then(r=>r.json())`);
  await js(host, 'location.reload()');
  await waitFor(host, `document.querySelector('[data-action="present"][data-id="${L.id}"]')`, 8000, 'Video-Lektion in der Bibliothek');

  await mustClick(host, `[data-action="present"][data-id="${L.id}"]`, 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  await waitFor(host, `document.querySelector('button.vposter')`, 4000, 'Startbild des Videos');
  check(!(await js(host, `document.querySelector('iframe.vframe')`)), 'Video wird ohne Klick geladen');
  check((await js(host, `document.querySelectorAll('.vtasks li').length`)) === 2, 'Beobachtungsaufträge fehlen am Beamer');
  check(/ab 0:05 bis 0:15/.test(await js(host, `document.querySelector('.vposter').innerText`)), 'Ausschnitt (Beginn/Ende) wird nicht angezeigt');
  await sleep(700); await shot(host, 'v01-startbild');

  // Gerät der Klasse: Aufträge, aber kein Video und keine Adresse
  const tab = makeWin(1180, 820, 'persist:x', 'Tablet');
  await tab.loadURL(`${base}/`);
  await waitFor(tab, `document.querySelector('.vtasks')`, 8000, 'Aufträge am Gerät');
  check(!(await js(tab, `document.querySelector('iframe, video, .vposter')`)), 'Gerät der Klasse zeigt das Video');
  check(!(await js(tab, `document.body.innerHTML.includes('youtu')`)), 'Gerät der Klasse kennt die Video-Adresse');
  await sleep(500); await shot(tab, 'v02-geraet');

  // Klick bettet ein (youtube-nocookie, mit Beginn und Ende), „Video schließen“ entfernt es wieder
  await mustClick(host, 'button.vposter', 'Video abspielen');
  await waitFor(host, `document.querySelector('iframe.vframe')`, 3000, 'eingebettetes Video');
  const src = await js(host, `document.querySelector('iframe.vframe').src`);
  check(/^https:\/\/www\.youtube-nocookie\.com\/embed\/jNQXAC9IVRw\?/.test(src) && /start=5/.test(src) && /end=15/.test(src) && /autoplay=1/.test(src), `Einbettungsadresse falsch: ${src}`);
  if (NET) { await sleep(9000); await shot(host, 'v03-video-laeuft'); }
  await mustClick(host, '[data-action="t:stop"]', 'Video schließen');
  await waitFor(host, `!document.querySelector('iframe.vframe') && document.querySelector('button.vposter')`, 3000, 'Startbild nach dem Schließen');

  // Folie ohne Aufträge: Video in voller Breite; fremde Seite: nur „Im Browser öffnen“
  await mustClick(host, '[data-action="next"]', 'Weiter');
  await waitFor(host, `document.querySelector('.vsolo button.vposter')`, 3000, 'Video ohne Aufträge');
  await sleep(600); await shot(host, 'v04-ohne-auftraege');
  await mustClick(host, '[data-action="next"]', 'Weiter');
  await waitFor(host, `document.querySelector('.vposter a[href="https://example.org/filme/wasser"]')`, 3000, 'Link „Im Browser öffnen“');
  check(!(await js(host, `document.querySelector('button.vposter')`)), 'Nicht einbettbares Video hat einen Abspielknopf');
  for (let i = 0; i < 3; i++) { const o = await js(host, `(()=>{const m=document.getElementById('content'); return m.scrollHeight-m.clientHeight;})()`); check(o <= 2, `Video-Folie läuft über (${o}px)`); }

  // Editor: neue Video-Folie beginnt ohne Adresse und meldet das
  await mustClick(host, '[data-action="exit"]', 'Beenden');
  await mustClick(host, '#ov [data-r="1"]', 'Beenden bestätigen');
  await waitFor(host, `document.querySelector('.lcard')`, 6000, 'zurück in der Bibliothek');

  // PDF: Druckseite zeigt die Adresse statt eines Abspielknopfs
  const pw = makeWin(1280, 720, 'host', 'Druck');
  await pw.loadURL(`${base}/print?lesson=${L.id}`);
  const res = await Promise.race([js(pw, 'window.printReady'), sleep(60000).then(() => ({ ok: false, error: 'Zeitüberschreitung' }))]);
  check(res && res.ok && res.slides === 3 && !(res.over || []).length, `Druckseite: ${JSON.stringify(res)}`);
  if (res && res.ok) {
    const d = await js(pw, `(()=>{const f=document.querySelector('iframe').contentDocument; return { url: f.querySelector('.vurl')?.textContent || '', btn: !!f.querySelector('button.vposter, .vbar'), frames: f.querySelectorAll('iframe').length };})()`);
    check(/youtube\.com\/watch\?v=jNQXAC9IVRw/.test(d.url), `Druck: Adresse fehlt (${d.url})`);
    check(d.frames === 0, 'Druck: Video eingebettet');
  }
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
