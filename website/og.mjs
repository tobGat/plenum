// Erzeugt das Vorschaubild für geteilte Links (WhatsApp, Signal, Teams …): website/img/og.jpg, 1200 × 630.
// Aufruf: node main/launch.cjs website/og.mjs
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname, root = path.join(here, '..');
const u = (p) => pathToFileURL(path.join(root, p)).href;
const page = `<!doctype html><html lang="de"><meta charset="utf-8"><style>
@font-face{font-family:Lexend;src:url(${u('public/fonts/lexend-latin-wght.woff2')}) format("woff2");font-weight:300 800}
@font-face{font-family:Inter;src:url(${u('public/fonts/inter-latin-wght.woff2')}) format("woff2");font-weight:300 800}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:Inter,sans-serif;color:#fff;position:relative;
  background:radial-gradient(900px 520px at 88% 8%,#7c6cf5 0,transparent 60%),radial-gradient(700px 500px at 0 100%,#0d9488 0,transparent 62%),linear-gradient(135deg,#312e81,#4338ca 55%,#4f46e5)}
body::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.13) 1.5px,transparent 1.5px);background-size:26px 26px}
.txt{position:absolute;left:64px;top:58px;width:520px}
.brand{display:flex;align-items:center;gap:16px;font:700 34px Lexend}
.brand img{width:62px;height:62px;border-radius:16px;box-shadow:0 10px 24px -8px rgba(0,0,0,.5)}
h1{font:800 66px/1.06 Lexend;letter-spacing:-.02em;margin-top:52px}
h1 em{font-style:normal;color:#a5f3fc}
p{font:500 26px/1.4 Inter;color:#e0e7ff;margin-top:26px}
.tags{display:flex;gap:10px;margin-top:34px}
.tags span{font:600 19px Lexend;padding:9px 16px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28)}
.shot{position:absolute;left:630px;top:112px;width:640px;border-radius:18px;overflow:hidden;box-shadow:0 40px 70px -24px rgba(2,6,23,.75);border:1px solid rgba(255,255,255,.35);transform:rotate(-2deg)}
.shot img,.tab img{display:block;width:100%}
.tab{position:absolute;left:770px;top:368px;width:330px;border:10px solid #0b1220;border-radius:22px;overflow:hidden;background:#0b1220;box-shadow:0 34px 50px -20px rgba(2,6,23,.8);transform:rotate(4deg)}
</style>
<div class="txt"><div class="brand"><img src="${u('website/img/icon.png')}" alt="">Plenum</div>
<h1>Unterricht, bei dem <em>alle mitmachen</em></h1>
<p>Folien, Umfragen, Wortwolken und Quiz – live am Beamer und auf den Geräten der Klasse.</p>
<div class="tags"><span>Ohne Konto</span><span>Ohne Cloud</span><span>Für Windows</span></div></div>
<div class="shot"><img src="${u('website/img/umfrage.png')}" alt=""></div>
<div class="tab"><img src="${u('website/img/tablet-umfrage.png')}" alt=""></div>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const tmp = path.join(app.getPath('temp'), `plenum-og-${process.pid}.html`);
  fs.writeFileSync(tmp, page);
  const win = new BrowserWindow({ width: 1200, height: 630, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(tmp);
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => 0))))');
  await new Promise((r) => setTimeout(r, 600));
  const img = (await win.webContents.capturePage()).resize({ width: 1200, height: 630, quality: 'best' });
  const out = path.join(here, 'img', 'og.jpg');
  fs.writeFileSync(out, img.toJPEG(86));
  fs.rmSync(tmp, { force: true });
  console.log(`✓ ${out} (${Math.round(fs.statSync(out).size / 1024)} kB)`);
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
