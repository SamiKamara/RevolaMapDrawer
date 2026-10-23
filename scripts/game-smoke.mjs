import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, addWall } from '../src/model.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const token = crypto.randomBytes(32).toString('hex'), requests = [], frames = [];
let socket, project = createDocument(), buffer = Buffer.alloc(0), saveError = null, latestFrame;
const points = [[3739.5,4740],[3739.5,4400],[2000,4400],[2000,1000],[6500,1000],[6500,4400],[4452.5,4400],[4452.5,4740]];
for (let i = 1; i < points.length; i++) addWall(project, {x:points[i-1][0],y:points[i-1][1]}, {x:points[i][0],y:points[i][1]}, {joinTolerance:0});
const send = message => { const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(5); header.writeUInt32LE(body.length + 1); header[4] = 1; socket.write(Buffer.concat([header, body])); };
const server = net.createServer(connection => {
  socket = connection;
  connection.on('data', bytes => {
    buffer = Buffer.concat([buffer, bytes]);
    while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
      const count = buffer.readUInt32LE(0), packet = buffer.subarray(4, 4 + count); buffer = buffer.subarray(4 + count);
      if (packet[0] === 2) {
        const width = packet.readInt32LE(1), height = packet.readInt32LE(5);
        assert.equal(packet.length, width * height * 4 + 9); latestFrame = { width, height, pixels: Buffer.from(packet.subarray(9)) }; frames.push({ width, height }); send({ type: 'frame-ack' }); continue;
      }
      const message = JSON.parse(packet.subarray(1));
      if (message.type === 'hello') { assert.equal(message.token, token); send({ type: 'resize', width: 1440, height: 960 }); }
      if (message.type !== 'request') continue;
      requests.push(message);
      let payload = null, error = null;
      if (message.operation === 'initial' || message.operation === 'open') payload = { name: 'fixture.revola', project: JSON.stringify(project) };
      if (message.operation === 'list') payload = { entries: [{ key: 'fixture', name: project.name }] };
      if (message.operation === 'save') {
        error = saveError;
        if (!error) { project = JSON.parse(message.project); payload = { name: 'Map-fixture.revola' }; }
      }
      send({ type: 'response', id: message.id, payload: JSON.stringify(payload), error });
    }
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const packaged = process.argv.includes('--packaged');
const executablePath = packaged ? path.join(root, 'dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe') : undefined;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath, args: [...(packaged ? [] : [root]), `--revola-game=${server.address().port}:${token}`], env });
try {
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#game-save')).toBeVisible();
  await expect(page.locator('#map-name')).toHaveValue(project.name);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible())), true, 'No separate visible editor window');
  for (const id of ['project-button', 'save-all-button', 'export-button', 'svg-button', 'floor-png-button', 'floor-svg-button']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#game-launch')).toHaveClass(/save-all/);
  for (const [width, height] of [[2560,1072], [2133,1600], [2560,720], [533,1600], [1440,960]]) {
    send({ type: 'resize', width, height });
    await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
    await expect.poll(() => frames.at(-1)).toEqual({ width, height });
  }
  const scale = () => page.locator('#zoom-value').textContent().then(value => parseInt(value));
  const canvas = await page.locator('#map-canvas').boundingBox();
  assert.ok(canvas);
  const x = Math.round(canvas.x + canvas.width / 2), y = Math.round(canvas.y + canvas.height / 2);
  const wheel = deltaY => {
    send({ type: 'input', event: { type: 'mouseMove', x, y } });
    send({ type: 'input', event: { type: 'mouseWheel', x, y, deltaY, deltaX: 0 } });
  };
  let previous = await scale(); wheel(120);
  await expect.poll(scale).toBeGreaterThan(previous);
  previous = await scale(); wheel(-120);
  await expect.poll(scale).toBeLessThan(previous);
  // Device/module changes must not consume the first left-stick/wheel zoom.
  send({ type: 'input-mode', gamepad: true });
  previous = await scale(); wheel(120);
  await expect.poll(scale).toBeGreaterThan(previous);
  send({ type: 'input-mode', gamepad: false });
  previous = await scale(); send({ type: 'zoom', factor: 1.2 });
  await page.waitForTimeout(100);
  assert.equal(await scale(), previous, 'Removed ZoomIn/ZoomOut commands cannot change zoom');
  async function click(selector) {
    const box = await page.locator(selector).boundingBox(); assert.ok(box);
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) send({ type: 'input', event: { type, x, y, ...(type === 'mouseMove' ? {} : { button: 'left', clickCount: 1 }) } });
  }
  send({ type: 'input', event: { type: 'mouseMove', x: 10, y: 20 } });
  const canvasHash = () => page.evaluate(async () => {
    const canvas = document.getElementById('map-canvas');
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  });
  await page.waitForTimeout(100);
  const withGrid = await canvasHash();
  send({ type: 'pan', x: 40, y: -30 });
  await expect.poll(canvasHash).not.toBe(withGrid);
  const panned = await canvasHash();
  assert.equal(await scale(), previous, 'D-pad pan preserves zoom');
  send({ type: 'pan', x: -40, y: 30 });
  await expect.poll(canvasHash).toBe(withGrid);
  // The dedicated controller pan must produce exactly the same viewport as
  // dragging the physical middle button by the same screen-space delta.
  for (const event of [{ type: 'mouseMove', x, y }, { type: 'mouseDown', x, y, button: 'middle', clickCount: 1 },
    { type: 'mouseMove', x: x + 40, y: y - 30 }, { type: 'mouseUp', x: x + 40, y: y - 30, button: 'middle', clickCount: 1 },
    { type: 'mouseMove', x: 10, y: 20 }]) send({ type: 'input', event });
  await expect.poll(canvasHash).toBe(panned);
  send({ type: 'pan', x: -40, y: 30 });
  await expect.poll(canvasHash).toBe(withGrid);
  await click('#grid-toggle'); await expect(page.locator('#grid-toggle')).not.toBeChecked();
  await expect.poll(canvasHash).not.toBe(withGrid);
  await click('#grid-toggle'); await expect(page.locator('#grid-toggle')).toBeChecked();
  await expect.poll(canvasHash).toBe(withGrid);
  await click('#mirror-button'); await expect(page.locator('#game-launch')).toBeEnabled();
  await expect.poll(canvasHash).not.toBe(withGrid);
  await click('#mirror-button'); await expect(page.locator('#game-launch')).toBeEnabled();
  await expect.poll(canvasHash).toBe(withGrid);
  await click('#map-name');
  send({ type: 'input', event: { type: 'keyDown', keyCode: 'A', modifiers: ['control'] } });
  send({ type: 'input', event: { type: 'keyUp', keyCode: 'A', modifiers: ['control'] } });
  for (const char of 'Game roundtrip') send({ type: 'input', event: { type: 'char', keyCode: char } });
  await expect(page.locator('#map-name')).toHaveValue('Game roundtrip');
  const caret = page.locator('.game-text-caret');
  await expect(caret).toBeVisible(); await expect(caret).toHaveAttribute('data-position', '14');
  const caretBox = await caret.boundingBox();
  const caretPixels = () => {
    const x = Math.ceil(caretBox.x), y = Math.ceil(caretBox.y + caretBox.height / 2);
    return latestFrame.pixels.subarray((y * latestFrame.width + x) * 4, (y * latestFrame.width + x + 1) * 4).toString('hex');
  };
  await page.waitForTimeout(50);
  const blink = new Set();
  await expect.poll(() => { blink.add(caretPixels()); return blink.size; }).toBeGreaterThan(1);
  send({ type: 'input', event: { type: 'keyDown', keyCode: 'Left' } });
  send({ type: 'input', event: { type: 'keyUp', keyCode: 'Left' } });
  await expect(caret).toHaveAttribute('data-position', '13');
  await page.screenshot({ path: path.join(root, 'artifacts/game-map-name-caret.png') });
  send({ type: 'input', event: { type: 'keyDown', keyCode: 'Tab' } });
  send({ type: 'input', event: { type: 'keyUp', keyCode: 'Tab' } });
  await expect(page.locator('#document-title')).toHaveText('Game roundtrip');
  saveError = 'Test write failure'; await click('#game-save');
  await expect(page.locator('#status-message')).toContainText('Test write failure');
  assert.match(await page.title(), /•/);
  saveError = null; await click('#game-save');
  await expect.poll(() => requests.filter(request => request.operation === 'save').length).toBe(2);
  await expect(page.locator('#status-message')).toContainText('Saved');
  assert.equal(project.name, 'Game roundtrip'); assert.doesNotMatch(await page.title(), /•/);
  await click('#game-save-as');
  await expect(page.locator('dialog[open] input')).toBeVisible();
  await page.locator('dialog[open] input').fill('Game copy');
  await page.locator('dialog[open] button[value="ok"]').click();
  await expect(page.locator('#map-name')).toHaveValue('Game copy');
  await expect(page.locator('#game-launch')).toBeEnabled(); await click('#game-launch');
  await expect.poll(() => requests.some(request => request.operation === 'save' && request.launch)).toBe(true);
  await click('#game-folder'); await expect.poll(() => requests.some(request => request.operation === 'folder')).toBe(true);
  await click('#open-button'); await click('dialog[open] select');
  await expect(page.locator('#game-select')).toBeVisible(); await click('#game-select .game-select-list button');
  await page.locator('dialog[open] button[value="ok"]').click();
  await expect.poll(() => requests.some(request => request.operation === 'open')).toBe(true);
  await expect(page.locator('#status-message')).toContainText('Opened fixture.revola');
  await expect(page.locator('#map-name')).toHaveValue('Game copy');
  await click('#new-button');
  await expect(page.locator('#game-launch')).toBeDisabled(); await click('#game-save');
  await expect.poll(() => requests.filter(request => request.operation === 'save').length).toBe(5);
  send({ type: 'input-mode', gamepad: true });
  await expect(page.locator('.gamepad-help')).toBeVisible(); await click('#map-name');
  await expect(page.locator('#game-keyboard')).toBeVisible();
  await expect(page.getByLabel('Controller text')).toHaveValue(await page.locator('#map-name').inputValue());
  await click('#game-keyboard button:text-is("Clear")');
  for (const key of 'TEST') await click(`#game-keyboard button:text-is("${key}")`);
  await click('#game-keyboard button:text-is("Done")');
  await expect(page.locator('#document-title')).toHaveText('TEST');
  await expect(page.locator('#game-keyboard')).toHaveCount(0);
  // Clicking the same, already-focused field must reopen the keyboard.
  await click('#map-name'); await expect(page.locator('#game-keyboard')).toBeVisible();
  await click('#game-keyboard button:text-is("Clear")');
  for (const key of 'TEST') await click(`#game-keyboard button:text-is("${key}")`);
  await click('#game-keyboard button:text-is("←")');
  await expect(caret).toHaveAttribute('data-position', '3');
  await click('#game-keyboard button:text-is("A")');
  await expect(page.getByLabel('Controller text')).toHaveValue('TESAT');
  await click('#game-keyboard button:text-is("⌫")');
  await expect(page.getByLabel('Controller text')).toHaveValue('TEST');
  await click('#game-keyboard button:text-is("Shift")'); await click('#game-keyboard button:text-is("a")');
  await expect(page.getByLabel('Controller text')).toHaveValue('TESaT');
  // A physical keyboard remains usable if input mode changes inside the dialog.
  send({ type: 'input-mode', gamepad: false });
  send({ type: 'input', event: { type: 'char', keyCode: 'x' } });
  await expect(page.getByLabel('Controller text')).toHaveValue('TESaxT');
  send({ type: 'input', event: { type: 'keyDown', keyCode: 'Backspace' } });
  send({ type: 'input', event: { type: 'keyUp', keyCode: 'Backspace' } });
  await expect(page.getByLabel('Controller text')).toHaveValue('TESaT');
  send({ type: 'input-mode', gamepad: true });
  await page.screenshot({ path: path.join(root, `artifacts/game-keyboard${packaged ? '-packaged' : ''}.png`) });
  await click('#game-keyboard button:text-is("Done")');
  await expect(page.locator('#document-title')).toHaveText('TESaT');
  await click('#map-name'); await expect(page.locator('#game-keyboard')).toBeVisible();
  await click('#game-keyboard button:text-is("Clear")'); await click('#game-keyboard button:text-is("Cancel")');
  await expect(page.locator('#map-name')).toHaveValue('TESaT');
  // Switching to controller while a mouse-focused field is active opens it too.
  send({ type: 'input-mode', gamepad: false });
  await click('#map-name'); send({ type: 'input-mode', gamepad: true });
  await expect(page.locator('#game-keyboard')).toBeVisible(); await click('#game-keyboard button:text-is("Cancel")');
  await click('#game-save-as');
  await expect(page.locator('#game-keyboard')).toBeVisible();
  await click('#game-keyboard button:text-is("Clear")');
  for (const key of 'COPY') await click(`#game-keyboard button:text-is("${key}")`);
  await click('#game-keyboard button:text-is("Done")');
  await click('dialog[open] button[value="ok"]'); await expect(page.locator('#map-name')).toHaveValue('COPY');
  await page.evaluate(() => document.getElementById('npc-route-dialog').showModal());
  await click('#npc-route-count'); await expect(page.locator('.game-keyboard-numeric')).toBeVisible();
  await click('#game-keyboard button:text-is("Clear")');
  await click('#game-keyboard button:text-is("1")'); await click('#game-keyboard button:text-is("2")');
  await click('#game-keyboard button:text-is("Done")'); await expect(page.locator('#npc-route-count')).toHaveValue('12');
  await page.evaluate(() => document.getElementById('npc-route-dialog').close());
  // Keep a dirty project for the close/cancel checks below.
  send({ type: 'input-mode', gamepad: false }); await click('#map-name');
  send({ type: 'input', event: { type: 'char', keyCode: 'x' } });
  send({ type: 'input', event: { type: 'keyDown', keyCode: 'Tab' } });
  send({ type: 'input', event: { type: 'keyUp', keyCode: 'Tab' } });
  await click('#game-back'); await expect(page.locator('#confirm-dialog')).toBeVisible();
  await click('#confirm-dialog button[value="cancel"]');
  assert.equal(requests.some(request => request.operation === 'close'), false, 'Dirty-close cancellation keeps editing');
  await expect.poll(() => frames.some(frame => frame.width === 1440 && frame.height === 960)).toBe(true);
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(root, `artifacts/game-editor${packaged ? '-packaged' : ''}.png`) });
  await click('#game-back'); await click('#confirm-dialog button[value="discard"]');
  await expect.poll(() => requests.some(request => request.operation === 'close')).toBe(true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ packaged, requests: requests.map(({ operation, launch, saveAs }) => ({ operation, launch, saveAs })), frames: frames.length, separateVisibleWindows: 0 }));
} finally { socket?.destroy(); await app.close(); server.close(); }
