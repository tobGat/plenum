// Lädt die fertige Seite (dist-site/), die nginx-Site und das Deploy-Skript in den Staging-Ordner
// am Server: /home/claude/plenum-site. Das braucht kein sudo und ändert am laufenden Server nichts.
// Live geht die Seite erst mit:  sudo bash /home/claude/plenum-site/deploy-plenum-site.sh
// Aufruf: npm run stage:site  (baut vorher mit npm run build:site)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
// SSH-Ziel (benutzer@server): Umgebungsvariable PLENUM_SITE_HOST oder die nicht versionierte Datei website/.stage-host
const hostFile = join(dirname(fileURLToPath(import.meta.url)), '.stage-host')
const HOST = process.env.PLENUM_SITE_HOST || (existsSync(hostFile) ? readFileSync(hostFile, 'utf8').trim() : '')
if (!HOST) { console.error('SSH-Ziel fehlt: PLENUM_SITE_HOST setzen oder website/.stage-host anlegen (benutzer@server).'); process.exit(1) }
const STAGE = 'plenum-site' // relativ zu /home/claude
const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']

if (!existsSync(join(root, 'dist-site', 'index.html'))) {
  console.error('dist-site/ fehlt – zuerst npm run build:site')
  process.exit(1)
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`Fehlgeschlagen: ${cmd} ${args.join(' ')}`)
    process.exit(1)
  }
}

// Skript und nginx-Datei mit LF-Zeilenenden hochladen (Git unter Windows macht daraus sonst CRLF)
const tmp = mkdtempSync(join(tmpdir(), 'plenum-stage-'))
const lf = (rel, name) => {
  const target = join(tmp, name)
  writeFileSync(target, readFileSync(join(here, rel), 'utf8').replace(/\r\n/g, '\n'))
  return target
}
const deployScript = lf('deploy-plenum-site.sh', 'deploy-plenum-site.sh')
const nginxSite = lf('nginx/plenum.schulapps.at', 'plenum.schulapps.at')

run('ssh', [...SSH_OPTS, HOST, `rm -rf ~/${STAGE} && mkdir -p ~/${STAGE}/nginx`])
run('scp', [...SSH_OPTS, '-q', '-r', join(root, 'dist-site'), `${HOST}:${STAGE}/site`])
run('scp', [...SSH_OPTS, '-q', nginxSite, `${HOST}:${STAGE}/nginx/`])
run('scp', [...SSH_OPTS, '-q', deployScript, `${HOST}:${STAGE}/`])
run('ssh', [...SSH_OPTS, HOST, `bash -n ~/${STAGE}/deploy-plenum-site.sh && find ~/${STAGE} -type f | sort`])
console.log(`\n✔ Bereit. Live schalten am Server:\n  sudo bash /home/claude/${STAGE}/deploy-plenum-site.sh`)
