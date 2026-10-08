import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, addWall, addDoor, validateDocument } from '../src/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
const packaged = process.env.PACKAGED === '1';
const prefix = packaged ? 'clipboard-packaged' : 'clipboard';
await fs.mkdir(artifacts, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, interactions: [], pastes: [] };

try {
  await desktop.evaluate(({ dialog }) => {
    // Only native dialog destination choices are stubbed. Fixtures and snapshots
    // use the production preload, IPC, filesystem and validation paths.
    global.__revolaClipboardSmoke = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaClipboardSmoke.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaClipboardSmoke.opens.shift();
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
  const hoverMap = async (x, y) => {
    const p = mapPoint(x, y);
    await page.mouse.move(p.x, p.y);
  };
  const clickMap = async (x, y, control = false) => {
    const p = mapPoint(x, y);
    if (control) await page.keyboard.down('Control');
    try { await page.mouse.click(p.x, p.y); }
    finally { if (control) await page.keyboard.up('Control'); }
  };
  const marquee = async (start, end) => {
    const a = mapPoint(...start), b = mapPoint(...end);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
  };
  const screenshot = async name => {
    await settled();
    await page.screenshot({ path: path.join(artifacts, `${prefix}-${name}.png`) });
  };
  const snapshotPath = name => path.join(artifacts, `${prefix}-${name}.revola.json`);
  const snapshot = async name => {
    const filePath = snapshotPath(name);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaClipboardSmoke.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native saved project is valid');
    return document;
  };
  const openPath = async (filePath, name) => {
    await desktop.evaluate((_electron, source) => global.__revolaClipboardSmoke.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await page.locator('#fit-button').click(); await calibrate();
    await page.locator('[data-tool="select"]').click();
    await counts(0, 0);
    await expect(page.locator('#undo-button')).toBeDisabled();
  };
  const fixture = createDocument(); fixture.name = 'Clipboard regression';
  addWall(fixture, { x: 1400.5, y: 1600.5 }, { x: 3200.5, y: 1600.5 }, { joinTolerance: 0 });
  addWall(fixture, { x: 3200.5, y: 1600.5 }, { x: 3200.5, y: 3000.5 }, { joinTolerance: 0 });
  addDoor(fixture, fixture.edges[0].id, { x: 2700.5, y: 1600.5 }, { centerTolerance: 0 });
  fixture.edges[0].gaps.push({ id: 'fixturegap', start: .15, end: .22 });
  assert.deepEqual(validateDocument(fixture), fixture);
  const fixturePath = snapshotPath('fixture');
  await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
  const first = fixture.edges[0];
  const fresh = async () => {
    await openPath(fixturePath, fixture.name);
    assert.deepEqual(await snapshot('fixture-opened'), fixture);
  };
  const allIds = doc => [...doc.vertices.map(v => v.id), ...doc.edges.flatMap(e => [e.id, ...e.doors.map(d => d.id), ...e.gaps.map(g => g.id)])];
  const pastedGeometry = (before, after, sourceEdges, expectedDelta, name) => {
    for (const vertex of before.vertices) assert.deepEqual(after.vertices.find(v => v.id === vertex.id), vertex, 'Existing vertex stays unchanged');
    for (const edge of before.edges) assert.deepEqual(after.edges.find(e => e.id === edge.id), edge, 'Existing wall and openings stay unchanged');
    assert.deepEqual(after.ship, before.ship, 'The ship stays fixed and is not duplicated');
    assert.equal(after.edges.length, before.edges.length + sourceEdges.length, 'Only the copied internal walls are appended');
    const oldIds = new Set(allIds(before));
    const added = after.edges.filter(edge => !oldIds.has(edge.id));
    const ids = allIds(after);
    assert.equal(new Set(ids).size, ids.length, 'Every wall, point, door and gap has a unique ID');
    const sourceVertices = new Map(fixture.vertices.map(v => [v.id, v]));
    const expectedVertices = new Set(sourceEdges.flatMap(e => [e.a, e.b]));
    assert.equal(after.vertices.length, before.vertices.length + expectedVertices.size, 'A shared copied corner stays one graph vertex');
    const delta = { x: null, y: null };
    const used = new Set();
    for (const source of sourceEdges) {
      const sa = sourceVertices.get(source.a), sb = sourceVertices.get(source.b);
      const candidate = added.find(edge => {
        const a = after.vertices.find(v => v.id === edge.a), b = after.vertices.find(v => v.id === edge.b);
        return !used.has(edge.id) && Math.abs((b.x - a.x) - (sb.x - sa.x)) < 1e-6 && Math.abs((b.y - a.y) - (sb.y - sa.y)) < 1e-6;
      });
      assert.ok(candidate, `${name}: copied wall retains its exact length and direction`);
      used.add(candidate.id);
      const a = after.vertices.find(v => v.id === candidate.a), b = after.vertices.find(v => v.id === candidate.b);
      const actualDelta = { x: a.x - sa.x, y: a.y - sa.y };
      if (delta.x === null) Object.assign(delta, actualDelta);
      assert.deepEqual(actualDelta, delta, 'Every copied edge uses the same translation');
      assert.deepEqual({ x: b.x - sb.x, y: b.y - sb.y }, delta, 'Fractional endpoints retain their relative geometry');
      assert.ok(Math.abs(delta.x - expectedDelta.x) <= 25 && Math.abs(delta.y - expectedDelta.y) <= 25, `${name}: paste is centered at the pointer`);
      assert.equal(delta.x % fixture.style.grid, 0, 'Only the translation is grid-snapped');
      assert.equal(delta.y % fixture.style.grid, 0, 'Only the translation is grid-snapped');
      assert.deepEqual(candidate.doors.map(({ t }) => ({ t })), source.doors.map(({ t }) => ({ t })), 'Door position and fixed 375 px width survive copying');
      assert.deepEqual(candidate.gaps.map(({ start, end }) => ({ start, end })), source.gaps.map(({ start, end }) => ({ start, end })), 'Erased gap boundaries survive copying');
      for (const id of [candidate.id, candidate.a, candidate.b, ...candidate.doors.map(d => d.id), ...candidate.gaps.map(g => g.id)]) assert.ok(!oldIds.has(id), 'The paste does not reuse an existing graph ID');
    }
    evidence.pastes.push({ name, walls: added.length, points: expectedVertices.size, delta });
  };
  const startPaste = async (x, y, name) => {
    await canvas.focus(); await hoverMap(x, y);
    await page.keyboard.press('Control+v');
    await screenshot(`${name}-preview`);
  };
  const undoRedo = async (name, before, after) => {
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-undone`), before, 'One undo removes the whole pasted group');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-redone`), after, 'One redo restores the whole pasted group');
  };

  await fresh();
  await expect(page.locator('#copy-button')).toBeDisabled();
  await expect(page.locator('#paste-button')).toBeDisabled();
  await clickMap(1400.5, 1600.5); await counts(0, 1);
  await clickMap(3200.5, 1600.5, true); await counts(0, 2);
  await expect(page.locator('#copy-button')).toBeEnabled();
  await page.keyboard.press('Control+c');
  await expect(page.locator('#paste-button')).toBeEnabled();
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  await expect(page.locator('#undo-button')).toBeDisabled();
  assert.deepEqual(await snapshot('copy-only'), fixture, 'Copy and selection do not edit the document');
  evidence.interactions.push('Ctrl-click selects two endpoints; Ctrl+C copies their internal wall, leaves the adjoining boundary wall out, and creates no dirty state or undo entry');

  await startPaste(5300.5, 3600.5, 'cancel');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  await page.keyboard.press('Escape'); await counts(0, 2);
  assert.deepEqual(await snapshot('canceled'), fixture, 'Escape discards the full paste preview');
  evidence.interactions.push('A floating paste preview leaves the document clean; Escape cancels and restores the original point selection');

  await startPaste(2300.5, 1600.5, 'overlap');
  await clickMap(2300.5, 1600.5);
  await expect(page.locator('#status-message')).toHaveClass(/error/);
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  await page.keyboard.press('Escape'); await counts(0, 2);
  assert.deepEqual(await snapshot('invalid-overlap'), fixture, 'An invalid overlap is atomic and creates no history entry');
  evidence.interactions.push('Pasting directly over the source is rejected visibly; canceling the invalid preview preserves every original ID and opening');

  await startPaste(5300.5, 3600.5, 'point-group');
  await clickMap(5300.5, 3600.5); await counts(1, 2);
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  const pasted = await snapshot('point-group');
  pastedGeometry(fixture, pasted, [first], { x: 3000, y: 2000 }, 'two points with an internal wall');
  await screenshot('point-group-selected');
  await undoRedo('point-group', fixture, pasted);
  evidence.interactions.push('Ctrl+V and a canvas click commit the point-induced wall with fresh IDs and unchanged fractional geometry, door and erasure; the new group is selected and has exact one-step undo/redo');

  await startPaste(5500.5, 2600.5, 'repeated');
  await clickMap(5500.5, 2600.5); await counts(1, 2);
  const repeated = await snapshot('repeated');
  pastedGeometry(pasted, repeated, [first], { x: 3200, y: 1000 }, 'repeated original clipboard');
  evidence.interactions.push('A second Ctrl+V uses the unchanged original clipboard and allocates another independent set of IDs');

  await fresh();
  await marquee([1100, 1200], [3450, 3250]); await counts(2, 3);
  await page.locator('#copy-button').click();
  await canvas.focus(); await page.keyboard.press('Delete'); await counts(0, 0);
  const deleted = await snapshot('source-deleted');
  assert.equal(deleted.edges.length, 0); assert.equal(deleted.vertices.length, 0);
  const empty = createDocument(); empty.name = 'Clipboard destination'; empty.ship.mirrored = true;
  const emptyPath = snapshotPath('destination-fixture');
  await fs.writeFile(emptyPath, JSON.stringify(empty, null, 2));
  await openPath(emptyPath, empty.name);
  await expect(page.locator('#paste-button')).toBeEnabled();
  await page.locator('#paste-button').click();
  await hoverMap(5300.5, 2700.5); await screenshot('cross-project-preview');
  await clickMap(5300.5, 2700.5); await counts(2, 3);
  const crossProject = await snapshot('cross-project');
  pastedGeometry(empty, crossProject, fixture.edges, { x: 3000, y: 400 }, 'clipboard after source deletion and another project');
  await undoRedo('cross-project', empty, crossProject);
  evidence.interactions.push('Copy/Paste buttons work for a marquee group with a shared corner; deleting the source and opening another project keep the immutable clipboard, and the destination ship orientation stays unchanged');

  await page.locator('#map-name').focus();
  const textDefaults = await page.locator('#map-name').evaluate(input => ['c', 'v'].map(key => {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return { key, defaultPrevented: event.defaultPrevented };
  }));
  assert.deepEqual(textDefaults, [{ key: 'c', defaultPrevented: false }, { key: 'v', defaultPrevented: false }], 'The editor leaves native text copy/paste defaults alone');
  await expect(page.locator('#map-name')).toHaveValue(empty.name);
  assert.deepEqual(await snapshot('typing-shortcuts'), crossProject);
  evidence.interactions.push('Focused map-name fields leave Ctrl+C/Ctrl+V default text behavior available; synthetic cancelable keyboard events verify the editor does not intercept them without changing the system clipboard');

  await openPath(snapshotPath('cross-project'), empty.name);
  assert.deepEqual(await snapshot('reopened'), crossProject, 'Native save/open preserves all copied topology and cuts');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700));
  await expect(page.locator('#export-button')).toBeInViewport();
  await expect(canvas).toBeInViewport();
  await page.locator('#paste-button').scrollIntoViewIfNeeded();
  await expect(page.locator('#copy-button')).toBeInViewport();
  await expect(page.locator('#paste-button')).toBeInViewport();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'The compact interface has no page-level horizontal overflow');
  await screenshot('compact');
  evidence.interactions.push('Copied project opens through the native file path with exact topology; copy/paste controls remain accessible at 1024×700');

  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  evidence.rendererErrors = errors;
  await fs.writeFile(path.join(artifacts, `${prefix}-results.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, `${prefix}-failure.png`) }).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally {
  await desktop.close();
}
