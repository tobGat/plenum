// Ziehen und Ablegen mit Maus, Finger oder Stift (Pointer Events – das HTML5-Drag-and-drop funktioniert auf Tablets nicht).
// Ziehbar ist jedes Element mit data-drag="<Wert>", Ablageziel jedes Element mit data-drop.
// Beim Ablegen wird das Ziel „angeklickt“; dessen Aktion holt sich den gezogenen Wert mit takeDrop().
let pending = null;
export const takeDrop = () => { const v = pending; pending = null; return v; };

let d = null, swallowUntil = 0;
const targetAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest ? el.closest('[data-drop]') : null; };

function start(e) {
  if (e.button) return;
  const el = e.target.closest && e.target.closest('[data-drag]');
  if (!el || el.disabled) return;
  d = { el, id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null, over: null, dx: 0, dy: 0 };
}
function move(e) {
  if (!d || e.pointerId !== d.id) return;
  if (!d.ghost) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    const r = d.el.getBoundingClientRect(), cs = getComputedStyle(d.el), g = d.el.cloneNode(true);
    ['data-action', 'data-drag', 'data-drop', 'id'].forEach((a) => g.removeAttribute(a));
    g.classList.add('dragghost');
    // Die Folie ist gezoomt (Einpassen): Größe und Schrift vom Original übernehmen
    const z = d.el.offsetWidth ? r.width / d.el.offsetWidth : 1;
    g.style.width = `${r.width}px`; g.style.height = `${r.height}px`;
    g.style.fontSize = `${parseFloat(cs.fontSize) * z}px`; g.style.lineHeight = `${r.height}px`;
    d.dx = d.x - r.left; d.dy = d.y - r.top;
    (d.el.closest('#app') || document.body).appendChild(g);
    d.ghost = g; d.el.classList.add('dragging');
    document.documentElement.classList.add('is-dragging');
  }
  e.preventDefault();
  d.ghost.style.transform = `translate(${e.clientX - d.dx}px,${e.clientY - d.dy}px)`;
  const t = targetAt(e);
  if (t !== d.over) { if (d.over) d.over.classList.remove('dropover'); if (t && t !== d.el) t.classList.add('dropover'); d.over = t; }
}
function end(e, cancel) {
  if (!d || e.pointerId !== d.id) return;
  const cur = d; d = null;
  if (!cur.ghost) return; // nur angetippt: der normale Klick übernimmt
  cur.ghost.remove(); cur.el.classList.remove('dragging');
  if (cur.over) cur.over.classList.remove('dropover');
  document.documentElement.classList.remove('is-dragging');
  swallowUntil = Date.now() + 350; // den Klick, den der Browser nach dem Loslassen auslöst, verwerfen
  if (cancel) return;
  const t = targetAt(e);
  if (t && t !== cur.el) { pending = cur.el.dataset.drag; t.click(); pending = null; }
}

if (typeof document !== 'undefined' && !window.__plenumDrag) {
  window.__plenumDrag = true;
  document.addEventListener('pointerdown', start);
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', (e) => end(e, false));
  document.addEventListener('pointercancel', (e) => end(e, true));
  document.addEventListener('click', (e) => { if (e.isTrusted && Date.now() < swallowUntil) { swallowUntil = 0; e.stopPropagation(); e.preventDefault(); } }, true);
}
