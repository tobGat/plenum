// Feld-Definitionen: eine Beschreibung je Feld steuert Reparatur/Prüfung, Editor-Formular und KI-Beschreibung.
// Arten: text, textarea, int, bool, select, strlist, objlist, choices, chart, numlist
import { isObj, asArr, str, toNum } from './util.js';

export const CHART_TYPES = ['bar', 'hbar', 'pie', 'line'];

// r = Reparatur-Protokoll { note(text), error(text) }, p = Pfad für Meldungen
export function normField(f, v, r, p) {
  const label = f.label || f.key;
  switch (f.kind) {
    case 'text':
    case 'textarea': {
      let s = str(v).replace(/\r\n?/g, '\n');
      if (f.kind === 'text') s = s.replace(/\s*\n\s*/g, ' ');
      s = s.trim();
      if (!s && f.default !== undefined) s = f.default;
      if (f.max && s.length > f.max) { r.note(`${p}: „${label}“ auf ${f.max} Zeichen gekürzt`); s = s.slice(0, f.max - 1).trimEnd() + '…'; }
      if (!s && f.required) r.error(`${p}: „${label}“ fehlt`);
      return s;
    }
    case 'int': {
      let n = Math.round(toNum(v));
      if (!Number.isFinite(n)) n = f.default ?? f.min ?? 0;
      if (f.min != null && n < f.min) n = f.min;
      if (f.max != null && n > f.max) n = f.max;
      return n;
    }
    case 'bool':
      return v === undefined || v === null || v === '' ? !!f.default : v === true || v === 'true' || v === 1 || v === 'ja';
    case 'select': {
      const ok = f.options.map((o) => o.value);
      return ok.includes(v) ? v : f.default ?? ok[0];
    }
    case 'strlist': {
      let a = asArr(v).map((x) => (isObj(x) ? str(x.text ?? x.name ?? x.label) : str(x)).trim()).filter(Boolean);
      const im = f.itemMax || 200;
      a = a.map((s) => { if (s.length > im) { r.note(`${p}: Eintrag in „${label}“ gekürzt`); return s.slice(0, im - 1) + '…'; } return s; });
      if (f.max && a.length > f.max) { r.note(`${p}: „${label}“ auf ${f.max} Einträge begrenzt`); a = a.slice(0, f.max); }
      if (f.min && a.length < f.min) r.error(`${p}: „${label}“ braucht mindestens ${f.min} Einträge`);
      return a;
    }
    case 'numlist':
      return asArr(v).map((x) => { const n = toNum(x); return Number.isFinite(n) ? n : 0; });
    case 'objlist': {
      let a = asArr(v).filter((x) => isObj(x) || typeof x === 'string').map((x) => (typeof x === 'string' ? { [f.fields[0].key]: x } : x));
      if (f.max && a.length > f.max) { r.note(`${p}: „${label}“ auf ${f.max} Einträge begrenzt`); a = a.slice(0, f.max); }
      a = a.map((o, i) => normObject(o, f.fields, r, `${p}, ${label} ${i + 1}`)).filter((o) => !f.keep || f.keep(o));
      if (f.min && a.length < f.min) r.error(`${p}: „${label}“ braucht mindestens ${f.min} Einträge`);
      return a;
    }
    case 'choices': {
      let a = asArr(v).map((x) => (isObj(x) ? { text: str(x.text ?? x.label ?? x.option ?? x.answer).trim(), correct: x.correct === true || x.correct === 'true' || x.richtig === true } : { text: str(x).trim(), correct: false })).filter((o) => o.text);
      const im = f.itemMax || 140;
      a.forEach((o) => { if (o.text.length > im) { r.note(`${p}: Antwort gekürzt`); o.text = o.text.slice(0, im - 1) + '…'; } });
      if (f.max && a.length > f.max) { r.note(`${p}: auf ${f.max} Antworten begrenzt`); a = a.slice(0, f.max); }
      if (f.min && a.length < f.min) r.error(`${p}: mindestens ${f.min} Antworten nötig`);
      if (f.correct === 'one') {
        const n = a.filter((o) => o.correct).length;
        if (n === 0 && a.length) r.error(`${p}: keine richtige Antwort markiert`);
        if (n > 1) { r.note(`${p}: mehrere richtige Antworten – nur die erste bleibt richtig`); let seen = false; a.forEach((o) => { if (o.correct) { if (seen) o.correct = false; seen = true; } }); }
      }
      return a;
    }
    case 'chart':
      return normChart(v, r, p);
    default:
      return v;
  }
}

