// UI-Test des PDF-Exports: Druckseite /print in allen Varianten und Formaten zeichnen, mit printToPDF drucken und prüfen.
// Die PDFs landen zum Ansehen im Ausgabeordner. PDF_ALL=1 druckt zusätzlich die Demo-Lektionen (alle Designs).
// Aufruf: node main/launch.cjs test/ui/pdf.mjs [Ausgabeordner]
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish, OUT } from './lib.mjs';
import { LESSONS } from './showcase-data.mjs';

const check = (c, m) => { if (!c) report(m); };
const strip = (L) => ({ ...L, slides: L.slides.map(({ demo, ...s }) => s) });
const pageCount = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

async function printPdf(base, query, file, handout) {
  const w = makeWin(1280, 720, 'host', `Druck ${file}`);
  await w.loadURL(`${base}/print?${query}`);
  const res = await Promise.race([js(w, 'window.printReady'), sleep(120000).then(() => ({ ok: false, error: 'Zeitüberschreitung' }))]);
  let pdf = null, dom = null;
  if (res && res.ok) {
    dom = await js(w, `(() => { const fr = [...document.querySelectorAll('iframe')]; const vis = (d, sel) => [...d.querySelectorAll(sel)].filter((e) => e.getClientRects().length).length;
      return { frames: fr.length,
        buttons: fr.reduce((n, f) => n + vis(f.contentDocument, '#content .btn, #content .toolbar, #content .modbar, #content button.gap'), 0),
        warns: fr.filter((f) => f.contentDocument.querySelector('#content .warn')).length,
        solved: fr.reduce((n, f) => n + f.contentDocument.querySelectorAll('.opt.ok, .choice.good, .qopt.right, .gap.open, .sortsol').length, 0),
        evals: fr.reduce((n, f) => n + f.contentDocument.querySelectorAll('.evalbox').length, 0),
        text: fr.map((f) => f.contentDocument.getElementById('content').innerText).join('\\n') }; })()`);
    // PDF_SHOTS=3,10,13 speichert Bilder dieser Folien (Nummer in der Druckseite) zum Ansehen
    if (process.env.PDF_SHOTS && !handout) for (const nr of process.env.PDF_SHOTS.split(',').map(Number)) {
      if (!(await js(w, `(()=>{const p=document.querySelectorAll('.pg')[${nr - 1}]; if(!p) return false; scrollTo(0, p.getBoundingClientRect().top + scrollY); return true;})()`))) continue;
      await sleep(500); await shot(w, `${file.replace('.pdf', '')}-${String(nr).padStart(2, '0')}`);
    }
    pdf = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
    fs.writeFileSync(path.join(OUT, file), pdf);
  } else report(`${file}: ${res ? res.error : 'keine Antwort der Druckseite'}`);
  w.destroy();
  if (pdf) {
    check(pdf.subarray(0, 5).toString() === '%PDF-', `${file}: keine PDF-Datei`);
    const pages = pageCount(pdf);
    if (!handout) check(pages === res.slides, `${file}: ${pages} Seiten für ${res.slides} Folien`);
    else check(pages === Math.ceil(res.slides / 3), `${file}: ${pages} Seiten für ${res.slides} Folien (Handzettel, drei pro Seite)`);
    check(dom.frames === res.slides, `${file}: ${dom.frames} iframes für ${res.slides} Folien`);
    check(dom.buttons === 0, `${file}: ${dom.buttons} Bedienelemente sichtbar`);
    check(dom.warns === 0, `${file}: ${dom.warns} Folien mit Fehlermeldung`);
    check(!(res.over || []).length, `${file}: Folien laufen über: ${(res.over || []).join(', ')}`);
    console.log(`  ${file}: ${pages} Seiten, ${Math.round(pdf.length / 1024)} KB`);
  }
  return { res, dom, pdf };
}

