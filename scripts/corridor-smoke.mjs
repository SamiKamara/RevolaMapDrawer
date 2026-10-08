import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, addWall, addDoor, validateDocument } from '../src/model.js';

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
const evidence = { interactions: [], placements: [] };

try {
  await desktop.evaluate(({ dialog }) => {
    // Dialog destinations alone are stubbed. All imports and saves use the
    // production preload, IPC, validation and filesystem paths.
    global.__revolaCorridorSmoke = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaCorridorSmoke.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaCorridorSmoke.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  const canvas = page.locator('#map-canvas');
  await expect(canvas).toBeVisible();
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let mapPoint;
  const calibrate = async () => {
    const rect = await canvas.boundingBox();
    assert.ok(rect && rect.width > 300 && rect.height > 300);
    const p = { x: rect.x + rect.width * .35, y: rect.y + rect.height * .35 };
    const pointerAt = async (x, y) => {
      await page.mouse.move(x, y);
      const values = (await page.locator('#pointer-position').textContent()).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      assert.equal(values?.length, 2);
      return { x: values[0], y: values[1] };
    };
    const a = await pointerAt(p.x, p.y), b = await pointerAt(p.x + 120, p.y + 120);
    mapPoint = (x, y) => ({ x: p.x + (x - a.x) * 120 / (b.x - a.x), y: p.y + (y - a.y) * 120 / (b.y - a.y) });
  };
  const snapshotPath = name => path.join(artifacts, `corridor-${name}.revola.json`);
  const snapshot = async name => {
    const filePath = snapshotPath(name);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaCorridorSmoke.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'The native project snapshot is valid');
    return document;
  };
  const openPath = async (filePath, name) => {
    await desktop.evaluate((_electron, source) => global.__revolaCorridorSmoke.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await page.locator('#fit-button').click();
    await calibrate();
    await page.locator('[data-tool="corridor"]').click();
    await expect(page.locator('#undo-button')).toBeDisabled();
  };
  const openFixture = async (name, segments, door) => {
    const document = createDocument(); document.name = name;
    for (const [ax, ay, bx, by] of segments) addWall(document, { x: ax, y: ay }, { x: bx, y: by }, { joinTolerance: 0 });
    if (door) addDoor(document, document.edges[0].id, door, { centerTolerance: 0 });
    const filePath = snapshotPath(`${name}-fixture`);
    await fs.writeFile(filePath, JSON.stringify(document, null, 2));
    await openPath(filePath, name);
    assert.deepEqual(await snapshot(`${name}-opened`), document, 'Native open preserves the fixture exactly');
    return document;
  };
  const greenPixelsAt = async point => {
    await settled();
    return canvas.evaluate((element, p) => {
      const rect = element.getBoundingClientRect(), scale = element.width / rect.width;
      const cx = Math.round((p.x - rect.left) * scale), cy = Math.round((p.y - rect.top) * scale);
      const data = element.getContext('2d').getImageData(cx - 4, cy - 4, 9, 9).data;
      let green = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 1] > data[i] + 10 && data[i + 1] > data[i + 2] + 10) green++;
      return green;
    }, mapPoint(point.x, point.y));
  };
  const drag = async (name, aim, end, expectedStart, kind, { cancel = false } = {}) => {
    const a = mapPoint(...aim), b = mapPoint(...end);
    await page.mouse.move(a.x, a.y);
    if (kind) {
      assert.ok(await greenPixelsAt(expectedStart) > 0, 'Hover shows the resolved start marker');
      await page.screenshot({ path: path.join(artifacts, `corridor-${name}-hover.png`) });
    }
    await page.mouse.down();
    await expect(page.locator('#status-message')).toContainText(kind === 'door' ? 'door center' : kind === 'center' ? 'wall midpoint' : 'Drag a route');
    await page.mouse.move(b.x, b.y, { steps: 10 });
    if (kind) assert.ok(await greenPixelsAt(expectedStart) > 0, 'Start marker stays at the resolved start during the drag');
    await settled();
    await page.screenshot({ path: path.join(artifacts, `corridor-${name}-preview.png`) });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    if (!cancel) await expect(page.locator('#status-message')).toContainText('Corridor placed');
  };
  const cuts = doc => doc.edges.flatMap(edge => {
    const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
    return edge.doors.map(door => ({ id: door.id, x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t, width: doc.style.doorWidth }));
  }).sort((a, b) => a.id.localeCompare(b.id));
  const sameDoors = (before, after) => {
    const old = cuts(before), actual = cuts(after);
    assert.equal(actual.length, old.length, 'Corridor placement adds or removes no door');
    for (let i = 0; i < old.length; i++) {
      assert.equal(actual[i].id, old[i].id);
      assert.equal(actual[i].width, 375);
      assert.ok(Math.hypot(actual[i].x - old[i].x, actual[i].y - old[i].y) < 1e-6, 'Existing door stays physically fixed through graph subdivision');
    }
  };
  const corridorGeometry = (before, after, start, direction, name) => {
    const along = p => (p.x - start.x) * direction.x + (p.y - start.y) * direction.y;
    const across = p => -(p.x - start.x) * direction.y + (p.y - start.y) * direction.x;
    const boundaries = after.edges.flatMap(edge => {
      const a = after.vertices.find(v => v.id === edge.a), b = after.vertices.find(v => v.id === edge.b);
      const sa = across(a), sb = across(b);
      if (Math.abs(sa - sb) > 1e-6 || Math.abs(Math.abs(sa) - 290) > 1e-6) return [];
      const ordered = along(a) < along(b) ? [a, b] : [b, a];
      return [{ start: ordered[0], end: ordered[1], offset: sa }];
    });
    assert.equal(boundaries.length, 2, `${name}: straight corridor has two continuous boundary walls`);
    const [one, two] = boundaries;
    assert.ok(Math.abs(along(one.start)) < 1e-6 && Math.abs(along(two.start)) < 1e-6, 'Both boundaries begin at the exact resolved start cross-section');
    const midpoint = { x: (one.start.x + two.start.x) / 2, y: (one.start.y + two.start.y) / 2 };
    assert.ok(Math.hypot(midpoint.x - start.x, midpoint.y - start.y) < 1e-6, 'The off-grid snapped center survives path quantization');
    assert.ok(Math.abs(Math.hypot(one.start.x - two.start.x, one.start.y - two.start.y) - 580) < 1e-6, 'Corridor wall-center width stays exactly 580 px');
    assert.ok(along(one.end) > 1000 && along(two.end) > 1000, 'The drag creates the intended long corridor');
    assert.deepEqual(after.ship, before.ship, 'The fixed ship stays unchanged');
    sameDoors(before, after);
    evidence.placements.push({ name, start: midpoint, width: 580, boundaries });
  };
  const undoRedo = async (name, before, after) => {
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-undone`), before, 'One undo restores the full graph before the corridor');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-redone`), after, 'One redo restores the exact corridor and original openings');
  };

  const vertical = [[2413, 1211, 2413, 3993]];
  const centerStart = { x: 2413, y: 2602 };
  const centeredBase = await openFixture('off-grid-wall-center', vertical);
  await expect(page.locator('#tool-guide')).toContainText(/CENTER/);
  await expect(page.locator('#tool-guide')).toContainText(/DOOR/);
  await drag('centered', [2428, 2637], [5013, 2602], centerStart, 'center');
  const centered = await snapshot('centered');
  corridorGeometry(centeredBase, centered, centerStart, { x: 1, y: 0 }, 'off-grid midpoint');
  await undoRedo('centered', centeredBase, centered);
  evidence.interactions.push('A start aimed 35 px along and 15 px off the wall snaps to its exact off-grid midpoint (2413,2602); hover and drag show a fixed start marker; corridor width stays 580 px; one undo/redo preserves the full graph');

  const doorStart = { x: 2413, y: 1947 };
  const doorBase = await openFixture('off-grid-door-center', vertical, doorStart);
  await drag('door', [2435, 2070], [5013, 1947], doorStart, 'door');
  const fromDoor = await snapshot('door');
  corridorGeometry(doorBase, fromDoor, doorStart, { x: 1, y: 0 }, 'off-midpoint doorway');
  await undoRedo('door', doorBase, fromDoor);
  evidence.interactions.push('A start aimed inside a doorway, 123 px from its off-grid center, snaps to the existing door at (2413,1947), preserving its ID and exact 375 px opening');

  await openFixture('reopen-placeholder', []);
  await openPath(snapshotPath('door'), fromDoor.name);
  assert.deepEqual(await snapshot('door-reopened'), fromDoor, 'Native save/open preserves corridor and doorway exactly');
  evidence.interactions.push('Native project save/open restores the exact corridor, split host wall and existing door, with clean undo history');

  const diagonalStart = { x: 2507, y: 2509 };
  const diagonalBase = await openFixture('reversed-diagonal-wall', [[3307, 1709, 1707, 3309]]);
  await drag('diagonal', [2532, 2484], [4307, 4309], diagonalStart, 'center');
  const diagonal = await snapshot('diagonal');
  corridorGeometry(diagonalBase, diagonal, diagonalStart, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 'reversed diagonal wall');
  await undoRedo('diagonal', diagonalBase, diagonal);
  evidence.interactions.push('A reversed diagonal wall resolves its physical midpoint, and a 45-degree corridor retains the off-grid center and 580 px perpendicular width');

  const branchStart = { x: 2413, y: 2313 };
  const branchBase = await openFixture('branch-bounded-span', [[2413, 1113, 2413, 4713], [2413, 3513, 3613, 3513]]);
  await drag('branch', [2428, 2348], [5013, 2313], branchStart, 'center');
  const branch = await snapshot('branch');
  corridorGeometry(branchBase, branch, branchStart, { x: 1, y: 0 }, 'branch-bounded span');
  evidence.interactions.push('The midpoint stops at a T-junction: the start centers between 1113 and 3513 rather than halfway along the complete wall');

  const freeBase = await openFixture('free-grid-start', vertical);
  const freeStart = { x: 3100, y: 2600 };
  await drag('free', [3103, 2603], [5200, 2600], freeStart, null);
  const free = await snapshot('free');
  corridorGeometry(freeBase, free, freeStart, { x: 1, y: 0 }, 'outside target reach');
  evidence.interactions.push('A start away from any wall remains a normal grid-snapped free corridor at (3100,2600)');

  const cancelBase = await openFixture('canceled-door-start', vertical, doorStart);
  await drag('canceled', [2435, 2070], [5013, 1947], doorStart, 'door', { cancel: true });
  assert.deepEqual(await snapshot('canceled'), cancelBase, 'Escape discards the full corridor preview without touching the door');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push('Escape cancels a snapped corridor gesture without changing geometry, doorway, dirty state or undo history');

  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(path.join(artifacts, 'corridor-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'corridor-failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.close();
}
