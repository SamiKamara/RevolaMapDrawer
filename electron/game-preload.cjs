const { contextBridge, ipcRenderer } = require('electron');
let sharedCallback;
const sharedQueue = [];
ipcRenderer.on('revola:game-shared', (_event, value) => {
  if (sharedCallback) sharedCallback(value);
  else if (sharedQueue.length < 512) sharedQueue.push(value);
});

// No filesystem, network, generic IPC or desktop export operations in game mode.
contextBridge.exposeInMainWorld('revolaGame', Object.freeze({
  request: (operation, options = {}) => ipcRenderer.invoke('revola:game', operation, options),
  setDirty: dirty => ipcRenderer.send('revola:game-dirty', dirty === true),
  onClose: callback => ipcRenderer.on('revola:game-close', () => callback()),
  onInputMode: callback => ipcRenderer.on('revola:game-input-mode', (_event, gamepad) => callback(gamepad)),
  onPan: callback => ipcRenderer.on('revola:game-pan', (_event, x, y) => callback(x, y)),
  onShared: callback => { sharedCallback = callback; for (const value of sharedQueue.splice(0)) callback(value); },
}));
