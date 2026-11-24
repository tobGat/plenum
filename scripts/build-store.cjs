// Baut das Microsoft-Store-Paket (AppX/MSIX) – unsigniert, der Store signiert beim Einreichen selbst.
// Aufruf: npm run build:store   [--skip-tests] [--skip-assets] [--check-only]
// Danach wird das Manifest im fertigen Paket geprüft (Firewall-Regel, Netzwerk-Berechtigung, Dateizuordnung).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const node = (...a) => execFileSync(process.execPath, a, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
const checkOnly = args.includes('--check-only'); // nur das vorhandene Paket prüfen

console.log(`\n▶ Store-Paket für Plenum ${pkg.version}${checkOnly ? ' (nur Prüfung)' : ''}\n`);

if (!checkOnly) {
  if (!args.includes('--skip-tests')) node('--test', 'test/*.test.js');
  if (!args.includes('--skip-assets')) node('main/launch.cjs', 'scripts/gen-assets.cjs');
  node('scripts/notices.cjs');
  if (pkg.build.appx.identityName === 'tobGat.Plenum') {
    console.log('\n⚠ build.appx.identityName ist noch der Platzhalter „tobGat.Plenum“.');
    console.log('  Für die Einreichung die Werte aus Partner Center → Produktidentität eintragen (siehe docs/MICROSOFT-STORE.md).\n');
  }
  fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
  node(path.join('node_modules', 'electron-builder', 'cli.js'), '--win', 'appx', '--x64', '--publish', 'never');
}

// ---------- Paket prüfen ----------
const file = path.join(ROOT, 'dist', `Plenum ${pkg.version}.appx`);
if (!fs.existsSync(file)) { console.error(`✗ Paket nicht gefunden: ${file}`); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plenum-appx-'));
// Windows-eigenes tar (bsdtar) – das GNU-tar aus Git Bash hält „C:“ für einen entfernten Rechner
const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
execFileSync(fs.existsSync(tar) ? tar : 'tar', ['-xf', file, '-C', tmp, 'AppxManifest.xml']);
const man = fs.readFileSync(path.join(tmp, 'AppxManifest.xml'), 'utf8');
const list = execFileSync(fs.existsSync(tar) ? tar : 'tar', ['-tf', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/);
const checks = [
  ['Identität', man.includes(`Name="${pkg.build.appx.identityName}"`) && man.includes(`Publisher="${pkg.build.appx.publisher}"`)],
  ['Anzeigename „Plenum“', /<DisplayName>Plenum<\/DisplayName>/.test(man)],
  ['Berechtigung privateNetworkClientServer', /<Capability Name="privateNetworkClientServer"\s*\/>/.test(man)],
  ['Berechtigung runFullTrust', /rescap:Capability Name="runFullTrust"/.test(man)],
  ['Firewall-Regel TCP 3080–3089 für app\\Plenum.exe', /desktop2:FirewallRules Executable="app\\Plenum\.exe"/.test(man) && /LocalPortMin="3080" LocalPortMax="3089"/.test(man)],
  ['Dateizuordnung .plenum', /<uap:FileType>\.plenum<\/uap:FileType>/.test(man)],
  ['Mindestversion Windows 10 1809', /MinVersion="10\.0\.17763\.0"/.test(man)],
  ['Keine offenen ${…}-Platzhalter', !/\$\{[a-zA-Z0-9]+\}/.test(man)],
  ['Programm app/Plenum.exe im Paket', list.some((f) => /^app[\\/]Plenum\.exe$/i.test(f))],
  ['App-Archiv app/resources/app.asar', list.some((f) => /^app[\\/]resources[\\/]app\.asar$/i.test(f))],
  ['Lizenzhinweise im Paket', list.some((f) => /THIRD-PARTY-NOTICES\.txt$/i.test(f))],
];
let bad = 0;
for (const [name, ok] of checks) { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) bad++; }
fs.rmSync(tmp, { recursive: true, force: true });
const mb = (fs.statSync(file).size / 1048576).toFixed(1);
if (bad) { console.error(`\n✗ ${bad} Prüfung(en) fehlgeschlagen – Paket nicht einreichen.`); process.exit(1); }
console.log(`\n✓ Fertig: dist/Plenum ${pkg.version}.appx (${mb} MB)`);
console.log('  → im Partner Center hochladen (siehe docs/MICROSOFT-STORE.md)\n');
