// Einstellungen und Hilfe
import { html, toast, copyText } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { overlay, closeOv } from '../core/overlay.js';
import { api } from '../core/api.js';

// Fehlerbericht: Version, System und das Ende des lokalen Protokolls in die Zwischenablage (keine Antworten der Klasse)
async function copyReport() {
  try {
    const r = await api('/log');
    const text = `Plenum ${r.version}${r.store ? ' (Store)' : ''} · ${r.os}\n\n${r.text || '(kein Protokoll vorhanden)'}`;
    toast((await copyText(text)) ? 'Fehlerbericht kopiert – z. B. in eine E-Mail einfügen' : 'Kopieren nicht möglich', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

export function showSettings({ api, info, onChanged }) {
  const words = (info.settings?.extraWords || []).join(', '), maxChanges = info.settings?.maxChanges ?? 2;
  const CHG = [[-1, 'beliebig oft'], [0, 'gar nicht – die erste Antwort zählt'], [1, 'höchstens einmal'], [2, 'höchstens zweimal'], [3, 'höchstens dreimal'], [5, 'höchstens fünfmal']];
  const box = overlay(html`<div class="ov-ic">${ic('settings')}</div><h2>Einstellungen</h2>
    <div class="setgrid">
      <section><h3>${ic('file')} Lektionsordner</h3><p class="muted">${info.lessonsDir}</p>${window.plenumApp?.chooseFolder ? html`<button class="btn" data-x="dir">${ic('file')}Anderen Ordner wählen …</button>` : ''}
        <p class="muted small">Lektionen sind .plenum-Dateien. Ein Ordner in OneDrive o. Ä. funktioniert; gespeicherte Stände bleiben auf diesem PC.</p></section>
      <section><h3>${ic('alert')} Eigene Filterwörter</h3><p class="muted small">Antworten, Begriffe und Spitznamen mit diesen Wörtern werden zurückgehalten, bis du sie freigibst (zusätzlich zur eingebauten Liste). Mit Komma trennen.</p>
        <textarea class="field" rows="3" id="setWords" placeholder="z. B. Spitznamen von Lehrkräften">${words}</textarea></section>
      <section><h3>${ic('lock')} Antwort ändern</h3><p class="muted small">Gegen ständiges Umstimmen: So oft darf ein Gerät seine Antwort pro Aufgabe ändern. Danach ist sie fixiert, die letzte Antwort zählt. Bei der nächsten Aufgabe beginnt die Zählung neu.</p>
        <select class="field" id="setChanges" aria-label="Antwort ändern">${CHG.map(([v, l]) => html`<option value="${v}" ${v === maxChanges ? 'selected' : ''}>${l}</option>`)}</select></section>
    </div>
    <div class="ov-actions"><button class="btn" data-x="close">Schließen</button><button class="btn primary" data-x="save">${ic('check')}Speichern</button></div>`, { wide: true });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'close') closeOv();
    if (b.dataset.x === 'save') {
      const extraWords = document.getElementById('setWords').value.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
      try { info.settings = await api('/settings', { method: 'PUT', body: { extraWords, maxChanges: +document.getElementById('setChanges').value } }); toast('Gespeichert'); closeOv(); } catch (err) { toast(err.message, 'err'); }
    }
    if (b.dataset.x === 'dir') {
      const dir = await window.plenumApp.chooseFolder(info.lessonsDir);
      if (!dir) return;
      try { const r = await api('/lessonsDir', { method: 'POST', body: { dir } }); info.lessonsDir = r.lessonsDir; toast('Lektionsordner geändert'); closeOv(); onChanged && onChanged(); } catch (err) { toast(err.message, 'err'); }
    }
  });
}

