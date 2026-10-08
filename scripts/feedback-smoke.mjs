import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createInflate } from 'node:zlib';
import { decodePngMetadata } from '../src/png.js';
import { validateDocument } from '../src/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const exportPath = path.join(artifacts, 'feedback-expanded.png');
await fs.rm(exportPath, { force: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ args: [root], cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = { interactions: [], files: {} };

// Inspect the exported image without an image decoder's full 1 GiB RGBA surface.
// Inflate sequentially and retain just the current and preceding grayscale+alpha rows.
async function samplePngRows(png, wanted) {
  assert.equal(png.readUInt32BE(16), 16384);
  assert.equal(png.readUInt32BE(20), 16384);
  assert.equal(png[24], 8);
  assert.equal(png[25], 4, 'The large export uses 8-bit grayscale + alpha');
  assert.equal(png[28], 0, 'The export is not interlaced');
  const compressed = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rowBytes = 16384 * 2;
  let pending = Buffer.alloc(0), previous = Buffer.alloc(rowBytes), row = Buffer.alloc(rowBytes), y = 0;
  const samples = {};
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for await (const chunk of Readable.from(compressed).pipe(createInflate({ chunkSize: 65536 }))) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= rowBytes + 1) {
      const filter = pending[0];
      assert.ok(filter <= 4, 'PNG scanline has a supported filter');
      for (let i = 0; i < rowBytes; i++) {
        const a = i >= 2 ? row[i - 2] : 0, b = previous[i], c = i >= 2 ? previous[i - 2] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        row[i] = (pending[i + 1] + predictor) & 255;
      }
      if (wanted.has(y)) {
        let visible = 0, nonwhite = 0;
        for (let x = 0; x < 16384; x++) {
          if (row[x * 2 + 1]) { visible++; if (row[x * 2] !== 255) nonwhite++; }
        }
        samples[y] = { visible, nonwhite, alpha: Object.fromEntries(wanted.get(y).map(x => [x, row[x * 2 + 1]])) };
      }
      [row, previous] = [previous, row];
      pending = pending.subarray(rowBytes + 1);
      y++;
    }
  }
  assert.equal(y, 16384, 'Every expanded image row is present');
  assert.equal(pending.length, 0);
  return samples;
}

