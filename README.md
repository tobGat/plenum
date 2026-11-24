# Plenum

**Interaktiv durch den Unterricht.** Folien am Beamer, die Klasse macht am Handy mit:
Umfragen, Wortwolken, Skalen, offene Antworten, Quiz mit Rangliste und Aufgaben mit
Selbstkontrolle. Beitritt per Link oder QR-Code im lokalen Netz – ohne Konto, ohne Cloud.

Lektionen entstehen im Editor oder mit einem KI-Chat deiner Wahl (Plenum schreibt den Prompt,
prüft und repariert die Antwort und zeigt vor dem Übernehmen einen Vergleich). Sollen Buchseiten,
Arbeitsblätter oder Fotos einfließen, kreuzt man das im Dialog an: Der Prompt erklärt der KI, wie sie das
Material nutzt (z. B. eigene Folie „Zuerst im Buch …“), die Dateien hängt man direkt im KI-Chat an.

**Designs und Grafiken:** neun Präsentationsdesigns (`public/themes.css`, CSS-Variablen auf
`#app[data-theme]`), wählbare Titelmotive und -aufbauten, und je Folie eine Grafik – aus der
eigenen Illustrations-Bibliothek (`shared/graphics.js`, Farben folgen dem Abschnitt), als Symbol
oder als eigenes Bild. Eigene Bilder werden verkleinert (WebP) in die `.plenum`-Datei eingebettet
und vom Server unter `/media/<Lektion>/<Bild>` ausgeliefert – an die Klasse nur, solange die
Lektion präsentiert wird.

## Entwicklung

```powershell
npm install
npm start            # Programmfenster (Electron)
npm test             # Server-, Schema-, Import- und Prompt-Tests (node:test)
npm run test:ui      # Oberfläche mit echtem Electron, offscreen: Präsentation mit 6 Geräten, Editor, KI-Abläufe
npm run assets       # Logo, Icon und Store-Kacheln neu erzeugen
npm run build:store  # Microsoft-Store-Paket bauen und prüfen → docs/MICROSOFT-STORE.md
```

`npm start` und die Tests laufen über `main/launch.cjs`, das `ELECTRON_RUN_AS_NODE` entfernt
und das Electron-Programm bei Bedarf nachlädt.

## Aufbau

```
main/        Electron: Fenster, lokaler Server, Host-Schlüssel, .plenum-Dateien, Protokoll
server/      Express + Socket.IO: REST für die Lehrkraft, Räume, Quiz-Uhr, Moderation, Stände, KI-Import
shared/      ohne DOM, von Server und Browser genutzt: Lektionsformat, Typ-Registry, Felder, Prompt
public/      Oberfläche: Bibliothek, Editor, Vorschau, Präsentation, Moderation, Schüleransicht
samples/     Beispiellektion (wird beim ersten Start nach Dokumente\Plenum-Lektionen kopiert)
scripts/     Assets, Lizenzhinweise, Store-Build
test/        node:test und UI-Tests (test/ui)
build/       Icons, Store-Kacheln, AppX-Manifest
```

**Typ-Registry:** Jeder Folientyp ist einmal beschrieben – Daten und Regeln in
`shared/types/*.js` (Felder mit Limits, Beispiel, Reparatur, `toStudent`, `accept`,
`aggregate`, Fingerabdruck), Darstellung in `public/js/types/*.js`. Daraus entstehen
Editor-Formular, Import-Prüfung und KI-Prompt.

## Lektionsformat (`.plenum`)

JSON mit `format: "plenum-lektion"`, `version`, Titel, Abschnitten und Folien. Lösungen
stehen ohne Indizes direkt in den Feldern (`options: [{ text, correct }]`,
`categories: [{ name, items }]`, Lücken als `[[Lösung|Alternative]]`). Diagramme sind
deklarativ: `chart: { type, title, labels, series: [{ name, values }], unit, source }`.

## Sicherheit und Datenschutz

Der Lehrkraft-Bereich ist nur am eigenen Computer erreichbar (Loopback, Host-/Origin-Prüfung,
zufälliger Schlüssel je Start als Cookie), dazu eine strenge Content-Security-Policy.
Schülergeräte erhalten nur die aktuelle Folie, Quizlösungen erst bei der Auflösung.
Details: [PRIVACY.md](PRIVACY.md).

## Lizenz

© 2026 Tobias Gatterbauer – GPL-3.0-or-later ([LICENSE](LICENSE)).
Drittsoftware: [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Website (plenum.schulapps.at)

Statische Infoseite mit Impressum und Datenschutzerklärung, ohne JavaScript, externe Schriften oder Tracker.
Quelle: `website/` (Seiten in `pages/`, Bilder in `img/`, Datenschutz aus `PRIVACY.md` plus `content/datenschutz-website.md`).

1. `npm run build:site` baut nach `dist-site/`. Der Store-Link steht in `website/build.mjs` (`STORE_URL`); leer = „Bald im Microsoft Store“.
2. `npm run stage:site` baut und lädt Seite, nginx-Site und Skript nach `/home/claude/plenum-site` am Server (kein sudo, ändert nichts am laufenden Server).
3. Live schalten am Server: `sudo bash /home/claude/plenum-site/deploy-plenum-site.sh` (legt beim ersten Mal die nginx-Site an und holt das Zertifikat).
