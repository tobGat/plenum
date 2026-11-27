// Serien-Editor: Themenkarten auf einer Matrix anordnen und mit Pfeilen verbinden.
// Karten kommen per Ziehen (oder Antippen und Zelle wählen) aus der Seitenleiste; gezogen wird mit Pointer-Events,
// damit es mit Maus, Stift und Finger gleich funktioniert.
import { html, raw, delegate, toast, whenStr } from '../core/dom.js';
import { ic, logo } from '../core/icons.js';
import { overlay, closeOv, ovOpen } from '../core/overlay.js';
import { download } from '../core/api.js';
import { colorOf } from '../core/parts.js';
import { COLORS, COLOR_NAMES, ICON_NAMES } from '/shared/palette.js';
import { MAX_COL, MAX_ROW, MAX_CARDS } from '/shared/series.js';
import { newId } from '/shared/util.js';
import { norm, de, byGrade, SORTS, sortLessons, distinct } from './libutil.js';
import { G, cellX, cellY, cardHtml, cardLook, linksSvg, linkPath, sizeOf } from './seriesmap.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZOOMS = [0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5];

// plan = true: PDF – die Themen als Tabelle (A4 quer); sonst die Matrix als Bild (PNG)
export async function exportSeriesImage({ id, title, plan = false }) {
  if (!window.plenumApp || !window.plenumApp.exportPdf) { toast('Der Export ist nur in der Plenum-App verfügbar.', 'err'); return; }
  toast(plan ? 'PDF wird erstellt …' : 'Bild wird erstellt …');
  let r;
  try { r = await window.plenumApp.exportPdf(plan ? { series: id, plan: true, name: `${title} – Planung` } : { series: id, name: title }); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r || r.canceled) return;
  if (!r.ok) { toast(r.error || 'Der Export hat nicht geklappt.', 'err'); return; }
  overlay(html`<div class="ov-ic">${ic('check')}</div><h2>Gespeichert</h2><p class="ov-sub">${r.path}</p><div class="ov-actions"><button class="btn" data-x="close">Schließen</button><button class="btn primary" data-x="open">${ic('file')}Öffnen</button></div>`)
    .addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === 'open') window.plenumApp.openPdf(); closeOv(); });
}

