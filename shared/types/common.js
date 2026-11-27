// Gemeinsame Felder und Hilfen für die Folientypen
import { hash } from '../util.js';

export const F = {
  title: { key: 'title', kind: 'text', label: 'Überschrift', max: 90, required: true },
  question: { key: 'question', kind: 'textarea', label: 'Frage', max: 240, required: true },
  questionOpt: { key: 'question', kind: 'textarea', label: 'Frage / Aufgabe', max: 240, optional: true },
  hint: { key: 'hint', kind: 'text', label: 'Hinweis für die Klasse', max: 160, optional: true },
  explanation: { key: 'explanation', kind: 'textarea', label: 'Erklärung (nach dem Antworten)', max: 300, optional: true },
  discussion: { key: 'discussion', kind: 'textarea', label: 'Impuls zur Besprechung', max: 400, optional: true },
  chart: { key: 'chart', kind: 'chart', label: 'Diagramm', optional: true },
  source: { key: 'source', kind: 'text', label: 'Quelle', max: 300, optional: true },
  notes: { key: 'notes', kind: 'textarea', label: 'Notizen für die Lehrkraft (nur im Moderationsfenster)', max: 600, optional: true },
};

// Deterministisches Mischen (gleiche Reihenfolge für dasselbe Gerät)
export function shuffled(arr, seed) {
  let s = parseInt(hash(String(seed)), 36) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const fp = (...parts) => hash(JSON.stringify(parts));
export const okInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const countBy = (vals) => vals.reduce((m, v) => { m[v] = (m[v] || 0) + 1; return m; }, {});

// Sperre gegen ständiges Umstimmen: Was zählt als Änderung einer schon abgegebenen Antwort?
// changedAny: die Antwort ist eine andere · changedSlot: eine schon gegebene Teilantwort wurde überschrieben
// (das erste Ausfüllen weiterer Teilantworten zählt nicht).
export const changedAny = (prev, v) => JSON.stringify(prev) !== JSON.stringify(v);
export const changedSlot = (prev, v) => Array.isArray(prev) && Array.isArray(v) && prev.some((x, i) => x !== null && x !== undefined && x !== v[i]);
