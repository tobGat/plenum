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
  const destroy = () => { if (view && view.destroy) view.destroy(); view = null; kind = ''; closeOv(); document.documentElement.removeAttribute('style'); };
  const setHash = (h) => { if (location.hash !== h) history.replaceState(null, '', h); };

  async function showLibrary() {
    destroy(); setHash('#/'); kind = 'library';
    view = createLibrary({ root, api, socket, info, onPresent: present, onEdit: showEditor, onResume: resume });
  }
  async function showEditor(id) {
    destroy(); setHash(`#/edit/${id}`); kind = 'editor';
    const { createEditor } = await import('./editor/editor.js');
    view = createEditor({ root, api, socket, info, lessonId: id, onClose: showLibrary, onPresent: present });
  }
  function showPresenter(state) {
    destroy(); setHash('#/present'); kind = 'present';
    view = createPresenter({ root, socket, api, info, onExit: showLibrary });
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
