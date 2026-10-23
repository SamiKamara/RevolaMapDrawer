const { contextBridge, ipcRenderer } = require('electron');

// No filesystem, network, generic IPC or desktop export operations in game mode.
contextBridge.exposeInMainWorld('revolaGame', Object.freeze({
  request: (operation, options = {}) => ipcRenderer.invoke('revola:game', operation, options),
  setDirty: dirty => ipcRenderer.send('revola:game-dirty', dirty === true),
  onClose: callback => ipcRenderer.on('revola:game-close', () => callback()),
  onInputMode: callback => ipcRenderer.on('revola:game-input-mode', (_event, gamepad) => callback(gamepad)),
  onPan: callback => ipcRenderer.on('revola:game-pan', (_event, x, y) => callback(x, y)),
}));
