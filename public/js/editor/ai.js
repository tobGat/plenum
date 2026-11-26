// „Mit KI erstellen“ und „Mit KI überarbeiten“: Plenum schreibt einen Prompt für einen beliebigen KI-Chat,
// die Lehrkraft fügt die Antwort wieder ein. Plenum selbst sendet dabei nichts ins Internet.
// Material (Buchseiten, Arbeitsblätter, Fotos) hängt die Lehrkraft direkt im KI-Chat an – in Plenum gibt sie nur an,
// dass und welches Material dabei ist; der Prompt erklärt der KI, wie sie es nutzen soll.
import { html, toast, copyText } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { overlay, closeOv } from '../core/overlay.js';
import { TYPES, TYPE_LIST, GROUPS } from '/shared/types/index.js';
import { normalizeLesson } from '/shared/schema.js';
import { buildPrompt, buildRevisePrompt, templateJson, DEFAULT_TYPES, NO_FILES_REPLY, parseVideos } from '/shared/prompt.js';
import { videoInfo } from '/shared/types/content.js';

// ---------- Videos: Links, die die KI als Video-Folien einplanen soll ----------
const videoSection = (text) => html`<label class="fl span2"><span class="fl-l">Video-Links <small class="muted">– optional, ein Link pro Zeile (z. B. YouTube); dahinter kannst du eine Notiz schreiben</small></span>
  <textarea class="field" id="aiVideos" rows="2" maxlength="1500" placeholder="https://www.youtube.com/watch?v=…  – nur bis Minute 3">${text}</textarea>
  <small class="muted">Die KI plant jedes Video als eigene Folie ein und baut Aufgaben dazu. Nicht jeder KI-Chat kann Videos abrufen – dann bleiben die Aufträge allgemein und du passt sie an.</small></label>`;
const sameVideo = (a, b) => { const x = videoInfo(a), y = videoInfo(b); return x.kind === 'youtube' && y.kind === 'youtube' ? x.id === y.id : x.url.replace(/\/$/, '') === y.url.replace(/\/$/, ''); };
// Vorgegebene Videos, die in der Antwort fehlen
const missingVideos = (L, videos) => (L ? videos.filter((v) => !L.slides.some((s) => s.type === 'video' && sameVideo(s.url, v.url))) : []);
const videoMissHtml = (miss) => (miss.length ? html`<div class="hint">${ic('play')}<div><b>${miss.length === 1 ? 'Ein Video fehlt' : `${miss.length} Videos fehlen`} in der Antwort.</b> Du kannst die Folie im Editor selbst anlegen (Folientyp „Video“) oder im KI-Chat nachfordern.<ul class="replist">${miss.map((v) => html`<li>${v.url}</li>`)}</ul></div></div>` : '');

const KEY = 'plenum.ai';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* kein Speicher */ } };
const CHATS = 'z. B. ChatGPT, Microsoft Copilot, Gemini, Claude oder den KI-Chat deiner Schule';

