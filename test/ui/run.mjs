// UI-Durchlauf mit echtem Electron (offscreen): Lehrkraft-Fenster + mehrere Schülergeräte gehen die Beispiellektion durch.
// Aufruf: node main/launch.cjs test/ui/run.mjs [Ausgabeordner]
// Prüft: keine JS-Fehler, kein Scrollen (Beamer und Handy), alle Typen bedienbar; speichert Screenshots.
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, OUT, sleep, report, makeWin, js, waitFor, click, mustClick, shot, startTestServer, finish } from './lib.mjs';

const N_STUDENTS = 6;
const HOST_W = +(process.env.UI_W || 1280), HOST_H = +(process.env.UI_H || 720);

// Passt die Seite ohne Scrollen? (Zoom-Einpassung muss greifen)
let phoneScroll = 0;
async function fits(win, name, phone = false) {
  const r = await js(win, `(()=>{const se=document.scrollingElement; const over=[...document.querySelectorAll('.fit, main, .stage, .s-main')].map(e=>e.scrollHeight-e.clientHeight).filter(x=>x>2); return {doc: se.scrollHeight - se.clientHeight, wide: se.scrollWidth - se.clientWidth, over: Math.max(0,...over)};})()`);
  if (r.wide > 2) report(`${name}: zu breit (${r.wide}px)`);
  if (phone) { if (r.doc > 2) report(`${name}: Seite scrollt (${r.doc}px)`); else if (r.over > 2) phoneScroll++; return; } // Handy: Scrollen im Inhaltsbereich ist erlaubt (Mindestzoom 85 %)
  if (r.doc > 2 || r.over > 2) report(`${name}: scrollt (Dokument ${r.doc}px, Bereich ${r.over}px)`);
}

const WORDS = [['Zahlen', 'Balken', 'Statistik'], ['Prozent', 'Balken'], ['Kurve', 'Zahlen', 'Mathe'], ['Kreis', 'Zahlen'], ['Balken', 'Umfrage', 'Daten'], ['Statistik', 'Zahlen']];
const pick = (n, i) => (i * 7 + 3) % n;

async function studentAct(st, slide, i, round = 0) {
  const T = slide.type;
  if (T === 'wordcloud') {
    await js(st, `(()=>{const f=document.querySelector('form.wordform'); const w=${JSON.stringify(WORDS[i % WORDS.length])}; f.querySelectorAll('input').forEach((x,k)=>x.value=w[k]||''); f.requestSubmit();})()`);
  } else if (T === 'scale') {
    for (let k = 0; k < slide.statements.length; k++) await click(st, `[data-action="t:rate"][data-i="${k}"][data-v="${1 + ((i + k + round * 2) % slide.steps)}"]`);
  } else if (T === 'poll') {
    if (slide.multi) { for (const k of [pick(slide.options.length, i), (i + 1) % slide.options.length, (i * 3) % slide.options.length]) await click(st, `.vopt[data-i="${k}"]:not(.sel)`); await mustClick(st, '[data-action="t:send"]', `Schüler ${i} poll senden`); }
    else await mustClick(st, `.vopt[data-i="${pick(slide.options.length, i)}"]`, `Schüler ${i} poll`);
  } else if (T === 'mc') {
    await mustClick(st, `[data-action="t:pick"][data-i="${pick(slide.options.length, i)}"]`, `Schüler ${i} mc`);
  } else if (T === 'truefalse') {
    for (let k = 0; k < slide.items.length; k++) await click(st, `[data-action="t:answer"][data-i="${k}"][data-v="${(i + k) % 3 ? 'true' : 'false'}"]`);
  } else if (T === 'sort') {
    const n = await js(st, 'document.querySelectorAll(\'[data-action="t:place"][data-k="0"]\').length');
    for (let k = 0; k < n; k++) await js(st, `(()=>{const b=[...document.querySelectorAll('[data-action="t:place"]')].filter(x=>!x.disabled); const ids=[...new Set(b.map(x=>x.dataset.i))]; if(!ids.length) return; const g=b.filter(x=>x.dataset.i===ids[0]); g[(${i}+${k})%g.length].click();})()`);
  } else if (T === 'task') {
    if (i % 2 === 0) await mustClick(st, '[data-action="t:done"]', `Schüler ${i} fertig`);
  } else if (T === 'open') {
    const texts = ['Jugend im Schlafnotstand!', 'SCHOCK: Niemand schläft mehr!', 'Halbe Klasse schläft im Unterricht ein', 'Schlaflos in der 4b', 'Experten entsetzt über Schlafmangel', 'Kinder schlafen 0 Stunden'];
    await js(st, `(()=>{const f=document.querySelector('form.wordform'); if(!f) return; f.querySelector('textarea').value=${JSON.stringify(texts[i % texts.length])}; f.requestSubmit();})()`);
  }
}

