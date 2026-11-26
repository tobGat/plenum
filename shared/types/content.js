// Inhaltsfolien ohne Antworten der Klasse: Titel, Info, Lückentext, Labor, Zusammenfassung, Quellen
import { F, shuffled, fp } from './common.js';
import { ICON_NAMES } from '../palette.js';

const iconSelect = { key: 'icon', kind: 'select', label: 'Icon', options: ICON_NAMES.map((v) => ({ value: v, label: v })), default: 'star' };

export const title = {
  type: 'title', label: 'Titelfolie', icon: 'flag', group: 'Inhalt', passive: true,
  desc: 'Einstieg mit großem Titel, Untertitel und Themen-Kacheln (je Kachel optional ein Abschnitt zum Hinspringen).',
  fields: [F.title,
    { key: 'kicker', kind: 'text', label: 'Kennzeile (z. B. Fach · Klasse)', max: 60, optional: true },
    { key: 'subtitle', kind: 'text', label: 'Untertitel', max: 140, optional: true },
    { key: 'topics', kind: 'objlist', label: 'Themen', max: 12, optional: true, fields: [
      { key: 'text', kind: 'text', label: 'Thema', max: 60, required: true },
      { key: 'section', kind: 'text', label: 'Abschnitt (Name)', max: 40, optional: true }] },
    { key: 'art', kind: 'select', label: 'Titelbild (wird durch eine Grafik ersetzt)', default: 'chart',
      options: [{ value: 'chart', label: 'Diagramm' }, { value: 'bubbles', label: 'Sprechblasen' }, { value: 'shapes', label: 'Formen' }, { value: 'waves', label: 'Wellen' }, { value: 'dots', label: 'Punkte' }, { value: 'none', label: 'Ohne' }] },
    { key: 'layout', kind: 'select', label: 'Aufbau', default: 'card',
      options: [{ value: 'card', label: 'Farbfläche' }, { value: 'split', label: 'Geteilt' }, { value: 'center', label: 'Zentriert' }] },
    F.notes],
  sample: { type: 'title', title: 'Wasser im Alltag', kicker: 'Biologie · 2. Klasse', subtitle: 'Wie viel Wasser brauchen wir?', topics: [{ text: 'Wasserkreislauf', section: 'Grundlagen' }, { text: 'Unser Verbrauch', section: 'Umfrage' }] },
  toStudent: (s) => ({ title: s.title, kicker: s.kicker, subtitle: s.subtitle, art: s.art, layout: s.layout, topics: (s.topics || []).map((t) => t.text) }),
};

export const info = {
  type: 'info', label: 'Info-Folie', icon: 'info', group: 'Inhalt', passive: true,
  desc: 'Erklärung in 1–6 Karten (Titel + Text; Zeilen werden zu Aufzählungspunkten, „1. …“ zu nummerierten Schritten). Karten mit dem Titel „Merke“, „Regel“ oder „Achtung“ werden hervorgehoben. Optional ein Diagramm.',
  fields: [F.title,
    { key: 'cards', kind: 'objlist', label: 'Karten', min: 1, max: 6, fields: [
      { key: 'title', kind: 'text', label: 'Kartentitel', max: 60, required: true },
      { key: 'text', kind: 'textarea', label: 'Text', max: 420 }] },
    F.chart, F.source, F.notes],
  sample: { type: 'info', title: 'Der Wasserkreislauf', cards: [{ title: 'Verdunsten', text: 'Die Sonne erwärmt Wasser.\nWasserdampf steigt auf.' }, { title: 'Merke', text: 'Wasser geht nicht verloren, es wechselt nur seinen Zustand.' }] },
  toStudent: (s) => ({ title: s.title, cards: s.cards, chart: s.chart, source: s.source }),
};

// ---------- Video ----------
// Zeitangabe „1:30“, „90“, „1m30s“ oder „1h2m3s“ → Sekunden (0 = keine)
export function parseTime(t) {
  const s = String(t ?? '').trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((n, x) => n * 60 + +x, 0);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(s);
  return m && (m[1] || m[2] || m[3]) ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
export const fmtTime = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}` : `${Math.floor(sec / 60)}`) + `:${String(sec % 60).padStart(2, '0')}`;
// Adresse verstehen: YouTube (wird über youtube-nocookie eingebettet), direkte Videodatei oder sonstiger Link (nur „im Browser öffnen“)
export function videoInfo(url, start, end) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return { kind: 'none', url: '', host: '' }; }
  if (!/^https?:$/.test(u.protocol)) return { kind: 'none', url: '', host: '' };
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (/^(youtube\.com|youtube-nocookie\.com|music\.youtube\.com)$/.test(host)) id = u.pathname === '/watch' ? u.searchParams.get('v') || '' : (/^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname) || [])[1] || '';
  const from = parseTime(start) || parseTime(u.searchParams.get('t') || u.searchParams.get('start')), to = parseTime(end);
  if (/^[\w-]{6,20}$/.test(id)) {
    const q = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (from) q.set('start', String(from));
    if (to > from) q.set('end', String(to));
    return { kind: 'youtube', id, url: u.href, host: 'YouTube', from, to, embed: `https://www.youtube-nocookie.com/embed/${id}?${q}`, watch: `https://www.youtube.com/watch?v=${id}${from ? `&t=${from}s` : ''}` };
  }
  if (/\.(mp4|webm|ogv|ogg|m4v|mov)$/i.test(u.pathname)) return { kind: 'file', url: u.href, host, from, to, src: `${u.href.split('#')[0]}${from || to > from ? `#t=${from}${to > from ? `,${to}` : ''}` : ''}`, watch: u.href };
  return { kind: 'link', url: u.href, host, from, to, watch: u.href };
}

