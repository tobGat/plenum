# Plenum im Microsoft Store veröffentlichen

Plenum wird als **unsigniertes AppX/MSIX-Paket** gebaut; der Microsoft Store signiert es beim
Einreichen selbst. Die Projektkonfiguration ist vorbereitet (`package.json` → `build`,
`build/appxmanifest.xml`, `build/appx/*.png`).

> Auf diesem PC blockiert die Windows-Anwendungssteuerung (Smart App Control) selbst gebaute,
> unsignierte Programme. Das betrifft nur den **lokalen Test** des Pakets – der Store-Build
> selbst funktioniert. Installationstest deshalb über eine **private Einreichung** (Schritt 5).

---

## 1. Einmalig: Namen reservieren und Identität eintragen

1. Partner Center → **Apps und Spiele → Neues Produkt → MSIX- oder PWA-App** → Name
   **Plenum** reservieren. (Ist der Name vergeben, z. B. „Plenum – Unterricht live“ wählen und
   unten `displayName`/`productName` entsprechend anpassen.)
2. Partner Center → Plenum → **Produktverwaltung → Produktidentität**. Die drei Werte in
   `package.json` unter `build.appx` eintragen:

| Partner Center                              | `build.appx`           | derzeit (Platzhalter/Daskala-Konto) |
|---------------------------------------------|------------------------|--------------------------------------|
| Package/Identity/**Name**                   | `identityName`         | `tobGat.Plenum` ← **ersetzen**        |
| Package/Identity/**Publisher**              | `publisher`            | `CN=0C5A2E0E-4361-400B-B114-BF0C3369C879` |
| Package/Properties/**PublisherDisplayName** | `publisherDisplayName` | `tobGat`                              |

Die Werte sind keine Geheimnisse (sie stehen in jedem veröffentlichten Paket). `identityName`
und `publisher` müssen **zeichengenau** stimmen, sonst lehnt der Store das Paket ab.

---

## 2. Paket bauen

```powershell
npm install
npm run build:store
```

Das Skript ([scripts/build-store.cjs](../scripts/build-store.cjs))

1. führt die Tests aus (`npm test`),
2. erzeugt Logo, Programm-Icon und Kachelgrafiken (`npm run assets`),
3. erzeugt `THIRD-PARTY-NOTICES.txt` (`npm run notices`),
4. baut mit electron-builder **`dist/Plenum <version>.appx`** (nur x64, unsigniert),
5. **prüft das fertige Paket**: Identität, Anzeigename, Berechtigungen, Firewall-Regel,
   Dateizuordnung `.plenum`, Mindestversion, keine offenen Platzhalter, Lizenzhinweise.

Optionen: `--skip-tests`, `--skip-assets`, `--check-only` (nur ein vorhandenes Paket prüfen).
Der Hinweis „AppX is not signed – Windows Store only build“ ist korrekt so.

### Was im Manifest steckt

- **`privateNetworkClientServer`** – Plenum ist ein Server im lokalen Netz (Ports 3080–3089).
- **Firewall-Regel auf Paketebene** (`desktop2:FirewallRules`, eingehend TCP 3080–3089, nur
  für `app\Plenum.exe`, alle Profile) – die Klasse kann beitreten, ohne dass Windows beim
  ersten Start eine Firewall-Rückfrage zeigt.
- **`runFullTrust`** – setzt electron-builder automatisch; für Desktop-Apps zwingend.
- **Dateizuordnung `.plenum`** – Doppelklick auf eine Lektion importiert sie.
- **Mindestversion** Windows 10 1809 (10.0.17763), getestet bis 10.0.26100.

---

## 3. Version

Die Version kommt aus `package.json` (`version`, z. B. `1.0.0` → Paket `1.0.0.0`). Jede
Einreichung braucht eine **höhere** Version als die zuletzt veröffentlichte – vor dem Bauen
`version` erhöhen.

---

## 4. Einreichung im Partner Center

1. Plenum → **Neue Übermittlung**.
2. **Pakete:** `dist/Plenum <version>.appx` hochladen.
3. **Eigenschaften:** Kategorie **Bildung**. Datenschutzrichtlinie: **ja**, URL siehe unten.
   Hinweis „Diese App greift auf das lokale Netzwerk zu“ ist zutreffend.
4. **Altersfreigabe (IARC-Fragebogen):**
   - Interaktion zwischen Nutzer:innen / Teilen von Inhalten: **Ja** – Schüler:innen schicken
     im lokalen Netz kurze Texte (Wortwolke, offene Antworten), die die Lehrkraft freigibt.
   - Kein Chat mit Fremden, keine Standortweitergabe, keine Käufe, keine Werbung.
5. **Store-Eintrag** (Deutsch): Texte aus [STORE-LISTING.md](STORE-LISTING.md), mindestens ein
   Screenshot (1366 × 768 oder größer), Store-Logo `build/store-logo-300.png`.
6. **Datenschutzrichtlinie (URL):** z. B. `https://github.com/tobGat/plenum/blob/main/PRIVACY.md`
   (Repository anlegen und `PRIVACY.md` veröffentlichen) – Inhalt identisch mit der Seite
   „Datenschutz“ in der App.
7. **Anmerkungen für die Zertifizierung** (Feld „Notes for certification“):

   > Plenum is a classroom presentation tool. The teacher's PC runs a small local web server
   > (ports 3080–3089) so that students' phones in the same network can take part in polls and
   > quizzes. No account, no internet connection and no second device are required for testing:
   > 1) Start Plenum – a sample lesson is included. 2) Click „Präsentieren“. 3) Click
   > „Beitreten“ and then „Schüleransicht testen“ (or open http://localhost:3080 in Edge) to
   > join as a student and answer the poll and quiz slides.
   > runFullTrust: Plenum is a packaged Electron desktop application; runFullTrust
   > (Windows.FullTrustApplication) is technically required to run it, to host the local
   > classroom server and to read/write lesson files (.plenum) in the user's Documents folder.
   > privateNetworkClientServer and the package firewall rule allow devices in the local network
   > to connect. No data is sent to the developer or any third party.

8. **Preis & Verfügbarkeit:** kostenlos.
   **Erst-Test:** unter *Sichtbarkeit* „**Privates Publikum**“ (eigene Microsoft-Konto-Adresse)
   oder „Verborgen“ wählen. Nach der Zertifizierung lässt sich Plenum über den Store-Link auf
   diesem PC installieren – das ist der einzige Installationstest unter Smart App Control.
   Danach die Sichtbarkeit auf „Öffentlich“ stellen und neu einreichen.

### Testliste nach der Installation aus dem Store

- [ ] Start ohne Firewall-Rückfrage; Beispiellektion vorhanden (Ordner *Dokumente\Plenum-Lektionen*).
- [ ] Beitritt mit einem Handy im selben WLAN über Link **und** QR-Code.
- [ ] Doppelklick auf eine `.plenum`-Datei öffnet/importiert sie.
- [ ] Ein älteres iPad/Android-Gerät: Umfrage, Wortwolke, Quiz.
- [ ] Prüfen, ob Chrome auf Android bei `http://192.168…` eine HTTPS-Warnung zeigt.
- [ ] Nach Neustart: „Weitermachen“ mit gespeichertem Stand.

---

## 5. Lokaler Test des Paketinhalts (ohne Installation)

Die Dateien aus `dist/win-unpacked/resources/app.asar` lassen sich mit dem offiziellen
(signierten) Electron starten, das `npm install` mitbringt:

```powershell
node main/launch.cjs dist/win-unpacked/resources/app.asar
```

Automatisch: `node main/launch.cjs test/ui/packaged.mjs` startet Server und Oberfläche aus dem
Paketarchiv und prüft Bibliothek, QR-Code, Schüleransicht und Hilfeseiten.
