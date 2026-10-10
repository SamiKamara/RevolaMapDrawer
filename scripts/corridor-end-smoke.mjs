import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, addDoor, addCorridor, validateDocument } from '../src/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.env.PACKAGED === '1';
const prefix = packaged ? 'corridor-end-packaged' : 'corridor-end';
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const matchingSourceFiles = ['index.html', 'src/app.js', 'src/corridors.js', 'src/model.js', 'src/style.css', 'src/render.js'];
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
  for (const file of matchingSourceFiles) {
    assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches current source`);
  }
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, matchingSourceFiles: packaged ? matchingSourceFiles : [], interactions: [], placements: [], rendererErrors: errors };

try {
  await desktop.evaluate(({ dialog }) => {
    // Only dialog destination choices are stubbed. Native preload, IPC, file
    // reads/writes, validation, renderer input and document history are real.
    global.__revolaCorridorEnd = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaCorridorEnd.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaCorridorEnd.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  const canvas = page.locator('#map-canvas');
  await expect(canvas).toBeVisible();
  if (packaged) assert.match((await page.evaluate(() => location.href)).toLowerCase(), /\/dist\/revolamapdrawer-win32-x64\/resources\/app(?:\.asar)?\/index\.html$/);
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let mapPoint;
  const calibrate = async () => {
    await settled();
    const state = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const transform = element.getContext('2d').getTransform();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        ratioX: element.width / rect.width, ratioY: element.height / rect.height,
        a: transform.a, d: transform.d, e: transform.e, f: transform.f };
    });
    assert.ok(state.width > 300 && state.height > 300);
    // Read the actual Canvas transform rather than estimating from the rounded
    // status coordinates; fractional targets stay distinguishable from grid.
    mapPoint = (x, y) => ({ x: state.x + (x * state.a + state.e) / state.ratioX,
      y: state.y + (y * state.d + state.f) / state.ratioY });
  };
  const snapshotPath = name => path.join(artifacts, `${prefix}-${name}.revola.json`);
  const snapshot = async name => {
    const filePath = snapshotPath(name);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaCorridorEnd.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native project snapshot validates without normalization');
    return document;
  };
  const openPath = async (filePath, name) => {
    await desktop.evaluate((_electron, source) => global.__revolaCorridorEnd.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await page.locator('#fit-button').click();
    await calibrate();
    await page.locator('[data-tool="corridor"]').click();
    await expect(page.locator('#undo-button')).toBeDisabled();
    await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  };
  const fixture = async (name, segments, doors = [], gaps = []) => {
    const document = createDocument(); document.name = name;
    for (const [ax, ay, bx, by] of segments) addWall(document, { x: ax, y: ay }, { x: bx, y: by }, { joinTolerance: 0 });
    for (const { edge = 0, point } of doors) addDoor(document, document.edges[edge].id, point, { centerTolerance: 0 });
    for (const [index, { edge, start, end }] of gaps.entries()) document.edges[edge].gaps.push({ id: `fixturegap${index + 1}`, start, end });
    assert.deepEqual(validateDocument(document), document);
    const filePath = snapshotPath(`${name}-fixture`);
    await fs.writeFile(filePath, JSON.stringify(document, null, 2));
    await openPath(filePath, name);
    assert.deepEqual(await snapshot(`${name}-opened`), document, 'Native fixture open preserves exact geometry');
    return document;
  };
  const screenshot = async name => {
    await settled();
    await page.screenshot({ path: path.join(artifacts, `${prefix}-${name}.png`) });
  };
  const greenPixelsAt = async point => {
    await settled();
    return canvas.evaluate((element, p) => {
      const rect = element.getBoundingClientRect(), scale = element.width / rect.width;
      const cx = Math.round((p.x - rect.left) * scale), cy = Math.round((p.y - rect.top) * scale);
      const data = element.getContext('2d').getImageData(cx - 7, cy - 7, 15, 15).data;
      let green = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 1] > data[i] + 20 && data[i + 1] > data[i + 2] + 20) green++;
      return green;
    }, mapPoint(point.x, point.y));
  };
  const drag = async (name, route, { target = null, kind = 'wall midpoint', cancel = null } = {}) => {
    const first = mapPoint(...route[0]);
    await page.mouse.move(first.x, first.y); await page.mouse.down();
    for (const point of route.slice(1)) {
      const next = mapPoint(...point);
      await page.mouse.move(next.x, next.y, { steps: 10 });
    }
    if (target) {
      await expect(page.locator('#status-message')).toContainText(`Corridor endpoint aligned to the ${kind}`);
      await expect(page.locator('#status-message')).toContainText('Release to place');
      assert.ok(await greenPixelsAt(target) > 0, 'Live preview marks the exact aligned endpoint in green');
    } else await expect(page.locator('#status-message')).not.toContainText('Corridor endpoint aligned');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    await screenshot(`${name}-preview`);
    if (cancel === 'escape') await page.keyboard.press('Escape');
    if (cancel === 'tool') await page.locator('[data-tool="select"]').click();
    await page.mouse.up();
    if (!cancel) await expect(page.locator('#status-message')).toContainText(target ? `Corridor endpoint aligned to the ${kind}` : 'Corridor placed');
    assert.equal(await page.locator('#corridor-end-choice').count(), 0, 'Alignment commits directly without a choice panel');
  };
  const doorCuts = document => document.edges.flatMap(edge => {
    const a = document.vertices.find(v => v.id === edge.a), b = document.vertices.find(v => v.id === edge.b);
    return edge.doors.map(door => ({ id: door.id, x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t,
      width: document.style.doorWidth }));
  }).sort((a, b) => a.id.localeCompare(b.id));
  const sameDoors = (before, after) => {
    const expected = doorCuts(before), actual = doorCuts(after);
    assert.equal(actual.length, expected.length, 'No automatic doors are added or existing doors removed');
    for (let i = 0; i < actual.length; i++) {
      assert.equal(actual[i].id, expected[i].id);
      assert.equal(actual[i].width, 375);
      assert.ok(Math.hypot(actual[i].x - expected[i].x, actual[i].y - expected[i].y) < 1e-6, 'Existing doorway stays at its exact world position');
    }
  };
  const verifyPath = (before, after, expectedPath, name) => {
    const expected = structuredClone(before);
    // The expected centerline is independently calculated in each fixture.
    // Insertion alone supplies graph splitting/IDs; never call the fitter here.
    addCorridor(expected, expectedPath.map(([x, y]) => ({ x, y })));
    assert.deepEqual(after, expected, `${name}: committed graph matches the independently expected exact route`);
    sameDoors(before, after);
    assert.deepEqual(after.ship, before.ship, 'Fixed ship and ports remain unchanged');
    evidence.placements.push({ name, path: expectedPath, width: after.style.corridorWidth, walls: after.edges.length, doors: doorCuts(after) });
  };
  const undoRedo = async (name, before, after) => {
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-undone`), before, 'One undo restores the full original graph and openings');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-redone`), after, 'One redo restores exact fitted geometry and IDs');
  };

  const straightWalls = [[1613.5, 1211, 1613.5, 3994], [5013.5, 1211, 5013.5, 3994]];
  const straightRoute = [[1628.5, 2637.5], [4940, 2630]];
  const center = { x: 5013.5, y: 2602.5 };
  const straightBase = await fixture('fractional-midpoint', straightWalls);
  await drag('fractional-midpoint', straightRoute, { target: center });
  const straight = await snapshot('fractional-midpoint');
  verifyPath(straightBase, straight, [[1613.5, 2602.5], [5013.5, 2602.5]], 'fractional midpoint');
  await undoRedo('fractional-midpoint', straightBase, straight);
  evidence.interactions.push('A raw endpoint about 75 px short and 28 px along the wall automatically reaches exact fractional midpoint (5013.5,2602.5); live preview and commit agree; fractional start stays fixed; one-step undo/redo is exact and no doorway is created');

  const doorPoint = { x: 5013.5, y: 1947.5 };
  const doorBase = await fixture('fractional-door', [[1613.5, 556, 1613.5, 3339], [5013.5, 1011, 5013.5, 3993]], [{ edge: 1, point: doorPoint }]);
  await drag('fractional-door', [[1628.5, 1962.5], [4940, 2070]], { target: doorPoint, kind: 'door center' });
  const doorway = await snapshot('fractional-door');
  verifyPath(doorBase, doorway, [[1613.5, 1947.5], [5013.5, 1947.5]], 'existing door center');
  await undoRedo('fractional-door', doorBase, doorway);
  await fixture('reopen-placeholder', []);
  await openPath(snapshotPath('fractional-door'), doorway.name);
  assert.deepEqual(await snapshot('door-reopened'), doorway, 'Native save/open preserves exact aligned topology and existing door');
  evidence.interactions.push('Raw aim 122.5 px along an existing opening automatically reaches its off-grid center, preserving the original door ID, world position and 375 px width through graph subdivision, undo/redo and native reopen');

  const bentBase = await fixture('least-squares-bends', [[3513.5, 1013.5, 6513.5, 1013.5]]);
  await drag('least-squares-bends', [[1600, 3500], [3200, 3500], [5000, 1700], [5000, 1000]], { target: { x: 5013.5, y: 1013.5 } });
  const bent = await snapshot('least-squares-bends');
  const fittedBends = [[1600, 3500], [3206.75, 3500], [5013.5, 1693.25], [5013.5, 1013.5]];
  // E→NE→N requires bend1.x = bend2.y + 1513.5. Minimizing
  // (bend1.x−3200)² + (bend2.y−1700)² gives 3206.75 and 1693.25.
  verifyPath(bentBase, bent, fittedBends, 'least-squares three-segment route');
  await undoRedo('least-squares-bends', bentBase, bent);
  evidence.interactions.push('Automatic correction of E→NE→N adjusts both bends by the independently calculated least-squares solution (3206.75,3500) and (5013.5,1693.25), preserving every forward direction and the original start');

  const awayBase = await fixture('no-nearby-target', []);
  await drag('no-nearby-target', [[1600, 2600], [4900, 2600]]);
  const away = await snapshot('no-nearby-target');
  verifyPath(awayBase, away, [[1600, 2600], [4900, 2600]], 'unassisted route');
  evidence.interactions.push('A route without a nearby structural target commits its normal grid geometry immediately');

  const unfitBase = await fixture('unreachable-straight-target', [straightWalls[1]]);
  await drag('unreachable-straight-target', [[1600, 2600], [4940, 2630]]);
  const unfit = await snapshot('unreachable-straight-target');
  verifyPath(unfitBase, unfit, [[1600, 2600], [4950, 2600]], 'off-ray straight target fallback');
  evidence.interactions.push('A nearby fractional midpoint off a straight route’s fixed horizontal ray falls back to the original route without moving its start or inventing a bend');

  const rawBase = await fixture('raw-outside-midpoint-zone', straightWalls);
  await drag('raw-outside-midpoint-zone', [[1628.5, 2637.5], [4940, 2658]]);
  const raw = await snapshot('raw-outside-midpoint-zone');
  // The attracted press moves (-15,-35) from the raw press. Apply that same
  // correction to the route aim: 4940-15-1613.5=3311.5 rounds to 3300.
  verifyPath(rawBase, raw, [[1613.5, 2602.5], [4913.5, 2602.5]], 'raw endpoint target semantics with press correction');
  evidence.interactions.push('Raw release 55.5 px along the wall stays outside midpoint attraction even though the corrected quantized horizontal endpoint lies inside the zone; the route retains the actual drag displacement from its exact start');

  const tinyReleaseBase = await fixture('final-unsampled-movement', straightWalls);
  await drag('final-unsampled-movement', [[1628.5, 2637.5], [4940, 2660], [4940, 2640]], { target: center });
  const tinyRelease = await snapshot('final-unsampled-movement');
  verifyPath(tinyReleaseBase, tinyRelease, [[1613.5, 2602.5], [5013.5, 2602.5]], 'final movement under sampling threshold');
  evidence.interactions.push('A final 20 map px movement enters the endpoint attraction zone despite being below the 35 px route sampling threshold; the real release aim supplies the fitted preview and committed endpoint');

  const parallelBase = await fixture('parallel-arrival', [[5000, 1210, 5000, 3990]]);
  await drag('parallel-arrival', [[5000, 1000], [5000, 2630]]);
  const parallel = await snapshot('parallel-arrival');
  verifyPath(parallelBase, parallel, [[5000, 1000], [5000, 2625]], 'parallel target fallback');
  evidence.interactions.push('A corridor traveling along the receiving wall keeps its drawn route instead of attracting to a midpoint it is passing');

  const unsafeBase = await fixture('unrelated-door-protected', [[5000, 1000, 5000, 5000], [3500, 3290, 4500, 3290]], [{ edge: 1, point: { x: 4000, y: 3290 } }]);
  await drag('unrelated-door-protected', [[1000, 1000], [2500, 1000], [2500, 3050], [4950, 3040]]);
  const unsafe = await snapshot('unrelated-door-protected');
  verifyPath(unsafeBase, unsafe, [[1000, 1000], [2500, 1000], [2500, 3050], [4950, 3050]], 'unsafe auto-fit opening fallback');
  evidence.interactions.push('An otherwise legal fitted rail would fill an unrelated existing door; automatic alignment is suppressed and the original legal route preserves that opening');

  const erasedBase = await fixture('unrelated-erasure-protected', [[5000, 1000, 5000, 5000], [3500, 3290, 4500, 3290]], [], [{ edge: 1, start: .3, end: .6 }]);
  await drag('unrelated-erasure-protected', [[1000, 1000], [2500, 1000], [2500, 3050], [4950, 3040]]);
  const erased = await snapshot('unrelated-erasure-protected');
  verifyPath(erasedBase, erased, [[1000, 1000], [2500, 1000], [2500, 3050], [4950, 3050]], 'unsafe auto-fit erased-gap fallback');
  evidence.interactions.push('The same unsafe fitted rail is rejected over an unrelated 300 px erasure; the ordinary route preserves exact gap bounds and ID');

  const cancelBase = await fixture('cancel-live-alignment', straightWalls);
  await drag('escape-cancel', straightRoute, { target: center, cancel: 'escape' });
  assert.deepEqual(await snapshot('escape-canceled'), cancelBase, 'Escape cancels the fitted preview without an edit');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  await drag('tool-cancel', straightRoute, { target: center, cancel: 'tool' });
  assert.deepEqual(await snapshot('tool-canceled'), cancelBase, 'Tool change cancels the fitted preview without an edit');
  await expect(page.locator('#undo-button')).toBeDisabled();
  evidence.interactions.push('Escape and a tool change during a fitted drag discard the preview, leaving document, dirty state and undo history unchanged');

  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700));
  await fixture('compact-automatic-alignment', straightWalls);
  await expect(canvas).toBeInViewport();
  await expect(page.locator('#export-button')).toBeInViewport();
  await drag('compact', straightRoute, { target: center });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Compact workspace has no page-level horizontal overflow');
  await screenshot('compact');
  evidence.interactions.push('At 1024×700 the live fitted drag and immediate placement work through normal controls, with no extra choice panel or horizontal overflow');

  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(path.join(artifacts, `${prefix}-results.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, `${prefix}-failure.png`) }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.close();
}
