// Save all through actual native IPC/filesystem writes and one real browser ZIP.
// Only native dialog choices and a deliberate filesystem failure are substituted.
import { _electron as electron, chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInflate } from 'node:zlib';
import { createHash } from 'node:crypto';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, validateDocument } from '../src/model.js';
import { generateFloor, renderFloorSvg } from '../src/floors.js';
import { renderMapSvg } from '../src/svg.js';
import { decodePngMetadata } from '../src/png.js';
import { SAVE_ALL_FORMATS } from '../src/save-all.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged'), browserOnly = process.argv.includes('--browser');
const stress = process.argv.includes('--stress');
const urlIndex = process.argv.indexOf('--url');
const deployedUrl = urlIndex >= 0 ? new URL(process.argv[urlIndex + 1]).href : null;
if (deployedUrl) assert.equal(new URL(deployedUrl).protocol, 'https:');
const prefix = packaged ? 'save-all-packaged' : deployedUrl ? 'save-all-production' : browserOnly ? 'save-all-browser' : 'save-all';
const artifacts = path.join(root, 'artifacts'), destination = name => path.join(artifacts, `${prefix}-${name}`);
await fs.mkdir(artifacts, { recursive: true });
const evidence = { native: null, browser: null, rendererErrors: [] };
const fixture = createDocument(); fixture.name = 'Save all — Station';
const points = [[3739.5, 4740], [3739.5, 4400], [2000, 4400], [2000, 1000], [6500, 1000], [6500, 4400], [4452.5, 4400], [4452.5, 4740]];
for (let index = 1; index < points.length; index++) addWall(fixture, { x: points[index - 1][0], y: points[index - 1][1] }, { x: points[index][0], y: points[index][1] }, { joinTolerance: 0 });
assert.deepEqual(validateDocument(fixture), fixture); assert.equal(generateFloor(fixture).closed, true);
const fixturePath = destination('fixture.revola'); await fs.writeFile(fixturePath, JSON.stringify(fixture));
const blank = createDocument(); blank.name = 'Open map'; const blankPath = destination('open-fixture.revola'); await fs.writeFile(blankPath, JSON.stringify(blank));
const saveSelectors = ['#save-all-button', '#export-button', '#svg-button', '#floor-png-button', '#floor-svg-button', '#project-button'];
const exportBase = name => (name || 'Untitled map').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 80).replace(/[. ]+$/, '') || 'Untitled map';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function unpack(zip) {
  const files = [], end = zip.length - 22; assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 5); let at = zip.readUInt32LE(end + 16);
  for (let index = 0; index < 5; index++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50); assert.equal(zip.readUInt16LE(at + 8), 0x0800); assert.equal(zip.readUInt16LE(at + 10), 0);
    const nameLength = zip.readUInt16LE(at + 28), local = zip.readUInt32LE(at + 42), size = zip.readUInt32LE(at + 20);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    assert.equal(zip.readUInt32LE(local), 0x04034b50); assert.equal(zip.readUInt16LE(local + 6), 0x0800); assert.equal(zip.readUInt16LE(local + 8), 0);
    assert.equal(zip.toString('utf8', local + 30, local + 30 + nameLength), name);
    const bytes = zip.subarray(local + 30 + nameLength, local + 30 + nameLength + size);
    assert.equal(crc32(bytes), zip.readUInt32LE(at + 16)); assert.equal(crc32(bytes), zip.readUInt32LE(local + 14));
    files.push({ name, bytes }); at += 46 + nameLength;
  }
  assert.equal(at, end); return files;
}
async function inspectPng(bytes, source, grayscale, fullRaster = true) {
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length));
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) }); offset += length + 12;
  }
  const header = chunks[0].data; assert.equal(header.readUInt32BE(0), source.width); assert.equal(header.readUInt32BE(4), source.height);
  assert.deepEqual([...header.subarray(8)], [8, 4, 0, 0, 0]);
  if (grayscale === 255) assert.deepEqual(validateDocument(decodePngMetadata(bytes)), source);
  else { assert.ok(!chunks.some(chunk => chunk.type === 'iTXt')); assert.throws(() => decodePngMetadata(bytes), /no Revola Map metadata/); }
  if (!fullRaster) return { bytes: bytes.length, width: source.width, height: source.height, allCrcsValid: true, exactEditableMetadata: grayscale === 255, fullRaster: false };
  const probes = new Map([[100 * source.width + 100, 'space'], [1000 * source.width + 3000, 'wall'], [2000 * source.width + 3000, 'interior']]);
  const probeAlpha = {}, inflater = createInflate(), line = source.width * 2 + 1;
  let position = 0, alpha = 0, visible = 0, transparent = 0;
  const consuming = (async () => {
    for await (const data of inflater) for (const byte of data) {
      const column = position % line;
      if (!column) { assert.equal(byte, 1); alpha = 0; }
      else if (column % 2) {
        if (byte !== (column === 1 ? grayscale : 0)) throw new Error('A reconstructed grayscale pixel has the wrong export color.');
      }
      else {
        alpha = (alpha + byte) & 255; if (alpha) visible++; else transparent++;
        const pixel = Math.floor(position / line) * source.width + column / 2 - 1;
        if (probes.has(pixel)) probeAlpha[probes.get(pixel)] = alpha;
      }
      position++;
    }
  })(); consuming.catch(() => {});
  for (const chunk of chunks.filter(chunk => chunk.type === 'IDAT')) if (!inflater.write(chunk.data)) await new Promise(resolve => inflater.once('drain', resolve));
  inflater.end(); await consuming;
  assert.equal(position, line * source.height); assert.ok(visible > 0 && transparent > 0);
  assert.equal(probeAlpha.space, 0); assert.equal(probeAlpha.wall, 255); assert.equal(probeAlpha.interior, grayscale === 255 ? 0 : 255);
  return { bytes: bytes.length, visible, transparent, probeAlpha };
}
async function inspectSet(files, source, fullRaster = true) {
  assert.deepEqual(files.map(file => file.name), SAVE_ALL_FORMATS.map(format => exportBase(source.name) + format.suffix));
  assert.deepEqual(validateDocument(JSON.parse(files[4].bytes.toString('utf8'))), source);
  assert.equal(files[1].bytes.toString('utf8'), renderMapSvg(source));
  assert.equal(files[3].bytes.toString('utf8'), renderFloorSvg(source, { floor: generateFloor(source) }));
  return { files: files.map(file => ({ name: file.name, bytes: file.bytes.length })),
    walls: await inspectPng(files[0].bytes, source, 255, fullRaster), floor: await inspectPng(files[2].bytes, source, 0, fullRaster), exactSvgAndEditableSource: true };
}
async function disabledDuringGesture(page) {
  const canvas = page.locator('#map-canvas');
  const kind = await page.evaluate(() => window.revolaDesktop ? 'native' : 'browser');
  const phases = [];
  await page.evaluate(() => {
    const canvas = document.getElementById('map-canvas');
    window.__revolaSaveGestureEvents = [];
    window.__revolaSaveGestureController = new AbortController();
    const options = { signal: window.__revolaSaveGestureController.signal };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) canvas.addEventListener(type, event => {
      const item = { type, x: event.clientX, y: event.clientY, button: event.button, buttons: event.buttons,
        pointerId: event.pointerId, pointerType: event.pointerType, target: event.target.id, trusted: event.isTrusted };
      // Observe the application's pointer handler after it has run, without
      // exposing or changing its document, gesture or camera state.
      queueMicrotask(() => window.__revolaSaveGestureEvents.push({ ...item, captured: canvas.hasPointerCapture(event.pointerId),
        activeTool: document.querySelector('[data-tool][aria-pressed="true"]')?.dataset.tool,
        status: document.getElementById('status-message').textContent,
        saveAllDisabled: document.getElementById('save-all-button').disabled }));
    }, options);
    window.addEventListener('blur', () => window.__revolaSaveGestureEvents.push({ type: 'window-blur' }), options);
  });
  const choose = async tool => {
    await page.locator(`[data-tool="${tool}"]`).click();
    await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#active-tool-name')).toHaveText(tool === 'wall' ? 'Wall tool' : 'Room tool');
    // Tool changes schedule a render. Recalibrate each press from that frame;
    // never reuse a coordinate measured before the previous toolbar action.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const calibration = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect(), matrix = element.getContext('2d').getTransform();
      const point = { x: rect.x + (3000 * matrix.a + matrix.e) * rect.width / element.width,
        y: rect.y + (2000 * matrix.d + matrix.f) * rect.height / element.height };
      return { point, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        pixels: { width: element.width, height: element.height }, matrix: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f },
        hit: document.elementFromPoint(point.x, point.y)?.id, viewport: { width: innerWidth, height: innerHeight, ratio: devicePixelRatio },
        focused: document.hasFocus(), activeElement: document.activeElement?.id,
        pointerDownCount: window.__revolaSaveGestureEvents.filter(event => event.type === 'pointerdown').length };
    });
    phases.push({ tool, calibration });
    assert.ok(calibration.matrix.a > 0 && calibration.matrix.d > 0, `${kind} ${tool}: rendered map transform is ready`);
    assert.equal(calibration.hit, 'map-canvas', `${kind} ${tool}: the recalibrated pointer hits the canvas`);
    return calibration;
  };
  const press = async tool => {
    const calibration = await choose(tool);
    await page.mouse.move(calibration.point.x, calibration.point.y); await page.mouse.down();
    const pointerDowns = await page.evaluate(() => window.__revolaSaveGestureEvents.filter(event => event.type === 'pointerdown'));
    assert.equal(pointerDowns.length, calibration.pointerDownCount + 1, `${kind} ${tool}: exactly one real canvas press was received`);
    const event = pointerDowns.at(-1); phases.at(-1).pointerDown = event;
    assert.equal(event.target, 'map-canvas'); assert.equal(event.trusted, true); assert.equal(event.button, 0); assert.equal(event.activeTool, tool);
    assert.ok(Math.abs(event.x - calibration.point.x) < 1 && Math.abs(event.y - calibration.point.y) < 1, `${kind} ${tool}: actual pointer matches the fresh measurement`);
    assert.equal(event.captured, true, `${kind} ${tool}: application captured the active drawing gesture`);
    assert.match(event.status, tool === 'wall' ? /Click the next corner/ : /Drag to size a room|Room start aligned/);
    for (const selector of saveSelectors) await expect(page.locator(selector)).toBeDisabled();
  };
  try {
    await press('wall'); await page.mouse.up();
    for (const selector of saveSelectors) await expect(page.locator(selector)).toBeDisabled();
    await page.keyboard.press('Control+s'); await page.keyboard.press('Escape'); await expect(page.locator('#save-all-button')).toBeEnabled();
    if (stress && kind === 'browser') await page.setViewportSize({ width: 1100, height: 720 });
    await press('room'); await page.keyboard.press('Escape'); await page.mouse.up(); await expect(page.locator('#save-all-button')).toBeEnabled();
    if (stress && kind === 'browser') {
      await page.setViewportSize({ width: 1024, height: 700 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    evidence.gestureChecks ||= []; evidence.gestureChecks.push({ kind, phases });
  } catch (error) {
    const state = await page.evaluate(() => ({ events: window.__revolaSaveGestureEvents, title: document.title, focused: document.hasFocus(),
      activeElement: document.activeElement?.id, activeTool: document.querySelector('[data-tool][aria-pressed="true"]')?.dataset.tool,
      status: document.getElementById('status-message').textContent,
      saves: [...document.querySelectorAll('#save-all-button, #export-button, #svg-button, #floor-png-button, #floor-svg-button, #project-button')].map(button => ({ id: button.id, disabled: button.disabled })) }));
    const diagnostic = { error: error.message, kind, phases, state };
    await fs.writeFile(destination(`${kind}-gesture-failure.json`), JSON.stringify(diagnostic, null, 2));
    await page.screenshot({ path: destination(`${kind}-gesture-failure.png`) });
    console.error(JSON.stringify({ saveAllGestureFailure: diagnostic }, null, 2));
    throw error;
  } finally { await page.evaluate(() => window.__revolaSaveGestureController.abort()); }
}
async function compactLayout(page) {
  const rectangles = await page.locator('.topbar button, .document-title').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect(); return { label: element.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  const width = await page.evaluate(() => innerWidth);
  for (let index = 0; index < rectangles.length; index++) {
    const rect = rectangles[index]; assert.ok(rect.left >= 0 && rect.right <= width, `${rect.label} fits the header`);
    for (let previous = 0; previous < index; previous++) {
      const other = rectangles[previous]; assert.ok(rect.left >= other.right - .1 || other.left >= rect.right - .1 || rect.top >= other.bottom || other.top >= rect.bottom, `${rect.label} and ${other.label} do not overlap`);
    }
  }
}

if (!browserOnly && !deployedUrl) {
  const executablePath = path.join(root, 'dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe');
  const matchingFiles = ['index.html', 'src/app.js', 'src/save-all.js', 'src/style.css', 'electron/main.cjs', 'electron/preload.cjs', 'electron/save-all.cjs'];
  if (packaged) for (const file of matchingFiles) assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(path.join(path.dirname(executablePath), 'resources/app.asar'), file)), `Packaged ${file} matches current source`);
  const target = destination('native-exports'); await fs.rm(target, { recursive: true, force: true }); await fs.mkdir(target);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
  const page = await desktop.firstWindow({ timeout: 45_000 }); page.setDefaultTimeout(45_000); page.on('pageerror', error => evidence.rendererErrors.push(error.message));
  try {
    await desktop.evaluate(({ dialog }) => {
      global.__revolaSaveAll = { opens: [], folders: [], openDialogs: [], saveDialogs: [], messages: [], response: 0, gate: false };
      dialog.showOpenDialog = async (_window, options) => {
        const state = global.__revolaSaveAll; state.openDialogs.push(options);
        if (options.properties.includes('openDirectory') && state.gate) await new Promise(resolve => { state.release = resolve; });
        const file = (options.properties.includes('openDirectory') ? state.folders : state.opens).shift();
        return file ? { canceled: false, filePaths: [file] } : { canceled: true, filePaths: [] };
      };
      dialog.showSaveDialog = async (_window, options) => { global.__revolaSaveAll.saveDialogs.push(options); return { canceled: true }; };
      dialog.showMessageBox = async (_window, options) => { global.__revolaSaveAll.messages.push(options); return { response: global.__revolaSaveAll.response }; };
    });
    await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…'); await expect(page.locator('#save-all-button')).toBeDisabled();
    await desktop.evaluate((_electron, file) => global.__revolaSaveAll.opens.push(file), fixturePath); await page.locator('#open-button').click();
    await expect(page.locator('#status-message')).toContainText('Opened'); await expect(page.locator('#save-all-button')).toBeEnabled();
    await disabledDuringGesture(page);
    await page.locator('#map-name').fill('Save all — Station changed'); await page.locator('#map-name').press('Tab');
    const source = { ...structuredClone(fixture), name: 'Save all — Station changed' }; await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
    await desktop.evaluate(() => { global.__revolaSaveAll.gate = true; global.__revolaSaveAll.folders.push(null); });
    await page.locator('#save-all-button').click(); for (const selector of saveSelectors) await expect(page.locator(selector)).toBeDisabled();
    await page.keyboard.press('Control+s'); await page.keyboard.press('Control+z');
    await expect.poll(() => desktop.evaluate(() => typeof global.__revolaSaveAll.release)).toBe('function');
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect(page.locator('#map-canvas')).toBeVisible();
    assert.equal(await desktop.evaluate(() => global.__revolaSaveAll.messages.length), 0, 'Close cannot terminate an in-progress native save');
    const concurrent = await page.evaluate(async () => { try { await window.revolaDesktop.saveAll({}); return 'unexpected success'; } catch (error) { return error.message; } });
    assert.match(concurrent, /Another save is already in progress/);
    await desktop.evaluate(() => { global.__revolaSaveAll.gate = false; global.__revolaSaveAll.release(); });
    await expect(page.locator('#status-message')).toHaveText('Save all canceled.'); await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
    assert.deepEqual(await fs.readdir(target), []);
    const nativeSave = async response => {
      await desktop.evaluate((_electron, value) => { global.__revolaSaveAll.folders.push(value.target); global.__revolaSaveAll.response = value.response; }, { target, response });
      await page.locator('#save-all-button').click(); await expect(page.locator('#save-all-button')).toBeEnabled();
    };
    await nativeSave(0); await expect(page.locator('#status-message')).toContainText('Saved all five formats'); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    const readSet = async () => Promise.all(SAVE_ALL_FORMATS.map(async format => ({ name: source.name + format.suffix, bytes: await fs.readFile(path.join(target, source.name + format.suffix)) })));
    const before = await readSet(), first = await inspectSet(before, source);
    await page.locator('#mirror-button').click(); source.ship.mirrored = !source.ship.mirrored;
    await nativeSave(0); await expect(page.locator('#status-message')).toHaveText('Save all canceled.'); await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
    assert.deepEqual(await readSet(), before, 'Canceling the single overwrite prompt changes no bytes');
    await desktop.evaluate(() => {
      const io = process.getBuiltinModule('node:fs/promises'); global.__revolaSaveAllIo = io; global.__revolaOriginalLink = io.link; let count = 0;
      io.link = async (...args) => { if (++count === 3) throw new Error('Injected Save all installation failure'); return global.__revolaOriginalLink(...args); };
    });
    try {
      await nativeSave(1); await expect(page.locator('#status-message')).toContainText('Injected Save all installation failure');
      await expect(page.locator('#status-message')).toHaveClass(/error/); await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
      assert.deepEqual(await readSet(), before, 'Real filesystem rollback restores all five originals after a partial installation');
      assert.equal((await fs.readdir(target)).length, 5, 'No .tmp/.bak files remain after successful rollback');
    } finally { await desktop.evaluate(() => { global.__revolaSaveAllIo.link = global.__revolaOriginalLink; }); }
    await nativeSave(1); await expect(page.locator('#status-message')).toContainText('Saved all five formats'); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    const replacement = await inspectSet(await readSet(), source);
    const dialogs = await desktop.evaluate(() => global.__revolaSaveAll);
    assert.equal(dialogs.saveDialogs.length, 0, 'Save all never opens five separate save dialogs');
    assert.equal(dialogs.openDialogs.filter(options => options.properties.includes('openDirectory')).length, 5);
    assert.equal(dialogs.messages.length, 3); for (const message of dialogs.messages) assert.match(message.message, /Replace 5 existing files/);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700)); await page.waitForFunction(() => innerWidth <= 1024);
    await compactLayout(page); await page.screenshot({ path: destination('native-compact.png') });
    evidence.native = { packaged, matchingFiles: packaged ? matchingFiles : [], first, replacement, folderCancel: true, overwriteCancel: true, partialFailureRollsBackAllFive: true,
      activeGestureAndConcurrentSaveBlocked: true, closeDuringSaveBlocked: true, confirmedSaveClearsDirty: true, compactHeader: true, folderDialogs: 5, overwriteDialogs: 3 };
  } finally {
    // A failed assertion can leave a dirty test map. Do not hang on the native
    // Keep editing close response; this process owns generated test fixtures.
    await desktop.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await desktop.close();
  }
}

