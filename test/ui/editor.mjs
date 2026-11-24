// UI-Test des Editors (offscreen): Auswahl, Vorschau, Formular, Diagrammdaten, neue Folie, Rückgängig,
// Umsortieren, Abschnitte, Prüfhinweise, Löschen, Hinweis während einer Präsentation. Prüft jeweils den gespeicherten Stand.
// Aufruf: node main/launch.cjs test/ui/editor.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, click, mustClick, shot, startTestServer, finish, OUT } from './lib.mjs';

const ID = 'L-beispiel-diagramme';
const saved = (win) => js(win, `fetch('/api/host/lessons/${ID}').then(r=>r.json())`);
const pvq = (sel) => `(document.getElementById('pv')?.contentDocument?.querySelector(${JSON.stringify(sel)}))`;
const setVal = (win, sel, v, ev = 'input') => js(win, `(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.value=${JSON.stringify(v)}; el.dispatchEvent(new Event(${JSON.stringify(ev)},{bubbles:true})); return true;})()`);
const check = (cond, msg) => { if (!cond) report(msg); };
async function settle(win) { await waitFor(win, `document.getElementById('savestate')?.innerText.includes('Gespeichert')`, 6000, 'Speichern abgeschlossen'); }

async function main() {
  const { srv, base } = await startTestServer(3190);
  console.log(`Editor-Test → ${OUT}`);
  const w = makeWin(1366, 768, 'host', 'Editor');
  await w.loadURL(`${base}/host`);
  await waitFor(w, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  await mustClick(w, '[data-action="edit"]', 'Bearbeiten');
  await waitFor(w, `document.querySelectorAll('.eslide').length === 31`, 6000, 'Editor mit 31 Folien');
  await waitFor(w, pvq('#content .wrap'), 6000, 'Vorschau zeigt Folie');
  await sleep(900); await shot(w, 'e01-start');
  const docScroll = await js(w, 'document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight');
  check(docScroll <= 2, `Editor-Seite scrollt (${docScroll}px)`);

  // Umfrage auswählen, Beispielantworten, Handy-Ansicht
  await mustClick(w, '.eslide[data-id="s-umfrage-social"]', 'Umfrage wählen');
  await waitFor(w, `document.querySelector('[data-f="options.0"]')`, 3000, 'Formular der Umfrage');
  await waitFor(w, `${pvq('.vopts, .chartbox, .toolbar')}`, 3000, 'Vorschau der Umfrage');
  await sleep(700); await shot(w, 'e02-umfrage');
  await mustClick(w, '[data-action="pvDemo"]', 'Beispielantworten');
  await waitFor(w, `(new Set([...document.getElementById('pv').contentDocument.querySelectorAll('.chart text')].map(t=>t.textContent.trim()).filter(x=>/^[1-9]\d*$/.test(x))).size >= 3)`, 3000, 'Vorschau mit verteilten Beispielantworten');
  await sleep(900); await shot(w, 'e03-umfrage-beispiel');
  await mustClick(w, '[data-action="pvMode"][data-v="student"]', 'Handy-Vorschau');
  await waitFor(w, `${pvq('.vopt')}`, 3000, 'Handy-Vorschau mit Antwortknöpfen');
  await sleep(700); await shot(w, 'e04-handy');
  await mustClick(w, '[data-action="pvMode"][data-v="host"]', 'Beamer-Vorschau');
  await mustClick(w, '[data-action="pvDemo"]', 'Beispielantworten aus');

  // Diagrammwert ändern → gespeichert
  await mustClick(w, '.eslide[data-id="s-social"]', 'MC mit Diagramm wählen');
  await waitFor(w, `document.querySelector('[data-f="chart.series.0.values.0"]')`, 3000, 'Diagrammtabelle');
  await setVal(w, '[data-f="chart.series.0.values.0"]', '95,5');
  await setVal(w, '[data-f="chart.labels.0"]', 'WhatsApp*');
  await sleep(300); await shot(w, 'e05-diagrammtabelle');
  await settle(w);
  let L = await saved(w);
  let s = L.slides.find((x) => x.id === 's-social');
  check(s.chart.series[0].values[0] === 95.5 && s.chart.labels[0] === 'WhatsApp*', `Diagrammwert nicht gespeichert: ${JSON.stringify(s.chart.series[0].values.slice(0, 2))} ${s.chart.labels[0]}`);
  await mustClick(w, '[data-action="c:addRow"]', 'Zeile hinzufügen');
  await settle(w);
  L = await saved(w); s = L.slides.find((x) => x.id === 's-social');
  check(s.chart.labels.length === 9, `Neue Diagrammzeile fehlt (${s.chart.labels.length})`);

  // Neue Quizfolie über die Typauswahl
  await mustClick(w, '[data-action="add"]', 'Folie hinzufügen');
  await waitFor(w, `document.querySelector('.tcard[data-type="quiz"]')`, 3000, 'Typauswahl');
  await sleep(400); await shot(w, 'e06-typauswahl');
  await mustClick(w, '.tcard[data-type="quiz"]', 'Quiz wählen');
  await waitFor(w, `document.querySelectorAll('.eslide').length === 32 && document.querySelector('[data-f="question"]')`, 3000, 'Neue Quizfolie');
  await setVal(w, '[data-f="question"]', 'Testfrage aus dem Editor?');
  await setVal(w, '[data-f="options.1.text"]', 'Richtige Antwort');
  await js(w, `(()=>{const r=document.querySelector('[data-k="correct"][data-i="1"]'); r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await mustClick(w, '[data-action="f:add"][data-f="options"]', 'Antwort hinzufügen');
  const focused = await js(w, 'document.activeElement && document.activeElement.dataset.f');
  check(/^options\.\d+\.text$/.test(focused || ''), `Neue Antwort bekommt keinen Fokus (${focused})`);
  await settle(w);
  L = await saved(w);
  const q = L.slides.find((x) => x.question === 'Testfrage aus dem Editor?');
  check(q && q.type === 'quiz' && q.options[1].correct && !q.options[0].correct, 'Quizfolie/richtige Antwort nicht gespeichert');
  check(L.slides.indexOf(q) === L.slides.findIndex((x) => x.id === 's-social') + 1, 'Neue Folie nicht nach der ausgewählten eingefügt');
  await sleep(500); await shot(w, 'e07-quiz-neu');

  // Rückgängig bis zum Ausgangszustand, dann Wiederholen
  for (let i = 0; i < 12 && (await js(w, `document.querySelectorAll('.eslide').length`)) > 31; i++) { await mustClick(w, '[data-action="undo"]', 'Rückgängig'); await sleep(80); }
  check((await js(w, `document.querySelectorAll('.eslide').length`)) === 31, 'Rückgängig entfernt die neue Folie nicht');
  await mustClick(w, '[data-action="redo"]', 'Wiederholen');
  check((await js(w, `document.querySelectorAll('.eslide').length`)) === 32, 'Wiederholen stellt die Folie nicht her');
  await mustClick(w, '[data-action="undo"]', 'Rückgängig');
  await settle(w);
  L = await saved(w);
  check(L.slides.length === 31, `Nach Rückgängig gespeichert: ${L.slides.length} Folien`);

  // Umsortieren mit Pfeilen, Abschnitt wechseln
  await mustClick(w, '.eslide[data-id="s-wolke"]', 'Wortwolke wählen');
  await mustClick(w, '.eslide.on [data-action="down"]', 'Nach unten');
  await settle(w);
  L = await saved(w);
  check(L.slides.findIndex((x) => x.id === 's-wolke') === 2, `Pfeil nach unten wirkt nicht (Index ${L.slides.findIndex((x) => x.id === 's-wolke')})`);
  await setVal(w, 'select[data-change="section"]', 'S-quiz', 'change');
  await settle(w);
  L = await saved(w);
  const wi = L.slides.findIndex((x) => x.id === 's-wolke'), wl = L.slides[wi];
  check(wl.section === 'S-quiz' && wi === L.slides.length - 1, `Abschnittswechsel: Abschnitt ${wl.section}, Index ${wi}`);

  // Prüfhinweis bei fehlendem Pflichtfeld
  await setVal(w, '[data-f="question"]', '');
  await waitFor(w, `document.querySelector('.eslide.on .ewarn') && document.querySelector('#fissues .warn')`, 3000, 'Prüfhinweis bei leerer Frage');
  await sleep(300); await shot(w, 'e08-pruefhinweis');
  await setVal(w, '[data-f="question"]', 'Woran denkst du?');
  await waitFor(w, `!document.querySelector('.eslide.on .ewarn')`, 3000, 'Prüfhinweis verschwindet');

  // Lektion & Abschnitte: Farbe und Symbol
  await mustClick(w, '[data-action="selLesson"]', 'Lektion wählen');
  await waitFor(w, `document.querySelector('.secedit')`, 3000, 'Abschnitts-Editor');
  await mustClick(w, '.secedit:nth-of-type(1) [data-action="secColor"][data-v="emerald"], [data-action="secColor"][data-i="0"][data-v="emerald"]', 'Farbe wählen');
  await mustClick(w, '[data-action="pickIcon"][data-f="sections.0.icon"]', 'Symbolwahl');
  await waitFor(w, `document.querySelector('[data-icon="music"]')`, 3000, 'Symbolraster');
  await mustClick(w, '[data-icon="music"]', 'Symbol wählen');
  await mustClick(w, '[data-action="secAdd"]', 'Abschnitt hinzufügen');
  await settle(w);
  L = await saved(w);
  check(L.sections[0].color === 'emerald' && L.sections[0].icon === 'music', `Abschnitt: ${L.sections[0].color}/${L.sections[0].icon}`);
  check(L.sections.length === 5, `Neuer Abschnitt fehlt (${L.sections.length})`);
  await sleep(400); await shot(w, 'e09-lektion');

  // Folie löschen und zurückholen
  await mustClick(w, '.eslide[data-id="s-hue"]', 'Folie wählen');
  await mustClick(w, '[data-action="delSlide"]', 'Folie löschen');
  check((await js(w, `document.querySelectorAll('.eslide').length`)) === 30, 'Löschen wirkt nicht');
  await js(w, `document.activeElement && document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);
  check((await js(w, `document.querySelectorAll('.eslide').length`)) === 31, 'Strg+Z holt die Folie nicht zurück');
  await settle(w);

  // Grafiken: Position ändern, Illustration wählen, eigenes Bild einbetten
  await mustClick(w, '.eslide[data-id="s-fuenf"]', 'Folie mit Grafik wählen');
  await waitFor(w, `document.querySelector('.gcur .gthumb svg.gfx')`, 3000, 'Grafik im Formular');
  await mustClick(w, '[data-action="g:pos"][data-v="left"]', 'Grafik links');
  await waitFor(w, `${pvq('.wrap.g-left .sfig svg.gfx')}`, 3000, 'Vorschau: Grafik links');
  await mustClick(w, '.eslide[data-id="s-skala-vorher"]', 'Folie ohne Grafik');
  await mustClick(w, '[data-action="g:pick"]', 'Grafik hinzufügen');
  await waitFor(w, `document.querySelector('[data-gsel="lib:rakete"]')`, 3000, 'Grafik-Auswahl');
  await sleep(300); await shot(w, 'e11-grafikauswahl');
  await mustClick(w, '[data-gsel="lib:rakete"]', 'Rakete wählen');
  await waitFor(w, `${pvq('.wrap.g-right .sfig svg.gfx')}`, 3000, 'Vorschau: Rakete rechts');
  await settle(w);
  L = await saved(w);
  check(L.slides.find((x) => x.id === 's-fuenf').graphic.pos === 'left', 'Grafik-Position nicht gespeichert');
  check(JSON.stringify(L.slides.find((x) => x.id === 's-skala-vorher').graphic) === JSON.stringify({ src: 'lib:rakete', pos: 'right', size: 'm' }), `Rakete: ${JSON.stringify(L.slides.find((x) => x.id === 's-skala-vorher').graphic)}`);
  await mustClick(w, '.eslide[data-id="s-quellen-vergleich"]', 'Folie für eigenes Bild');
  await mustClick(w, '[data-action="g:pick"]', 'Grafik ändern');
  await mustClick(w, '[data-gtab="own"]', 'Reiter „Eigenes Bild“');
  await js(w, `(async()=>{ const c=document.createElement('canvas'); c.width=1600; c.height=1000; const g=c.getContext('2d'); const gr=g.createLinearGradient(0,0,1600,1000); gr.addColorStop(0,'#0ea5e9'); gr.addColorStop(1,'#a855f7'); g.fillStyle=gr; g.fillRect(0,0,1600,1000); g.fillStyle='#fff'; g.font='bold 120px sans-serif'; g.fillText('Foto',600,540); const b=await new Promise(r=>c.toBlob(r,'image/png')); const dt=new DataTransfer(); dt.items.add(new File([b],'foto.png',{type:'image/png'})); const i=document.getElementById('gFile'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await waitFor(w, `${pvq('.sfig.photo img')} && ${pvq('.sfig.photo img')}.naturalWidth > 0`, 5000, 'Vorschau zeigt eigenes Bild');
  await setVal(w, '[data-f="graphic.caption"]', 'Foto: eigene Aufnahme');
  await settle(w);
  L = await saved(w);
  const pg = L.slides.find((x) => x.id === 's-quellen-vergleich').graphic, mid = pg && pg.src.startsWith('media:') ? pg.src.slice(6) : '';
  check(mid && L.media && L.media[mid] && L.media[mid].mime === 'image/webp' && L.media[mid].w === 1600, `Eigenes Bild nicht eingebettet: ${JSON.stringify(pg)}`);
  check(pg && pg.caption === 'Foto: eigene Aufnahme', 'Bildunterschrift nicht gespeichert');
  const med = await js(w, `fetch('/media/${ID}/${mid}').then(r=>[r.status, r.headers.get('content-type')])`);
  check(med[0] === 200 && med[1] === 'image/webp', `Bild-Adresse für die Lehrkraft: ${med}`);
  await sleep(300); await shot(w, 'e12-eigenes-bild');

  // Design und Titelbild
  await setVal(w, '#pvTheme', 'dark', 'change');
  await waitFor(w, `${pvq('#app[data-theme="dark"]')}`, 3000, 'Vorschau im Design „Dunkel“');
  await mustClick(w, '.eslide[data-id="s-titel"]', 'Titelfolie wählen');
  await setVal(w, 'select[data-f="art"]', 'bubbles');
  await setVal(w, 'select[data-f="layout"]', 'split');
  await waitFor(w, `${pvq('.hero.lay-split .hero-vis .ha-p')}`, 3000, 'Vorschau: Titel geteilt mit Sprechblasen');
  await sleep(500); await shot(w, 'e13-design-titel');
  await settle(w);
  L = await saved(w);
  check(L.theme === 'dark' && L.slides[0].art === 'bubbles' && L.slides[0].layout === 'split', `Design/Titel: ${L.theme} ${L.slides[0].art} ${L.slides[0].layout}`);

  // Während einer Präsentation: Hinweis und „Änderungen übernehmen“
  const stud = makeWin(390, 760, 'stud', 'Schüler');
  await stud.loadURL(`${base}/`);
  const before = await js(stud, `fetch('/media/${ID}/${mid}').then(r=>r.status)`);
  check(before === 404, `Bild ohne Präsentation für die Klasse erreichbar (${before})`);
  await mustClick(w, '[data-action="back"]', 'Zurück zur Bibliothek');
  await waitFor(w, `document.querySelector('.lcard')`, 4000, 'Bibliothek nach Editor');
  await mustClick(w, '[data-action="present"]', 'Präsentieren');
  await waitFor(w, `document.querySelector('#content .wrap')`, 4000, 'Präsentation');
  await js(w, `location.hash = '#/edit/${ID}'; location.reload()`);
  await waitFor(w, `document.querySelector('.edbanner [data-action="apply"]')`, 6000, 'Hinweis „wird präsentiert“');
  await mustClick(w, '.eslide[data-id="s-titel"]', 'Titelfolie wählen');
  await setVal(w, '[data-f="subtitle"]', 'Geändert während der Präsentation');
  await settle(w);
  await mustClick(w, '[data-action="apply"]', 'Änderungen übernehmen');
  await waitFor(w, `document.getElementById('toasts')?.innerText.includes('übernommen')`, 3000, 'Bestätigung „übernommen“');
  await sleep(300); await shot(w, 'e10-praesentation-laeuft');
  const during = await js(stud, `fetch('/media/${ID}/${mid}').then(r=>r.status)`);
  check(during === 200, `Bild während der Präsentation für die Klasse: ${during}`);

  // Abschnitt über den Knopf in der Folienliste anlegen; die nächste Folie landet darin
  const secN = await js(w, `document.querySelectorAll('.secedit').length || 0`);
  await mustClick(w, '[data-action="secNew"]', 'Abschnitt hinzufügen');
  await waitFor(w, `document.querySelectorAll('.secedit').length > 0 && document.activeElement && document.activeElement.value === 'Neuer Abschnitt'`, 3000, 'neuer Abschnitt mit Fokus im Namensfeld');
  check(await js(w, `!!document.querySelector('.esec.empty')`), 'leerer Abschnitt fehlt in der Folienliste');
  await shot(w, 'e-abschnitt-neu');
  await mustClick(w, '[data-action="add"]', 'Folie hinzufügen');
  await mustClick(w, '[data-action="addType"][data-type="info"]', 'Info-Folie');
  await sleep(400);
  check(await js(w, `(()=>{const l=[...document.querySelectorAll('.eslides > *')]; const on=document.querySelector('.eslide.on'); let k=l.indexOf(on); while(k>=0 && !l[k].classList.contains('esec')) k--; return k>=0 && l[k].textContent.includes('Neuer Abschnitt') && document.querySelectorAll('.esec.empty').length === 1;})()`), 'neue Folie liegt nicht im neuen Abschnitt');
  finish(srv);
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
