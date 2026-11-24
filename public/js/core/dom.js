// DOM-Helfer: Templates escapen automatisch (Schutz vor eingeschleustem HTML), Ereignisse über data-action
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
const val = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v));

// html`<b>${text}</b>` – Werte werden escaped, außer raw(...) oder verschachtelte html`...`
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function mount(el, content) { el.innerHTML = String(content); return el; }

// Ereignis-Delegation: <button data-action="name" data-x="1"> → handlers.name(el, event)
export function delegate(root, type, handlers, attr = 'action') {
  const fnc = (e) => {
    const el = e.target.closest(`[data-${attr}]`);
    if (!el || !root.contains(el)) return;
    if (type === 'click' && el.tagName === 'FORM') return; // Formulare reagieren nur auf „submit“
    const fn = handlers[el.dataset[attr]];
    if (fn) { if (type === 'submit') e.preventDefault(); fn(el, e); }
  };
  root.addEventListener(type, fnc);
  return () => root.removeEventListener(type, fnc);
}

// Minimal-Markup in Inhalten: **fett** und Zeilenumbrüche (alles andere wird escaped)
export const md = (s) => raw(esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));

// Zeilen als Liste: „a) …“ und „1. …“ werden Schritte, sonst Aufzählungspunkte (loose: auch „1 …“)
export function richLines(text, loose) {
  const L = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const num = loose ? /^(\d{1,2})[.)]?\s+(.+)$/ : /^(\d{1,2})[.)]\s+(.+)$/;
  const step = (l) => l.match(/^([a-z])\)\s+(.+)$/) || l.match(num);
  if (L.length === 1 && !step(L[0])) return html`<p>${md(L[0])}</p>`;
  return html`<ul class="rl">${L.map((l) => { const m = step(l); return m ? html`<li class="lt"><span class="ln">${m[1]}</span><span>${md(m[2])}</span></li>` : html`<li class="bl">${md(l)}</li>`; })}</ul>`;
}

export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.textContent = msg; t.setAttribute('role', 'status');
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
}

// In die Zwischenablage: im Programmfenster über den Hauptprozess (zuverlässig), sonst Browser-Schnittstellen
export async function copyText(text, fallbackEl = null) {
  try { if (window.plenumApp && window.plenumApp.copyText && (await window.plenumApp.copyText(text))) return true; } catch { /* weiter */ }
  try { await navigator.clipboard.writeText(text); return true; } catch { /* weiter */ }
  try { if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); } return document.execCommand('copy'); } catch { return false; }
}

export const fmt = (v) => (Math.round(v * 10) / 10).toLocaleString('de-AT');
export const pct = (v, n) => (n ? Math.round((v / n) * 100) : 0);
export function whenStr(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const t = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }), day = new Date(); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return diff === 0 ? `heute, ${t}` : diff === 1 ? `gestern, ${t}` : `${d.toLocaleDateString('de-AT')}, ${t}`;
}
