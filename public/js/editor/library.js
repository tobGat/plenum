// Bibliothek: Lektionen verwalten, präsentieren, importieren, mit KI erstellen
import { html, raw, delegate, toast, whenStr } from '../core/dom.js';
import { ic, logo } from '../core/icons.js';
import { overlay, closeOv, ask } from '../core/overlay.js';
import { download } from '../core/api.js';
import { colorOf, iconGfx } from '../core/parts.js';
import { LIBRARY, libSvg } from '/shared/graphics.js';
import { COLORS, COLOR_NAMES, ICON_NAMES } from '/shared/palette.js';
import { norm, de, byGrade, SORTS, AUTO_COLORS as AUTO, sortLessons, distinct as distinctOf } from './libutil.js';
import { miniMap } from './seriesmap.js';
import { LOOK_IMAGE_MAX } from '/shared/series.js';
import { CARD_IMAGE_MAX } from '/shared/schema.js';

export function createLibrary({ root, api, socket, info, onPresent, onEdit, onResume, onSeries }) {
  let lessons = [], series = [], presenting = null;
  // Ansicht der Bibliothek: Filter nach Fach und Schulstufe, Sortierung (wird am Gerät gemerkt)
  const VIEW_KEY = 'plenum.library';
  const view = { subject: '', grade: '', sort: 'updated', tab: 'lessons', sSubject: '', sGrade: '', sSort: 'updated' }; // s… = Filter der Themenserien
  try { Object.assign(view, JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')); } catch { /* Standard */ }
  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* egal */ } };
  const distinct = (key, cmp) => [...new Set(lessons.map((l) => (l[key] || '').trim()).filter(Boolean))].sort(cmp);
  // Stichwortsuche: alle Wörter müssen vorkommen – in Titel, Fach, Schulstufe, Beschreibung oder im Text einer Folie.
  // Groß-/Kleinschreibung, Akzente und Umlaut-Punkte spielen keine Rolle („blatter“ findet „Blätter“; „blaetter“ nicht).
  let query = '';
  const words = () => norm(query).split(/\s+/).filter(Boolean);
  // null = kein Treffer; sonst { slides: [Foliennummern mit Treffer], snippet: Textstelle der ersten Folie }
  function hit(L, ws) {
    if (!ws.length) return {};
    const head = norm([L.title, L.subject, L.grade, L.desc].join(' ')), texts = (L.texts || []).map(norm);
    if (!ws.every((w) => head.includes(w) || texts.some((t) => t.includes(w)))) return null;
    const inSlides = ws.filter((w) => !norm(L.title).includes(w)); // was schon im Titel steht, braucht keinen Hinweis
    const slides = [];
    texts.forEach((t, i) => { if (inSlides.some((w) => t.includes(w))) slides.push(i); });
    if (!inSlides.length || !slides.length) return {};
    const t = texts[slides[0]], w = inSlides.find((x) => t.includes(x)), at = t.indexOf(w), raw0 = L.texts[slides[0]];
    const from = Math.max(0, at - 36), to = Math.min(raw0.length, at + w.length + 48);
    return { slides: slides.map((i) => i + 1), snippet: `${from ? '…' : ''}${raw0.slice(from, to).trim()}${to < raw0.length ? '…' : ''}` };
  }
  const HITS = new Map();
  function visible() {
    const ws = words();
    HITS.clear();
    const list = lessons.filter((l) => {
      if ((view.subject && (l.subject || '').trim() !== view.subject) || (view.grade && (l.grade || '').trim() !== view.grade)) return false;
      const h = hit(l, ws);
      if (h) HITS.set(l.id, h);
      return !!h;
    });
    const upd = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt));
    if (view.sort === 'title') list.sort((a, b) => de(a.title, b.title));
    else if (view.sort === 'subject') list.sort((a, b) => de(a.subject || '\uffff', b.subject || '\uffff') || byGrade(a.grade, b.grade) || de(a.title, b.title));
    else if (view.sort === 'grade') list.sort((a, b) => byGrade(a.grade, b.grade) || de(a.subject || '\uffff', b.subject || '\uffff') || de(a.title, b.title));
    else list.sort(upd);
    return list;
  }
  const undel = [];

  async function load() {
    try { [lessons, info, series] = await Promise.all([api('/lessons'), api('/info'), api('/series')]); presenting = info.presenting; } catch (e) { toast(e.message, 'err'); }
    render();
  }
  // Aussehen der Karte: eigene Farbe (sonst reihum) und Grafik (Illustration oder Symbol)
  const colVars = (c) => `--c:${c.c};--c-s:${c.s};--c-d:${c.d};--c-l:${c.l}`;
  const gfx = (src) => (src.startsWith('lib:') ? libSvg(src.slice(4)) : iconGfx(src.slice(5)));
  const cardImg = (src, pos) => html`<img src="${src}" alt="" draggable="false" style="object-position:${pos ? pos.x : 50}% ${pos ? pos.y : 50}%">`;
  // Ausschnitt eines eigenen Bildes wählen: das Bild in der Vorschau ziehen (nur in der Richtung, in der es übersteht)
  function cropDrag(box, selector, st) {
    box.addEventListener('pointerdown', (e) => {
      const img = e.target.closest(selector);
      if (!img || !img.naturalWidth) return;
      e.preventDefault();
      const r = img.getBoundingClientRect(), sc = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const overX = img.naturalWidth * sc - r.width, overY = img.naturalHeight * sc - r.height, x0 = e.clientX, y0 = e.clientY, p0 = { ...st.pos };
      const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
      const mv = (ev) => { st.pos = { x: overX > 1 ? clamp(p0.x - ((ev.clientX - x0) / overX) * 100) : p0.x, y: overY > 1 ? clamp(p0.y - ((ev.clientY - y0) / overY) * 100) : p0.y }; img.style.objectPosition = `${st.pos.x}% ${st.pos.y}%`; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); img.classList.remove('moving'); };
      img.classList.add('moving');
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  }
  function card(L, i) {
    const st = L.lastState, h = HITS.get(L.id), own = L.card && L.card.color, c = colorOf(own || AUTO[i % AUTO.length]);
    return html`<article class="lcard anim${own ? ' tint' : ''}" data-color="${own || ''}" style="--i:${i};--lc:${c.c};--lcs:${c.s}"><div class="lc-band"></div><div class="lc-body">
      <div class="lc-top"><div class="lc-tt"><div class="lc-meta">${[L.subject, L.grade].filter(Boolean).join(' · ') || 'Lektion'}</div><h3>${L.title}</h3></div>
        ${L.card && (L.card.graphic || L.card.imgv) ? html`<button type="button" class="lc-gfx${L.card.imgv ? ' photo' : ''}" style="${colVars(c)}" data-action="look" data-id="${L.id}" title="Farbe und Bild ändern" aria-label="Farbe und Bild von „${L.title}“ ändern">${L.card.imgv ? cardImg(`/api/host/lessons/${L.id}/cardimage?v=${L.card.imgv}`, L.card.pos) : raw(gfx(L.card.graphic))}</button>` : ''}</div>
      <div class="lc-info">${ic('list')}${L.slides} ${L.slides === 1 ? 'Folie' : 'Folien'} · geändert ${whenStr(L.updatedAt)}</div>
      ${h && h.slides ? html`<div class="lc-hit">${ic('search')}<span><b>Folie ${h.slides.slice(0, 4).join(', ')}${h.slides.length > 4 ? ` und ${h.slides.length - 4} weitere` : ''}:</b> ${h.snippet}</span></div>` : ''}
      ${st ? html`<div class="lc-state">${ic('save')}Letzter Stand: <b>${st.name}</b> · ${whenStr(st.savedAt)}</div>` : ''}</div>
      <div class="lc-actions"><button class="btn primary" data-action="present" data-id="${L.id}">${ic('play')}Präsentieren</button><button class="btn" data-action="edit" data-id="${L.id}">${ic('edit')}Bearbeiten</button>
        <button class="btn icon" data-action="more" data-id="${L.id}" title="Weitere Aktionen" aria-label="Weitere Aktionen für ${L.title}">${ic('more')}</button></div></article>`;
  }
  function toolbar() {
    const subjects = distinct('subject', de), grades = distinct('grade', byGrade);
    if (view.subject && !subjects.includes(view.subject)) view.subject = '';
    if (view.grade && !grades.includes(view.grade)) view.grade = '';
    const sel = (id, label, cur, all, opts) => html`<label class="libsel"><span>${label}</span><select class="field" data-change="${id}">${all ? html`<option value="">${all}</option>` : ''}${opts.map(([v, l]) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`)}</select></label>`;
    return html`<div class="libbar"><label class="libsel libsearch"><span>Suchen</span><span class="ls-box">${ic('search')}<input class="field" type="search" id="libsearch" value="${query}" placeholder="Stichwort, z. B. Photosynthese" autocomplete="off" spellcheck="false" aria-label="Lektionen nach Stichwörtern durchsuchen" title="Durchsucht Titel, Fach, Schulstufe und die Texte aller Folien (Strg+F)"></span></label>${sel('fSubject', 'Fach', view.subject, 'Alle Fächer', subjects.map((s) => [s, s]))}${sel('fGrade', 'Schulstufe', view.grade, 'Alle Schulstufen', grades.map((s) => [s, s]))}${sel('fSort', 'Sortieren nach', view.sort, '', SORTS)}
      ${view.subject || view.grade ? html`<button class="btn" data-action="clearFilter">${ic('x')}Filter zurücksetzen</button>` : ''}</div>`;
  }
  // Karten; bei Sortierung nach Fach oder Schulstufe mit Gruppenüberschriften
  const gridHtml = () => html`${toolbar()}<div id="libresults">${resultsHtml()}</div>`;
  function resultsHtml() {
    const list = visible(), q = query.trim(), filtered = view.subject || view.grade;
    if (!list.length) return html`<div class="empty card">${ic('search')}<h3>${q ? `Keine Lektion enthält „${q}“` : 'Keine Lektion passt zu diesem Filter'}</h3>
      <p>${q && filtered ? 'Gesucht wurde nur in den gefilterten Lektionen. ' : ''}${q ? html`<button class="btn" data-action="clearSearch">${ic('x')}Suche löschen</button> ` : ''}${filtered ? html`<button class="btn" data-action="clearFilter">Filter zurücksetzen</button>` : ''}</p></div>`;
    const count = q ? html`<p class="libcount" role="status">${list.length} von ${lessons.length} ${lessons.length === 1 ? 'Lektion' : 'Lektionen'} ${list.length === 1 ? 'enthält' : 'enthalten'} „${q}“ <button class="btn" data-action="clearSearch">${ic('x')}Suche löschen</button></p>` : '';
    const key = view.sort === 'subject' ? 'subject' : view.sort === 'grade' ? 'grade' : '';
    if (!key) return html`${count}<div class="lgrid">${list.map(card)}</div>`;
    const groups = [];
    list.forEach((l) => { const name = (l[key] || '').trim() || (key === 'subject' ? 'Ohne Fach' : 'Ohne Schulstufe'); const g = groups[groups.length - 1]; if (g && g.name === name) g.items.push(l); else groups.push({ name, items: [l] }); });
    let i = 0;
    return html`${count}${groups.map((g) => html`<h2 class="libgroup">${g.name}<small>${g.items.length}</small></h2><div class="lgrid">${g.items.map((l) => card(l, i++))}</div>`)}`;
  }
  const paint = () => {}; // Farben stehen direkt an der Karte (siehe card)
  // Beim Tippen nur die Trefferliste neu zeichnen, damit das Suchfeld den Fokus behält
  function searchNow(v) { query = v; const box = root.querySelector('#libresults'); if (box) { box.innerHTML = String(view.tab === 'series' ? seriesResults() : resultsHtml()); paint(); } }

  // ---------- Tab „Themenserien“ ----------
  const lessonsById = () => Object.fromEntries(lessons.map((l) => [l.id, l]));
  function seriesResults() {
    const ws = words(), q = query.trim(), by = lessonsById();
    const filtered = view.sSubject || view.sGrade;
    const list = sortLessons(series.filter((s) => { if ((view.sSubject && (s.subject || '').trim() !== view.sSubject) || (view.sGrade && (s.grade || '').trim() !== view.sGrade)) return false; const hay = norm([s.title, s.subject, s.grade, s.description, ...s.cards.map((c) => (c.lesson && by[c.lesson] ? by[c.lesson].title : c.title))].join(' ')); return ws.every((w) => hay.includes(w)); }), view.sSort);
    if (!series.length) return html`<div class="empty card anim">${ic('puzzle')}<h3>Noch keine Themenserien</h3><p>Eine Themenserie ordnet Lektionen auf einer Matrix und verbindet sie mit Pfeilen – etwa als Plan für ein Kapitel oder ein Semester.</p><p><button class="btn primary" data-action="newSeries">${ic('plus')}Neue Serie</button></p></div>`;
    if (!list.length) return html`<div class="empty card">${ic('search')}<h3>${q ? `Keine Themenserie enthält „${q}“` : 'Keine Themenserie passt zu diesem Filter'}</h3><p>${q && filtered ? 'Gesucht wurde nur in den gefilterten Themenserien. ' : ''}${q ? html`<button class="btn" data-action="clearSearch">${ic('x')}Suche löschen</button> ` : ''}${filtered ? html`<button class="btn" data-action="clearSeriesFilter">Filter zurücksetzen</button>` : ''}</p></div>`;
    return html`${q ? html`<p class="libcount" role="status">${list.length} von ${series.length} ${series.length === 1 ? 'Themenserie' : 'Themenserien'} ${list.length === 1 ? 'enthält' : 'enthalten'} „${q}“ <button class="btn" data-action="clearSearch">${ic('x')}Suche löschen</button></p>` : ''}<div class="lgrid">${list.map((s, i) => { const n = s.cards.length, k = s.look || {}, c = colorOf(k.color || AUTO[i % AUTO.length]); return html`<article class="lcard serieslist anim${k.color ? ' tint' : ''}" data-color="${k.color || ''}" style="--i:${i};--lc:${c.c};--lcs:${c.s}"><div class="lc-band"></div><button type="button" class="sminibtn" data-action="openSeries" data-id="${s.id}" aria-label="Themenserie „${s.title}“ öffnen">${coverHtml(s, k, c, by)}</button><div class="lc-body">
      <div class="lc-meta">${[s.subject, s.grade].filter(Boolean).join(' · ') || 'Themenserie'}</div><h3>${s.title}</h3>
      <div class="lc-info">${ic('puzzle')}${n} ${n === 1 ? 'Karte' : 'Karten'} · geändert ${whenStr(s.updatedAt)}</div></div>
      <div class="lc-actions"><button class="btn primary" data-action="openSeries" data-id="${s.id}">${ic('edit')}Öffnen</button><button class="btn icon" data-action="moreSeries" data-id="${s.id}" title="Weitere Aktionen" aria-label="Weitere Aktionen für ${s.title}">${ic('more')}</button></div></article>`; })}</div>`;
  }
  // Kopf der Serienkarte: eigenes Bild, Grafik (Illustration/Symbol) oder – ohne Auswahl – die kleine Vorschau der Matrix
  const coverHtml = (s, k, c, by, imgSrc) => (imgSrc || k.imgv ? html`<div class="scover photo"><img src="${imgSrc || `/api/host/series/${s.id}/image?v=${k.imgv}`}" alt="" draggable="false" style="object-position:${k.pos ? k.pos.x : 50}% ${k.pos ? k.pos.y : 50}%"></div>`
    : k.graphic ? html`<div class="scover gfxc" style="${colVars(c)}">${raw(gfx(k.graphic))}</div>` : miniMap(s, by));
  // Bild für die Übersicht verkleinern (höchstens 720 px breit) und als WebP einbetten
  async function coverImage(file, sizes = [[720, 0.82], [560, 0.75], [420, 0.7]], limit = LOOK_IMAGE_MAX) {
    if (!file || !/^image\//.test(file.type)) { toast('Bitte eine Bilddatei wählen (PNG, JPG, GIF, WebP).', 'err'); return null; }
    try {
      // als data:-Adresse lesen – blob:-Adressen lässt die Sicherheitsrichtlinie der Seite (CSP) für Bilder nicht zu
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Die Datei konnte nicht gelesen werden.')); r.readAsDataURL(file); });
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Das Bild konnte nicht gelesen werden.')); im.src = url; });
      for (const [max, q] of sizes) {
        const f = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * f)); cv.height = Math.max(1, Math.round(img.height * f));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        const data = cv.toDataURL('image/webp', q).split(',')[1];
        if (data.length <= limit) return { mime: 'image/webp', data, w: cv.width, h: cv.height };
      }
      toast('Das Bild ist zu groß.', 'err'); return null;
    } catch (e) { toast(e.message, 'err'); return null; }
  }
  // ---------- Bild und Farbe einer Themenserie ----------
  function showSeriesLook(S) {
    if (!S) return;
    const k0 = S.look || {};
    // image: undefined = vorhandenes Bild behalten, null = keines, Objekt = neu gewählt
    const st = { color: k0.color || '', graphic: k0.graphic || '', image: k0.imgv ? undefined : null, pos: k0.pos ? { ...k0.pos } : { x: 50, y: 50 } };
    let tab = st.image !== null ? 'own' : st.graphic.startsWith('icon:') ? 'icon' : 'lib';
    const groups = [...new Set(LIBRARY.map((g) => g.group))], by = lessonsById();
    const hasImg = () => st.image !== null;
    const none = () => html`<button type="button" class="gopt gnone${st.graphic || hasImg() ? '' : ' on'}" data-gsel="" title="Ohne Bild – die Karte zeigt die Vorschau der Matrix">${ic('x')}<small>Ohne Bild</small></button>`;
    const pane = () => (tab === 'own'
      ? html`<div class="gown"><button type="button" class="matdrop" data-gpick="1">${ic('upload')}<span><b>${hasImg() ? 'Anderes Bild auswählen' : 'Bild auswählen'}</b><small>Klicken, hierher ziehen oder mit Strg+V einfügen (PNG, JPG, GIF, WebP). Es wird verkleinert in der Serie gespeichert.</small></span></button>
          ${hasImg() ? html`<p class="covertip">${ic('grip')}<span><b>Ausschnitt wählen:</b> Ziehe das Bild oben in der Vorschau, bis der passende Teil zu sehen ist. <button type="button" class="btn" data-center="1">Mittig</button></span></p><button type="button" class="btn" data-gsel="">${ic('trash')}Bild entfernen</button>` : ''}
          <p class="muted small">Bitte nur Bilder verwenden, die du verwenden darfst (eigene Fotos, freie Lizenzen).</p></div>`
      : tab === 'icon' ? html`<div class="gpgrid icons">${none()}${ICON_NAMES.map((n) => html`<button type="button" class="gopt${!hasImg() && st.graphic === 'icon:' + n ? ' on' : ''}" data-gsel="icon:${n}" title="${n}" aria-label="Symbol ${n}">${raw(iconGfx(n))}</button>`)}</div>`
        : html`<div class="gpgrid">${none()}${groups.map((gr) => html`<h4>${gr}</h4>${LIBRARY.filter((g) => g.group === gr).map((g) => html`<button type="button" class="gopt${!hasImg() && st.graphic === 'lib:' + g.name ? ' on' : ''}" data-gsel="lib:${g.name}" title="${g.label}">${raw(libSvg(g.name))}<small>${g.label}</small></button>`)}`)}</div>`);
    const preview = () => { const c = colorOf(st.color || 'indigo'), k = { graphic: hasImg() ? '' : st.graphic, imgv: st.image === undefined ? k0.imgv : '', pos: st.pos };
      return html`<div class="lcard serieslist lookcard${st.color ? ' tint' : ''}" style="--lc:${c.c};--lcs:${c.s}"><div class="lc-band"></div><div class="sminibtn">${coverHtml(S, k, c, by, st.image ? `data:${st.image.mime};base64,${st.image.data}` : '')}</div><div class="lc-body"><div class="lc-meta">${[S.subject, S.grade].filter(Boolean).join(' · ') || 'Themenserie'}</div><h3>${S.title}</h3></div></div>`; };
    const body = () => html`<h2>Bild und Farbe</h2><p class="ov-sub">So erscheint die Themenserie in der Übersicht.</p>
      <div class="lookbox" style="${colVars(colorOf(st.color || 'indigo'))}"><div class="looktop">${preview()}<div><div class="fl-l">Farbe</div><div class="swatches lookcols"><button type="button" class="swt auto${st.color ? '' : ' on'}" data-col="" title="Automatisch (reihum)" aria-label="Farbe automatisch"></button>${COLOR_NAMES.map((n) => html`<button type="button" class="swt${st.color === n ? ' on' : ''}" style="--sw:${COLORS[n].c}" data-col="${n}" title="${COLORS[n].name}" aria-label="Farbe ${COLORS[n].name}"></button>`)}</div></div></div>
        <div class="fl-l">Bild</div><div class="segctl gtabs"><button type="button" class="${tab === 'lib' ? 'on' : ''}" data-gtab="lib">${ic('spark')}Illustrationen</button><button type="button" class="${tab === 'icon' ? 'on' : ''}" data-gtab="icon">${ic('star')}Symbole</button><button type="button" class="${tab === 'own' ? 'on' : ''}" data-gtab="own">${ic('upload')}Eigenes Bild</button></div>
        <div class="gpane lookpane short">${pane()}</div></div>
      <input type="file" id="slFile" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-look="save">${ic('check')}Übernehmen</button></div>`;
    const box = overlay(body(), { wide: true });
    const redraw = () => { const p = box.querySelector('.lookpane'), top = p ? p.scrollTop : 0; box.innerHTML = String(body()); const q = box.querySelector('.lookpane'); if (q) q.scrollTop = top; };
    const useFile = async (f) => { const im = await coverImage(f); if (im) { st.image = im; st.graphic = ''; st.pos = { x: 50, y: 50 }; tab = 'own'; redraw(); } };
    // Ausschnitt: das Bild in der Vorschau ziehen. Verschoben wird nur in der Richtung, in der das Bild übersteht.
    box.addEventListener('pointerdown', (e) => {
      const img = e.target.closest('.lookcard .scover.photo img');
      if (!img || !img.naturalWidth) return;
      e.preventDefault();
      const r = img.getBoundingClientRect(), sc = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const overX = img.naturalWidth * sc - r.width, overY = img.naturalHeight * sc - r.height, x0 = e.clientX, y0 = e.clientY, p0 = { ...st.pos };
      const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
      const mv = (ev) => { st.pos = { x: overX > 1 ? clamp(p0.x - ((ev.clientX - x0) / overX) * 100) : p0.x, y: overY > 1 ? clamp(p0.y - ((ev.clientY - y0) / overY) * 100) : p0.y }; img.style.objectPosition = `${st.pos.x}% ${st.pos.y}%`; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); img.classList.remove('moving'); };
      img.classList.add('moving');
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
    box.addEventListener('click', async (e) => {
      const col = e.target.closest('[data-col]'), g = e.target.closest('[data-gsel]'), t = e.target.closest('[data-gtab]');
      if (col) { st.color = col.dataset.col; redraw(); }
      else if (e.target.closest('[data-center]')) { st.pos = { x: 50, y: 50 }; redraw(); }
      else if (e.target.closest('[data-gpick]')) box.querySelector('#slFile').click();
      else if (g) { st.graphic = g.dataset.gsel; st.image = null; redraw(); }
      else if (t) { tab = t.dataset.gtab; redraw(); }
      else if (e.target.closest('[data-look="save"]')) {
        const body2 = { color: st.color, graphic: st.graphic, pos: st.pos };
        if (st.image !== undefined) body2.image = st.image;
        try { const r = await api(`/series/${S.id}/look`, { method: 'PUT', body: body2 }); S.look = r.look; closeOv(); render(); } catch (err) { toast(err.message, 'err'); }
      }
    });
    box.addEventListener('change', (e) => { if (e.target.id === 'slFile') useFile(e.target.files && e.target.files[0]); });
    box.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    box.addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); useFile(e.dataTransfer.files[0]); });
    const onPaste = (e) => { if (!document.body.contains(box)) { document.removeEventListener('paste', onPaste); return; } const f = [...((e.clipboardData && e.clipboardData.files) || [])][0]; if (f) { e.preventDefault(); useFile(f); } };
    document.addEventListener('paste', onPaste);
  }
  const seriesHtml = () => html`${series.length ? html`<div class="libbar"><label class="libsel libsearch"><span>Suchen</span><span class="ls-box">${ic('search')}<input class="field" type="search" id="libsearch" value="${query}" placeholder="Titel der Serie oder einer Karte" autocomplete="off" spellcheck="false" aria-label="Themenserien durchsuchen"></span></label>${seriesFilters()}</div>` : ''}<div id="libresults">${seriesResults()}</div>`;
  // Filter der Themenserien: Fach, Schulstufe, Sortierung (eigene Auswahl, unabhängig von den Lektionen)
  function seriesFilters() {
    const subjects = distinctOf(series, 'subject', de), grades = distinctOf(series, 'grade', byGrade);
    if (view.sSubject && !subjects.includes(view.sSubject)) view.sSubject = '';
    if (view.sGrade && !grades.includes(view.sGrade)) view.sGrade = '';
    const sel = (id, label, cur, all, opts) => html`<label class="libsel"><span>${label}</span><select class="field" data-change="${id}">${all ? html`<option value="">${all}</option>` : ''}${opts.map(([v, l]) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`)}</select></label>`;
    return html`${sel('sfSubject', 'Fach', view.sSubject, 'Alle Fächer', subjects.map((s) => [s, s]))}${sel('sfGrade', 'Schulstufe', view.sGrade, 'Alle Schulstufen', grades.map((s) => [s, s]))}${sel('sfSort', 'Sortieren nach', view.sSort, '', SORTS)}
      ${view.sSubject || view.sGrade ? html`<button class="btn" data-action="clearSeriesFilter">${ic('x')}Filter zurücksetzen</button>` : ''}`;
  }
  const tabsHtml = () => html`<div class="libtabs" role="tablist">${[['lessons', 'Lektionen', 'book', lessons.length], ['series', 'Themenserien', 'puzzle', series.length]].map(([k, l, i, n]) => html`<button type="button" role="tab" aria-selected="${view.tab === k ? 'true' : 'false'}" class="libtab${view.tab === k ? ' on' : ''}" data-action="tab" data-v="${k}">${ic(i)}${l}<small>${n}</small></button>`)}</div>`;
  function render() {
    root.innerHTML = String(html`<div id="app" class="library"><header class="libhead"><div class="brand">${raw(logo())}<span class="chap">Plenum</span></div>${tabsHtml()}<div class="hspace"></div>
      <button class="hbtn" data-action="help">${ic('info')}<span>Hilfe</span></button><button class="hbtn" data-action="settings">${ic('settings')}<span>Einstellungen</span></button></header>
      <main class="libmain"><div class="wrap">
        ${presenting ? html`<div class="hint anim">${ic('play')}<span>Eine Präsentation läuft gerade.</span><button class="btn primary" data-action="resume">Zurück zur Präsentation</button></div>` : ''}
        <div class="libtop"><div><h1>${view.tab === 'series' ? 'Meine Themenserien' : 'Meine Lektionen'}</h1><p class="sub">${view.tab === 'series' ? 'Ordne Lektionen auf einer Matrix zu einem Plan und verbinde sie mit Pfeilen.' : 'Erstelle Folien, Aufgaben und Umfragen – oder lass eine KI eine Lektion vorbereiten.'}</p></div>
          <div class="libbtns">${view.tab === 'series' ? html`<button class="btn primary big" data-action="newSeries">${ic('plus')}Neue Serie</button><button class="btn big" data-action="aiSeries" title="Eine KI schlägt die Abfolge der Themen vor – als Platzhalter-Karten, ohne Inhalte">${ic('sparkles')}Mit KI planen</button>` : html`<button class="btn primary big" data-action="new">${ic('plus')}Neue Lektion</button><button class="btn big" data-action="ai">${ic('sparkles')}Mit KI erstellen</button>`}<button class="btn big" data-action="import">${ic('upload')}Importieren</button></div></div>
        ${view.tab === 'series' ? seriesHtml() : lessons.length ? gridHtml() : html`<div class="empty card anim">${ic('book')}<h3>Noch keine Lektionen</h3><p>Lege eine neue Lektion an, importiere eine .plenum-Datei oder lass eine KI eine Lektion vorbereiten.</p></div>`}
        <div class="libfoot"><button class="btn" data-action="backup">${ic('download')}Alle Lektionen sichern</button><span class="muted">Gespeichert in: ${info.lessonsDir}</span>${window.plenumApp?.openPath ? html`<button class="btn" data-action="openDir">${ic('file')}Ordner öffnen</button>` : ''}</div>
      </div></main></div>`);
    paint();
    const inp = root.querySelector('#libsearch');
    if (inp) inp.addEventListener('input', () => searchNow(inp.value));
  }
  // Strg+F springt ins Suchfeld
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { const inp = root.querySelector('#libsearch'); if (inp && !document.getElementById('ov').innerHTML) { e.preventDefault(); inp.focus(); inp.select(); } } };
  document.addEventListener('keydown', onKey);
  undel.push(() => document.removeEventListener('keydown', onKey));

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

  // ---------- Farbe und Symbol der Karte ----------
  function showLook(L) {
    if (!L) return;
    const k0 = L.card || {};
    // image: undefined = vorhandenes Bild behalten, null = keines, Objekt = neu gewählt
    const sel = { color: k0.color || '', graphic: k0.graphic || '', image: k0.imgv ? undefined : null, pos: k0.pos ? { ...k0.pos } : { x: 50, y: 50 } };
    const hasImg = () => sel.image !== null;
    const imgSrc = () => (sel.image ? `data:${sel.image.mime};base64,${sel.image.data}` : `/api/host/lessons/${L.id}/cardimage?v=${k0.imgv}`);
    let tab = hasImg() ? 'own' : sel.graphic.startsWith('icon:') ? 'icon' : 'lib';
    const groups = [...new Set(LIBRARY.map((g) => g.group))];
    const none = () => html`<button type="button" class="gopt gnone${sel.graphic || hasImg() ? '' : ' on'}" data-gsel="" title="Ohne Grafik">${ic('x')}<small>Ohne Grafik</small></button>`;
    const pane = () => (tab === 'own'
      ? html`<div class="gown"><button type="button" class="matdrop" data-gpick="1">${ic('upload')}<span><b>${hasImg() ? 'Anderes Bild auswählen' : 'Bild auswählen'}</b><small>Klicken, hierher ziehen oder mit Strg+V einfügen (PNG, JPG, GIF, WebP). Es erscheint klein rechts oben auf der Karte.</small></span></button>
          ${hasImg() ? html`<p class="covertip">${ic('grip')}<span><b>Ausschnitt wählen:</b> Ziehe das Bild oben in der Vorschau, bis der passende Teil zu sehen ist. <button type="button" class="btn" data-center="1">Mittig</button></span></p><button type="button" class="btn" data-gsel="">${ic('trash')}Bild entfernen</button>` : ''}
          <p class="muted small">Bitte nur Bilder verwenden, die du verwenden darfst (eigene Fotos, freie Lizenzen).</p></div>`
      : tab === 'icon'
      ? html`<div class="gpgrid icons">${none()}${ICON_NAMES.map((n) => html`<button type="button" class="gopt${sel.graphic === 'icon:' + n ? ' on' : ''}" data-gsel="icon:${n}" title="${n}" aria-label="Symbol ${n}">${raw(iconGfx(n))}</button>`)}</div>`
      : html`<div class="gpgrid">${none()}${groups.map((gr) => html`<h4>${gr}</h4>${LIBRARY.filter((g) => g.group === gr).map((g) => html`<button type="button" class="gopt${sel.graphic === 'lib:' + g.name ? ' on' : ''}" data-gsel="lib:${g.name}" title="${g.label}">${raw(libSvg(g.name))}<small>${g.label}</small></button>`)}`)}</div>`);
    const preview = () => { const c = colorOf(sel.color || 'indigo'); return html`<div class="lcard lookcard${sel.color ? ' tint' : ''}" style="--lc:${c.c};--lcs:${c.s}"><div class="lc-band"></div><div class="lc-body"><div class="lc-top"><div class="lc-tt"><div class="lc-meta">${[L.subject, L.grade].filter(Boolean).join(' · ') || 'Lektion'}</div><h3>${L.title}</h3></div>${hasImg() ? html`<span class="lc-gfx photo">${cardImg(imgSrc(), sel.pos)}</span>` : sel.graphic ? html`<span class="lc-gfx">${raw(gfx(sel.graphic))}</span>` : ''}</div></div></div>`; };
    const body = () => html`<h2>Farbe und Bild</h2><p class="ov-sub">So erscheint die Lektion in der Übersicht. An den Folien ändert sich nichts.</p>
      <div class="lookbox" style="${colVars(colorOf(sel.color || 'indigo'))}"><div class="looktop">${preview()}<div><div class="fl-l">Farbe</div><div class="swatches lookcols"><button type="button" class="swt auto${sel.color ? '' : ' on'}" data-col="" title="Automatisch (reihum)" aria-label="Farbe automatisch"></button>${COLOR_NAMES.map((n) => html`<button type="button" class="swt${sel.color === n ? ' on' : ''}" style="--sw:${COLORS[n].c}" data-col="${n}" title="${COLORS[n].name}" aria-label="Farbe ${COLORS[n].name}"></button>`)}</div></div></div>
        <div class="fl-l">Grafik</div><div class="segctl gtabs"><button type="button" class="${tab === 'lib' ? 'on' : ''}" data-gtab="lib">${ic('spark')}Illustrationen</button><button type="button" class="${tab === 'icon' ? 'on' : ''}" data-gtab="icon">${ic('star')}Symbole</button><button type="button" class="${tab === 'own' ? 'on' : ''}" data-gtab="own">${ic('upload')}Eigenes Bild</button></div>
        <div class="gpane lookpane">${pane()}</div></div>
      <input type="file" id="lcFile" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-look="save">${ic('check')}Übernehmen</button></div>`;
    const box = overlay(body(), { wide: true });
    const redraw = () => { const p = box.querySelector('.lookpane'), top = p ? p.scrollTop : 0; box.innerHTML = String(body()); const q = box.querySelector('.lookpane'); if (q) q.scrollTop = top; };
    // klein genug für die Karte: höchstens 320 px
    const useFile = async (f) => { const im = await coverImage(f, [[320, 0.85], [240, 0.8], [180, 0.75]], CARD_IMAGE_MAX); if (im) { sel.image = im; sel.graphic = ''; sel.pos = { x: 50, y: 50 }; tab = 'own'; redraw(); } };
    cropDrag(box, '.lookcard .lc-gfx.photo img', sel);
    box.addEventListener('click', async (e) => {
      const col = e.target.closest('[data-col]'), g = e.target.closest('[data-gsel]'), t = e.target.closest('[data-gtab]');
      if (col) { sel.color = col.dataset.col; redraw(); }
      else if (e.target.closest('[data-center]')) { sel.pos = { x: 50, y: 50 }; redraw(); }
      else if (e.target.closest('[data-gpick]')) box.querySelector('#lcFile').click();
      else if (g) { sel.graphic = g.dataset.gsel; sel.image = null; redraw(); } else if (t) { tab = t.dataset.gtab; redraw(); } else if (e.target.closest('[data-look="save"]')) {
        const body2 = { color: sel.color, graphic: sel.graphic, pos: sel.pos };
        if (sel.image !== undefined) body2.image = sel.image;
        try { const r = await api(`/lessons/${L.id}/card`, { method: 'PUT', body: body2 }); L.card = r.card; closeOv(); render(); } catch (err) { toast(err.message, 'err'); }
      }
    });
    box.addEventListener('change', (e) => { if (e.target.id === 'lcFile') useFile(e.target.files && e.target.files[0]); });
    box.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    box.addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); useFile(e.dataTransfer.files[0]); });
    const onPaste = (e) => { if (!document.body.contains(box)) { document.removeEventListener('paste', onPaste); return; } const f = [...((e.clipboardData && e.clipboardData.files) || [])][0]; if (f) { e.preventDefault(); useFile(f); } };
    document.addEventListener('paste', onPaste);
  }

  // ---------- Import ----------
  function showImport(prefill = '') {
    const box = overlay(html`<div class="ov-ic">${ic('upload')}</div><h2>Lektion importieren</h2><p class="ov-sub">Eine Lektion (.plenum) oder Themenserie (.plenumserie) wählen – oder den Text einer KI-Antwort bzw. Lektion einfügen.</p>
      <label class="filepick btn big">${ic('file')}Datei wählen …<input type="file" accept=".plenum,.plenumserie,.json,application/json" data-change="importFile" hidden></label>
      <textarea class="field mono" rows="8" id="impText" placeholder="… oder hier einfügen">${prefill}</textarea>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-action="parseImport">${ic('search')}Prüfen</button></div>`, { wide: true });
    box.querySelector('textarea').focus();
  }
  async function parseAndPreview(text) {
    let r;
    try { r = await api('/import/parse', { method: 'POST', body: { text } }); } catch (e) { return toast(e.message, 'err'); }
    if (r.single && r.series) { // Themenserie samt Lektionen
      const S = r.series[0], n = r.bundle.length;
      pending = { bundle: r.bundle.map((x) => x.lesson), series: r.series };
      overlay(html`<div class="ov-ic">${ic('puzzle')}</div><h2>${S.title}</h2><p class="ov-sub">Themenserie mit ${S.cards.length} ${S.cards.length === 1 ? 'Karte' : 'Karten'} und ${n} ${n === 1 ? 'Lektion' : 'Lektionen'}. Lektionen, die es hier schon gibt, werden nicht überschrieben, sondern als Kopie angelegt.</p><div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-action="commitBundle">${ic('check')}Importieren</button></div>`);
      return;
    }
    if (r.bundle) {
      const ns = (r.series || []).length;
      overlay(html`<h2>Sicherung importieren</h2><p class="ov-sub">${r.bundle.length} Lektionen${ns ? ` und ${ns} ${ns === 1 ? 'Themenserie' : 'Themenserien'}` : ''} gefunden. Vorhandene Lektionen werden nicht überschrieben (Kopien).</p><div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-action="commitBundle">Importieren</button></div>`);
      pending = { bundle: r.bundle.map((x) => x.lesson), series: (r.series || []).length ? r.series : null, backup: true };
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
    clearSeriesFilter: () => { view.sSubject = ''; view.sGrade = ''; saveView(); render(); },
    tab: (el) => { if (view.tab === el.dataset.v) return; view.tab = el.dataset.v === 'series' ? 'series' : 'lessons'; query = ''; saveView(); render(); },
    newSeries: async () => { try { const S = await api('/series', { method: 'POST', body: {} }); onSeries(S.id); } catch (e) { toast(e.message, 'err'); } },
    openSeries: (el) => onSeries(el.dataset.id),
    aiSeries: async () => { const { showAiSeries } = await import('./aiseries.js'); showAiSeries({ api, onCreated: (S) => { toast(`„${S.title}“ angelegt – Karten jetzt mit Präsentationen füllen`); onSeries(S.id); } }); },
    moreSeries: (el) => {
      const S = series.find((x) => x.id === el.dataset.id);
      overlay(html`<h2>${S.title}</h2><div class="menu"><button class="btn" data-action="lookSeries" data-id="${S.id}">${ic('star')}Bild und Farbe …</button><button class="btn" data-action="dupSeries" data-id="${S.id}">${ic('copy')}Duplizieren</button><button class="btn" data-action="exportSeries" data-id="${S.id}">${ic('download')}Exportieren (mit allen Lektionen)</button><button class="btn" data-action="planSeries" data-id="${S.id}">${ic('file')}Als PDF exportieren (Tabelle) …</button><button class="btn" data-action="imageSeries" data-id="${S.id}">${ic('monitor')}Matrix als Bild speichern …</button><button class="btn danger" data-action="delSeries" data-id="${S.id}">${ic('trash')}Löschen</button></div>`);
    },
    lookSeries: (el) => showSeriesLook(series.find((x) => x.id === el.dataset.id)),
    dupSeries: async (el) => { closeOv(); try { await api(`/series/${el.dataset.id}/duplicate`, { method: 'POST' }); toast('Kopie angelegt'); load(); } catch (e) { toast(e.message, 'err'); } },
    exportSeries: (el) => { closeOv(); download(`/series/${el.dataset.id}/export`); },
    planSeries: async (el) => { const S = series.find((x) => x.id === el.dataset.id); closeOv(); if (!S.cards.length) return toast('Die Serie hat noch keine Karten.'); const { exportSeriesImage } = await import('./series.js'); exportSeriesImage({ id: S.id, title: S.title, plan: true }); },
    imageSeries: async (el) => { const S = series.find((x) => x.id === el.dataset.id); closeOv(); if (!S.cards.length) return toast('Die Serie hat noch keine Karten.'); const { exportSeriesImage } = await import('./series.js'); exportSeriesImage({ id: S.id, title: S.title }); },
    delSeries: async (el) => {
      const S = series.find((x) => x.id === el.dataset.id);
      if (!(await ask(`Themenserie „${S.title}“ löschen?`, 'Nur die Serie wird gelöscht. Die Lektionen darin bleiben erhalten.', { ok: 'Löschen', danger: true }))) return;
      try { await api(`/series/${S.id}`, { method: 'DELETE' }); toast('Gelöscht'); load(); } catch (e) { toast(e.message, 'err'); }
    },
    clearSearch: () => { query = ''; render(); const inp = root.querySelector('#libsearch'); if (inp) inp.focus(); },
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
      overlay(html`<h2>${L.title}</h2><div class="menu"><button class="btn" data-action="look" data-id="${L.id}">${ic('star')}Farbe und Bild …</button><button class="btn" data-action="dup" data-id="${L.id}">${ic('copy')}Duplizieren</button><button class="btn" data-action="export" data-id="${L.id}">${ic('download')}Exportieren (.plenum)</button><button class="btn" data-action="pdf" data-id="${L.id}">${ic('file')}Als PDF exportieren …</button>
        <button class="btn" data-action="aiRevise" data-id="${L.id}">${ic('sparkles')}Mit KI überarbeiten</button><button class="btn danger" data-action="del" data-id="${L.id}">${ic('trash')}Löschen</button></div>`);
    },
    look: (el) => showLook(lessons.find((x) => x.id === el.dataset.id)),
    dup: async (el) => { closeOv(); try { await api(`/lessons/${el.dataset.id}/duplicate`, { method: 'POST' }); toast('Kopie angelegt'); load(); } catch (e) { toast(e.message, 'err'); } },
    export: (el) => { closeOv(); download(`/lessons/${el.dataset.id}/export`); },
    pdf: async (el) => { const L = lessons.find((x) => x.id === el.dataset.id); closeOv(); const { showPdfExport } = await import('./pdf.js'); showPdfExport({ api, lessonId: L.id, title: L.title, live: presenting === L.id }); },
    del: async (el) => {
      const L = lessons.find((x) => x.id === el.dataset.id);
      const inSeries = series.filter((s) => s.cards.some((c) => c.lesson === L.id)).map((s) => `„${s.title}“`);
      if (!(await ask(`„${L.title}“ löschen?`, `Die Lektion und ihre gespeicherten Stände werden gelöscht. Das lässt sich nicht rückgängig machen.${inSeries.length ? ` Sie ist Teil der ${inSeries.length === 1 ? 'Themenserie' : 'Themenserien'} ${inSeries.join(', ')} – ihre Karte bleibt dort als Platzhalter stehen.` : ''}`, { ok: 'Löschen', danger: true }))) return;
      try { await api(`/lessons/${L.id}`, { method: 'DELETE' }); toast('Gelöscht'); load(); } catch (e) { toast(e.message, 'err'); }
    },
    import: () => showImport(),
    parseImport: () => { const t = document.getElementById('impText').value; if (t.trim()) parseAndPreview(t); },
    commit: async (el) => {
      try { const L = await api('/import/commit', { method: 'POST', body: { lesson: pending.lesson, mode: el.dataset.mode } }); closeOv(); toast(`„${L.title}“ importiert`); load(); } catch (e) { toast(e.message, 'err'); }
    },
    commitBundle: async () => {
      try {
        const body = { lessons: pending.bundle, mode: pending.backup ? 'copy' : 'new' };
        if (pending.series) body.series = pending.series;
        await api('/import/commit', { method: 'POST', body });
        closeOv(); toast(pending.backup ? 'Sicherung importiert' : 'Themenserie importiert');
        if (pending.series && !pending.backup) { view.tab = 'series'; saveView(); }
        load();
      } catch (e) { toast(e.message, 'err'); }
    },
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
    sfSubject: (el) => { view.sSubject = el.value; saveView(); render(); },
    sfGrade: (el) => { view.sGrade = el.value; saveView(); render(); },
    sfSort: (el) => { view.sSort = el.value; saveView(); render(); },
    importFile: (el) => { const f = el.files && el.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => parseAndPreview(String(rd.result)); rd.readAsText(f); },
  };
  undel.push(delegate(document.body, 'click', actions), delegate(document.body, 'change', change, 'change'));
  load();
  return { destroy() { undel.forEach((f) => f()); }, reload: load };
}
