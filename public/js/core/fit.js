// Folie in den freien Bereich einpassen: größten Zoom suchen, bei dem nichts gescrollt werden muss.
// Am Beamer 50–130 %, am Handy höchstens auf 85 % verkleinern (dort darf gescrollt werden).
const CANZOOM = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '1');

export function fit(ct) {
  const w = ct && ct.querySelector('.wrap');
  if (!w || !CANZOOM) return;
  const narrow = innerWidth < 761, cs = getComputedStyle(ct);
  const availW = ct.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const zmin = narrow ? 0.85 : 0.5, zmax = narrow ? 1 : Math.max(1, Math.min(1.3, availW / 1240));
  ct.classList.add('measuring');
  const fits = (z) => { w.style.zoom = z; return ct.scrollHeight <= ct.clientHeight + 1; };
  let z = zmax, ok = fits(z);
  if (!ok) {
    if (fits(zmin)) { let lo = zmin, hi = zmax; for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; } z = lo; ok = true; } else z = zmin;
  }
  w.style.zoom = String(Math.floor(z * 1000) / 1000);
  ct.classList.toggle('fitted', ok);
  ct.classList.remove('measuring');
}

export function autoFit(ct) {
  let t = null;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => fit(ct), 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fit(ct));
}