function saveFile(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
// Klicks innerhalb eines Dialogs (eigenes Attribut, damit Bibliothek/Editor nicht mitreagieren)
function on(box, handlers) { box.addEventListener('click', (e) => { const b = e.target.closest('[data-ai]'); if (b && box.contains(b) && handlers[b.dataset.ai]) { e.preventDefault(); handlers[b.dataset.ai](b); } }); return box; }

// ---------- Material: nur Schalter und Beschreibung ----------
export const createMaterial = () => ({ on: false, desc: '', use: 'buch' });
const forPrompt = (M) => (M.on ? { desc: M.desc } : null);
function materialSection(M, { withUse = true } = {}) {
  return html`<div class="fl span2 matsec"><label class="fl fl-check"><input type="checkbox" id="matOn" ${M.on ? 'checked' : ''}><span class="sw"></span><span><b>Ich hänge im KI-Chat Material an</b> <span class="muted">– z. B. Fotos von Buchseiten, Arbeitsblätter, Tafelbilder</span></span></label>
    <div id="matMore" ${M.on ? '' : 'hidden'}>
      <input class="field" id="matDesc" maxlength="200" value="${M.desc}" placeholder="Was ist es? z. B. Buch S. 40–42, Ü2–Ü4 (optional)" aria-label="Beschreibung des Materials">
      ${withUse ? html`<div class="matuse">
        <label class="radio"><input type="radio" name="matUse" value="buch" ${M.use !== 'orient' ? 'checked' : ''}><span><b>Mit dem Material arbeiten</b><small>Aufgaben aus Buch oder Arbeitsblatt einbinden – mit eigener Folie „Zuerst im Buch …“ davor</small></span></label>
        <label class="radio"><input type="radio" name="matUse" value="orient" ${M.use === 'orient' ? 'checked' : ''}><span><b>Nur zur Orientierung</b><small>Thema, Begriffe und Niveau übernehmen, aber eigene Aufgaben ohne Buch</small></span></label></div>` : ''}
      <small class="muted">Die Dateien hängst du im nächsten Schritt direkt im KI-Chat an (Büroklammer, hineinziehen oder Strg+V). Bitte nur Material verwenden, das du an den KI-Dienst weitergeben darfst, und keine Fotos oder Namen von Schüler:innen.</small>
    </div></div>`;
}
function wireMaterial(box, M) {
  const more = box.querySelector('#matMore');
  box.querySelector('#matOn').addEventListener('change', (e) => { M.on = e.target.checked; more.hidden = !M.on; if (M.on) box.querySelector('#matDesc').focus(); });
  box.querySelector('#matDesc').addEventListener('input', (e) => { M.desc = e.target.value; });
  box.addEventListener('change', (e) => { if (e.target.name === 'matUse') M.use = e.target.value; });
}

// Schritt „(Material anhängen →) Prompt kopieren → im Chat einfügen → Antwort einfügen“
function promptStep({ title, prompt, answer = '', template, material = null, onBack, onParse }) {
  const box = overlay(html`<div class="ov-ic">${ic('sparkles')}</div><h2>${title}</h2>
    <ol class="aisteps">
      ${material ? html`<li><b>Material im KI-Chat anhängen</b><small class="muted">Öffne den KI-Chat und hänge dort zuerst deine Dateien an${material.desc ? html` (${material.desc})` : ''}: über die Büroklammer, durch Hineinziehen oder – bei Screenshots – mit Strg+V.</small></li>` : ''}
      <li><div class="ais-h"><b>Prompt kopieren</b><span class="ais-a"><button class="btn primary" data-ai="copy">${ic('copy')}Prompt kopieren</button>${template ? html`<button class="btn" data-ai="tpl" title="Für KI-Chats, denen man Dateien anhängen kann">${ic('download')}Vorlage speichern (.json)</button>` : ''}</span></div>
        <details class="aiprompt"><summary>Prompt ansehen (${prompt.length.toLocaleString('de-AT')} Zeichen)</summary><textarea class="field mono" rows="7" readonly>${prompt}</textarea></details></li>
      <li><b>${material ? 'Prompt im selben Chat einfügen und zusammen mit den Dateien absenden' : 'In einem KI-Chat einfügen und absenden'}</b><small class="muted">${CHATS}. Antwortet der Chat ohne JSON-Block, bitte ihn: „Bitte nur den JSON-Codeblock ausgeben.“</small></li>
      <li><b>Die komplette Antwort kopieren und hier einfügen</b><textarea class="field mono" rows="6" id="aiAnswer" placeholder="Antwort des KI-Chats hier einfügen …">${answer}</textarea></li>
    </ol>
    <div class="ov-actions"><button class="btn" data-ai="back">${ic('arrowl')}Zurück</button><button class="btn primary" data-ai="parse">${ic('search')}Antwort prüfen</button></div>`, { wide: true });
  const ta = box.querySelector('.aiprompt textarea');
  return on(box, {
    copy: async (b) => { const ok = await copyText(prompt, ta); toast(ok ? 'Prompt kopiert – jetzt im KI-Chat einfügen' : 'Kopieren nicht möglich – bitte im Feld markieren und kopieren', ok ? 'ok' : 'err'); if (ok) b.classList.add('done'); if (!ok) box.querySelector('.aiprompt').open = true; },
    tpl: () => { saveFile('plenum-vorlage.json', JSON.stringify(template, null, 2)); toast('Vorlage gespeichert – im KI-Chat anhängen und den Prompt dazu einfügen'); },
    back: () => onBack(box.querySelector('#aiAnswer').value),
    parse: async () => {
      const text = box.querySelector('#aiAnswer').value;
      if (!text.trim()) { toast('Bitte zuerst die Antwort des KI-Chats einfügen', 'err'); box.querySelector('#aiAnswer').focus(); return; }
      onParse(text);
    },
  });
}

const problemsHtml = (r) => html`${r.errors && r.errors.length ? html`<div class="warn">${ic('alert')}<div><b>Probleme</b><ul class="replist">${r.errors.map((x) => html`<li>${x}</li>`)}</ul></div></div>` : ''}
  ${r.truncated ? html`<div class="hint">${ic('info')}<span>Die Antwort war abgeschnitten – vollständige Folien wurden übernommen. Tipp: den KI-Chat um „weiter“ bitten und die ganze Antwort erneut einfügen, oder weniger Folien anfordern.</span></div>` : ''}
  ${r.repairs && r.repairs.length ? html`<details class="repairs"${r.repairs.length < 6 ? ' open' : ''}><summary>${r.repairs.length} automatische Anpassungen</summary><ul class="replist">${r.repairs.map((x) => html`<li>${x}</li>`)}</ul></details>` : ''}`;
// Antwort ohne Lektion: hat der Chat die Dateien nicht bekommen?
const unreadable = (answer) => (answer.includes(NO_FILES_REPLY.slice(0, -1))
  ? html`<p class="ov-sub">Der KI-Chat hat die Dateien nicht bekommen. Hänge sie im Chat an und schicke den Prompt noch einmal.</p>`
  : html`<p class="ov-sub">Prüfe, ob du die ganze Antwort kopiert hast. Oft hilft es, den KI-Chat zu bitten: „Bitte gib nur den vollständigen JSON-Codeblock aus.“</p>`);

// ---------- Neue Lektion ----------
export function showAiCreate({ api, onImported }) {
  const P = { topic: '', subject: '', grade: '', count: 12, countMode: 'exact', countMin: 8, countMax: 15, types: DEFAULT_TYPES, notes: '', ...loadPrefs() };
  const M = createMaterial();
  let answer = '', videoText = '', videos = [];

  function form() {
    const box = overlay(html`<div class="ov-ic">${ic('sparkles')}</div><h2>Mit KI erstellen</h2>
      <p class="ov-sub">Plenum schreibt einen Auftrag (Prompt) für einen KI-Chat deiner Wahl – auf Wunsch passend zu Buchseiten oder anderem Material. Die Antwort fügst du hier wieder ein und bekommst eine fertige Lektion zum Bearbeiten. Plenum selbst sendet dabei nichts ins Internet.</p>
      <div class="aiform">
        <label class="fl span2"><span class="fl-l">Thema<i class="req">*</i><small class="muted">– oder unten Material ankreuzen bzw. einen Video-Link eintragen</small></span><input class="field" id="aiTopic" maxlength="200" value="${P.topic}" placeholder="z. B. Photosynthese, Bruchrechnen, Kommasetzung, Wiener Kongress"></label>
        <label class="fl"><span class="fl-l">Fach</span><input class="field" id="aiSubject" maxlength="40" value="${P.subject}" placeholder="z. B. Biologie"></label>
        <label class="fl"><span class="fl-l">Schulstufe / Klasse</span><input class="field" id="aiGrade" maxlength="40" value="${P.grade}" placeholder="z. B. 7. Schulstufe"></label>
        <div class="fl span2"><span class="fl-l">Anzahl Folien</span><div class="aicount">
          <select class="field" id="aiCountMode" aria-label="Anzahl Folien festlegen">${[['exact', 'Genau'], ['range', 'Von – bis'], ['open', 'Offen lassen']].map(([v2, l]) => html`<option value="${v2}" ${P.countMode === v2 ? 'selected' : ''}>${l}</option>`)}</select>
          <span class="aic" data-m="exact"><input class="field" id="aiCount" type="number" min="3" max="40" value="${P.count}" aria-label="Anzahl Folien"><span>Folien</span></span>
          <span class="aic" data-m="range"><span>mindestens</span><input class="field" id="aiCountMin" type="number" min="3" max="40" value="${P.countMin}" aria-label="Mindestens"><span>höchstens</span><input class="field" id="aiCountMax" type="number" min="3" max="40" value="${P.countMax}" aria-label="Höchstens"><span>Folien</span></span>
          <span class="aic muted" data-m="open">Die KI wählt die Anzahl passend zum Thema (höchstens 40).</span>
        </div></div>
        ${materialSection(M)}
        ${videoSection(videoText)}
        <div class="fl span2"><span class="fl-l">Folientypen</span><div class="aitypes">${GROUPS.map((g) => html`<div class="aig"><small>${g}</small><div>${TYPE_LIST.filter((t) => t.group === g && t.type !== 'video').map((t) => html`<label class="chipcheck"><input type="checkbox" value="${t.type}" ${t.type === 'title' ? 'checked disabled' : P.types.includes(t.type) ? 'checked' : ''}><span>${ic(t.icon)}${t.label}</span></label>`)}</div></div>`)}</div></div>
        <label class="fl span2"><span class="fl-l">Wünsche (optional)</span><textarea class="field" id="aiNotes" rows="2" maxlength="600" placeholder="z. B. Bezug zu Österreich, eine Gruppenarbeit, sehr kurze Texte, zwei Quizrunden">${P.notes}</textarea></label>
      </div>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-ai="next">${ic('arrow')}Prompt erstellen</button></div>`, { wide: true });
    box.querySelector('#aiTopic').focus();
    const modeSel = box.querySelector('#aiCountMode'), showMode = () => box.querySelectorAll('.aic').forEach((x) => { x.hidden = x.dataset.m !== modeSel.value; });
    modeSel.addEventListener('change', showMode); showMode();
    wireMaterial(box, M);
    on(box, {
      next: () => {
        const v = (id) => box.querySelector(id).value.trim();
        P.topic = v('#aiTopic'); P.subject = v('#aiSubject'); P.grade = v('#aiGrade'); P.notes = v('#aiNotes');
        const num = (id, d) => Math.max(3, Math.min(40, parseInt(v(id), 10) || d));
        P.countMode = modeSel.value; P.count = num('#aiCount', 12);
        P.countMin = num('#aiCountMin', 8); P.countMax = num('#aiCountMax', 15);
        if (P.countMin > P.countMax) [P.countMin, P.countMax] = [P.countMax, P.countMin];
        P.types = ['title', ...[...box.querySelectorAll('.aitypes input:checked:not(:disabled)')].map((x) => x.value)];
        videoText = box.querySelector('#aiVideos').value; videos = parseVideos(videoText);
        if (videoText.trim() && !videos.length) { toast('Bei den Video-Links wurde keine Adresse erkannt – sie muss mit https:// beginnen', 'err'); box.querySelector('#aiVideos').focus(); return; }
        if (!P.topic && !M.on && !videos.length) { toast('Bitte ein Thema angeben, Material ankreuzen oder einen Video-Link eintragen', 'err'); box.querySelector('#aiTopic').focus(); return; }
        savePrefs(P);
        step2();
      },
    });
  }
  function step2() {
    const opts = { ...P, material: forPrompt(M), materialUse: M.use, videos };
    promptStep({ title: 'Prompt kopieren und Antwort einfügen', prompt: buildPrompt(opts), answer, template: templateJson(opts), material: forPrompt(M),
      onBack: (a) => { answer = a; form(); }, onParse: (a) => { answer = a; check(); } });
  }
  async function check() {
    let r;
    try { r = await api('/import/parse', { method: 'POST', body: { text: answer } }); } catch (e) { return toast(e.message, 'err'); }
    if (r.bundle) r = { errors: ['Das ist eine Sicherung mit mehreren Lektionen – bitte über „Importieren“ öffnen.'], repairs: [] };
    const L = r.lesson;
    const types = L ? [...new Set(L.slides.map((s) => s.type))] : [];
    const box = overlay(html`<div class="ov-ic">${ic(L ? 'check' : 'alert')}</div><h2>${L ? L.title : 'Die Antwort konnte nicht gelesen werden'}</h2>
      ${L ? html`<p class="ov-sub">${L.slides.length} Folien in ${L.sections.length} Abschnitten${L.subject ? ` · ${L.subject}` : ''}${L.grade ? ` · ${L.grade}` : ''}</p>
        <div class="aitypes result">${types.map((t) => html`<span class="chip">${ic(TYPES[t].icon)}${TYPES[t].label} × ${L.slides.filter((s) => s.type === t).length}</span>`)}</div>` : unreadable(answer)}
      ${problemsHtml(r)}
      ${videoMissHtml(missingVideos(L, videos))}
      ${L ? html`<p class="muted small">Zahlen, Fakten und Quellen aus KI-Antworten bitte vor dem Unterricht prüfen.</p>` : ''}
      <div class="ov-actions"><button class="btn" data-ai="back">${ic('arrowl')}Zurück</button>${L ? html`<button class="btn primary" data-ai="create">${ic('check')}Lektion anlegen und bearbeiten</button>` : ''}</div>`, { wide: true });
    on(box, {
      back: step2,
      create: async () => {
        try { const N = await api('/import/commit', { method: 'POST', body: { lesson: L, mode: 'new' } }); closeOv(); onImported(N); } catch (e) { toast(e.message, 'err'); }
      },
    });
  }
  form();
}

// ---------- Überarbeiten (mit Vergleich) ----------
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',')}}` : JSON.stringify(v));
const norm = (L) => normalizeLesson(L, { keepBroken: true, keepEmptySections: true }).lesson;

export function diffLessons(oldL, newL) {
  const A = norm(oldL), B = newL, oldBy = new Map(A.slides.map((s) => [s.id, s]));
  const added = [], changed = [], same = [];
  for (const s of B.slides) {
    const o = oldBy.get(s.id);
    if (!o) added.push(s); else if (stable(o) !== stable(s)) changed.push(s); else same.push(s);
  }
  const keep = new Set(B.slides.map((s) => s.id));
  const removed = A.slides.filter((s) => !keep.has(s.id));
  const orderA = A.slides.map((s) => s.id).filter((id) => keep.has(id)), orderB = B.slides.map((s) => s.id).filter((id) => oldBy.has(id));
  const meta = ['title', 'subject', 'grade', 'description'].filter((k) => (A[k] || '') !== (B[k] || '')).length > 0 || stable(A.sections) !== stable(B.sections);
  return { added, changed, removed, same, moved: orderA.join() !== orderB.join(), meta };
}

export function showAiRevise({ api, lessonId, lesson = null, onApply = null, onImported = null }) {
  let L0 = lesson, wish = '', answer = '', videoText = '', videos = [];
  const M = createMaterial();
  const SUGGEST = ['Sprache vereinfachen', 'Zwei Quizfragen mit Rangliste ergänzen', 'Mehr Live-Umfragen einbauen', 'Für eine jüngere Klasse anpassen', 'Rechtschreibung und Zeichensetzung prüfen', 'Einen Arbeitsauftrag für Gruppen ergänzen', 'Aufgaben zu angehängten Buchseiten ergänzen'];

  async function start() {
    if (!L0) { try { L0 = await api(`/lessons/${lessonId}`); } catch (e) { return toast(e.message, 'err'); } }
    const box = overlay(html`<div class="ov-ic">${ic('sparkles')}</div><h2>„${L0.title}“ mit KI überarbeiten</h2>
      <p class="ov-sub">Beschreibe, was sich ändern soll. Die KI bekommt die ganze Lektion und gibt eine überarbeitete Fassung zurück; vor dem Übernehmen siehst du einen Vergleich.</p>
      <textarea class="field" id="aiWish" rows="3" maxlength="800" placeholder="Was soll die KI ändern?">${wish}</textarea>
      <div class="aisuggest">${SUGGEST.map((t) => html`<button class="chip click" data-ai="sug">${t}</button>`)}</div>
      <div class="aiform one">${materialSection(M, { withUse: false })}${videoSection(videoText)}</div>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-ai="next">${ic('arrow')}Prompt erstellen</button></div>`, { wide: true });
    const ta = box.querySelector('#aiWish');
    ta.focus();
    wireMaterial(box, M);
    on(box, {
      sug: (b) => { ta.value = ta.value.trim() ? `${ta.value.trim()}\n${b.textContent}` : b.textContent; ta.focus(); },
      next: () => {
        wish = ta.value.trim(); videoText = box.querySelector('#aiVideos').value; videos = parseVideos(videoText);
        if (videoText.trim() && !videos.length) { toast('Bei den Video-Links wurde keine Adresse erkannt – sie muss mit https:// beginnen', 'err'); box.querySelector('#aiVideos').focus(); return; }
        step2();
      },
    });
  }
  function step2() {
    promptStep({ title: 'Prompt kopieren und Antwort einfügen', prompt: buildRevisePrompt({ lesson: L0, wish, material: forPrompt(M), videos }), answer, material: forPrompt(M),
      onBack: (a) => { answer = a; start(); }, onParse: (a) => { answer = a; check(); } });
  }
  async function check() {
    let r;
    try { r = await api('/import/parse', { method: 'POST', body: { text: answer, baseLessonId: L0.id } }); } catch (e) { return toast(e.message, 'err'); }
    const N = r.lesson && !r.bundle ? { ...r.lesson, id: L0.id, createdAt: L0.createdAt } : null;
    const d = N ? diffLessons(L0, N) : null;
    const row = (s, kind) => html`<li class="dr ${kind}"><span class="dk">${kind === 'add' ? 'neu' : kind === 'chg' ? 'geändert' : 'entfernt'}</span>${ic(TYPES[s.type] ? TYPES[s.type].icon : 'file')}<span>${s.title}</span></li>`;
    const box = overlay(html`<div class="ov-ic">${ic(N ? 'check' : 'alert')}</div><h2>${N ? 'Vergleich vor dem Übernehmen' : 'Die Antwort konnte nicht gelesen werden'}</h2>
      ${d ? html`<div class="dsum"><span class="chip add">${d.added.length} neu</span><span class="chip chg">${d.changed.length} geändert</span><span class="chip rem">${d.removed.length} entfernt</span><span class="chip">${d.same.length} unverändert</span>${d.moved ? html`<span class="chip">Reihenfolge geändert</span>` : ''}${d.meta ? html`<span class="chip">Titel/Abschnitte geändert</span>` : ''}</div>
        ${d.added.length + d.changed.length + d.removed.length ? html`<ul class="dlist">${d.added.map((s) => row(s, 'add'))}${d.changed.map((s) => row(s, 'chg'))}${d.removed.map((s) => row(s, 'rem'))}</ul>` : html`<p class="ov-sub">Keine Folie wurde verändert.</p>`}
        ${d.removed.length ? html`<p class="muted small">Gespeicherte Ergebnisse zu entfernten oder inhaltlich geänderten Folien passen danach eventuell nicht mehr.</p>` : ''}` : unreadable(answer)}
      ${problemsHtml(r)}
      ${videoMissHtml(missingVideos(N, videos))}
      <div class="ov-actions"><button class="btn" data-ai="back">${ic('arrowl')}Zurück</button>${N ? html`<button class="btn primary" data-ai="apply">${ic('check')}Übernehmen</button>` : ''}</div>`, { wide: true });
    on(box, {
      back: step2,
      apply: async () => {
        if (onApply) { closeOv(); onApply(N); return; }
        try { const res = await api(`/lessons/${L0.id}`, { method: 'PUT', body: N }); closeOv(); toast('Überarbeitung gespeichert'); if (onImported) onImported(res.lesson); } catch (e) { toast(e.message, 'err'); }
      },
    });
  }
  start();
}
