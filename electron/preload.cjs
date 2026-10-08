const { contextBridge, ipcRenderer } = require('electron');

// Deliberately expose individual operations, never generic IPC or filesystem access.
contextBridge.exposeInMainWorld('revolaDesktop', Object.freeze({
  openFile: () => ipcRenderer.invoke('revola:open'),
  saveFile: (options) => ipcRenderer.invoke('revola:save', options),
  shipPngDataUrl: () => ipcRenderer.invoke('revola:ship-png'),
  setDirty: (dirty) => ipcRenderer.send('revola:dirty', dirty === true),
}));
