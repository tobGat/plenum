// Bibliothek: Lektionen verwalten, präsentieren, importieren, mit KI erstellen
import { html, raw, delegate, toast, whenStr } from '../core/dom.js';
import { ic, logo } from '../core/icons.js';
import { overlay, closeOv, ask } from '../core/overlay.js';
import { download } from '../core/api.js';
import { colorOf } from '../core/parts.js';

export function createLibrary({ root, api, socket, info, onPresent, onEdit, onResume }) {
  let lessons = [], presenting = null;
  // Ansicht der Bibliothek: Filter nach Fach und Schulstufe, Sortierung (wird am Gerät gemerkt)
  const VIEW_KEY = 'plenum.library';
  const view = { subject: '', grade: '', sort: 'updated' };
  try { Object.assign(view, JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')); } catch { /* Standard */ }
  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* egal */ } };
  const SORTS = [['updated', 'Zuletzt geändert'], ['title', 'Titel (A–Z)'], ['subject', 'Fach'], ['grade', 'Schulstufe']];
  const de = (a, b) => String(a).localeCompare(String(b), 'de', { numeric: true, sensitivity: 'base' });
  // Schulstufe: nach der ersten Zahl sortieren („4. Klasse“ vor „10. Schulstufe“), ohne Zahl ans Ende
  const gradeNum = (g) => { const m = String(g || '').match(/\d+/); return m ? +m[0] : 999; };
  const byGrade = (a, b) => gradeNum(a) - gradeNum(b) || de(a, b);
  const distinct = (key, cmp) => [...new Set(lessons.map((l) => (l[key] || '').trim()).filter(Boolean))].sort(cmp);
  function visible() {
    const list = lessons.filter((l) => (!view.subject || (l.subject || '').trim() === view.subject) && (!view.grade || (l.grade || '').trim() === view.grade));
    const upd = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt));
    if (view.sort === 'title') list.sort((a, b) => de(a.title, b.title));
    else if (view.sort === 'subject') list.sort((a, b) => de(a.subject || '\uffff', b.subject || '\uffff') || byGrade(a.grade, b.grade) || de(a.title, b.title));
    else if (view.sort === 'grade') list.sort((a, b) => byGrade(a.grade, b.grade) || de(a.subject || '\uffff', b.subject || '\uffff') || de(a.title, b.title));
    else list.sort(upd);
    return list;
  }
  const undel = [];

  async function load() {
    try { [lessons, info] = await Promise.all([api('/lessons'), api('/info')]); presenting = info.presenting; } catch (e) { toast(e.message, 'err'); }
    render();
  }
  function card(L, i) {
    const st = L.lastState;
    return html`<article class="lcard anim" style="--i:${i}"><div class="lc-band"></div><div class="lc-body">
      <div class="lc-meta">${[L.subject, L.grade].filter(Boolean).join(' · ') || 'Lektion'}</div><h3>${L.title}</h3>
      <div class="lc-info">${ic('list')}${L.slides} ${L.slides === 1 ? 'Folie' : 'Folien'} · geändert ${whenStr(L.updatedAt)}</div>
      ${st ? html`<div class="lc-state">${ic('save')}Letzter Stand: <b>${st.name}</b> · ${whenStr(st.savedAt)}</div>` : ''}</div>
      <div class="lc-actions"><button class="btn primary" data-action="present" data-id="${L.id}">${ic('play')}Präsentieren</button><button class="btn" data-action="edit" data-id="${L.id}">${ic('edit')}Bearbeiten</button>
        <button class="btn icon" data-action="more" data-id="${L.id}" title="Weitere Aktionen" aria-label="Weitere Aktionen für ${L.title}">${ic('more')}</button></div></article>`;
  }
  function toolbar() {
    const subjects = distinct('subject', de), grades = distinct('grade', byGrade);
    if (view.subject && !subjects.includes(view.subject)) view.subject = '';
    if (view.grade && !grades.includes(view.grade)) view.grade = '';
    const sel = (id, label, cur, all, opts) => html`<label class="libsel"><span>${label}</span><select class="field" data-change="${id}">${all ? html`<option value="">${all}</option>` : ''}${opts.map(([v, l]) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`)}</select></label>`;
    return html`<div class="libbar">${sel('fSubject', 'Fach', view.subject, 'Alle Fächer', subjects.map((s) => [s, s]))}${sel('fGrade', 'Schulstufe', view.grade, 'Alle Schulstufen', grades.map((s) => [s, s]))}${sel('fSort', 'Sortieren nach', view.sort, '', SORTS)}
      ${view.subject || view.grade ? html`<button class="btn" data-action="clearFilter">${ic('x')}Filter zurücksetzen</button>` : ''}</div>`;
  }
  // Karten; bei Sortierung nach Fach oder Schulstufe mit Gruppenüberschriften
  function gridHtml() {
    const list = visible();
    if (!list.length) return html`${toolbar()}<div class="empty card">${ic('search')}<h3>Keine Lektion passt zu diesem Filter</h3><p><button class="btn" data-action="clearFilter">Filter zurücksetzen</button></p></div>`;
    const key = view.sort === 'subject' ? 'subject' : view.sort === 'grade' ? 'grade' : '';
    if (!key) return html`${toolbar()}<div class="lgrid">${list.map(card)}</div>`;
    const groups = [];
    list.forEach((l) => { const name = (l[key] || '').trim() || (key === 'subject' ? 'Ohne Fach' : 'Ohne Schulstufe'); const g = groups[groups.length - 1]; if (g && g.name === name) g.items.push(l); else groups.push({ name, items: [l] }); });
    let i = 0;
    return html`${toolbar()}${groups.map((g) => html`<h2 class="libgroup">${g.name}<small>${g.items.length}</small></h2><div class="lgrid">${g.items.map((l) => card(l, i++))}</div>`)}`;
  }
  function render() {
    root.innerHTML = String(html`<div id="app" class="library"><header class="libhead"><div class="brand">${raw(logo())}<span class="chap">Plenum</span></div><div class="hspace"></div>
      <button class="hbtn" data-action="help">${ic('info')}<span>Hilfe</span></button><button class="hbtn" data-action="settings">${ic('settings')}<span>Einstellungen</span></button></header>
      <main class="libmain"><div class="wrap">
        ${presenting ? html`<div class="hint anim">${ic('play')}<span>Eine Präsentation läuft gerade.</span><button class="btn primary" data-action="resume">Zurück zur Präsentation</button></div>` : ''}
        <div class="libtop"><div><h1>Meine Lektionen</h1><p class="sub">Erstelle Folien, Aufgaben und Umfragen – oder lass eine KI eine Lektion vorbereiten.</p></div>
          <div class="libbtns"><button class="btn primary big" data-action="new">${ic('plus')}Neue Lektion</button><button class="btn big" data-action="ai">${ic('sparkles')}Mit KI erstellen</button><button class="btn big" data-action="import">${ic('upload')}Importieren</button></div></div>
        ${lessons.length ? gridHtml() : html`<div class="empty card anim">${ic('book')}<h3>Noch keine Lektionen</h3><p>Lege eine neue Lektion an, importiere eine .plenum-Datei oder lass eine KI eine Lektion vorbereiten.</p></div>`}
        <div class="libfoot"><button class="btn" data-action="backup">${ic('download')}Alle Lektionen sichern</button><span class="muted">Gespeichert in: ${info.lessonsDir}</span>${window.plenumApp?.openPath ? html`<button class="btn" data-action="openDir">${ic('file')}Ordner öffnen</button>` : ''}</div>
      </div></main></div>`);
    // Abschnittsfarbe je Karte
    root.querySelectorAll('.lcard').forEach((el, i) => { const c = colorOf(['indigo', 'teal', 'blue', 'violet', 'emerald', 'amber', 'cyan', 'rose', 'fuchsia'][i % 9]); el.style.setProperty('--lc', c.c); el.style.setProperty('--lcs', c.s); });
  }

  // ---------- Präsentieren: neu oder Stand fortsetzen ----------
  async function choosePresent(id) {
    const L = lessons.find((x) => x.id === id);
    let states = [];
    try { states = await api(`/states/${id}`); } catch { /* keine */ }
    if (!states.length) return onPresent(id);
    stateDialog(L, states);
  }
  function stateDialog(L, states) {
    const id = L.id;
    overlay(html`<div class="ov-ic">${ic('play')}</div><h2>${L.title}</h2><p class="ov-sub">Neu beginnen oder bei einem gespeicherten Stand weitermachen?</p>
      <div class="slots">${states.map((x) => html`<div class="slot click" data-action="presentState" data-id="${id}" data-state="${x.id}"><div class="slot-i">${ic(x.id === '_auto' ? 'refresh' : 'save')}</div><div class="slot-b"><div class="slot-n">${x.name}</div><div class="slot-m">${whenStr(x.savedAt)} · ${x.votes} Antworten</div></div><span class="btn primary">${ic('arrow')}Weitermachen</span><button class="btn icon danger" title="Stand löschen" aria-label="Stand „${x.name}“ löschen" data-action="delState" data-id="${id}" data-state="${x.id}" data-name="${x.name}">${ic('trash')}</button></div>`)}</div>
      ${states.length > 1 ? html`<button class="btn danger" data-action="delState" data-id="${id}" data-state="_all">${ic('trash')}Alle Stände löschen</button>` : ''}
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-action="presentNew" data-id="${id}">${ic('plus')}Neu beginnen</button></div>`, { wide: true });
  }

  // ---------- Import ----------
  function showImport(prefill = '') {
    const box = overlay(html`<div class="ov-ic">${ic('upload')}</div><h2>Lektion importieren</h2><p class="ov-sub">Eine .plenum-Datei wählen oder den Text einer KI-Antwort bzw. Lektion einfügen.</p>
      <label class="filepick btn big">${ic('file')}Datei wählen …<input type="file" accept=".plenum,.json,application/json" data-change="importFile" hidden></label>
      <textarea class="field mono" rows="8" id="impText" placeholder="… oder hier einfügen">${prefill}</textarea>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-action="parseImport">${ic('search')}Prüfen</button></div>`, { wide: true });
    box.querySelector('textarea').focus();
  }
  async function parseAndPreview(text) {
    let r;
    try { r = await api('/import/parse', { method: 'POST', body: { text } }); } catch (e) { return toast(e.message, 'err'); }
    if (r.bundle) {
      overlay(html`<h2>Sicherung importieren</h2><p class="ov-sub">${r.bundle.length} Lektionen gefunden. Vorhandene Lektionen werden nicht überschrieben (Kopien).</p><div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-action="commitBundle">Importieren</button></div>`);
      pending = { bundle: r.bundle.map((x) => x.lesson) };
      return;
    }
    pending = { lesson: r.lesson };
    const exists = r.lesson && lessons.some((x) => x.id === r.lesson.id);
    overlay(html`<h2>${r.lesson ? r.lesson.title : 'Import nicht möglich'}</h2>
      ${r.lesson ? html`<p class="ov-sub">${r.lesson.slides.length} Folien in ${r.lesson.sections.length} Abschnitten${r.truncated ? ' (Antwort war abgeschnitten)' : ''}</p>` : ''}
      ${r.errors.length ? html`<div class="warn">${ic('alert')}<div><b>Probleme</b><ul class="replist">${r.errors.map((x) => html`<li>${x}</li>`)}</ul></div></div>` : ''}
      ${r.repairs.length ? html`<details class="repairs"${r.repairs.length < 6 ? ' open' : ''}><summary>${r.repairs.length} automatische Anpassungen</summary><ul class="replist">${r.repairs.map((x) => html`<li>${x}</li>`)}</ul></details>` : ''}
      <div class="ov-actions"><button class="btn" data-action="import">Zurück</button>${r.lesson ? html`${exists ? html`<button class="btn" data-action="commit" data-mode="replace">Vorhandene ersetzen</button>` : ''}<button class="btn primary" data-action="commit" data-mode="${exists ? 'copy' : 'new'}">${ic('check')}${exists ? 'Als Kopie importieren' : 'Importieren'}</button>` : ''}</div>`, { wide: true });
  }
  let pending = null;

  const actions = {
    close: closeOv,
    resume: () => onResume(),
    clearFilter: () => { view.subject = ''; view.grade = ''; saveView(); render(); },
    present: (el) => choosePresent(el.dataset.id),
    presentNew: (el) => { closeOv(); onPresent(el.dataset.id); },
    presentState: (el) => { closeOv(); onPresent(el.dataset.id, el.dataset.state); },
    delState: async (el) => {
      const { id, state, name } = el.dataset, L = lessons.find((x) => x.id === id), all = state === '_all';
      let states = null;
      if (await ask(all ? 'Alle Stände löschen?' : `Stand „${name}“ löschen?`, `Die gespeicherten Antworten ${all ? 'aller Stände dieser Lektion' : 'dieses Stands'} gehen verloren. Die Lektion selbst bleibt erhalten.`, { ok: 'Löschen', danger: true })) {
        try { states = await api(`/states/${id}/${state}`, { method: 'DELETE' }); toast(all ? 'Alle Stände gelöscht' : 'Stand gelöscht'); } catch (e) { toast(e.message, 'err'); }
        await load();
      }
      if (!states) { try { states = await api(`/states/${id}`); } catch { states = []; } }
      if (L && states.length) stateDialog(L, states); else closeOv();
    },
    edit: (el) => onEdit(el.dataset.id),
    new: async () => { try { const L = await api('/lessons', { method: 'POST', body: {} }); onEdit(L.id); } catch (e) { toast(e.message, 'err'); } },
    more: (el) => {
      const L = lessons.find((x) => x.id === el.dataset.id);
      overlay(html`<h2>${L.title}</h2><div class="menu"><button class="btn" data-action="dup" data-id="${L.id}">${ic('copy')}Duplizieren</button><button class="btn" data-action="export" data-id="${L.id}">${ic('download')}Exportieren (.plenum)</button><button class="btn" data-action="pdf" data-id="${L.id}">${ic('file')}Als PDF exportieren …</button>
        <button class="btn" data-action="aiRevise" data-id="${L.id}">${ic('sparkles')}Mit KI überarbeiten</button><button class="btn danger" data-action="del" data-id="${L.id}">${ic('trash')}Löschen</button></div>`);
    },
    dup: async (el) => { closeOv(); try { await api(`/lessons/${el.dataset.id}/duplicate`, { method: 'POST' }); toast('Kopie angelegt'); load(); } catch (e) { toast(e.message, 'err'); } },
    export: (el) => { closeOv(); download(`/lessons/${el.dataset.id}/export`); },
    pdf: async (el) => { const L = lessons.find((x) => x.id === el.dataset.id); closeOv(); const { showPdfExport } = await import('./pdf.js'); showPdfExport({ api, lessonId: L.id, title: L.title, live: presenting === L.id }); },
    del: async (el) => {
      const L = lessons.find((x) => x.id === el.dataset.id);
      if (!(await ask(`„${L.title}“ löschen?`, 'Die Lektion und ihre gespeicherten Stände werden gelöscht. Das lässt sich nicht rückgängig machen.', { ok: 'Löschen', danger: true }))) return;
      try { await api(`/lessons/${L.id}`, { method: 'DELETE' }); toast('Gelöscht'); load(); } catch (e) { toast(e.message, 'err'); }
    },
    import: () => showImport(),
    parseImport: () => { const t = document.getElementById('impText').value; if (t.trim()) parseAndPreview(t); },
    commit: async (el) => {
      try { const L = await api('/import/commit', { method: 'POST', body: { lesson: pending.lesson, mode: el.dataset.mode } }); closeOv(); toast(`„${L.title}“ importiert`); load(); } catch (e) { toast(e.message, 'err'); }
    },
    commitBundle: async () => { try { await api('/import/commit', { method: 'POST', body: { lessons: pending.bundle, mode: 'copy' } }); closeOv(); toast('Sicherung importiert'); load(); } catch (e) { toast(e.message, 'err'); } },
    ai: async () => { const { showAiCreate } = await import('./ai.js'); showAiCreate({ api, onImported: (L) => { toast(`„${L.title}“ erstellt – jetzt prüfen und anpassen`); onEdit(L.id); } }); },
    aiRevise: async (el) => { closeOv(); const { showAiRevise } = await import('./ai.js'); showAiRevise({ api, lessonId: el.dataset.id, onImported: () => load() }); },
    backup: () => download('/backup'),
    openDir: () => window.plenumApp.openPath(info.lessonsDir),
    settings: async () => { const { showSettings } = await import('./settings.js'); showSettings({ api, info, onChanged: load }); },
    help: async () => { const { showHelp } = await import('./settings.js'); showHelp({ info }); },
  };
  const change = {
    fSubject: (el) => { view.subject = el.value; saveView(); render(); },
    fGrade: (el) => { view.grade = el.value; saveView(); render(); },
    fSort: (el) => { view.sort = el.value; saveView(); render(); },
    importFile: (el) => { const f = el.files && el.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => parseAndPreview(String(rd.result)); rd.readAsText(f); },
  };
  undel.push(delegate(document.body, 'click', actions), delegate(document.body, 'change', change, 'change'));
  load();
  return { destroy() { undel.forEach((f) => f()); }, reload: load };
}
