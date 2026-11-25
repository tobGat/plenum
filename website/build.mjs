// Baut die Infoseite https://plenum.schulapps.at nach dist-site/ – rein statisch, ohne externe Dateien; ein kleines eigenes Skript (site.js) für die Scroll-Effekte.
// Die Datenschutzerklärung entsteht aus PRIVACY.md, ergänzt um den Abschnitt zur Website.
// Aufruf: npm run build:site   (ausliefern: npm run stage:site, siehe README → „Website“)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'dist-site');
const SITE = 'https://plenum.schulapps.at';

// Link zur App im Microsoft Store (Partner Center → Produktidentität → Store-ID):
// https://apps.microsoft.com/detail/<Store-ID>. Leer = Hinweis „Bald im Microsoft Store“.
const STORE_URL = '';

const read = (p) => readFileSync(join(root, p), 'utf8');
const storeButton = STORE_URL ? `<a class="btn" href="${STORE_URL}">Im Microsoft Store laden</a>` : '<span class="btn btn-soon">Bald im Microsoft Store</span>';

// Sehr kleines Markdown (Überschriften, Absätze, Listen, fett, kursiv, Code) für die Datenschutzerklärung
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, '<a href="mailto:$1">$1</a>');
function markdown(md) {
  const html = [];
  let list = null, para = [];
  const flushP = () => { if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushL = () => { if (list) { html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/), li = line.match(/^\s*(-|\d+\.)\s+(.*)$/);
    if (h) { flushP(); flushL(); html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (li) { flushP(); const tag = li[1] === '-' ? 'ul' : 'ol'; if (!list || list.tag !== tag) { flushL(); list = { tag, items: [] }; } list.items.push(li[2]); }
    else if (!line.trim()) { flushP(); flushL(); }
    else if (list && /^\s{2,}/.test(raw)) list.items[list.items.length - 1] += ' ' + line.trim();
    else { flushL(); para.push(line.trim()); }
  }
  flushP(); flushL();
  return html.join('\n');
}

// Pfade ab der Wurzel (/style.css …): nginx liefert die 404-Seite auch unter /foo/bar aus.
function layout({ title, description, path, body }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Plenum">
<meta property="og:locale" content="de_AT">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/img/og.jpg?v=4">
<meta property="og:image:secure_url" content="${SITE}/img/og.jpg?v=4">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Plenum – Mach deine Klasse zum Plenum: Aufgabe auf einem Laptop und Umfrage auf einem Tablet">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${SITE}/img/og.jpg?v=4">
<meta name="theme-color" content="#4f46e5">
<link rel="icon" type="image/png" href="/img/icon.png">
<link rel="stylesheet" href="/style.css">
<script src="/site.js" defer></script>
</head>
<body>
<div id="progress" aria-hidden="true"></div>
<header class="top">
  <div class="wrap">
    <a class="brand" href="/"><img src="/img/icon.png" alt="" width="36" height="36"><span>Plenum</span></a>
    <nav aria-label="Hauptmenü">
      <a href="/#warum">Warum</a>
      <a href="/#stunde">Eine Stunde</a>
      <a href="/#phasen">Werkzeuge</a>
      <a href="/#editor">Vorbereiten</a>
      <a href="/#designs">Designs</a>
      <a href="/#datenschutz">Datenschutz</a>
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer>
  <div class="wrap foot">
    <a class="brand" href="/"><img src="/img/icon.png" alt="" width="26" height="26"><span>Plenum</span></a>
    <nav aria-label="Rechtliches">
      <a href="/impressum.html">Impressum</a>
      <a href="/datenschutz.html">Datenschutz</a>
      <a href="https://github.com/tobGat/plenum" rel="noopener">Quellcode (GPL 3.0)</a>
      <a href="https://schulapps.at">Weitere Lern-Apps: schulapps.at</a>
    </nav>
    <p class="copy">© 2026 Tobias Gatterbauer</p>
    <p class="tm">Microsoft und Windows sind Marken der Microsoft-Unternehmensgruppe. Plenum steht in keiner Verbindung zu diesem Unternehmen.</p>
  </div>
</footer>
</body>
</html>
`;
}

// Datenschutz: Abschnitt „Diese Website“ vor „Kinder“ einfügen
const appPolicy = read('PRIVACY.md');
const sitePolicy = read('website/content/datenschutz-website.md');
const MARK = '## Kinder';
if (!appPolicy.includes(MARK)) throw new Error(`PRIVACY.md: Abschnitt „${MARK}“ fehlt`);
const policy = appPolicy.replace('# Datenschutzrichtlinie – Plenum', '# Datenschutzerklärung')
  .replace(/(\*\*Stand: [^\n]+\n)/, '$1\nDiese Erklärung gilt für die App Plenum und für diese Website.\n')
  .replace(MARK, `${sitePolicy.trim()}\n\n${MARK}`);

const pages = {
  'index.html': layout({
    title: 'Plenum – Mach deine Klasse zum Plenum',
    description: 'Bald im Microsoft Store: Plenum führt Schritt für Schritt durch die Stunde. Du präsentierst am Beamer, alle Schüler:innen antworten auf ihren Laptops oder iPads – und du siehst sofort, wo die Klasse steht. Ohne Konto, ohne Cloud.',
    path: '/',
    body: read('website/pages/index.html').replaceAll('{{STORE_BUTTON}}', storeButton),
  }),
  'datenschutz.html': layout({
    title: 'Datenschutzerklärung – Plenum',
    description: 'Datenschutzerklärung für die App Plenum und die Website plenum.schulapps.at.',
    path: '/datenschutz.html',
    body: `<article class="wrap legal">\n${markdown(policy)}\n</article>`,
  }),
  'impressum.html': layout({ title: 'Impressum – Plenum', description: 'Impressum von plenum.schulapps.at.', path: '/impressum.html', body: read('website/pages/impressum.html') }),
  '404.html': layout({ title: 'Seite nicht gefunden – Plenum', description: 'Diese Seite gibt es nicht.', path: '/404.html',
    body: '<div class="notfound"><h1>Seite nicht gefunden</h1><p>Diese Adresse gibt es hier nicht.</p><p><a class="btn" href="/">Zur Startseite</a></p></div>' }),
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fonts'), { recursive: true });
for (const [name, html] of Object.entries(pages)) writeFileSync(join(out, name), html);
writeFileSync(join(out, 'style.css'), read('website/style.css'));
writeFileSync(join(out, 'site.js'), read('website/site.js'));
cpSync(join(here, 'img'), join(out, 'img'), { recursive: true });
for (const f of ['lexend-latin-wght.woff2', 'inter-latin-wght.woff2', 'LICENSE-Lexend.txt', 'LICENSE-Inter.txt']) cpSync(join(root, 'public', 'fonts', f), join(out, 'fonts', f));
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/datenschutz.html', '/impressum.html'].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`✓ dist-site/ (${Object.keys(pages).length} Seiten)${STORE_URL ? '' : ' – Hinweis „Bald im Microsoft Store“'}`);