export function normObject(o, fields, r, p) {
  const out = {};
  for (const f of fields) {
    const v = normField(f, o?.[f.key], r, p);
    if (f.optional && (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length))) continue;
    out[f.key] = v;
  }
  return out;
}

// Diagramm: { type, title, labels, series:[{name, values}], unit, source }
export function normChart(c, r, p) {
  if (!isObj(c)) return null;
  const type = { column: 'bar', saeulen: 'bar', säulen: 'bar', balken: 'hbar', bar_horizontal: 'hbar', horizontal: 'hbar', kreis: 'pie', donut: 'pie', ring: 'pie', linie: 'line' }[str(c.type).toLowerCase()] || (CHART_TYPES.includes(c.type) ? c.type : 'bar');
  const labels = asArr(c.labels ?? c.categories).map((x) => str(x).trim().slice(0, 40)).slice(0, 12);
  if (!labels.length) { r.note(`${p}: Diagramm ohne Beschriftungen entfernt`); return null; }
  let series = asArr(c.series);
  if (!series.length && c.values) series = [{ name: str(c.name) || 'Werte', values: c.values }];
  series = series.filter(isObj).slice(0, type === 'pie' || type === 'line' ? 1 : 3).map((s, i) => {
    let values = asArr(s.values ?? s.data).map((x) => { const n = toNum(x); return Number.isFinite(n) ? n : 0; });
    if (values.length !== labels.length) { r.note(`${p}: Diagrammreihe an ${labels.length} Beschriftungen angepasst`); values = labels.map((_, k) => values[k] ?? 0); }
    return { name: str(s.name).trim().slice(0, 40) || (i ? `Reihe ${i + 1}` : 'Werte'), values };
  });
  if (!series.length) { r.note(`${p}: Diagramm ohne Werte entfernt`); return null; }
  const out = { type, title: str(c.title).trim().slice(0, 140), labels, series, unit: str(c.unit).trim().slice(0, 8), source: str(c.source).trim().slice(0, 300) };
  if (Number.isFinite(toNum(c.ymin))) out.ymin = toNum(c.ymin);
  return out;
}

// Beschreibung eines Felds für die KI-Vorlage
export function describeField(f) {
  const lim = f.max ? ` (max. ${f.max}${f.kind === 'text' || f.kind === 'textarea' ? ' Zeichen' : ''})` : '';
  const opt = f.optional ? ', optional' : '';
  switch (f.kind) {
    case 'text': case 'textarea': return `Text${lim}${opt}`;
    case 'int': return `Ganzzahl ${f.min ?? ''}–${f.max ?? ''}${opt}`;
    case 'bool': return `true/false${opt}`;
    case 'select': return `einer von: ${f.options.map((o) => JSON.stringify(o.value)).join(', ')}${opt}`;
    case 'strlist': return `Liste von Texten, ${f.min || 0}–${f.max || 'n'} Einträge${opt}`;
    case 'objlist': return `Liste (${f.min || 0}–${f.max || 'n'}) von Objekten {${f.fields.map((x) => `${x.key}: ${describeField(x)}`).join('; ')}}${opt}`;
    case 'choices': return `Liste (${f.min}–${f.max}) von {"text": Text, "correct": true/false}${f.correct === 'one' ? ', genau eine richtig' : ''}${opt}`;
    case 'chart': return `Diagramm {"type": "bar"|"hbar"|"pie"|"line", "title", "labels": [...], "series": [{"name", "values": [Zahlen]}], "unit", "source"}${opt}`;
    case 'numlist': return `Liste von Zahlen${opt}`;
    default: return f.kind;
  }
}
