// Minimale Schnittstelle zwischen Programmfenster und Hauptprozess
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plenumApp', {
  setPresenting: (on) => ipcRenderer.send('presenting', !!on),
  openPath: (p) => ipcRenderer.invoke('openPath', String(p)),
  chooseFolder: (def) => ipcRenderer.invoke('chooseFolder', String(def || '')),
  copyText: (t) => ipcRenderer.invoke('copyText', String(t)),
  onOpenLesson: (cb) => ipcRenderer.on('open-lesson', (e, id) => cb(String(id))),
});
