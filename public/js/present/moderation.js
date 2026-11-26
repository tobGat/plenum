// Moderationsfenster (z. B. am Laptop, während der Beamer die Folie zeigt): Notizen, Freigaben, Quiz, Spitznamen
import { html, raw, delegate, toast } from '../core/dom.js';
import { ic, logo } from '../core/icons.js';
import { prompt } from '../core/overlay.js';
import { awayBadge } from '../core/parts.js';
import { TYPES } from '/shared/types/index.js';

const PHASE = { idle: 'noch nicht gestartet', ready: 'Countdown läuft', running: 'Frage läuft', closed: 'beendet', revealed: 'aufgelöst' };
export function createModeration({ root, socket }) {
  let S = null;
  const cur = () => S && (S.lesson.slides.find((s) => s.id === S.slideId) || S.lesson.slides[0]);

  function modList(s, a) {
    if (!a) return '';
    if (s.type === 'wordcloud') return a.words.map((w) => html`<button class="modchip${w.visible ? ' vis' : ''}${w.flagged ? ' flag' : ''}" data-action="mod" data-mod="${w.visible ? 'hide' : 'show'}" data-key="${w.key}">${ic(w.flagged ? 'alert' : w.visible ? 'eye' : 'eyeoff')}${w.text} <small>${w.n}×</small></button>`);
    if (s.type === 'open') return a.items.map((x) => html`<button class="modchip block${x.visible ? ' vis' : ''}${x.flagged ? ' flag' : ''}" data-action="mod" data-mod="${x.visible ? 'hide' : 'show'}" data-key="${x.id}">${ic(x.flagged ? 'alert' : x.visible ? 'eye' : 'eyeoff')}${x.text}</button>`);
    return '';
  }
  function render() {
    if (!S || !S.presenting) { root.innerHTML = String(html`<div class="notapp"><div class="card">${ic('settings')}<h2>Keine Präsentation</h2><p>Das Moderationsfenster zeigt Notizen und Freigaben, sobald eine Präsentation läuft.</p></div></div>`); return; }
    const s = cur(), i = S.lesson.slides.indexOf(s), nx = S.lesson.slides[i + 1], def = TYPES[s.type], a = S.aggs[s.id];
    const quizCtl = s.type === 'quiz' ? html`<div class="bar">${['start', 'stop', 'reveal'].map((q) => html`<button class="btn" data-action="quiz" data-q="${q}">${ic(q === 'start' ? 'play' : q === 'stop' ? 'stop' : 'eye')}${q === 'start' ? 'Starten' : q === 'stop' ? 'Beenden' : 'Auflösen'}</button>`)}</div><p class="muted">Status: ${PHASE[(a ? a.phase : 'idle')] || (a ? a.phase : 'idle')} · ${a ? a.n : 0} Antworten</p>` : '';
    const hasQuiz = S.lesson.slides.some((x) => x.type === 'quiz');
    root.innerHTML = String(html`<div id="app" class="moderation"><header class="libhead"><div class="brand">${raw(logo())}<span class="chap">Moderation · ${S.lesson.title}</span></div><div class="hspace"></div><span class="livebadge"><span class="pulse"></span><b>${S.online}</b> online</span>${awayBadge(S.away)}</header>
      <main class="modmain"><section class="card"><div class="mod-nav"><button class="btn" data-action="prev" ${i === 0 ? 'disabled' : ''}>${ic('arrowl')}</button><div><small class="muted">Folie ${i + 1} von ${S.lesson.slides.length} · ${def.label}</small><h2>${s.title}</h2></div><button class="btn" data-action="next" ${nx ? '' : 'disabled'}>${ic('arrow')}</button></div>
        ${s.notes ? html`<div class="hint">${ic('notebook')}<span>${s.notes}</span></div>` : html`<p class="muted">Keine Notizen zu dieser Folie (im Editor unter „Notizen für die Lehrkraft“).</p>`}
        ${quizCtl}
        ${['wordcloud', 'open'].includes(s.type) ? html`<h3>Freigaben</h3><div class="bar"><button class="btn" data-action="mod" data-mod="showAll">${ic('eye')}Alle freigeben</button><button class="btn" data-action="mod" data-mod="hideAll">${ic('eyeoff')}Freigaben zurücknehmen</button></div><div class="modlist">${modList(s, a)}</div>` : ''}
        ${nx ? html`<p class="muted next-up">Als Nächstes: <b>${nx.title}</b> (${TYPES[nx.type].label})</p>` : ''}</section>
      ${hasQuiz ? html`<section class="card"><h3>${ic('trophy')} Quiz-Spitznamen</h3><label class="tglrow"><button class="tgl${S.freeNicks ? ' on' : ''}" data-action="freeNicks"><i></i>Eigene Spitznamen erlauben</button></label>
        <div class="players">${(S.players || []).map((p) => html`<div class="prow"><span>${p.nick}</span><button class="btn icon" title="Umbenennen" data-action="rename" data-cid="${p.cid}" data-nick="${p.nick}">${ic('edit')}</button><button class="btn icon" title="Automatischen Namen vergeben" data-action="autonick" data-cid="${p.cid}">${ic('refresh')}</button></div>`)}</div>
        <button class="btn danger" data-action="clearRanking">${ic('trash')}Rangliste löschen</button></section>` : ''}</main></div>`);
  }
  const go = (d) => { const i = S.lesson.slides.indexOf(cur()) + d, t = S.lesson.slides[i]; if (t) { S.slideId = t.id; socket.emit('host:slide', t.id); render(); } };
  const undel = [delegate(document.body, 'click', {
    prev: () => go(-1), next: () => go(1),
    quiz: (el) => socket.emit('host:quiz', { slideId: cur().id, action: el.dataset.q }),
    mod: (el) => socket.emit('host:moderate', { slideId: cur().id, action: el.dataset.mod, key: el.dataset.key }),
    freeNicks: () => { S.freeNicks = !S.freeNicks; socket.emit('host:freeNicks', S.freeNicks); render(); },
    rename: async (el) => { const n = await prompt('Spitznamen ändern', '', el.dataset.nick, { max: 16 }); if (n) socket.emit('host:nick', { cid: el.dataset.cid, name: n }, (r) => { if (!r.ok) toast(r.error || 'Nicht möglich', 'err'); }); },
    autonick: (el) => socket.emit('host:nick', { cid: el.dataset.cid, name: null }),
    clearRanking: () => { if (confirm('Rangliste und alle Quiz-Antworten löschen?')) socket.emit('host:clearRanking'); },
  })];
  const load = () => socket.emit('host:state', (st) => { S = st; render(); });
  const handlers = { agg: (d) => { if (S && S.aggs) { S.aggs[d.slideId] = d.data; if (d.slideId === S.slideId) render(); } }, slideChanged: (d) => { if (S) { S.slideId = d.slideId; render(); } }, players: (p) => { if (S) { S.players = p; render(); } }, online: (n) => { if (S) { S.online = n; render(); } }, away: (n) => { if (S && S.away !== n) { S.away = n; render(); } } };
  Object.entries(handlers).forEach(([e, f]) => socket.on(e, f));
  socket.on('connect', load);
  load();
  return { destroy() { undel.forEach((f) => f()); Object.entries(handlers).forEach(([e, f]) => socket.off(e, f)); socket.off('connect', load); } };
}
