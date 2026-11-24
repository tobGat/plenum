// Plenum-Infoseite: Scroll-Effekte ohne Bibliotheken. Ohne JavaScript oder bei „Bewegung reduzieren“ ist alles sichtbar und ruhig.
(function () {
  var doc = document.documentElement;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm || !('IntersectionObserver' in window)) return;
  doc.classList.add('js');
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  var el = function (tag, attrs, parent, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };

  // ---------- Einblenden beim Scrollen ----------
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal]').forEach(function (e) { io.observe(e); });
  $$('[data-stagger]').forEach(function (g) { Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty('--d', i * 90 + 'ms'); c.setAttribute('data-reveal', ''); io.observe(c); }); });

  // ---------- Zähler ----------
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      cio.unobserve(en.target);
      var to = +en.target.getAttribute('data-count'), t0 = performance.now();
      (function tick(now) { var p = clamp((now - t0) / 1300); en.target.textContent = Math.round(to * ease(p)); if (p < 1) requestAnimationFrame(tick); })(t0);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach(function (e) { e.textContent = '0'; cio.observe(e); });

  // ---------- Bühne: eine Unterrichtsstunde in fünf Phasen ----------
  var stage = $('#stage'), steps = $$('.story-step');
  var COL = ['#4f46e5', '#0d9488', '#e11d48', '#d97706'];
  var svg, G = [], words = [], ring, ringText, taskRows = [], checks = [], bars = [], barVals = [], rows = [], label, counter, timeBar;
  var WORDS = [['Regen', 240, 150, 52, 0], ['trinken', 140, 96, 32, 1], ['Meer', 340, 226, 34, 2], ['Eis', 110, 214, 24, 3], ['Leben', 360, 100, 26, 0], ['Fluss', 226, 268, 22, 1], ['Durst', 86, 152, 20, 2], ['Wolken', 396, 164, 22, 3]];
  var TASKS = ['Lies den Text zum Wasserkreislauf.', 'Beschrifte die Skizze im Heft.', 'Vergleicht eure Ergebnisse zu zweit.'];
  var CHECKS = [['Wasser verdunstet nur bei 100 °C.', 58], ['Wolken bestehen aus Wassertröpfchen.', 92], ['Grundwasser gehört zum Kreislauf.', 79]];
  var VOTES = [11, 8, 5], NAMES = ['ja', 'nein', 'unsicher'];
  var RANK = [['Fuchs 12', 3940], ['Wal 49', 3610], ['Eule 7', 2980], ['Luchs 31', 2450]];
  var LABELS = ['Woran denkst du bei Wasser?', 'Arbeitsauftrag: Wasserkreislauf', 'Richtig oder falsch?', 'Könnten wir zu Hause Wasser sparen?', 'Quiz zum Abschluss'];
  var MINUTES = [5, 20, 30, 40, 45];

  function build() {
    svg = el('svg', { viewBox: '0 0 480 340', role: 'img', 'aria-label': 'Animiertes Beispiel einer Unterrichtsstunde mit Plenum' }, stage);
    for (var s = 0; s < 5; s++) G.push(el('g', { class: 'sg' }, svg));
    // 0) Einstieg: Wortwolke
    WORDS.forEach(function (w) { words.push(el('text', { x: w[1], y: w[2], 'font-size': w[3], fill: COL[w[4]], class: 'word' }, G[0], w[0])); });
    // 1) Erarbeitung: Auftrag und „Ich bin fertig“
    TASKS.forEach(function (t, i) {
      var g = el('g', { class: 'trow' }, G[1]);
      el('rect', { x: 24, y: 50 + i * 62, width: 272, height: 50, rx: 12, class: 'rbg' }, g);
      el('circle', { cx: 50, cy: 75 + i * 62, r: 13, fill: COL[1] }, g);
      el('text', { x: 50, y: 80 + i * 62, class: 'tnum' }, g, 'abc'[i]);
      el('text', { x: 70, y: 80 + i * 62, class: 'ttext' }, g, t);
      taskRows.push(g);
    });
    el('circle', { cx: 388, cy: 150, r: 58, class: 'rtrack' }, G[1]);
    ring = el('circle', { cx: 388, cy: 150, r: 58, class: 'rfill', transform: 'rotate(-90 388 150)' }, G[1]);
    ringText = el('text', { x: 388, y: 160, class: 'rbig' }, G[1], '0');
    el('text', { x: 388, y: 240, class: 'lab' }, G[1], 'von 24 fertig');
    // 2) Sicherung: Aussagen mit Anteil richtiger Antworten
    CHECKS.forEach(function (c, i) {
      var y = 46 + i * 88;
      el('text', { x: 34, y: y + 16, class: 'ctext' }, G[2], c[0]);
      el('rect', { x: 34, y: y + 30, width: 350, height: 20, rx: 10, class: 'rtrackf' }, G[2]);
      var b = el('rect', { x: 34, y: y + 30, width: 0, height: 20, rx: 10, fill: c[1] < 65 ? COL[2] : '#16a34a' }, G[2]);
      var v = el('text', { x: 446, y: y + 46, class: 'cval' }, G[2], '0 %');
      checks.push({ b: b, v: v, p: c[1] });
    });
    // 3) Austausch: Abstimmung
    el('line', { x1: 70, x2: 420, y1: 270, y2: 270, class: 'ax' }, G[3]);
    VOTES.forEach(function (v, i) {
      var x = 100 + i * 110;
      bars.push(el('rect', { x: x, y: 270, width: 70, height: 0, rx: 10, fill: COL[i] }, G[3]));
      barVals.push(el('text', { x: x + 35, y: 262, class: 'val' }, G[3]));
      el('text', { x: x + 35, y: 294, class: 'lab' }, G[3], NAMES[i]);
    });
    // 4) Abschluss: Rangliste
    RANK.forEach(function (r, i) {
      var g = el('g', { class: 'rrow' }, G[4]);
      el('rect', { x: 40, y: 0, width: 400, height: 54, rx: 14, class: 'rbg' }, g);
      el('circle', { cx: 70, cy: 27, r: 16, fill: ['#fbbf24', '#cbd5e1', '#f0b38a', '#e0e7ff'][i] }, g);
      el('text', { x: 70, y: 33, class: 'rnum' }, g, i + 1);
      el('text', { x: 100, y: 33, class: 'rname' }, g, r[0]);
      var bar = el('rect', { x: 220, y: 20, width: 0, height: 14, rx: 7, fill: COL[0] }, g);
      var pts = el('text', { x: 428, y: 33, class: 'rpts' }, g);
      rows.push({ g: g, bar: bar, pts: pts, total: r[1] });
    });
    label = $('#stage-label'); counter = $('#stage-count'); timeBar = $('#stage-time');
  }

  var shown = -1;
  function draw(step, p) {
    if (step !== shown) {
      shown = step;
      G.forEach(function (g, i) { g.classList.toggle('on', i === step); });
      steps.forEach(function (s, i) { s.classList.toggle('on', i === step); });
      if (label) label.textContent = LABELS[step];
    }
    var e = ease(clamp(p * 1.25));
    // Zeitleiste der Stunde (45 Minuten)
    if (timeBar) { var from = step ? MINUTES[step - 1] : 0; timeBar.style.width = ((from + (MINUTES[step] - from) * clamp(p)) / 45 * 100) + '%'; }
    if (step === 0) {
      var k = 0;
      words.forEach(function (w, i) { var q = clamp(e * 1.6 - i * 0.09), on = q > 0; w.style.opacity = on ? Math.min(1, q * 2) : 0; w.style.transform = 'scale(' + (0.6 + 0.4 * ease(q)) + ')'; if (on) k++; });
      if (counter) counter.textContent = k + ' Begriffe aus der Klasse – ein Bild vom Vorwissen';
    } else if (step === 1) {
      var done = Math.round(24 * e), C = 2 * Math.PI * 58;
      ring.setAttribute('stroke-dasharray', (C * done / 24) + ' ' + C);
      ringText.textContent = done;
      taskRows.forEach(function (g, i) { g.style.opacity = clamp(e * 4 - i * 0.6); });
      if (counter) counter.textContent = done < 24 ? 'Noch ' + (24 - done) + ' arbeiten – du siehst, wann es weitergehen kann' : 'Alle fertig – weiter geht’s';
    } else if (step === 2) {
      checks.forEach(function (c, i) { var q = clamp(e * 1.4 - i * 0.15), v = c.p * q; c.b.setAttribute('width', 350 * v / 100); c.v.textContent = Math.round(v) + ' %'; });
      if (counter) counter.textContent = 'Aussage 1 macht Schwierigkeiten – noch einmal aufgreifen';
    } else if (step === 3) {
      var n = 0;
      VOTES.forEach(function (v, i) { var cur = v * clamp(e * 1.3 - i * 0.1), h = cur * 17; bars[i].setAttribute('y', 270 - h); bars[i].setAttribute('height', h); barVals[i].setAttribute('y', 262 - h); barVals[i].textContent = Math.round(cur); n += Math.round(cur); });
      if (counter) counter.textContent = n + ' von 24 haben abgestimmt – jetzt wird diskutiert';
    } else {
      var mid = [2100, 2600, 1500, 1900], list = rows.map(function (r, i) { return { r: r, v: mid[i] + (r.total - mid[i]) * e }; });
      var order = list.slice().sort(function (a, b) { return b.v - a.v; });
      list.forEach(function (o) { var pos = order.indexOf(o); o.r.g.style.transform = 'translateY(' + (40 + pos * 66) + 'px)'; o.r.bar.setAttribute('width', 150 * o.v / 3940); o.r.pts.textContent = Math.round(o.v).toLocaleString('de-AT'); });
      if (counter) counter.textContent = 'Spitznamen vergibt Plenum automatisch';
    }
  }

  // ---------- Scroll: Fortschrittsbalken, Titelbild, Bühne ----------
  var bar = $('#progress'), heroShot = $('.hero-shot'), heroPhone = $('.hero-tablet'), ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight, max = doc.scrollHeight - vh;
    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    if (heroShot && y < vh) heroShot.style.transform = 'perspective(1600px) rotateY(' + (-7 + y / vh * 7) + 'deg) rotateX(' + (3 - y / vh * 3) + 'deg) translateY(' + (-y * 0.06) + 'px)';
    if (heroPhone && y < vh) heroPhone.style.transform = 'translateY(' + (-y * 0.16) + 'px) rotate(' + (3 - y / vh * 3) + 'deg)';
    if (svg && steps.length) {
      var best = 0, prog = 0;
      steps.forEach(function (s, i) { var r = s.getBoundingClientRect(), c = vh * 0.55; if (r.top <= c) { best = i; prog = clamp((c - r.top) / r.height); } });
      draw(best, prog);
    }
  }
  if (stage && steps.length) { build(); draw(0, 0); }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