export async function createSeriesEditor({ root, api, seriesId, onClose, onPresent, onEdit }) {
  let S, lessons = [], byId = {};
  try { [S, lessons] = await Promise.all([api(`/series/${seriesId}`), api('/lessons')]); } catch (e) { toast(e.message, 'err'); onClose(); return { destroy() {} }; }
  byId = Object.fromEntries(lessons.map((l) => [l.id, l]));
  let sel = null; // { card: id } | { link: index }
  let armed = null; // aus der Seitenleiste gewählt, wartet auf eine Zelle: { lesson: id } | { free: true }
  let connectFrom = null; // „Verbinden“ gewählt: nächste angetippte Karte wird das Ziel
  let fillFor = null; // „Lektion einsetzen“ gewählt: nächste angetippte Lektion der Seitenleiste füllt diesen Platzhalter
  let zoom = 1, drag = null, alive = true;
  const side = { q: '', subject: '', grade: '', sort: 'updated', unused: false };
  try { Object.assign(side, JSON.parse(localStorage.getItem('plenum.series.side') || '{}'), { q: '' }); zoom = ZOOMS.includes(+localStorage.getItem('plenum.series.zoom')) ? +localStorage.getItem('plenum.series.zoom') : 1; } catch { /* Standard */ }
  const saveSide = () => { try { localStorage.setItem('plenum.series.side', JSON.stringify({ ...side, q: '' })); localStorage.setItem('plenum.series.zoom', String(zoom)); } catch { /* egal */ } };

  let dirty = false, saving = false, again = false, saveTimer = null, saveErr = '';
  const undoStack = [], redoStack = [];
  let snapKey = '', snapAt = 0;
  const undel = [];

  root.innerHTML = String(html`<div id="app" class="editor series">
    <header class="libhead edhead">
      <button class="hbtn" data-action="back" title="Zurück zur Übersicht">${ic('arrowl')}<span>Übersicht</span></button>
      <div class="brand">${raw(logo())}</div>
      <input class="stitle" id="stitle" maxlength="90" aria-label="Titel der Themenserie" placeholder="Titel der Themenserie">
      <input class="smeta" id="ssubject" maxlength="40" aria-label="Fach" placeholder="Fach"><input class="smeta" id="sgrade" maxlength="40" aria-label="Schulstufe" placeholder="Schulstufe">
      <span class="savestate" id="savestate" role="status"></span>
      <div class="hspace"></div>
      <button class="hbtn" data-action="undo" id="bundo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig">${ic('undo')}</button>
      <button class="hbtn flipx" data-action="redo" id="bredo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen">${ic('undo')}</button>
      <span class="szoom"><button class="hbtn" data-action="zoomOut" title="Verkleinern" aria-label="Verkleinern">−</button><button class="hbtn" data-action="zoomFit" id="szoom" title="Alles zeigen"></button><button class="hbtn" data-action="zoomIn" title="Vergrößern" aria-label="Vergrößern">+</button></span>
      <button class="hbtn" data-action="plan" title="Als PDF exportieren: die Themen als Tabelle – mit Inhalten, Umfang und Platz für Datum und Notizen">${ic('file')}<span>PDF</span></button>
      <button class="hbtn" data-action="image" title="Die Matrix so, wie sie hier aussieht, als Bild (PNG) speichern">${ic('monitor')}<span>Bild</span></button>
      <button class="hbtn" data-action="export" title="Serie samt allen Lektionen als Datei weitergeben">${ic('download')}<span>Exportieren</span></button>
    </header>
    <div class="sergrid">
      <aside class="serside" id="serside" aria-label="Themenkarten"></aside>
      <section class="sermap" id="sermap" aria-label="Matrix der Themenserie"><div class="shint" id="shint" role="status"></div><div class="sbar" id="sdock" data-bar="1" hidden></div><div class="sscroll" id="sscroll"><div class="sgrid" id="sgrid"></div></div></section>
    </div></div>`);
  const $ = (id) => document.getElementById(id);
  const sideEl = $('serside'), grid = $('sgrid'), scroll = $('sscroll');
  $('stitle').value = S.title; $('ssubject').value = S.subject; $('sgrade').value = S.grade;

  // ---------- Speichern ----------
  function setSave() {
    const el = $('savestate');
    if (!el) return;
    el.className = 'savestate' + (saveErr ? ' err' : '');
    el.innerHTML = String(saveErr ? html`${ic('alert')}Nicht gespeichert – ${saveErr}` : dirty || saving ? html`<span class="dotspin"></span>Speichert …` : html`${ic('check')}Gespeichert`);
  }
  async function save() {
    if (saving) { again = true; return; }
    clearTimeout(saveTimer);
    saving = true; dirty = false; setSave();
    try { const r = await api(`/series/${S.id}`, { method: 'PUT', body: S }); S.updatedAt = r.updatedAt; saveErr = ''; }
    catch (e) { dirty = true; saveErr = e.message || 'Fehler'; clearTimeout(saveTimer); if (alive) saveTimer = setTimeout(save, 4000); }
    saving = false;
    if (again) { again = false; return save(); }
    setSave();
  }
  async function flush() { clearTimeout(saveTimer); for (let i = 0; i < 100 && saving; i++) await sleep(50); if (dirty) await save(); }
  function changed() { dirty = true; setSave(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); }

  // ---------- Rückgängig ----------
  const snapText = () => JSON.stringify({ title: S.title, subject: S.subject, grade: S.grade, cards: S.cards, links: S.links });
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
    Object.assign(S, JSON.parse(from.pop()));
    sel = null; connectFrom = null; snapKey = '';
    $('stitle').value = S.title; $('ssubject').value = S.subject; $('sgrade').value = S.grade;
    renderAll(); changed();
  }
  function undoButtons() { $('bundo').disabled = !undoStack.length; $('bredo').disabled = !redoStack.length; }

  // ---------- Seitenleiste ----------
  const usedLessons = () => new Set(S.cards.map((c) => c.lesson).filter(Boolean));
  function sideList() {
    const used = usedLessons(), ws = norm(side.q).split(/\s+/).filter(Boolean);
    const list = lessons.filter((l) => (!side.subject || (l.subject || '').trim() === side.subject) && (!side.grade || (l.grade || '').trim() === side.grade) && (!side.unused || !used.has(l.id))
      && ws.every((w) => norm([l.title, l.subject, l.grade, l.desc].join(' ')).includes(w)));
    return { list: sortLessons(list, side.sort), used };
  }
  function listHtml() {
    const { list, used } = sideList();
    if (!lessons.length) return html`<p class="muted small sempty">Noch keine Lektionen. Freie Karten lassen sich trotzdem anlegen.</p>`;
    if (!list.length) return html`<p class="muted small sempty">Keine Lektion passt zu Suche und Filter.</p>`;
    return html`${list.map((l) => { const c = colorOf((l.card && l.card.color) || 'indigo'), u = used.has(l.id); return html`<button type="button" class="sitem${u ? ' used' : ''}${armed && armed.lesson === l.id ? ' armed' : ''}" data-item="${l.id}" ${u ? raw('aria-disabled="true"') : ''} style="--lc:${c.c};--lcs:${c.s}" title="${u ? 'Schon in dieser Serie' : 'Auf die Matrix ziehen – oder antippen und dann eine Zelle wählen'}">
      <span class="si-grip">${ic('grip')}</span><span class="si-b"><span class="si-m">${[l.subject, l.grade].filter(Boolean).join(' · ') || 'Lektion'}</span><span class="si-t">${l.title}</span><span class="si-i">${u ? html`${ic('check')}in der Serie` : `${l.slides} ${l.slides === 1 ? 'Folie' : 'Folien'} · ${whenStr(l.updatedAt)}`}</span></span></button>`; })}`;
  }
  function renderSide() {
    const subjects = distinct(lessons, 'subject', de), grades = distinct(lessons, 'grade', byGrade);
    if (side.subject && !subjects.includes(side.subject)) side.subject = '';
    if (side.grade && !grades.includes(side.grade)) side.grade = '';
    const sl = (id, label, cur, all, opts) => html`<label class="libsel"><span>${label}</span><select class="field" data-change="${id}" aria-label="${label}">${all ? html`<option value="">${all}</option>` : ''}${opts.map(([v, l]) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`)}</select></label>`;
    sideEl.innerHTML = String(html`<div class="ss-top"><h2>Themenkarten</h2>
      <button type="button" class="sitem freeitem${armed && armed.free ? ' armed' : ''}" data-item="_free" title="Karte ohne Lektion, z. B. „Schularbeit“ – ziehen oder antippen"><span class="si-grip">${ic('grip')}</span><span class="si-b"><span class="si-t">${ic('plus')}Freie Karte</span><span class="si-i">ohne Lektion, mit eigenem Text</span></span></button>
      <label class="libsel libsearch"><span>Lektionen suchen</span><span class="ls-box">${ic('search')}<input class="field" type="search" id="sideq" value="${side.q}" placeholder="Stichwort" autocomplete="off" spellcheck="false" aria-label="Lektionen suchen"></span></label>
      <div class="ss-filters">${sl('sSubject', 'Fach', side.subject, 'Alle Fächer', subjects.map((s) => [s, s]))}${sl('sGrade', 'Schulstufe', side.grade, 'Alle Schulstufen', grades.map((s) => [s, s]))}${sl('sSort', 'Sortieren nach', side.sort, '', SORTS)}</div>
      <button type="button" class="tgl${side.unused ? ' on' : ''}" data-action="unused" aria-pressed="${side.unused ? 'true' : 'false'}"><i></i>nur noch nicht verwendete</button></div>
      <div class="ss-list" id="sslist">${listHtml()}</div>`);
    $('sideq').addEventListener('input', (e) => { side.q = e.target.value; $('sslist').innerHTML = String(listHtml()); });
  }
  const refreshList = () => { const el = $('sslist'); if (el) el.innerHTML = String(listHtml()); const f = sideEl.querySelector('.freeitem'); if (f) f.classList.toggle('armed', !!(armed && armed.free)); };

  // ---------- Matrix ----------
  const cardAt = (col, row) => S.cards.find((c) => c.col === col && c.row === row);
  const cardOf = (id) => S.cards.find((c) => c.id === id);
  function extent() {
    const mc = Math.max(-1, ...S.cards.map((c) => c.col)), mr = Math.max(-1, ...S.cards.map((c) => c.row));
    return { cols: Math.min(MAX_COL + 1, Math.max(6, mc + 3)), rows: Math.min(MAX_ROW + 1, Math.max(4, mr + 3)) };
  }
  // Pfeil-Anfasser an jeder Seite, an der es im Raster eine Nachbarzelle gibt – frei oder belegt, damit sich auch
  // direkt benachbarte Karten verbinden lassen (am Rand der Matrix gibt es nach außen keinen).
  const sidesOf = (c) => [['right', 1, 0], ['bottom', 0, 1], ['left', -1, 0], ['top', 0, -1]].filter(([, dc, dr]) => { const col = c.col + dc, row = c.row + dr; return col >= 0 && row >= 0 && col <= MAX_COL && row <= MAX_ROW; }).map(([sd]) => sd);
  function renderMap() {
    const { cols, rows } = extent(), { w, h } = sizeOf(cols, rows);
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!cardAt(c, r)) cells.push(html`<div class="scell" data-cell="${c}|${r}" style="left:${cellX(c)}px;top:${cellY(r)}px"></div>`);
    grid.style.width = `${w}px`; grid.style.height = `${h}px`; grid.style.zoom = zoom;
    grid.className = `sgrid${armed ? ' arming' : ''}${connectFrom ? ' connecting' : ''}`;
    grid.innerHTML = String(html`${cells}${linksSvg(S, { selLink: sel && sel.link != null ? sel.link : -1, w, h })}${S.cards.map((c) => cardHtml(c, byId, { sel: !!sel && sel.card === c.id, sides: sidesOf(c) }))}`);
    const bar = connectFrom || armed || fillFor ? '' : String(barHtml());
    $('sdock').innerHTML = bar; $('sdock').hidden = !bar;
    $('szoom').textContent = `${Math.round(zoom * 100)} %`;
    hint();
  }
  function hint() {
    const el = $('shint');
    const t = fillFor ? 'Links eine Lektion antippen – sie wird in die gewählte Karte eingesetzt. Esc bricht ab.' : connectFrom ? 'Zielkarte antippen – der Pfeil zeigt von der gewählten Karte dorthin. Esc bricht ab.' : armed ? 'Freie Zelle antippen, um die Karte dort abzulegen. Esc bricht ab.'
      : !S.cards.length ? 'Ziehe links eine Lektion oder eine freie Karte auf die Matrix.' : S.cards.length > 1 && !S.links.length ? 'Verbinden: an einem der Pfeil-Anfasser am Rand einer Karte ziehen und auf einer anderen Karte loslassen.' : '';
    el.textContent = t; el.hidden = !t || (!!sel && !connectFrom && !armed && !fillFor);
  }
  // Leiste zur Auswahl: Aktionen für die gewählte Karte oder den gewählten Pfeil
  function barHtml() {
    if (!sel) return '';
    if (sel.link != null) {
      const l = S.links[sel.link], a = l && cardOf(l.from), b = l && cardOf(l.to);
      if (!a || !b) return '';
      return html`<span class="sbar-t">${ic('arrow')}Pfeil: ${cardLook(a, byId).title} → ${cardLook(b, byId).title}</span><button class="btn" data-action="flip">${ic('refresh')}Richtung umkehren</button><button class="btn danger" data-action="remove">${ic('trash')}Pfeil löschen</button>`;
    }
    const c = cardOf(sel.card);
    if (!c) return '';
    const k = cardLook(c, byId);
    return html`<span class="sbar-t">${k.title}</span>
      ${k.L ? html`<button class="btn primary" data-action="presentCard">${ic('play')}Präsentieren</button><button class="btn" data-action="editCard">${ic('edit')}Bearbeiten</button>` : ''}
      ${k.free ? html`<button class="btn primary" data-action="fillNew" title="Neue Präsentation mit diesem Titel anlegen und hier einsetzen">${ic('plus')}Neues Thema erstellen</button><button class="btn" data-action="fillPick" title="Eine vorhandene Lektion hier einsetzen">${ic('book')}Lektion einsetzen</button><button class="btn" data-action="textCard">${ic('edit')}Öffnen</button>` : ''}
      <button class="btn" data-action="connect" title="Danach die Zielkarte antippen">${ic('arrow')}Verbinden</button><button class="btn danger" data-action="remove">${ic('trash')}Entfernen</button>`;
  }
  function renderAll() { renderMap(); refreshList(); undoButtons(); setSave(); }

  // ---------- Änderungen an der Serie ----------
  function place(what, col, row) {
    if (cardAt(col, row) || col < 0 || row < 0 || col > MAX_COL || row > MAX_ROW) return false;
    if (S.cards.length >= MAX_CARDS) { toast(`Eine Serie fasst höchstens ${MAX_CARDS} Karten.`, 'err'); return false; }
    if (what.lesson && usedLessons().has(what.lesson)) { toast('Diese Lektion ist schon in der Serie.', 'err'); return false; }
    snap();
    const card = { id: newId('k'), col, row, title: what.lesson ? (byId[what.lesson] ? byId[what.lesson].title : 'Lektion') : 'Neues Thema' };
    if (what.lesson) card.lesson = what.lesson;
    S.cards.push(card);
    sel = { card: card.id }; armed = null;
    renderAll(); changed();
    if (!what.lesson) editFree(card, true);
    return true;
  }
  // Platzhalter (freie Karte) mit einer Lektion füllen: Position und Pfeile bleiben
  function fill(cardId, lessonId) {
    const c = cardOf(cardId), L = byId[lessonId];
    if (!c || c.lesson || !L) return false;
    if (usedLessons().has(lessonId)) { toast('Diese Lektion ist schon in der Serie.', 'err'); return false; }
    snap();
    c.lesson = lessonId; c.title = L.title;
    delete c.note; delete c.color; delete c.icon;
    sel = { card: c.id }; armed = null; fillFor = null;
    renderAll(); changed();
    return true;
  }
  // Neue Präsentation für einen Platzhalter anlegen (Titel der Karte, Fach und Schulstufe der Serie) und gleich öffnen
  async function fillNew(cardId) {
    const c = cardOf(cardId);
    if (!c || c.lesson) return;
    try {
      const L = await api('/lessons', { method: 'POST', body: { lesson: { title: c.title, subject: S.subject, grade: S.grade, description: c.note || '', sections: [{ name: 'Einstieg' }], slides: [{ type: 'title', title: c.title }] } } });
      const meta = { id: L.id, title: L.title, subject: L.subject || '', grade: L.grade || '', slides: L.slides.length, updatedAt: L.updatedAt, card: null };
      lessons.push(meta); byId[L.id] = meta;
      if (!fill(cardId, L.id)) return;
      await flush();
      onEdit(L.id);
    } catch (e) { toast(e.message, 'err'); }
  }
  function move(id, col, row) {
    const c = cardOf(id);
    if (!c || (c.col === col && c.row === row) || cardAt(col, row) || col < 0 || row < 0 || col > MAX_COL || row > MAX_ROW) return false;
    snap();
    c.col = col; c.row = row;
    renderAll(); changed();
    return true;
  }
  function link(from, to) {
    if (from === to || !cardOf(from) || !cardOf(to)) return false;
    if (S.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))) { toast('Diese beiden Karten sind schon verbunden.'); return false; }
    snap();
    S.links.push({ from, to });
    sel = { link: S.links.length - 1 };
    renderAll(); changed();
    return true;
  }
  function removeSel() {
    if (!sel) return;
    snap();
    if (sel.link != null) S.links.splice(sel.link, 1);
    else { S.cards = S.cards.filter((c) => c.id !== sel.card); S.links = S.links.filter((l) => l.from !== sel.card && l.to !== sel.card); }
    sel = null;
    renderAll(); changed();
  }
  function editFree(card, fresh = false) {
    const st = { color: card.color || 'slate', icon: card.icon || '' };
    const body = () => html`<h2>${fresh ? 'Freie Karte' : 'Platzhalter'}</h2><p class="ov-sub">Die Karte hält einen Platz in der Serie frei, bis es eine Präsentation dazu gibt.</p>
      <div class="fillbox"><div><b>Neues Thema erstellen</b><small>Legt eine Präsentation mit diesem Titel an und setzt sie hier ein – Position und Pfeile bleiben.</small></div>
        <span class="fillbtns"><button class="btn primary" data-x="create">${ic('plus')}Neues Thema erstellen</button><button class="btn" data-x="createAi" title="Plenum schreibt den Auftrag für einen KI-Chat, die Antwort wird hier eingesetzt">${ic('sparkles')}Mit KI erstellen</button></span></div>
      <div class="freeform"><label class="fl"><span class="fl-l">Titel</span><input class="field" id="fcTitle" maxlength="60" value="${fresh ? '' : card.title}" placeholder="z. B. Schularbeit"></label>
      <label class="fl"><span class="fl-l">Notiz <small class="muted">(optional)</small></span><input class="field" id="fcNote" maxlength="160" value="${card.note || ''}" placeholder="z. B. Termin, Material, Hinweis"></label>
      <div class="fl"><span class="fl-l">Farbe</span><div class="swatches lookcols">${COLOR_NAMES.map((n) => html`<button type="button" class="swt${st.color === n ? ' on' : ''}" style="--sw:${COLORS[n].c}" data-col="${n}" title="${COLORS[n].name}" aria-label="Farbe ${COLORS[n].name}"></button>`)}</div></div>
      <div class="fl"><span class="fl-l">Symbol</span><div class="icongrid freeicons"><button type="button" class="iconopt${st.icon ? '' : ' on'}" data-icon="" title="Ohne Symbol" aria-label="Ohne Symbol">${ic('x')}</button>${ICON_NAMES.map((n) => html`<button type="button" class="iconopt${n === st.icon ? ' on' : ''}" data-icon="${n}" title="${n}" aria-label="Symbol ${n}">${ic(n)}</button>`)}</div></div></div>
      <div class="ov-actions"><button class="btn" data-x="cancel">Abbrechen</button><button class="btn primary" data-x="ok">${ic('check')}Übernehmen</button></div>`;
    const box = overlay(body(), { wide: true });
    const keep = () => ({ t: box.querySelector('#fcTitle').value, n: box.querySelector('#fcNote').value });
    const redraw = (v) => { box.innerHTML = String(body()); box.querySelector('#fcTitle').value = v.t; box.querySelector('#fcNote').value = v.n; };
    const ok = () => {
      const v = keep(), title = v.t.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!title) { toast('Bitte einen Titel eingeben', 'err'); box.querySelector('#fcTitle').focus(); return false; }
      if (!fresh) snap();
      card.title = title;
      const note = v.n.replace(/\s+/g, ' ').trim().slice(0, 160);
      if (note) card.note = note; else delete card.note;
      card.color = st.color; if (st.icon) card.icon = st.icon; else delete card.icon;
      closeOv(); renderAll(); changed();
      return true;
    };
    // Neues Thema: Eingaben übernehmen, dann eine leere Präsentation anlegen – oder den KI-Dialog mit Titel, Fach und Stufe öffnen
    const createAi = async () => {
      if (!ok()) return;
      await flush();
      const { showAiCreate } = await import('./ai.js');
      showAiCreate({ api, preset: { topic: card.note ? `${card.title} – ${card.note}` : card.title, subject: S.subject, grade: S.grade },
        onImported: async (L) => { const meta = { id: L.id, title: L.title, subject: L.subject || '', grade: L.grade || '', slides: L.slides.length, updatedAt: L.updatedAt, card: null }; lessons.push(meta); byId[L.id] = meta; if (fill(card.id, L.id)) { await flush(); onEdit(L.id); } } });
    };
    box.addEventListener('click', (e) => {
      const col = e.target.closest('[data-col]'), icn = e.target.closest('[data-icon]'), x = e.target.closest('[data-x]');
      if (col) { st.color = col.dataset.col; redraw(keep()); } else if (icn) { st.icon = icn.dataset.icon; redraw(keep()); } else if (x && x.dataset.x === 'ok') ok(); else if (x && x.dataset.x === 'create') { if (ok()) fillNew(card.id); } else if (x && x.dataset.x === 'createAi') createAi(); else if (x) closeOv();
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); ok(); } });
    box.querySelector('#fcTitle').focus();
  }
  // Präsentieren: neu oder bei einem gespeicherten Stand weitermachen (wie in der Bibliothek)
  async function presentLesson(id) {
    const L = byId[id];
    if (!L) return;
    await flush();
    let states = [];
    try { states = await api(`/states/${id}`); } catch { /* keine */ }
    if (!states.length) return onPresent(id);
    overlay(html`<div class="ov-ic">${ic('play')}</div><h2>${L.title}</h2><p class="ov-sub">Neu beginnen oder bei einem gespeicherten Stand weitermachen?</p>
      <div class="slots">${states.map((x) => html`<div class="slot click" data-st="${x.id}"><div class="slot-i">${ic(x.id === '_auto' ? 'refresh' : 'save')}</div><div class="slot-b"><div class="slot-n">${x.name}</div><div class="slot-m">${whenStr(x.savedAt)} · ${x.votes} Antworten</div></div><span class="btn primary">${ic('arrow')}Weitermachen</span></div>`)}</div>
      <div class="ov-actions"><button class="btn" data-st="_cancel">Abbrechen</button><button class="btn primary" data-st="_new">${ic('plus')}Neu beginnen</button></div>`, { wide: true })
      .addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; const v = b.dataset.st; closeOv(); if (v === '_new') onPresent(id); else if (v !== '_cancel') onPresent(id, v); });
  }

  // ---------- Zoom ----------
  function setZoom(z) {
    const cx = (scroll.scrollLeft + scroll.clientWidth / 2) / zoom, cy = (scroll.scrollTop + scroll.clientHeight / 2) / zoom;
    zoom = z; saveSide(); renderMap();
    scroll.scrollLeft = cx * zoom - scroll.clientWidth / 2; scroll.scrollTop = cy * zoom - scroll.clientHeight / 2;
  }
  const stepZoom = (d) => { const i = ZOOMS.reduce((b, z, k) => (Math.abs(z - zoom) < Math.abs(ZOOMS[b] - zoom) ? k : b), 0); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))]); };
  function zoomFit() {
    const { cols, rows } = extent(), { w, h } = sizeOf(cols, rows);
    const z = Math.min(scroll.clientWidth / w, scroll.clientHeight / h);
    setZoom([...ZOOMS].reverse().find((x) => x <= z) || ZOOMS[0]);
    scroll.scrollLeft = 0; scroll.scrollTop = 0;
  }

  // ---------- Ziehen (Pointer-Events) ----------
  const gridPoint = (e) => { const r = grid.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  function cellFrom(e) {
    const sr = scroll.getBoundingClientRect();
    if (e.clientX < sr.left || e.clientX > sr.right || e.clientY < sr.top || e.clientY > sr.bottom) return null;
    const p = gridPoint(e), col = Math.floor((p.x - G.pad + G.gx / 2) / G.px), row = Math.floor((p.y - G.pad + G.gy / 2) / G.py);
    const { cols, rows } = extent();
    return col >= 0 && row >= 0 && col < cols && row < rows ? { col, row } : null;
  }
  const markCell = (cell, ok) => { grid.querySelectorAll('.scell.over,.scell.bad').forEach((el) => el.classList.remove('over', 'bad')); if (cell) { const el = grid.querySelector(`[data-cell="${cell.col}|${cell.row}"]`); if (el) el.classList.add(ok ? 'over' : 'bad'); } };
  function ghost(title, color) {
    const g = document.createElement('div');
    g.className = 'sghost'; g.textContent = title; g.style.setProperty('--lc', color.c); g.style.setProperty('--lcs', color.s);
    document.body.appendChild(g);
    return g;
  }
  function onDown(e) {
    if (e.button > 0 || ovOpen() || drag) return;
    const t = e.target;
    if (t.closest('[data-bar]')) return;
    const item = t.closest('[data-item]');
    if (item && sideEl.contains(item)) {
      if (item.classList.contains('used')) return;
      // Maus: ganze Karte ziehen. Finger/Stift: nur am Griff, damit die Liste sich noch schieben lässt.
      const canDrag = e.pointerType === 'mouse' || !!t.closest('.si-grip');
      const what = item.dataset.item === '_free' ? { free: true } : { lesson: item.dataset.item };
      drag = { kind: 'new', what, x: e.clientX, y: e.clientY, moved: false, canDrag, title: what.free ? 'Freie Karte' : byId[what.lesson].title, color: colorOf(what.free ? 'slate' : (byId[what.lesson].card && byId[what.lesson].card.color) || 'indigo') };
      return;
    }
    if (!scroll.contains(t)) return;
    const handle = t.closest('[data-handle]');
    if (handle) { e.preventDefault(); drag = { kind: 'link', from: handle.dataset.handle, side: handle.dataset.side || 'right', x: e.clientX, y: e.clientY, moved: false }; return; }
    const cardEl = t.closest('[data-card]');
    if (cardEl) { drag = { kind: 'move', id: cardEl.dataset.card, x: e.clientX, y: e.clientY, moved: false }; return; }
    if (t.closest('[data-link]')) { drag = { kind: 'pick', link: +t.closest('[data-link]').dataset.link, x: e.clientX, y: e.clientY, moved: false }; return; }
    drag = { kind: 'pan', x: e.clientX, y: e.clientY, sx: scroll.scrollLeft, sy: scroll.scrollTop, moved: false, cell: t.closest('[data-cell]') ? cellFrom(e) : null, touch: e.pointerType !== 'mouse' };
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      if (drag.kind === 'new' && !drag.canDrag) { drag = null; return; }
      if (drag.kind === 'new') drag.ghost = ghost(drag.title, drag.color);
      if (drag.kind === 'move') { const c = cardOf(drag.id); drag.ghost = ghost(cardLook(c, byId).title, cardLook(c, byId).color); const el = grid.querySelector(`[data-card="${drag.id}"]`); if (el) el.classList.add('dragging'); }
      if (drag.kind === 'pan' && !drag.touch) scroll.classList.add('panning');
      document.body.classList.add('sdragging');
    }
    if (drag.kind === 'pan') { if (!drag.touch) { scroll.scrollLeft = drag.sx - dx; scroll.scrollTop = drag.sy - dy; } return; }
    e.preventDefault();
    if (drag.ghost) { drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`; }
    if (drag.kind === 'new' || drag.kind === 'move') {
      const cell = cellFrom(e), occ = cell && cardAt(cell.col, cell.row);
      const into = drag.kind === 'new' && drag.what.lesson && occ && !occ.lesson ? occ.id : null; // Lektion auf einen Platzhalter
      drag.cell = cell; drag.into = into; drag.ok = !!cell && (!occ || !!into || (drag.kind === 'move' && occ.id === drag.id));
      markCell(cell, drag.ok);
      grid.querySelectorAll('.scard.target').forEach((el) => el.classList.remove('target'));
      if (into) grid.querySelector(`[data-card="${into}"]`).classList.add('target');
      if (drag.ghost) drag.ghost.classList.toggle('bad', !!cell && !drag.ok);
    } else if (drag.kind === 'link') {
      const a = cardOf(drag.from), p = gridPoint(e), over = document.elementFromPoint(e.clientX, e.clientY), tc = over && over.closest('[data-card]');
      const tid = tc && grid.contains(tc) && tc.dataset.card !== drag.from ? tc.dataset.card : null;
      grid.querySelectorAll('.scard.target').forEach((el) => el.classList.remove('target'));
      if (tid) grid.querySelector(`[data-card="${tid}"]`).classList.add('target');
      drag.to = tid;
      const tmp = $('sltemp');
      if (tmp && a) tmp.setAttribute('d', tid ? linkPath(a, cardOf(tid)).d : `M${cellX(a.col) + (drag.side === 'right' ? G.cw : drag.side === 'left' ? 0 : G.cw / 2)} ${cellY(a.row) + (drag.side === 'bottom' ? G.ch : drag.side === 'top' ? 0 : G.ch / 2)}L${p.x} ${p.y}`);
    }
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    document.body.classList.remove('sdragging'); scroll.classList.remove('panning');
    if (!d.moved) { // Klick
      if (d.kind === 'new' && fillFor && d.what.lesson) { if (!fill(fillFor, d.what.lesson)) { fillFor = null; renderAll(); } }
      else if (d.kind === 'new') { fillFor = null; armed = armed && ((armed.free && d.what.free) || (armed.lesson && armed.lesson === d.what.lesson)) ? null : d.what; connectFrom = null; sel = null; renderAll(); }
      else if (d.kind === 'move') {
        const tc = cardOf(d.id);
        if (armed && armed.lesson && tc && !tc.lesson) { if (!fill(d.id, armed.lesson)) renderAll(); } // vorgewählte Lektion auf einen Platzhalter
        else if (connectFrom && connectFrom !== d.id) { const f = connectFrom; connectFrom = null; if (!link(f, d.id)) renderAll(); }
        else { connectFrom = null; armed = null; fillFor = null; sel = sel && sel.card === d.id ? null : { card: d.id }; renderAll(); }
      } else if (d.kind === 'pick') { sel = { link: d.link }; armed = null; connectFrom = null; renderAll(); }
      else if (d.kind === 'pan') {
        if (armed && d.cell) { if (!place(armed, d.cell.col, d.cell.row)) renderAll(); }
        else if (sel || armed || connectFrom || fillFor) { sel = null; armed = null; connectFrom = null; fillFor = null; renderAll(); }
      }
      return;
    }
    if (d.kind === 'new') { if (d.into) { if (!fill(d.into, d.what.lesson)) renderMap(); } else if (d.cell && d.ok) place(d.what, d.cell.col, d.cell.row); else renderMap(); }
    else if (d.kind === 'move') { if (!(d.cell && d.ok && move(d.id, d.cell.col, d.cell.row))) renderMap(); }
    else if (d.kind === 'link') { if (!(d.to && link(d.from, d.to))) renderMap(); }
  }
  // Doppelklick öffnet einen Platzhalter (Text, Farbe, „Neues Thema erstellen“)
  const onDbl = (e) => { const el = e.target.closest('.sgrid .scard.free'); if (el && !ovOpen()) { const c = cardOf(el.dataset.card); if (c && !c.lesson) { sel = { card: c.id }; renderAll(); editFree(c); } } };
  root.addEventListener('dblclick', onDbl);
  undel.push(() => root.removeEventListener('dblclick', onDbl));
  root.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  undel.push(() => { root.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); });
  const onWheel = (e) => { if (e.ctrlKey) { e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1); } };
  scroll.addEventListener('wheel', onWheel, { passive: false });

  // ---------- Kopfzeile, Tastatur ----------
  const meta = (id, key, max) => $(id).addEventListener('input', (e) => { snap(`meta:${key}`); S[key] = e.target.value.slice(0, max); changed(); });
  meta('stitle', 'title', 90); meta('ssubject', 'subject', 40); meta('sgrade', 'grade', 40);
  $('stitle').addEventListener('blur', (e) => { if (!e.target.value.trim()) { S.title = 'Neue Themenserie'; e.target.value = S.title; changed(); } });
  const onKey = (e) => {
    if (ovOpen()) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(e.shiftKey ? redoStack : undoStack, e.shiftKey ? undoStack : redoStack); return; }
    if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(redoStack, undoStack); return; }
    if (typing) return;
    if (e.key === 'Escape' && (armed || connectFrom || sel || fillFor)) { armed = null; connectFrom = null; sel = null; fillFor = null; renderAll(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); return; }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (dir && sel && sel.card) { e.preventDefault(); const c = cardOf(sel.card); if (c) move(c.id, c.col + dir[0], c.row + dir[1]); }
  };
  document.addEventListener('keydown', onKey);
  undel.push(() => document.removeEventListener('keydown', onKey));

  const actions = {
    back: async () => { await flush(); onClose(); },
    undo: () => restore(undoStack, redoStack),
    redo: () => restore(redoStack, undoStack),
    zoomIn: () => stepZoom(1), zoomOut: () => stepZoom(-1), zoomFit,
    unused: () => { side.unused = !side.unused; saveSide(); renderSide(); },
    plan: async () => { await flush(); if (!S.cards.length) return toast('Die Serie hat noch keine Karten.'); exportSeriesImage({ id: S.id, title: S.title, plan: true }); },
    image: async () => { await flush(); if (!S.cards.length) return toast('Die Serie hat noch keine Karten.'); exportSeriesImage({ id: S.id, title: S.title }); },
    export: async () => { await flush(); download(`/series/${S.id}/export`); },
    presentCard: () => { const c = sel && cardOf(sel.card); if (c && c.lesson) presentLesson(c.lesson); },
    editCard: async () => { const c = sel && cardOf(sel.card); if (c && c.lesson && byId[c.lesson]) { await flush(); onEdit(c.lesson); } },
    fillNew: () => { if (sel && sel.card) fillNew(sel.card); },
    fillPick: () => { if (sel && sel.card) { fillFor = sel.card; armed = null; connectFrom = null; renderAll(); } },
    textCard: () => { const c = sel && cardOf(sel.card); if (c) editFree(c); },
    connect: () => { if (sel && sel.card) { connectFrom = sel.card; armed = null; renderAll(); } },
    flip: () => { const l = sel && S.links[sel.link]; if (l) { snap(); [l.from, l.to] = [l.to, l.from]; renderAll(); changed(); } },
    remove: removeSel,
  };
  const change = {
    sSubject: (el) => { side.subject = el.value; saveSide(); renderSide(); },
    sGrade: (el) => { side.grade = el.value; saveSide(); renderSide(); },
    sSort: (el) => { side.sort = el.value; saveSide(); renderSide(); },
  };
  undel.push(delegate(document.body, 'click', actions), delegate(document.body, 'change', change, 'change'));

  renderSide(); renderAll();
  return { destroy() { alive = false; clearTimeout(saveTimer); if (dirty) save(); undel.forEach((f) => f()); document.querySelectorAll('.sghost').forEach((g) => g.remove()); document.body.classList.remove('sdragging'); }, flush };
}