export const video = {
  type: 'video', label: 'Video', icon: 'play', group: 'Inhalt',
  desc: 'Video am Beamer mit Beobachtungsaufträgen für die Klasse. „url“ ist die Adresse des Videos (YouTube-Link oder direkte Adresse einer Videodatei) – genau so übernehmen, wie sie vorgegeben wurde, niemals eine Adresse erfinden oder verändern. Die Geräte der Klasse zeigen nur die Aufträge, nicht das Video.',
  fields: [F.title,
    { key: 'url', kind: 'text', label: 'Adresse des Videos (z. B. YouTube-Link)', max: 400, required: true },
    { key: 'start', kind: 'text', label: 'Beginn (z. B. 1:30)', max: 10, optional: true },
    { key: 'end', kind: 'text', label: 'Ende (z. B. 4:05)', max: 10, optional: true },
    { key: 'intro', kind: 'textarea', label: 'Worum geht es? (kurz)', max: 300, optional: true },
    { key: 'tasks', kind: 'strlist', label: 'Beobachtungsaufträge (während des Videos)', max: 6, itemMax: 200, optional: true },
    F.discussion, F.source, F.notes],
  sample: { type: 'video', title: 'Video: Der Weg des Wassers', url: 'https://www.youtube.com/watch?v=VIDEO_ID', intro: 'Ein kurzer Film über den Wasserkreislauf.', tasks: ['Welche drei Stationen durchläuft das Wasser?', 'Was treibt den Kreislauf an?'] },
  fresh: { title: 'Video', url: '', intro: '', tasks: ['Worum geht es in dem Video?'] }, // neue Folie im Editor: ohne Beispiel-Adresse
  repair(s, r, p) {
    if (s.url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s.url)) s.url = 'https://' + s.url.replace(/^\/+/, '');
    const v = videoInfo(s.url);
    if (v.kind === 'none') r.error(`${p}: Die Adresse des Videos ist ungültig (sie muss mit https:// beginnen)`);
    else if (v.kind === 'youtube' && v.id === 'VIDEO_ID') r.note(`${p}: Platzhalter statt einer echten Video-Adresse – bitte im Editor die richtige Adresse eintragen`);
    else if (v.kind === 'link') r.note(`${p}: Dieses Video lässt sich nicht einbetten – die Folie bietet „Im Browser öffnen“ an`);
    for (const k of ['start', 'end']) if (s[k]) { const n = parseTime(s[k]); if (n) s[k] = fmtTime(n); else { r.note(`${p}: Zeitangabe „${s[k]}“ nicht verstanden und entfernt`); delete s[k]; } }
  },
  toStudent: (s) => ({ title: s.title, intro: s.intro, tasks: s.tasks || [], discussion: s.discussion }),
};

// Lücken eines Textes: je Lücke die Liste der gültigen Lösungen ([[Fahrrad|Rad]] → ['Fahrrad', 'Rad'])
export const gapAlts = (text) => [...String(text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].split('|').map((x) => x.trim()).filter(Boolean)).filter((x) => x.length);

