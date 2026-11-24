// Gemeinsame Helfer für die UI-Tests (offizielles Electron, offscreen, je Gerät eigene Partition)
import { app, BrowserWindow, session, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { startServer } from '../../server/index.js';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const OUT = path.resolve(process.argv.find((a, i) => i > 1 && !a.startsWith('-') && !a.endsWith('.mjs') && !a.endsWith('.plenum')) || path.join(os.tmpdir(), 'plenum-ui'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const problems = [];
export const report = (msg) => { problems.push(msg); console.log('  ✗ ' + msg); };

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Wie main.js, aber ohne die echte Zwischenablage zu überschreiben: der Test liest den kopierten Text hier
export const clip = { text: '' };
ipcMain.handle('copyText', (e, t) => { clip.text = String(t); return true; });

function watch(win, name) {
  const wc = win.webContents;
  wc.on('console-message', (e, level, message) => {
    const lv = e.level ?? level, msg = e.message ?? message;
    if (lv === 'error' || lv === 3 || lv === 'warning' || lv === 2) report(`${name} console ${lv}: ${msg}`);
  });
  wc.on('render-process-gone', (e, d) => report(`${name} renderer gone: ${d.reason}`));
  wc.on('did-fail-load', (e, code, desc, url) => report(`${name} load failed ${code} ${desc} ${url}`));
  wc.on('preload-error', (e, p, err) => report(`${name} preload error ${err}`));
  let last = null;
  wc.on('paint', (e, d, img) => { last = img; });
  win._lastPaint = () => last;
}

export function makeWin(w, h, partition, name) {
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true,
    webPreferences: { offscreen: true, partition, preload: path.join(ROOT, 'main', 'preload.cjs'), contextIsolation: true, sandbox: true } });
  win.webContents.setFrameRate(20);
  watch(win, name);
  return win;
}

export const js = (win, code) => win.webContents.executeJavaScript(code, true);
export async function waitFor(win, cond, ms = 6000, label = cond) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await js(win, `!!(${cond})`)) return true; } catch { /* Seite lädt noch */ }
    await sleep(80);
  }
  report(`Zeitüberschreitung: ${label}`);
  return false;
}
export const click = (win, sel) => js(win, `(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.click(); return true;})()`);
export async function mustClick(win, sel, name) { if (!(await click(win, sel))) report(`${name}: Element fehlt ${sel}`); }

export async function shot(win, file) {
  await sleep(60);
  let img;
  try { img = await win.webContents.capturePage(); } catch { img = null; }
  if (!img || img.isEmpty()) { win.webContents.invalidate(); await sleep(150); img = win._lastPaint(); }
  if (img) fs.writeFileSync(path.join(OUT, file + '.png'), img.toPNG());
}

// Server mit bekanntem Token, leeren Ordnern und Beispiellektion; Cookie für das Lehrkraft-Profil
export async function startTestServer(port = 3180) {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plenum-ui-'));
  const srv = await startServer({ port, host: '127.0.0.1', tries: 10, token: 'uitest', lessonsDir: path.join(tmp, 'lessons'), dataDir: path.join(tmp, 'data'),
    samplesDir: path.join(ROOT, 'samples'), appVersion: '1.0.0', log: { error: (...a) => report('Server: ' + a.map(String).join(' ')), info() {} } });
  const base = `http://127.0.0.1:${srv.port}`;
  await session.fromPartition('host').cookies.set({ url: base, name: 'plenum_host', value: 'uitest', httpOnly: true, sameSite: 'strict' });
  return { srv, base, tmp };
}

export function finish(srv, extra = '') {
  if (extra) console.log(extra);
  console.log(problems.length ? `\n${problems.length} Problem(e).` : '\nKeine Probleme gefunden.');
  fs.writeFileSync(path.join(OUT, 'problems.txt'), problems.join('\n'));
  try { srv.close(); } catch { /* egal */ }
  app.exit(problems.length ? 1 : 0);
}
