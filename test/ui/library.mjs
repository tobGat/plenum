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

  // Stichwortsuche: Titel, Fach und Folientexte; alle Wörter müssen vorkommen; das Suchfeld behält beim Tippen den Fokus
  const deep = { lesson: { title: 'Pflanzen', subject: 'Biologie', grade: '6. Schulstufe', description: 'Wie Pflanzen Energie gewinnen', sections: [{ name: 'A' }], slides: [
    { type: 'title', title: 'Pflanzen' },
    { type: 'info', title: 'Blattgrün', cards: [{ title: 'Farbstoff', text: 'Das Chlorophyll in den Blättern fängt das Sonnenlicht ein.' }] },
    { type: 'mc', title: 'Frage', question: 'Wo sitzt das Chlorophyll?', options: [{ text: 'im Chloroplast', correct: true }, { text: 'im Zellkern', correct: false }] }] } };
  await js(w, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(deep))}}).then(r=>r.status)`);
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelectorAll('.lcard').length === 6 && document.getElementById('libsearch')`, 6000, 'sechs Lektionen und Suchfeld');
  const search = async (q) => { await js(w, `(()=>{const i=document.getElementById('libsearch'); i.focus(); i.value=${JSON.stringify(q)}; i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(150); return titles(w); };
  check(JSON.stringify(await search('chlorophyll')) === JSON.stringify(['Pflanzen']), `Suche im Folientext: ${await titles(w)}`);
  check(await js(w, `document.activeElement === document.getElementById('libsearch')`), 'Suchfeld verliert beim Tippen den Fokus');
  const hitText = await js(w, `document.querySelector('.lc-hit')?.innerText || ''`);
  check(/Folie 2, 3:/.test(hitText) && /Chlorophyll in den Blättern/.test(hitText), `Trefferhinweis: ${hitText}`);
  check(/1 von 6 Lektionen enthält „chlorophyll“/.test(await js(w, `document.querySelector('.libcount')?.innerText || ''`)), 'Trefferzahl fehlt');
  await shot(w, 'b03-suche');
  check(JSON.stringify(await search('BRUCH')) === JSON.stringify(['Bruchrechnen']), `Suche im Titel (Großschreibung egal): ${await titles(w)}`);
  check(!(await js(w, `document.querySelector('.lc-hit')`)), 'Treffer im Titel braucht keinen Folienhinweis');
  check(JSON.stringify((await search('mathematik')).sort()) === JSON.stringify(['Bruchrechnen', 'Prozente']), `Suche nach Fach: ${await titles(w)}`);
  check(JSON.stringify(await search('biologie zellkern')) === JSON.stringify(['Pflanzen']), `Zwei Wörter (beide müssen vorkommen): ${await titles(w)}`);
  check(JSON.stringify(await search('blatter')) === JSON.stringify(['Pflanzen']), `Suche ohne Umlaut-Punkte: ${await titles(w)}`);
  check((await search('gibtesnicht')).length === 0 && /Keine Lektion enthält „gibtesnicht“/.test(await js(w, `document.querySelector('.empty')?.innerText || ''`)), 'Leerer Treffer ohne Meldung');
  await mustClick(w, '[data-action="clearSearch"]', 'Suche löschen');
  await sleep(200);
  check((await titles(w)).length === 6 && (await js(w, `document.getElementById('libsearch').value`)) === '', 'Suche löschen stellt die Liste nicht wieder her');
  // Suche und Filter zusammen
  await setSel(w, 'fSubject', 'Mathematik');
  await sleep(200);
  check((await search('chlorophyll')).length === 0 && /nur in den gefilterten Lektionen/.test(await js(w, `document.querySelector('.empty')?.innerText || ''`)), 'Suche beachtet den Fach-Filter nicht');
  await mustClick(w, '[data-action="clearFilter"]', 'Filter zurücksetzen');
  await sleep(200);
  check(JSON.stringify(await titles(w)) === JSON.stringify(['Pflanzen']) && (await js(w, `document.getElementById('libsearch').value`)) === 'chlorophyll', 'Suche geht beim Zurücksetzen des Filters verloren');
  // Strg+F springt ins Suchfeld
  await js(w, `document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}))`);
  check(await js(w, `document.activeElement === document.getElementById('libsearch')`), 'Strg+F springt nicht ins Suchfeld');

  // Farbe und Symbol der Karte: wählen, übernehmen, bleibt nach dem Neuladen; „geändert“ bleibt gleich
  const before = await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>l.find(x=>x.title==='Pflanzen').updatedAt)`);
  await mustClick(w, '.lcard [data-action="more"]', 'Weitere Aktionen');
  await mustClick(w, '.menu [data-action="look"]', 'Farbe und Symbol');
  await waitFor(w, `document.querySelector('.lookbox')`, 3000, 'Dialog Farbe und Symbol');
  await mustClick(w, '[data-col="emerald"]', 'Farbe Grün');
  check(await js(w, `!!document.querySelector('.lookcard.tint')`), 'Vorschau zeigt die Farbe nicht');
  await mustClick(w, '[data-gsel="lib:pflanze"]', 'Illustration Pflanze');
  check(await js(w, `!!document.querySelector('.lookcard .lc-gfx svg')`), 'Vorschau zeigt die Grafik nicht');
  await sleep(600);
  await shot(w, 'b04-farbe-und-symbol');
  await mustClick(w, '[data-look="save"]', 'Übernehmen');
  await waitFor(w, `document.querySelector('.lcard.tint[data-color="emerald"] .lc-gfx svg')`, 3000, 'Karte mit Farbe und Grafik');
  const looks = [['Bruchrechnen', { color: 'blue', graphic: 'lib:rechner' }], ['Zellen', { color: 'teal', graphic: 'lib:mikroskop' }], ['Prozente', { graphic: 'icon:calc' }], ['Ohne Angaben', { color: 'amber' }]];
  for (const [t, c] of looks) await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>fetch('/api/host/lessons/'+l.find(x=>x.title===${JSON.stringify(t)}).id+'/card',{method:'PUT',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(c))}})).then(r=>r.status)`);
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelectorAll('.lcard').length === 6`, 6000, 'Bibliothek nach Neuladen');
  check((await js(w, `document.querySelectorAll('.lcard.tint').length`)) === 4 && (await js(w, `document.querySelectorAll('.lc-gfx svg').length`)) === 4, 'Farben und Grafiken sind nach dem Neuladen nicht da');
  check((await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>l.find(x=>x.title==='Pflanzen').updatedAt)`)) === before, 'Farbe ändern verändert das Änderungsdatum');
  check(await js(w, `document.documentElement.scrollWidth <= innerWidth`), 'Bibliothek ist zu breit');
  await shot(w, 'b05-bunte-karten');
  // Grafik auf der Karte öffnet den Dialog; „Ohne Grafik“ und „Automatisch“ setzen zurück
  await mustClick(w, '.lcard[data-color="emerald"] .lc-gfx', 'Grafik auf der Karte');
  await mustClick(w, '[data-col=""]', 'Farbe automatisch');
  await mustClick(w, '[data-gsel=""]', 'Ohne Grafik');
  await mustClick(w, '[data-look="save"]', 'Übernehmen');
  await sleep(300);
  check((await js(w, `document.querySelectorAll('.lcard.tint').length`)) === 3 && (await js(w, `document.querySelectorAll('.lc-gfx svg').length`)) === 3, 'Zurücksetzen auf automatisch wirkt nicht');
  // Eigenes Bild für eine Lektion: hochladen, erscheint so groß wie die Grafiken, Ausschnitt verschieben
  await mustClick(w, '.lcard [data-action="more"]', 'Weitere Aktionen');
  await mustClick(w, '.menu [data-action="look"]', 'Farbe und Bild');
  await waitFor(w, `document.getElementById('lcFile')`, 3000, 'Dialog Farbe und Bild');
  await mustClick(w, '[data-gtab="own"]', 'Eigenes Bild');
  await js(w, `(()=>{const cv=document.createElement('canvas'); cv.width=900; cv.height=300; const x=cv.getContext('2d'); x.fillStyle='#e11d48'; x.fillRect(0,0,900,300); x.fillStyle='#fff'; x.fillRect(700,50,150,200);
    return new Promise(r=>cv.toBlob(b=>{const dt=new DataTransfer(); dt.items.add(new File([b],'foto.png',{type:'image/png'})); const i=document.getElementById('lcFile'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true})); r(true);},'image/png'));})()`);
  await waitFor(w, `document.querySelector('.lookcard .lc-gfx.photo img') && document.querySelector('.lookcard .lc-gfx.photo img').naturalWidth === 320`, 5000, 'Vorschau mit eigenem Bild (auf 320 px verkleinert)');
  const box = await js(w, `(()=>{const r=document.querySelector('.lookcard .lc-gfx.photo').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:Math.round(r.width),h:Math.round(r.height)};})()`);
  check(box.w === 72 && box.h === 72, `Eigenes Bild ist nicht so groß wie die Grafiken: ${box.w}×${box.h}`);
  await js(w, `(()=>{const ev=(t,x,y,el)=>(el||document.elementFromPoint(x,y)).dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'mouse',button:0,buttons:1,pointerId:1}));
    ev('pointerdown',${box.x},${box.y}); for(let i=1;i<=6;i++) ev('pointermove',${box.x}-i*40,${box.y},window); ev('pointerup',${box.x}-240,${box.y},window);})()`);
  check((await js(w, `document.querySelector('.lookcard .lc-gfx.photo img').style.objectPosition`)) === '100% 50%', `Ausschnitt nach dem Ziehen: ${await js(w, `document.querySelector('.lookcard .lc-gfx.photo img').style.objectPosition`)}`);
  await sleep(400); await shot(w, 'b06-eigenes-bild');
  await mustClick(w, '[data-look="save"]', 'Übernehmen');
  await waitFor(w, `document.querySelector('.lgrid .lc-gfx.photo img') && document.querySelector('.lgrid .lc-gfx.photo img').naturalWidth === 320`, 5000, 'Karte mit eigenem Bild');
  check((await js(w, `document.querySelector('.lgrid .lc-gfx.photo img').style.objectPosition`)) === '100% 50%', 'Ausschnitt wird nicht gespeichert');
  check(!(await js(w, `fetch('/api/host/lessons').then(r=>r.text())`)).includes('base64') && (await js(w, `fetch('/api/host/lessons').then(r=>r.text()).then(t=>t.length)`)) < 400000, 'Lektionsliste enthält Bilddaten');
  // Eine Grafik ersetzt das Bild wieder
  await mustClick(w, '.lgrid .lc-gfx.photo', 'Bild auf der Karte');
  await mustClick(w, '[data-gtab="lib"]', 'Illustrationen');
  await mustClick(w, '[data-gsel="lib:buch"]', 'Illustration');
  await mustClick(w, '[data-look="save"]', 'Übernehmen');
  await sleep(400);
  check(!(await js(w, `document.querySelector('.lgrid .lc-gfx.photo')`)), 'Grafik ersetzt das eigene Bild nicht');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