export const gap = {
  type: 'gap', label: 'Lückentext', icon: 'pen', group: 'Aufgaben', selfCheck: true,
  desc: 'Text mit Lücken in doppelten eckigen Klammern: „Die [[Sonne]] erwärmt das Wasser.“ Alternativen mit senkrechtem Strich: [[Fahrrad|Rad]]. Die Klasse zieht die Wörter aus einem Wortkasten in die Lücken und prüft selbst; der Wortkasten entsteht automatisch aus den Lösungen (gemischt). „extra“ sind zusätzliche falsche Wörter im Wortkasten. Die Lösungswörter deshalb NICHT im Tipp nennen.',
  fields: [F.title, { key: 'tip', kind: 'text', label: 'Tipp (optional)', max: 240, optional: true },
    { key: 'text', kind: 'textarea', label: 'Text mit [[Lücken]]', max: 1400, required: true },
    { key: 'extra', kind: 'strlist', label: 'Zusätzliche falsche Wörter im Wortkasten (optional)', max: 6, itemMax: 40, optional: true },
    F.chart, F.source, F.notes],
  sample: { type: 'gap', title: 'Lücken füllen', tip: 'Lies zuerst den ganzen Text.', text: 'Das Wasser [[verdunstet]]. Es bilden sich [[Wolken]]. Dann fällt [[Regen|Niederschlag]].', extra: ['Schnee'] },
  repair(s, r, p) {
    if (!gapAlts(s.text).length) r.error(`${p}: Lückentext ohne [[Lücken]]`);
    if (gapAlts(s.text).length > 14) r.note(`${p}: sehr viele Lücken – eventuell unübersichtlich`);
  },
  // Wortkasten: erste Lösung jeder Lücke plus falsche Wörter, je Gerät anders gemischt
  toStudent: (s, ctx) => ({ title: s.title, tip: s.tip, text: s.text, chart: s.chart, source: s.source, mine: ctx.mine ?? null,
    bank: shuffled([...gapAlts(s.text).map((a) => a[0]), ...(s.extra || [])].map((text, id) => ({ id, text })), (ctx.cid || '') + s.id) }),
  // Antwort: je Lücke das eingesetzte Wort (nur geprüfte, richtige Wörter bleiben stehen) oder null
  accept(s, d) {
    const n = gapAlts(s.text).length;
    if (!d || !Array.isArray(d.answers) || d.answers.length !== n) return null;
    return d.answers.map((a) => (typeof a === 'string' ? a.slice(0, 80) : null));
  },
  aggregate(s, subs) {
    const alts = gapAlts(s.text), gaps = alts.map(() => ({ ok: 0 }));
    let students = 0, done = 0;
    for (const a of Object.values(subs)) {
      if (!Array.isArray(a)) continue;
      students++;
      let ok = 0;
      alts.forEach((al, i) => { if (al.includes(a[i])) { gaps[i].ok++; ok++; } });
      if (ok === alts.length) done++;
    }
    return { gaps, students, done };
  },
  fingerprint: (s) => fp(s.text, s.extra),
};

export const lab = {
  type: 'lab', label: 'Diagramm-Labor', icon: 'eye', group: 'Live',
  desc: 'Säulendiagramm mit Reglern (y-Achse, erstes Jahr, Alarmfarbe): zeigt, wie Darstellungen beeinflussen. Braucht ein Diagramm mit einer Reihe.',
  fields: [F.title, { ...F.chart, optional: false, label: 'Daten (eine Reihe)' },
    { key: 'task', kind: 'textarea', label: 'Auftrag', max: 300, optional: true }, F.source, F.notes],
  sample: { type: 'lab', title: 'Manipulations-Labor', chart: { type: 'bar', title: 'Besucherzahlen', labels: ['2021', '2022', '2023', '2024'], series: [{ name: 'Besuche', values: [410, 432, 425, 447] }], source: 'Beispieldaten (fiktiv)' }, task: 'Stellt ein möglichst alarmierendes und ein beruhigendes Diagramm ein.' },
  repair(s, r, p) { if (!s.chart) r.error(`${p}: Labor braucht ein Diagramm`); else { s.chart.type = 'bar'; s.chart.series = s.chart.series.slice(0, 1); } },
  toStudent: (s) => ({ title: s.title, task: s.task }),
};

export const summary = {
  type: 'summary', label: 'Zusammenfassung', icon: 'list', group: 'Inhalt', passive: true,
  desc: 'Überblick in bis zu 12 Kacheln (Icon, Titel, kurzer Text, optional Abschnitt für die Farbe).',
  fields: [F.title, { key: 'items', kind: 'objlist', label: 'Kacheln', min: 1, max: 12, fields: [iconSelect,
    { key: 'title', kind: 'text', label: 'Titel', max: 40, required: true },
    { key: 'text', kind: 'text', label: 'Text', max: 120 },
    { key: 'section', kind: 'text', label: 'Abschnitt (Name)', max: 40, optional: true }] }, F.notes],
  sample: { type: 'summary', title: 'Das Wichtigste', items: [{ icon: 'cloud', title: 'Kreislauf', text: 'Verdunsten, Wolken, Regen' }] },
  toStudent: (s) => ({ title: s.title, items: s.items }),
};

export const sources = {
  type: 'sources', label: 'Quellen', icon: 'globe', group: 'Inhalt', passive: true,
  desc: 'Liste der verwendeten Quellen (Titel und Link).',
  fields: [F.title, { key: 'intro', kind: 'textarea', label: 'Einleitung', max: 300, optional: true },
    { key: 'items', kind: 'objlist', label: 'Quellen', min: 1, max: 20, fields: [
      { key: 'title', kind: 'text', label: 'Titel', max: 200, required: true },
      { key: 'url', kind: 'text', label: 'Link', max: 400, optional: true }] }, F.notes],
  sample: { type: 'sources', title: 'Quellen', items: [{ title: 'Statistik Austria: Wasserverbrauch', url: 'https://www.statistik.at' }] },
  repair(s) { (s.items || []).forEach((q) => { if (q.url && !/^https?:\/\//i.test(q.url)) q.url = 'https://' + q.url.replace(/^\/+/, ''); }); },
  toStudent: (s) => ({ title: s.title, intro: s.intro, items: s.items }),
};
