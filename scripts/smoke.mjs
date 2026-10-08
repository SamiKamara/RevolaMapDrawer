import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePngMetadata } from '../src/png.js';
import { validateDocument } from '../src/model.js';
import { SHIP_ANCHOR } from '../src/render.js';
import { createExampleDocument } from './example-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const exportPath = path.join(artifacts, 'smoke-map.png');
const projectPath = path.join(artifacts, 'smoke-map.revola.json');
const recoveredPath = path.join(artifacts, 'smoke-recovered.revola.json');
const invalidPath = path.join(artifacts, 'smoke-invalid.png');
const examplePath = path.join(artifacts, 'smoke-example-fixture.revola.json');
await fs.writeFile(invalidPath, 'This is not a PNG.');
await fs.writeFile(examplePath, JSON.stringify(createExampleDocument(), null, 2));
// Distinct paths prevent stale previous output from making a failed save look successful.
for (const file of [exportPath, projectPath, recoveredPath]) await fs.rm(file, { force: true });

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ args: [root], cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const evidence = { interactions: [], files: {} };

try {
  await desktop.evaluate(({ dialog }) => {
    // Only OS dialogs are replaced; every file operation still traverses the real preload and IPC.
    global.__revolaSmoke = { saves: [], opens: [], messages: [], discard: false };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaSmoke.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaSmoke.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async (_window, options) => {
      global.__revolaSmoke.messages.push(options.message);
      return { response: global.__revolaSmoke.discard ? 1 : 0 };
    };
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  await expect(page.locator('#map-canvas')).toBeVisible();
  assert.equal(await page.evaluate(() => typeof window.revolaDesktop?.openFile), 'function');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.locator('#fit-button').click();

  const canvas = page.locator('#map-canvas');
  const rect = await canvas.boundingBox();
  assert.ok(rect && rect.width > 300 && rect.height > 300);
  const pointerAt = async (x, y) => {
    await page.mouse.move(x, y);
    const values = (await page.locator('#pointer-position').textContent()).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    assert.equal(values?.length, 2, 'Visible pointer readout exposes map coordinates');
    return { x: values[0], y: values[1] };
  };
  const p1 = { x: rect.x + rect.width * 0.35, y: rect.y + rect.height * 0.35 };
  const p2 = { x: p1.x + 120, y: p1.y + 120 };
  const w1 = await pointerAt(p1.x, p1.y);
  const w2 = await pointerAt(p2.x, p2.y);
  const mapPoint = (x, y) => ({ x: p1.x + (x - w1.x) * 120 / (w2.x - w1.x), y: p1.y + (y - w1.y) * 120 / (w2.y - w1.y) });
  const clickMap = async (x, y) => { const p = mapPoint(x, y); await page.mouse.click(p.x, p.y); };
  const dragMap = async (points) => {
    const start = mapPoint(...points[0]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const point of points.slice(1)) { const p = mapPoint(...point); await page.mouse.move(p.x, p.y); }
    await page.mouse.up();
  };
  const stats = () => page.locator('#graph-stats');
  const saveSnapshot = async (name) => {
    const filePath = path.join(artifacts, `smoke-${name}.revola.json`);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaSmoke.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then((s) => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    return validateDocument(JSON.parse(await fs.readFile(filePath, 'utf8')));
  };
  const assertConnectedMove = (original, moved, changedCount) => {
    assert.deepEqual(moved.edges, original.edges, 'Dragging retains graph IDs, connections and door positions');
    const changed = moved.vertices.filter((v) => {
      const before = original.vertices.find((vertex) => vertex.id === v.id);
      return Math.hypot(v.x - before.x, v.y - before.y) > 1;
    });
    assert.equal(changed.length, changedCount, 'Only the constrained joints move');
    const direction = (map, edge) => {
      const a = map.vertices.find((vertex) => vertex.id === edge.a), b = map.vertices.find((vertex) => vertex.id === edge.b);
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    for (const edge of original.edges) {
      assert.ok(Math.abs(direction(original, edge) - direction(moved, edge)) < 1e-8, 'Every connected wall preserves its original direction');
    }
  };

  await page.locator('[data-tool="wall"]').click();
  await clickMap(1800, 1400);
  await clickMap(4300, 1400);
  await clickMap(4300, 3300);
  await page.keyboard.press('Escape');
  await expect(stats()).toHaveText('2 walls · 0 doors');
  evidence.interactions.push('two connected constrained walls');
  await page.locator('[data-tool="door"]').click();
  await clickMap(3000, 1400);
  await expect(stats()).toHaveText('2 walls · 1 doors');
  await page.locator('#undo-button').click();
  await expect(stats()).toHaveText('2 walls · 0 doors');
  await page.locator('#redo-button').click();
  await expect(stats()).toHaveText('2 walls · 1 doors');
  evidence.interactions.push('fixed door, undo, redo');

  await page.locator('[data-tool="room"]').click();
  await dragMap([[1400, 2500], [2800, 4100]]);
  await expect(stats()).toHaveText('10 walls · 1 doors');
  await page.locator('#rotate-room').check();
  await dragMap([[5300, 1100], [6500, 2500]]);
  await expect(stats()).toHaveText('18 walls · 1 doors');
  evidence.interactions.push('axis-aligned and rotated chamfered rooms');
  await page.locator('[data-tool="corridor"]').click();
  await dragMap([[5500, 3600], [7000, 3600], [7000, 5600]]);
  await expect(stats()).toHaveText('22 walls · 1 doors');
  evidence.interactions.push('constant-width corridor with a right-angle turn');

  const baselineZoom = await page.locator('#zoom-value').textContent();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, -250);
  await expect(page.locator('#zoom-value')).not.toHaveText(baselineZoom);
  await page.locator('[data-tool="hand"]').click();
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const beforePan = await pointerAt(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 75, center.y + 40);
  await page.mouse.up();
  const afterPan = await pointerAt(center.x, center.y);
  assert.ok(Math.abs(afterPan.x - beforePan.x) > 100, 'Hand tool pans the map');
  await page.locator('#fit-button').click();
  await expect(page.locator('#zoom-value')).toHaveText(baselineZoom);
  evidence.interactions.push('scroll zoom, hand pan, fit');

  await page.locator('#map-name').fill('Smoke test — Revola');
  await page.locator('#map-name').press('Tab');
  await page.locator('#mirror-button').click();
  await expect(page.locator('#mirror-label')).toHaveText('Ship facing left');
  await desktop.evaluate((_electron, filePath) => global.__revolaSmoke.saves.push(filePath), projectPath);
  await page.locator('#project-button').click();
  await expect.poll(async () => fs.stat(projectPath).then((s) => s.size).catch(() => 0)).toBeGreaterThan(100);
  const project = validateDocument(JSON.parse(await fs.readFile(projectPath, 'utf8')));
  assert.equal(project.name, 'Smoke test — Revola');
  assert.equal(project.edges.length, 22);
  assert.equal(project.edges.flatMap((edge) => edge.doors).length, 1);
  assert.equal(project.ship.mirrored, true);
  await desktop.evaluate((_electron, filePath) => global.__revolaSmoke.saves.push(filePath), exportPath);
  await page.locator('#export-button').click();
  await expect.poll(async () => fs.stat(exportPath).then((s) => s.size).catch(() => 0), { timeout: 90_000 }).toBeGreaterThan(1000);
  const png = await fs.readFile(exportPath);
  assert.deepEqual(validateDocument(decodePngMetadata(png)), project);
  evidence.files.pngBytes = png.length;
  evidence.files.metadataJsonBytes = Buffer.byteLength(JSON.stringify(project));
  evidence.interactions.push('native project save and PNG export, mirrored ship, exact metadata round trip');

  const doorEdge = project.edges.find((edge) => edge.doors.length);
  const doorA = project.vertices.find((vertex) => vertex.id === doorEdge.a);
  const doorB = project.vertices.find((vertex) => vertex.id === doorEdge.b);
  const doorSample = { x: Math.round(doorA.x + (doorB.x - doorA.x) * doorEdge.doors[0].t), y: Math.round(doorA.y) };
  const pixels = await page.evaluate(async ({ url, ship, doorSample }) => {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let transparent = 0, visible = 0, nonwhite = 0, shipPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) transparent++;
      else {
        visible++;
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) nonwhite++;
        const y = Math.floor(i / 4 / image.width), x = i / 4 % image.width;
        if (y > ship.y + 800 && y < ship.y + 1860 && Math.abs(x - ship.x) < 1300) shipPixels++;
      }
    }
    const alphaAt = (x) => data[(doorSample.y * image.width + x) * 4 + 3];
    let left = doorSample.x, right = doorSample.x;
    while (left > 0 && alphaAt(left - 1) === 0) left--;
    while (right < image.width && alphaAt(right) === 0) right++;
    const result = { width: image.width, height: image.height, transparent, visible, nonwhite, shipPixels, doorClearPixels: right - left };
    canvas.width = canvas.height = 1;
    return result;
  }, { url: pathToFileURL(exportPath).href, ship: project.ship, doorSample });
  assert.equal(pixels.width, 8192); assert.equal(pixels.height, 8192);
  assert.ok(pixels.transparent > 50_000_000); assert.ok(pixels.visible > 100_000);
  assert.equal(pixels.nonwhite, 0, 'All nontransparent PNG pixels are white');
  assert.ok(pixels.shipPixels > 10_000, 'Export retains the fixed ship');
  assert.ok(Math.abs(pixels.doorClearPixels - project.style.doorWidth) <= 2, 'Raster doorway retains the fixed clear width');
  evidence.pixels = pixels;

  // Cancelling native dialogs must neither replace state nor claim a successful write.
  await page.locator('#open-button').click();
  await expect(page.locator('#map-name')).toHaveValue(project.name);
  await page.locator('#map-name').fill('Unsaved smoke map');
  await page.locator('#map-name').press('Tab');
  await page.locator('#project-button').click();
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  await page.locator('#new-button').click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-dialog button[value="cancel"]').click();
  await expect(page.locator('#map-name')).toHaveValue('Unsaved smoke map');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(() => desktop.evaluate(() => global.__revolaSmoke.messages.length)).toBe(1);
  await expect(page.locator('#map-name')).toHaveValue('Unsaved smoke map');
  evidence.interactions.push('native open/save cancellation, replacement cancellation, native dirty-close cancellation');

  await page.locator('#new-button').click();
  await page.locator('#confirm-dialog button[value="discard"]').click();
  await expect(stats()).toHaveText('0 walls · 0 doors');
  await desktop.evaluate((_electron, filePath) => global.__revolaSmoke.opens.push(filePath), exportPath);
  await page.locator('#open-button').click();
  await expect(page.locator('#map-name')).toHaveValue(project.name);
  await expect(stats()).toHaveText('22 walls · 1 doors');
  await desktop.evaluate((_electron, filePath) => global.__revolaSmoke.opens.push(filePath), invalidPath);
  await page.locator('#open-button').click();
  await expect(page.locator('#status-message')).toHaveClass(/error/);
  await expect(page.locator('#map-name')).toHaveValue(project.name);
  await expect(stats()).toHaveText('22 walls · 1 doors');
  await desktop.evaluate((_electron, filePath) => global.__revolaSmoke.saves.push(filePath), recoveredPath);
  await page.locator('#project-button').click();
  await expect.poll(async () => fs.stat(recoveredPath).then((s) => s.size).catch(() => 0)).toBeGreaterThan(100);
  assert.deepEqual(JSON.parse(await fs.readFile(recoveredPath, 'utf8')), project);
  evidence.interactions.push('PNG open restores full editability; invalid PNG leaves the current map intact');
  await page.locator('#fit-button').click();
  await page.locator('[data-tool="select"]').click();

  await dragMap([[2100, 2500], [2100, 2300]]);
  await expect(page.locator('#status-message')).toHaveText('Connected walls moved.');
  const movedWall = await saveSnapshot('wall-moved');
  assertConnectedMove(project, movedWall, 4);
  const topStart = project.vertices.find((vertex) => vertex.x === 1620 && vertex.y === 2500);
  assert.ok(movedWall.vertices.find((vertex) => vertex.id === topStart.id).y < 2350, 'Wall midpoint drag translates the room wall');
  await page.locator('#undo-button').click();
  assert.deepEqual(await saveSnapshot('wall-undone'), project, 'Undo restores the exact pre-drag graph');
  await dragMap([[topStart.x, topStart.y], [1800, 2350]]);
  await expect(page.locator('#status-message')).toHaveText('Connected walls moved.');
  const movedCorner = await saveSnapshot('corner-moved');
  assertConnectedMove(project, movedCorner, 3);
  const corner = movedCorner.vertices.find((vertex) => vertex.id === topStart.id);
  assert.equal(corner.x, 1800); assert.equal(corner.y, 2350);
  await page.locator('#undo-button').click();
  assert.deepEqual(await saveSnapshot('corner-undone'), project, 'Corner drag undo restores the exact graph');
  evidence.interactions.push('connected room wall midpoint and corner dragging, constrained neighbor extension, exact undo restoration');

  await page.locator('[data-tool="door"]').click();
  await clickMap(3000, 1400);
  await expect(stats()).toHaveText('22 walls · 0 doors');
  const withoutDoor = await saveSnapshot('door-removed');
  assert.deepEqual(withoutDoor.vertices, project.vertices);
  assert.deepEqual(withoutDoor.edges, project.edges.map((edge) => ({ ...edge, doors: [] })));
  await page.locator('#undo-button').click();
  assert.deepEqual(await saveSnapshot('door-restored'), project, 'Removing a doorway and undoing preserves the exact original cut');
  evidence.interactions.push('door click restores wall; undo restores exact door metadata');
  await page.locator('[data-tool="select"]').click();
  await page.screenshot({ path: path.join(artifacts, 'editor.png') });

  await page.locator('#new-button').click();
  await expect(stats()).toHaveText('0 walls · 0 doors');
  await desktop.evaluate((_electron, filePath) => global.__revolaSmoke.opens.push(filePath), examplePath);
  await page.locator('#open-button').click();
  await expect(page.locator('#map-name')).toHaveValue('Airlock sector');
  const example = await saveSnapshot('example');
  assert.equal(example.name, 'Airlock sector');
  assert.ok(example.edges.length > 20);
  const ports = SHIP_ANCHOR.portOffsets.map((offset) => {
    const vertex = example.vertices.find((v) => Math.abs(v.x - example.ship.x - offset) < 1e-7 && Math.abs(v.y - example.ship.y) < 1e-7);
    assert.ok(vertex, 'Example has a graph vertex at each airlock port');
    assert.equal(example.edges.filter((edge) => edge.a === vertex.id || edge.b === vertex.id).length, 1, 'Airlock port joins exactly one editable wall');
    return vertex;
  });
  const visited = new Set([ports[0].id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of example.edges) {
      if (visited.has(edge.a) && !visited.has(edge.b)) { visited.add(edge.b); changed = true; }
      if (visited.has(edge.b) && !visited.has(edge.a)) { visited.add(edge.a); changed = true; }
    }
  }
  assert.ok(visited.has(ports[1].id), 'Airlock ports belong to the same connected room graph');
  evidence.interactions.push('native Open loads a fixture with a valid graph connected to both airlock ports');
  await page.screenshot({ path: path.join(artifacts, 'example.png') });

  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(1024);
  await page.locator('#fit-button').click();
  const compact = await page.evaluate(() => {
    const targets = ['export-button', 'open-button', 'project-button', 'map-canvas', 'fit-button', 'map-name'];
    return {
      width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
      controls: targets.map((id) => { const box = document.getElementById(id).getBoundingClientRect(); return { id, x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; }),
    };
  });
  assert.equal(compact.overflow, false, 'Small desktop window has no horizontal overflow');
  for (const control of compact.controls) {
    assert.ok(control.x >= 0 && control.y >= 0 && control.right <= compact.width + 1 && control.bottom <= compact.height + 1, `${control.id} remains in the compact window`);
    assert.ok(control.width > 20 && control.height > 20, `${control.id} remains usable`);
  }
  await page.screenshot({ path: path.join(artifacts, 'editor-compact.png') });
  evidence.compactWindow = { width: compact.width, height: compact.height, controlsInBounds: compact.controls.length };
  evidence.interactions.push('1024 × 700 desktop window keeps essential controls visible without horizontal overflow');
  assert.deepEqual(errors, [], 'Renderer has no unhandled errors');
  await fs.writeFile(path.join(artifacts, 'smoke-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'smoke-failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.evaluate(() => { global.__revolaSmoke.discard = true; }).catch(() => {});
  await desktop.close();
}