try {
  await desktop.evaluate(({ dialog }) => {
    // Only native dialogs are stubbed. Save/open still use real preload, IPC and filesystem writes.
    global.__revolaFeedback = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaFeedback.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaFeedback.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  const canvas = page.locator('#map-canvas');
  await expect(canvas).toBeVisible();
  let mapPoint;
  const calibrate = async () => {
    const rect = await canvas.boundingBox();
    assert.ok(rect && rect.width > 300 && rect.height > 300);
    const p1 = { x: rect.x + rect.width * .35, y: rect.y + rect.height * .35 };
    const pointerAt = async (x, y) => {
      await page.mouse.move(x, y);
      const values = (await page.locator('#pointer-position').textContent()).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      assert.equal(values?.length, 2);
      return { x: values[0], y: values[1] };
    };
    const w1 = await pointerAt(p1.x, p1.y), w2 = await pointerAt(p1.x + 120, p1.y + 120);
    mapPoint = (x, y) => ({ x: p1.x + (x - w1.x) * 120 / (w2.x - w1.x), y: p1.y + (y - w1.y) * 120 / (w2.y - w1.y) });
  };
  const fit = async () => { await page.locator('#fit-button').click(); await calibrate(); };
  const clickMap = async (x, y) => { const p = mapPoint(x, y); await page.mouse.click(p.x, p.y); };
  const dragMap = async points => {
    const start = mapPoint(...points[0]);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    for (const point of points.slice(1)) { const p = mapPoint(...point); await page.mouse.move(p.x, p.y, { steps: 4 }); }
    await page.mouse.up();
  };
  const snapshot = async name => {
    const filePath = path.join(artifacts, `feedback-${name}.revola.json`);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaFeedback.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(raw), raw, 'Native save contains the validated v2 document');
    return raw;
  };
  const startNew = async () => {
    await page.locator('#new-button').click();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#graph-stats')).toHaveText('0 walls · 0 doors');
    await fit();
  };
  const ends = (doc, edge) => [doc.vertices.find(v => v.id === edge.a), doc.vertices.find(v => v.id === edge.b)];
  const length = (doc, edge) => { const [a, b] = ends(doc, edge); return Math.hypot(b.x - a.x, b.y - a.y); };
  const bounds = doc => ({ left: Math.min(...doc.vertices.map(v => v.x)), right: Math.max(...doc.vertices.map(v => v.x)), top: Math.min(...doc.vertices.map(v => v.y)), bottom: Math.max(...doc.vertices.map(v => v.y)) });

  await fit();
  const initial = await snapshot('initial');
  assert.equal(initial.style.roughness, 2.25, 'New maps reduce previous roughness 3 by exactly 25%');
  assert.equal(initial.width, 8192); assert.equal(initial.originX, 0); assert.equal(initial.originY, 0);
  evidence.interactions.push('new-map roughness 2.25 and original 8192 dimensions');

  await page.locator('[data-tool="wall"]').click();
  await dragMap([[1300, 1800], [4900, 1800]]);
  await page.keyboard.press('Escape');
  await page.locator('[data-tool="door"]').click();
  await clickMap(3000, 1800);
  await expect(page.locator('#graph-stats')).toHaveText('1 walls · 1 doors');
  const withDoor = await snapshot('door');
  await page.locator('[data-tool="wall"]').click();
  await dragMap([[2700, 1800], [3300, 1800]]);
  await page.keyboard.press('Escape');
  const filledDoor = await snapshot('door-filled');
  assert.equal(filledDoor.edges.length, 1);
  assert.equal(filledDoor.edges[0].doors.length, 0);
  assert.equal(filledDoor.edges[0].gaps.length, 0, 'Dragging fully across a door restores solid wall');
  await page.locator('#undo-button').click();
  assert.deepEqual(await snapshot('door-fill-undone'), withDoor);
  await dragMap([[2700, 1800], [3000, 1800]]);
  await page.keyboard.press('Escape');
  const partialDoor = await snapshot('door-partial');
  assert.equal(partialDoor.edges.length, 1);
  assert.equal(partialDoor.edges[0].doors.length, 0, 'A partially filled opening no longer counts as a fixed door');
  assert.equal(partialDoor.edges[0].gaps.length, 1);
  const remaining = partialDoor.edges[0].gaps[0];
  const remainingLength = (remaining.end - remaining.start) * length(partialDoor, partialDoor.edges[0]);
  assert.ok(Math.abs(remainingLength - 187.5) < 5, `The uncovered half remains an ordinary gap (${remainingLength}px)`);
  assert.deepEqual(partialDoor.ship, initial.ship);
  evidence.interactions.push('wall drag fills entire doorway; partial fill retains uncovered gap and removes door semantics; undo is exact');

  await page.locator('#undo-button').click();
  await page.locator('[data-tool="wall"]').click();
  await dragMap([[2700, 1800], [3300, 1800]]);
  await page.keyboard.press('Escape');
  const eraserBaseline = await snapshot('eraser-baseline');
  await page.keyboard.press('e');
  await expect(page.locator('[data-tool="eraser"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#eraser-size')).toBeVisible();
  await page.locator('#eraser-size').selectOption('400');
  await dragMap([[2000, 1800], [2500, 1800], [3000, 1800]]);
  const erased = await snapshot('erased');
  assert.equal(erased.edges.length, 1);
  assert.equal(erased.edges[0].gaps.length, 1, 'Continuous eraser gesture produces one connected missing section');
  assert.ok(Math.abs((erased.edges[0].gaps[0].end - erased.edges[0].gaps[0].start) * length(erased, erased.edges[0]) - 1400) < 5);
  assert.deepEqual(erased.ship, eraserBaseline.ship);
  await page.screenshot({ path: path.join(artifacts, 'feedback-eraser.png') });
  await page.locator('#undo-button').click();
  assert.deepEqual(await snapshot('erase-undone'), eraserBaseline, 'One undo restores the entire multi-point erase stroke');
  await page.locator('#redo-button').click();
  assert.deepEqual(await snapshot('erase-redone'), erased);
  await page.locator('#undo-button').click();
  await dragMap([[1000, 1800], [5100, 1800]]);
  await expect(page.locator('#graph-stats')).toHaveText('0 walls · 0 doors');
  const whollyErased = await snapshot('wall-wholly-erased');
  assert.equal(whollyErased.vertices.length, 0, 'Whole-wall erasing removes orphaned vertices');
  assert.deepEqual(whollyErased.ship, initial.ship);
  await page.locator('#undo-button').click();
  assert.deepEqual(await snapshot('whole-erase-undone'), eraserBaseline);
  await dragMap([[3000, 5700], [5000, 5700]]);
  assert.deepEqual(await snapshot('ship-protected'), eraserBaseline, 'General eraser leaves fixed ship artwork and anchor unchanged');
  evidence.interactions.push('E selects adjustable eraser; partial and whole-wall erase, multi-point stroke undo/redo, protected ship');

  await startNew();
  await page.locator('[data-tool="room"]').click();
  await page.locator('#rotate-room').uncheck();
  await dragMap([[1800, 2200], [4000, 4300]]);
  const room = await snapshot('room');
  assert.equal(room.edges.length, 8);
  const roomBounds = bounds(room);
  await page.locator('[data-tool="select"]').click();
  await dragMap([[2900, 2200], [2900, 1800]]);
  const resized = await snapshot('room-resized');
  assert.deepEqual(resized.edges, room.edges, 'Room resizing retains all graph and gap identities');
  assert.equal(resized.vertices.filter(v => { const before = room.vertices.find(p => p.id === v.id); return Math.hypot(v.x - before.x, v.y - before.y) > 1; }).length, 4, 'Room side and both adjoining chamfers translate together');
  const resizedBounds = bounds(resized);
  assert.equal(resizedBounds.left, roomBounds.left); assert.equal(resizedBounds.right, roomBounds.right); assert.equal(resizedBounds.bottom, roomBounds.bottom);
  assert.ok(Math.abs(resizedBounds.top - 1800) < 5);
  const chamfers = resized.edges.filter(edge => { const [a, b] = ends(resized, edge); return a.x !== b.x && a.y !== b.y; });
  assert.equal(chamfers.length, 4);
  for (const edge of chamfers) assert.ok(Math.abs(length(resized, edge) - 220 * Math.SQRT2) < 1e-5, 'Every room chamfer retains its measured size');
  await expect(page.locator('#selection-badge')).toHaveText('ROOM SIDE');
  await page.locator('#undo-button').click();
  assert.deepEqual(await snapshot('room-resize-undone'), room);
  evidence.interactions.push('dragging a recognizable room side changes room extent, preserves four 220px chamfers and opposite side, and undoes exactly');

  await startNew();
  await expect(page.locator('.room-rotation-guide')).toContainText('Rotate 45°');
  await expect(page.locator('.room-rotation-guide')).toContainText('Shift + R');
  await page.locator('#guide-rotate-room').click();
  await expect(page.locator('[data-tool="room"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#rotate-room')).toBeChecked();
  await dragMap([[3000, 2200], [4900, 3900]]);
  const rotated = await snapshot('rotated-room');
  assert.equal(rotated.edges.length, 8);
  const diagonalSides = rotated.edges.filter(edge => { const [a, b] = ends(rotated, edge); return Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1; });
  assert.equal(diagonalSides.length, 4);
  for (const edge of diagonalSides) assert.ok(length(rotated, edge) > 1000, 'Main room sides are tilted 45°, not just the chamfers');
  await page.keyboard.press('Shift+R');
  await expect(page.locator('#rotate-room')).not.toBeChecked();
  await page.keyboard.press('Shift+R');
  await expect(page.locator('#rotate-room')).toBeChecked();
  await page.screenshot({ path: path.join(artifacts, 'feedback-rotation.png') });
  evidence.interactions.push('Quick Guide names rotation control, starts rotated Room tool, and Shift+R toggles it');

  await fit();
  await page.locator('[data-tool="wall"]').click();
  await dragMap([[1200, 500], [1200, -200]]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#canvas-dimensions')).toHaveText('16384 × 16384 px');
  const expanded = await snapshot('expanded');
  assert.equal(expanded.width, 16384); assert.equal(expanded.height, 16384);
  assert.equal(expanded.originX, -4096); assert.equal(expanded.originY, -4096);
  assert.deepEqual(expanded.ship, rotated.ship);
  assert.deepEqual(expanded.vertices.filter(v => rotated.vertices.some(old => old.id === v.id)), rotated.vertices, 'Expansion does not translate old graph vertices');
  assert.deepEqual(expanded.edges.slice(0, rotated.edges.length), rotated.edges, 'Expansion retains old walls and their scale');
  assert.equal(expanded.originX + expanded.width / 2, rotated.originX + rotated.width / 2);
  assert.equal(expanded.originY + expanded.height / 2, rotated.originY + rotated.height / 2);
  await page.locator('#undo-button').click();
  await expect(page.locator('#canvas-dimensions')).toHaveText('8192 × 8192 px');
  assert.deepEqual(await snapshot('expansion-undone'), rotated, 'Expansion and new wall form a single undo transaction');
  await page.locator('#redo-button').click();
  assert.deepEqual(await snapshot('expansion-redone'), expanded);
  await fit();
  await page.screenshot({ path: path.join(artifacts, 'feedback-expanded.png.preview.png') });
  evidence.interactions.push('drawing outside original boundary expands to centered 16384 without moving/scaling existing graph or ship; undo restores 8192');

  await desktop.evaluate((_electron, filePath) => global.__revolaFeedback.saves.push(filePath), exportPath);
  await page.locator('#export-button').click();
  await expect.poll(async () => fs.stat(exportPath).then(s => s.size).catch(() => 0), { timeout: 180_000 }).toBeGreaterThan(1000);
  await expect(page.locator('#export-button')).toBeEnabled();
  const png = await fs.readFile(exportPath);
  assert.deepEqual(validateDocument(decodePngMetadata(png)), expanded);
  const [roomA, roomB] = ends(expanded, expanded.edges[0]);
  const roomSample = { x: Math.round((roomA.x + roomB.x) / 2 - expanded.originX), y: Math.round((roomA.y + roomB.y) / 2 - expanded.originY) };
  const samples = await samplePngRows(png, new Map([[0, [0]], [4196, [5296]], [roomSample.y, [roomSample.x]], [10096, [0]]]));
  assert.equal(samples[0].alpha[0], 0, 'Expanded margin is transparent');
  assert.equal(samples[4196].alpha[5296], 255, 'Added wall raster appears at world position plus 4096');
  assert.equal(samples[roomSample.y].alpha[roomSample.x], 255, 'Existing room raster retains world scale and gets centered export offset');
  assert.ok(samples[10096].visible > 100, 'Ship remains visible at its centered export position');
  for (const sample of Object.values(samples)) assert.equal(sample.nonwhite, 0, 'Every sampled nontransparent pixel is white');
  evidence.files = { pngBytes: png.length, width: 16384, height: 16384, originX: expanded.originX, originY: expanded.originY, sampledRows: samples, rasterInspection: 'streamed PNG scanlines; no full-map RGBA allocation' };
  await startNew();
  await desktop.evaluate((_electron, filePath) => global.__revolaFeedback.opens.push(filePath), exportPath);
  await page.locator('#open-button').click();
  await expect(page.locator('#canvas-dimensions')).toHaveText('16384 × 16384 px');
  assert.deepEqual(await snapshot('expanded-reopened'), expanded, 'Native PNG reopen restores exact editable expanded document');
  await page.locator('[data-tool="eraser"]').click();
  await page.locator('#eraser-size').selectOption('100');
  await calibrate();
  await dragMap([[1200, 0], [1200, 100]]);
  const reopenedEdited = await snapshot('reopened-edited');
  assert.notDeepEqual(reopenedEdited.edges, expanded.edges, 'Reopened PNG walls remain editable');
  await page.locator('#undo-button').click();
  assert.deepEqual(await snapshot('reopened-edit-undone'), expanded);
  evidence.interactions.push('real native 16384 transparent PNG export, bounded raster inspection, exact metadata reopen, and further editing/undo');
  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(path.join(artifacts, 'feedback-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'feedback-failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.close();
}