async function main() {
  const { srv, base } = await startTestServer();
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const lesson = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 'diagramme-und-umfragen.plenum'), 'utf8'));
  console.log(`UI-Test ${HOST_W}×${HOST_H} → ${OUT}`);

  // 1) Bibliothek
  const host = makeWin(HOST_W, HOST_H, 'host', 'Lehrkraft');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek mit Beispiellektion');
  await sleep(700); await shot(host, '00-bibliothek'); await fits(host, 'Bibliothek');

  // 2) Präsentieren
  await mustClick(host, '[data-action="present"]', 'Präsentieren');
  await waitFor(host, `document.querySelector('[data-action="next"]')`, 6000, 'Präsentation gestartet');
  await sleep(900);
  await mustClick(host, 'header [data-action="join"], [data-action="join"]', 'Beitreten-Knopf');
  await waitFor(host, `document.querySelector('#ov .ovbox svg, #ov .ovbox img')`, 4000, 'QR-Code im Beitritts-Fenster');
  const joinInfo = await js(host, `document.querySelector('#ov .ovbox')?.innerText || ''`);
  if (!/http:\/\//.test(joinInfo)) report('Beitritts-Fenster zeigt keinen Link');
  await sleep(500); await shot(host, '01-beitreten');
  await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

  // 3) Schülergeräte treten bei
  const students = [];
  for (let i = 0; i < N_STUDENTS; i++) {
    const st = makeWin(390, 760, `s${i}`, `Schüler ${i}`);
    st.loadURL(`${base}/`);
    students.push(st);
  }
  for (const [i, st] of students.entries()) await waitFor(st, `(document.querySelector('#content')?.innerText.trim().length > 0) && !document.querySelector('#ov .ovbox')`, 8000, `Schüler ${i} beigetreten`);
  await sleep(600);
  await shot(students[0], 's00-titel');
  const online = await js(host, `document.body.innerText`);
  if (!new RegExp(`\\b${N_STUDENTS}\\b`).test(online)) report(`Lehrkraft sieht nicht ${N_STUDENTS} Geräte`);

  // Moderationsfenster (Referentenansicht) im Lehrkraft-Profil
  const mod = makeWin(1100, 720, 'host', 'Moderation');
  await mod.loadURL(`${base}/host#/moderation`);
  await sleep(800);

  // 4) Folie für Folie
  for (let n = 0; n < lesson.slides.length; n++) {
    const s = lesson.slides[n];
    const tag = String(n + 1).padStart(2, '0') + '-' + s.type;
    if (n > 0) {
      await mustClick(host, '[data-action="next"]', `Weiter zu ${n + 1}`);
      await sleep(350);
    }
    // Folien ohne Aufgabe bleiben standardmäßig am Beamer: am Gerät steht „Schau nach vorne“
    const passive = ['title', 'info', 'summary', 'sources'].includes(s.type);
    const ok = await waitFor(students[0], passive ? `!!document.querySelector('.lookup') && document.getElementById('hnum').textContent.trim().startsWith('${n + 1} ')` : `document.body.innerText.includes(${JSON.stringify(s.title.slice(0, 18))})`, 4000, `Schüler sieht Folie ${n + 1} (${s.type})`);
    if (!ok) continue;

    if (s.type === 'quiz') {
      await mustClick(host, '[data-action="quiz"][data-q="start"]', 'Quiz starten');
      await sleep(3300);
      await shot(students[0], 's' + tag + '-frage');
      for (const [i, st] of students.entries()) { if (i === 5) continue; await click(st, `[data-action="t:answer"][data-i="${(i + n) % 3 === 0 ? 1 : 0}"]`); await sleep(150); }
      await sleep(400); await shot(host, tag + '-laeuft');
      await mustClick(host, '[data-action="quiz"][data-q="stop"]', 'Quiz beenden');
      await sleep(400);
      await mustClick(host, '[data-action="quiz"][data-q="reveal"]', 'Auflösen');
      await sleep(900);
      await shot(students[0], 's' + tag);
      if (n === lesson.slides.findIndex((x) => x.type === 'quiz')) { await sleep(300); await shot(mod, 'mod-' + tag); }
    } else {
      for (const [i, st] of students.entries()) await studentAct(st, s, i);
      await sleep(250);
      await shot(students[0], 's' + tag);
      if (s.type === 'gap') await mustClick(host, '[data-action="t:revealAll"]', 'Lücken aufdecken');
      if (s.type === 'lab') { await mustClick(host, '[data-action="t:labRed"]', 'Labor rot'); await js(host, `(()=>{const r=document.getElementById('lab_ymin'); r.value=r.max; r.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
      if (s.type === 'open') { await sleep(300); await shot(host, tag + '-zurueckgehalten'); await mustClick(host, '[data-action="moderate"][data-mod="showAll"]', 'Alle freigeben'); await shot(mod, 'mod-' + tag); }
      if (s.type === 'poll' && s.splitA) await click(host, '[data-action="t:set"][data-k="reveal"]');
      if (s.type === 'poll' && s.compareValues) await click(host, '[data-action="t:set"][data-k="cmp"]');
    }
    await sleep(1300);
    await shot(host, tag);
    await fits(host, `Beamer Folie ${n + 1} (${s.type})`);
    await fits(students[0], `Handy Folie ${n + 1} (${s.type})`, true);
  }

  // 5) Stand speichern über den Dialog
  await mustClick(host, '[data-action="states"]', 'Stände-Dialog');
  await sleep(500); await shot(host, '99-staende');

  finish(srv, `Handy: ${phoneScroll} Folien mit Scrollen im Inhaltsbereich (erlaubt).`);
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