if (!packaged) {
  let server, url = deployedUrl;
  if (!url) {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    server = http.createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname), file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        const content = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(content);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${server.address().port}/`;
  }
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1024, height: 700 }, serviceWorkers: 'allow',
    ...(stress ? { deviceScaleFactor: 1.5 } : {}) });
  const page = await context.newPage(); page.setDefaultTimeout(45_000); page.on('pageerror', error => evidence.rendererErrors.push(error.message));
  const stressSession = stress ? await context.newCDPSession(page) : null;
  if (stressSession) await stressSession.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const downloads = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  try {
    await page.goto(url); await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…'); await expect(page.locator('#save-all-button')).toBeDisabled();
    const open = async file => {
      await page.locator('#file-input').setInputFiles(file);
      await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
      if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
      await expect(page.locator('#status-message')).toContainText('Opened');
    };
    await open(fixturePath); await expect(page.locator('#save-all-button')).toBeEnabled(); await disabledDuringGesture(page);
    if (stressSession) await stressSession.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.locator('#map-name').fill('Save all — Station changed'); await page.locator('#map-name').press('Tab');
    await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
    const source = { ...structuredClone(fixture), name: 'Save all — Station changed' };
    const waiting = page.waitForEvent('download'); await page.locator('#save-all-button').click();
    for (const selector of saveSelectors) await expect(page.locator(selector)).toBeDisabled();
    await page.keyboard.press('Control+s'); const download = await waiting;
    assert.equal(download.suggestedFilename(), `${source.name}-all.zip`); const zipPath = destination('browser-all.zip'); await download.saveAs(zipPath);
    await expect(page.locator('#status-message')).toContainText('all five formats included'); await expect(page.locator('#save-all-button')).toBeEnabled();
    await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/); assert.deepEqual(downloads, [`${source.name}-all.zip`], 'Exactly one download survives browser multi-download restrictions');
    const contents = await inspectSet(unpack(await fs.readFile(zipPath)), source);
    await compactLayout(page); await page.screenshot({ path: destination('browser-compact.png') });
    await open(blankPath); await expect(page.locator('#save-all-button')).toBeDisabled();
    evidence.browser = { url, production: !!deployedUrl, ...(stress ? { stress: { gestureCpuThrottle: 4, deviceScaleFactor: 1.5, resizeBetweenTools: [1100, 720] } } : {}),
      contents, oneZipDownload: true, downloadKeepsDirty: true, activeGestureAndConcurrentSaveBlocked: true, openMapDisablesSaveAll: true, compactHeader: true };
    if (process.env.REVOLA_FEEDBACK_FIXTURE) {
      const userPath = path.resolve(process.env.REVOLA_FEEDBACK_FIXTURE), originalBytes = await fs.readFile(userPath);
      const originalHash = createHash('sha256').update(originalBytes).digest('hex'), userSource = validateDocument(JSON.parse(originalBytes.toString('utf8')));
      assert.equal(generateFloor(userSource).closed, true, 'The supplied visually closed feedback map supports floors');
      await open(userPath); await expect(page.locator('#save-all-button')).toBeEnabled();
      for (const selector of ['#floor-png-button', '#floor-svg-button']) await expect(page.locator(selector)).toBeEnabled();
      const userWaiting = page.waitForEvent('download'); await page.locator('#save-all-button').click(); const userDownload = await userWaiting;
      assert.equal(userDownload.suggestedFilename(), `${exportBase(userSource.name)}-all.zip`);
      const userZipPath = destination('feedback-all.zip'); await userDownload.saveAs(userZipPath);
      await expect(page.locator('#save-all-button')).toBeEnabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
      const userContents = await inspectSet(unpack(await fs.readFile(userZipPath)), userSource, false);
      assert.deepEqual(await fs.readFile(userPath), originalBytes, 'The private feedback fixture remains byte-identical');
      assert.equal(downloads.length, 2, 'Each Save all action produces exactly one ZIP');
      evidence.browser.feedbackFixture = { originalHash, bytesUnchanged: true, width: userSource.width, height: userSource.height,
        walls: userSource.edges.length, floorAndSaveAllEnabled: true, exactProjectAndEditablePng: true, exactSvgBothLayers: true, contents: userContents };
      await page.screenshot({ path: destination('feedback-browser.png') });
    }
  } finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
assert.deepEqual(evidence.rendererErrors, []);
await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
