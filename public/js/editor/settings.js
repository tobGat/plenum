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
  const words = (info.settings?.extraWords || []).join(', ');
  const box = overlay(html`<div class="ov-ic">${ic('settings')}</div><h2>Einstellungen</h2>
    <div class="setgrid">
      <section><h3>${ic('file')} Lektionsordner</h3><p class="muted">${info.lessonsDir}</p>${window.plenumApp?.chooseFolder ? html`<button class="btn" data-x="dir">${ic('file')}Anderen Ordner wählen …</button>` : ''}
        <p class="muted small">Lektionen sind .plenum-Dateien. Ein Ordner in OneDrive o. Ä. funktioniert; gespeicherte Stände bleiben auf diesem PC.</p></section>
      <section><h3>${ic('alert')} Eigene Filterwörter</h3><p class="muted small">Antworten, Begriffe und Spitznamen mit diesen Wörtern werden zurückgehalten, bis du sie freigibst (zusätzlich zur eingebauten Liste). Mit Komma trennen.</p>
        <textarea class="field" rows="3" id="setWords" placeholder="z. B. Spitznamen von Lehrkräften">${words}</textarea></section>
    </div>
    <div class="ov-actions"><button class="btn" data-x="close">Schließen</button><button class="btn primary" data-x="save">${ic('check')}Speichern</button></div>`, { wide: true });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'close') closeOv();
    if (b.dataset.x === 'save') {
      const extraWords = document.getElementById('setWords').value.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
      try { info.settings = await api('/settings', { method: 'PUT', body: { extraWords } }); toast('Gespeichert'); closeOv(); } catch (err) { toast(err.message, 'err'); }
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
    <h3>Die Klasse kommt nicht hinein?</h3>
    <ul><li>Alle Geräte müssen im <b>selben Netzwerk</b> sein wie dieser Computer.</li><li>Manche Schul- und Gast-WLANs trennen Geräte voneinander (Client-Isolation). Dann hilft ein gemeinsames Netz, z. B. der <b>mobile Hotspot</b> von Windows (Einstellungen → Netzwerk und Internet → Mobiler Hotspot).</li>
      <li>Hat der Computer mehrere Netzwerke (LAN und WLAN), im Fenster „Beitreten“ das richtige wählen.</li><li>Mit „Schüleransicht testen“ siehst du die Seite so, wie sie die Klasse sieht.</li></ul>
    <h3>Tastatur</h3><p>Pfeiltasten oder Präsentations-Klicker (Bild auf/ab) blättern, F11 oder die Schaltfläche oben rechts in der Präsentation schaltet das Vollbild ein und aus, Strg + / − Zoom.</p>
    <h3>Datenschutz</h3><p>Plenum braucht kein Konto und schickt nichts ins Internet. Alles läuft auf diesem Computer im lokalen Netz; Antworten sind anonym (im Quiz mit automatischen Spitznamen). <a href="/datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a> · <a href="/lizenzen.html" target="_blank" rel="noopener">Lizenzen</a></p>
    <p class="muted small">Plenum ${info.version || ''} · Port ${info.port}</p></div>
    <div class="ov-actions"><button class="btn" data-report="1" title="Version, System und Fehlerprotokoll kopieren – enthält keine Antworten der Klasse">${ic('copy')}Fehlerbericht kopieren</button><button class="btn primary" data-close="1">Schließen</button></div>`, { wide: true }).addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeOv(); else if (e.target.closest('[data-report]')) copyReport(); });
}
