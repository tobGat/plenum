// UI-Test der KI-Abläufe (offscreen): Erstellen mit einer realistischen Chatbot-Antwort, danach Überarbeiten mit Vergleich.
// Aufruf: node main/launch.cjs test/ui/ai.mjs [Ausgabeordner]
import { app } from 'electron';
import { sleep, report, makeWin, js, waitFor, mustClick, shot, startTestServer, finish, OUT, clip } from './lib.mjs';

const ANSWER = `Gerne! Hier ist deine Unterrichtsstunde zur Photosynthese:

\`\`\`json
{
  "format": "plenum-lektion",
  "version": 1,
  "title": "Wie Pflanzen Energie gewinnen",
  "subject": "Biologie",
  "grade": "6. Schulstufe",
  "description": "Photosynthese verstehen – mit Live-Umfrage und Quiz.",
  "sections": [
    {"name": "Einstieg", "color": "emerald", "icon": "leaf"},
    {"name": "Wissen", "color": "teal", "icon": "book"},
    {"name": "Quiz", "color": "amber", "icon": "trophy"}
  ],
  "slides": [
    {"type": "title", "section": "Einstieg", "title": "Wie Pflanzen Energie gewinnen", "subtitle": "Die Photosynthese", "topics": [{"text": "Einstieg", "section": "Einstieg"}, {"text": "Wissen", "section": "Wissen"}, {"text": "Quiz", "section": "Quiz"}]},
    {"type": "wordcloud", "section": "Einstieg", "title": "Was brauchen Pflanzen?", "question": "Schreibe bis zu drei Dinge, die eine Pflanze zum Leben braucht.", "maxWords": 3},
    {"type": "info", "section": "Wissen", "title": "Die Formel der Photosynthese", "cards": [{"title": "Zutaten", "text": "Wasser\\nKohlendioxid\\nLicht"}, {"title": "Ergebnis", "text": "Traubenzucker\\nSauerstoff"}, {"title": "Merke", "text": "Ohne Licht keine Photosynthese – deshalb heißt sie „Licht-Synthese“."}]},
    {"type": "mc", "section": "Wissen", "title": "Wo passiert es?", "question": "In welchem Teil der Pflanzenzelle findet die Photosynthese statt?", "options": [{"text": "Zellkern", "correct": false}, {"text": "Chloroplast", "correct": true}, {"text": "Zellwand", "correct": false}], "explanation": "Die Chloroplasten enthalten den grünen Farbstoff Chlorophyll.",},
    {"type": "poll", "section": "Wissen", "title": "Zimmerpflanzen", "question": "Wie viele Zimmerpflanzen habt ihr zu Hause?", "options": ["keine", "1–3", "4–10", "mehr als 10"]},
    {"type": "quiz", "section": "Quiz", "title": "Quiz 1", "question": "Welches Gas geben Pflanzen bei der Photosynthese ab?", "options": [{"text": "Sauerstoff", "correct": true}, {"text": "Kohlendioxid", "correct": false}, {"text": "Stickstoff", "correct": false}], "time": 20},
    {"type": "leaderboard", "section": "Quiz", "title": "Rangliste", "top": 5}
  ]
}
\`\`\`

Viel Spaß im Unterricht!`;

