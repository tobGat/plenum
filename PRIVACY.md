# Datenschutzrichtlinie – Plenum

**Stand: 23. November 2026**

Plenum ist eine Unterrichts-App für Lehrkräfte: Folien, Aufgaben, Umfragen, Wortwolken,
offene Antworten und Quizfragen, bei denen die Klasse mit ihren eigenen Geräten im
**lokalen Netzwerk** mitmacht. Diese Richtlinie erklärt, welche Daten dabei verarbeitet
werden – und welche **nicht**.

## Grundsatz: Alles bleibt im Klassenzimmer

- Plenum läuft auf dem Computer der Lehrkraft. Dieser Computer ist zugleich der Server,
  mit dem sich die Geräte der Schüler:innen im selben Netzwerk (WLAN/LAN) verbinden.
- Es gibt **kein Benutzerkonto**, **keinen Cloud-Dienst**, **keine Telemetrie**, **kein
  Tracking** und **keine Werbung**.
- Der Anbieter erhält **keine** Daten von Lehrkräften oder Schüler:innen.

## Verantwortlicher

Anbieter der App: Tobias Gatterbauer · Kontakt: t.gatterbauer@proton.me

Weil alle Daten ausschließlich auf dem Computer der Lehrkraft und den Geräten der Klasse
verarbeitet werden, hat der Anbieter darauf keinen Zugriff. Im Sinne der DSGVO ist die
nutzende Lehrkraft bzw. ihre Schule für die im Unterricht verarbeiteten Daten
verantwortlich.

## Welche Daten verarbeitet Plenum?

1. **Lektionen** – die Inhalte, die die Lehrkraft erstellt oder importiert. Sie liegen als
   `.plenum`-Dateien im Ordner *Dokumente\Plenum-Lektionen* (in den Einstellungen änderbar).
   Eigene Bilder auf Folien werden verkleinert in diese Datei eingebettet; die Geräte der
   Klasse erhalten sie nur, solange die Lektion präsentiert wird.
2. **Antworten der Klasse** – Stimmen bei Umfragen, Skalenwerte, Begriffe für die
   Wortwolke, offene Antworten (Freitext), Lösungen von Aufgaben und Quizantworten mit
   Punkten. Sie werden während der Präsentation verarbeitet und als **„Stand“** auf dem
   Computer der Lehrkraft gespeichert (automatisch und auf Wunsch unter einem Namen), damit
   eine Stunde später fortgesetzt werden kann. Exportiert die Lehrkraft Folien „mit
   Ergebnissen“ als PDF, enthält diese Datei die ausgewerteten Antworten (ohne Namen;
   Begriffe und Freitexte nur, soweit sie freigegeben sind) und liegt dort, wo die Lehrkraft
   sie speichert.
3. **Zufällige Gerätekennung** – jedes Schülergerät erzeugt beim ersten Besuch eine
   zufällige Zeichenfolge und speichert sie im Browser (Local Storage). Damit bleiben
   Antworten nach dem Neuladen der Seite zugeordnet. Die Kennung enthält **keinen Namen**
   und keine Gerätedaten.
4. **Spitznamen im Quiz** – standardmäßig vergibt Plenum automatisch Namen wie „Fuchs 12“.
   Erlaubt die Lehrkraft eigene Spitznamen, können Schüler:innen einen Namen eingeben
   (höchstens 16 Zeichen, mit Wortfilter; die Lehrkraft kann ihn ändern oder entfernen).
   Spitznamen werden **nur während der Präsentation** im Arbeitsspeicher gehalten und
   **nicht** in Stände gespeichert.
5. **Anwesenheit** – die Schülerseite meldet, ob sie gerade im Vordergrund ist oder ob auf
   einen anderen Tab oder ein anderes Programm gewechselt wurde. Die Lehrkraft sieht daraus
   **nur eine Anzahl** („3 nicht in Plenum“), nicht, welches Gerät es ist. Plenum sieht
   nicht, was auf dem Gerät sonst geöffnet ist, und speichert diese Angabe nicht.
6. **Fehlerprotokoll** – eine lokale Textdatei mit technischen Meldungen (z. B. Start,
   Fehler), höchstens etwa 1 MB, ältere Einträge werden überschrieben. Sie enthält keine
   Antworten der Klasse.

