// Prüft den Paketinhalt (dist/win-unpacked/resources/app.asar) mit dem offiziellen Electron:
// Server, Oberfläche, Beispiellektion, Hilfeseiten und Schüleransicht kommen aus dem Archiv.
// Aufruf (nach npm run build:store): node main/launch.cjs test/ui/packaged.mjs [Ausgabeordner]
import { app, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, OUT, sleep, report, makeWin, js, waitFor, mustClick, shot, finish } from './lib.mjs';

const ASAR = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');
const check = (c, m) => { if (!c) report(m); };

async function main() {
  if (!fs.existsSync(ASAR)) { console.error(`Kein Paket: ${ASAR} – zuerst npm run build:store`); app.exit(2); return; }
  fs.mkdirSync(OUT, { recursive: true });
  // Dateien im Archiv
  const asar = createRequire(import.meta.url)('@electron/asar');
  const files = new Set(asar.listPackage(ASAR).map((f) => f.replace(/\\/g, '/')));
  for (const f of ['/package.json', '/main/main.js', '/main/preload.cjs', '/build/icon.ico', '/server/index.js', '/shared/prompt.js', '/public/host.html', '/public/editor.css', '/public/themes.css', '/shared/graphics.js',
    '/public/js/editor/editor.js', '/public/js/editor/ai.js', '/public/datenschutz.html', '/public/lizenzen.html', '/public/license.txt', '/public/third-party-notices.txt',
    '/samples/diagramme-und-umfragen.plenum', '/node_modules/express/package.json', '/node_modules/socket.io/client-dist/socket.io.esm.min.js', '/node_modules/qrcode/package.json', '/node_modules/json5/package.json']) check(files.has(f), `Fehlt im Paket: ${f}`);
  for (const f of files) if (/^\/(test|docs|scripts|dist)\//.test(f) || /^\/node_modules\/(electron|electron-builder|socket\.io-client)\//.test(f)) { report(`Gehört nicht ins Paket: ${f}`); break; }
  console.log(`${files.size} Dateien im Archiv`);

  const { startServer } = await import(pathToFileURL(path.join(ASAR, 'server', 'index.js')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plenum-pkg-'));
  const srv = await startServer({ port: 3210, host: '127.0.0.1', tries: 10, token: 'pkgtest', lessonsDir: path.join(tmp, 'lessons'), dataDir: path.join(tmp, 'data'), appVersion: '1.0.0', log: { error: (...a) => report('Server: ' + a.join(' ')), info() {} } });
  const base = `http://127.0.0.1:${srv.port}`;
  await session.fromPartition('host').cookies.set({ url: base, name: 'plenum_host', value: 'pkgtest', httpOnly: true, sameSite: 'strict' });

  const w = makeWin(1366, 768, 'host', 'Paket');
  await w.loadURL(`${base}/host`);
  await waitFor(w, `document.querySelector('.lcard')`, 8000, 'Bibliothek mit Beispiellektion aus dem Paket');
  await sleep(600); await shot(w, 'p01-bibliothek');
  const st = await js(w, `Promise.all(['/datenschutz.html','/lizenzen.html','/license.txt','/third-party-notices.txt','/socket.io/socket.io.esm.min.js','/api/host/qr?u=http%3A%2F%2F192.168.0.10%3A3080'].map(u=>fetch(u).then(r=>[u,r.status,r.headers.get('content-type')])))`);
  for (const [u, s, ct] of st) check(s === 200, `${u} → ${s}`);
  check(/svg/.test(st[5][2] || ''), `QR-Code ist kein SVG (${st[5][2]})`);

  await mustClick(w, '[data-action="present"]', 'Präsentieren');
  await waitFor(w, `document.querySelector('#content .wrap')`, 5000, 'Präsentation');
  const s = makeWin(390, 760, 'stud', 'Schüler');
  await s.loadURL(`${base}/`);
  await waitFor(s, `document.querySelector('#content')?.innerText.includes('Diagramme lesen')`, 8000, 'Schüleransicht aus dem Paket');
  await mustClick(w, '[data-action="next"]', 'Weiter');
  await waitFor(s, `document.querySelector('form.wordform')`, 4000, 'Wortwolke am Handy');
  await js(s, `(()=>{const f=document.querySelector('form.wordform'); f.querySelector('input').value='Paket'; f.requestSubmit();})()`);
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); // Beitritts-Fenster (öffnet sich automatisch) schließen
  if (!(await waitFor(w, `document.querySelector('svg.wcloud text.wc-w[data-k="paket"]')`, 4000, 'Begriff erscheint vorne'))) {
    console.log('  Handy:', (await js(s, `document.getElementById('content').innerText`)).replace(/\s+/g, ' ').slice(0, 240));
    console.log('  Beamer:', await js(w, `(document.querySelector('.modbar')?.innerText || '-') + ' | ' + (document.querySelector('svg.wcloud')?.outerHTML || 'kein svg').slice(0, 300)`));
  }
  await sleep(500); await shot(w, 'p02-wortwolke');
  finish(srv);
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
