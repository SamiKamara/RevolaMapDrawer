// The game owns the visible window, input, files and pause lifecycle. This process
// only renders the local editor into a bitmap; it never shows a native window.
const { app, BrowserWindow, ipcMain } = require('electron');
const net = require('node:net');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'index.html');
const ENTRY_URL = pathToFileURL(ENTRY).href;
const match = /^--revola-game=(\d+):([a-f0-9]{64})$/.exec(process.argv.find(value => value.startsWith('--revola-game=')) || '');
if (!match || +match[1] < 1 || +match[1] > 65535) throw new Error('Invalid game connection.');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
let window, socket, buffer = Buffer.alloc(0), serial = 0, framePending = false, latestImage, gamepadMode = false;
const pending = new Map();
const operations = new Set(['initial', 'new', 'list', 'open', 'save', 'folder', 'close']);
function send(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(5); header.writeUInt32LE(body.length + 1); header[4] = 1;
  socket.write(Buffer.concat([header, body]));
}
function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== ENTRY_URL)
    throw new Error('Only the bundled editor can use game operations.');
}
ipcMain.handle('revola:game', async (event, operation, options) => {
  trusted(event);
  if (!operations.has(operation) || !options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Unknown game operation.');
  if (operation === 'initial') window.webContents.send('revola:game-input-mode', gamepadMode);
  const id = ++serial;
  const message = { ...options, type: 'request', id, operation };
  if (Buffer.byteLength(JSON.stringify(message)) > 5 * 1024 * 1024) throw new Error('Project exceeds the game limit.');
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send(message); });
});
ipcMain.on('revola:game-dirty', (event, dirty) => {
  try { trusted(event); send({ type: 'dirty', dirty: dirty === true }); } catch { /* Untrusted frame. */ }
});
function receive(message) {
  if (message.type === 'response') {
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else { try { request.resolve(JSON.parse(message.payload || 'null')); } catch (error) { request.reject(error); } }
  } else if (message.type === 'input' && window) {
    const input = message.event;
    if (!input || typeof input.type !== 'string') return;
    const event = { type: input.type, modifiers: Array.isArray(input.modifiers) ? input.modifiers : [] };
    if (['mouseMove', 'mouseDown', 'mouseUp', 'mouseWheel'].includes(input.type)) {
      event.x = Math.round(input.x); event.y = Math.round(input.y);
      if (input.type === 'mouseDown' || input.type === 'mouseUp') { event.button = input.button; event.clickCount = input.clickCount || 1; }
      if (input.type === 'mouseWheel') { event.deltaX = input.deltaX || 0; event.deltaY = input.deltaY || 0; event.canScroll = true; }
    } else if (['keyDown', 'keyUp', 'char'].includes(input.type) && typeof input.keyCode === 'string') event.keyCode = input.keyCode;
    else return;
    window.webContents.sendInputEvent(event);
  } else if (message.type === 'resize' && window) {
    // Unity applies a single aspect-preserving scale. Do not clamp either axis
    // upward here: that would distort very wide/portrait game windows again.
    window.setContentSize(Math.max(1, Math.min(2560, Math.round(message.width))), Math.max(1, Math.min(1600, Math.round(message.height))));
    window.webContents.invalidate();
  } else if (message.type === 'frame-ack') { framePending = false; if (latestImage) { const image = latestImage; latestImage = null; paint(image); } }
  else if (message.type === 'input-mode') { gamepadMode = message.gamepad === true; window?.webContents.send('revola:game-input-mode', gamepadMode); }
  else if (message.type === 'pan' && Number.isFinite(message.x) && Number.isFinite(message.y))
    window?.webContents.send('revola:game-pan', Math.max(-256, Math.min(256, message.x)), Math.max(-256, Math.min(256, message.y)));
  else if (message.type === 'close-request') window?.webContents.send('revola:game-close');
  else if (message.type === 'shutdown') app.quit();
}
function paint(image) {
  if (framePending) { latestImage = image; return; }
  if (socket.destroyed) return;
  const pixels = image.toBitmap(), size = image.getSize();
  if (size.width < 1 || size.height < 1 || size.width > 2560 || size.height > 1600 || pixels.length !== size.width * size.height * 4) return;
  framePending = true;
  const header = Buffer.alloc(13); header.writeUInt32LE(pixels.length + 9); header[4] = 2;
  header.writeInt32LE(size.width, 5); header.writeInt32LE(size.height, 9);
  socket.write(Buffer.concat([header, pixels]));
}
app.whenReady().then(() => {
  // Do not reuse a desktop app's session or interfere with its unsaved project.
  socket = net.createConnection({ host: '127.0.0.1', port: +match[1] }, () => {
    send({ type: 'hello', token: match[2] });
    window = new BrowserWindow({ width: 1280, height: 800, show: false, frame: false,
      webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(__dirname, 'game-preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, spellcheck: false,
        partition: `game-${match[2]}` } });
    window.webContents.setFrameRate(30);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const name of ['will-navigate', 'will-frame-navigate', 'will-attach-webview']) window.webContents.on(name, event => event.preventDefault());
    const session = window.webContents.session;
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try {
        const url = new URL(details.url);
        if (url.protocol === 'file:') { const relative = path.relative(ROOT, fileURLToPath(url)); allowed = !relative.startsWith('..') && !path.isAbsolute(relative); }
        else allowed = ['data:', 'blob:'].includes(url.protocol);
      } catch { /* Block invalid URLs. */ }
      callback({ cancel: !allowed });
    });
    window.webContents.on('paint', (_event, _dirty, image) => paint(image));
    window.webContents.on('render-process-gone', () => app.exit(1));
    window.loadFile(ENTRY);
  });
  socket.on('data', bytes => {
    buffer = Buffer.concat([buffer, bytes]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (length < 2 || length > 6 * 1024 * 1024) { socket.destroy(); return; }
      if (buffer.length < length + 4) return;
      const packet = buffer.subarray(4, length + 4); buffer = buffer.subarray(length + 4);
      if (packet[0] !== 1) { socket.destroy(); return; }
      try { receive(JSON.parse(packet.subarray(1).toString('utf8'))); } catch { socket.destroy(); return; }
    }
  });
  socket.on('error', () => app.exit(1));
  socket.on('close', () => app.quit());
});
app.on('window-all-closed', () => app.quit());
