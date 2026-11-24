// Startet Electron für die Entwicklung (npm start) bzw. Hilfsskripte (npm run assets).
// Entfernt ELECTRON_RUN_AS_NODE (von VS Code gesetzt) und lädt das Electron-Programm, falls es fehlt
// (npm 11 führt Installationsskripte standardmäßig nicht aus).
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pkgDir = path.join(__dirname, '..', 'node_modules', 'electron');
if (!fs.existsSync(path.join(pkgDir, 'path.txt')) || !fs.existsSync(path.join(pkgDir, 'dist'))) {
  console.log('Electron-Programm fehlt – wird geladen …');
  execFileSync(process.execPath, [path.join(pkgDir, 'install.js')], { stdio: 'inherit' });
}
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv.slice(2);
const child = spawn(electron, args.length ? args : [path.join(__dirname, '..')], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 0));
