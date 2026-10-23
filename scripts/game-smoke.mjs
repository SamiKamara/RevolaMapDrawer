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
let socket, project = createDocument(), buffer = Buffer.alloc(0), saveError = null;
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
        assert.equal(packet.length, width * height * 4 + 9); frames.push({ width, height }); send({ type: 'frame-ack' }); continue;
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
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#game-save')).toBeVisible();
  await expect(page.locator('#map-name')).toHaveValue(project.name);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible())), true, 'No separate visible editor window');
  for (const id of ['project-button', 'save-all-button', 'export-button', 'svg-button', 'floor-png-button', 'floor-svg-button']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#game-launch')).toHaveClass(/save-all/);
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
  // Device/module changes must not consume the first wheel or Rewired command.
  send({ type: 'input-mode', gamepad: true });
  previous = await scale(); wheel(120);
  await expect.poll(scale).toBeGreaterThan(previous);
  send({ type: 'input-mode', gamepad: false });
  previous = await scale(); send({ type: 'zoom', factor: 1.2 });
  await expect.poll(scale).toBeGreaterThan(previous);
  previous = await scale(); send({ type: 'zoom', factor: 1 / 1.2 });
  await expect.poll(scale).toBeLessThan(previous);
  async function click(selector) {
    const box = await page.locator(selector).boundingBox(); assert.ok(box);
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) send({ type: 'input', event: { type, x, y, ...(type === 'mouseMove' ? {} : { button: 'left', clickCount: 1 }) } });
  }
  await click('#map-name');
  send({ type: 'input', event: { type: 'keyDown', keyCode: 'A', modifiers: ['control'] } });
  send({ type: 'input', event: { type: 'keyUp', keyCode: 'A', modifiers: ['control'] } });
  for (const char of 'Game roundtrip') send({ type: 'input', event: { type: 'char', keyCode: char } });
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
  await click('#game-keyboard button:text-is("Clear")');
  for (const key of 'TEST') await click(`#game-keyboard button:text-is("${key}")`);
  await click('#game-keyboard button:text-is("Done")');
  await expect(page.locator('#document-title')).toHaveText('TEST');
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
