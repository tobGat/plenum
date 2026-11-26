// Dialog „Als PDF exportieren“: Inhalt (nur Fragen, mit Lösungen, mit Ergebnissen eines Stands) und Format wählen.
// Das PDF erzeugt der Hauptprozess aus der Druckseite /print (main/main.js, exportPdf).
import { html, toast, whenStr } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { overlay, closeOv } from '../core/overlay.js';

const KEY = 'plenum.pdf';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* kein Speicher */ } };
const SUFFIX = { blank: '', solution: ' – Lösungen', results: ' – Ergebnisse' };

// live: Die Lektion wird gerade präsentiert → der aktuelle Stand steht als „Aktuelle Präsentation“ zur Wahl.
// preset: { variant, state } wählt etwas vor (z. B. „Ergebnisse als PDF“ aus der Präsentation).
export async function showPdfExport({ api, lessonId, title, live = false, preset = {} }) {
  if (!window.plenumApp || !window.plenumApp.exportPdf) { toast('Der PDF-Export ist nur in der Plenum-App verfügbar.', 'err'); return; }
  let states = [];
  try { states = await api(`/states/${lessonId}`); } catch { /* keine */ }
  if (live) states = [{ id: '_live', name: 'Aktuelle Präsentation', savedAt: '', votes: null }, ...states];
  const P = { variant: 'blank', format: 'slides', notes: true, light: false, ...loadPrefs(), ...preset };
  if (P.variant === 'results' && !states.length) P.variant = 'blank';
  let state = preset.state && states.some((x) => x.id === preset.state) ? preset.state : states[0] ? states[0].id : '';
  let busy = false;

  const radio = (name, value, label, sub, dis) => html`<label class="radio${dis ? ' dis' : ''}"><input type="radio" name="${name}" value="${value}" ${P[name] === value ? 'checked' : ''} ${dis ? 'disabled' : ''}><span><b>${label}</b><small>${sub}</small></span></label>`;
  const box = overlay(html`<div class="ov-ic">${ic('download')}</div><h2>Als PDF exportieren</h2><p class="ov-sub">„${title}“</p>
    <div class="pdfform">
      <div class="pdfcol"><h3>Inhalt</h3>
        ${radio('variant', 'blank', 'Nur die Fragen', 'Ohne Lösungen und Antworten – zum Austeilen oder zum Präsentieren ohne Plenum')}
        ${radio('variant', 'solution', 'Mit Lösungen', 'Richtige Antworten markiert, Lücken gefüllt, Erklärungen sichtbar')}
        ${radio('variant', 'results', 'Mit Ergebnissen', states.length ? 'Diagramme und Auswertungen der Klasse aus einem Stand' : 'Noch kein gespeicherter Stand zu dieser Lektion', !states.length)}
        <div id="pdfStateRow" hidden><select class="field" id="pdfState" aria-label="Stand">${states.map((x) => html`<option value="${x.id}" ${x.id === state ? 'selected' : ''}>${x.name}${x.savedAt ? ` · ${whenStr(x.savedAt)}` : ''}${x.votes != null ? ` · ${x.votes} Antworten` : ''}</option>`)}</select>
          <small class="muted">Enthält Antworten der Klasse, aber keine Namen. Begriffe und Texte erscheinen nur, soweit sie freigegeben sind.</small></div>
      </div>
      <div class="pdfcol"><h3>Format</h3>
        ${radio('format', 'slides', 'Präsentation', 'Eine Folie pro Seite, Querformat 16:9 wie am Beamer')}
        ${radio('format', 'handout', 'Handzettel', 'A4 hoch, drei Folien pro Seite mit Platz für Notizen')}
        <label class="fl fl-check" id="pdfNotesRow"><input type="checkbox" id="pdfNotes" ${P.notes ? 'checked' : ''}><span class="sw"></span><span>Notizen für die Lehrkraft dazuschreiben</span></label>
        <label class="fl fl-check"><input type="checkbox" id="pdfLight" ${P.light ? 'checked' : ''}><span class="sw"></span><span>Druckfreundlich: helles Design <small class="muted">– spart Toner bei dunklen Designs</small></span></label>
      </div>
    </div>
    <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" id="pdfGo">${ic('download')}PDF erstellen</button></div>`, { wide: true });

  const $ = (sel) => box.querySelector(sel);
  const sync = () => { $('#pdfStateRow').hidden = P.variant !== 'results'; $('#pdfNotesRow').hidden = P.format !== 'handout'; };
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'variant') P.variant = t.value;
    else if (t.name === 'format') { P.format = t.value; if (t.value === 'handout' && !('lightTouched' in P)) { P.light = true; $('#pdfLight').checked = true; } }
    else if (t.id === 'pdfState') state = t.value;
    else if (t.id === 'pdfNotes') P.notes = t.checked;
    else if (t.id === 'pdfLight') { P.light = t.checked; P.lightTouched = true; }
    sync();
  });
  sync();

  $('#pdfGo').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const go = $('#pdfGo'); go.disabled = true; go.innerHTML = String(html`<span class="dotspin"></span>PDF wird erstellt …`);
    const { lightTouched, ...keep } = P; savePrefs({ variant: keep.variant === 'results' ? 'blank' : keep.variant, format: keep.format, notes: keep.notes, light: keep.format === 'handout' ? undefined : keep.light });
    const st = states.find((x) => x.id === state);
    const name = `${title}${SUFFIX[P.variant]}${P.variant === 'results' && st && st.id !== '_live' && st.id !== '_auto' ? ` ${st.name}` : ''}${P.format === 'handout' ? ' – Handzettel' : ''}`;
    let r;
    try { r = await window.plenumApp.exportPdf({ lesson: lessonId, variant: P.variant, state: P.variant === 'results' ? state : '', format: P.format, notes: P.format === 'handout' && P.notes, light: P.light, name }); } catch (e) { r = { ok: false, error: e.message }; }
    busy = false;
    if (r && r.ok) {
      closeOv();
      overlay(html`<div class="ov-ic">${ic('check')}</div><h2>PDF gespeichert</h2><p class="ov-sub">${r.slides} ${r.slides === 1 ? 'Folie' : 'Folien'} · ${r.path}</p>
        ${r.over && r.over.length ? html`<div class="hint">${ic('info')}<span>${r.over.length === 1 ? 'Eine Folie ist' : `${r.over.length} Folien sind`} sehr voll und im PDF unten abgeschnitten: ${r.over.slice(0, 4).join(', ')}${r.over.length > 4 ? ' …' : ''}</span></div>` : ''}
        <div class="ov-actions"><button class="btn" data-action="close">Schließen</button><button class="btn primary" id="pdfOpen">${ic('file')}PDF öffnen</button></div>`)
        .querySelector('#pdfOpen').addEventListener('click', () => { window.plenumApp.openPdf(); closeOv(); });
    } else {
      go.disabled = false; go.innerHTML = String(html`${ic('download')}PDF erstellen`);
      if (!r || !r.canceled) toast((r && r.error) || 'Das PDF konnte nicht erstellt werden.', 'err');
    }
  });
}
