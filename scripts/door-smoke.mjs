import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, addWall, validateDocument } from '../src/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ args: [root], cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = { interactions: [], placements: [], repairs: [] };

try {
  await desktop.evaluate(({ dialog }) => {
    // Stub only the native dialog selection; document reads/writes still use
    // the production preload, IPC, validation and filesystem paths.
    global.__revolaDoorSmoke = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaDoorSmoke.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaDoorSmoke.opens.shift();
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
    const p = { x: rect.x + rect.width * .35, y: rect.y + rect.height * .35 };
    const pointerAt = async (x, y) => {
      await page.mouse.move(x, y);
      const coordinates = (await page.locator('#pointer-position').textContent()).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      assert.equal(coordinates?.length, 2);
      return { x: coordinates[0], y: coordinates[1] };
    };
    const a = await pointerAt(p.x, p.y), b = await pointerAt(p.x + 120, p.y + 120);
    mapPoint = (x, y) => ({ x: p.x + (x - a.x) * 120 / (b.x - a.x), y: p.y + (y - a.y) * 120 / (b.y - a.y) });
  };
  const dragMap = async (start, end) => {
    const a = mapPoint(...start), b = mapPoint(...end);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
  };
  const snapshot = async name => {
    const filePath = path.join(artifacts, `door-${name}.revola.json`);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaDoorSmoke.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native project save is valid');
    return document;
  };
  const openFixture = async (name, segments) => {
    const document = createDocument(); document.name = name;
    for (const [ax, ay, bx, by] of segments) addWall(document, { x: ax, y: ay }, { x: bx, y: by }, { joinTolerance: 0 });
    const filePath = path.join(artifacts, `door-${name}-fixture.revola.json`);
    await fs.writeFile(filePath, JSON.stringify(document, null, 2));
    await desktop.evaluate((_electron, source) => global.__revolaDoorSmoke.opens.push(source), filePath);
    await page.locator('#open-button').click();
    // Earlier snapshots mark the current document saved, so normally no
    // replacement prompt is needed. Still handle one through the visible UI.
    await expect.poll(async () => (await page.locator('#document-title').textContent()) === name || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await page.locator('#fit-button').click();
    await calibrate();
    assert.deepEqual(await snapshot(`${name}-opened`), document, 'Native project open preserves fixture exactly');
    return document;
  };
  const clickMap = async (x, y) => {
    const point = mapPoint(x, y);
    await page.mouse.click(point.x, point.y);
  };
  const placeDoor = async (x, y) => {
    await page.locator('[data-tool="door"]').click();
    await clickMap(x, y);
  };
  const doors = doc => doc.edges.flatMap(edge => {
    const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
    return edge.doors.map(door => ({ edgeId: edge.id, doorId: door.id,
      x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t, width: doc.style.doorWidth }));
  });
  const oneDoor = (doc, expectedY, tolerance = 1e-8) => {
    const result = doors(doc);
    assert.equal(result.length, 1, 'One physical door is stored');
    assert.equal(result[0].x, 2400);
    assert.ok(Math.abs(result[0].y - expectedY) <= tolerance, `Door center y=${result[0].y}, expected ${expectedY} ±${tolerance}`);
    assert.equal(result[0].width, 375);
    evidence.placements.push({ name: doc.name, ...result[0] });
    return result[0];
  };
  const undoRedo = async (name, before, after) => {
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-undone`), before, 'Door placement is one exact undo transaction');
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-redone`), after, 'Redo restores the same door and topology');
  };
  const turns = [[2400, 1200, 2400, 4000], [2400, 1200, 3600, 1200], [2400, 4000, 3600, 4000]];
  const baseline = await openFixture('between-turns', turns);
  await page.locator('[data-tool="door"]').click();
  const nearMiddle = mapPoint(2400, 2640);
  await page.mouse.move(nearMiddle.x, nearMiddle.y);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(artifacts, 'door-midpoint-preview.png') });
  await placeDoor(2400, 2640);
  await expect(page.locator('#status-message')).toContainText(/centered/i);
  const centered = await snapshot('near-midpoint');
  oneDoor(centered, 2600);
  await undoRedo('centered', baseline, centered);
  await page.screenshot({ path: path.join(artifacts, 'door-centered-editor.png') });
  evidence.interactions.push('A door aimed 40 px from the middle between wall turns centers exactly at 2600; one undo/redo preserves the full graph');

  await openFixture('far-from-midpoint', turns);
  await placeDoor(2400, 2780);
  const far = await snapshot('far-placement');
  oneDoor(far, 2780, 6);
  evidence.interactions.push('A door aimed 180 px from the midpoint stays at the aimed position');

  await openFixture('outside-magnet', turns);
  await placeDoor(2400, 2675);
  oneDoor(await snapshot('outside-fifty-pixel-magnet'), 2675, 6);
  evidence.interactions.push('A 75 px offset stays unsnapped outside the subtle 50 px midpoint magnet');

  await openFixture('branch-bounded-span', [[2400, 1200, 2400, 5000], [2400, 1200, 3500, 1200], [2400, 3600, 3700, 3600], [2400, 5000, 3500, 5000]]);
  await placeDoor(2400, 2435);
  await expect(page.locator('#status-message')).toContainText(/centered/i);
  oneDoor(await snapshot('branch-midpoint'), 2400);
  evidence.interactions.push('A T-junction ends the straight span: top 1200 to branch 3600 centers at 2400 rather than the whole wall midpoint');

  const diagonalBase = await openFixture('diagonal-reversed-span', [
    [3300, 1700, 1700, 3300], [1700, 3300, 1700, 4200], [3300, 1700, 4300, 1700],
  ]);
  await placeDoor(2525, 2475);
  await expect(page.locator('#status-message')).toContainText(/centered/i);
  const diagonalDoor = await snapshot('diagonal-midpoint');
  const diagonalPlacement = doors(diagonalDoor);
  assert.equal(diagonalPlacement.length, 1);
  assert.deepEqual({ x: diagonalPlacement[0].x, y: diagonalPlacement[0].y }, { x: 2500, y: 2500 });
  assert.equal(diagonalPlacement[0].width, 375);
  evidence.placements.push({ name: diagonalDoor.name, ...diagonalPlacement[0] });
  await undoRedo('diagonal-center', diagonalBase, diagonalDoor);
  evidence.interactions.push('A reversed 45-degree wall uses its physical straight span; a nearby aim centers exactly at (2500, 2500)');

  const splitFixture = await openFixture('reversed-subdivided-span', [
    [2400, 1850, 2400, 1200], [2400, 1850, 2400, 2600],
    [2400, 3310, 2400, 2600], [2400, 4000, 2400, 3310],
    [3600, 1200, 2400, 1200], [2400, 4000, 3600, 4000],
  ]);
  assert.ok(splitFixture.vertices.some(v => v.x === 2400 && v.y === 2600), 'Fixture has an artificial split at the requested midpoint');
  await placeDoor(2400, 2635);
  await expect(page.locator('#status-message')).toContainText(/centered/i);
  const splitDoor = await snapshot('split-midpoint');
  oneDoor(splitDoor, 2600);
  await undoRedo('split-door', splitFixture, splitDoor);
  const splitRaster = await page.evaluate(async doc => {
    const { drawMap } = await import('./src/render.js');
    const surface = new OffscreenCanvas(160, 900), ctx = surface.getContext('2d');
    ctx.translate(-2320, -2150); drawMap(ctx, doc, { drawShip: false });
    const data = ctx.getImageData(80, 0, 1, 900).data;
    const gaps = []; let start = null;
    for (let y = 0; y <= 900; y++) {
      if (y < 900 && data[y * 4 + 3] < 128) { if (start === null) start = y; }
      else if (start !== null) { gaps.push([2150 + start, 2150 + y]); start = null; }
    }
    return gaps;
  }, splitDoor);
  assert.equal(splitRaster.length, 1, 'No artificial split creates extra raster cracks');
  assert.ok(Math.abs(splitRaster[0][0] - 2412.5) <= 1 && Math.abs(splitRaster[0][1] - 2787.5) <= 1, 'Rendered door spans the old split with 375 px geometric width');
  evidence.interactions.push('Reversed degree-two collinear subdivisions are ignored; a centered 375 px door crosses the former split with exact undo/redo and no extra raster cracks');

  // Reopen the result through the real native bridge, then remove its door
  // through the same visible Door tool to verify it remains editable.
  const savedPath = path.join(artifacts, 'door-split-midpoint.revola.json');
  await openFixture('temporary-empty-map', []);
  await desktop.evaluate((_electron, source) => global.__revolaDoorSmoke.opens.push(source), savedPath);
  await page.locator('#open-button').click();
  await expect(page.locator('#document-title')).toHaveText('reversed-subdivided-span');
  await calibrate();
  assert.deepEqual(await snapshot('split-reopened'), splitDoor, 'Native project reopen preserves centered door and graph exactly');
  await placeDoor(2400, 2600);
  assert.equal(doors(await snapshot('split-reopened-removed')).length, 0, 'Reopened centered door remains removable');
  await page.locator('#undo-button').click();
  assert.deepEqual(await snapshot('split-removal-undone'), splitDoor);
  evidence.interactions.push('Native project save/open preserves the centered door, which remains removable and undoable');

  const checkTee = (doc, name) => {
    const junction = doc.vertices.find(v => v.x === 2400 && v.y === 2000);
    assert.ok(junction, 'Near-wall stroke reaches the target centerline');
    const degree = doc.edges.filter(e => e.a === junction.id || e.b === junction.id).length;
    assert.equal(degree, 3, 'The visible T is one connected graph junction');
    assert.equal(doc.edges.length, 3, 'No duplicate stub or tiny gap segment remains');
    assert.ok(!doc.vertices.some(v => v.x === 2400 && v.y > 1900 && v.y < 2000), 'Old near-wall endpoint was merged');
    evidence.repairs.push({ name, joint: { x: junction.x, y: junction.y }, degree });
  };
  await openFixture('new-near-tee', [[1400, 2000, 3600, 2000]]);
  await page.locator('[data-tool="wall"]').click();
  await dragMap([2400, 1200], [2400, 1970]);
  await page.keyboard.press('Escape');
  checkTee(await snapshot('new-tee-joined'), 'new stroke stopping at wall face');

  const receiverBase = await openFixture('receiving-wall-drawn-last', [[2400, 1200, 2400, 1970]]);
  await page.locator('[data-tool="wall"]').click();
  await dragMap([1400, 2000], [3600, 2000]);
  await page.keyboard.press('Escape');
  const receiverJoined = await snapshot('receiver-last-joined');
  checkTee(receiverJoined, 'receiving wall drawn below an older near-wall endpoint');
  await undoRedo('receiver-last', receiverBase, receiverJoined);
  evidence.interactions.push('Drawing the receiving wall last extends an older endpoint across a 5 px face gap into a shared T-junction, with exact undo/redo');

  const oldTee = await openFixture('older-near-tee', [[1400, 2000, 3600, 2000], [2400, 1200, 2400, 1970]]);
  assert.equal(oldTee.edges.length, 2);
  await page.locator('[data-tool="wall"]').click();
  await dragMap([2400, 1600], [2400, 1980]);
  await page.keyboard.press('Escape');
  const repaired = await snapshot('old-tee-repaired');
  checkTee(repaired, 'old near-wall stub redrawn');
  await undoRedo('old-tee-repair', oldTee, repaired);
  evidence.interactions.push('A new stroke ending at the wall face joins the centerline; redrawing an older near-wall stub repairs its T-junction with exact undo/redo');
  await page.screenshot({ path: path.join(artifacts, 'door-tee-repaired-editor.png') });
  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(path.join(artifacts, 'door-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'door-failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.close();
}
