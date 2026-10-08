const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'index.html');
const ENTRY_URL = pathToFileURL(ENTRY).href;
const MAX_PNG_BYTES = 32 * 1024 * 1024;
const MAX_PROJECT_BYTES = 4 * 1024 * 1024;
const MAX_SVG_BYTES = 32 * 1024 * 1024;
let window;
let dirty = false;
let closeApproved = false;
let closingDialog = false;

function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== ENTRY_URL) {
    throw new Error('This file operation is available only in the local editor.');
  }
}

function supportedFile(filePath) {
  const name = filePath.toLowerCase();
  if (name.endsWith('.png')) return { kind: 'png', max: MAX_PNG_BYTES };
  if (name.endsWith('.revola.json')) return { kind: 'project', max: MAX_PROJECT_BYTES };
  throw new Error('Choose a .png or .revola.json file.');
}

ipcMain.handle('revola:open', async (event) => {
  trusted(event);
  const selection = await dialog.showOpenDialog(window, {
    title: 'Open Revola map', properties: ['openFile'],
    filters: [{ name: 'Revola maps', extensions: ['png', 'revola.json'] }],
  });
  if (selection.canceled || !selection.filePaths.length) return null;
  const filePath = selection.filePaths[0];
  const { max } = supportedFile(filePath);
  // Read through the same open handle, with a bounded buffer even if the file grows.
  const handle = await fs.open(filePath, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > max) throw new Error('The selected file is too large (PNG: 32 MiB; project: 4 MiB).');
    const buffer = Buffer.alloc(info.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > info.size) throw new Error('The selected file changed while opening. Please try again.');
    return { name: path.basename(filePath), bytes: Array.from(buffer.subarray(0, total)) };
  } finally { await handle.close(); }
});

ipcMain.handle('revola:save', async (event, options) => {
  trusted(event);
  if (!options || !['png', 'svg', 'project'].includes(options.kind)) throw new Error('Choose a supported save format.');
  const max = options.kind === 'png' ? MAX_PNG_BYTES : options.kind === 'svg' ? MAX_SVG_BYTES : MAX_PROJECT_BYTES;
  if (!Array.isArray(options.bytes) || options.bytes.length > max || !options.bytes.length || options.bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error('The file data is invalid or exceeds the save limit.');
  }
  const extension = options.kind === 'png' ? '.png' : options.kind === 'svg' ? '.svg' : '.revola.json';
  const proposed = typeof options.suggestedName === 'string' ? path.basename(options.suggestedName) : `Untitled${extension}`;
  const defaultPath = proposed.toLowerCase().endsWith(extension) ? proposed : `${proposed}${extension}`;
  const selection = await dialog.showSaveDialog(window, {
    title: options.layer === 'floor' ? `Export floor ${options.kind.toUpperCase()}` : options.kind === 'png' ? 'Save editable PNG' : options.kind === 'svg' ? 'Export SVG' : 'Save Revola project',
    defaultPath,
    filters: [{ name: options.layer === 'floor' ? 'Black floor image' : options.kind === 'png' ? 'Editable PNG image' : options.kind === 'svg' ? 'SVG image' : 'Revola project', extensions: [extension.slice(1)] }],
  });
  if (selection.canceled || !selection.filePath) return null;
  // Write beside the destination, then replace, so interrupted writes do not truncate existing maps.
  const tempPath = `${selection.filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, Buffer.from(options.bytes), { flag: 'wx' });
    await fs.rename(tempPath, selection.filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
  return { path: selection.filePath };
});

ipcMain.handle('revola:ship-png', async (event) => {
  trusted(event);
  // Only the fixed bundled artwork is exposed; SVG stays self-contained and pixel-exact.
  return `data:image/png;base64,${(await fs.readFile(path.join(ROOT, 'assets', 'ship.png'))).toString('base64')}`;
});

ipcMain.on('revola:dirty', (event, value) => {
  try { trusted(event); } catch { return; }
  dirty = value === true;
  window.setDocumentEdited(dirty);
});

function createWindow() {
  dirty = false;
  closeApproved = false;
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1024, minHeight: 700,
    title: 'Revola Map Drawer', backgroundColor: '#131619', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, webviewTag: false, spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      if (url.protocol === 'file:') {
        const relative = path.relative(ROOT, fileURLToPath(url));
        allowed = !relative.startsWith('..') && !path.isAbsolute(relative);
      } else allowed = ['data:', 'blob:'].includes(url.protocol);
    } catch { /* Invalid and external URLs are blocked. */ }
    callback({ cancel: !allowed });
  });
  // Native close owns the desktop prompt. Browser preview uses renderer beforeunload.
  window.on('close', (event) => {
    if (closeApproved || !dirty) return;
    event.preventDefault();
    if (closingDialog) return;
    closingDialog = true;
    dialog.showMessageBox(window, {
      type: 'warning', title: 'Unsaved map', message: 'Discard unsaved changes?',
      detail: 'Your changes will be lost if you close the editor.',
      buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, noLink: true,
    }).then(({ response }) => {
      if (response === 1 && window && !window.isDestroyed()) {
        closeApproved = true;
        window.destroy();
      }
    }).finally(() => { closingDialog = false; });
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; });
  window.loadFile(ENTRY);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
