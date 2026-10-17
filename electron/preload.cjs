const { contextBridge, ipcRenderer } = require('electron');

// Deliberately expose individual operations, never generic IPC or filesystem access.
contextBridge.exposeInMainWorld('revolaDesktop', Object.freeze({
  openFile: () => ipcRenderer.invoke('revola:open'),
  saveFile: (options) => ipcRenderer.invoke('revola:save', options),
  saveAll: (options) => ipcRenderer.invoke('revola:save-all', options),
  setDirty: (dirty) => ipcRenderer.send('revola:dirty', dirty === true),
}));
