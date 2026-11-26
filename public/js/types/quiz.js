// Darstellung: Quizfrage (Bereit → Läuft → Zeit um → Auflösung) und Rangliste
import { html, md, fmt } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { fb, seg } from '../core/parts.js';

const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'];
const QCOLORS = ['#e11d48', '#2563eb', '#d97706', '#059669', '#7c3aed', '#0891b2'];
// Countdown-Anzeige: das Ende wird beim Empfang aus der Restzeit berechnet (Geräteuhren sind egal)
const countdown = (ms, total) => html`<div class="qtimer" data-countdown="${Date.now() + ms}" data-total="${total}"><svg viewBox="0 0 44 44"><circle class="rt" cx="22" cy="22" r="19"/><circle class="rv" cx="22" cy="22" r="19" transform="rotate(-90 22 22)" style="stroke-dasharray:119.4;stroke-dashoffset:${(119.4 * (1 - ms / total)).toFixed(1)};animation-duration:${ms}ms"/></svg><b>${Math.ceil(ms / 1000)}</b></div>`;

export const quiz = {
  host(s, c) {
    const a = c.agg || { phase: 'idle', n: 0, counts: {} }, ph = a.phase || 'idle';
    const ctl = (act, label, icn, primary) => html`<button class="btn${primary ? ' primary big' : ''}" data-action="quiz" data-q="${act}">${ic(icn)}${label}</button>`;
    // Druck (PDF) ohne Ergebnisse: Frage und Antworten ohne Start-Bildschirm und Countdown, auf Wunsch mit markierter Lösung
    if (c.print && !c.results) {
      return html`<div class="quiz-head anim"><div class="qq">${md(s.question)}</div><div class="qdone">${ic('clock')}${s.time} Sekunden</div></div>
        <div class="qopts anim" style="--i:1">${s.options.map((o, i) => { const right = c.solution && o.correct, dim = c.solution && !o.correct;
          return html`<div class="qopt${right ? ' right' : ''}${dim ? ' dim' : ''}" style="--qc:${QCOLORS[i % QCOLORS.length]}"><span class="qshape">${SHAPES[i % SHAPES.length]}</span><span class="qtext">${o.text}</span>${right ? ic('check', 'mk') : ''}</div>`; })}</div>
        ${c.solution && s.explanation ? fb(true, s.explanation) : ''}`;
    }
    if (ph === 'idle') return html`<div class="quiz-idle anim"><div class="qbadge">${ic('trophy')}Quizfrage</div><p>${s.time} Sekunden · bis zu ${s.points} Punkte</p>${ctl('start', 'Quiz starten', 'play', true)}<small class="muted">Die Frage erscheint erst nach dem Start – auf allen Geräten gleichzeitig.</small></div>`;
    if (ph === 'ready') return html`<div class="quiz-ready anim"><div class="qcount" style="--ms:${a.readyMs}ms">Bereit?</div><p>Gleich geht’s los …</p></div>`;
    const revealed = ph === 'revealed', closed = ph === 'closed' || revealed;
    const opts = s.options.map((o, i) => {
      const v = (a.counts || {})[i] || 0, right = revealed && a.correct === i, dim = revealed && a.correct !== i;
      return html`<div class="qopt${right ? ' right' : ''}${dim ? ' dim' : ''}" style="--qc:${QCOLORS[i % QCOLORS.length]}"><span class="qshape">${SHAPES[i % SHAPES.length]}</span><span class="qtext">${o.text}</span>${closed ? html`<span class="qcnt">${v}</span>` : ''}${right ? ic('check', 'mk') : ''}
        ${closed ? html`<div class="ebar qdist">${seg(`${s.id}|q${i}`, v, a.n || 0, QCOLORS[i % QCOLORS.length], '')}</div>` : ''}</div>`;
    });
    return html`<div class="quiz-head anim"><div class="qq">${md(s.question)}</div>${ph === 'running' ? countdown(a.remainingMs, s.time * 1000) : html`<div class="qdone">${ic(revealed ? 'check' : 'clock')}${revealed ? 'Aufgelöst' : 'Zeit um'}</div>`}</div>
      <div class="qopts anim" style="--i:1">${opts}</div>
      <div class="quiz-foot"><span class="part-n small">${a.n}<small> von ${c.online} haben geantwortet</small></span>
        ${ph === 'running' ? ctl('stop', 'Frage beenden', 'stop') : ph === 'closed' ? ctl('reveal', 'Auflösen', 'eye', true) : ctl('start', 'Nochmal starten', 'refresh')}</div>
      ${revealed && s.explanation ? fb(true, s.explanation) : ''}`;
  },
  student(d, c) {
    const ph = d.phase || 'idle';
    if (ph === 'idle') return html`<div class="card quiz-wait anim">${ic('trophy')}<h3>${d.title}</h3><p>Gleich startet die Quizfrage. Schau nach vorne!</p></div>`;
    if (ph === 'ready') return html`<div class="quiz-ready anim"><div class="qcount" style="--ms:${d.readyMs}ms">Bereit?</div></div>`;
    const mine = c.local.choice ?? d.mine;
    if (ph === 'running' && mine == null) {
      return html`<div class="quiz-head small"><div class="qq">${md(d.question)}</div>${countdown(d.remainingMs, d.time * 1000)}</div>
        <div class="qopts student">${d.options.map((o, i) => html`<button class="qopt" style="--qc:${QCOLORS[i % QCOLORS.length]}" data-action="t:answer" data-i="${i}"><span class="qshape">${SHAPES[i % SHAPES.length]}</span><span class="qtext">${o}</span></button>`)}</div>`;
    }
    if (ph === 'running' || ph === 'closed') return html`<div class="card quiz-wait anim">${ic(mine == null ? 'clock' : 'check')}<h3>${mine == null ? 'Zeit abgelaufen' : 'Antwort gespeichert'}</h3>${mine != null ? html`<p>Du hast <b>${SHAPES[mine % SHAPES.length]} ${d.options[mine]}</b> gewählt. Warte auf die Auflösung.</p>` : html`<p>Diesmal keine Antwort. Bei der nächsten Frage klappt’s!</p>`}</div>`;
    const ok = mine === d.correct;
    return html`<div class="card quiz-result ${ok ? 'ok' : 'no'} anim">${ic(ok ? 'check' : 'x')}<h3>${mine == null ? 'Keine Antwort' : ok ? 'Richtig!' : 'Leider falsch'}</h3><p class="qpts">+${fmt(d.points || 0)} Punkte</p>
      <p>Richtig war: <b>${SHAPES[d.correct % SHAPES.length]} ${d.options[d.correct]}</b></p></div>${d.explanation ? fb(true, d.explanation) : ''}`;
  },
  studentActions: { answer(el, c) { if (c.local.choice != null) return; c.local.choice = +el.dataset.i; c.render(); c.submit({ choice: +el.dataset.i }); } },
};

