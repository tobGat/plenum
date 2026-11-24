// Erzeugt Logo, Programm-Icon und alle Kachel-Grafiken für das Store-Paket (Aufruf: npm run assets)
// Läuft in Electron (offscreen), damit SVG und die Schrift Lexend sauber gerendert werden.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const font = fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'lexend-latin-wght.woff2')).toString('base64');

// Logo: Sprechblase mit drei Balken („die Klasse antwortet live“)
const LOGO = (bg = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset=".55" stop-color="#4f46e5"/><stop offset="1" stop-color="#312e81"/></linearGradient></defs>
  ${bg ? '<rect x="0" y="0" width="256" height="256" rx="58" fill="url(#g)"/>' : ''}
  <path d="M72 46h112a34 34 0 0 1 34 34v66a34 34 0 0 1-34 34h-74l-42 32 9-34a34 34 0 0 1-39-32V80a34 34 0 0 1 34-34z" fill="#fff"/>
  <rect x="78" y="112" width="26" height="44" rx="8" fill="#0d9488"/><rect x="115" y="90" width="26" height="66" rx="8" fill="#4f46e5"/><rect x="152" y="68" width="26" height="88" rx="8" fill="#e11d48"/>
</svg>`;

const page = (w, h, body, bg = 'transparent') => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Lexend;src:url(data:font/woff2;base64,${font})}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
.wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:${Math.round(h * 0.12)}px}
svg{display:block}
.name{font-family:Lexend;font-weight:700;color:#fff;letter-spacing:-.02em}
</style></head><body><div class="wrap">${body}</div></body></html>`;

const GRAD = 'linear-gradient(135deg,#6366f1 0%,#4f46e5 55%,#312e81 100%)';
const square = (s, pad) => page(s, s, `<div style="width:${s - 2 * pad}px;height:${s - 2 * pad}px">${LOGO()}</div>`);
const wide = (w, h) => page(w, h, `<div style="width:${Math.round(h * 0.62)}px;height:${Math.round(h * 0.62)}px">${LOGO(false)}</div><span class="name" style="font-size:${Math.round(h * 0.3)}px">Plenum</span>`, GRAD);

const JOBS = [
  ['public/img/icon.png', 256, 256, square(256, 0)],
  ['build/icon.png', 512, 512, square(512, 0)],
  ['build/store-logo-300.png', 300, 300, square(300, 0)],
  ['build/appx/StoreLogo.png', 50, 50, square(50, 0)],
  ['build/appx/Square44x44Logo.png', 44, 44, square(44, 0)],
  ['build/appx/SmallTile.png', 71, 71, square(71, 6)],
  ['build/appx/Square150x150Logo.png', 150, 150, square(150, 22)],
  ['build/appx/LargeTile.png', 310, 310, square(310, 50)],
  ['build/appx/Wide310x150Logo.png', 310, 150, wide(310, 150)],
  ['build/appx/SplashScreen.png', 620, 300, wide(620, 300)],
  // Taskleiste/Startmenü ohne Kachelhintergrund (Windows wählt die passende Größe selbst)
  ...[16, 24, 32, 44, 48, 256].flatMap((s) => [
    [`build/appx/Square44x44Logo.targetsize-${s}.png`, s, s, square(s, 0)],
    [`build/appx/Square44x44Logo.targetsize-${s}_altform-unplated.png`, s, s, square(s, 0)],
  ]),
];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
let win = null;
// Ein festes Offscreen-Fenster; das Bild kommt aus dem paint-Ereignis und wird auf w×h zugeschnitten
async function render(w, h, html) {
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,120)))');
  const img = await new Promise((res) => { win.webContents.once('paint', (e, dirty, image) => res(image)); win.webContents.invalidate(); });
  const s = img.getSize();
  const k = s.width / 640;
  let out = img.crop({ x: 0, y: 0, width: Math.round(w * k), height: Math.round(h * k) });
  if (k !== 1) out = out.resize({ width: w, height: h, quality: 'best' });
  return out.toPNG();
}

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 640, height: 640, show: false, transparent: true, frame: false, backgroundColor: '#00000000', webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(30);
  for (const [file, w, h, html] of JOBS) {
    const out = path.join(ROOT, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, await render(w, h, html));
    console.log(`✓ ${file} (${w}×${h})`);
  }
  // ICO mit PNG-Einträgen
  const pngs = [];
  for (const s of ICO_SIZES) pngs.push(await render(s, s, square(s, 0)));
  const head = Buffer.alloc(6 + 16 * ICO_SIZES.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(ICO_SIZES.length, 4);
  let off = head.length;
  ICO_SIZES.forEach((n, i) => { const e = 6 + 16 * i; head.writeUInt8(n === 256 ? 0 : n, e); head.writeUInt8(n === 256 ? 0 : n, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12); off += pngs[i].length; });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), Buffer.concat([head, ...pngs]));
  console.log('✓ build/icon.ico');
  fs.writeFileSync(path.join(ROOT, 'build', 'logo.svg'), LOGO());
  app.quit();
});
