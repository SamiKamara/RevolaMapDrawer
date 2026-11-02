import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, addWall } from '../src/model.js';
import { SharedDocumentAuthority } from '../src/shared-document.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const peers = [], apps = [], errors = [], session = crypto.randomBytes(16).toString('hex');
const labels = {
  '1': { ready: 'Shared map ready.', waiting: 'Waiting for all players to save…', cancel: 'Cancel shared save' },
  '2': { ready: 'Yhteinen kartta on valmis.', waiting: 'Odotetaan pelaajien tallennuksia…', cancel: 'Peru yhteistallennus' },
  '3': { ready: 'Gemeinsame Karte bereit.', waiting: 'Warten auf alle Spieler…', cancel: 'Speichern abbrechen' },
};
let document = crypto.randomBytes(16).toString('hex'), failSave = true, launches = 0, cursorRelays = 0;
let cancelProbe = false, cancelPendingSave, suppressCursors = false;
const project = createDocument();
const points = [[3739.5,4740],[3739.5,4400],[2000,4400],[2000,1000],[6500,1000],[6500,4400],[4452.5,4400],[4452.5,4740]];
for (let i = 1; i < points.length; i++) addWall(project, { x: points[i-1][0], y: points[i-1][1] }, { x: points[i][0], y: points[i][1] }, { joinTolerance: 0 });
const authority = new SharedDocumentAuthority(project), originalEdges = authority.document.edges.length;
const state = author => ({ ...authority.state(author), session, document, kind: 'document' });
function send(peer, value) {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(5); header.writeUInt32LE(body.length + 1); header[4] = 1;
  peer.socket.write(Buffer.concat([header, body]));
}
function event(value) { for (const peer of peers) if (peer.ready) send(peer, { type: 'shared-event', payload: { ...value, session, document } }); }
const output = path.join(root, 'artifacts/shared-game-' + Date.now()); await fs.mkdir(output, { recursive: true });
async function request(peer, message) {
  let payload = null, error = null;
  try {
    switch (message.operation) {
      case 'initial': payload = { project: JSON.stringify(authority.document), shared: { ...state(peer.author), host: peer.author === '1', author: peer.author, labels: labels[peer.author] } }; peer.ready = true; break;
      case 'shared': {
        const result = authority.execute(peer.author, JSON.parse(message.data));
        payload = { ...result, kind: 'change', session, document }; event(payload); break;
      }
      case 'snapshot': send(peer, { type: 'shared-event', payload: state(peer.author) }); break;
      case 'cursor': {
        const position = JSON.parse(message.data); cursorRelays++;
        if (!suppressCursors) event({ ...position, kind: 'cursor', author: peer.author, name: `Steam player ${peer.author}` }); break;
      }
      case 'save': {
        assert.equal(peer.author, '1', 'Guests cannot save or launch');
        event({ kind: 'freeze', active: true, cancelable: true, message: 'Saving on every computer…' });
        if (cancelProbe) await new Promise((resolve, reject) => { cancelPendingSave = () => reject(new Error('Save cancelled by the host.')); });
        if (failSave) { event({ kind: 'freeze', active: false, message: 'Player 3: disk full' }); throw new Error('Player 3: disk full'); }
        const text = JSON.stringify(authority.document);
        await Promise.all(peers.map(async (target, index) => {
          await new Promise(resolve => setTimeout(resolve, 25 + index * 40));
          const folder = path.join(output, target.author); await fs.mkdir(folder, { recursive: true });
          await fs.writeFile(path.join(folder, 'shared.revola'), text); target.saved = true;
        }));
        assert.ok(peers.every(target => target.saved));
        if (message.launch) launches++;
        event({ kind: 'saved' }); event({ kind: 'freeze', active: false }); payload = { name: 'shared-$&-{0}.revola' }; break;
      }
      case 'cancel-save':
        assert.equal(peer.author, '1'); cancelPendingSave?.(); cancelPendingSave = null;
        event({ kind: 'freeze', active: false, message: 'Save cancelled by the host.' }); break;
      case 'new': case 'open': case 'close': assert.equal(peer.author, '1', 'Guests cannot replace or close the document'); break;
      default: throw new Error('Unexpected game operation: ' + message.operation);
    }
  } catch (failure) { error = failure.message; }
  send(peer, { type: 'response', id: message.id, payload: JSON.stringify(payload), error });
}
try {
  for (let i = 1; i <= 3; i++) {
    const peer = { author: String(i), token: crypto.randomBytes(32).toString('hex'), ready: false, saved: false };
    peer.server = net.createServer(socket => {
      peer.socket = socket; let buffer = Buffer.alloc(0);
      socket.on('data', data => {
        buffer = Buffer.concat([buffer, data]);
        while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
          const count = buffer.readUInt32LE(0), packet = buffer.subarray(4, count + 4); buffer = buffer.subarray(count + 4);
          if (packet[0] === 2) { send(peer, { type: 'frame-ack' }); continue; }
          const message = JSON.parse(packet.subarray(1));
          if (message.type === 'hello') assert.equal(message.token, peer.token);
          if (message.type === 'request') request(peer, message).catch(failure => errors.push(failure.message));
        }
      });
    });
    await new Promise(resolve => peer.server.listen(0, '127.0.0.1', resolve)); peers.push(peer);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const packaged = process.argv.includes('--packaged');
    const app = await electron.launch({ env, executablePath: packaged ? path.join(root, 'dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe') : undefined,
      args: [...(packaged ? [] : [root]), `--revola-game=${peer.server.address().port}:${peer.token}`] }); apps.push(app);
    peer.page = await app.firstWindow(); peer.page.on('pageerror', failure => errors.push(failure.message));
    await expect(peer.page.locator('#game-save')).toBeVisible();
    await expect(peer.page.locator('#map-name')).toHaveValue(project.name);
    await expect(peer.page.locator('#map-name')).toBeEnabled();
    if (i !== 1) for (const id of ['game-save', 'game-save-as', 'game-launch', 'game-back', 'new-button', 'open-button']) await expect(peer.page.locator('#' + id)).toBeDisabled();
  }
  const host = peers[0].page, guest = peers[1].page;
  event({ kind: 'freeze', active: true, cancelable: true });
  for (const peer of peers) await expect(peer.page.locator('#status-message')).toHaveText(labels[peer.author].waiting);
  await expect(host.locator('#game-cancel-save')).toHaveText(labels['1'].cancel);
  event({ kind: 'freeze', active: false });
  for (const peer of peers) await expect(peer.page.locator('#status-message')).toHaveText(labels[peer.author].ready);
  await host.locator('#map-name').fill('Shared collaboration'); await host.locator('#map-name').press('Tab');
  await expect(guest.locator('#map-name')).toHaveValue('Shared collaboration');
  await guest.locator('#mirror-button').click(); await expect(host.locator('#mirror-label')).toHaveText('Ship facing left');
  await host.locator('#undo-button').click(); await expect(guest.locator('#map-name')).toHaveValue('Untitled map');
  await expect(host.locator('#mirror-label')).toHaveText('Ship facing left');
  await host.locator('#redo-button').click(); await expect(guest.locator('#map-name')).toHaveValue('Shared collaboration');
  await guest.locator('#undo-button').click(); await expect(host.locator('#mirror-label')).toHaveText('Ship facing right');
  for (const [index, peer] of peers.slice(0, 2).entries()) {
    await peer.page.locator('[data-tool="wall"]').click();
    const box = await peer.page.locator('#map-canvas').boundingBox();
    const scale = Math.min((box.width - 64) / 8192, (box.height - 52) / 8192);
    const x = box.x + (box.width - 8192 * scale) / 2 + (index ? 7000 : 500) * scale;
    const y = box.y + (box.height - 8192 * scale) / 2 + 500 * scale;
    await peer.page.mouse.move(x, y); await peer.page.mouse.down(); await peer.page.mouse.move(x + 500 * scale, y, { steps: 5 }); await peer.page.mouse.up();
    await expect.poll(() => authority.document.edges.length).toBe(originalEdges + index + 1);
    await expect(peer.page.locator('#map-name')).toBeEnabled();
  }
  await host.locator('#undo-button').click(); await expect.poll(() => authority.document.edges.length).toBe(originalEdges + 1);
  await guest.locator('#undo-button').click(); await expect.poll(() => authority.document.edges.length).toBe(originalEdges);
  await expect.poll(() => cursorRelays).toBeGreaterThan(2);
  for (const [index, peer] of peers.entries()) {
    const box = await peer.page.locator('#map-canvas').boundingBox();
    await peer.page.mouse.move(box.x + 150 + index * 140, box.y + 150);
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  await host.screenshot({ path: path.join(output, 'named-cursors.png') });
  for (const peer of peers.slice(1)) {
    const denied = await peer.page.evaluate(async () => {
      try { await window.revolaGame.request('new'); return false; } catch { return true; }
    }); assert.equal(denied, true);
  }
  await expect(host.locator('#game-launch')).toBeEnabled(); await host.locator('#game-launch').click();
  await expect(host.locator('#status-message')).toContainText('disk full'); assert.equal(launches, 0);
  cancelProbe = true; await host.locator('#game-save').click();
  await expect(host.locator('#game-cancel-save')).toBeVisible();
  await expect(host.locator('#game-cancel-save')).toBeEnabled();
  await expect(guest.locator('#game-cancel-save')).toBeHidden();
  await host.locator('#game-cancel-save').click();
  await expect(host.locator('#status-message')).toContainText('cancelled');
  await expect(host.locator('#game-save')).toBeEnabled(); assert.equal(launches, 0); cancelProbe = false;
  await host.evaluate(() => {
    window.saveStatuses = [];
    new MutationObserver(changes => {
      for (const change of changes) for (const node of change.addedNodes) window.saveStatuses.push(node.textContent);
    }).observe(document.getElementById('status-message'), { childList: true });
  });
  failSave = false; await host.locator('#game-launch').click(); await expect.poll(() => launches).toBe(1);
  await expect.poll(() => host.evaluate(() => window.saveStatuses.some(value => value.includes('Saved shared-$&-{0}.revola.')))).toBe(true);
  const saved = await Promise.all(peers.map(peer => fs.readFile(path.join(output, peer.author, 'shared.revola'), 'utf8')));
  assert.equal(new Set(saved).size, 1); assert.equal(saved[0], JSON.stringify(authority.document));

  // Returning from gameplay creates a new authority over the same saved source.
  // The original guest must be able to draw first, with no host edit consuming
  // the colliding transaction namespace in between.
  async function replaceShared(project) {
    authority.reset(project); document = crypto.randomBytes(16).toString('hex');
    for (const peer of peers) send(peer, { type: 'shared-event', payload: state(peer.author) });
    for (const peer of peers) {
      await expect(peer.page.locator('#map-name')).toHaveValue(authority.document.name);
      await expect(peer.page.locator('#map-name')).toBeEnabled();
    }
  }
  async function guestWall(y, count) {
    await guest.locator('[data-tool="wall"]').click(); await guest.locator('#map-canvas').focus(); await guest.keyboard.press('f');
    const box = await guest.locator('#map-canvas').boundingBox();
    const scale = Math.min((box.width - 64) / 8192, (box.height - 52) / 8192);
    const x = box.x + (box.width - 8192 * scale) / 2 + 500 * scale;
    const top = box.y + (box.height - 8192 * scale) / 2 + y * scale;
    await guest.mouse.move(x, top); await guest.mouse.down(); await guest.mouse.move(x + 500 * scale, top, { steps: 5 }); await guest.mouse.up();
    await expect.poll(() => authority.document.edges.length).toBe(count); await expect(guest.locator('#map-name')).toBeEnabled();
  }
  await replaceShared(project); await guestWall(500, originalEdges + 1);
  const playedSource = JSON.stringify(authority.document), originalWall = structuredClone(authority.document.edges.at(-1));
  await fs.writeFile(path.join(output, 'before-playing.revola'), playedSource);
  await replaceShared(JSON.parse(await fs.readFile(path.join(output, 'before-playing.revola'), 'utf8')));
  await new Promise(resolve => setTimeout(resolve, 11000));
  await guestWall(1500, originalEdges + 2);
  assert.deepEqual(authority.document.edges.find(value => value.id === originalWall.id), originalWall);
  await guest.locator('#undo-button').click(); await expect.poll(() => authority.document.edges.length).toBe(originalEdges + 1);
  assert.deepEqual(authority.document, JSON.parse(playedSource));
  await guest.locator('#redo-button').click(); await expect.poll(() => authority.document.edges.length).toBe(originalEdges + 2);

  // Observe actual overlay paints between two known packets. No test accessor
  // or extra network/presentation command is added to the application.
  suppressCursors = true;
  await host.locator('#map-canvas').focus(); await host.keyboard.press('f');
  await host.evaluate(() => {
    window.cursorPaints = [];
    const move = CanvasRenderingContext2D.prototype.moveTo;
    CanvasRenderingContext2D.prototype.moveTo = function (x, y) {
      if (this.canvas.id === 'map-canvas' && this.font === '11px system-ui' && this.strokeStyle === '#dab2ff')
        window.cursorPaints.push({ x, y, at: performance.now() });
      return move.call(this, x, y);
    };
  });
  const cursorPacket = (x, visible = true) => send(peers[0], { type: 'shared-event', payload: {
    session, document, kind: 'cursor', author: '2', name: 'Steam player 2', x, y: 3000, visible } });
  cursorPacket(1000, false); cursorPacket(1000); await new Promise(resolve => setTimeout(resolve, 150));
  await host.evaluate(() => { window.cursorPaints = []; }); cursorPacket(3000);
  await new Promise(resolve => setTimeout(resolve, 350));
  const paints = await host.evaluate(() => window.cursorPaints);
  const positions = new Set(paints.map(value => Math.round(value.x * 100) / 100));
  assert.ok(positions.size >= 8, `Remote cursor must render intermediate positions without more packets: ${positions.size}`);
  await fs.writeFile(path.join(output, 'cursor-paints.json'), JSON.stringify(paints, null, 2));
  await host.screenshot({ path: path.join(output, 'smoothed-cursor.png') }); suppressCursors = false;
  for (const peer of peers) await peer.page.screenshot({ path: path.join(output, `player-${peer.author}.png`) });
  assert.deepEqual(errors, []); console.log('PASS shared in-game UI: three editors, author history, guest-first drawing after saved-source reopen and 11 seconds idle, local cursor animation, host controls, failed save barrier and identical local sources. ' + output);
} catch (error) {
  console.error(JSON.stringify({ statuses: await Promise.all(peers.map(peer => peer.page?.locator('#status-message').textContent().catch(() => null))),
    edges: authority.document.edges, vertices: authority.document.vertices, history: [...authority.histories] }));
  throw error;
} finally {
  for (const app of apps) await app.close().catch(() => {});
  for (const peer of peers) { peer.socket?.destroy(); peer.server?.close(); }
}
