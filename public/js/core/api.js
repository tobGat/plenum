// REST-Aufrufe zum lokalen Server (Lehrkraft-Bereich; das Start-Token steckt im Cookie)
export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(`/api/host${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || `Fehler ${r.status}`);
  return data;
}
// Datei-Download über einen unsichtbaren Link (Electron zeigt den Speichern-Dialog)
export function download(path) {
  const a = document.createElement('a');
  a.href = `/api/host${path}`; a.download = '';
  document.body.appendChild(a); a.click(); a.remove();
}
