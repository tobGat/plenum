// Dialoge über der Seite (Escape oder Klick daneben schließt, wenn erlaubt)
import { html } from './dom.js';

let onClose = null;
export function overlay(inner, { closable = true, wide = false, onclose = null } = {}) {
  const ov = document.getElementById('ov');
  ov.innerHTML = String(html`<div class="ov" data-ovbg="${closable ? '1' : ''}"><div class="ovbox${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`);
  onClose = onclose;
  const box = ov.querySelector('.ovbox');
  const first = box.querySelector('input,textarea,select,button:not([disabled])');
  if (first && first.tagName !== 'BUTTON') first.focus();
  return box;
}
export function closeOv() { const ov = document.getElementById('ov'); if (ov.innerHTML) { ov.innerHTML = ''; const f = onClose; onClose = null; if (f) f(); } }
export const ovOpen = () => !!document.getElementById('ov').innerHTML;

export function initOverlay() {
  const ov = document.getElementById('ov');
  ov.addEventListener('click', (e) => { if (e.target.classList.contains('ov') && e.target.dataset.ovbg) closeOv(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.querySelector('[data-ovbg="1"]')) closeOv(); });
}

// Bestätigung als Promise (statt window.confirm, passt zum Design)
export function ask(title, text, { ok = 'OK', cancel = 'Abbrechen', danger = false } = {}) {
  return new Promise((resolve) => {
    const box = overlay(html`<h2>${title}</h2>${text ? html`<p class="ov-sub">${text}</p>` : ''}<div class="ov-actions"><button class="btn" data-r="0">${cancel}</button><button class="btn primary${danger ? ' danger' : ''}" data-r="1">${ok}</button></div>`, { onclose: () => resolve(false) });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; onClose = null; closeOv(); resolve(b.dataset.r === '1'); });
    box.querySelector('[data-r="1"]').focus();
  });
}
export function prompt(title, text, value = '', { ok = 'OK', max = 60, placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const box = overlay(html`<h2>${title}</h2>${text ? html`<p class="ov-sub">${text}</p>` : ''}<form class="saveform"><input class="field" value="${value}" maxlength="${max}" placeholder="${placeholder}" required><button class="btn primary">${ok}</button></form>`, { onclose: () => resolve(null) });
    const inp = box.querySelector('input'); inp.focus(); inp.select();
    box.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); onClose = null; closeOv(); resolve(inp.value.trim()); });
  });
}