IP-Adressen der Geräte werden nur für den Verbindungsaufbau verwendet und **nicht
gespeichert**.

## Übertragung im lokalen Netzwerk

- Die Geräte der Klasse verbinden sich über **unverschlüsseltes HTTP** direkt mit dem
  Computer der Lehrkraft; eine Internetverbindung ist dafür nicht nötig. Im selben
  Netzwerk könnten Dritte den Datenverkehr grundsätzlich mitlesen. Empfehlung: ein
  geschütztes Schul-WLAN oder einen Hotspot mit Passwort verwenden und in offenen
  Antworten keine sensiblen persönlichen Daten erfragen.
- Die Geräte der Klasse erhalten **nur die gerade gezeigte Folie** – nicht die ganze
  Lektion und bei Quizfragen keine Lösung vor der Auflösung.
- Der Lehrkraft-Bereich (Bearbeiten, Präsentieren, Auswertungen) ist **nur am Computer der
  Lehrkraft** erreichbar und durch einen bei jedem Programmstart neu erzeugten, zufälligen
  Schlüssel geschützt.
- Plenum öffnet für die Klasse die Netzwerk-Ports 3080–3089 (eingehend, nur für Plenum).

## Verbindungen ins Internet

Plenum stellt von sich aus **keine Verbindung ins Internet** her. Ausnahmen:

- **Video-Folien:** Hat die Lehrkraft auf einer Folie ein Video verlinkt (z. B. von
  YouTube), lädt Plenum es **erst nach ihrem Klick auf „Video abspielen“** – und nur auf dem
  Computer der Lehrkraft. Dabei wird eine Verbindung zum Anbieter des Videos aufgebaut (bei
  YouTube über die datensparsame Adresse *youtube-nocookie.com*; es gelten die
  Datenschutzbestimmungen von Google). Die Geräte der Schüler:innen zeigen nur die Aufträge
  zum Video und verbinden sich **nicht** mit dem Anbieter.
- **Installation und Updates** erfolgen über den Microsoft Store; dabei gelten die
  Datenschutzbestimmungen von Microsoft.
- **Links** (z. B. auf einer Quellen-Folie) öffnen sich nur nach einem Klick im
  Standardbrowser.
- **KI-Funktion:** Plenum erzeugt nur einen Text (Prompt), den die Lehrkraft selbst in
  einen KI-Chat ihrer Wahl kopiert, und liest die eingefügte Antwort wieder ein. Plenum
  sendet dabei nichts; für den KI-Dienst gelten dessen eigene Bedingungen. Bitte keine
  personenbezogenen Daten von Schüler:innen in Prompts einfügen.
- **Material für den KI-Chat** (z. B. eigene Arbeitsblätter oder Unterlagen): Plenum erhält diese
  Dateien nicht. Die Lehrkraft gibt in Plenum nur an, dass sie Material anhängt, und hängt
  es im KI-Chat selbst an. Bitte nur Material verwenden, das an den KI-Dienst weitergegeben
  werden darf, und keine Fotos oder Namen von Schüler:innen.

## Aufbewahrung und Löschen

- **Stände** lassen sich in der Präsentation über *Speichern* einzeln löschen. Beim
  Löschen einer Lektion werden auch ihre Stände gelöscht.
- **„Rangliste löschen“** (Moderationsfenster) entfernt alle Quizpunkte und Spitznamen.
- **Deinstallation:** Windows entfernt die App-Daten (Stände, Einstellungen, Protokoll).
  Lektionen im Ordner *Dokumente\Plenum-Lektionen* bleiben erhalten und können dort gelöscht werden.
- **Schülergeräte:** Die Gerätekennung verschwindet, wenn die Website-Daten der
  Plenum-Adresse im Browser gelöscht werden.

## Kinder

Plenum wird von Lehrkräften im Unterricht eingesetzt. Schüler:innen benötigen weder ein
Konto noch eine E-Mail-Adresse noch ihren echten Namen.

## Änderungen

Wird diese Richtlinie geändert, steht die aktuelle Fassung an dieser Stelle; das Datum oben
zeigt den Stand.

## Kontakt

Fragen zum Datenschutz: t.gatterbauer@proton.me
