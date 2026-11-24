// UI-Test der Bibliothek: Filter nach Fach und Schulstufe, Sortierung mit Gruppen.
// Aufruf: node main/launch.cjs test/ui/library.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish } from './lib.mjs';

const check = (c, m) => { if (!c) report(m); };
const titles = (w) => js(w, `[...document.querySelectorAll('.lcard h3')].map(e=>e.textContent)`);
const setSel = (w, name, v) => js(w, `(()=>{const s=document.querySelector('select[data-change="${name}"]'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true}));})()`);

async function main() {
  const { srv, base } = await startTestServer(3230);
  const w = makeWin(1366, 768, 'host', 'Bibliothek');
  await w.loadURL(`${base}/host`);
  await waitFor(w, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  const mk = (title, subject, grade) => ({ lesson: { title, subject, grade, sections: [{ name: 'A' }], slides: [{ type: 'title', title }] } });
  for (const b of [mk('Bruchrechnen', 'Mathematik', '6. Schulstufe'), mk('Zellen', 'Biologie', '10. Schulstufe'), mk('Prozente', 'Mathematik', '7. Schulstufe'), mk('Ohne Angaben', '', '')])
    await js(w, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(b))}}).then(r=>r.status)`);
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelectorAll('.lcard').length === 5`, 6000, 'fünf Lektionen');

  await setSel(w, 'fSort', 'grade');
  await sleep(300);
  const groups = await js(w, `[...document.querySelectorAll('.libgroup')].map(e=>e.firstChild.textContent)`);
  check(JSON.stringify(groups) === JSON.stringify(['6. Schulstufe', '7. Schulstufe', '10. Schulstufe', 'ab 12 Jahren', 'Ohne Schulstufe']), `Gruppen nach Schulstufe: ${groups}`);
  await shot(w, 'b01-nach-schulstufe');

  await setSel(w, 'fSort', 'subject');
  await sleep(200);
  check((await js(w, `document.querySelector('.libgroup').firstChild.textContent`)) === 'Biologie', 'Sortierung nach Fach beginnt nicht mit Biologie');
  await setSel(w, 'fSubject', 'Mathematik');
  await sleep(200);
  check(JSON.stringify(await titles(w)) === JSON.stringify(['Bruchrechnen', 'Prozente']), `Filter Mathematik: ${await titles(w)}`);
  await setSel(w, 'fGrade', '7. Schulstufe');
  await sleep(200);
  check(JSON.stringify(await titles(w)) === JSON.stringify(['Prozente']), `Filter Mathematik + 7.: ${await titles(w)}`);
  await shot(w, 'b02-filter');
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelectorAll('.lcard').length === 1`, 6000, 'Filter bleibt nach Neuladen erhalten');
  await mustClick(w, '[data-action="clearFilter"]', 'Filter zurücksetzen');
  await setSel(w, 'fSort', 'title');
  await sleep(200);
  check((await titles(w))[0] === 'Bruchrechnen' && (await titles(w)).length === 5, `Sortierung nach Titel: ${await titles(w)}`);
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
