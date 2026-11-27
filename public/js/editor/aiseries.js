// Themenserie mit KI planen: Plenum schreibt den Auftrag für einen KI-Chat; aus der Antwort entstehen Platzhalter-Karten
// in passender Reihenfolge. Inhalte erstellt die KI dabei nicht – jede Karte wird später mit einer Präsentation gefüllt.
import { html, toast, copyText } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { overlay, closeOv } from '../core/overlay.js';
import { buildSeriesPrompt, PLAN_MAX } from '/shared/seriesplan.js';

const KEY = 'plenum.aiseries';
const CHATS = 'z. B. ChatGPT, Microsoft Copilot, Gemini, Claude oder den KI-Chat deiner Schule';
const on = (box, handlers) => { box.addEventListener('click', (e) => { const b = e.target.closest('[data-ai]'); if (b && box.contains(b) && handlers[b.dataset.ai]) { e.preventDefault(); handlers[b.dataset.ai](b); } }); return box; };

export function showAiSeries({ api, onCreated }) {
  const P = { topic: '', subject: '', grade: '', count: 8, notes: '', branch: false };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* Standard */ }
  let answer = '';

  function form() {
    const box = overlay(html`<div class="ov-ic">${ic('sparkles')}</div><h2>Themenserie mit KI planen</h2>
      <p class="ov-sub">Plenum schreibt einen Auftrag (Prompt) für einen KI-Chat deiner Wahl. Aus der Antwort entsteht eine Matrix mit Platzhalter-Karten in passender Reihenfolge – noch ohne Inhalte. Jede Karte füllst du später mit einer Präsentation. Plenum selbst sendet dabei nichts ins Internet.</p>
      <div class="aiform">
        <label class="fl span2"><span class="fl-l">Thema der Serie<i class="req">*</i></span><input class="field" id="asTopic" maxlength="200" value="${P.topic}" placeholder="z. B. Bruchrechnen, Die Zelle, Erster Weltkrieg, Erörterung schreiben"></label>
        <label class="fl"><span class="fl-l">Fach</span><input class="field" id="asSubject" maxlength="40" value="${P.subject}" placeholder="z. B. Mathematik"></label>
        <label class="fl"><span class="fl-l">Schulstufe / Klasse</span><input class="field" id="asGrade" maxlength="40" value="${P.grade}" placeholder="z. B. 6. Schulstufe"></label>
        <label class="fl span2"><span class="fl-l">Anzahl Themen <small class="muted">– ein Thema ist eine Unterrichtseinheit</small></span><input class="field" id="asCount" type="number" min="2" max="${PLAN_MAX}" value="${P.count}" style="max-width:120px"></label>
        <label class="fl fl-check span2"><input type="checkbox" id="asBranch" ${P.branch ? 'checked' : ''}><span class="sw"></span><span><b>Verzweigungen zulassen</b> <span class="muted">– parallele Themen, die in beliebiger Reihenfolge möglich sind. Ohne Haken entsteht eine einfache Abfolge.</span></span></label>
        <label class="fl span2"><span class="fl-l">Wünsche (optional)</span><textarea class="field" id="asNotes" rows="2" maxlength="600" placeholder="z. B. mit Wiederholung vor der Schularbeit, Lehrplanbezug, ein Projekt am Ende">${P.notes}</textarea></label>
      </div>
      <div class="ov-actions"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-ai="next">${ic('arrow')}Prompt erstellen</button></div>`, { wide: true });
    box.querySelector('#asTopic').focus();
    on(box, { next: () => {
      const v = (id) => box.querySelector(id).value.trim();
      P.topic = v('#asTopic'); P.subject = v('#asSubject'); P.grade = v('#asGrade'); P.notes = v('#asNotes');
      P.count = Math.max(2, Math.min(PLAN_MAX, parseInt(v('#asCount'), 10) || 8));
      P.branch = box.querySelector('#asBranch').checked;
      if (!P.topic) { toast('Bitte ein Thema angeben', 'err'); box.querySelector('#asTopic').focus(); return; }
      try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* egal */ }
      step2();
    } });
  }
  function step2() {
    const prompt = buildSeriesPrompt(P);
    const box = overlay(html`<div class="ov-ic">${ic('sparkles')}</div><h2>Prompt kopieren und Antwort einfügen</h2>
      <ol class="aisteps">
        <li><div class="ais-h"><b>Prompt kopieren</b><span class="ais-a"><button class="btn primary" data-ai="copy">${ic('copy')}Prompt kopieren</button></span></div>
          <details class="aiprompt"><summary>Prompt ansehen (${prompt.length.toLocaleString('de-AT')} Zeichen)</summary><textarea class="field mono" rows="7" readonly>${prompt}</textarea></details></li>
        <li><b>In einem KI-Chat einfügen und absenden</b><small class="muted">${CHATS}. Antwortet der Chat ohne JSON-Block, bitte ihn: „Bitte nur den JSON-Codeblock ausgeben.“</small></li>
        <li><b>Die komplette Antwort kopieren und hier einfügen</b><textarea class="field mono" rows="6" id="asAnswer" placeholder="Antwort des KI-Chats hier einfügen …">${answer}</textarea></li>
      </ol>
      <div class="ov-actions"><button class="btn" data-ai="back">${ic('arrowl')}Zurück</button><button class="btn primary" data-ai="parse">${ic('search')}Antwort prüfen</button></div>`, { wide: true });
    const ta = box.querySelector('.aiprompt textarea');
    on(box, {
      copy: async (b) => { const ok = await copyText(prompt, ta); toast(ok ? 'Prompt kopiert – jetzt im KI-Chat einfügen' : 'Kopieren nicht möglich – bitte im Feld markieren und kopieren', ok ? 'ok' : 'err'); if (ok) b.classList.add('done'); else box.querySelector('.aiprompt').open = true; },
      back: () => { answer = box.querySelector('#asAnswer').value; form(); },
      parse: () => { answer = box.querySelector('#asAnswer').value; if (!answer.trim()) { toast('Bitte zuerst die Antwort des KI-Chats einfügen', 'err'); box.querySelector('#asAnswer').focus(); return; } check(); },
    });
  }
  async function check() {
    let r;
    try { r = await api('/series/plan', { method: 'POST', body: { text: answer, subject: P.subject, grade: P.grade, linear: !P.branch } }); } catch (e) { return toast(e.message, 'err'); }
    const S = r.series;
    const box = overlay(html`<div class="ov-ic">${ic(S ? 'check' : 'alert')}</div><h2>${S ? S.title : 'Die Antwort konnte nicht gelesen werden'}</h2>
      ${S ? html`<p class="ov-sub">${S.cards.length} Themen als Platzhalter, ${S.links.length} ${S.links.length === 1 ? 'Pfeil' : 'Pfeile'}${S.subject ? ` · ${S.subject}` : ''}${S.grade ? ` · ${S.grade}` : ''}</p>
        <ol class="planlist">${r.order.map((c) => html`<li><b>${c.title}</b>${c.note ? html`<small>${c.note}</small>` : ''}</li>`)}</ol>`
      : html`<p class="ov-sub">Prüfe, ob du die ganze Antwort kopiert hast. Oft hilft es, den KI-Chat zu bitten: „Bitte gib nur den vollständigen JSON-Codeblock aus.“</p>`}
      ${r.errors && r.errors.length ? html`<div class="warn">${ic('alert')}<div><b>Probleme</b><ul class="replist">${r.errors.map((x) => html`<li>${x}</li>`)}</ul></div></div>` : ''}
      ${r.notes && r.notes.length ? html`<details class="repairs" open><summary>${r.notes.length} ${r.notes.length === 1 ? 'Hinweis' : 'Hinweise'}</summary><ul class="replist">${r.notes.map((x) => html`<li>${x}</li>`)}</ul></details>` : ''}
      <div class="ov-actions"><button class="btn" data-ai="back">${ic('arrowl')}Zurück</button>${S ? html`<button class="btn primary" data-ai="create">${ic('check')}Themenserie anlegen</button>` : ''}</div>`, { wide: true });
    on(box, {
      back: step2,
      create: async () => { try { const N = await api('/series', { method: 'POST', body: { series: S } }); closeOv(); onCreated(N); } catch (e) { toast(e.message, 'err'); } },
    });
  }
  form();
}
