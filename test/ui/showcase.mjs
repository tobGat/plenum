// Bildschirmfotos mit Lektionen aus verschiedenen Fächern (Daten: showcase-data.mjs) – für Store und Website.
// Zehn simulierte Geräte antworten; der Beamer wird in 1366 × 768 aufgenommen (UI_W/UI_H ändern das).
// Aufruf: node main/launch.cjs test/ui/showcase.mjs <Ausgabeordner>
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, click, mustClick, shot, startTestServer, finish } from './lib.mjs';
import { LESSONS } from './showcase-data.mjs';
import { gapAlts } from '../../shared/types/content.js';

const W = +(process.env.UI_W || 1366), H = +(process.env.UI_H || 768), N = 10;
const strip = (L) => ({ ...L, slides: L.slides.map(({ demo, ...s }) => s) });
const esc = (v) => JSON.stringify(v);

// Ein Gerät beantwortet die Folie – meist richtig, damit die Auswertung realistisch aussieht
async function answer(st, s, d, i) {
  const T = s.type;
  if (T === 'wordcloud') await js(st, `(()=>{const f=document.querySelector('form.wordform'); if(!f) return; const w=${esc(d.words[i % d.words.length])}; f.querySelectorAll('input').forEach((x,k)=>x.value=w[k]||''); f.requestSubmit();})()`);
  else if (T === 'open') { if (i < d.texts.length) await js(st, `(()=>{const f=document.querySelector('form.wordform'); if(!f) return; f.querySelector('textarea').value=${esc(d.texts[i])}; f.requestSubmit();})()`); }
  else if (T === 'poll') await click(st, `.vopt[data-i="${d.votes[i % d.votes.length]}"]`);
  else if (T === 'mc') { const ok = s.options.findIndex((o) => o.correct); await click(st, `[data-action="t:pick"][data-i="${i % 4 === 3 ? (ok + 1 + (i % 2)) % s.options.length : ok}"]`); }
  else if (T === 'truefalse') { // erster Knopf = „Richtig“, zweiter = „Falsch“
    for (let k = 0; k < s.items.length; k++) { const wrong = (i + k * 2) % 5 === 0, say = s.items[k].correct !== wrong; await js(st, `(()=>{const b=document.querySelectorAll('[data-action="t:answer"][data-i="${k}"]')[${say ? 0 : 1}]; if(b) b.click();})()`); await sleep(40); }
  }
  else if (T === 'sort') { let idx = 0; for (const [c, cat] of s.categories.entries()) for (let q = 0; q < cat.items.length; q++, idx++) { const wrong = (i * 3 + idx) % 7 === 0; await click(st, `[data-action="t:place"][data-i="${idx}"][data-k="${wrong ? (c + 1) % s.categories.length : c}"]`); } }
  else if (T === 'scale') { for (let k = 0; k < s.statements.length; k++) await click(st, `[data-action="t:rate"][data-i="${k}"][data-v="${Math.max(1, Math.min(s.steps, 4 - k + ((i * (k + 2)) % 3) - (i % 4 === 0 ? 1 : 0)))}"]`); }
  else if (T === 'task') { if (i % 3 !== 0) await click(st, '[data-action="t:done"]'); }
  else if (T === 'gap' && i === 0) { // nur das Gerät fürs Foto: Wort antippen, dann Lücke; die letzte Lücke bleibt offen
    const alts = gapAlts(s.text);
    for (let k = 0; k < alts.length - 1; k++) { await js(st, `(()=>{const c=[...document.querySelectorAll('.wordbank .wchip')].find(x=>x.textContent===${esc(alts[k][0])}); if(c) c.click();})()`); await click(st, `.filltext [data-i="${k}"]`); await sleep(60); }
  }
}

async function main() {
  const { srv, base } = await startTestServer(3290);
  const host = makeWin(W, H, 'host', 'Beamer');
  await host.loadURL(`${base}/host`);
  await waitFor(host, `document.querySelector('.lcard')`, 8000, 'Bibliothek');
  const ids = [];
  for (const L of LESSONS) {
    const r = await js(host, `fetch('/api/host/lessons',{method:'POST',headers:{'content-type':'application/json'},body:${esc(JSON.stringify({ lesson: strip(L) }))}}).then(r=>r.json())`);
    if (!r || !r.id) { report(`Lektion „${L.title}“ konnte nicht angelegt werden: ${JSON.stringify(r).slice(0, 200)}`); ids.push(null); } else ids.push(r.id);
  }
  await js(host, 'location.reload()');
  await waitFor(host, `document.querySelectorAll('.lcard').length >= ${LESSONS.length}`, 8000, 'Lektionen in der Bibliothek');
  await sleep(600); await shot(host, 'bibliothek-faecher');

  // Gerät 0 ist ein Laptop (für Fotos der Schüleransicht), die übrigen sind klein
  const students = Array.from({ length: N }, (_, i) => makeWin(i ? 420 : W, i ? 700 : H, `sc${i}`, `Gerät ${i}`));
  for (const st of students) await st.loadURL(`${base}/`);

  for (const [li, L] of LESSONS.entries()) {
    if (!ids[li]) continue;
    await mustClick(host, `[data-action="present"][data-id="${ids[li]}"]`, `„${L.title}“ präsentieren`);
    await waitFor(host, `document.querySelector('#ov .ovbox')`, 5000, 'Beitritts-Fenster');
    await js(host, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    for (const st of students) await waitFor(st, `document.querySelector('#content')?.innerText.trim().length > 0 && !document.querySelector('#ov .ovbox')`, 9000, 'Gerät verbunden');
    for (const [n, s] of L.slides.entries()) {
      const d = s.demo || {};
      if (n) { await mustClick(host, '[data-action="next"]', 'Weiter'); }
      await sleep(900);
      if (s.type === 'quiz') {
        await mustClick(host, '[data-action="quiz"][data-q="start"]', 'Quiz starten');
        await sleep(3400);
        const ok = s.options.findIndex((o) => o.correct);
        for (const [i, st] of students.entries()) { if (i === 7) continue; await click(st, `[data-action="t:answer"][data-i="${i % 4 === 2 ? (ok + 1) % s.options.length : ok}"]`); await sleep(120 + i * 40); }
        await mustClick(host, '[data-action="quiz"][data-q="stop"]', 'Quiz beenden'); await sleep(400);
        await mustClick(host, '[data-action="quiz"][data-q="reveal"]', 'Auflösen');
      } else {
        for (const [i, st] of students.entries()) await answer(st, s, d, i);
        if (d.student) { await sleep(900); await shot(students[0], d.student); }
      }
      await sleep(500);
      if (s.type === 'open') await mustClick(host, '[data-action="moderate"][data-mod="showAll"]', 'Alle freigeben');
      if (d.pie) await mustClick(host, '[data-action="t:set"][data-k="type"][data-v="pie"]', 'Kreisdiagramm');
      if (d.eval) await mustClick(host, '[data-action="eval"]', 'Auswertung zeigen');
      if (d.shot) { await sleep(1700); await shot(host, d.shot); }
    }
    await mustClick(host, '[data-action="exit"]', 'Beenden');
    await mustClick(host, '#ov [data-r="1"]', 'Beenden bestätigen');
    await waitFor(host, `document.querySelector('.lcard')`, 6000, 'zurück in der Bibliothek');
    await sleep(400);
  }
  finish(srv);
}
app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
