// Plenum – Electron-Hauptprozess: startet den lokalen Server und das Programmfenster
import { app, BrowserWindow, Menu, dialog, shell, session, powerSaveBlocker, ipcMain, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { startServer } from '../server/index.js';
import { parseImport } from '../server/aiimport.js';
import { withNewIds } from '../shared/schema.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const isStore = !!process.windowsStore;
const ICON = path.join(ROOT, 'build', 'icon.ico');
const PRELOAD = path.join(ROOT, 'main', 'preload.cjs');
let win = null, srv = null, base = '', blocker = null;
// Startprobe für Tests (PLENUM_SMOKE=1): unsichtbares Fenster, temporäre Ordner, prüft die Bibliothek und beendet sich
const SMOKE = process.env.PLENUM_SMOKE === '1';
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'plenum-smoke-')));
const lessonsDirDefault = () => (SMOKE ? path.join(app.getPath('userData'), 'Lektionen') : path.join(app.getPath('documents'), 'Plenum-Lektionen'));

// ---------- Protokoll (rotierend, nur lokal) ----------
let logFile = null;
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  try {
    if (!logFile) { const d = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(d, { recursive: true }); logFile = path.join(d, 'plenum.log'); }
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1e6) fs.renameSync(logFile, logFile.replace(/\.log$/, '.alt.log'));
    fs.appendFileSync(logFile, line);
  } catch { /* Protokoll ist nicht kritisch */ }
}
const logger = { error: (...a) => log('FEHLER', ...a), info: (...a) => log(...a) };
process.on('uncaughtException', (e) => log('uncaughtException', e));
process.on('unhandledRejection', (e) => log('unhandledRejection', e));

const fileArg = (argv) => argv.slice(1).find((a) => /\.plenum$/i.test(a) && fs.existsSync(a));
function importFile(file) {
  try {
    const r = parseImport(fs.readFileSync(file, 'utf8'), { appVersion: app.getVersion() });
    if (!r.lesson) throw new Error(r.errors.join(' '));
    const L = srv.store.save(srv.store.has(r.lesson.id) ? withNewIds(r.lesson) : r.lesson);
    if (win) win.webContents.send('open-lesson', L.id);
  } catch (e) { log('Import fehlgeschlagen', file, e); dialog.showErrorBox('Plenum', `Die Datei konnte nicht geöffnet werden:\n${e.message}`); }
}