async function main() {
  const { srv, base } = await startTestServer(3330);
  console.log(`PDF-Test → ${OUT}`);
  const host = makeWin(1280, 720, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  const sample = (await js(host, `fetch('/api/host/lessons').then(r=>r.json())`))[0];
  const L = await js(host, `fetch('/api/host/lessons/${sample.id}').then(r=>r.json())`);
  const n = L.slides.filter((s) => s.type !== 'leaderboard').length;

  // Nur die Fragen: jede Folie eine Seite, keine Lösungen
  const blank = await printPdf(base, `lesson=${sample.id}`, 'pdf-fragen.pdf');
  if (blank.dom) { check(blank.res.slides === n, `Fragen: ${blank.res.slides} statt ${n} Folien (Rangliste entfällt)`); check(blank.dom.solved === 0, `Fragen: ${blank.dom.solved} Lösungen sichtbar`); check(blank.dom.evals === 0, 'Fragen: Auswertung sichtbar'); }
  // Mit Lösungen
  const sol = await printPdf(base, `lesson=${sample.id}&variant=solution`, 'pdf-loesungen.pdf');
  if (sol.dom) check(sol.dom.solved >= L.slides.filter((s) => ['mc', 'quiz', 'gap', 'sort'].includes(s.type)).length, `Lösungen: nur ${sol.dom.solved} Markierungen`);

  // Mit Ergebnissen: ein Gerät beantwortet die Wortwolke und eine Aufgabe, Stand „Klasse 4a“ speichern, dann drucken
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelector('#ov .ovbox')`, 4000, 'Beitritts-Fenster');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  const tab = makeWin(1180, 820, 'p1', 'Tablet');
  await tab.loadURL(`${base}/`);
  const goto = async (type) => { const id = L.slides.find((s) => s.type === type).id; await js(host, `(()=>{const s=document.getElementById('jump'); s.value=${JSON.stringify(id)}; s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(500); };
  await goto('wordcloud');
  await waitFor(tab, `document.querySelector('form.wordform')`, 8000, 'Wortwolke am Gerät');
  await js(tab, `(()=>{const f=document.querySelector('form.wordform'); f.querySelector('input').value='Balken'; f.requestSubmit();})()`);
  await goto('mc');
  await waitFor(tab, `document.querySelector('[data-action="t:pick"]')`, 5000, 'Multiple Choice am Gerät');
  await mustClick(tab, '[data-action="t:pick"][data-i="0"]', 'Antwort wählen');
  await sleep(400);
  await mustClick(host, '[data-action="states"]', 'Stände');
  await waitFor(host, `document.querySelector('form.saveform')`, 3000, 'Speichern-Formular');
  check(await js(host, `!!document.querySelector('#ov [data-action="pdfResults"]')`), 'Schaltfläche „Ergebnisse als PDF“ fehlt im Stände-Dialog');
  await js(host, `(()=>{const f=document.querySelector('form.saveform'); f.querySelector('input').value='Klasse 4a'; f.requestSubmit();})()`);
  await sleep(700);
  const live = await printPdf(base, `lesson=${sample.id}&variant=results&state=_live`, 'pdf-ergebnisse-live.pdf');
  if (live.dom) { check(live.dom.evals >= 1, 'Ergebnisse (laufend): keine Auswertung'); check(/Balken/.test(live.dom.text), 'Ergebnisse (laufend): Begriff der Wortwolke fehlt'); }
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  await mustClick(host, '[data-action="exit"]', 'Beenden');
  await mustClick(host, '#ov [data-r="1"]', 'Beenden bestätigen');
  await waitFor(host, `document.querySelector('.lcard')`, 6000, 'zurück in der Bibliothek');
  const saved = await printPdf(base, `lesson=${sample.id}&variant=results&state=klasse-4a`, 'pdf-ergebnisse-stand.pdf');
  if (saved.dom) { check(saved.dom.evals >= 1, 'Ergebnisse (Stand): keine Auswertung'); check(/Balken/.test(saved.dom.text), 'Ergebnisse (Stand): Begriff der Wortwolke fehlt'); }
  const none = await js(host, `fetch('/api/host/lessons/${sample.id}/results/gibt-es-nicht').then(r=>r.status)`);
  check(none === 404, `Unbekannter Stand liefert ${none} statt 404`);

  // Handzettel mit Notizen und hellem Design
  await printPdf(base, `lesson=${sample.id}&variant=solution&format=handout&notes=1&light=1`, 'pdf-handzettel.pdf', true);

  // Einstieg in der Bibliothek: Menü der Lektion → Dialog
  await mustClick(host, '[data-action="more"]', 'Menü der Lektion');
  await mustClick(host, '#ov [data-action="pdf"]', 'Als PDF exportieren');
  await sleep(500); await shot(host, 'pdf-dialog');
  check((await js(host, `document.querySelector('.toast, #toast')?.innerText || ''`)).includes('Plenum-App') || await js(host, `!!document.querySelector('#pdfGo')`), 'PDF-Dialog öffnet sich nicht');

  if (process.env.PDF_ALL) {
    for (const D of LESSONS) {
      const r = await js(host, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify({ lesson: strip(D) }))}}).then(r=>r.json())`);
      if (r && r.id) await printPdf(base, `lesson=${r.id}&variant=solution`, `pdf-design-${D.theme || 'standard'}.pdf`);
    }
  }
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
