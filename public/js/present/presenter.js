// Präsentationsansicht der Lehrkraft (Beamer): Folien, Live-Auswertung, Beitritt (Link + QR), Stände
import { html, raw, esc, delegate, fmt, toast, whenStr, copyText } from '../core/dom.js';
import { ic, logo } from '../core/icons.js';
import { fit, autoFit } from '../core/fit.js';
import { overlay, closeOv, ask, ovOpen } from '../core/overlay.js';
import { shead, colorOf, ring, animWidths, resetSegs, resetRings, applyTheme, themeCols, withGraphic, awayBadge } from '../core/parts.js';
import { CH, chartReset } from '../charts.js';
import { RENDER } from '../types/index.js';
import { TYPES } from '/shared/types/index.js';

const SELF = ['mc', 'truefalse', 'sort'];

export function createPresenter({ root, socket, api, info, onExit }) {
  let S = null; // Zustand vom Server: { lesson, slideId, sync, aggs, online, slot, changed, players, freeNicks }
  let lastId = null, savedAt = 0, full = false, adapter = info.settings?.adapter || '';
  const prefs = {}, local = {};

  root.innerHTML = String(html`<div id="app" class="present">
    <header id="hd"><div class="brand">${raw(logo())}<span class="chap" id="hchap"></span></div><div class="secpill" id="hsec"></div><div class="hspace"></div><div id="hroom"></div><div id="hnum"></div></header>
    <div id="tabs" role="tablist"></div><div id="prog"><div id="pbar"></div></div>
    <main id="content" tabindex="-1"></main>
    <nav><button class="nb" id="prev" data-action="prev">${ic('arrowl')}<span>Zurück</span></button><div id="dots"></div><button class="nb" id="next" data-action="next"><span>Weiter</span>${ic('arrow')}</button></nav></div>`);
  const $ = (id) => document.getElementById(id), content = $('content');
  autoFit(content);

  const cur = () => S.lesson.slides.find((s) => s.id === S.slideId) || S.lesson.slides[0];
  const secOf = (s) => S.lesson.sections.find((x) => x.id === s.section) || S.lesson.sections[0];
  const secCol = (sec) => ({ ...themeCols(colorOf(sec.color), S.lesson.theme), name: sec.name, icon: sec.icon, color: sec.color });
  const mediaUrl = (id) => `/media/${S.lesson.id}/${id}`;
  const urls = () => info.urls || [];
  const joinUrl = () => { const u = urls().find((x) => x.address === adapter) || urls()[0]; return u ? u.url : ''; };

  function ctxFor(s) {
    const i = S.lesson.slides.indexOf(s);
    return { lesson: S.lesson, sec: secCol(secOf(s)), agg: S.aggs[s.id], prefs: prefs[s.id] || (prefs[s.id] = {}), local: local[s.id] || (local[s.id] = {}), key: 'c',
      online: S.online, joinUrl: joinUrl(), next: S.lesson.slides[i + 1], render: () => renderBody(false), goto, theme: S.lesson.theme || 'standard', mediaUrl };
  }

  // ---------- Zeichnen ----------
  function render() {
    const s = cur(), sec = secOf(s), col = colorOf(sec.color), fresh = s.id !== lastId;
    applyTheme($('app'), S.lesson.theme, col);
    $('hchap').textContent = S.lesson.title;
    $('hsec').innerHTML = String(html`${ic(sec.icon)}<span>${sec.name}</span>`);
    const idx = S.lesson.slides.indexOf(s), n = S.lesson.slides.length;
    $('hnum').innerHTML = `<b>${idx + 1}</b> / ${n}`;
    $('pbar').style.width = `${((idx + 1) / n) * 100}%`;
    $('tabs').innerHTML = String(html`${S.lesson.sections.filter((x) => S.lesson.slides.some((y) => y.section === x.id)).map((x) => html`<button class="${x.id === sec.id ? 'on' : ''}" style="--tc:${colorOf(x.color).c}" data-action="sec" data-id="${x.id}" role="tab" aria-selected="${x.id === sec.id}"><i></i>${x.name}</button>`)}`);
    $('dots').innerHTML = String(html`<select id="jump" aria-label="Folie wählen" data-change="jump">${S.lesson.sections.map((x) => html`<optgroup label="${x.name}">${S.lesson.slides.map((y, j) => (y.section === x.id ? html`<option value="${y.id}" ${y.id === s.id ? 'selected' : ''}>${j + 1}. ${y.title}</option>` : ''))}</optgroup>`)}</select>`);
    $('prev').disabled = idx === 0; $('next').disabled = idx === n - 1;
    renderRoom();
    renderBody(fresh);
    if (fresh) { lastId = s.id; const t = $('tabs').querySelector('.on'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }

  function statsStrip(s) {
    if (!SELF.includes(s.type) && !['task', 'gap', 'scale', 'wordcloud', 'open'].includes(s.type)) return '';
    const a = S.aggs[s.id] || {}, done = a.done || 0, p = prefs[s.id] || {};
    return html`<div class="stats" id="stats"><div class="stat">${ring(S.online ? done / S.online : 0, `pr:${s.id}`, 42)}<div><b>${done}</b> von ${S.online}<small>${s.type === 'task' ? 'fertig' : s.type === 'gap' ? 'haben alle Lücken richtig' : SELF.includes(s.type) ? 'fertig' : 'haben geantwortet'}</small></div></div>
      ${SELF.includes(s.type) && a.total ? html`<div class="stat plain"><div><span class="big">${fmt((a.ok / a.total) * 100)} %</span><small>im Schnitt richtig</small></div></div>` : ''}
      <div class="stat-actions">${SELF.includes(s.type) ? html`<button class="btn${p.eval ? ' primary' : ''}" data-action="eval">${ic(p.eval ? 'arrowl' : 'bars')}${p.eval ? 'Zurück zur Aufgabe' : 'Auswertung zeigen'}</button>` : ''}<button class="btn" data-action="reset">${ic('refresh')}Zurücksetzen</button></div></div>`;
  }

  function renderBody(fresh) {
    const s = cur(), R = RENDER[s.type], sec = secOf(s);
    if (fresh) { chartReset(s.id); resetSegs(`${s.id}|`); resetRings(`:${s.id}`); }
    CH.ctx = s.id; CH.seq = 0;
    const snap = !fresh && R.snap ? R.snap(content) : null;
    const changed = (S.changed || []).includes(s.id);
    let body;
    try { body = R.host(s, ctxFor(s)); } catch (e) { console.error(e); body = html`<div class="warn">${ic('alert')}<span>Diese Folie konnte nicht angezeigt werden. Bitte im Editor prüfen.</span></div>`; }
    content.classList.toggle('enter', fresh);
    const head = s.type === 'title' ? '' : shead(s.title, secCol(sec));
    const rest = html`${changed ? html`<div class="warn anim">${ic('alert')}<span>Diese Folie wurde seit dem gespeicherten Stand geändert – die alten Ergebnisse passen eventuell nicht mehr.</span><button class="btn" data-action="reset">Ergebnisse verwerfen</button></div>` : ''}${statsStrip(s)}${body}`;
    content.innerHTML = String(withGraphic(head, rest, s.type === 'title' ? null : s.graphic, mediaUrl));
    if (R.flip && snap) R.flip(content, snap);
    fit(content);
    animWidths(content);
  }
  // Teil-Aktualisierung (Live-Daten): Auftritt nicht wiederholen
  const refresh = () => { content.classList.remove('enter'); renderBody(false); };

  function renderRoom() {
    $('hroom').innerHTML = String(html`<span class="livebadge"><span class="pulse"></span><b>${S.online}</b> online</span>${awayBadge(S.away)}
      <button class="hbtn" data-action="join" title="Link und QR-Code zum Mitmachen">${ic('qr')}<span>Beitreten</span></button>
      <button class="hbtn${S.slot ? ' saved' : ''}" data-action="states" title="${S.slot ? `Stand „${S.slot.name}“ – wird automatisch gespeichert${savedAt ? `, zuletzt um ${new Date(savedAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Stand speichern oder laden'}">${ic('save')}<span>${S.slot ? S.slot.name : 'Speichern'}</span></button>
      <button class="hbtn" data-action="moderation" title="Moderationsfenster (z. B. am Laptop, während der Beamer die Folie zeigt)">${ic('settings')}<span>Moderation</span></button>
      <button class="hbtn tglh${S.sync ? ' on' : ''}" data-action="sync" title="Alle Geräte zeigen dieselbe Folie wie vorne"><span class="sw"></span><span>Alle folgen</span></button>
      <button class="hbtn" data-action="full" title="${full ? 'Vollbild beenden (F11 oder Esc)' : 'Vollbild – am Beamer ist nur Plenum zu sehen (F11)'}" aria-label="${full ? 'Vollbild beenden' : 'Vollbild'}" aria-pressed="${full ? 'true' : 'false'}">${ic(full ? 'shrink' : 'expand')}</button>
      <button class="hbtn" data-action="exit" title="Präsentation beenden">${ic('x')}</button>`);
  }

  // ---------- Vollbild (im Programmfenster über den Hauptprozess, im Browser über die Fullscreen-API) ----------
  const appFull = window.plenumApp?.fullScreen ? window.plenumApp : null;
  const setFull = (on) => { if (on === full) return; full = on; if (S) renderRoom(); };
  const onDocFull = () => { if (!appFull) setFull(!!document.fullscreenElement); };
  document.addEventListener('fullscreenchange', onDocFull);
  const offFull = appFull?.onFullScreen?.(setFull);
  if (appFull) appFull.fullScreen('get').then(setFull, () => {}); else onDocFull();
  function toggleFull() {
    if (appFull) appFull.fullScreen('toggle').then(setFull, () => {});
    else if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast('Vollbild ist hier nicht möglich', 'err'));
  }
  function leaveFull() {
    if (appFull) appFull.fullScreen('off').catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // ---------- Steuerung ----------
  function goto(id) { if (!S.lesson.slides.some((s) => s.id === id)) return; S.slideId = id; socket.emit('host:slide', id); render(); content.scrollTop = 0; }
  const go = (d) => { const i = S.lesson.slides.indexOf(cur()) + d; if (i >= 0 && i < S.lesson.slides.length) goto(S.lesson.slides[i].id); };

  async function showJoin() {
    try { Object.assign(info, await api('/info')); } catch { /* Netz geändert? alte Daten verwenden */ }
    const u = joinUrl(), list = urls();
    const body = u ? html`<div class="joinbox"><div class="jl"><p class="ov-sub">Öffnet den Link im Browser oder scannt den QR-Code – auf dem Handy, Tablet oder Laptop.</p>
        <div class="urlbox"><span class="url"><small>http://</small>${u.replace('http://', '')}</span><button class="btn primary" data-action="copy">${ic('copy')}Kopieren</button></div>
        ${list.length > 1 ? html`<label class="adapter">${ic('wifi')}Netzwerk: <select data-change="adapter">${list.map((x) => html`<option value="${x.address}" ${x.url === u ? 'selected' : ''}>${x.name} (${x.address})</option>`)}</select></label>` : ''}
        <div class="ov-net">${ic('wifi')}Alle Geräte müssen im selben Netzwerk (WLAN) sein wie dieser Computer.</div>
        <button class="btn" data-action="testStudent">${ic('phone')}Schüleransicht testen</button></div>
      <div class="jq"><img class="qrimg" src="/api/host/qr?u=${encodeURIComponent(u)}" alt="QR-Code zum Beitreten: ${u}"></div></div>`
      : html`<div class="warn">${ic('alert')}<span>Dieser Computer ist mit keinem Netzwerk verbunden. Verbinde ihn mit dem WLAN oder LAN und öffne dieses Fenster erneut.</span></div>`;
    overlay(html`<div class="ov-ic">${ic('users')}</div><h2>Teilnehmen</h2>${body}<div><button class="btn close" data-action="close">Schließen</button></div>`, { wide: true });
  }

  function showStates() {
    socket.emit('host:states', (list) => {
      const rows = (list || []).map((x) => { const sl = S.lesson.slides.find((y) => y.id === x.slideId), curr = S.slot && S.slot.id === x.id;
        return html`<div class="slot${curr ? ' cur' : ''}"><div class="slot-i">${ic(x.id === '_auto' ? 'refresh' : 'save')}</div><div class="slot-b"><div class="slot-n">${x.name}${curr ? html` <span class="etag">aktuell</span>` : ''}</div><div class="slot-m">${whenStr(x.savedAt)}${sl ? ` · ${sl.title}` : ''} · ${x.votes} Antworten</div></div>
          <div class="slot-a">${curr ? '' : html`<button class="btn" data-action="loadState" data-id="${x.id}">Laden</button>`}${x.id === '_auto' ? '' : html`<button class="btn icon danger" title="Löschen" data-action="delState" data-id="${x.id}" data-name="${x.name}">${ic('trash')}</button>`}</div></div>`; });
      overlay(html`<div class="ov-ic">${ic('save')}</div><h2>Stand speichern</h2><p class="ov-sub">Sichert Folie, Abstimmungen und Ergebnisse – zum Beispiel für jede Klasse einen eigenen Stand. Mit Namen wird danach laufend automatisch gespeichert.</p>
        <form class="saveform" data-action="saveState"><input class="field" name="n" maxlength="40" required placeholder="Name, z. B. Klasse 4a" value="${S.slot ? S.slot.name : ''}" aria-label="Name des Stands"><button class="btn primary">${ic('save')}Speichern</button></form>
        <div class="slots-h">Gespeicherte Stände dieser Lektion</div><div class="slots">${rows.length ? rows : html`<div class="slot-empty">Noch keine gespeicherten Stände.</div>`}</div>
        <div class="ov-actions"><button class="btn" data-action="clearRoom">${ic('plus')}Neu beginnen</button><button class="btn" data-action="pdfResults" title="Folien mit den Ergebnissen dieser Stunde als PDF speichern">${ic('file')}Ergebnisse als PDF</button><button class="btn" data-action="close">Schließen</button></div>`, { wide: true });
    });
  }
  const applyState = (r) => { if (r && r.presenting !== undefined) { const keepId = r.slideId; S = { ...S, ...r }; S.slideId = keepId; for (const k in local) delete local[k]; lastId = null; render(); } };

  const actions = {
    prev: () => go(-1), next: () => go(1),
    sec: (el) => { const f = S.lesson.slides.find((x) => x.section === el.dataset.id); if (f) goto(f.id); },
    sync: () => { S.sync = !S.sync; socket.emit('host:sync', S.sync); renderRoom(); },
    join: showJoin, states: showStates, close: closeOv, full: toggleFull,
    pdfResults: async () => { closeOv(); const { showPdfExport } = await import('../editor/pdf.js'); showPdfExport({ api, lessonId: S.lesson.id, title: S.lesson.title, live: true, preset: { variant: 'results', state: '_live' } }); },
    copy: async (el) => { if (await copyText(joinUrl())) el.innerHTML = String(html`${ic('check')}Kopiert`); else toast('Kopieren nicht möglich – den Link bitte abschreiben', 'err'); },
    testStudent: () => { window.open(`http://127.0.0.1:${info.port}/`, '_blank', 'width=420,height=860'); },
    moderation: () => { window.open('/host#/moderation', 'plenum-moderation', 'width=1100,height=760'); },
    eval: () => { const s = cur(), p = prefs[s.id] || (prefs[s.id] = {}); p.eval = !p.eval; resetSegs(`${s.id}|`); refresh(); },
    reset: async () => { if (await ask('Ergebnisse zurücksetzen?', 'Die Antworten zu dieser Folie werden gelöscht. Die Klasse kann sie noch einmal beantworten.', { ok: 'Zurücksetzen', danger: true })) { const s = cur(); socket.emit('host:reset', s.id); S.changed = (S.changed || []).filter((x) => x !== s.id); } },
    quiz: (el) => socket.emit('host:quiz', { slideId: cur().id, action: el.dataset.q }),
    moderate: (el) => socket.emit('host:moderate', { slideId: cur().id, action: el.dataset.mod, key: el.dataset.key }),
    loadState: (el) => socket.emit('host:loadState', el.dataset.id, (r) => { if (r && r.ok) { closeOv(); applyState(r); toast('Stand geladen'); } else toast('Der Stand konnte nicht geladen werden.', 'err'); }),
    delState: async (el) => { if (await ask(`Stand „${el.dataset.name}“ löschen?`, 'Das lässt sich nicht rückgängig machen.', { ok: 'Löschen', danger: true })) socket.emit('host:deleteState', el.dataset.id, (r) => { if (r && r.ok) { S.slot = r.slot; renderRoom(); } showStates(); }); else showStates(); },
    saveState: (el) => socket.emit('host:saveAs', el.querySelector('input').value, (r) => { if (r && r.ok) { S.slot = r.slot; savedAt = Date.now(); renderRoom(); showStates(); toast(`Gespeichert als „${r.slot.name}“`); } else toast(r?.error || 'Speichern nicht möglich', 'err'); }),
    clearRoom: async () => { if (await ask('Neu beginnen?', S.slot ? `„${S.slot.name}“ bleibt gespeichert.` : 'Der bisherige Stand wird als „Letzte Sitzung“ gesichert.', { ok: 'Neu beginnen' })) socket.emit('host:clearRoom', (r) => { if (r && r.ok) applyState(r); }); },
    exit: async () => { if (await ask('Präsentation beenden?', 'Die Geräte der Klasse werden getrennt. Der Stand bleibt gespeichert.', { ok: 'Beenden' })) socket.emit('host:stop', () => onExit()); },
  };
  const changeActions = {
    jump: (el) => goto(el.value),
    adapter: async (el) => { adapter = el.value; try { await api('/settings', { method: 'PUT', body: { adapter } }); info.settings.adapter = adapter; } catch { /* egal */ } showJoin(); renderBody(false); },
  };
  // Typ-spezifische Aktionen: data-action="t:name"
  const typeAction = (el, e, kind) => {
    const name = el.dataset[kind].slice(2), s = cur(), fn = (RENDER[s.type].hostActions || {})[name];
    if (fn) fn(el, ctxFor(s), e);
  };
  const handlers = new Proxy(actions, { get: (t, k) => (String(k).startsWith('t:') ? (el, e) => typeAction(el, e, 'action') : t[k]) });
  const chHandlers = new Proxy(changeActions, { get: (t, k) => (String(k).startsWith('t:') ? (el, e) => typeAction(el, e, 'change') : t[k]) });
  const undel = [delegate(document.body, 'click', handlers), delegate(document.body, 'submit', handlers), delegate(document.body, 'change', chHandlers, 'change')];

  const onKey = (e) => {
    if (!S || ovOpen() || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
  };
  document.addEventListener('keydown', onKey);

  // Countdown-Anzeigen (Quiz) laufen lokal weiter
  const ticker = setInterval(() => document.querySelectorAll('[data-countdown]').forEach((el) => { const ms = Math.max(0, +el.dataset.countdown - Date.now()); const b = el.querySelector('b'); if (b) b.textContent = Math.ceil(ms / 1000); }), 250);

  // ---------- Live-Ereignisse ----------
  const on = (ev, fn) => { socket.on(ev, fn); return () => socket.off(ev, fn); };
  const offs = [
    on('agg', (d) => { if (!S) return; S.aggs[d.slideId] = d.data; if (d.slideId === S.slideId) refresh(); }),
    on('online', (n) => { if (!S) return; S.online = n; renderRoom(); const s = cur(); if (TYPES[s.type].live) refresh(); }),
    on('away', (n) => { if (S && S.away !== n) { S.away = n; renderRoom(); } }),
    on('players', (p) => { if (S) S.players = p; }),
    on('saved', (d) => { savedAt = d.at; if (S) { S.slot = d.slot || S.slot; renderRoom(); } }),
    on('slideChanged', (d) => { if (S && d.slideId !== S.slideId) { S.slideId = d.slideId; render(); } }),
    on('syncChanged', (d) => { if (S) { S.sync = d.sync; renderRoom(); } }),
  ];

  window.plenumApp?.setPresenting?.(true);
  return {
    show(state) { S = state; lastId = null; render(); if (!(state.online > 0)) showJoin(); },
    update(state) { applyState(state); },
    destroy() { offs.forEach((f) => f()); undel.forEach((f) => f()); clearInterval(ticker); document.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onDocFull); if (offFull) offFull(); leaveFull(); window.plenumApp?.setPresenting?.(false); },
    get state() { return S; },
  };
}

export { esc, logo };
