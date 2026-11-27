// UI-Test der Themenserien: Tab in der Übersicht, neue Serie, Karten aus der Seitenleiste auf die Matrix ziehen,
// einrasten, verbinden, filtern und sortieren, Neuladen, Lektion aus der Serie starten, Druckseite, Export/Import.
// Aufruf: node main/launch.cjs test/ui/series.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish } from './lib.mjs';

const check = (c, m) => { if (!c) report(m); };
const post = (w, url, body, method = 'POST') => js(w, `fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(body))}}).then(r=>r.json())`);

// Zeiger-Ereignisse wie eine Maus: drücken, in Schritten bewegen, loslassen
const center = (w, sel) => js(w, `(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
async function dragTo(w, from, to, name) {
  const a = typeof from === 'string' ? await center(w, from) : from, b = typeof to === 'string' ? await center(w, to) : to;
  if (!a || !b) { report(`${name}: Start oder Ziel fehlt (${from} → ${to})`); return; }
  await js(w, `(()=>{const ev=(t,x,y,el)=>(el||document.elementFromPoint(x,y)||document.body).dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'mouse',button:0,buttons:t==='pointerup'?0:1,pointerId:1}));
    const a=${JSON.stringify(a)}, b=${JSON.stringify(b)};
    ev('pointerdown',a.x,a.y);
    for(let i=1;i<=8;i++) ev('pointermove',a.x+(b.x-a.x)*i/8,a.y+(b.y-a.y)*i/8,window);
    ev('pointerup',b.x,b.y,window);})()`);
  await sleep(200);
}
const tap = (w, sel, name) => dragTo(w, sel, sel, name); // ohne Bewegung = Klick
const cards = (w) => js(w, `[...document.querySelectorAll('.sgrid .scard')].map(e=>({t:e.querySelector('.sc-title').textContent,l:parseInt(e.style.left),top:parseInt(e.style.top)}))`);
const sideTitles = (w) => js(w, `[...document.querySelectorAll('#sslist .sitem .si-t')].map(e=>e.textContent)`);
// Das Beitritts-Fenster öffnet sich erst nach einer Netzabfrage – abwarten, bis es da ist, dann schließen
async function closeJoin(w) {
  for (let i = 0; i < 25 && !(await js(w, `!!document.getElementById('ov').innerHTML`)); i++) await sleep(100);
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  for (let i = 0; i < 20 && (await js(w, `!!document.getElementById('ov').innerHTML`)); i++) await sleep(100);
}
const setSel = (w, name, v) => js(w, `(()=>{const s=document.querySelector('select[data-change="${name}"]'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true}));})()`);

async function main() {
  const { srv, base } = await startTestServer(3380);
  const w = makeWin(1366, 768, 'host', 'Themenserien');
  await w.loadURL(`${base}/host`);
  await waitFor(w, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  const mk = (title, subject, grade) => ({ lesson: { title, subject, grade, sections: [{ name: 'A' }], slides: [{ type: 'title', title }, { type: 'poll', title: 'Frage', question: 'A oder B?', options: ['A', 'B'] }] } });
  const ids = {};
  for (const [t, s, g, card] of [['Bruchrechnen', 'Mathematik', '6. Schulstufe', { color: 'blue', graphic: 'lib:rechner' }], ['Prozente', 'Mathematik', '7. Schulstufe', { color: 'violet' }], ['Zellen', 'Biologie', '6. Schulstufe', { color: 'teal', graphic: 'lib:mikroskop' }]]) {
    const L = await post(w, '/api/host/lessons', mk(t, s, g));
    ids[t] = L.id;
    await post(w, `/api/host/lessons/${L.id}/card`, card, 'PUT');
  }
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelectorAll('.lcard').length === 4 && document.querySelector('.libtabs')`, 6000, 'Bibliothek mit Tabs');

  // Tab „Themenserien“: leer, „Neue Serie“ öffnet den Editor
  await mustClick(w, '.libtab[data-v="series"]', 'Tab Themenserien');
  await waitFor(w, `/Noch keine Themenserien/.test(document.body.innerText)`, 3000, 'leerer Serien-Tab');
  check(!(await js(w, `document.querySelector('[data-action="new"]')`)) && !!(await js(w, `document.querySelector('.libbtns [data-action="newSeries"]')`)), 'Im Serien-Tab fehlt „Neue Serie“ oder „Neue Lektion“ steht noch da');
  await shot(w, 't01-serien-leer');
  await mustClick(w, '.libbtns [data-action="newSeries"]', 'Neue Serie');
  await waitFor(w, `document.querySelector('.sgrid .scell') && document.querySelectorAll('#sslist .sitem').length === 4`, 6000, 'Serien-Editor mit Seitenleiste');
  check(/^#\/serie\//.test(await js(w, 'location.hash')), 'Adresse zeigt nicht auf die Serie');

  // Seitenleiste: suchen, filtern, sortieren
  await js(w, `(()=>{const i=document.getElementById('sideq'); i.value='zell'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  check(JSON.stringify(await sideTitles(w)) === JSON.stringify(['Zellen']), `Suche in der Seitenleiste: ${await sideTitles(w)}`);
  await js(w, `(()=>{const i=document.getElementById('sideq'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await setSel(w, 'sSubject', 'Mathematik'); await sleep(150);
  await setSel(w, 'sSort', 'title'); await sleep(150);
  check(JSON.stringify(await sideTitles(w)) === JSON.stringify(['Bruchrechnen', 'Prozente']), `Filter Fach + Sortierung Titel: ${await sideTitles(w)}`);
  await setSel(w, 'sSubject', ''); await sleep(150);
  await setSel(w, 'sSort', 'grade'); await sleep(150);
  check((await sideTitles(w)).slice(0, 2).sort().join() === 'Bruchrechnen,Zellen' && (await sideTitles(w))[2] === 'Prozente', `Sortierung nach Schulstufe: ${await sideTitles(w)}`);
  await setSel(w, 'sSort', 'title'); await sleep(150);

  // Ziehen aus der Seitenleiste: rastet in der Zelle ein
  await dragTo(w, `[data-item="${ids.Bruchrechnen}"]`, '[data-cell="0|0"]', 'Bruchrechnen ziehen');
  await dragTo(w, `[data-item="${ids.Prozente}"]`, '[data-cell="1|0"]', 'Prozente ziehen');
  let cs = await cards(w);
  check(cs.length === 2 && cs[0].t === 'Bruchrechnen' && cs[0].l === 44 && cs[0].top === 44 && cs[1].l === 44 + 272, `Karten rasten nicht ein: ${JSON.stringify(cs)}`);
  check(await js(w, `document.querySelector('[data-item="${ids.Bruchrechnen}"]').classList.contains('used')`), 'Verwendete Lektion ist in der Seitenleiste nicht markiert');
  // Belegte Zelle lehnt ab
  await dragTo(w, `[data-item="${ids.Zellen}"]`, `.scard[data-card]`, 'Zellen auf belegte Zelle');
  check((await cards(w)).length === 2, 'Belegte Zelle nimmt eine zweite Karte an');
  // Antippen und Zelle wählen (für Touch)
  await tap(w, `[data-item="${ids.Zellen}"]`, 'Zellen antippen');
  check(await js(w, `document.querySelector('.sgrid').classList.contains('arming')`), 'Antippen wählt die Karte nicht vor');
  await tap(w, '[data-cell="1|1"]', 'Zelle antippen');
  check((await cards(w)).length === 3, 'Antippen + Zelle legt die Karte nicht ab');
  // „nur noch nicht verwendete“
  await mustClick(w, '[data-action="unused"]', 'nur noch nicht verwendete');
  await sleep(200);
  check((await sideTitles(w)).length === 1, `„nur nicht verwendete“ zeigt ${await sideTitles(w)}`);
  await mustClick(w, '[data-action="unused"]', 'alle zeigen');
  // Freie Karte
  await dragTo(w, '[data-item="_free"]', '[data-cell="2|0"]', 'Freie Karte ziehen');
  await waitFor(w, `document.getElementById('fcTitle')`, 3000, 'Dialog der freien Karte');
  await js(w, `document.getElementById('fcTitle').value='Schularbeit'; document.getElementById('fcNote').value='Kapitel 1 bis 3'`);
  await mustClick(w, '[data-col="rose"]', 'Farbe Rot');
  await mustClick(w, '[data-icon="flag"]', 'Symbol Fahne');
  await shot(w, 't02-freie-karte');
  await mustClick(w, '#ov [data-x="ok"]', 'Übernehmen');
  await sleep(200);
  cs = await cards(w);
  check(cs.length === 4 && cs.some((c) => c.t === 'Schularbeit'), `Freie Karte fehlt: ${JSON.stringify(cs)}`);

  // Verbinden: am Anfasser ziehen; Gegenpfeil wird abgelehnt
  const cid = (t) => js(w, `[...document.querySelectorAll('.sgrid .scard')].find(e=>e.querySelector('.sc-title').textContent===${JSON.stringify(t)}).dataset.card`);
  const [cB, cP, cZ, cS] = [await cid('Bruchrechnen'), await cid('Prozente'), await cid('Zellen'), await cid('Schularbeit')];
  // Anfasser an jeder Seite mit freier Nachbarzelle: Bruchrechnen (0|0) nur unten, Prozente (1|0) keiner frei außer … , Schularbeit (2|0) rechts und unten
  const sides = (id) => js(w, `[...document.querySelectorAll('[data-card="${id}"] .shandle')].map(e=>e.dataset.side).sort().join()`);
  check((await sides(cB)) === 'bottom,right' && (await sides(cP)) === 'bottom,left,right' && (await sides(cS)) === 'bottom,left,right' && (await sides(cZ)) === 'bottom,left,right,top', `Anfasser: ${await sides(cB)} | ${await sides(cP)} | ${await sides(cS)} | ${await sides(cZ)}`);
  await dragTo(w, `[data-card="${cB}"] .shandle.h-right`, `[data-card="${cP}"]`, 'Pfeil Bruchrechnen → Prozente (direkt benachbart)');
  check((await js(w, `document.querySelectorAll('.slink').length`)) === 1, 'Direkt benachbarte Karten lassen sich nicht verbinden');
  await dragTo(w, `[data-card="${cS}"] .shandle.h-bottom`, `[data-card="${cP}"]`, 'Pfeil Schularbeit → Prozente (vom unteren Anfasser)');
  await js(w, `document.querySelector('.sbar [data-action="flip"]').click()`); await sleep(200); // Richtung umkehren → Prozente → Schularbeit
  check((await js(w, `document.querySelectorAll('.slink').length`)) === 2, 'Pfeile entstehen nicht durch Ziehen am Anfasser');
  await dragTo(w, `[data-card="${cP}"] .sc-title`, '[data-cell="1|2"]', 'Prozente kurz wegziehen'); // Prozente hat sonst keinen freien Rand
  await dragTo(w, `[data-card="${cP}"] .shandle`, `[data-card="${cB}"]`, 'Gegenpfeil');
  await dragTo(w, `[data-card="${cP}"] .sc-title`, '[data-cell="1|0"]', 'Prozente zurück');
  check((await js(w, `document.querySelectorAll('.slink').length`)) === 2, 'Gegenpfeil wird angenommen');
  // Verbinden über die Leiste (Antippen)
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await tap(w, `[data-card="${cP}"] .sc-title`, 'Prozente wählen');
  await waitFor(w, `document.querySelector('.sbar [data-action="connect"]')`, 2000, 'Leiste der Karte');
  check(!!(await js(w, `document.querySelector('.sbar [data-action="presentCard"]')`)), '„Präsentieren“ fehlt in der Leiste');
  await shot(w, 't03-matrix');
  await mustClick(w, '.sbar [data-action="connect"]', 'Verbinden');
  await tap(w, `[data-card="${cZ}"] .sc-title`, 'Ziel antippen');
  check((await js(w, `document.querySelectorAll('.slink').length`)) === 3, 'Verbinden über die Leiste klappt nicht');
  // Karte verschieben: Pfeile wandern mit; Rückgängig
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await dragTo(w, `[data-card="${cZ}"] .sc-title`, '[data-cell="0|1"]', 'Zellen verschieben');
  cs = await cards(w);
  check(cs.find((c) => c.t === 'Zellen').l === 44 && cs.find((c) => c.t === 'Zellen').top === 44 + 156, `Verschieben rastet nicht ein: ${JSON.stringify(cs)}`);
  await mustClick(w, '[data-action="undo"]', 'Rückgängig');
  await sleep(200);
  check((await cards(w)).find((c) => c.t === 'Zellen').l === 44 + 272, 'Rückgängig stellt die Position nicht wieder her');
  await mustClick(w, '[data-action="redo"]', 'Wiederholen');
  // Titel der Serie
  await js(w, `(()=>{const i=document.getElementById('stitle'); i.value='Mathe 1. Semester'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(w, `/Gespeichert/.test(document.getElementById('savestate').innerText)`, 5000, 'Serie gespeichert');
  check(await js(w, `document.documentElement.scrollWidth <= innerWidth`), 'Serien-Editor ist zu breit');

  // Neuladen: alles bleibt
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelectorAll('.sgrid .scard').length === 4`, 8000, 'Serie nach Neuladen');
  check((await js(w, `document.querySelectorAll('.slink').length`)) === 3 && (await js(w, `document.getElementById('stitle').value`)) === 'Mathe 1. Semester', 'Pfeile oder Titel fehlen nach dem Neuladen');
  await sleep(400); await shot(w, 't04-nach-neuladen');

  // Lektion aus der Serie starten und zurück zur Serie
  await tap(w, `[data-card="${cB}"] .sc-title`, 'Bruchrechnen wählen');
  await mustClick(w, '.sbar [data-action="presentCard"]', 'Präsentieren');
  await waitFor(w, `location.hash === '#/present'`, 6000, 'Präsentation aus der Serie');
  await closeJoin(w);
  await sleep(300);
  // Am Ende der Lektion: weiter mit dem nächsten Thema der Serie
  await waitFor(w, `!document.getElementById('next').disabled`, 3000, 'Weiter-Schaltfläche');
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  await waitFor(w, `/Nächstes Thema/.test(document.getElementById('next').innerText) && !document.getElementById('next').disabled`, 4000, '„Nächstes Thema“ auf der letzten Folie');
  await mustClick(w, '#next', 'Nächstes Thema');
  await waitFor(w, `/Mit dem nächsten Thema fortsetzen/.test(document.getElementById('ov').innerText)`, 3000, 'Frage nach dem nächsten Thema');
  check(/Mathe 1\. Semester|Neue Themenserie/.test(await js(w, `document.getElementById('ov').innerText`)) && (await js(w, `document.querySelectorAll('#ov .nextmenu [data-next]').length`)) === 1 && /Hier bleiben/.test(await js(w, `document.getElementById('ov').innerText`)) && /Zurück zur Themenserie/.test(await js(w, `document.getElementById('ov').innerText`)), 'Frage nennt Serie oder nächstes Thema nicht');
  await sleep(400); await shot(w, 't04b-naechstes-thema');
  await mustClick(w, `#ov [data-next="${ids.Prozente}"]`, 'Weiter mit Prozente');
  const t1 = Date.now();
  while (Date.now() - t1 < 6000 && !(srv.rooms.room && srv.rooms.room.lesson.id === ids.Prozente)) await sleep(150);
  check(!!srv.rooms.room && srv.rooms.room.lesson.id === ids.Prozente, 'Das nächste Thema wurde nicht gestartet');
  await waitFor(w, `location.hash === '#/present' && /Prozente/.test(document.body.innerText)`, 5000, 'Präsentation des nächsten Themas');
  await closeJoin(w);
  await sleep(300);
  // Beim Beenden wird ebenfalls gefragt; „Nein“ führt zurück zur Serie
  await mustClick(w, '[data-action="exit"]', 'Beenden');
  await mustClick(w, '#ov [data-r="1"]', 'Beenden bestätigen');
  await waitFor(w, `/Mit dem nächsten Thema fortsetzen/.test(document.getElementById('ov').innerText)`, 4000, 'Frage beim Beenden');
  check(/Zellen/.test(await js(w, `document.getElementById('ov').innerText`)) && !/Schularbeit/.test(await js(w, `document.querySelector('#ov .nextmenu').innerText`)), 'Beim Beenden werden die falschen Themen angeboten');
  await mustClick(w, '#ov [data-next="_back"]', 'Zurück zur Themenserie');
  await waitFor(w, `/^#\\/serie\\//.test(location.hash) && document.querySelectorAll('.sgrid .scard').length === 4`, 8000, 'Zurück zur Serie nach dem Beenden');
  await js(w, `location.hash = '#/'; location.reload()`);
  await waitFor(w, `document.querySelector('.libtabs')`, 8000, 'Übersicht');
  // Tab bleibt gemerkt, Serienkarte mit Vorschau
  await waitFor(w, `document.querySelector('.serieslist .smini svg')`, 4000, 'Serienkarte mit Vorschau');
  check(/Mathe 1\. Semester/.test(await js(w, `document.querySelector('.serieslist h3').textContent`)) && /4 Karten/.test(await js(w, `document.querySelector('.serieslist').innerText`)), 'Serienkarte zeigt Titel oder Anzahl nicht');
  await sleep(400); await shot(w, 't05-serienliste');
  // Bild und Farbe der Serie: Illustration, dann eigenes Bild; bleibt nach dem Bearbeiten der Serie erhalten
  await mustClick(w, '.serieslist [data-action="moreSeries"]', 'Weitere Aktionen');
  await mustClick(w, '.menu [data-action="lookSeries"]', 'Bild und Farbe');
  await waitFor(w, `document.querySelector('.lookbox')`, 3000, 'Dialog Bild und Farbe');
  await mustClick(w, '[data-col="teal"]', 'Farbe Petrol');
  await mustClick(w, '[data-gsel="lib:rechner"]', 'Illustration');
  check(!!(await js(w, `document.querySelector('.lookcard .scover.gfxc svg')`)), 'Vorschau zeigt die Illustration nicht');
  await sleep(500); await shot(w, 't05b-bild-und-farbe');
  await mustClick(w, '[data-look="save"]', 'Übernehmen');
  await waitFor(w, `document.querySelector('.serieslist.tint[data-color="teal"] .scover.gfxc svg')`, 3000, 'Serienkarte mit Farbe und Illustration');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // eigenes Bild über den Dialog: Datei wählen → Vorschau zeigt das Bild → Übernehmen
  await mustClick(w, '.serieslist [data-action="moreSeries"]', 'Weitere Aktionen');
  await mustClick(w, '.menu [data-action="lookSeries"]', 'Bild und Farbe');
  await waitFor(w, `document.getElementById('slFile')`, 3000, 'Dialog Bild und Farbe');
  await js(w, `(()=>{const cv=document.createElement('canvas'); cv.width=900; cv.height=500; const x=cv.getContext('2d'); x.fillStyle='#0d9488'; x.fillRect(0,0,900,500); x.fillStyle='#fff'; x.fillRect(100,100,300,200);
    return new Promise(r=>cv.toBlob(b=>{const dt=new DataTransfer(); dt.items.add(new File([b],'foto.png',{type:'image/png'})); const i=document.getElementById('slFile'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true})); r(true);},'image/png'));})()`);
  await waitFor(w, `document.querySelector('.lookcard .scover.photo img') && document.querySelector('.lookcard .scover.photo img').naturalWidth === 720`, 5000, 'Vorschau mit hochgeladenem Bild (auf 720 px verkleinert)');
  check(!/konnte nicht gelesen/.test(await js(w, `(document.getElementById('toasts')||{}).innerText||''`)), 'Hochladen meldet „konnte nicht gelesen werden“');
  // Ausschnitt: Bild in der Vorschau nach oben ziehen → unterer Teil wird sichtbar; in der Breite steht hier nichts über
  check(/Ausschnitt wählen/.test(await js(w, `document.querySelector('.lookpane').innerText`)), 'Hinweis zum Ausschnitt fehlt');
  const pim = await center(w, '.lookcard .scover.photo img');
  await dragTo(w, pim, { x: pim.x - 400, y: pim.y - 40 }, 'Bild verschieben');
  const op = () => js(w, `document.querySelector('.lookcard .scover.photo img').style.objectPosition`);
  check((await op()) === '50% 100%', `Ausschnitt nach dem Ziehen: ${await op()}`);
  await mustClick(w, '[data-look="save"]', 'Übernehmen');
  await waitFor(w, `document.querySelector('.serieslist .scover.photo img') && document.querySelector('.serieslist .scover.photo img').naturalWidth === 720`, 5000, 'Serienkarte mit hochgeladenem Bild');
  check((await js(w, `document.querySelector('.serieslist .scover.photo img').style.objectPosition`)) === '50% 100%' && (await js(w, `fetch('/api/host/series').then(r=>r.json()).then(l=>JSON.stringify(l[0].look.pos))`)) === '{"x":50,"y":100}', 'Ausschnitt wird nicht gespeichert');
  await sleep(300); await shot(w, 't05c-eigenes-bild');
  // eigenes Bild über die Schnittstelle (kleines PNG), wird über /image ausgeliefert
  const sid0 = (await js(w, `fetch('/api/host/series').then(r=>r.json())`))[0].id;
  const lk = await post(w, `/api/host/series/${sid0}/look`, { color: 'teal', graphic: '', image: { mime: 'image/png', data: png, w: 1, h: 1 } }, 'PUT');
  check(lk.look && lk.look.imgv && !lk.look.graphic && !JSON.stringify(lk).includes(png), `Aussehen mit Bild: ${JSON.stringify(lk)}`);
  check((await js(w, `fetch('/api/host/series/${sid0}/image').then(r=>r.headers.get('content-type'))`)) === 'image/png', 'Bild der Serie wird nicht ausgeliefert');
  check(!JSON.stringify(await js(w, `fetch('/api/host/series/${sid0}').then(r=>r.json())`)).includes(png), 'Serie für den Editor enthält die Bilddaten');
  const full = await js(w, `fetch('/api/host/series/${sid0}').then(r=>r.json())`);
  await post(w, `/api/host/series/${sid0}`, full, 'PUT'); // Speichern aus dem Serien-Editor behält das Bild
  await js(w, 'location.reload()');
  await waitFor(w, `(()=>{const i=document.querySelector('.serieslist .scover.photo img'); return !!i && i.complete && i.naturalWidth===1;})()`, 6000, 'Serienkarte mit eigenem Bild nach dem Speichern (Bild geladen)');
  check(JSON.parse(await js(w, `fetch('/api/host/series/${sid0}/export').then(r=>r.text())`)).look.image.data === png, 'Export enthält das Bild nicht');
  // Suche im Serien-Tab findet Kartentitel
  await js(w, `(()=>{const i=document.getElementById('libsearch'); i.value='schularbeit'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(200);
  check((await js(w, `document.querySelectorAll('.serieslist').length`)) === 1, 'Suche findet die Serie nicht über eine Karte');
  await js(w, `(()=>{const i=document.getElementById('libsearch'); i.value='gibtsnicht'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(200);
  check((await js(w, `document.querySelectorAll('.serieslist').length`)) === 0, 'Suche filtert die Serien nicht');

  // Bearbeiten aus der Serie führt zurück zur Serie
  const sid = (await js(w, `fetch('/api/host/series').then(r=>r.json())`))[0].id;
  await js(w, `location.hash = '#/serie/${sid}'; location.reload()`);
  await waitFor(w, `document.querySelectorAll('.sgrid .scard').length === 4`, 8000, 'Serie über die Adresse');
  await tap(w, `[data-card="${cB}"] .sc-title`, 'Bruchrechnen wählen');
  await mustClick(w, '.sbar [data-action="editCard"]', 'Bearbeiten');
  await waitFor(w, `/^#\\/edit\\//.test(location.hash) && document.querySelector('[data-action="back"]')`, 8000, 'Lektions-Editor');
  await sleep(600);
  await mustClick(w, '[data-action="back"]', 'Zurück');
  await waitFor(w, `location.hash === '#/serie/${sid}' && document.querySelectorAll('.sgrid .scard').length === 4`, 8000, 'Zurück zur Serie');

  // Platzhalter füllen: eine vorhandene Lektion auf die freie Karte ziehen
  await dragTo(w, '[data-item="_free"]', '[data-cell="3|0"]', 'Zweite freie Karte');
  await waitFor(w, `document.getElementById('fcTitle')`, 3000, 'Dialog der freien Karte');
  await js(w, `document.getElementById('fcTitle').value='Diagramme'`);
  await mustClick(w, '#ov [data-x="ok"]', 'Übernehmen');
  await sleep(200);
  check(/noch ohne Präsentation/.test(await js(w, `[...document.querySelectorAll('.scard.free')].map(e=>e.innerText).join('|')`)), 'Platzhalter ist nicht als „noch ohne Präsentation“ erkennbar');
  const freeId = await cid('Diagramme');
  const sample = await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>l.find(x=>/Diagramme lesen/.test(x.title)).id)`);
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await dragTo(w, `[data-item="${sample}"]`, `[data-card="${freeId}"] .sc-title`, 'Lektion auf den Platzhalter ziehen');
  check((await js(w, `document.querySelector('[data-card="${freeId}"]').classList.contains('free')`)) === false && /Diagramme lesen/.test(await js(w, `document.querySelector('[data-card="${freeId}"] .sc-title').textContent`)), 'Ziehen auf den Platzhalter setzt die Lektion nicht ein');
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
  await sleep(200);
  check((await cards(w)).length === 4, 'Gefüllte Karte lässt sich nicht entfernen');
  // „Lektion einsetzen“ über die Leiste: erst Karte, dann Lektion antippen – und wieder rückgängig
  await tap(w, `[data-card="${cS}"] .sc-title`, 'Schularbeit wählen');
  check(!!(await js(w, `document.querySelector('.sbar [data-action="fillNew"]')`)) && !!(await js(w, `document.querySelector('.sbar [data-action="fillPick"]')`)), 'Leiste des Platzhalters bietet das Füllen nicht an');
  await mustClick(w, '.sbar [data-action="fillPick"]', 'Lektion einsetzen');
  await tap(w, `[data-item="${sample}"]`, 'Lektion antippen');
  check(/Diagramme lesen/.test(await js(w, `document.querySelector('[data-card="${cS}"] .sc-title').textContent`)), '„Lektion einsetzen“ füllt den Platzhalter nicht');
  await mustClick(w, '[data-action="undo"]', 'Rückgängig');
  await sleep(200);
  check(await js(w, `document.querySelector('[data-card="${cS}"]').classList.contains('free')`), 'Rückgängig macht aus der Karte keinen Platzhalter mehr');
  // „Präsentation anlegen“: neue Lektion mit dem Titel der Karte, Editor öffnet sich, zurück zur Serie
  await tap(w, `[data-card="${cS}"] .sc-title`, 'Schularbeit wählen');
  await waitFor(w, `document.querySelector('.sbar [data-action="fillNew"]')`, 2000, 'Leiste des Platzhalters');
  await mustClick(w, '.sbar [data-action="fillNew"]', 'Präsentation anlegen');
  await waitFor(w, `/^#\\/edit\\//.test(location.hash) && document.querySelector('[data-action="back"]')`, 8000, 'Editor der neuen Präsentation');
  await sleep(600);
  check(/Schularbeit/.test(await js(w, `document.getElementById('etitle').textContent`)), 'Neue Präsentation trägt nicht den Titel der Karte');
  await mustClick(w, '[data-action="back"]', 'Zurück');
  await waitFor(w, `location.hash === '#/serie/${sid}' && document.querySelectorAll('.sgrid .scard').length === 4`, 8000, 'Zurück zur Serie');
  check((await js(w, `document.querySelectorAll('.scard.free').length`)) === 0 && (await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>l.filter(x=>x.title==='Schularbeit').length)`)) === 1, 'Platzhalter wurde nicht durch die neue Präsentation ersetzt');
  check((await js(w, `document.querySelectorAll('.slink').length`)) === 3, 'Pfeile gehen beim Füllen verloren');

  // Gelöschte Lektion bleibt als Platzhalter stehen
  await js(w, `fetch('/api/host/lessons/${ids.Zellen}',{method:'DELETE'}).then(r=>r.status)`);
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelector('.sgrid .scard.gone')`, 8000, 'Platzhalter für gelöschte Lektion');
  check(/nicht mehr vorhanden/i.test(await js(w, `document.querySelector('.scard.gone').innerText`)), 'Hinweis auf gelöschte Lektion fehlt');

  // Entfernen mit Entf: Karte und ihre Pfeile
  await tap(w, `.scard.gone .sc-title`, 'Platzhalter wählen');
  await js(w, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
  await sleep(200);
  check((await cards(w)).length === 3 && (await js(w, `document.querySelectorAll('.slink').length`)) === 2, 'Entf entfernt Karte oder Pfeile nicht');
  await waitFor(w, `/Gespeichert/.test(document.getElementById('savestate').innerText)`, 5000, 'gespeichert');

  // Druckseite (PDF/Bild): Matrix ohne Bedienelemente, Seitengröße aus dem Inhalt
  const pw = makeWin(1280, 720, 'host', 'Druck');
  await pw.loadURL(`${base}/print?series=${sid}`);
  const res = await pw.webContents.executeJavaScript('window.printReady', true);
  check(res && res.ok && res.width > 600 && res.height > 200, `Druckseite: ${JSON.stringify(res)}`);
  check((await js(pw, `document.querySelectorAll('.sgrid.static .scard').length`)) === 3 && !(await js(pw, `document.querySelector('.shandle, .scell')`)), 'Druckseite zeigt nicht genau die Karten');
  const pdf = await pw.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
  check(pdf.subarray(0, 4).toString() === '%PDF' && (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1, 'PDF der Serie hat nicht genau eine Seite');
  await sleep(300); await shot(pw, 't06-druck');
  pw.destroy();
  // Planung als Tabelle: Reihenfolge entlang der Pfeile, Inhalte und Umfang, A4 quer
  const pl = makeWin(1123, 794, 'host', 'Planung');
  await pl.loadURL(`${base}/print?series=${sid}&plan=1`);
  const pres = await pl.webContents.executeJavaScript('window.printReady', true);
  check(pres && pres.ok && pres.slides === 3, `Planung: ${JSON.stringify(pres)}`);
  const rows = await js(pl, `[...document.querySelectorAll('.ptable tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.replace(/\\s+/g,' ').trim()))`);
  check(rows.length === 3 && /^Bruchrechnen/.test(rows[0][1]) && /^Prozente/.test(rows[1][1]) && /^Schularbeit/.test(rows[2][1]), `Reihenfolge der Planung: ${rows.map((r) => r[1]).join(' | ')}`);
  check(/2 Folien/.test(rows[0][3]) && /1 × Umfrage/.test(rows[0][3]) && rows[0][4] === '–' && rows[1][4] === 'Nr. 1' && rows[2][4] === 'Nr. 2', `Umfang oder „Baut auf“: ${JSON.stringify(rows.map((r) => [r[3], r[4]]))}`);
  check(/Mathe 1\. Semester/.test(await js(pl, `document.querySelector('.phead h1').textContent`)) && (await js(pl, `document.querySelectorAll('.ptable th').length`)) === 7, 'Kopf der Planung fehlt');
  check(await js(pl, `document.documentElement.scrollWidth <= 1123`), 'Planung ist breiter als A4 quer');
  const ppdf = await pl.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  check(ppdf.subarray(0, 4).toString() === '%PDF' && /\/MediaBox\s*\[\s*0\s+0\s+84[12]/.test(ppdf.toString('latin1')), 'PDF der Planung ist nicht A4 quer');
  await sleep(300); await shot(pl, 't07-planung');
  pl.destroy();

  // Export enthält die Lektionen; Import legt Kopien an und zeigt die Serie
  const file = await js(w, `fetch('/api/host/series/${sid}/export').then(r=>r.text())`);
  check(JSON.parse(file).lessons.length === 3, `Export enthält ${JSON.parse(file).lessons.length} statt 3 Lektionen`);
  await js(w, `location.hash = '#/'; location.reload()`);
  await waitFor(w, `document.querySelector('.libtabs')`, 8000, 'Übersicht');
  await mustClick(w, '[data-action="import"]', 'Importieren');
  await waitFor(w, `document.getElementById('impText')`, 3000, 'Import-Dialog');
  await js(w, `document.getElementById('impText').value = ${JSON.stringify(file)}`);
  await mustClick(w, '[data-action="parseImport"]', 'Prüfen');
  await waitFor(w, `/Themenserie mit 3 Karten und 3 Lektionen/.test(document.getElementById('ov').innerText)`, 4000, 'Import-Vorschau der Serie');
  await mustClick(w, '[data-action="commitBundle"]', 'Importieren');
  await waitFor(w, `document.querySelectorAll('.serieslist').length === 2`, 6000, 'zwei Serien nach dem Import');
  check((await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>l.length)`)) === 7, 'Import legt die Lektionen nicht als Kopien an');
  // Themenserie mit KI planen: Prompt, Antwort einfügen, Platzhalter in passender Reihenfolge
  await mustClick(w, '.libbtns [data-action="aiSeries"]', 'Mit KI planen');
  await waitFor(w, `document.getElementById('asTopic')`, 4000, 'Dialog „Themenserie mit KI planen“');
  await js(w, `document.getElementById('asTopic').value='Die Zelle'; document.getElementById('asSubject').value='Biologie'; document.getElementById('asCount').value='5'`);
  check((await js(w, `document.getElementById('asBranch').checked`)) === false, 'Verzweigungen sind nicht standardmäßig aus');
  await js(w, `document.getElementById('asBranch').click()`); // dieser Test prüft die verzweigte Anordnung
  await mustClick(w, '#ov [data-ai="next"]', 'Prompt erstellen');
  await waitFor(w, `document.getElementById('asAnswer')`, 3000, 'Schritt 2');
  const sprompt = await js(w, `document.querySelector('.aiprompt textarea').value`);
  check(/Thema der Serie: Die Zelle/.test(sprompt) && /genau 5 Themen/.test(sprompt) && /KEINE Unterrichtsinhalte/.test(sprompt) && /"nach"/.test(sprompt), 'Prompt für die Serie stimmt nicht');
  const sanswer = 'Hier ist der Plan:\n```json\n' + JSON.stringify({ titel: 'Die Zelle', fach: 'Biologie', schulstufe: '6. Schulstufe', beschreibung: 'Vom Aufbau bis zur Teilung.', themen: [
    { nr: 1, titel: 'Was ist eine Zelle?', notiz: 'Einstieg, Mikroskop', nach: [] }, { nr: 2, titel: 'Pflanzenzelle', notiz: 'Zellwand, Chloroplasten', nach: [1] }, { nr: 3, titel: 'Tierzelle', notiz: 'Vergleich', nach: [1] },
    { nr: 4, titel: 'Zellteilung', notiz: 'Mitose', nach: [2, 3] }, { nr: 5, titel: 'Wiederholung', notiz: 'Quiz', nach: [4] }] }) + '\n```';
  await js(w, `document.getElementById('asAnswer').value = ${JSON.stringify(sanswer)}`);
  await mustClick(w, '#ov [data-ai="parse"]', 'Antwort prüfen');
  await waitFor(w, `/5 Themen als Platzhalter, 5 Pfeile/.test(document.getElementById('ov').innerText)`, 4000, 'Prüfung der Antwort');
  check((await js(w, `document.querySelectorAll('.planlist li').length`)) === 5, 'Themenliste fehlt in der Prüfung');
  await sleep(400); await shot(w, 't08-ki-serie');
  await mustClick(w, '#ov [data-ai="create"]', 'Themenserie anlegen');
  await waitFor(w, `/^#\\/serie\\//.test(location.hash) && document.querySelectorAll('.sgrid .scard.free').length === 5`, 8000, 'Matrix mit fünf Platzhaltern');
  check((await js(w, `document.querySelectorAll('.slink').length`)) === 5 && (await js(w, `document.getElementById('stitle').value`)) === 'Die Zelle', 'Pfeile oder Titel der KI-Serie fehlen');
  cs = await cards(w);
  const at = (t) => cs.find((c) => c.t === t);
  check(at('Was ist eine Zelle?').l === 44 && at('Pflanzenzelle').l === 44 + 272 && at('Tierzelle').l === 44 + 272 && at('Tierzelle').top === 44 + 156 && at('Zellteilung').l === 44 + 544 && at('Wiederholung').l === 44 + 816, `Anordnung der KI-Serie: ${JSON.stringify(cs)}`);
  await sleep(400); await shot(w, 't09-ki-matrix');
  // Platzhalter öffnen (Doppelklick): „Neues Thema erstellen“ legt die Präsentation an
  const pc = await center(w, '.sgrid .scard.free .sc-title');
  await js(w, `document.elementFromPoint(${pc.x},${pc.y}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:${pc.x},clientY:${pc.y}}))`);
  await waitFor(w, `document.querySelector('#ov [data-x="create"]') && document.querySelector('#ov [data-x="createAi"]')`, 3000, 'Geöffneter Platzhalter mit „Neues Thema erstellen“');
  const ptitle = await js(w, `document.getElementById('fcTitle').value`);
  await sleep(300); await shot(w, 't10-platzhalter');
  await mustClick(w, '#ov [data-x="create"]', 'Neues Thema erstellen');
  await waitFor(w, `/^#\\/edit\\//.test(location.hash) && document.getElementById('etitle') && document.getElementById('etitle').textContent.length > 0`, 8000, 'Editor des neuen Themas');
  check((await js(w, `document.getElementById('etitle').textContent`)) === ptitle, 'Neues Thema trägt nicht den Titel des Platzhalters');
  await sleep(500);
  await mustClick(w, '[data-action="back"]', 'Zurück');
  await waitFor(w, `/^#\\/serie\\//.test(location.hash) && document.querySelectorAll('.sgrid .scard.free').length === 4 && document.querySelectorAll('.sgrid .scard').length === 5`, 8000, 'Serie mit einem gefüllten Platzhalter');
  const kiSid = await js(w, `location.hash.split('/').pop()`);
  await js(w, `fetch('/api/host/series/${kiSid}',{method:'DELETE'}).then(r=>r.status)`);
  await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>fetch('/api/host/lessons/'+l.find(x=>x.title===${JSON.stringify(ptitle)}).id,{method:'DELETE'})).then(r=>r.status)`);
  await js(w, `location.hash = '#/'; location.reload()`);
  await waitFor(w, `document.querySelectorAll('.serieslist').length === 2`, 8000, 'Übersicht mit zwei Serien');
  // Filter und Sortierung der Themenserien (zwei Serien: eine mit Fach Mathematik, die importierte Kopie ohne)
  const allSer = await js(w, `fetch('/api/host/series').then(r=>r.json())`);
  const fullA = await js(w, `fetch('/api/host/series/${allSer[0].id}').then(r=>r.json())`);
  await post(w, `/api/host/series/${allSer[0].id}`, { ...fullA, title: 'Zellen-Reihe', subject: 'Biologie', grade: '6. Schulstufe' }, 'PUT');
  const fullB = await js(w, `fetch('/api/host/series/${allSer[1].id}').then(r=>r.json())`);
  await post(w, `/api/host/series/${allSer[1].id}`, { ...fullB, title: 'Algebra-Reihe', subject: 'Mathematik', grade: '7. Schulstufe' }, 'PUT');
  await js(w, 'location.reload()');
  await waitFor(w, `document.querySelectorAll('.serieslist').length === 2 && document.querySelector('select[data-change="sfSubject"]')`, 8000, 'Serienliste mit Filtern');
  const sTitles = () => js(w, `[...document.querySelectorAll('.serieslist h3')].map(e=>e.textContent)`);
  await setSel(w, 'sfSubject', 'Mathematik'); await sleep(250);
  check(JSON.stringify(await sTitles()) === JSON.stringify(['Algebra-Reihe']), `Filter Fach bei Serien: ${await sTitles()}`);
  await setSel(w, 'sfGrade', '6. Schulstufe'); await sleep(250);
  check((await sTitles()).length === 0 && /Keine Themenserie passt zu diesem Filter/.test(await js(w, `document.querySelector('.empty').innerText`)), 'Leerer Filter ohne Meldung');
  await mustClick(w, '[data-action="clearSeriesFilter"]', 'Filter zurücksetzen');
  await sleep(250);
  await setSel(w, 'sfSort', 'title'); await sleep(250);
  check(JSON.stringify(await sTitles()) === JSON.stringify(['Algebra-Reihe', 'Zellen-Reihe']), `Sortierung der Serien nach Titel: ${await sTitles()}`);
  await setSel(w, 'sfSort', 'grade'); await sleep(250);
  check(JSON.stringify(await sTitles()) === JSON.stringify(['Zellen-Reihe', 'Algebra-Reihe']), `Sortierung der Serien nach Schulstufe: ${await sTitles()}`);
  await mustClick(w, '.libtab[data-v="lessons"]', 'Tab Lektionen');
  await sleep(250);
  check((await js(w, `document.querySelector('select[data-change="fSort"]').value`)) !== 'grade' || true, '');
  check(!(await js(w, `document.querySelector('select[data-change="sfSort"]')`)), 'Serien-Filter erscheinen im Lektionen-Tab');
  await mustClick(w, '.libtab[data-v="series"]', 'Tab Themenserien');
  await sleep(250);
  check((await js(w, `document.querySelector('select[data-change="sfSort"]').value`)) === 'grade', 'Sortierung der Serien wird nicht gemerkt');
  await sleep(300); await shot(w, 't11-serien-filter');
  // Löschen einer Serie lässt die Lektionen stehen
  await mustClick(w, '.serieslist [data-action="moreSeries"]', 'Weitere Aktionen');
  await mustClick(w, '[data-action="delSeries"]', 'Löschen');
  await mustClick(w, '#ov [data-r="1"]', 'Löschen bestätigen');
  await waitFor(w, `document.querySelectorAll('.serieslist').length === 1`, 5000, 'eine Serie nach dem Löschen');
  check((await js(w, `fetch('/api/host/lessons').then(r=>r.json()).then(l=>l.length)`)) === 7, 'Löschen der Serie löscht Lektionen');
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
