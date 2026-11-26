// Registry aller Folientypen (Datenteil; Darstellung in public/js/types/)
import { title, info, video, gap, lab, summary, sources } from './content.js';
import { mc, truefalse, sort, task } from './exercises.js';
import { poll, scale, wordcloud, open } from './live.js';
import { quiz, leaderboard } from './quiz.js';

export const TYPE_LIST = [title, info, video, mc, truefalse, sort, gap, task, poll, scale, wordcloud, open, quiz, leaderboard, lab, summary, sources];
export const TYPES = Object.fromEntries(TYPE_LIST.map((t) => [t.type, t]));
export const GROUPS = ['Inhalt', 'Aufgaben', 'Live'];

// Häufige andere Namen (z. B. aus KI-Antworten)
export const SYNONYMS = {
  titel: 'title', titelfolie: 'title', intro: 'title', start: 'title', cover: 'title',
  information: 'info', infofolie: 'info', text: 'info', erklaerung: 'info', content: 'info', cards: 'info',
  film: 'video', clip: 'video', youtube: 'video', videoclip: 'video', movie: 'video',
  multiple_choice: 'mc', multiplechoice: 'mc', single_choice: 'mc', choice: 'mc', auswahl: 'mc', frage: 'mc',
  true_false: 'truefalse', richtig_falsch: 'truefalse', richtigfalsch: 'truefalse', wahr_falsch: 'truefalse', tf: 'truefalse',
  zuordnen: 'sort', zuordnung: 'sort', sorting: 'sort', categorize: 'sort', kategorien: 'sort', matching: 'sort',
  lueckentext: 'gap', lückentext: 'gap', fill: 'gap', cloze: 'gap', fill_in: 'gap',
  arbeitsauftrag: 'task', auftrag: 'task', book: 'task', buch: 'task', assignment: 'task',
  umfrage: 'poll', abstimmung: 'poll', vote: 'poll', survey: 'poll',
  skala: 'scale', bewertung: 'scale', rating: 'scale', likert: 'scale',
  wortwolke: 'wordcloud', word_cloud: 'wordcloud', wordcloud: 'wordcloud', woerterwolke: 'wordcloud',
  offen: 'open', offene_frage: 'open', open_ended: 'open', freitext: 'open', openended: 'open',
  quizfrage: 'quiz', ranking: 'leaderboard', rangliste: 'leaderboard', bestenliste: 'leaderboard',
  labor: 'lab', diagrammlabor: 'lab', zusammenfassung: 'summary', ueberblick: 'summary', quellen: 'sources', literatur: 'sources',
};

export function resolveType(t) {
  const k = String(t || '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  if (TYPES[k]) return k;
  return SYNONYMS[k] || SYNONYMS[k.replace(/_/g, '')] || null;
}
