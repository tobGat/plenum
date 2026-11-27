// Gemeinsame Helfer für Bibliothek und Serien-Editor: Suchen, Sortieren, Schulstufen
// Groß-/Kleinschreibung, Akzente und Umlaut-Punkte spielen beim Suchen keine Rolle („blatter“ findet „Blätter“)
export const norm = (s) => String(s || '').toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const de = (a, b) => String(a).localeCompare(String(b), 'de', { numeric: true, sensitivity: 'base' });
// Schulstufe: nach der ersten Zahl sortieren („4. Klasse“ vor „10. Schulstufe“), ohne Zahl ans Ende
export const gradeNum = (g) => { const m = String(g || '').match(/\d+/); return m ? +m[0] : 999; };
export const byGrade = (a, b) => gradeNum(a) - gradeNum(b) || de(a, b);
export const SORTS = [['updated', 'Zuletzt geändert'], ['title', 'Titel (A–Z)'], ['subject', 'Fach'], ['grade', 'Schulstufe']];
export function sortLessons(list, sort) {
  if (sort === 'title') list.sort((a, b) => de(a.title, b.title));
  else if (sort === 'subject') list.sort((a, b) => de(a.subject || '￿', b.subject || '￿') || byGrade(a.grade, b.grade) || de(a.title, b.title));
  else if (sort === 'grade') list.sort((a, b) => byGrade(a.grade, b.grade) || de(a.subject || '￿', b.subject || '￿') || de(a.title, b.title));
  else list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return list;
}
export const distinct = (list, key, cmp) => [...new Set(list.map((l) => (l[key] || '').trim()).filter(Boolean))].sort(cmp);
// Farben reihum für Karten ohne eigene Farbe
export const AUTO_COLORS = ['indigo', 'teal', 'blue', 'violet', 'emerald', 'amber', 'cyan', 'rose', 'fuchsia'];
