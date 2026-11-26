// Lektions-Editor: Folienliste (Ziehen oder Pfeile), Formular aus den Feld-Definitionen der Typen,
// Live-Vorschau (Beamer/Handy, optional mit Beispielantworten), automatisches Speichern, Rückgängig/Wiederholen.
// Der lokale Stand ist maßgeblich; der Server normalisiert beim Speichern, ohne das Formular zu überschreiben.
import { html, raw, delegate, toast } from '../core/dom.js';
import { ic, logo } from '../core/icons.js';
import { overlay, closeOv, ask } from '../core/overlay.js';
import { colorOf, gfxHtml, iconGfx } from '../core/parts.js';
import { TYPES, TYPE_LIST, GROUPS } from '/shared/types/index.js';
import { LESSON_FIELDS, MAX_SLIDES, THEMES, GRAPHIC_POS, GRAPHIC_SIZES, MEDIA_MAX_CHARS, checkSlide, newSlide } from '/shared/schema.js';
import { LIBRARY, libSvg } from '/shared/graphics.js';
import { COLORS, COLOR_NAMES, ICON_NAMES } from '/shared/palette.js';
import { CHART_TYPES } from '/shared/fields.js';
import { newId, toNum, clone, hash } from '/shared/util.js';

const CHART_LABEL = { bar: ['Säulen', 'bars'], hbar: ['Balken', 'hbars'], pie: ['Kreis', 'pie'], line: ['Linie', 'line'] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const numStr = (v) => (Number.isFinite(v) ? String(v).replace('.', ',') : '');
// Kurzbeschreibungen für Lehrkräfte (die ausführliche desc der Typen ist für den KI-Prompt formuliert)
const SHORT = {
  title: 'Großer Einstieg mit Untertitel und Themen-Kacheln, die zu den Abschnitten springen.',
  info: 'Erklärung in bis zu sechs Karten, optional mit Diagramm. Zeilen werden zu Aufzählungspunkten; Karten namens „Merke“ werden hervorgehoben.',
  lab: 'Säulendiagramm mit Reglern (y-Achse, Zeitraum, Alarmfarbe): zeigt, wie Darstellungen täuschen können.',
  summary: 'Überblick in Kacheln zum Abschluss.',
  sources: 'Liste der verwendeten Quellen mit Links.',
  mc: 'Eine richtige Antwort; die Klasse bekommt sofort Rückmeldung, vorne gibt es eine Auswertung.',
  truefalse: 'Aussagen als richtig oder falsch beurteilen – auch mit eigenen Knopf-Beschriftungen.',
  sort: 'Begriffe in 2–4 Kategorien einordnen; die App mischt sie für die Klasse.',
  gap: 'Lückentext mit [[Lösung]] oder [[Lösung|Alternative]]; die Lücken werden vorne aufgedeckt.',
  task: 'Auftrag fürs Heft oder Buch; die Klasse meldet „Ich bin fertig“.',
  poll: 'Abstimmung als Live-Diagramm – mit Vergleichswerten oder als Split-Experiment (zwei Fassungen der Frage).',
  scale: 'Aussagen auf einer Skala bewerten; vorne Mittelwert und Verteilung.',
  wordcloud: 'Begriffe der Klasse als animierte Wortwolke.',
  open: 'Freitext-Antworten als Karten, standardmäßig erst nach Freigabe sichtbar.',
  quiz: 'Quizfrage auf Zeit: schnelle richtige Antworten bringen mehr Punkte.',
  leaderboard: 'Punktestand aller bisherigen Quizfragen.',
};
const shortOf = (t) => SHORT[t.type] || String(t.desc || '').split(/(?<=[.!?])\s(?=[A-ZÄÖÜ])/)[0];
const stripPrefix = (t) => String(t).replace(/^[^:]{1,40}:\s*/, '');

// Pfade wie „options.2.text“
const keys = (p) => String(p).split('.').filter((x) => x !== '').map((k) => (/^\d+$/.test(k) ? +k : k));
const getAt = (obj, p) => keys(p).reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setAt(obj, p, v) {
  const ks = keys(p);
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = typeof ks[i + 1] === 'number' ? [] : {}; o = o[ks[i]]; }
  if (v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v;
}

// leere Werte für neue Listeneinträge
function blank(f) {
  if (f.kind === 'objlist') return Object.fromEntries(f.fields.map((x) => [x.key, blankValue(x)]));
  if (f.kind === 'choices') return { text: '', correct: false };
  return '';
}
function blankValue(f) {
  if (f.kind === 'bool') return !!f.default;
  if (f.kind === 'int') return f.default ?? f.min ?? 0;
  if (f.kind === 'select') return f.default ?? f.options[0].value;
  if (f.kind === 'strlist' || f.kind === 'objlist' || f.kind === 'choices') return Array.from({ length: f.min || 0 }, () => blank(f));
  return f.default ?? '';
}
const newChart = () => ({ type: 'bar', title: '', labels: ['A', 'B', 'C'], series: [{ name: 'Werte', values: [3, 5, 2] }], unit: '', source: '' });

export function createEditor({ root, api, socket, info, lessonId, onClose, onPresent }) {
  let L = null, sel = 'lesson', mode = 'host', demoOn = false;
  let dirty = false, saving = false, again = false, saveTimer = null, saveErr = '';
  let presenting = info.presenting === lessonId;
  const undoStack = [], redoStack = [];
  let mediaRev = 0, sentMediaRev = -1;
  let snapKey = '', snapAt = 0, checks = {}, checkTimer = null, pvTimer = null, pvReady = false, dragId = null, alive = true;
  const FDEF = new Map();

  root.innerHTML = String(html`<div id="app" class="editor">
    <header class="libhead edhead">
      <button class="hbtn" data-action="back" title="Zur Bibliothek">${ic('arrowl')}<span>Bibliothek</span></button>
      <div class="brand">${raw(logo())}<span class="chap" id="etitle"></span></div>
      <span class="savestate" id="savestate" role="status"></span>
      <div class="hspace"></div>
      <button class="hbtn" data-action="undo" id="bundo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig">${ic('undo')}</button>
      <button class="hbtn flipx" data-action="redo" id="bredo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen">${ic('undo')}</button>
      <button class="hbtn" data-action="aiRevise" title="Lektion von einer KI überarbeiten lassen">${ic('sparkles')}<span>Mit KI überarbeiten</span></button>
      <button class="hbtn" data-action="pdf" title="Folien als PDF exportieren – nur die Fragen, mit Lösungen oder mit Ergebnissen">${ic('file')}<span>PDF</span></button>
      <button class="hbtn hprimary" data-action="present">${ic('play')}<span>Präsentieren</span></button>
    </header>
    <div id="edbanner"></div>
    <div class="edgrid">
      <aside class="edlist" id="edlist" aria-label="Folien"></aside>
      <section class="edstage" aria-label="Vorschau">
        <div class="pvbar"><label class="pvtheme">${ic('star')}<span>Design</span><select class="field" id="pvTheme" aria-label="Design der Präsentation">${THEMES.map((x) => html`<option value="${x.value}">${x.label}</option>`)}</select></label><div class="segctl"><button data-action="pvMode" data-v="host" class="on">${ic('monitor')}Beamer</button><button data-action="pvMode" data-v="student">${ic('phone')}Handy</button></div>
          <button class="tgl" data-action="pvDemo" id="pvdemo" title="Auswertungen mit erfundenen Beispielantworten zeigen"><i></i>Beispielantworten</button></div>
        <div class="pvwrap" id="pvwrap"><div class="pvbox" id="pvbox"><iframe id="pv" src="/preview" title="Vorschau der Folie"></iframe></div></div>
      </section>
      <section class="edform" id="edform" aria-label="Folie bearbeiten"></section>
    </div></div>`);
  const $ = (id) => document.getElementById(id);
  const list = $('edlist'), form = $('edform'), pv = $('pv');
  $('pvTheme').addEventListener('change', (e) => setTheme(e.target.value));

  const cur = () => (sel === 'lesson' ? null : L.slides.find((s) => s.id === sel) || null);
  const formRoot = () => (sel === 'lesson' ? L : cur());
  const idx = (id) => L.slides.findIndex((s) => s.id === id);
  const secOf = (s) => L.sections.find((x) => x.id === s.section) || L.sections[0];

  // ---------- Speichern ----------
  function setSave() {
    const el = $('savestate');
    if (!el) return;
    el.className = 'savestate' + (saveErr ? ' err' : '');
    el.innerHTML = String(saveErr ? html`${ic('alert')}Nicht gespeichert – ${saveErr}` : dirty || saving ? html`<span class="dotspin"></span>Speichert …` : html`${ic('check')}Gespeichert`);
  }
  async function save() {
    if (!L) return;
    if (saving) { again = true; return; }
    clearTimeout(saveTimer);
    saving = true; dirty = false; setSave();
    try {
      const r = await api(`/lessons/${L.id}`, { method: 'PUT', body: L });
      saveErr = '';
      if (r.presenting !== presenting) { presenting = r.presenting; banner(); }
    } catch (e) { dirty = true; saveErr = e.message || 'Fehler'; clearTimeout(saveTimer); saveTimer = setTimeout(save, 4000); }
    saving = false;
    if (again) { again = false; return save(); }
    setSave();
  }
  async function flush() {
    clearTimeout(saveTimer);
    for (let i = 0; i < 100 && saving; i++) await sleep(50);
    if (dirty) await save();
  }

  // ---------- Rückgängig ----------
  const snapText = () => JSON.stringify({ L: { ...L, media: undefined }, sel });
  function snap(key = '') {
    const now = Date.now();
    if (key && key === snapKey && now - snapAt < 1500) { snapAt = now; return; }
    undoStack.push(snapText());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0; snapKey = key; snapAt = now;
    undoButtons();
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(snapText());
    const st = JSON.parse(from.pop());
    const media = L.media;
    L = st.L; if (media) L.media = media; sel = st.sel === 'lesson' || L.slides.some((s) => s.id === st.sel) ? st.sel : L.slides[0].id;
    snapKey = '';
    renderAll();
    changed(true);
  }
  function undoButtons() { const u = $('bundo'), r = $('bredo'); if (u) u.disabled = !undoStack.length; if (r) r.disabled = !redoStack.length; }

  // ---------- Änderungen ----------
  function changed(structural = false) {
    dirty = true; setSave();
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 800);
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => { runChecks(); renderList(); renderIssues(); }, structural ? 0 : 350);
    preview(structural ? 0 : 120);
    $('etitle').textContent = L.title;
  }
  function runChecks() {
    checks = {};
    for (const s of L.slides) {
      try { const r = checkSlide(s); if (r.errors.length || r.repairs.length) checks[s.id] = r; } catch (e) { checks[s.id] = { errors: [String(e.message || e)], repairs: [] }; }
    }
  }

  // ---------- Vorschau ----------
  function preview(delay = 0) {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      if (!pvReady || !L || !pv.contentWindow) return;
      const sid = sel === 'lesson' ? L.slides[0].id : sel;
      const joinUrl = (info.urls && info.urls[0] && info.urls[0].url) || 'http://192.168.0.10:3080';
      const msg = { type: 'render', lesson: { ...L, media: undefined }, slideId: sid, mode, demo: demoOn, joinUrl, mediaRev };
      if (sentMediaRev !== mediaRev) { msg.media = L.media || {}; sentMediaRev = mediaRev; }
      pv.contentWindow.postMessage(msg, location.origin);
    }, delay);
  }
  function layoutPreview() {
    const wrap = $('pvwrap'), box = $('pvbox');
    if (!wrap) return;
    const W = mode === 'host' ? 1280 : 390, H = mode === 'host' ? 720 : 780;
    const k = Math.min((wrap.clientWidth - 8) / W, (wrap.clientHeight - 8) / H, 1);
    pv.style.width = W + 'px'; pv.style.height = H + 'px'; pv.style.transform = `scale(${k})`;
    box.style.width = Math.round(W * k) + 'px'; box.style.height = Math.round(H * k) + 'px';
    box.classList.toggle('phone', mode === 'student');
  }
  const onMsg = (e) => { if (e.source === pv.contentWindow && e.data && e.data.type === 'preview-ready') { pvReady = true; sentMediaRev = -1; preview(); } };
  window.addEventListener('message', onMsg);
  const ro = new ResizeObserver(layoutPreview);
  ro.observe($('pvwrap'));

  // ---------- Folienliste ----------
  function renderList() {
    if (!L) return;
    let last = null;
    const rows = [];
    L.slides.forEach((s, i) => {
      const sec = secOf(s);
      if (sec.id !== last) {
        last = sec.id;
        rows.push(html`<div class="esec click" data-action="selLesson" title="Abschnitt bearbeiten" data-sec="${sec.id}" style="--sc:${colorOf(sec.color).c}"><i></i><span>${sec.name}</span></div>`);
      }
      const def = TYPES[s.type], on = s.id === sel, ck = checks[s.id];
      rows.push(html`<div class="eslide${on ? ' on' : ''}" draggable="true" data-action="sel" data-id="${s.id}" role="button" tabindex="0" aria-current="${on ? 'true' : 'false'}" style="--sc:${colorOf(sec.color).c}">
        <span class="en">${i + 1}</span><span class="eic" title="${def.label}">${ic(def.icon)}</span><span class="et">${s.title || def.label}</span>
        ${ck && ck.errors.length ? html`<span class="ewarn" title="${ck.errors.map(stripPrefix).join(' · ')}">${ic('alert')}</span>` : ''}
        ${on ? html`<span class="emove"><button class="ib" data-action="up" title="Nach oben" aria-label="Folie nach oben" ${i === 0 && L.sections.indexOf(sec) === 0 ? 'disabled' : ''}>${ic('up')}</button><button class="ib" data-action="down" title="Nach unten" aria-label="Folie nach unten" ${i === L.slides.length - 1 ? 'disabled' : ''}>${ic('down')}</button></span>` : ''}</div>`);
    });
    // leere Abschnitte als Ablageziel
    L.sections.filter((x) => !L.slides.some((s) => s.section === x.id)).forEach((sec) => rows.push(html`<div class="esec empty click" data-action="selLesson" title="Abschnitt bearbeiten" data-sec="${sec.id}" style="--sc:${colorOf(sec.color).c}"><i></i><span>${sec.name}</span><small>leer</small></div>`));
    list.innerHTML = String(html`<button class="eitem${sel === 'lesson' ? ' on' : ''}" data-action="selLesson">${ic('book')}<span><b>Lektion &amp; Abschnitte</b><small>${L.slides.length} Folien · ${L.sections.length} Abschnitte</small></span></button>
      <div class="eslides">${rows}</div>
      <div class="edadd"><button class="btn primary addslide" data-action="add" ${L.slides.length >= MAX_SLIDES ? 'disabled' : ''}>${ic('plus')}Folie hinzufügen</button>
      <button class="btn addslide addsec" data-action="secNew" title="Abschnitte gliedern die Lektion und erscheinen als Reiter in der Präsentation">${ic('plus')}Abschnitt hinzufügen</button></div>`);
    const on = list.querySelector('.eslide.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function select(id) {
    if (id === sel) return;
    sel = id; snapKey = '';
    renderList(); renderForm(true); preview();
  }

  function moveToSection(s, secId) {
    if (s.section === secId) return;
    L.slides.splice(idx(s.id), 1);
    s.section = secId;
    let at = -1;
    L.slides.forEach((x, i) => { if (x.section === secId) at = i + 1; });
    if (at < 0) { // leerer Abschnitt: vor dem ersten Folienblock eines späteren Abschnitts einordnen
      const order = L.sections.map((x) => x.id), mine = order.indexOf(secId);
      at = L.slides.findIndex((x) => order.indexOf(x.section) > mine);
      if (at < 0) at = L.slides.length;
    }
    L.slides.splice(at, 0, s);
  }
  function step(dir) {
    const s = cur(); if (!s) return;
    const i = idx(s.id), nb = L.slides[i + dir];
    if (!nb) return;
    snap();
    if (nb.section !== s.section) s.section = nb.section; // zuerst die Abschnittsgrenze überqueren
    else { L.slides[i] = nb; L.slides[i + dir] = s; }
    renderList(); renderForm(); changed(true);
    const b = list.querySelector(`.eslide.on [data-action="${dir < 0 ? 'up' : 'down'}"]`);
    if (b && !b.disabled) b.focus();
  }

  // Ziehen und Ablegen
  function clearDrop() { list.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into')); }
  function dropTarget(e) {
    const row = e.target.closest('.eslide'), head = e.target.closest('.esec');
    if (row && row.dataset.id !== dragId) { const r = row.getBoundingClientRect(); return { row, after: e.clientY > r.top + r.height / 2 }; }
    if (head) return { head };
    return null;
  }
  const onDragStart = (e) => { const row = e.target.closest('.eslide'); if (!row) return; dragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); row.classList.add('dragging'); };
  const onDragOver = (e) => {
    if (!dragId) return;
    const t = dropTarget(e); if (!t) return;
    e.preventDefault(); clearDrop();
    if (t.row) t.row.classList.add(t.after ? 'drop-after' : 'drop-before'); else t.head.classList.add('drop-into');
  };
  const onDrop = (e) => {
    if (!dragId) return;
    e.preventDefault();
    const t = dropTarget(e), s = L.slides.find((x) => x.id === dragId);
    clearDrop();
    if (!t || !s) return;
    snap();
    if (t.row) {
      const target = L.slides.find((x) => x.id === t.row.dataset.id);
      L.slides.splice(idx(s.id), 1);
      L.slides.splice(idx(target.id) + (t.after ? 1 : 0), 0, s);
      s.section = target.section;
    } else {
      const secId = t.head.dataset.sec;
      L.slides.splice(idx(s.id), 1);
      s.section = '';
      const first = L.slides.findIndex((x) => x.section === secId);
      if (first >= 0) { L.slides.splice(first, 0, s); s.section = secId; } else { L.slides.push(s); moveToSection(s, secId); }
    }
    dragId = null;
    sel = s.id;
    renderList(); renderForm(); changed(true);
  };
  const onDragEnd = () => { dragId = null; clearDrop(); list.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging')); };
  list.addEventListener('dragstart', onDragStart);
  list.addEventListener('dragover', onDragOver);
  list.addEventListener('drop', onDrop);
  list.addEventListener('dragend', onDragEnd);
  list.addEventListener('keydown', (e) => { const row = e.target.closest('.eslide'); if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); select(row.dataset.id); } });

  // ---------- Formular ----------
  const counter = (f, v) => (f.max ? html`<small class="cnt">${String(v ?? '').length}/${f.max}</small>` : '');
  function fieldHtml(f, v, path) {
    FDEF.set(path, f);
    const lab = html`<span class="fl-l">${f.label}${f.required ? html`<i class="req" title="Pflichtfeld">*</i>` : ''}</span>`;
    switch (f.kind) {
      case 'text': return html`<label class="fl">${lab}<span class="fin"><input class="field" data-f="${path}" data-k="text" value="${v ?? ''}" maxlength="${f.max || 500}">${counter(f, v)}</span></label>`;
      case 'textarea': return html`<label class="fl">${lab}<span class="fin"><textarea class="field" data-f="${path}" data-k="textarea" rows="2" maxlength="${f.max || 2000}">${v ?? ''}</textarea>${counter(f, v)}</span></label>`;
      case 'int': return html`<label class="fl fl-inline">${lab}<input class="field num" type="number" data-f="${path}" data-k="int" value="${v ?? f.default ?? ''}" min="${f.min ?? ''}" max="${f.max ?? ''}"></label>`;
      case 'bool': return html`<label class="fl fl-check"><input type="checkbox" data-f="${path}" data-k="bool" ${v ? 'checked' : ''}><span class="sw"></span><span>${f.label}</span></label>`;
      case 'select':
        if (f.key === 'icon') return html`<div class="fl fl-inline"><span class="fl-l">${f.label}</span><button type="button" class="iconpick" data-action="pickIcon" data-f="${path}" title="Symbol wählen">${ic(v || f.default || 'star')}</button></div>`;
        return html`<label class="fl">${lab}<select class="field" data-f="${path}" data-k="select">${f.options.map((o) => html`<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${o.label}</option>`)}</select></label>`;
      case 'strlist': return listField(f, v || [], path, (x, p, i) => html`<input class="field" data-f="${p}" data-k="text" value="${x}" maxlength="${f.itemMax || 200}" aria-label="${f.label} ${i + 1}">`);
      case 'choices': return listField(f, v || [], path, (x, p, i) => html`<label class="corr" title="Als richtige Antwort markieren"><input type="radio" name="r-${path}" data-f="${path}" data-k="correct" data-i="${i}" ${x.correct ? 'checked' : ''} aria-label="Antwort ${i + 1} ist richtig"><span>${ic('check')}</span></label><input class="field" data-f="${p}.text" data-k="text" value="${x.text}" maxlength="${f.itemMax || 140}" placeholder="Antwort ${i + 1}">`);
      case 'objlist': return listField(f, v || [], path, (x, p) => html`<div class="objfields">${f.fields.map((sf) => fieldHtml(sf, x[sf.key], `${p}.${sf.key}`))}</div>`, true);
      case 'chart': return chartField(f, v, path);
      case 'numlist': return html`<label class="fl">${lab}<input class="field" data-f="${path}" data-k="numlist" value="${(v || []).map(numStr).join('; ')}" placeholder="z. B. 82; 76; 65"><small class="muted">Mit Strichpunkt trennen – je Antwort ein Wert, in derselben Reihenfolge.</small></label>`;
      default: return '';
    }
  }
  function listField(f, arr, path, item, block = false) {
    const n = arr.length, max = f.max || 99, addLabel = f.kind === 'choices' ? 'Antwort hinzufügen' : 'Hinzufügen';
    return html`<div class="fl flist"><span class="fl-l">${f.label}<small class="muted">${n}${f.max ? ` / ${f.max}` : ''}${f.kind === 'choices' ? ' · Haken = richtig' : ''}</small></span>
      ${arr.map((x, i) => html`<div class="litem${block ? ' block' : ''}">${item(x, `${path}.${i}`, i)}<span class="lbtns">
        <button type="button" class="ib" data-action="f:up" data-f="${path}" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Nach oben" aria-label="Nach oben">${ic('up')}</button>
        <button type="button" class="ib" data-action="f:down" data-f="${path}" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} title="Nach unten" aria-label="Nach unten">${ic('down')}</button>
        <button type="button" class="ib del" data-action="f:del" data-f="${path}" data-i="${i}" ${n <= (f.min || 0) ? 'disabled' : ''} title="Entfernen" aria-label="Entfernen">${ic('x')}</button></span></div>`)}
      ${n < max ? html`<button type="button" class="btn small addrow" data-action="f:add" data-f="${path}">${ic('plus')}${addLabel}</button>` : ''}</div>`;
  }
  function chartField(f, c, path) {
    FDEF.set(path, f);
    const s = cur(), labOnly = s && s.type === 'lab';
    if (!c) return html`<div class="fl"><span class="fl-l">${f.label}</span><button type="button" class="btn small" data-action="c:add" data-f="${path}">${ic('bars')}Diagramm hinzufügen</button></div>`;
    const types = labOnly ? ['bar'] : CHART_TYPES, single = labOnly || c.type === 'pie' || c.type === 'line';
    const series = single ? c.series.slice(0, 1) : c.series;
    return html`<div class="fl chartedit"><span class="fl-l">${f.label}${f.optional ? html`<button type="button" class="linkbtn" data-action="c:remove" data-f="${path}">${ic('trash')}entfernen</button>` : ''}</span>
      ${types.length > 1 ? html`<div class="segctl">${types.map((t) => html`<button type="button" class="${c.type === t ? 'on' : ''}" data-action="c:type" data-f="${path}" data-v="${t}">${ic(CHART_LABEL[t][1])}${CHART_LABEL[t][0]}</button>`)}</div>` : ''}
      <input class="field" data-f="${path}.title" data-k="text" maxlength="140" value="${c.title || ''}" placeholder="Diagrammtitel" aria-label="Diagrammtitel">
      <div class="ctabwrap"><table class="ctab"><thead><tr><th>Beschriftung</th>
        ${series.map((x, j) => html`<th><span class="cth"><input class="field" data-f="${path}.series.${j}.name" data-k="text" maxlength="40" value="${x.name}" aria-label="Name der Reihe ${j + 1}">${series.length > 1 ? html`<button type="button" class="ib del" data-action="c:delSeries" data-f="${path}" data-i="${j}" title="Reihe entfernen" aria-label="Reihe entfernen">${ic('x')}</button>` : ''}</span></th>`)}
        ${!single && c.series.length < 3 ? html`<th class="cadd"><button type="button" class="ib" data-action="c:addSeries" data-f="${path}" title="Datenreihe hinzufügen" aria-label="Datenreihe hinzufügen">${ic('plus')}</button></th>` : ''}<th></th></tr></thead>
        <tbody>${c.labels.map((l, i) => html`<tr><td><input class="field" data-f="${path}.labels.${i}" data-k="text" maxlength="40" value="${l}" aria-label="Beschriftung ${i + 1}"></td>
          ${series.map((x, j) => html`<td><input class="field num" inputmode="decimal" data-f="${path}.series.${j}.values.${i}" data-k="num" value="${numStr(x.values[i])}" aria-label="${x.name}: ${l}"></td>`)}
          ${!single && c.series.length < 3 ? html`<td></td>` : ''}<td><button type="button" class="ib del" data-action="c:delRow" data-f="${path}" data-i="${i}" ${c.labels.length <= 1 ? 'disabled' : ''} title="Zeile entfernen" aria-label="Zeile entfernen">${ic('x')}</button></td></tr>`)}</tbody></table></div>
      ${c.labels.length < 12 ? html`<button type="button" class="btn small addrow" data-action="c:addRow" data-f="${path}">${ic('plus')}Zeile hinzufügen</button>` : ''}
      <div class="frow2"><input class="field" data-f="${path}.unit" data-k="text" maxlength="8" value="${c.unit || ''}" placeholder="Einheit, z. B. %" aria-label="Einheit"><input class="field" data-f="${path}.source" data-k="text" maxlength="300" value="${c.source || ''}" placeholder="Quelle des Diagramms" aria-label="Quelle des Diagramms"></div></div>`;
  }

  function issuesHtml(id) {
    const ck = checks[id];
    if (!ck) return '';
    return html`${ck.errors.length ? html`<div class="warn fissue">${ic('alert')}<div><b>Bitte ergänzen:</b><ul>${ck.errors.map((t) => html`<li>${stripPrefix(t).replace(/ – Folie übersprungen$/, '')}</li>`)}</ul></div></div>` : ''}
      ${ck.repairs.length ? html`<div class="hint fissue">${ic('info')}<div><ul>${ck.repairs.map((t) => html`<li>${stripPrefix(t)}</li>`)}</ul></div></div>` : ''}`;
  }
  function renderIssues() { const box = $('fissues'); if (box && sel !== 'lesson') box.innerHTML = String(issuesHtml(sel)); }

  function slideForm(s) {
    const def = TYPES[s.type], sec = secOf(s);
    return html`<div class="fhead" style="--tc:${colorOf(sec.color).c}"><span class="ftype">${ic(def.icon)}${def.label}</span><span class="hspace"></span>
        <button type="button" class="btn icon" data-action="dupSlide" title="Folie duplizieren" aria-label="Folie duplizieren">${ic('copy')}</button>
        <button type="button" class="btn icon danger" data-action="delSlide" title="Folie löschen" aria-label="Folie löschen" ${L.slides.length <= 1 ? 'disabled' : ''}>${ic('trash')}</button></div>
      <p class="fdesc">${shortOf(def)}</p>
      <div id="fissues">${issuesHtml(s.id)}</div>
      <label class="fl"><span class="fl-l">Abschnitt</span><select class="field" data-change="section">${L.sections.map((x) => html`<option value="${x.id}" ${x.id === s.section ? 'selected' : ''}>${x.name}</option>`)}</select></label>
      ${def.fields.map((f) => fieldHtml(f, s[f.key], f.key))}
      ${graphicSection(s)}`;
  }
  function lessonForm() {
    return html`<div class="fhead"><span class="ftype">${ic('book')}Lektion</span></div>
      ${LESSON_FIELDS.filter((f) => f.key !== 'theme').map((f) => fieldHtml(f, L[f.key], f.key))}
      <div class="fl"><span class="fl-l">Design der Präsentation<small class="muted">gilt für Beamer und Geräte der Klasse</small></span><div class="thgrid">${THEMES.map((x) => html`<button type="button" class="thcard${(L.theme || 'standard') === x.value ? ' on' : ''}" data-action="setTheme" data-v="${x.value}"><span class="thmini th-${x.value}"><i></i><u></u><s></s></span><b>${x.label}</b><span class="muted">${x.desc}</span></button>`)}</div></div>
      <div class="fl"><span class="fl-l">Abschnitte</span><p class="muted small">Abschnitte gliedern die Lektion und erscheinen als Reiter in der Präsentation. Folien ordnest du im Formular der Folie oder durch Ziehen in der Liste zu.</p>
        ${L.sections.map((x, i) => {
          const n = L.slides.filter((s) => s.section === x.id).length;
          return html`<div class="secedit" style="--sc:${colorOf(x.color).c}"><div class="secrow">
            <button type="button" class="iconpick" data-action="pickIcon" data-f="sections.${i}.icon" title="Symbol wählen" aria-label="Symbol wählen">${ic(x.icon)}</button>
            <input class="field" data-f="sections.${i}.name" data-k="text" maxlength="40" value="${x.name}" aria-label="Name des Abschnitts">
            <span class="lbtns"><button type="button" class="ib" data-action="secMove" data-i="${i}" data-v="-1" ${i === 0 ? 'disabled' : ''} title="Abschnitt nach oben" aria-label="Abschnitt nach oben">${ic('up')}</button>
            <button type="button" class="ib" data-action="secMove" data-i="${i}" data-v="1" ${i === L.sections.length - 1 ? 'disabled' : ''} title="Abschnitt nach unten" aria-label="Abschnitt nach unten">${ic('down')}</button>
            <button type="button" class="ib del" data-action="secDel" data-i="${i}" ${L.sections.length <= 1 ? 'disabled' : ''} title="Abschnitt löschen" aria-label="Abschnitt löschen">${ic('trash')}</button></span></div>
            <div class="swatches">${COLOR_NAMES.map((c) => html`<button type="button" class="swt${x.color === c ? ' on' : ''}" style="--sw:${COLORS[c].c}" data-action="secColor" data-i="${i}" data-v="${c}" title="${COLORS[c].name}" aria-label="Farbe ${COLORS[c].name}"></button>`)}<small class="muted">${n} ${n === 1 ? 'Folie' : 'Folien'}</small></div></div>`;
        })}
        <button type="button" class="btn small addrow" data-action="secAdd">${ic('plus')}Abschnitt hinzufügen</button></div>`;
  }
  function grow(el) { el.style.height = 'auto'; el.style.height = Math.min(320, el.scrollHeight + 2) + 'px'; }
  function renderForm(top = false) {
    const st = form.scrollTop;
    FDEF.clear();
    const s = cur();
    form.innerHTML = String(sel === 'lesson' || !s ? lessonForm() : slideForm(s));
    form.querySelectorAll('textarea').forEach(grow);
    form.scrollTop = top ? 0 : st;
  }
  function renderAll() { $('etitle').textContent = L.title; $('pvTheme').value = L.theme || 'standard'; renderList(); renderForm(); undoButtons(); setSave(); banner(); preview(); }

  function banner() {
    const b = $('edbanner');
    if (!b) return;
    b.innerHTML = presenting ? String(html`<div class="edbanner">${ic('play')}<span>Diese Lektion wird gerade präsentiert. Änderungen werden gespeichert und erscheinen in der Präsentation, sobald du sie übernimmst. Antworten zu geänderten Folien werden dabei verworfen.</span><button class="btn" data-action="apply">${ic('refresh')}Änderungen übernehmen</button></div>`) : '';
  }

  // Eingaben ohne Neuzeichnen (Fokus bleibt erhalten)
  const onInput = (e) => {
    const el = e.target, k = el.dataset && el.dataset.k, path = el.dataset && el.dataset.f;
    if (!k || !path || k === 'bool' || k === 'correct') return;
    const obj = formRoot(); if (!obj) return;
    let v = el.value;
    if (k === 'int') { const n = parseInt(v, 10); if (!Number.isFinite(n)) return; v = n; }
    else if (k === 'num') { const n = toNum(v); v = Number.isFinite(n) ? n : 0; }
    else if (k === 'numlist') v = v.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean).map(toNum).filter(Number.isFinite);
    snap(`${sel}:${path}`);
    setAt(obj, path, v);
    const cnt = el.parentElement && el.parentElement.querySelector('.cnt');
    if (cnt) { const f = FDEF.get(path); cnt.textContent = `${el.value.length}/${f ? f.max : el.maxLength}`; }
    if (el.tagName === 'TEXTAREA') grow(el);
    changed();
  };
  const onChange = (e) => {
    const el = e.target, obj = formRoot(); if (!obj) return;
    if (el.dataset.change === 'section') { const s = cur(); snap(); moveToSection(s, el.value); renderList(); renderForm(); changed(true); return; }
    const k = el.dataset.k, path = el.dataset.f;
    if (k === 'bool') { snap(); setAt(obj, path, el.checked); changed(); }
    else if (k === 'correct') { snap(); (getAt(obj, path) || []).forEach((o, i) => { o.correct = i === +el.dataset.i; }); changed(); }
  };
  form.addEventListener('input', onInput);
  form.addEventListener('change', onChange);

  // Struktur-Änderungen im Formular (Listen, Diagramm) → Formular neu zeichnen
  function structural(fn, focusSel) {
    const obj = formRoot(); if (!obj) return;
    snap();
    fn(obj);
    renderForm(); changed(true);
    if (focusSel) { const el = form.querySelector(focusSel); if (el) el.focus(); }
  }
  const listOp = (el, fn) => { const path = el.dataset.f, i = +el.dataset.i; structural((o) => { const a = getAt(o, path) || []; fn(a, i, path); setAt(o, path, a); }); };
  const chartOp = (el, fn) => structural((o) => { const c = getAt(o, el.dataset.f); if (c) fn(c, +el.dataset.i, el.dataset.v); });

  function pickIcon(path) {
    const curIcon = getAt(formRoot(), path);
    const box = overlay(html`<h2>Symbol wählen</h2><div class="icongrid">${ICON_NAMES.map((n) => html`<button type="button" class="iconopt${n === curIcon ? ' on' : ''}" data-icon="${n}" title="${n}" aria-label="${n}">${ic(n)}</button>`)}</div><div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button></div>`);
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-icon]'); if (!b) return; closeOv(); structural((o) => setAt(o, path, b.dataset.icon)); });
  }

  function addSlide(type) {
    if (L.slides.length >= MAX_SLIDES) return toast(`Höchstens ${MAX_SLIDES} Folien`, 'err');
    // Ohne gewählte Folie: in den letzten Abschnitt, wenn er noch leer ist (z. B. gerade neu angelegt)
    const lastSec = L.sections[L.sections.length - 1], lastEmpty = !L.slides.some((x) => x.section === lastSec.id);
    const s0 = cur(), secId = s0 ? s0.section : lastEmpty ? lastSec.id : L.slides.length ? L.slides[L.slides.length - 1].section : L.sections[0].id;
    snap();
    const s = newSlide(type, secId);
    const at = s0 ? idx(s0.id) + 1 : L.slides.length;
    L.slides.splice(at, 0, s);
    sel = s.id;
    renderList(); renderForm(true); changed(true);
    const first = form.querySelector('input.field, textarea.field');
    if (first) first.select();
  }
  function typePicker() {
    overlay(html`<h2>Folie hinzufügen</h2><p class="ov-sub">Die neue Folie kommt nach der ausgewählten und enthält ein Beispiel, das du überschreibst.</p>
      <div class="typegrid">${GROUPS.map((g) => html`<div class="tgroup"><h4>${g}</h4><div class="tg-items">${TYPE_LIST.filter((t) => t.group === g).map((t) => html`<button class="tcard" data-action="addType" data-type="${t.type}">${ic(t.icon)}<span><b>${t.label}</b><small>${shortOf(t)}</small></span></button>`)}</div></div>`)}</div>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button></div>`, { wide: true });
  }

  // ---------- Design ----------
  function setTheme(v) {
    if (!THEMES.some((x) => x.value === v) || (L.theme || 'standard') === v) return;
    snap(); L.theme = v;
    const ts = $('pvTheme'); if (ts) ts.value = v;
    if (sel === 'lesson') renderForm();
    changed(true);
  }

  // ---------- Grafik je Folie ----------
  const mediaUrl = (id) => { const m = L.media && L.media[id]; return m ? `data:${m.mime};base64,${m.data}` : ''; };
  function graphicSection(s) {
    const g = s.graphic, isTitle = s.type === 'title';
    return html`<div class="fl gsec"><span class="fl-l">Grafik<small class="muted">${isTitle ? 'ersetzt das Titelbild' : 'optional – Illustration, Symbol oder eigenes Bild'}</small></span>
      ${g ? html`<div class="gcur"><button type="button" class="gthumb" data-action="g:pick" title="Grafik ändern">${gfxHtml({ ...g, pos: 'right', caption: '' }, mediaUrl)}</button><div class="gctl">
        ${isTitle ? '' : html`<div class="segctl gpos">${GRAPHIC_POS.map((p) => html`<button type="button" class="${g.pos === p.value ? 'on' : ''}" data-action="g:pos" data-v="${p.value}">${p.label}</button>`)}</div>
        <div class="segctl gsize">${GRAPHIC_SIZES.map((p) => html`<button type="button" class="${g.size === p.value ? 'on' : ''}" data-action="g:size" data-v="${p.value}">${p.label}</button>`)}</div>`}
        <input class="field" data-f="graphic.caption" data-k="text" maxlength="140" value="${g.caption || ''}" placeholder="Bildunterschrift oder Quelle (optional)" aria-label="Bildunterschrift">
        <span class="gbtns"><button type="button" class="btn small" data-action="g:pick">${ic('refresh')}Ändern</button><button type="button" class="linkbtn" data-action="g:remove">${ic('trash')}entfernen</button></span></div></div>`
      : html`<button type="button" class="btn small addrow" data-action="g:pick">${ic('plus')}Grafik hinzufügen</button>`}</div>`;
  }
  function setGraphic(src) {
    structural((o) => { const old = o.graphic || {}; o.graphic = { src, pos: old.pos || 'right', size: old.size || 'm' }; if (old.caption) o.graphic.caption = old.caption; });
  }
  // eigenes Bild: verkleinern (max. 1920 px) und als WebP in die Lektion einbetten
  async function addImage(file) {
    if (!/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(file.type)) { toast('Bitte ein Bild (PNG, JPG, GIF, WebP)', 'err'); return null; }
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let data = '', w = 0, h = 0;
    for (const [max, q] of [[1920, 0.86], [1600, 0.8], [1280, 0.74], [1024, 0.7]]) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = w = Math.max(1, Math.round(img.width * k)); c.height = h = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      data = c.toDataURL('image/webp', q).split(',')[1];
      if (data.length <= MEDIA_MAX_CHARS) break;
    }
    if (data.length > MEDIA_MAX_CHARS) { toast('Das Bild ist zu groß', 'err'); return null; }
    const id = `m${hash(data)}${data.length.toString(36)}`;
    L.media = L.media || {};
    L.media[id] = { mime: 'image/webp', data, w, h, name: String(file.name || 'Bild').slice(0, 120) };
    mediaRev++;
    return id;
  }
  function pickGraphic() {
    const s0 = cur(), curSrc = s0 && s0.graphic ? s0.graphic.src : '';
    const groups = [...new Set(LIBRARY.map((g) => g.group))];
    const libPane = () => html`<div class="gpgrid">${groups.map((gr) => html`<h4>${gr}</h4>${LIBRARY.filter((g) => g.group === gr).map((g) => html`<button type="button" class="gopt${curSrc === 'lib:' + g.name ? ' on' : ''}" data-gsel="lib:${g.name}" title="${g.label}">${raw(libSvg(g.name))}<small>${g.label}</small></button>`)}`)}</div>`;
    const iconPane = () => html`<div class="gpgrid icons">${ICON_NAMES.map((n) => html`<button type="button" class="gopt${curSrc === 'icon:' + n ? ' on' : ''}" data-gsel="icon:${n}" title="${n}">${raw(iconGfx(n))}</button>`)}</div>`;
    const ownPane = () => html`<div class="gown"><button type="button" class="matdrop" data-gpick="1">${ic('upload')}<span><b>Bild auswählen</b><small>Klicken, hierher ziehen oder mit Strg+V einfügen (PNG, JPG, GIF, WebP). Es wird verkleinert in die Lektion eingebettet.</small></span></button>
      ${L.media && Object.keys(L.media).length ? html`<h4>Schon in dieser Lektion</h4><div class="gpgrid photos">${Object.entries(L.media).map(([id, m]) => html`<button type="button" class="gopt${curSrc === 'media:' + id ? ' on' : ''}" data-gsel="media:${id}" title="${m.name}"><img src="${mediaUrl(id)}" alt=""></button>`)}</div>` : ''}
      <p class="muted small">Bitte nur Bilder verwenden, die du zeigen darfst (eigene Fotos, freie Lizenzen) – und die Quelle unter „Bildunterschrift“ angeben.</p></div>`;
    const box = overlay(html`<h2>Grafik wählen</h2><div class="segctl gtabs"><button type="button" class="on" data-gtab="lib">${ic('spark')}Illustrationen</button><button type="button" data-gtab="icon">${ic('star')}Symbole</button><button type="button" data-gtab="own">${ic('upload')}Eigenes Bild</button></div>
      <input type="file" id="gFile" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden><div class="gpane" id="gpane">${libPane()}</div>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button></div>`, { wide: true });
    const pane = box.querySelector('#gpane'), file = box.querySelector('#gFile');
    const show = (k) => { box.querySelectorAll('[data-gtab]').forEach((b) => b.classList.toggle('on', b.dataset.gtab === k)); pane.innerHTML = String(k === 'icon' ? iconPane() : k === 'own' ? ownPane() : libPane()); };
    const useFile = async (f) => { if (!f) return; const id = await addImage(f).catch(() => null); if (id) { closeOv(); setGraphic('media:' + id); toast('Bild eingefügt'); } };
    box.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-gtab]'); if (tab) { show(tab.dataset.gtab); return; }
      if (e.target.closest('[data-gpick]')) { file.click(); return; }
      const o = e.target.closest('[data-gsel]'); if (o) { closeOv(); setGraphic(o.dataset.gsel); }
    });
    file.addEventListener('change', () => useFile(file.files && file.files[0]));
    box.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); if (!pane.querySelector('.gown')) show('own'); } });
    box.addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); useFile(e.dataTransfer.files[0]); });
    const onPaste = (e) => { if (!document.body.contains(box)) { document.removeEventListener('paste', onPaste); return; } const f = [...((e.clipboardData && e.clipboardData.files) || [])][0]; if (f) { e.preventDefault(); useFile(f); } };
    document.addEventListener('paste', onPaste);
  }

  const actions = {
    close: () => closeOv(),
    back: async () => {
      await flush();
      if (dirty && saveErr && !(await ask('Nicht gespeichert', `Die letzten Änderungen konnten nicht gespeichert werden (${saveErr}). Trotzdem schließen?`, { ok: 'Schließen', danger: true }))) return;
      onClose();
    },
    present: async () => { await flush(); onPresent(L.id); },
    pdf: async () => { await flush(); const { showPdfExport } = await import('./pdf.js'); showPdfExport({ api, lessonId: L.id, title: L.title, live: presenting }); },
    undo: () => restore(undoStack, redoStack),
    redo: () => restore(redoStack, undoStack),
    apply: async () => {
      await flush();
      socket.emit('host:applyLesson', L.id, (r) => toast(r && r.ok ? 'Änderungen in die Präsentation übernommen' : 'Übernehmen nicht möglich', r && r.ok ? 'ok' : 'err'));
    },
    aiRevise: async () => {
      await flush();
      const { showAiRevise } = await import('./ai.js');
      showAiRevise({ api, lessonId: L.id, lesson: clone(L), onApply: (nl) => { snap(); L = nl; if (sel !== 'lesson' && !L.slides.some((s) => s.id === sel)) sel = L.slides[0].id; renderAll(); changed(true); toast('Überarbeitung übernommen – mit „Rückgängig“ lässt sie sich zurücknehmen.'); } });
    },
    pvMode: (el) => { mode = el.dataset.v; root.querySelectorAll('[data-action="pvMode"]').forEach((b) => b.classList.toggle('on', b.dataset.v === mode)); layoutPreview(); preview(); },
    pvDemo: () => { demoOn = !demoOn; $('pvdemo').classList.toggle('on', demoOn); preview(); },
    setTheme: (el) => setTheme(el.dataset.v),
    'g:pick': () => pickGraphic(),
    'g:remove': () => structural((o) => { delete o.graphic; }),
    'g:pos': (el) => structural((o) => { if (o.graphic) o.graphic.pos = el.dataset.v; }),
    'g:size': (el) => structural((o) => { if (o.graphic) o.graphic.size = el.dataset.v; }),
    selLesson: () => select('lesson'),
    sel: (el, e) => { if (e.target.closest('.emove')) return; select(el.dataset.id); },
    up: () => step(-1),
    down: () => step(1),
    add: () => typePicker(),
    addType: (el) => { closeOv(); addSlide(el.dataset.type); },
    dupSlide: () => {
      const s = cur(); if (!s || L.slides.length >= MAX_SLIDES) return;
      snap();
      const c = clone(s); c.id = newId('s');
      L.slides.splice(idx(s.id) + 1, 0, c);
      sel = c.id; renderList(); renderForm(true); changed(true);
      toast('Folie dupliziert');
    },
    delSlide: () => {
      const s = cur(); if (!s || L.slides.length <= 1) return;
      snap();
      const i = idx(s.id);
      L.slides.splice(i, 1);
      sel = L.slides[Math.min(i, L.slides.length - 1)].id;
      renderList(); renderForm(true); changed(true);
      toast('Folie gelöscht – „Rückgängig“ holt sie zurück.');
    },
    'f:add': (el) => {
      const path = el.dataset.f, f = FDEF.get(path);
      let n = 0;
      structural((o) => { const a = getAt(o, path) || []; a.push(blank(f)); setAt(o, path, a); n = a.length - 1; });
      const t = form.querySelector(`input.field[data-f^="${path}.${n}"], textarea.field[data-f^="${path}.${n}"]`);
      if (t) t.focus();
    },
    'f:del': (el) => listOp(el, (a, i) => a.splice(i, 1)),
    'f:up': (el) => listOp(el, (a, i) => { if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; }),
    'f:down': (el) => listOp(el, (a, i) => { if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; }),
    'c:add': (el) => structural((o) => setAt(o, el.dataset.f, newChart())),
    'c:remove': (el) => structural((o) => setAt(o, el.dataset.f, undefined)),
    'c:type': (el) => chartOp(el, (c, i, v) => { c.type = v; }),
    'c:addRow': (el) => chartOp(el, (c) => { c.labels.push(''); c.series.forEach((x) => x.values.push(0)); }),
    'c:delRow': (el) => chartOp(el, (c, i) => { c.labels.splice(i, 1); c.series.forEach((x) => x.values.splice(i, 1)); }),
    'c:addSeries': (el) => chartOp(el, (c) => { c.series.push({ name: `Reihe ${c.series.length + 1}`, values: c.labels.map(() => 0) }); }),
    'c:delSeries': (el) => chartOp(el, (c, i) => { c.series.splice(i, 1); }),
    pickIcon: (el) => pickIcon(el.dataset.f),
    secColor: (el) => structural((o) => { o.sections[+el.dataset.i].color = el.dataset.v; }),
    secAdd: () => structural((o) => {
      const used = new Set(o.sections.map((x) => x.color));
      o.sections.push({ id: newId('S'), name: 'Neuer Abschnitt', color: COLOR_NAMES.find((c) => !used.has(c)) || 'slate', icon: 'star' });
    }, '.secedit:last-of-type input.field'),
    // Knopf in der Folienliste: Abschnitt anlegen und gleich benennen
    secNew: () => { if (sel !== 'lesson') select('lesson'); actions.secAdd(); const inp = [...form.querySelectorAll('.secedit input.field')].pop(); if (inp) { inp.scrollIntoView({ block: 'center' }); inp.select(); } toast('Abschnitt angelegt – gib ihm einen Namen. Neue Folien kommen jetzt in diesen Abschnitt.'); },
    secMove: (el) => structural((o) => {
      const i = +el.dataset.i, j = i + +el.dataset.v;
      if (j < 0 || j >= o.sections.length) return;
      [o.sections[i], o.sections[j]] = [o.sections[j], o.sections[i]];
      const order = o.sections.map((x) => x.id);
      o.slides = order.flatMap((id) => o.slides.filter((s) => s.section === id)).concat(o.slides.filter((s) => !order.includes(s.section)));
    }),
    secDel: async (el) => {
      const i = +el.dataset.i, sec = L.sections[i], n = L.slides.filter((s) => s.section === sec.id).length;
      if (L.sections.length <= 1) return;
      const target = L.sections[i - 1] || L.sections[i + 1];
      if (n && !(await ask('Abschnitt löschen?', `${n} ${n === 1 ? 'Folie wird' : 'Folien werden'} in den Abschnitt „${target.name}“ verschoben.`, { ok: 'Löschen', danger: true }))) return;
      structural((o) => { o.slides.forEach((s) => { if (s.section === sec.id) s.section = target.id; }); o.sections.splice(i, 1); const order = o.sections.map((x) => x.id); o.slides = order.flatMap((id) => o.slides.filter((s) => s.section === id)); });
      renderList();
    },
  };
  const undel = [delegate(document.body, 'click', actions)];

  const onKey = (e) => {
    if (document.querySelector('#ov .ovbox')) return;
    const k = e.key.toLowerCase(), typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); flush(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && k === 'z' && !e.shiftKey) { e.preventDefault(); actions.undo(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); actions.redo(); }
  };
  document.addEventListener('keydown', onKey);
  // Fenster wird geschlossen: letzte Änderungen noch losschicken
  const onUnload = () => { if (dirty && L) try { fetch(`/api/host/lessons/${L.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(L), keepalive: true }); } catch { /* zu groß für keepalive */ } };
  window.addEventListener('beforeunload', onUnload);

  // ---------- Laden ----------
  (async () => {
    try { L = await api(`/lessons/${lessonId}`); } catch (e) { toast(e.message || 'Lektion nicht gefunden', 'err'); onClose(); return; }
    if (!alive) return;
    sel = L.slides[0] ? L.slides[0].id : 'lesson';
    runChecks();
    renderAll();
    layoutPreview();
  })();

  return {
    destroy() {
      alive = false;
      if (dirty) save();
      clearTimeout(checkTimer); clearTimeout(pvTimer);
      undel.forEach((f) => f());
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMsg);
      window.removeEventListener('beforeunload', onUnload);
      ro.disconnect();
    },
  };
}