export const leaderboard = {
  host(s, c) {
    const a = c.agg || { ranking: [], players: 0 }, max = Math.max(1, ...a.ranking.map((r) => r.total));
    return html`${a.ranking.length ? html`<div class="lboard">${a.ranking.map((r, i) => html`<div class="lrow anim p${r.rank}" style="--i:${a.ranking.length - i}"><span class="lrank">${r.rank}</span><span class="lnick">${r.nick}</span>
        <span class="lbarwrap"><span class="wbar lbar" data-w="${((r.total / max) * 100).toFixed(1)}" style="width:0%"></span></span><span class="lpts">${fmt(r.total)}</span></div>`)}</div>`
      : html`<div class="card quiz-wait anim">${ic('trophy')}<h3>Noch keine Punkte</h3><p>Die Rangliste füllt sich mit den Quizfragen.</p></div>`}
      <div class="esum anim">${a.players} ${a.players === 1 ? 'Person' : 'Personen'} im Quiz</div>`;
  },
  student(d) {
    const me = d.me || {};
    return html`<div class="card myrank anim">${ic('trophy')}<div class="mr-n">${me.rank ? `Platz ${me.rank}` : 'Noch nicht platziert'}</div><div class="mr-s">${me.players ? `von ${me.players}` : ''}</div>
      <div class="mr-p">${fmt(me.total || 0)} Punkte</div><div class="mr-nick">als <b>${me.nick || ''}</b></div></div>`;
  },
};
