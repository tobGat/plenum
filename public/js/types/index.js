// Registry der Darstellungen (Gegenstück zu shared/types/index.js)
import { title, info, gap, lab, summary, sources } from './content.js';
import { mc, truefalse, sort, task } from './exercises.js';
import { poll, scale, wordcloud, open } from './live.js';
import { quiz, leaderboard } from './quiz.js';

export const RENDER = { title, info, gap, lab, summary, sources, mc, truefalse, sort, task, poll, scale, wordcloud, open, quiz, leaderboard };
