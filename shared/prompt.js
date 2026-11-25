// KI-Vorlage: Prompt für einen beliebigen Chatbot, der eine Plenum-Lektion als JSON erstellt oder überarbeitet.
// Plenum sendet selbst nichts ins Internet – die Lehrkraft kopiert den Prompt und fügt die Antwort wieder ein.
import { TYPES, TYPE_LIST } from './types/index.js';
import { describeField } from './fields.js';
import { COLOR_NAMES, ICON_NAMES } from './palette.js';
import { FORMAT, VERSION, MAX_SLIDES, THEMES, GRAPHIC_POS } from './schema.js';
import { LIBRARY } from './graphics.js';

export const DEFAULT_TYPES = TYPE_LIST.map((t) => t.type).filter((t) => t !== 'sources');

// Material (Buchseiten, Arbeitsblätter, Fotos …) hängt die Lehrkraft im KI-Chat selbst an; Plenum beschreibt nur, wie es zu nutzen ist.
// material: null/false = keines, sonst { desc: 'Buch S. 40–42, Ü2–Ü4' } (Beschreibung optional)
export const NO_FILES_REPLY = 'Bitte die Dateien anhängen.';

function materialBlock(material, use = 'buch', mode = 'create') {
  if (!material) return '';
  const desc = String(material.desc || '').trim();
  const look = 'Sieh dir alle angehängten Dateien genau an (auch Bildunterschriften, Tabellen und Diagramme).';
  const own = 'Übernimm keine längeren Texte wörtlich, sondern fasse in eigenen Worten zusammen. Kurze Zitate von Aufgabenstellungen sind in Ordnung.';
  const nums = 'Zahlen aus abgebildeten Diagrammen oder Tabellen nur übernehmen, wenn sie eindeutig lesbar sind – mit Quelle, z. B. "Schulbuch, S. 44". Sonst keine Zahlen erfinden.';
  const tasks = 'Aufgaben, die im Buch oder auf dem Arbeitsblatt erledigt werden, bekommen eine eigene Folie vom Typ "task" mit Seite, Aufgabennummer, Sozialform und kurzem Auftrag (z. B. „Zuerst im Buch: Ü2 und Ü3“). Setze sie direkt vor die Folien, die darauf aufbauen; baut eine Aufgabe auf früheren auf, nenne diese mit.';
  const none = `Siehst du keine angehängten Dateien, antworte nur mit dem Satz „${NO_FILES_REPLY}“ und erstelle noch keine Lektion.`;
  const rules = mode === 'revise'
    ? [look, 'Nutze das Material für das, was der Änderungswunsch verlangt.', tasks, own, nums, none]
    : use === 'orient'
      ? [`${look} Übernimm daraus Thema, Fachbegriffe, Niveau und typische Beispiele.`, 'Erstelle eigene Erklärungen und Aufgaben: Die Stunde soll ohne das Material funktionieren, verweise nicht auf Buchseiten.', own, nums, none]
      : [`${look} Thema, Fachbegriffe, Beispiele, Reihenfolge und Schwierigkeitsgrad der Stunde richten sich danach.`, tasks,
        'Ergänze passende interaktive Folien zum Material: Verständnisfragen (mc, truefalse), Zuordnungen, Lückentexte, Umfragen zum Thema und ein kurzes Quiz.', own, nums, none];
  return ['MATERIAL:', `Ich hänge dir in diesem Chat Material an (Fotos, Scans, Screenshots oder PDF)${desc ? `: ${desc}` : '.'}`, '', 'So nutzt du das Material:', ...rules.map((r, i) => `${i + 1}. ${r}`)].join('\n');
}

// Kurzbeschreibung eines Typs mit allen Feldern (id/section ergänzt die App)
export function typeDoc(t) {
  const lines = t.fields.map((f) => `    "${f.key}": ${describeField(f)}${f.required ? ' – Pflicht' : ''}`);
  return `- "${t.type}" – ${t.label}: ${t.desc}\n${lines.join('\n')}`;
}

const pickTypes = (types) => {
  const list = (types && types.length ? types : DEFAULT_TYPES).filter((t) => TYPES[t]);
  if (!list.includes('title')) list.unshift('title');
  if (list.includes('leaderboard') && !list.includes('quiz')) list.splice(list.indexOf('leaderboard'), 1);
  return list;
};

// Beispiel: die Muster-Folien der gewählten Typen (zeigen die Form, nicht den Inhalt)
export function exampleLesson(types) {
  const list = pickTypes(types);
  const slides = list.map((t, i) => ({ type: t, section: i < 2 ? 'Einstieg' : 'Erarbeitung', ...stripType(TYPES[t].sample) }));
  return {
    format: FORMAT, version: VERSION, title: 'Wasser im Alltag', subject: 'Biologie', grade: '6. Schulstufe', description: 'Wie viel Wasser brauchen wir?',
    sections: [{ name: 'Einstieg', color: 'indigo', icon: 'compass' }, { name: 'Erarbeitung', color: 'teal', icon: 'book' }],
    slides,
  };
}
const stripType = (s) => { const { type, ...rest } = s; return rest; };

