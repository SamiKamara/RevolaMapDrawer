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
const evidence = { interactions: [], upperDoor: [], continuousWallRaster: null };

try {
  await desktop.evaluate(({ dialog }) => {
    // Stub only the native dialog selection; document reads/writes still use
    // the production preload, IPC, validation and filesystem paths.
    global.__revolaJoining = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaJoining.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaJoining.opens.shift();
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
    const filePath = path.join(artifacts, `joining-${name}.revola.json`);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaJoining.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native project save is valid');
    return document;
  };
  const openFixture = async (name, segments) => {
    const document = createDocument(); document.name = name;
    for (const [ax, ay, bx, by] of segments) addWall(document, { x: ax, y: ay }, { x: bx, y: by });
    const filePath = path.join(artifacts, `joining-${name}-fixture.revola.json`);
    await fs.writeFile(filePath, JSON.stringify(document, null, 2));
    await desktop.evaluate((_electron, source) => global.__revolaJoining.opens.push(source), filePath);
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
  const degree = (doc, id) => doc.edges.filter(e => e.a === id || e.b === id).length;
  const checkCorner = (doc, expected) => {
    assert.equal(doc.edges.length, 2, 'Two wall segments remain');
    assert.equal(doc.vertices.length, 3, 'Nearby ends share a single graph vertex');
    const joint = doc.vertices.find(v => degree(doc, v.id) === 2);
    assert.ok(joint, 'Connected corner exists');
    if (expected) assert.deepEqual({ x: joint.x, y: joint.y }, expected);
    const directions = doc.edges.map(edge => {
      const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
      return a.x === b.x ? 'vertical' : a.y === b.y ? 'horizontal' : 'diagonal';
    });
    assert.deepEqual(directions.sort(), ['horizontal', 'vertical']);
    return joint;
  };
  const checkUndoRedo = async (name, before, after) => {
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-undone`), before, 'Joining is one exact undo transaction');
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-redone`), after, 'Redo restores the same graph and IDs');
  };

  const cornerBefore = await openFixture('near-corner', [[1400, 1800, 3000, 1800], [3025, 2400, 3025, 3400]]);
  await page.locator('[data-tool="select"]').click();
  await dragMap([3025, 2400], [3025, 1825]);
  const cornerAfter = await snapshot('corner-joined');
  checkCorner(cornerAfter, { x: 3025, y: 1800 });
  await checkUndoRedo('corner', cornerBefore, cornerAfter);
  await page.screenshot({ path: path.join(artifacts, 'joining-corner-editor.png') });
  evidence.interactions.push('terminal drag joins nearly aligned perpendicular walls at (3025,1800); exact undo/redo');

  const translatedBefore = await openFixture('translated-wall', [[1400, 1200, 3000, 1200], [3025, 1800, 3025, 3400]]);
  await page.locator('[data-tool="select"]').click();
  await dragMap([2200, 1200], [2200, 1825]);
  const translatedAfter = await snapshot('wall-translated-joined');
  const translatedJoint = checkCorner(translatedAfter);
  assert.ok(Math.hypot(translatedJoint.x - 3025, translatedJoint.y - 1800) <= 50, 'Translated wall connects at the nearby corner');
  await checkUndoRedo('translation', translatedBefore, translatedAfter);
  evidence.interactions.push('dragging the whole wall also joins nearby perpendicular ends; exact undo/redo');

  await openFixture('repeated-extension', [[1400, 2000, 2700, 2000]]);
  await page.locator('[data-tool="wall"]').click();
  for (const [start, end] of [
    [[2325, 2015], [3600, 1985]],
    [[3133, 1990], [4500, 2020]],
    [[3980, 2014], [1050, 1989]],
    [[1739, 1988], [5200, 2004]],
  ]) {
    await dragMap(start, end);
    await page.keyboard.press('Escape');
  }
  const extended = await snapshot('repeated-extension-finished');
  assert.ok(extended.vertices.every(v => v.y === 2000), 'Off-center overlapping starts and ends stay on the existing wall baseline');
  const minX = Math.min(...extended.vertices.map(v => v.x)), maxX = Math.max(...extended.vertices.map(v => v.x));
  assert.ok(minX <= 1075 && maxX >= 5175, 'Repeated drags extend both ends');
  const totalLength = extended.edges.reduce((sum, edge) => {
    assert.equal(edge.doors.length, 0); assert.equal(edge.gaps.length, 0);
    const a = extended.vertices.find(v => v.id === edge.a), b = extended.vertices.find(v => v.id === edge.b);
    return sum + Math.abs(a.x - b.x);
  }, 0);
  assert.equal(totalLength, maxX - minX, 'Repeated wall coverage contains no gaps or overlaps');
  evidence.continuousWallRaster = await page.evaluate(async document => {
    const { drawMap } = await import('./src/render.js');
    const xs = document.vertices.map(v => v.x), left = Math.min(...xs), right = Math.max(...xs);
    const expected = structuredClone(document);
    expected.vertices = [{ id: 'expected-a', x: left, y: 2000 }, { id: 'expected-b', x: right, y: 2000 }];
    expected.edges = [{ id: 'expected-edge', a: 'expected-a', b: 'expected-b', doors: [], gaps: [] }];
    const render = doc => {
      const surface = new OffscreenCanvas(5400, 160), context = surface.getContext('2d');
      context.translate(0, -1920); drawMap(context, doc, { drawShip: false });
      return context.getImageData(0, 0, surface.width, surface.height).data;
    };
    const actual = render(document), reference = render(expected);
    let differingPixels = 0, nonwhitePixels = 0;
    for (let i = 0; i < actual.length; i += 4) {
      if (actual[i + 3] !== reference[i + 3]) differingPixels++;
      if (actual[i + 3] && (actual[i] !== 255 || actual[i + 1] !== 255 || actual[i + 2] !== 255)) nonwhitePixels++;
    }
    return { width: 5400, height: 160, differingPixels, nonwhitePixels };
  }, extended);
  assert.equal(evidence.continuousWallRaster.differingPixels, 0, 'Repeated overlapping strokes render exactly like one continuous wall');
  assert.equal(evidence.continuousWallRaster.nonwhitePixels, 0);
  await page.locator('#grid-toggle').uncheck();
  const detail = mapPoint(3000, 2000);
  await page.mouse.move(detail.x, detail.y); await page.mouse.wheel(0, -1000);
  await page.screenshot({ path: path.join(artifacts, 'joining-extended-wall-editor.png') });
  evidence.interactions.push('four overlapping forward/reverse wall drags from varied near-wall starts remain collinear and render pixel-identically to one wall');

  evidence.upperDoor = await page.evaluate(async () => {
    const { drawMap, loadShip } = await import('./src/render.js');
    const { createDocument } = await import('./src/model.js');
    const shipImage = await loadShip();
    return [false, true].map(mirrored => {
      const document = createDocument(); document.ship.mirrored = mirrored;
      const surface = new OffscreenCanvas(1600, 120), context = surface.getContext('2d');
      context.translate(-3300, -4660); drawMap(context, document, { shipImage });
      const pixels = context.getImageData(0, 40, 1600, 1).data;
      const occupied = []; let start = null, nonwhite = 0;
      for (let x = 0; x <= 1600; x++) {
        if (x < 1600 && pixels[x * 4 + 3] >= 128) { if (start === null) start = x; }
        else if (start !== null) { occupied.push([start + 3300, x + 3300]); start = null; }
        if (x < 1600 && pixels[x * 4 + 3] && (pixels[x * 4] !== 255 || pixels[x * 4 + 1] !== 255 || pixels[x * 4 + 2] !== 255)) nonwhite++;
      }
      return { mirrored, y: 4700, occupied, clearGap: occupied.length === 2 ? occupied[1][0] - occupied[0][1] : null, nonwhite };
    });
  });
  for (const scan of evidence.upperDoor) { assert.equal(scan.clearGap, 375); assert.equal(scan.nonwhite, 0); }
  await page.locator('#mirror-button').click();
  const mirrored = await snapshot('ship-mirrored');
  assert.equal(mirrored.ship.mirrored, true);
  assert.deepEqual({ x: mirrored.ship.x, y: mirrored.ship.y }, { x: 4096, y: 4740 });
  evidence.interactions.push('bundled upper airlock doorway renders at y4700 with a375px white-on-transparent opening in both mirror directions; mirror keeps anchor fixed');
  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(path.join(artifacts, 'joining-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'joining-failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.close();
}
