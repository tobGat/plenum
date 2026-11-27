// Lehrkraft-Oberfläche: Bibliothek, Editor, Präsentation, Moderationsfenster
import { io } from '/socket.io/socket.io.esm.min.js';
import { html, toast } from './core/dom.js';
import { ic } from './core/icons.js';
import { api } from './core/api.js';
import { initOverlay, closeOv } from './core/overlay.js';
import { createPresenter } from './present/presenter.js';
import { createLibrary } from './editor/library.js';

const root = document.getElementById('root');
initOverlay();

async function boot() {
  let info;
  try { info = await api('/info'); }
  catch {
    root.innerHTML = String(html`<div class="notapp"><div class="card">${ic('monitor')}<h2>Bitte die Plenum-App verwenden</h2><p>Die Lehrkraft-Ansicht funktioniert nur im Programmfenster von Plenum. Schüler:innen öffnen die Startseite ohne „/host“.</p></div></div>`);
    return;
  }
  const socket = io({ transports: ['websocket', 'polling'] });
  let view = null, kind = '';
  let fromSeries = null; // Lektion aus einer Themenserie geöffnet oder gestartet → danach dorthin zurück
  const destroy = () => { if (view && view.destroy) view.destroy(); view = null; kind = ''; closeOv(); document.documentElement.removeAttribute('style'); };
  const setHash = (h) => { if (location.hash !== h) history.replaceState(null, '', h); };

  async function showLibrary() {
    destroy(); setHash('#/'); kind = 'library'; fromSeries = null;
    view = createLibrary({ root, api, socket, info, onPresent: present, onEdit: showEditor, onResume: resume, onSeries: showSeries });
  }
  // Zurück aus Editor oder Präsentation: zur Themenserie, wenn man von dort kam
  const goBack = () => (fromSeries ? showSeries(fromSeries) : showLibrary());
  async function showSeries(id) {
    destroy(); setHash(`#/serie/${id}`); kind = 'series'; fromSeries = null;
    const { createSeriesEditor } = await import('./editor/series.js');
    const v = await createSeriesEditor({ root, api, info, seriesId: id, onClose: showLibrary,
      onPresent: (lessonId, stateId) => { fromSeries = id; present(lessonId, stateId); }, onEdit: (lessonId) => { fromSeries = id; showEditor(lessonId, true); } });
    if (kind === 'series') view = v; else if (v && v.destroy) v.destroy();
  }
  async function showEditor(id, keep) {
    const back = keep === true ? fromSeries : null;
    destroy(); setHash(`#/edit/${id}`); kind = 'editor'; fromSeries = back;
    const { createEditor } = await import('./editor/editor.js');
    view = createEditor({ root, api, socket, info, lessonId: id, onClose: goBack, onPresent: present });
  }
  function showPresenter(state) {
    destroy(); setHash('#/present'); kind = 'present';
    view = createPresenter({ root, socket, api, info, onExit: goBack, seriesId: fromSeries, onNext: (lessonId) => present(lessonId) });
    view.show(state);
  }
  async function showModeration() {
    destroy(); kind = 'moderation';
    const { createModeration } = await import('./present/moderation.js');
    view = createModeration({ root, socket });
  }
  function present(lessonId, stateId) {
    socket.emit('host:present', { lessonId, stateId }, (st) => {
      if (!st || st.error) return toast(st?.error || 'Präsentation konnte nicht gestartet werden', 'err');
      showPresenter(st);
    });
  }
  function resume() { socket.emit('host:state', (st) => { if (st && st.presenting) showPresenter(st); }); }

  function route(st) {
    const h = location.hash || '#/';
    if (h === '#/moderation') return showModeration();
    if (st && st.presenting && (h === '#/present' || h === '#/' || !h)) return showPresenter(st);
    const m = h.match(/^#\/edit\/([\w-]+)$/);
    if (m) return showEditor(m[1]);
    const ms = h.match(/^#\/serie\/([\w-]+)$/);
    if (ms) return showSeries(ms[1]);
    return showLibrary();
  }
  let first = true;
  socket.on('connect', () => socket.emit('host:state', (st) => {
    if (first) { first = false; route(st); return; }
    if (kind === 'present' && st && st.presenting) view.update(st); // nach Verbindungsabbruch Zustand neu holen
  }));
  // Doppelklick auf eine .plenum-Datei, während Plenum läuft
  window.plenumApp?.onOpenLesson?.((id) => { toast('Lektion importiert'); if (kind === 'library') showLibrary(); else if (kind !== 'present') showLibrary(); });
}
boot();
