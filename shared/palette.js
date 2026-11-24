// Farben und Icons für Abschnitte. Wird von Server (Prüfung) und Browser (Darstellung) genutzt – ohne DOM.
// c = Akzent, d = dunkel, s = sanfter Hintergrund, l = Linie
export const COLORS = {
  indigo: { c: '#4f46e5', d: '#3730a3', s: '#eef2ff', l: '#c7d2fe', name: 'Indigo' },
  teal: { c: '#0d9488', d: '#115e59', s: '#e6f7f5', l: '#99e2d8', name: 'Petrol' },
  blue: { c: '#2563eb', d: '#1e40af', s: '#eaf1fe', l: '#bfd3fb', name: 'Blau' },
  rose: { c: '#e11d48', d: '#9f1239', s: '#fdecef', l: '#f9c2cd', name: 'Rot' },
  violet: { c: '#7c3aed', d: '#5b21b6', s: '#f2edfe', l: '#d6c7fb', name: 'Violett' },
  amber: { c: '#d97706', d: '#92400e', s: '#fdf3e3', l: '#f6d39b', name: 'Bernstein' },
  emerald: { c: '#059669', d: '#065f46', s: '#e7f6ef', l: '#a3e0c7', name: 'Grün' },
  cyan: { c: '#0891b2', d: '#155e75', s: '#e5f6fa', l: '#a3dcea', name: 'Türkis' },
  fuchsia: { c: '#c026d3', d: '#86198f', s: '#faeafc', l: '#eebdf4', name: 'Magenta' },
  slate: { c: '#475569', d: '#1e293b', s: '#eef1f5', l: '#cbd5e1', name: 'Grau' },
};
export const COLOR_NAMES = Object.keys(COLORS);

// Namen der eingebauten Linien-Icons (Pfade in public/js/core/icons.js)
export const ICON_NAMES = ['compass', 'book', 'bars', 'hbars', 'pie', 'line', 'eye', 'pen', 'chat', 'file', 'link', 'clipboard', 'flag',
  'bulb', 'users', 'user', 'search', 'hash', 'mic', 'globe', 'vote', 'info', 'alert', 'star', 'cloud', 'scale', 'trophy', 'list',
  'target', 'heart', 'clock', 'spark', 'notebook', 'puzzle', 'flask', 'music', 'leaf', 'calc'];

// Diagrammfarben (Reihen)
export const CHART_COLORS = ['#2563eb', '#f97316', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
