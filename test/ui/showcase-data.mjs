// Kurze Demo-Lektionen aus verschiedenen Fächern für Bildschirmfotos (Store, Website).
// Je Folie steht unter `demo`, was die simulierten Geräte antworten und wie das Bild heißen soll:
//   shot: Dateiname am Beamer · student: Dateiname der Schüleransicht (Laptop) · eval: Auswertung zeigen
//   words / texts / votes: Antworten der Geräte · pie: Kreisdiagramm wählen
const sec = (id, name, color, icon) => ({ id, name, color, icon });

export const LESSONS = [
  {
    title: 'Der Wasserkreislauf', subject: 'Biologie', grade: '6. Schulstufe', theme: 'aurora',
    sections: [sec('S-w1', 'Einstieg', 'blue', 'cloud'), sec('S-w2', 'Erarbeitung', 'teal', 'leaf')],
    slides: [
      { type: 'title', section: 'S-w1', title: 'Der Wasserkreislauf', kicker: 'Biologie · 6. Schulstufe', subtitle: 'Woher kommt der Regen – und wohin fließt er?', art: 'waves', layout: 'split',
        topics: [{ text: 'Was wir schon wissen', section: 'Einstieg' }, { text: 'Verdunsten, Wolken, Regen', section: 'Erarbeitung' }],
        demo: { shot: 'biologie-titelfolie' } },
      { type: 'wordcloud', section: 'S-w1', title: 'Woran denkst du bei Wasser?', question: 'Schreibe bis zu drei Begriffe.', maxWords: 3,
        discussion: 'Welche Begriffe haben mit dem Weg des Wassers zu tun?',
        demo: { shot: 'biologie-wortwolke', words: [['Regen', 'Meer', 'trinken'], ['Regen', 'Wolken', 'Fluss'], ['Meer', 'Eis', 'Regen'], ['trinken', 'Schwimmbad', 'Regen'], ['Wolken', 'Meer', 'Schnee'], ['Fluss', 'See', 'Regen'], ['Leben', 'trinken', 'Meer'], ['Gletscher', 'Wolken', 'Quelle'], ['Regen', 'Nebel', 'Tau'], ['Meer', 'Wellen', 'Fische']] } },
      { type: 'sort', section: 'S-w2', title: 'Fest, flüssig oder gasförmig?', question: 'In welchem Zustand ist das Wasser?',
        categories: [{ name: 'fest', items: ['Eis', 'Schnee', 'Hagel'] }, { name: 'flüssig', items: ['Regen', 'Tau', 'Meerwasser'] }, { name: 'gasförmig', items: ['Wasserdampf'] }],
        graphic: { src: 'lib:tropfen', pos: 'corner', size: 's' },
        demo: { shot: 'biologie-zuordnen-auswertung', eval: true, student: 'schueler-zuordnen' } },
      { type: 'gap', section: 'S-w2', title: 'Der Weg des Wassers', tip: 'Lies zuerst den ganzen Text.',
        text: 'Die Sonne erwärmt das Wasser, es [[verdunstet]]. Der Wasserdampf steigt auf und kühlt ab – er [[kondensiert]] zu kleinen Tröpfchen. So entstehen [[Wolken]].\nWerden die Tropfen zu schwer, fällt [[Niederschlag]] als Regen, Schnee oder Hagel. Über Bäche und Flüsse gelangt das Wasser zurück ins [[Meer]].',
        extra: ['Wüste', 'gefriert'], graphic: { src: 'lib:wetter', pos: 'right', size: 'm' },
        demo: { student: 'schueler-lueckentext' } },
    ],
  },
  {
    title: 'Das alte Ägypten', subject: 'Geschichte', grade: '6. Schulstufe', theme: 'paper',
    sections: [sec('S-a1', 'Leben am Nil', 'amber', 'globe'), sec('S-a2', 'Überprüfen', 'rose', 'target')],
    slides: [
      { type: 'info', section: 'S-a1', title: 'Leben am Nil',
        cards: [{ title: 'Der Fluss', text: 'Der Nil überschwemmte jedes Jahr die Ufer.\nZurück blieb fruchtbarer Schlamm.' }, { title: 'Die Menschen', text: 'Bauern legten Felder und Kanäle an.\nSchreiber hielten die Ernte fest.' }, { title: 'Merke', text: 'Ohne den Nil hätte es das Reich der Pharaonen nicht gegeben.' }],
        graphic: { src: 'lib:sonne', pos: 'corner', size: 's' },
        demo: { shot: 'geschichte-infofolie' } },
      { type: 'truefalse', section: 'S-a2', title: 'Stimmt das?', question: 'Richtig oder falsch?',
        items: [{ text: 'Die Pyramiden wurden als Grabstätten gebaut.', correct: true, explanation: 'Sie waren Gräber für Pharaonen.' }, { text: 'Der Nil fließt von Norden nach Süden.', correct: false, explanation: 'Er fließt von Süden nach Norden ins Mittelmeer.' }, { text: 'Papyrus wurde aus einer Pflanze hergestellt.', correct: true, explanation: 'Aus den Stängeln der Papyrusstaude.' }, { text: 'Hieroglyphen sind eine Bilderschrift.', correct: true, explanation: 'Zeichen stehen für Laute, Wörter oder Begriffe.' }],
        demo: { shot: 'geschichte-richtig-falsch-auswertung', eval: true } },
      { type: 'open', section: 'S-a2', title: 'Deine Frage an den Pharao', question: 'Was würdest du einen Pharao fragen, wenn du könntest?', maxLength: 120, maxAnswers: 1, approval: true,
        demo: { shot: 'geschichte-offene-antworten', texts: ['Wie lange hat der Bau deiner Pyramide gedauert?', 'Hattest du auch einmal Angst?', 'Was hast du am liebsten gegessen?', 'Wer durfte dich besuchen?', 'Konntest du selbst schreiben?', 'Was wolltest du als Kind werden?', 'Warum trägst du einen falschen Bart?', 'Gab es bei euch auch Schule?'] } },
    ],
  },
  {
    title: 'Past Simple', subject: 'Englisch', grade: '7. Schulstufe', theme: 'playful',
    sections: [sec('S-e1', 'Practice', 'violet', 'pen'), sec('S-e2', 'Quiz', 'fuchsia', 'trophy')],
    slides: [
      { type: 'mc', section: 'S-e1', title: 'Choose the correct form', question: 'She ___ a great film last night.',
        options: [{ text: 'see', correct: false }, { text: 'saw', correct: true }, { text: 'seen', correct: false }, { text: 'seed', correct: false }],
        explanation: '„see“ ist unregelmäßig: see – saw – seen. „Last night“ verlangt das Past Simple.',
        graphic: { src: 'lib:sprechblasen', pos: 'corner', size: 's' },
        demo: { shot: 'englisch-multiple-choice-auswertung', eval: true, student: 'schueler-multiple-choice' } },
      { type: 'quiz', section: 'S-e2', title: 'Quick quiz', question: 'What is the past form of “go”?',
        options: [{ text: 'goed', correct: false }, { text: 'went', correct: true }, { text: 'gone', correct: false }, { text: 'going', correct: false }], time: 20,
        demo: { shot: 'englisch-quiz' } },
      { type: 'leaderboard', section: 'S-e2', title: 'Rangliste', top: 5, demo: { shot: 'englisch-rangliste' } },
    ],
  },
  {
    title: 'Bruchrechnen', subject: 'Mathematik', grade: '6. Schulstufe', theme: 'chalk',
    sections: [sec('S-m1', 'Wiederholung', 'emerald', 'calc'), sec('S-m2', 'Üben', 'cyan', 'notebook')],
    slides: [
      { type: 'scale', section: 'S-m1', title: 'Wie sicher fühlst du dich?', statements: ['Ich kann Brüche kürzen und erweitern.', 'Ich kann Brüche mit verschiedenen Nennern addieren.', 'Ich kann Brüche auf dem Zahlenstrahl einordnen.'], steps: 5, minLabel: 'gar nicht', maxLabel: 'sehr sicher',
        demo: { shot: 'mathematik-skala' } },
      { type: 'task', section: 'S-m2', title: 'Jetzt im Heft', pages: 'Buch S. 48',
        tasks: [{ label: 'Nr. 3', form: 'allein', text: 'Berechne die Aufgaben a) bis f).\nKürze die Ergebnisse so weit wie möglich.' }, { label: 'Nr. 5', form: 'zu zweit', text: 'Erklärt einander, wie ihr den gemeinsamen Nenner findet.' }],
        graphic: { src: 'lib:rechner', pos: 'right', size: 'm' },
        demo: { shot: 'mathematik-arbeitsauftrag' } },
    ],
  },
  {
    title: 'Klassenrat', subject: 'Soziales Lernen', grade: '7. Schulstufe', theme: 'dark',
    sections: [sec('S-k1', 'Abstimmen', 'rose', 'vote')],
    slides: [
      { type: 'poll', section: 'S-k1', title: 'Wohin geht unser Wandertag?', question: 'Wohin soll unser Wandertag gehen?', hint: 'Jede Person hat genau eine Stimme. Die Abstimmung ist anonym.',
        options: ['Tierpark', 'Klettergarten', 'Schifffahrt', 'Museum'], discussion: 'Was spricht für den Sieger – und was machen wir, wenn es regnet?',
        demo: { shot: 'klassenrat-umfrage-kreisdiagramm', pie: true, votes: [1, 1, 0, 1, 2, 1, 0, 3, 2, 1] } },
    ],
  },
];
