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
.txt{position:absolute;left:60px;top:54px;width:450px}
.brand{display:flex;align-items:center;gap:16px;font:700 34px Lexend}
.brand img{width:62px;height:62px;border-radius:16px;box-shadow:0 10px 24px -8px rgba(0,0,0,.5)}
h1{font:800 60px/1.07 Lexend;letter-spacing:-.02em;margin-top:58px}
h1 em{font-style:normal;color:#a5f3fc}
p{font:500 25px/1.4 Inter;color:#e0e7ff;margin-top:24px}
.tags{display:flex;gap:10px;margin-top:34px}
.tags span{font:600 18px Lexend;padding:8px 15px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28)}
/* Geräte der Klasse: Laptop mit Aufgabe, davor ein Tablet mit Umfrage */
.glow{position:absolute;left:560px;top:90px;width:620px;height:460px;border-radius:50%;background:radial-gradient(closest-side,rgba(165,243,252,.34),transparent);filter:blur(10px)}
.laptop{position:absolute;left:548px;top:112px;width:600px}
.lscreen{border:11px solid #0b1220;border-bottom-width:13px;border-radius:20px 20px 0 0;overflow:hidden;background:#0b1220;box-shadow:0 0 0 1.5px rgba(255,255,255,.22)}
.lbase{height:17px;margin:0 -44px;border-radius:0 0 18px 18px;background:linear-gradient(#e5e7eb,#9ca3af);box-shadow:0 30px 44px -16px rgba(2,6,23,.75)}
.lbase::before{content:"";display:block;width:96px;height:6px;margin:0 auto;border-radius:0 0 8px 8px;background:#6b7280;opacity:.55}
.tab{position:absolute;left:868px;top:318px;width:306px;border:10px solid #0b1220;border-radius:24px;overflow:hidden;background:#0b1220;box-shadow:0 0 0 1.5px rgba(255,255,255,.25),0 34px 50px -18px rgba(2,6,23,.85);transform:rotate(4deg)}
.lscreen img,.tab img{display:block;width:100%}
</style>
<div class="txt"><div class="brand"><img src="${u('website/img/icon.png')}" alt="">Plenum</div>
<h1>Mach deine Klasse zum <em>Plenum.</em></h1>
<p>Umfragen, Quiz und Aufgaben – live am Beamer, Laptop und iPad.</p>
<div class="tags"><span>Ohne Konto</span><span>Ohne Cloud</span><span>Kostenlos</span></div></div>
<div class="glow"></div>
<div class="laptop"><div class="lscreen"><img src="${u('website/img/laptop-aufgabe.png')}" alt=""></div><div class="lbase"></div></div>
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
