import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, addDoor, addCorridor, addRoom, validateDocument } from '../src/model.js';
import { detectRoom } from '../src/rooms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
const prefix = packaged ? 'rectangular-room-packaged' : 'rectangular-room';
const artifacts = path.join(root, 'artifacts'); await fs.mkdir(artifacts, { recursive: true });
const destination = name => path.join(artifacts, `${prefix}-${name}`);
const executablePath = path.join(root, 'dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe');
const sourceFiles = ['index.html', 'src/app.js', 'src/model.js', 'src/room-start.js', 'src/rooms.js', 'src/style.css'];
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources/app.asar');
  for (const file of sourceFiles) assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches current source`);
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 }); page.setDefaultTimeout(20_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, placements: [], interactions: [], rendererErrors: errors };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
const doors = doc => doc.edges.flatMap(edge => {
  const a = doc.vertices.find(point => point.id === edge.a), b = doc.vertices.find(point => point.id === edge.b);
  return edge.doors.map(door => ({ id: door.id, x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t }));
});
const rectangle = doc => doc.edges.map(edge => detectRoom(doc, edge.id)).find(room => room?.kind === 'rectangle');

try {
  await desktop.evaluate(({ dialog, BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1024, 700);
    global.__rectangleRooms = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__rectangleRooms.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__rectangleRooms.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  const canvas = page.locator('#map-canvas'); await expect(canvas).toBeVisible();
  await page.evaluate(() => {
    window.__rectanglePreviews = [];
    const prototype = CanvasRenderingContext2D.prototype;
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke']) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        if (this.canvas.id === 'map-canvas') {
          if (method === 'beginPath') this.__rectanglePath = [];
          if (method === 'moveTo' || method === 'lineTo') this.__rectanglePath?.push({ x: args[0], y: args[1] });
          if (method === 'stroke' && this.getLineDash().length && this.__rectanglePath?.length === 2) {
            window.__rectanglePreviews.push(this.__rectanglePath.map(point => ({ ...point })));
          }
        }
        return original.apply(this, args);
      };
    }
  });
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let view;
  const calibrate = async () => {
    await settled();
    view = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect(), transform = element.getContext('2d').getTransform();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, ratioX: element.width / rect.width, ratioY: element.height / rect.height,
        a: transform.a, d: transform.d, e: transform.e, f: transform.f };
    });
  };
  const screen = point => {
    const value = { x: view.x + (point.x * view.a + view.e) / view.ratioX, y: view.y + (point.y * view.d + view.f) / view.ratioY };
    assert.ok(value.x > view.x + 2 && value.x < view.x + view.width - 2 && value.y > view.y + 2 && value.y < view.y + view.height - 2, 'Test gesture fits the visible canvas');
    return value;
  };
  const snapshot = async name => {
    const filePath = destination(`${name}.revola`); await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, target) => global.__rectangleRooms.saves.push(target), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(stat => stat.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const doc = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(doc), doc); return doc;
  };
  const open = async (filePath, name) => {
    await desktop.evaluate((_electron, target) => global.__rectangleRooms.opens.push(target), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => await page.locator('#confirm-dialog').isVisible() || (await page.locator('#status-message').textContent()).startsWith('Opened ')).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#fit-button').click(); await calibrate();
    await page.locator('[data-tool="rectangle"]').click();
    await page.locator('#rotate-room').uncheck();
  };
  const fixture = async (name, doc = createDocument()) => {
    doc.name = name; const filePath = destination(`${name}-fixture.revola`);
    await fs.writeFile(filePath, JSON.stringify(doc)); await open(filePath, name); return structuredClone(doc);
  };
  const drag = async (from, to) => {
    const a = screen(from), b = screen(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await settled(); await page.mouse.up(); await settled();
  };
  const history = async (name, before, after) => {
    await page.locator('#undo-button').click(); assert.deepEqual(await snapshot(`${name}-undo`), before);
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click(); assert.deepEqual(await snapshot(`${name}-redo`), after);
  };
  const dimensions = (doc, width, depth, orientation = 0) => {
    const room = rectangle(doc); assert.ok(room); assert.equal(room.corners.length, 4); assert.equal(room.orientation, orientation);
    near(room.bounds.right - room.bounds.left, width); near(room.bounds.bottom - room.bounds.top, depth);
    assert.equal(doc.style.chamfer, 220); return room;
  };

  const blank = await fixture('free-rectangle');
  await page.keyboard.press('b'); await expect(page.locator('[data-tool="rectangle"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#rotate-option')).toBeVisible();
  await drag({ x: 1500, y: 1000 }, { x: 3000, y: 1900 });
  const free = await snapshot('free-placed');
  assert.equal(free.edges.length, 4); assert.equal(free.vertices.length, 4); dimensions(free, 1500, 900);
  await history('free', blank, free);
  await page.locator('[data-tool="select"]').click();
  await drag({ x: 2250, y: 1900 }, { x: 2250, y: 2200 });
  const resized = await snapshot('free-resized'); dimensions(resized, 1500, 1200);
  evidence.placements.push({ name: 'free', fourSides: true, width: 1500, depth: 900, exactUndoRedo: true, resizedDepth: 1200 });
  await page.screenshot({ path: destination('free-resized.png') });

  const squareBlank = await fixture('rotated-square');
  await page.keyboard.press('Shift+r');
  await expect(page.locator('[data-tool="rectangle"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#rotate-room')).toBeChecked();
  const a = screen({ x: 2400, y: 1200 }), b = screen({ x: 3700, y: 2000 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y); await settled();
  const preview = async () => page.evaluate(() => window.__rectanglePreviews.slice(-4));
  const original = await preview(); assert.equal(original.length, 4);
  await page.evaluate(() => { window.__rectanglePreviews = []; }); await page.keyboard.down('Shift'); await settled();
  const squarePreview = await preview(); assert.equal(squarePreview.length, 4); assert.notDeepEqual(squarePreview, original);
  for (const [start, end] of squarePreview) near(Math.hypot(end.x - start.x, end.y - start.y), 1300);
  await page.evaluate(() => { window.__rectanglePreviews = []; }); await page.keyboard.up('Shift'); await settled();
  assert.deepEqual(await preview(), original, 'Releasing Shift restores the rectangle preview without moving the pointer');
  await page.keyboard.down('Shift'); await page.mouse.up(); await page.keyboard.up('Shift'); await settled();
  const square = await snapshot('rotated-square-placed'); dimensions(square, 1300, 1300, 45);
  assert.equal(square.edges.length, 4); await history('rotated-square', squareBlank, square);
  await open(destination('rotated-square-placed.revola'), square.name);
  assert.deepEqual(await snapshot('rotated-square-reopened'), square, 'Native save/reopen retains the rectangle graph exactly');
  evidence.placements.push({ name: 'rotated-square', fourSides: true, orientation: 45, side: 1300, modifierPreviewWithoutPointerMove: true, exactUndoRedo: true, nativeReopen: true });

  const shortHost = createDocument(); addWall(shortHost, { x: 1000, y: 2000 }, { x: 3000, y: 2000 });
  const shortBefore = await fixture('short-rectangle', shortHost);
  await drag({ x: 2000, y: 2000 }, { x: 2070, y: 1930 });
  const shortAfter = await snapshot('short-attached-placed'); dimensions(shortAfter, 450, 450);
  assert.equal(doors(shortAfter).length, 1); near(doors(shortAfter)[0].x, 2000); near(doors(shortAfter)[0].y, 2000);
  await history('short-attached', shortBefore, shortAfter);
  evidence.placements.push({ name: 'short-attached', width: 450, depth: 450, doorwayUnobstructed: true, exactUndoRedo: true });
  const sliverBefore = await fixture('free-sliver-rejection');
  await drag({ x: 1000, y: 1000 }, { x: 2000, y: 1025 });
  await expect(page.locator('#status-message')).toHaveClass(/error/);
  assert.deepEqual(await snapshot('free-sliver-unchanged'), sliverBefore); await expect(page.locator('#undo-button')).toBeDisabled();
  evidence.interactions.push('Free 25 px room sliver is rejected; short attached drags clamp depth to 450 px');

  for (const mirrored of [false, true]) {
    const initial = createDocument(); initial.ship.mirrored = mirrored;
    const before = await fixture(`ship-rectangle-${mirrored}`, initial);
    await drag({ x: 4130.5, y: 4680 }, { x: 5110.5, y: 3500 });
    const after = await snapshot(`ship-${mirrored}-placed`); dimensions(after, 2000, 1200);
    assert.equal(after.edges.length, 4); assert.deepEqual(after.ship, before.ship);
    assert.equal(doors(after).length, 1); near(doors(after)[0].x, 4110.5); near(doors(after)[0].y, 4700);
    await history(`ship-${mirrored}`, before, after);
    evidence.placements.push({ name: 'ship', mirrored, width: 2000, depth: 1200, fixedDoor: [4110.5, 4700], exactUndoRedo: true });
  }
  const wall = createDocument(); addWall(wall, { x: 2000, y: 2500 }, { x: 5000, y: 2500 }); addDoor(wall, wall.edges[0].id, { x: 3500, y: 2500 });
  const wallBefore = await fixture('door-rectangle', wall);
  await drag({ x: 3510, y: 2490 }, { x: 4500, y: 1300 });
  const wallAfter = await snapshot('door-placed'); dimensions(wallAfter, 2000, 1200);
  assert.deepEqual(doors(wallAfter), doors(wallBefore)); await history('door', wallBefore, wallAfter);
  evidence.placements.push({ name: 'existing-door', exactDoorIdAndCenter: true, exactUndoRedo: true });

  for (const hostRectangle of [false, true]) for (const rectangular of [false, true]) {
    const host = createDocument();
    addRoom(host, { x: 2700, y: 2600 }, { x: 4300, y: 4000 }, false, { rectangular: hostRectangle });
    const name = `overhang-${hostRectangle}-${rectangular}`, before = await fixture(name, host);
    await page.locator(`[data-tool="${rectangular ? 'rectangle' : 'room'}"]`).click();
    await drag({ x: 3500, y: 2600 }, { x: 5000, y: 1400 });
    const after = await snapshot(`${name}-placed`);
    assert.ok(after.edges.length > before.edges.length);
    near(Math.min(...after.vertices.map(point => point.x)), 2000);
    near(Math.max(...after.vertices.map(point => point.x)), 5000);
    assert.equal(doors(after).length, 1); near(doors(after)[0].x, 3500); near(doors(after)[0].y, 2600);
    await page.screenshot({ path: destination(`${name}.png`) });
    await history(name, before, after);
    await open(destination(`${name}-placed.revola`), after.name);
    assert.deepEqual(await snapshot(`${name}-reopened`), after);
    evidence.placements.push({ name: 'host-room-overhang', hostRectangle, rectangular, width: 3000,
      hostWidth: 1600, exactUndoRedo: true, nativeReopen: true });
  }

  const corridor = createDocument(); addCorridor(corridor, [{ x: 3500, y: 4500 }, { x: 3500, y: 3500 }]);
  const corridorBefore = await fixture('corridor-rectangle', corridor);
  const railEnds = corridorBefore.vertices.filter(point => Math.abs(point.y - 3500) < 1e-6);
  await drag({ x: 3510, y: 3510 }, { x: 4300, y: 2300 });
  const corridorAfter = await snapshot('corridor-placed'); dimensions(corridorAfter, 1600, 1200);
  for (const point of railEnds) {
    assert.deepEqual(corridorAfter.vertices.find(vertex => vertex.id === point.id), point);
    assert.equal(corridorAfter.edges.filter(edge => edge.a === point.id || edge.b === point.id).length, 3);
  }
  await history('corridor', corridorBefore, corridorAfter);
  evidence.placements.push({ name: 'corridor-mouth', exactRailJunctions: true, exactUndoRedo: true });

  const blocked = createDocument(); addWall(blocked, { x: 4000, y: 4000 }, { x: 4500, y: 4000 });
  const blockedBefore = await fixture('blocked-rectangle', blocked);
  await drag({ x: 4110.5, y: 4700 }, { x: 5110.5, y: 3500 });
  await expect(page.locator('#status-message')).toHaveClass(/error/);
  assert.deepEqual(await snapshot('blocked-unchanged'), blockedBefore); await expect(page.locator('#undo-button')).toBeDisabled();
  const idleBefore = await fixture('rectangle-cancellation');
  const click = screen({ x: 2000, y: 1600 }); await page.mouse.click(click.x, click.y);
  assert.deepEqual(await snapshot('click-unchanged'), idleBefore); await expect(page.locator('#undo-button')).toBeDisabled();
  const end = screen({ x: 3500, y: 2500 });
  await page.mouse.move(click.x, click.y); await page.mouse.down(); await page.mouse.move(end.x, end.y); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await snapshot('escape-unchanged'), idleBefore); await expect(page.locator('#undo-button')).toBeDisabled();
  evidence.interactions.push('Collision rejection, stationary click and Escape leave geometry/history unchanged');

  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1008, 661)); await settled();
  const compact = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
    tools: [...document.querySelectorAll('[data-tool]')].map(element => {
      const box = element.getBoundingClientRect(); return { tool: element.dataset.tool, x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }) }));
  assert.equal(compact.overflow, false);
  for (const control of compact.tools) assert.ok(control.x >= 0 && control.y >= 0 && control.right <= compact.width && control.bottom <= compact.height - 29, `${control.tool} is visible at the compact size`);
  evidence.compact = compact; await page.screenshot({ path: destination('compact.png') });
  assert.deepEqual(errors, []); await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: destination('failure.png') }).catch(() => {}); console.error('Renderer errors:', errors); throw error;
} finally { await desktop.close(); }