export function showHelp({ info }) {
  overlay(html`<div class="ov-ic">${ic('info')}</div><h2>Hilfe</h2><div class="helptext">
    <h3>So funktioniert Plenum</h3>
    <ol><li><b>Lektion vorbereiten:</b> „Neue Lektion“ und Folien im Editor anlegen – oder „Mit KI erstellen“: Plenum schreibt einen Auftrag für einen Chatbot, du fügst dessen Antwort wieder ein.</li>
      <li><b>Präsentieren:</b> Der Beamer zeigt die Folien. Die Klasse öffnet den Link oder scannt den QR-Code („Beitreten“) – ohne Konto, ohne Code.</li>
      <li><b>Mitmachen:</b> Umfragen, Wortwolken, Skalen, offene Antworten und Quizfragen erscheinen live vorne. Ergebnisse bleiben als „Stand“ erhalten, z. B. pro Klasse.</li></ol>
    <h3>Suchen</h3><p>Das Suchfeld in der Bibliothek (Strg+F) durchsucht Titel, Fach, Schulstufe und die Texte aller Folien. Mehrere Wörter grenzen ein: Es erscheinen nur Lektionen, in denen alle vorkommen. Die Karte zeigt, auf welchen Folien das Stichwort steht.</p>
    <h3>Themenserien</h3><p>Im Tab „Themenserien“ ordnest du Lektionen zu einem Plan, etwa für ein Kapitel oder ein Semester. Ziehe links eine Lektion oder eine „Freie Karte“ (z. B. „Schularbeit“) auf die Matrix – oder tippe sie an und dann eine freie Zelle. Pfeile entstehen, indem du an einem der Pfeil-Anfasser am Rand einer Karte ziehst und auf einer anderen Karte loslässt; ein Pfeil bedeutet „danach kommt“. Eine angetippte Karte zeigt oben „Präsentieren“, „Bearbeiten“, „Verbinden“ und „Entfernen“. „Exportieren“ speichert die Serie samt allen Lektionen in einer Datei zum Weitergeben, „PDF“ erzeugt eine Tabelle (A4 quer): die Themen in der Reihenfolge der Pfeile mit Inhalten, Umfang, „Baut auf“ und leeren Spalten für Datum und Notizen. „Bild“ speichert die Matrix so, wie sie aussieht, als PNG. „Mit KI planen“ im Tab „Themenserien“ lässt einen KI-Chat die Abfolge der Themen vorschlagen – daraus entstehen Platzhalter-Karten ohne Inhalte. Eine freie Karte ist ein Platzhalter: Über „Neues Thema erstellen“ (auch im geöffneten Platzhalter, wahlweise mit KI) entsteht dazu eine neue Lektion, über „Lektion einsetzen“ (oder Ziehen einer Lektion auf die Karte) eine vorhandene – Position und Pfeile bleiben. Auf der letzten Folie und beim Beenden einer Lektion fragt Plenum, ob es mit dem nächsten Thema der Serie weitergehen soll; die Geräte der Klasse wechseln von selbst mit.</p>
    <h3>Bild und Farbe der Themenserie</h3><p>Über „⋯“ → „Bild und Farbe“ bekommt eine Themenserie in der Übersicht eine Farbe und ein Bild: eine Illustration, ein Symbol oder ein eigenes Bild (hochladen, hineinziehen oder mit Strg+V einfügen). Passt ein eigenes Bild nicht ins Format, ziehst du es in der Vorschau, bis der richtige Ausschnitt zu sehen ist. Ohne Auswahl zeigt die Karte eine kleine Vorschau der Matrix.</p>
    <h3>Farbe und Bild</h3><p>Über „⋯“ → „Farbe und Bild“ bekommt die Karte einer Lektion eine eigene Farbe und eine Illustration, ein Symbol oder ein eigenes kleines Bild – etwa eine Farbe pro Fach oder Klasse. Das ändert nur die Übersicht, nicht die Folien.</p>
    <h3>Skala: vorher und nachher</h3><p>Die Skala zeigt je Aussage, wie viele welche Stufe gewählt haben, und den Mittelwert. Kommt dieselbe Aussage in einer Lektion zweimal vor (z. B. Selbsteinschätzung am Beginn und am Ende, gleiche Stufenzahl), zeigt die spätere Folie die Veränderung gegenüber der früheren.</p>
    <h3>Ständiges Umstimmen</h3><p>Jedes Gerät darf seine Antwort pro Aufgabe höchstens zweimal ändern. Danach ist sie fixiert – die letzte Antwort zählt, und bei der nächsten Aufgabe geht es normal weiter. Vorne steht dann z. B. „2 fixiert“ (nur die Anzahl, ohne Namen). Die Grenze lässt sich in den Einstellungen ändern oder abschalten.</p>
    <h3>Videos</h3><p>Der Folientyp „Video“ zeigt ein verlinktes Video (z. B. von YouTube) am Beamer, dazu Beobachtungsaufträge, die auch auf den Geräten der Klasse stehen. Das Video lädt erst nach deinem Klick; dafür braucht dieser Computer Internet. Bei „Mit KI erstellen“ kannst du Video-Links angeben – die KI plant sie als Folien ein und baut Aufgaben dazu.</p>
    <h3>Folien als PDF</h3><p>In der Bibliothek über „⋯“ bei der Lektion, im Editor über „PDF“: wahlweise nur die Fragen (zum Austeilen oder zum Präsentieren ohne Plenum), mit Lösungen oder mit den Ergebnissen eines gespeicherten Stands – als Präsentation (eine Folie pro Seite) oder als Handzettel (A4, drei Folien pro Seite mit Notizen). Während der Präsentation: „Speichern“ → „Ergebnisse als PDF“.</p>
    <h3>Die Klasse kommt nicht hinein?</h3>
    <ul><li>Alle Geräte müssen im <b>selben Netzwerk</b> sein wie dieser Computer.</li><li>Manche Schul- und Gast-WLANs trennen Geräte voneinander (Client-Isolation). Dann hilft ein gemeinsames Netz, z. B. der <b>mobile Hotspot</b> von Windows (Einstellungen → Netzwerk und Internet → Mobiler Hotspot).</li>
      <li>Hat der Computer mehrere Netzwerke (LAN und WLAN), im Fenster „Beitreten“ das richtige wählen.</li><li>Mit „Schüleransicht testen“ siehst du die Seite so, wie sie die Klasse sieht.</li></ul>
    <h3>Tastatur</h3><p>Pfeiltasten oder Präsentations-Klicker (Bild auf/ab) blättern, F11 oder die Schaltfläche oben rechts in der Präsentation schaltet das Vollbild ein und aus, Strg + / − Zoom.</p>
    <h3>Datenschutz</h3><p>Plenum braucht kein Konto und schickt nichts ins Internet. Einzige Ausnahme: Ein Video auf einer Video-Folie wird nach deinem Klick auf „Video abspielen“ von seinem Anbieter (z. B. YouTube) geladen – nur auf diesem Computer, nie auf den Geräten der Klasse. Alles andere läuft auf diesem Computer im lokalen Netz; Antworten sind anonym (im Quiz mit automatischen Spitznamen). <a href="/datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a> · <a href="/lizenzen.html" target="_blank" rel="noopener">Lizenzen</a></p>
    <p class="muted small">Plenum ${info.version || ''} · Port ${info.port}</p></div>
    <div class="ov-actions"><button class="btn" data-report="1" title="Version, System und Fehlerprotokoll kopieren – enthält keine Antworten der Klasse">${ic('copy')}Fehlerbericht kopieren</button><button class="btn primary" data-close="1">Schließen</button></div>`, { wide: true }).addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeOv(); else if (e.target.closest('[data-report]')) copyReport(); });
}
