// Einfacher Wortfilter für Freitext, Wortwolke und Spitznamen.
// Treffer werden nicht gelöscht, sondern zurückgehalten, bis die Lehrkraft sie freigibt.
// Die Liste ist bewusst knapp (grobe Beschimpfungen, Beleidigungen, Hassbegriffe) und in den Einstellungen erweiterbar.
const BASE = ['arsch', 'scheiss', 'scheis', 'fick', 'ficken', 'wichser', 'wixer', 'hure', 'hurensohn', 'fotze', 'schlampe', 'missgeburt',
  'spast', 'mongo', 'schwuchtel', 'neger', 'nigger', 'nigga', 'kanake', 'zigeuner', 'nazi', 'hitler', 'siegheil', 'heilhitler',
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'porno', 'penner', 'opfer', 'vollidiot', 'drecksau', 'sau', 'kacke', 'pisser'];

// Text vereinheitlichen: klein, Umlaute, Ziffern-Ersatz (Leetspeak), nur Buchstaben
export function normalizeForFilter(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' }[c])).replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/5|\$/g, 's').replace(/7/g, 't')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

// Sehr kurze Wörter („sau“) nur als ganzes Wort werten, längere auch als Teil („arschloch“)
export function isFlagged(text, extra = []) {
  const words = String(text || '').toLowerCase().split(/[\s,.;:!?()"'„“]+/).map(normalizeForFilter).filter(Boolean);
  const joined = normalizeForFilter(text);
  const list = BASE.concat(extra.map(normalizeForFilter).filter(Boolean));
  return list.some((w) => (w.length <= 4 ? words.includes(w) : joined.includes(w)));
}
