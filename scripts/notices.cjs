// Erzeugt THIRD-PARTY-NOTICES.txt aus den Laufzeit-Abhängigkeiten (npm ls --omit=dev) und den Schrift-Lizenzen.
// Aufruf: node scripts/notices.cjs  (läuft auch automatisch in build-store.cjs)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dirs = execSync('npm ls --omit=dev --all --parseable', { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).filter((d) => path.resolve(d) !== path.resolve(ROOT));
const seen = new Map();
for (const d of dirs) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')); } catch { continue; }
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license && pkg.license.type ? pkg.license.type : Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : 'siehe Paket';
  const file = fs.readdirSync(d).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const text = file ? fs.readFileSync(path.join(d, file), 'utf8').trim() : '';
  seen.set(key, { key, lic, text, repo: pkg.repository && (pkg.repository.url || pkg.repository) });
}
const list = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
const fonts = ['Inter', 'Lexend'].map((n) => ({ n, text: fs.readFileSync(path.join(ROOT, 'public', 'fonts', `LICENSE-${n}.txt`), 'utf8').trim() }));

const SEP = '='.repeat(73);
const out = [
  'THIRD-PARTY SOFTWARE NOTICES AND LICENSES',
  'Plenum – interaktiv durch den Unterricht',
  SEP, '',
  'Plenum ist als Ganzes unter der GNU General Public License v3.0 (oder später)',
  'lizenziert (siehe Datei LICENSE). Plenum enthält bzw. verwendet zusätzlich die',
  'unten aufgeführte Software und Schriften von Dritten. Deren Lizenz- und',
  'Copyright-Hinweise sind nachfolgend wiedergegeben und bleiben unberührt.', '',
  'Hinweis: Die Electron-Laufzeitumgebung (MIT) sowie Chromium, Node.js und ffmpeg',
  'werden beim Erstellen des Pakets durch electron-builder mitgeliefert; ihre',
  'Lizenztexte (LICENSE.electron.txt, LICENSES.chromium.html) liegen im',
  'Programmordner der installierten Anwendung.', '',
  `Schriften: Inter und Lexend (SIL Open Font License 1.1)`,
  `Anzahl aufgeführter Pakete: ${list.length}`,
  SEP, '',
  ...list.map((p) => `- ${p.key}  (${p.lic})`),
  '', SEP, 'SCHRIFTEN', SEP,
  ...fonts.flatMap((f) => ['', `--- ${f.n} (SIL Open Font License 1.1) ---`, '', f.text]),
  '', SEP, 'LIZENZTEXTE DER PAKETE', SEP,
  ...list.flatMap((p) => ['', `--- ${p.key} (${p.lic}) ---`, '', p.text || `Lizenz: ${p.lic} (kein Lizenztext im Paket enthalten)`]),
  '',
].join('\n');
fs.writeFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.txt'), out);
fs.writeFileSync(path.join(ROOT, 'public', 'third-party-notices.txt'), out);
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(ROOT, 'public', 'license.txt')); // für die Seite „Lizenzen“
console.log(`✓ THIRD-PARTY-NOTICES.txt (${list.length} Pakete, ${Math.round(out.length / 1024)} KB)`);
const odd = list.filter((p) => !/^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|BlueOak-1\.0\.0|CC0-1\.0|\(MIT OR CC0-1\.0\))$/.test(p.lic));
if (odd.length) console.log('  Bitte prüfen:', odd.map((p) => `${p.key} (${p.lic})`).join(', '));