const setVal = (win, sel, v) => js(win, `(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.value=${JSON.stringify(v)}; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
const check = (c, m) => { if (!c) report(m); };

async function main() {
  const { srv, base } = await startTestServer(3200);
  console.log(`KI-Test → ${OUT}`);
  const w = makeWin(1366, 768, 'host', 'KI');
  await w.loadURL(`${base}/host`);
  await waitFor(w, `document.querySelector('.lcard')`, 8000, 'Bibliothek');

  // Erstellen
  await mustClick(w, '[data-action="ai"]', 'Mit KI erstellen');
  await waitFor(w, `document.querySelector('#aiTopic')`, 3000, 'KI-Formular');
  await setVal(w, '#aiTopic', 'Photosynthese');
  await setVal(w, '#aiSubject', 'Biologie');
  await setVal(w, '#aiGrade', '6. Schulstufe');
  await setVal(w, '#aiCount', '7');
  await js(w, `document.querySelector('.aitypes input[value="sources"]').checked = false`);

  // Material: nur ankreuzen und beschreiben – die Dateien hängt man direkt im KI-Chat an
  check(await js(w, `document.getElementById('matMore').hidden`), 'Material-Felder sollten zunächst verborgen sein');
  await js(w, `(()=>{const c=document.getElementById('matOn'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await setVal(w, '#matDesc', 'Buch S. 40–42, Ü2–Ü4');
  await sleep(300); await shot(w, 'k01-formular');
  await mustClick(w, '[data-ai="next"]', 'Prompt erstellen');
  await waitFor(w, `document.querySelector('.aiprompt textarea')`, 3000, 'Prompt-Schritt');
  const prompt = await js(w, `document.querySelector('.aiprompt textarea').value`);
  check(/THEMA: Photosynthese/.test(prompt) && /genau 7 Folien/.test(prompt), 'Prompt enthält Thema/Umfang nicht');
  check(!/"sources" – /.test(prompt), 'Abgewählter Typ steht im Prompt');
  check(/Ich hänge dir in diesem Chat Material an[^\n]*Buch S\. 40–42, Ü2–Ü4/.test(prompt), 'Material fehlt im Prompt');
  check(/Zuerst im Buch/.test(prompt) && /"task" – Arbeitsauftrag/.test(prompt), 'Buch-Aufträge fehlen im Prompt');
  check((await js(w, `document.querySelector('.aisteps li').innerText`)).includes('Material im KI-Chat anhängen'), 'Schritt „Material anhängen“ fehlt');
  check((await js(w, `document.querySelectorAll('.aisteps > li').length`)) === 4, 'Es sollten vier Schritte sein');
  await sleep(200); await shot(w, 'k02-material');
  // Chat hat die Dateien nicht bekommen
  await setVal(w, '#aiAnswer', 'Bitte die Dateien anhängen.');
  await mustClick(w, '[data-ai="parse"]', 'Antwort ohne Lektion prüfen');
  await waitFor(w, `document.querySelector('#ov')?.innerText.includes('hat die Dateien nicht bekommen')`, 4000, 'Hinweis „Dateien nicht bekommen“');
  await mustClick(w, '[data-ai="back"]', 'Zurück zum Prompt');
  await waitFor(w, `document.querySelector('#aiAnswer')`, 3000, 'Prompt-Schritt erneut');

  await mustClick(w, '[data-ai="copy"]', 'Prompt kopieren');
  await waitFor(w, `document.querySelector('[data-ai="copy"].done')`, 2000, 'Kopieren bestätigt');
  check(clip.text === prompt, 'Kopierter Text ist nicht der Prompt');
  await setVal(w, '#aiAnswer', ANSWER);
  await sleep(300); await shot(w, 'k02-prompt');
  await mustClick(w, '[data-ai="parse"]', 'Antwort prüfen');
  await waitFor(w, `document.querySelector('#ov h2')?.textContent.includes('Wie Pflanzen Energie gewinnen')`, 4000, 'Ergebnis der Prüfung');
  const sub = await js(w, `document.querySelector('#ov .ov-sub')?.textContent || ''`);
  check(/7 Folien in 3 Abschnitten/.test(sub), `Ergebnis: ${sub}`);
  await sleep(300); await shot(w, 'k03-ergebnis');
  await mustClick(w, '[data-ai="create"]', 'Lektion anlegen');
  await waitFor(w, `document.querySelectorAll('.eslide').length === 7 && document.getElementById('etitle')?.textContent.includes('Pflanzen')`, 5000, 'Editor mit neuer Lektion');
  await sleep(800); await shot(w, 'k04-editor');

  // Überarbeiten im Editor
  await mustClick(w, '[data-action="aiRevise"]', 'Mit KI überarbeiten');
  await waitFor(w, `document.querySelector('#aiWish')`, 3000, 'Änderungswunsch');
  await mustClick(w, '[data-ai="sug"]', 'Vorschlag übernehmen');
  check((await js(w, `document.querySelector('#aiWish').value`)) === 'Sprache vereinfachen', 'Vorschlag nicht übernommen');
  await mustClick(w, '[data-ai="next"]', 'Prompt erstellen');
  await waitFor(w, `document.querySelector('#aiAnswer')`, 3000, 'Prompt-Schritt (Überarbeiten)');
  const rp = await js(w, `document.querySelector('.aiprompt textarea').value`);
  check(/ÄNDERUNGSWUNSCH: Sprache vereinfachen/.test(rp) && /AKTUELLE LEKTION/.test(rp), 'Überarbeitungs-Prompt unvollständig');
  const id = await js(w, `location.hash.split('/').pop()`);
  await js(w, `fetch('/api/host/lessons/${id}').then(r=>r.json()).then(L=>{ L.slides[2].title='Die Formel – einfach erklärt'; L.slides=L.slides.filter(s=>s.type!=='poll'); L.slides.push({type:'open',section:L.sections[1].id,title:'Deine Frage',question:'Was möchtest du noch wissen?'}); const t=document.getElementById('aiAnswer'); t.value='Hier ist die überarbeitete Fassung:\\n\`\`\`json\\n'+JSON.stringify(L,null,1)+'\\n\`\`\`'; return true; })`);
  await mustClick(w, '[data-ai="parse"]', 'Antwort prüfen (Überarbeiten)');
  await waitFor(w, `document.querySelector('.dsum')`, 4000, 'Vergleich');
  const dsum = await js(w, `document.querySelector('.dsum').innerText`);
  check(/1 neu/.test(dsum) && /1 geändert/.test(dsum) && /1 entfernt/.test(dsum) && /5 unverändert/.test(dsum), `Vergleich falsch: ${dsum.replace(/\n/g, ' ')}`);
  await sleep(300); await shot(w, 'k05-vergleich');
  await mustClick(w, '[data-ai="apply"]', 'Übernehmen');
  await waitFor(w, `[...document.querySelectorAll('.eslide .et')].some(e=>e.textContent==='Deine Frage') && ![...document.querySelectorAll('.eslide .et')].some(e=>e.textContent==='Zimmerpflanzen')`, 3000, 'Editor zeigt Überarbeitung');
  await waitFor(w, `document.getElementById('savestate')?.innerText.includes('Gespeichert')`, 5000, 'Überarbeitung gespeichert');
  const L = await js(w, `fetch('/api/host/lessons/${id}').then(r=>r.json())`);
  check(L.slides.length === 7 && L.slides.some((s) => s.type === 'open') && L.slides[2].title === 'Die Formel – einfach erklärt', 'Gespeicherte Überarbeitung stimmt nicht');
  await mustClick(w, '[data-action="undo"]', 'Rückgängig nach Überarbeitung');
  await waitFor(w, `[...document.querySelectorAll('.eslide .et')].some(e=>e.textContent==='Zimmerpflanzen')`, 3000, 'Rückgängig stellt Fassung vor der KI her');
  await sleep(300); await shot(w, 'k06-nach-rueckgaengig');
  finish(srv);
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(2); }));
