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
const evidence = { interactions: [], movements: [] };

try {
  await desktop.evaluate(({ dialog }) => {
    // Only dialog destination choices are stubbed. Fixtures and snapshots pass
    // through the production preload, IPC, file I/O and document validation.
    global.__revolaSelectionSmoke = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaSelectionSmoke.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaSelectionSmoke.opens.shift();
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
      const coordinates = (await page.locator('#pointer-position').textContent()).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      assert.equal(coordinates?.length, 2);
      return { x: coordinates[0], y: coordinates[1] };
    };
    const a = await pointerAt(p.x, p.y), b = await pointerAt(p.x + 120, p.y + 120);
    mapPoint = (x, y) => ({ x: p.x + (x - a.x) * 120 / (b.x - a.x), y: p.y + (y - a.y) * 120 / (b.y - a.y) });
  };
  const counts = async (walls, points) => {
    await expect(page.locator('#selection-info')).toHaveAttribute('data-wall-count', String(walls));
    await expect(page.locator('#selection-info')).toHaveAttribute('data-point-count', String(points));
  };
  const clickMap = async (x, y, control = false) => {
    const p = mapPoint(x, y);
    if (control) await page.keyboard.down('Control');
    try { await page.mouse.click(p.x, p.y); }
    finally { if (control) await page.keyboard.up('Control'); }
  };
  const dragMap = async (start, end, { control = false, cancel = false, returnToStart = false, screenshot } = {}) => {
    const a = mapPoint(...start), b = mapPoint(...end);
    if (control) await page.keyboard.down('Control');
    try {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 10 });
      if (screenshot) { await settled(); await page.screenshot({ path: path.join(artifacts, `selection-${screenshot}.png`) }); }
      if (cancel) await page.keyboard.press('Escape');
      if (returnToStart) await page.mouse.move(a.x, a.y, { steps: 10 });
      await page.mouse.up();
    } finally { if (control) await page.keyboard.up('Control'); }
  };
  const snapshotPath = name => path.join(artifacts, `selection-${name}.revola.json`);
  const snapshot = async name => {
    const filePath = snapshotPath(name);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaSelectionSmoke.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native saved project is valid');
    return document;
  };
  const openPath = async (filePath, name) => {
    await desktop.evaluate((_electron, source) => global.__revolaSelectionSmoke.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await page.locator('#fit-button').click();
    await calibrate();
    await page.locator('[data-tool="select"]').click();
    await counts(0, 0);
    await expect(page.locator('#undo-button')).toBeDisabled();
  };
  const fixture = createDocument(); fixture.name = 'Selection regression';
  const [first] = addWall(fixture, { x: 1400, y: 1600 }, { x: 3000, y: 1600 }, { joinTolerance: 0 });
  const [second] = addWall(fixture, { x: 3000, y: 1600 }, { x: 3000, y: 3000 }, { joinTolerance: 0 });
  const [third] = addWall(fixture, { x: 4300, y: 2200 }, { x: 5600, y: 2200 }, { joinTolerance: 0 });
  addDoor(fixture, third.id, { x: 5000, y: 2200 }, { centerTolerance: 0 });
  const fixturePath = snapshotPath('fixture');
  await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
  const fresh = async () => {
    await openPath(fixturePath, fixture.name);
    assert.deepEqual(await snapshot('fixture-opened'), fixture, 'Native import preserves selection fixture exactly');
  };
  const undoRedo = async (name, before, after) => {
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-undone`), before, 'One undo restores the entire gesture');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-redone`), after, 'Redo restores the full selection edit');
  };
  const translation = (before, after, ids, expected, name) => {
    assert.deepEqual(after.edges, before.edges, 'Group translation preserves graph and opening IDs/parameters');
    assert.deepEqual(after.ship, before.ship, 'The fixed ship does not move');
    const deltas = after.vertices.map(vertex => {
      const old = before.vertices.find(item => item.id === vertex.id);
      const delta = { x: vertex.x - old.x, y: vertex.y - old.y };
      if (ids.includes(vertex.id)) {
        assert.ok(Math.abs(delta.x - expected.x) < 8 && Math.abs(delta.y - expected.y) < 8,
          `${name}: selected ${vertex.id} moves by intended delta (${delta.x}, ${delta.y})`);
      } else assert.deepEqual(vertex, old, `${name}: an unselected vertex stays fixed`);
      return { id: vertex.id, ...delta };
    });
    const moved = deltas.filter(item => ids.includes(item.id));
    for (const delta of moved) assert.ok(Math.abs(delta.x - moved[0].x) < 1e-6 && Math.abs(delta.y - moved[0].y) < 1e-6, 'Shared points move once, with one rigid translation');
    evidence.movements.push({ name, vertices: deltas });
  };
  const greenPixelsAt = async (x, y) => {
    await settled();
    return canvas.evaluate((element, point) => {
      const rect = element.getBoundingClientRect(), scale = element.width / rect.width;
      const cx = Math.round((point.x - rect.left) * scale), cy = Math.round((point.y - rect.top) * scale);
      const data = element.getContext('2d').getImageData(cx - 4, cy - 4, 9, 9).data;
      let green = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 1] > data[i] + 10 && data[i + 1] > data[i + 2] + 10) green++;
      return green;
    }, mapPoint(x, y));
  };

  await fresh();
  await expect(page.locator('#tool-guide')).toContainText(/Ctrl/i);
  await clickMap(2200, 1600); await counts(1, 2);
  await expect(page.locator('#selection-badge')).toHaveText('WALL');
  await clickMap(3000, 2300, true); await counts(2, 3);
  await clickMap(4300, 2200, true); await counts(2, 4);
  await clickMap(3000, 2300, true); await counts(1, 3);
  await clickMap(4300, 2200, true); await counts(1, 2);
  await clickMap(2200, 1600, true); await counts(0, 0);
  await expect(page.locator('#delete-button')).toBeDisabled();
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  assert.deepEqual(await snapshot('ctrl-selection-only'), fixture, 'Ctrl selection changes neither document nor history');
  evidence.interactions.push('Ctrl-click adds and toggles walls and a real endpoint; effective vertex count deduplicates the shared junction; selecting alone creates no dirty document or undo step');

  await dragMap([1700, 1300], [2500, 1900]);
  await counts(0, 0);
  await dragMap([1100, 1200], [3400, 3300], { screenshot: 'marquee-preview' });
  await counts(2, 3);
  await expect(page.locator('#selection-badge')).toHaveText('GROUP');
  assert.ok(await greenPixelsAt(2200, 1600) > 0, 'First enclosed wall has a visible selection highlight');
  assert.ok(await greenPixelsAt(3000, 2300) > 0, 'Second enclosed wall has a visible selection highlight');
  assert.deepEqual(await snapshot('marquee-only'), fixture);
  await page.screenshot({ path: path.join(artifacts, 'selection-selected-group.png') });
  const groupIds = [...new Set([first.a, first.b, second.a, second.b])];
  await dragMap([2200, 1600], [2600, 2100]);
  await counts(2, 3);
  const moved = await snapshot('group-moved');
  translation(fixture, moved, groupIds, { x: 400, y: 500 }, 'two-wall group');
  await undoRedo('group-move', fixture, moved);
  evidence.interactions.push('An empty-canvas marquee fully encloses two walls and their three unique vertices; merely crossing a wall does not select it; dragging a selected wall retains and translates the whole group with exact one-step undo/redo');

  // Escape must discard a preview without committing a partial group move.
  const movedMidpoint = moved.vertices.find(v => v.id === first.a);
  await dragMap([movedMidpoint.x + 800, movedMidpoint.y], [movedMidpoint.x + 1100, movedMidpoint.y + 500], { cancel: true });
  await counts(2, 3);
  assert.deepEqual(await snapshot('move-canceled'), moved);
  await page.keyboard.press('Escape');
  await counts(0, 0);
  await expect(page.locator('#delete-button')).toBeDisabled();
  evidence.interactions.push('Escape during a group drag cancels the entire preview and preserves the selection; Escape while idle clears the selection');

  await openPath(snapshotPath('group-moved'), fixture.name);
  assert.deepEqual(await snapshot('group-reopened'), moved, 'Native save/open preserves the moved group, other geometry and door');
  evidence.interactions.push('Native project reopen restores exact moved graph and openings, clears ephemeral selection and starts clean history');

  await fresh();
  await dragMap([3400, 3300], [1100, 1200]);
  await counts(2, 3);
  await dragMap([4000, 1850], [5900, 2550], { control: true });
  await counts(3, 5);
  await page.screenshot({ path: path.join(artifacts, 'selection-ctrl-marquee.png') });
  await page.keyboard.press('Delete');
  await counts(0, 0);
  const deleted = await snapshot('all-deleted');
  assert.equal(deleted.edges.length, 0); assert.equal(deleted.vertices.length, 0);
  assert.deepEqual(deleted.ship, fixture.ship);
  await undoRedo('group-delete', fixture, deleted);
  evidence.interactions.push('Reverse-direction marquee works; Ctrl-marquee adds a disjoint wall; Delete removes all selected walls and orphan points in one undoable edit while retaining the ship');

  await fresh();
  await clickMap(1400, 1600); await counts(0, 1);
  await expect(page.locator('#selection-badge')).toHaveText('POINT');
  await clickMap(3000, 1600, true); await counts(0, 2);
  await dragMap([1400, 1600], [1400, 1900]);
  const pointsMoved = await snapshot('points-moved');
  translation(fixture, pointsMoved, [first.a, first.b], { x: 0, y: 300 }, 'two-point group');
  await undoRedo('points-move', fixture, pointsMoved);
  evidence.interactions.push('Ctrl-click selects two actual point handles without selecting walls; dragging either translates them together and stretches the stationary adjoining vertical wall');

  await fresh();
  await clickMap(1400, 1600); await counts(0, 1);
  await clickMap(5350, 2200, true); await counts(1, 3);
  await dragMap([5350, 2200], [5750, 2600]);
  const mixedMoved = await snapshot('mixed-moved');
  translation(fixture, mixedMoved, [first.a, third.a, third.b], { x: 400, y: 0 }, 'mixed point/wall group');
  await undoRedo('mixed-move', fixture, mixedMoved);
  evidence.interactions.push('A mixed point-and-wall selection moves together along the direction allowed by its stationary boundary connection; the door moves with its wall');

  await fresh();
  await dragMap([1100, 1200], [3400, 3300]); await counts(2, 3);
  await clickMap(5350, 2200); await counts(1, 2);
  await expect(page.locator('#selection-badge')).toHaveText('WALL');
  await dragMap([5350, 2200], [5750, 2600]);
  const singleMoved = await snapshot('single-wall-moved');
  translation(fixture, singleMoved, [third.a, third.b], { x: 0, y: 400 }, 'legacy single wall');
  evidence.interactions.push('Plain click on an unselected wall replaces a previous group; one ordinary wall retains its legacy perpendicular movement');

  await fresh();
  await clickMap(2200, 1600); await counts(1, 2);
  await dragMap([4000, 1850], [5900, 2550], { cancel: true });
  await counts(1, 2);
  assert.deepEqual(await snapshot('marquee-canceled'), fixture);
  await expect(page.locator('#undo-button')).toBeDisabled();
  await page.keyboard.press('Escape');
  await clickMap(1400, 1600); await counts(0, 1);
  await page.keyboard.press('Delete');
  const pointDeleted = await snapshot('point-deleted');
  assert.deepEqual(pointDeleted.edges.map(edge => edge.id), [second.id, third.id], 'Deleting a selected point removes its incident wall, not unrelated geometry');
  await undoRedo('point-delete', fixture, pointDeleted);
  evidence.interactions.push('Canceling a marquee restores prior selection without an edit; point deletion removes its incident wall in one undoable edit');

  await fresh();
  await dragMap([1100, 1200], [3400, 3300]); await counts(2, 3);
  await dragMap([2200, 1600], [2600, 2100], { returnToStart: true });
  await counts(2, 3);
  assert.deepEqual(await snapshot('returned-to-origin'), fixture, 'Returning the pointer to its press location discards the earlier move preview');
  await expect(page.locator('#undo-button')).toBeDisabled();
  evidence.interactions.push('A group dragged away and back to its original press position stays unchanged and creates no undo entry');

  await fresh();
  await clickMap(3000, 1600, true); await clickMap(5350, 2200, true); await counts(1, 3);
  await dragMap([5350, 2200], [5750, 2600]);
  await expect(page.locator('#status-message')).toContainText(/blocked/i);
  assert.deepEqual(await snapshot('blocked-group'), fixture, 'Conflicting stationary connections block the entire group atomically');
  await expect(page.locator('#undo-button')).toBeDisabled();
  evidence.interactions.push('A group with incompatible stationary boundary directions is visibly blocked without a partial move or undo entry');

  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(path.join(artifacts, 'selection-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'selection-failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.close();
}