// Umfang der Lektion: genaue Zahl, Bereich (von–bis) oder offen (die KI entscheidet nach Bedarf)
export function scopeOf({ count = 12, countMode = 'exact', countMin, countMax } = {}) {
  const lim = (v, d) => Math.max(3, Math.min(MAX_SLIDES, Math.round(+v) || d));
  if (countMode === 'open') return { mode: 'open', short: `so viele Folien, wie das Thema sinnvoll braucht (höchstens ${MAX_SLIDES})`, rule: `Wähle die Anzahl der Folien passend zum Thema und zu einer Unterrichtsstunde – höchstens ${MAX_SLIDES} Folien.` };
  if (countMode === 'range') {
    let a = lim(countMin, 8), b = lim(countMax, 15);
    if (a > b) [a, b] = [b, a];
    if (a !== b) return { mode: 'range', min: a, max: b, short: `mindestens ${a} und höchstens ${b} Folien`, rule: `Mindestens ${a} und höchstens ${b} Folien.` };
    count = a;
  }
  const n = lim(count, 12);
  return { mode: 'exact', n, short: `genau ${n} Folien`, rule: `Genau ${n} Folien.` };
}

const RULES = (scope) => [
  'Antworte mit genau EINEM JSON-Codeblock (```json … ```). Davor oder danach höchstens ein kurzer Satz.',
  'Gültiges JSON: doppelte Anführungszeichen für Schlüssel und Texte, keine Kommentare, kein Komma nach dem letzten Eintrag.',
  'Keine Auslassungen wie „…“, „usw.“ oder „weitere Folien“: schreibe jede Folie vollständig aus.',
  'Anführungszeichen innerhalb von Texten nur als „…“ (deutsche Anführungszeichen), niemals als ".',
  scope ? scope.rule : `Höchstens ${MAX_SLIDES} Folien.`,
  'Halte die angegebenen Längen ein (max. Zeichen bzw. Einträge). Kurze, klare Sätze, die man am Beamer gut lesen kann.',
  'Erfinde keine Zahlen, Statistiken, Zitate oder Quellen. Kennst du keine sicheren echten Daten, verwende plausible Beispielwerte und schreibe als Quelle genau "Beispieldaten (fiktiv)".',
  'Gliedere die Stunde in 2–5 Abschnitte („sections“) mit kurzen Namen. Jede Folie nennt in "section" den Namen ihres Abschnitts.',
  'Abwechslung: Inhaltsfolien, Aufgaben mit Selbstkontrolle und Live-Folien (Umfrage, Wortwolke, Skala, offene Antworten, Quiz) sinnvoll mischen. Schüler:innen werden geduzt.',
  'Lösungen stehen direkt in den Feldern ("correct": true/false, Kategorien mit ihren Begriffen, [[Lücken]]). Keine Nummern oder Indizes für Antworten verwenden.',
];

function formatBlock(list) {
  return [
    'FORMAT DER ANTWORT:',
    `{ "format": "${FORMAT}", "version": ${VERSION}, "title": Text (max. 90 Zeichen), "subject": Text, "grade": Text, "description": Text (max. 400 Zeichen),`,
    `  "theme": Design, einer von ${THEMES.map((t) => `"${t.value}" (${t.label})`).join(', ')},`,
    `  "sections": [ { "name": Text (max. 40 Zeichen), "color": einer von ${COLOR_NAMES.map((c) => `"${c}"`).join(', ')}, "icon": einer von ${ICON_NAMES.map((c) => `"${c}"`).join(', ')} } ],`,
    '  "slides": [ { "type": Folientyp, "section": Name des Abschnitts, "graphic": optional (siehe GRAFIKEN), …Felder des Folientyps… } ] }',
    '',
    'GRAFIKEN (optional und sparsam, z. B. auf Titel-, Info- und Arbeitsauftrags-Folien):',
    `  "graphic": { "src": "lib:NAME" oder "icon:NAME", "pos": ${GRAPHIC_POS.map((p) => `"${p.value}"`).join('|')}, "size": "s"|"m"|"l" }`,
    `  Illustrationen (NAME): ${LIBRARY.map((g) => `${g.name} (${g.label})`).join(', ')}`,
    '  Symbole (NAME): dieselben wie bei "icon" der Abschnitte. Auf der Titelfolie ersetzt eine Grafik das Titelbild.',
    '',
    'FOLIENTYPEN UND IHRE FELDER (nur diese Typen verwenden):',
    ...list.map((t) => typeDoc(TYPES[t])),
  ].join('\n');
}