function windowDefaults() {
  return { icon: ICON, backgroundColor: '#f4f5f9', autoHideMenuBar: true, webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true } };
}
// Tastenkürzel ohne Menüleiste: F11 Vollbild, Esc beendet Vollbild, Strg +/−/0 Zoom, F5 neu laden
function shortcuts(w) {
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const wc = w.webContents, k = input.key;
    if (k === 'F11') w.setFullScreen(!w.isFullScreen());
    else if (k === 'Escape' && w.isFullScreen()) w.setFullScreen(false);
    else if (k === 'F5') wc.reload();
    else if (input.control && (k === '+' || k === '=')) wc.setZoomLevel(wc.getZoomLevel() + 0.5);
    else if (input.control && k === '-') wc.setZoomLevel(wc.getZoomLevel() - 0.5);
    else if (input.control && k === '0') wc.setZoomLevel(0);
    else if (input.control && input.shift && k.toLowerCase() === 'i') wc.toggleDevTools();
    else return;
    e.preventDefault();
  });
  const tellFull = () => { if (!w.isDestroyed()) w.webContents.send('fullscreen', w.isFullScreen()); };
  w.on('enter-full-screen', tellFull); w.on('leave-full-screen', tellFull);
  w.webContents.on('render-process-gone', (e, d) => log('render-process-gone', d));
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${base}/`)) return { action: 'allow', overrideBrowserWindowOptions: windowDefaults() }; // Moderation, Schüleransicht, Hilfe
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`${base}/`)) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
}

async function start() {
  Menu.setApplicationMenu(null);
  const token = crypto.randomBytes(24).toString('hex');
  try {
    srv = await startServer({ port: 3080, host: process.env.PLENUM_BIND || '0.0.0.0', tries: 10, token, isStore, log: logger,
      lessonsDir: lessonsDirDefault(), dataDir: app.getPath('userData'), appVersion: app.getVersion() });
  } catch (e) {
    log('Serverstart', e);
    dialog.showErrorBox('Plenum', `Plenum konnte nicht starten, weil kein freier Netzwerk-Port (3080–3089) gefunden wurde.\n\n${e.message}`);
    app.quit();
    return;
  }
  base = `http://127.0.0.1:${srv.port}`;
  await session.defaultSession.cookies.set({ url: base, name: 'plenum_host', value: token, httpOnly: true, sameSite: 'strict' });
  app.on('browser-window-created', (e, w) => shortcuts(w));

  ipcMain.on('presenting', (e, on) => {
    if (!e.senderFrame || !e.senderFrame.url.startsWith(base)) return;
    if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
    if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  });
  // Vollbild des aufrufenden Fensters: 'toggle', 'off' oder 'get' – liefert den neuen Zustand
  ipcMain.handle('fullScreen', (e, mode) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || !e.senderFrame.url.startsWith(base)) return false;
    if (mode === 'get') return w.isFullScreen();
    const on = mode === 'toggle' ? !w.isFullScreen() : false;
    if (on !== w.isFullScreen()) w.setFullScreen(on);
    return on;
  });
  // PDF-Export: Speicherort wählen, Druckseite /print in einem unsichtbaren Fenster zeichnen lassen und als PDF drucken
  let lastPdf = null;
  ipcMain.handle('exportPdf', async (e, o) => {
    if (!e.senderFrame || !e.senderFrame.url.startsWith(base) || !o || !/^[\w-]{1,80}$/.test(String(o.lesson))) return { ok: false, error: 'Nicht erlaubt.' };
    const name = String(o.name || 'Plenum').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Plenum';
    const dir = lastPdf && fs.existsSync(path.dirname(lastPdf)) ? path.dirname(lastPdf) : app.getPath('documents');
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: 'PDF speichern', defaultPath: path.join(dir, `${name}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    const qs = new URLSearchParams({ lesson: String(o.lesson), variant: ['solution', 'results'].includes(o.variant) ? o.variant : 'blank', format: o.format === 'handout' ? 'handout' : 'slides' });
    if (o.variant === 'results' && /^[\w-]{1,40}$/.test(String(o.state))) qs.set('state', String(o.state));
    if (o.notes) qs.set('notes', '1');
    if (o.light) qs.set('light', '1');
    const pw = new BrowserWindow({ show: false, width: 1280, height: 720, ...windowDefaults(), webPreferences: { ...windowDefaults().webPreferences, backgroundThrottling: false } });
    try {
      await pw.loadURL(`${base}/print?${qs}`);
      const res = await Promise.race([pw.webContents.executeJavaScript('window.printReady', true), new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Das Zeichnen der Folien hat zu lange gedauert.' }), 180000))]);
      if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'Die Folien konnten nicht gezeichnet werden.' };
      const pdf = await pw.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
      try { await fs.promises.writeFile(r.filePath, pdf); } catch (err) {
        return { ok: false, error: err.code === 'EBUSY' || err.code === 'EPERM' ? 'Die Datei ist gerade in einem anderen Programm geöffnet. Bitte dort schließen oder einen anderen Namen wählen.' : `Die Datei konnte nicht gespeichert werden: ${err.message}` };
      }
      lastPdf = r.filePath;
      return { ok: true, path: r.filePath, slides: res.slides, over: res.over || [] };
    } catch (err) { log('PDF-Export', err); return { ok: false, error: `Das PDF konnte nicht erstellt werden: ${err.message}` }; } finally { if (!pw.isDestroyed()) pw.destroy(); }
  });
  ipcMain.handle('openPdf', (e) => (e.senderFrame.url.startsWith(base) && lastPdf ? shell.openPath(lastPdf) : 'nicht erlaubt'));
  ipcMain.handle('openPath', (e, p) => (e.senderFrame.url.startsWith(base) && path.resolve(p) === path.resolve(srv.store.lessonsDir) ? shell.openPath(p) : 'nicht erlaubt'));
  ipcMain.handle('copyText', (e, t) => { if (!e.senderFrame.url.startsWith(base)) return false; clipboard.writeText(String(t).slice(0, 2e6)); return true; });
  ipcMain.handle('chooseFolder', async (e, def) => {
    if (!e.senderFrame.url.startsWith(base)) return null;
    const r = await dialog.showOpenDialog(win, { title: 'Ordner für Lektionen wählen', defaultPath: def || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  win = new BrowserWindow({ width: 1400, height: 900, show: false, title: 'Plenum', ...windowDefaults() });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.once('ready-to-show', async () => {
    if (SMOKE) {
      const ok = await win.webContents.executeJavaScript(`new Promise((r) => { const t = Date.now(); (function f() { if (document.querySelector('.lcard') && window.plenumApp) r(true); else if (Date.now() - t > 10000) r(false); else setTimeout(f, 100); })(); })`);
      console.log(ok ? `SMOKE OK – Bibliothek geladen, Port ${srv.port}, ${srv.store.list().length} Lektion(en)` : 'SMOKE FEHLER – Bibliothek nicht geladen');
      srv.close(); app.exit(ok ? 0 : 1); return;
    }
    win.maximize(); win.show();
  });
  win.on('closed', () => { win = null; });
  win.loadURL(`${base}/host`);
  const f = fileArg(process.argv);
  if (f) win.webContents.once('did-finish-load', () => importFile(f));
  log(`Plenum ${app.getVersion()} gestartet auf Port ${srv.port}${isStore ? ' (Store)' : ''}`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv) => { const f = fileArg(argv); if (f && srv) importFile(f); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  if (!isStore) app.setAppUserModelId('tobGat.Plenum');
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { try { if (srv) srv.flush(); } catch (e) { log(e); } });
}