// Neue Lektion erstellen
export function buildPrompt({ topic = '', subject = '', grade = '', count = 12, countMode = 'exact', countMin, countMax, types = [], notes = '', material = null, materialUse = 'buch' } = {}) {
  // Mit Buch-/Arbeitsblatt-Material braucht es Arbeitsaufträge („Zuerst im Buch …“)
  const list = pickTypes(material && materialUse !== 'orient' && types.length && !types.includes('task') ? [...types, 'task'] : types), scope = scopeOf({ count, countMode, countMin, countMax });
  const ex = exampleLesson(list);
  return [
    'Du bist eine erfahrene Lehrkraft und bereitest eine interaktive Unterrichtsstunde für die App „Plenum“ vor. Die Lehrkraft zeigt die Folien am Beamer, die Klasse macht auf Handys mit (Abstimmungen, Quiz, Aufgaben).',
    '',
    `THEMA: ${topic.trim() || (material ? 'siehe angehängtes Material' : '(bitte ergänzen)')}`,
    subject.trim() ? `FACH: ${subject.trim()}` : '',
    grade.trim() ? `ZIELGRUPPE / SCHULSTUFE: ${grade.trim()}` : '',
    `UMFANG: ${scope.short}`,
    notes.trim() ? `WÜNSCHE DER LEHRKRAFT: ${notes.trim()}` : '',
    materialBlock(material, materialUse),
    '',
    'REGELN:',
    ...RULES(scope).map((r, i) => `${i + 1}. ${r}`),
    '',
    formatBlock(list),
    '',
    'BEISPIEL – zeigt nur die Form. Inhalt und Thema NICHT übernehmen:',
    '```json',
    JSON.stringify(ex),
    '```',
  ].filter((x) => x !== '').join('\n').replace(/\n(MATERIAL:|REGELN:|FORMAT DER ANTWORT:|BEISPIEL)/g, '\n\n$1');
}

// Bestehende Lektion überarbeiten: IDs bleiben erhalten, damit gespeicherte Stände passen und ein Vergleich möglich ist
export function buildRevisePrompt({ lesson, wish = '', types = [], material = null } = {}) {
  const used = [...new Set(lesson.slides.map((s) => s.type))];
  const list = pickTypes([...new Set([...used, ...(types.length ? types : DEFAULT_TYPES)])]);
  const L = { ...lesson };
  delete L.createdAt; delete L.updatedAt; delete L.appVersion; delete L.media; // eingebettete Bilder bleiben in Plenum
  return [
    'Du bist eine erfahrene Lehrkraft. Überarbeite die folgende Unterrichtsstunde für die App „Plenum“ (Folien am Beamer, die Klasse macht auf Handys mit).',
    '',
    `ÄNDERUNGSWUNSCH: ${wish.trim() || (material ? 'Ergänze die Lektion passend zum angehängten Material.' : 'Verbessere Verständlichkeit und Abwechslung, ohne das Thema zu ändern.')}`,
    ...(material ? ['', materialBlock(material, 'buch', 'revise')] : []),
    '',
    'REGELN:',
    ...[
      ...RULES(0),
      'Gib die VOLLSTÄNDIGE überarbeitete Lektion zurück, nicht nur die Änderungen.',
      'Behalte "id" der Lektion, der Abschnitte und aller Folien, die du übernimmst oder änderst. Neue Folien und Abschnitte bekommen KEINE "id". Entfernte Folien lässt du einfach weg.',
      'Ändere nur, was der Änderungswunsch verlangt. Vorhandene Quellenangaben und "graphic"-Angaben (auch "media:…") unverändert übernehmen.',
    ].map((r, i) => `${i + 1}. ${r}`),
    '',
    formatBlock(list),
    '',
    'AKTUELLE LEKTION:',
    '```json',
    JSON.stringify(L),
    '```',
  ].join('\n').replace(/\n\n+/g, '\n\n');
}

// Vorlage als Datei: leere Lektion mit Anleitung und je einer Musterfolie pro Typ – für Chatbots mit Datei-Upload
export function templateJson({ types = [], count = 12, countMode = 'exact', countMin, countMax, topic = '', material = null } = {}) {
  const ex = exampleLesson(types);
  return {
    _anleitung: `Fülle diese Vorlage für eine Plenum-Unterrichtsstunde${topic ? ` zum Thema „${topic}“` : ''} aus – Umfang: ${scopeOf({ count, countMode, countMin, countMax }).short}. ` +
      (material ? `Richte dich nach den weiteren angehängten Dateien${material.desc ? ` (${String(material.desc).trim()})` : ''}; Aufgaben aus dem Buch bekommen eine eigene Folie vom Typ "task". ` : '') +
      'Ersetze die Musterfolien durch eigene, verwende nur die vorkommenden Folientypen, halte das Format exakt ein und antworte mit einem einzigen JSON-Codeblock. ' +
      'Erfinde keine Zahlen oder Quellen – sonst als Quelle "Beispieldaten (fiktiv)". Anführungszeichen in Texten nur als „…“. Das Feld "_anleitung" weglassen.',
    ...ex,
    title: '', subject: '', grade: '', description: '',
  };
}
