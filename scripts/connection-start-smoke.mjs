import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, addDoor, addCorridor, validateDocument } from '../src/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged') || process.env.PACKAGED === '1';
const compact = process.argv.includes('--compact'), compactSmall = process.argv.includes('--compact-small');
const prefix = `${packaged ? 'connection-start-packaged' : 'connection-start'}${compactSmall ? '-compact-small' : compact ? '-compact' : ''}`;
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const destination = name => path.join(artifacts, `${prefix}-${name}`);
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const matchingSourceFiles = ['index.html', 'src/app.js', 'src/corridors.js', 'src/model.js', 'src/room-start.js', 'src/rooms.js', 'src/ship.js', 'src/render.js', 'assets/ship.png'];
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
  for (const file of matchingSourceFiles) assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches current source`);
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, compact, compactSmall, matchingSourceFiles: packaged ? matchingSourceFiles : [], placements: [], interactions: [], fixtureViews: [], screenshots: [], rendererErrors: errors };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, received ${actual}`);
const vertexMap = document => new Map(document.vertices.map(vertex => [vertex.id, vertex]));
const cuts = document => {
  const vertices = vertexMap(document);
  return document.edges.flatMap(edge => {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    return edge.doors.map(door => ({ id: door.id, x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t, width: document.style.doorWidth }));
  }).sort((a, b) => a.id.localeCompare(b.id));
};
const sameExistingCuts = (before, after) => {
  for (const original of cuts(before)) {
    const actual = cuts(after).find(door => door.id === original.id);
    assert.ok(actual, 'Attachment retains every existing doorway ID');
    close(actual.x, original.x, 'Existing doorway x is unchanged'); close(actual.y, original.y, 'Existing doorway y is unchanged');
    assert.equal(actual.width, 375, 'Existing doorway width stays exactly 375 map pixels');
  }
};
const sameBase = (before, after) => {
  assert.deepEqual(after.ship, before.ship, 'Attachment preserves the fixed ship and facing');
  assert.deepEqual([after.width, after.height, after.originX, after.originY], [before.width, before.height, before.originX, before.originY], 'Attachment retains the world center, default canvas and scale');
  sameExistingCuts(before, after);
};

try {
  if (compact || compactSmall) await desktop.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), compactSmall ? [1008, 661] : [1024, 700]);
  evidence.window = await desktop.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]; return { outer: window.getSize(), content: window.getContentSize() };
  });
  await desktop.evaluate(({ dialog }) => {
    // Only file choices are supplied. Production IPC, validation and native
    // filesystem saves/reopens execute unchanged in this test-owned window.
    global.__revolaConnections = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaConnections.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaConnections.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  const canvas = page.locator('#map-canvas'); await expect(canvas).toBeVisible();
  if (packaged) assert.match((await page.evaluate(() => location.href)).toLowerCase(), /\/dist\/revolamapdrawer-win32-x64\/resources\/app(?:\.asar)?\/index\.html$/);
  await page.evaluate(() => {
    // Observe actual editor labels and dashed Canvas previews. Target lookup,
    // event handlers, camera transforms, document and drawing remain intact.
    window.__revolaConnectionDraws = { labels: [], paths: [], shipDraws: 0 };
    const prototype = CanvasRenderingContext2D.prototype;
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'fillText', 'drawImage']) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        if (this.canvas.id === 'map-canvas') {
          if (method === 'beginPath') this.__revolaConnectionPath = [];
          if (method === 'moveTo' || method === 'lineTo') this.__revolaConnectionPath?.push({ x: args[0], y: args[1] });
          if (method === 'stroke' && this.getLineDash().length) window.__revolaConnectionDraws.paths.push({ color: this.strokeStyle, points: this.__revolaConnectionPath?.map(point => ({ ...point })) });
          if (method === 'fillText') window.__revolaConnectionDraws.labels.push(String(args[0]));
          if (method === 'drawImage' && /(?:^|\/)ship\.png(?:$|\?)/.test(args[0]?.currentSrc || args[0]?.src || '')) window.__revolaConnectionDraws.shipDraws++;
        }
        return original.apply(this, args);
      };
    }
  });
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Tool feedback can replace the startup status before the bundled PNG has
  // decoded. Wait for a real rendered ship rather than racing asset readiness.
  await page.locator('#fit-button').click();
  await expect.poll(() => page.evaluate(() => window.__revolaConnectionDraws.shipDraws), { timeout: 30_000 }).toBeGreaterThan(0);
  let view, mapPoint;
  const calibrate = async () => {
    await settled();
    view = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect(), transform = element.getContext('2d').getTransform();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, ratioX: element.width / rect.width, ratioY: element.height / rect.height,
        a: transform.a, d: transform.d, e: transform.e, f: transform.f };
    });
    assert.ok(view.width > 300 && view.height > 300);
    mapPoint = point => ({ x: view.x + (point.x * view.a + view.e) / view.ratioX, y: view.y + (point.y * view.d + view.f) / view.ratioY });
  };
  const assertVisible = point => {
    const screen = mapPoint(point);
    assert.ok(screen.x >= view.x + 3 && screen.x <= view.x + view.width - 3 && screen.y >= view.y + 3 && screen.y <= view.y + view.height - 3, 'Fixture pointer lies within the actual canvas');
    return screen;
  };
  const screenshot = async name => {
    await settled();
    // These fixtures contain no editable geometry below y5390. White pixels
    // here must therefore come from the fixed ship hull, not corridor rails,
    // room previews or a drawImage call whose pixels were never displayed.
    const hull = { a: mapPoint({ x: 2800, y: 5390 }), b: mapPoint({ x: 5350, y: 6630 }) };
    const shipWhitePixels = await canvas.evaluate((element, bounds) => {
      const rect = element.getBoundingClientRect(), ratioX = element.width / rect.width, ratioY = element.height / rect.height;
      const left = Math.max(0, Math.floor((bounds.a.x - rect.x) * ratioX)), top = Math.max(0, Math.floor((bounds.a.y - rect.y) * ratioY));
      const right = Math.min(element.width, Math.ceil((bounds.b.x - rect.x) * ratioX)), bottom = Math.min(element.height, Math.ceil((bounds.b.y - rect.y) * ratioY));
      if (right <= left || bottom <= top) return 0;
      const pixels = element.getContext('2d').getImageData(left, top, right - left, bottom - top).data;
      let white = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] >= 220 && pixels[i + 1] >= 220 && pixels[i + 2] >= 220) white++;
      return white;
    }, hull);
    assert.ok(shipWhitePixels > 100, 'Actual Canvas pixels show the fixed ship hull throughout hover, preview and placement');
    evidence.screenshots.push({ name, shipWhitePixels });
    await page.screenshot({ path: destination(`${name}.png`) });
  };
  const snapshot = async name => {
    const filePath = destination(`${name}.revola.json`); await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, target) => global.__revolaConnections.saves.push(target), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(stat => stat.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native project validates without normalization');
    return document;
  };
  const open = async (filePath, name, tool = 'room') => {
    await desktop.evaluate((_electron, source) => global.__revolaConnections.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await page.locator('#fit-button').click(); await calibrate();
    await page.locator(`[data-tool="${tool}"]`).click();
    await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    // Use a real cursor-centered zoom bounded by the full test crop. This also
    // fits compact hosted screens without hiding a drag endpoint off-canvas.
    const pivotWorld = { x: 4110.5, y: 4700 }, pivot = mapPoint(pivotWorld), bounds = { left: 1500, top: 700, right: 6200, bottom: 5500 }, inset = 24;
    const scale = view.a / view.ratioX;
    const targetScale = Math.min(.2, (pivot.x - view.x - inset) / (pivotWorld.x - bounds.left),
      (view.x + view.width - inset - pivot.x) / (bounds.right - pivotWorld.x),
      (pivot.y - view.y - inset) / (pivotWorld.y - bounds.top),
      (view.y + view.height - inset - pivot.y) / (bounds.bottom - pivotWorld.y));
    assert.ok(targetScale >= .025, 'All test geometry fits within the supported minimum zoom');
    await page.mouse.move(pivot.x, pivot.y); await page.mouse.wheel(0, -Math.log(targetScale / scale) / .0015); await calibrate();
    evidence.fixtureViews.push({ fixture: path.basename(filePath), width: view.width, height: view.height, targetScale, actualScale: view.a / view.ratioX });
  };
  const fixture = async (name, document, tool) => {
    document.name = name;
    const filePath = destination(`${name}-fixture.revola.json`); await fs.writeFile(filePath, JSON.stringify(document, null, 2));
    await open(filePath, name, tool); assert.deepEqual(await snapshot(`${name}-opened`), document, 'Native fixture open preserves the exact graph');
    return document;
  };
  const resetDraws = () => page.evaluate(() => { window.__revolaConnectionDraws.labels.length = 0; window.__revolaConnectionDraws.paths.length = 0; });
  const marker = async (center, label) => {
    await settled();
    const screen = mapPoint(center);
    const result = await canvas.evaluate((element, p) => {
      const rect = element.getBoundingClientRect(), ratioX = element.width / rect.width, ratioY = element.height / rect.height;
      const x = Math.round((p.x - rect.left) * ratioX), y = Math.round((p.y - rect.top) * ratioY);
      const pixels = element.getContext('2d').getImageData(x - 7, y - 7, 15, 15).data;
      let green = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] + 15 && pixels[i + 1] > pixels[i + 2] + 10) green++;
      return { green, labels: window.__revolaConnectionDraws.labels };
    }, screen);
    assert.ok(result.green > 0, 'Resolved start marker is visibly green at the exact independently specified center');
    assert.ok(result.labels.includes(label), `Canvas actually draws the ${label} target label`);
    return result;
  };
  const drag = async (name, { aim, end, center, label, tool = 'room', kind, cancel = false, rejected = false, expectedPreview }) => {
    await page.locator(`[data-tool="${tool}"]`).click(); await resetDraws();
    const a = assertVisible(aim), b = assertVisible(end);
    await page.mouse.move(a.x, a.y); await marker(center, label); await screenshot(`${name}-hover`);
    await page.mouse.down(); await expect(page.locator('#status-message')).toContainText(`${tool === 'room' ? 'Room' : 'Corridor'} start aligned to the ${kind}`);
    await page.mouse.move(b.x, b.y, { steps: tool === 'corridor' ? 10 : 1 }); await settled();
    const draws = await page.evaluate(() => window.__revolaConnectionDraws);
    if (rejected) assert.ok(draws.paths.some(draw => ['#be8c6f', '#eeaa91', '#f0ae99'].includes(draw.color)), 'Blocked attachment has a visibly red dashed preview');
    else {
      assert.ok(draws.paths.some(draw => draw.color === '#b5e8c6' && draw.points?.length >= 2), 'Accepted attachment has a green geometry preview');
      if (expectedPreview) for (const point of expectedPreview) assert.ok(draws.paths.some(draw => draw.color === '#b5e8c6' && draw.points?.some(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-6)), 'Actual Canvas preview retains the independently specified off-grid geometry');
      await marker(center, label);
    }
    await screenshot(`${name}-preview`);
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    if (rejected) await expect(page.locator('#status-message')).toHaveClass(/error/);
    else if (!cancel) await expect(page.locator('#status-message')).toContainText(tool === 'room' ? 'Room placed' : 'Corridor placed');
    await screenshot(`${name}-finished`);
  };
  const history = async (name, before, after) => {
    await page.locator('#undo-button').click(); assert.deepEqual(await snapshot(`${name}-undone`), before, 'One undo restores every original coordinate, ID and opening');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click(); assert.deepEqual(await snapshot(`${name}-redone`), after, 'One redo restores the complete connected geometry');
  };
  const attachedRoom = (name, before, after, center, bounds, { existingDoor = false } = {}) => {
    sameBase(before, after);
    const vertices = vertexMap(after), oldVertices = vertexMap(before);
    const added = after.vertices.filter(vertex => !oldVertices.has(vertex.id));
    assert.ok(added.length >= 6, 'An attached room adds its complete chamfered perimeter');
    close(Math.min(...added.map(point => point.x)), bounds.left, 'Attached room left'); close(Math.max(...added.map(point => point.x)), bounds.right, 'Attached room right');
    close(Math.min(...added.map(point => point.y)), bounds.top, 'Attached room top'); close(Math.max(...added.map(point => point.y)), bounds.bottom, 'Attached room bottom');
    const door = cuts(after).find(door => Math.hypot(door.x - center.x, door.y - center.y) < 1e-6);
    assert.ok(door, 'Room has a real doorway at the exact start center'); assert.equal(door.width, 375);
    assert.equal(cuts(after).length, cuts(before).length + (existingDoor ? 0 : 1), 'Room reuses an existing door or creates one measured entrance');
    // At the doorway plane, the graph carries the measured opening rather than
    // a full overdrawn wall. Every newly-created base doorway remains centered.
    for (const edge of after.edges) {
      const a = vertices.get(edge.a), b = vertices.get(edge.b);
      const cross = (center.x - a.x) * (b.y - a.y) - (center.y - a.y) * (b.x - a.x);
      const t = ((center.x - a.x) * (b.x - a.x) + (center.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      if (Math.abs(cross) < 1e-6 && t > 0 && t < 1) assert.ok(edge.doors.some(candidate => Math.abs(candidate.t - t) < 1e-6), 'No solid graph wall fills the attached doorway center');
    }
    evidence.placements.push({ name, center, bounds, door, shipAndExistingDoorsPreserved: true });
  };

  const mouth = { x: 4110.5, y: 3500 };
  const corridorFixture = createDocument(); addCorridor(corridorFixture, [{ x: 4110.5, y: 4700 }, mouth]);
  const corridorBase = await fixture('corridor-open-end', corridorFixture, 'corridor');
  await expect(page.locator('#tool-guide')).toContainText('END');
  const continuationEnd = { x: 4110.5, y: 2000 };
  await drag('corridor-continued', { tool: 'corridor', aim: { x: 4130.5, y: 3514 }, end: { x: continuationEnd.x + 20, y: continuationEnd.y + 14 }, center: mouth, label: 'END', kind: 'corridor end',
    expectedPreview: [{ x: 3820.5, y: 3500 }, { x: 4400.5, y: 3500 }, { x: 3820.5, y: 2000 }, { x: 4400.5, y: 2000 }] });
  const continued = await snapshot('corridor-continued'); sameBase(corridorBase, continued); assert.equal(cuts(continued).length, 0, 'Continuation creates no doorway or cap');
  for (const x of [3820.5, 4400.5]) {
    const originalMouth = corridorBase.vertices.find(vertex => vertex.x === x && vertex.y === 3500);
    const junction = continued.vertices.find(vertex => vertex.id === originalMouth.id);
    assert.deepEqual(junction, originalMouth, 'Continuation reuses each exact original rail endpoint');
    assert.equal(continued.edges.filter(edge => edge.a === junction.id || edge.b === junction.id).length, 2, 'Both old rail endpoints become shared degree-two continuation vertices');
    assert.ok(continued.vertices.some(vertex => vertex.x === x && vertex.y === 2000), 'Continued rails retain the fractional corridor center and exact 580 px separation');
  }
  await history('corridor-continued', corridorBase, continued);
  await open(destination('corridor-continued.revola.json'), continued.name, 'corridor'); assert.deepEqual(await snapshot('corridor-continued-reopened'), continued);
  evidence.interactions.push({ name: 'corridor-continued', exactMouth: mouth, width: 580, sharedRailEndpoints: true, oneStepUndoRedo: true, nativeReopenExact: true });

  await fixture('corridor-end-room', structuredClone(corridorFixture), 'room');
  const roomCorridorBase = await snapshot('corridor-end-room-before');
  await drag('room-from-corridor', { aim: { x: 4130.5, y: 3514 }, end: { x: 5310.5, y: 1900 }, center: mouth, label: 'END', kind: 'corridor end',
    expectedPreview: [{ x: 2910.5, y: 2120 }, { x: 5310.5, y: 2120 }, { x: 3130.5, y: 3500 }, { x: 5090.5, y: 3500 }] });
  const corridorRoom = await snapshot('room-from-corridor');
  attachedRoom('room-from-corridor', roomCorridorBase, corridorRoom, mouth, { left: 2910.5, right: 5310.5, top: 1900, bottom: 3500 });
  for (const original of roomCorridorBase.vertices.filter(vertex => vertex.y === 3500)) {
    assert.deepEqual(corridorRoom.vertices.find(vertex => vertex.id === original.id), original, 'Attached room keeps the exact existing corridor mouth vertex');
    assert.ok(corridorRoom.edges.filter(edge => edge.a === original.id || edge.b === original.id).length >= 2, 'Room base and corridor reuse graph vertices');
  }
  await history('room-from-corridor', roomCorridorBase, corridorRoom);
  await open(destination('room-from-corridor.revola.json'), corridorRoom.name); assert.deepEqual(await snapshot('room-from-corridor-reopened'), corridorRoom);

  for (const mirrored of [false, true]) {
    const name = `ship-room-${mirrored ? 'mirrored' : 'normal'}`, document = createDocument(); document.ship.mirrored = mirrored;
    const before = await fixture(name, document, 'room'), center = { x: 4110.5, y: 4700 };
    const gesture = { aim: { x: 4210.5, y: 4684 }, end: { x: 5510.5, y: 2700 }, center, label: 'DOOR', kind: 'door center',
      expectedPreview: [{ x: 2710.5, y: 2920 }, { x: 5510.5, y: 2920 }, { x: 2930.5, y: 4700 }, { x: 5290.5, y: 4700 }] };
    await drag(`${name}-canceled`, { ...gesture, cancel: true });
    assert.deepEqual(await snapshot(`${name}-canceled`), before, 'Cancel leaves ship, bounds and complete graph unchanged');
    await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    await drag(name, gesture); const after = await snapshot(`${name}-placed`);
    attachedRoom(name, before, after, center, { left: 2710.5, right: 5510.5, top: 2700, bottom: 4700 });
    await history(name, before, after);
    await open(destination(`${name}-placed.revola.json`), after.name); assert.deepEqual(await snapshot(`${name}-reopened`), after, 'Native reopen preserves fixed door alignment in either facing');
    evidence.interactions.push({ name, canceledPreviewClean: true, oneStepUndoRedo: true, nativeReopenExact: true });
  }

  const wall = createDocument(); addWall(wall, { x: 2413, y: 1113 }, { x: 2413, y: 4713 }, { joinTolerance: 0 });
  const wallBase = await fixture('wall-midpoint-room', wall, 'room'), wallCenter = { x: 2413, y: 2913 };
  await drag('room-from-wall', { aim: { x: 2428, y: 2938 }, end: { x: 5013, y: 4313 }, center: wallCenter, label: 'CENTER', kind: 'wall midpoint' });
  const wallRoom = await snapshot('room-from-wall'); attachedRoom('room-from-wall', wallBase, wallRoom, wallCenter, { left: 2413, right: 5013, top: 1513, bottom: 4313 });
  await history('room-from-wall', wallBase, wallRoom);

  const withDoor = createDocument(); addWall(withDoor, { x: 2413, y: 1113 }, { x: 2413, y: 4713 }, { joinTolerance: 0 });
  const doorCenter = { x: 2413, y: 1947 }; addDoor(withDoor, withDoor.edges[0].id, doorCenter, { centerTolerance: 0 });
  const doorBase = await fixture('existing-door-room', withDoor, 'room');
  await drag('room-from-door', { aim: { x: 2428, y: 2070 }, end: { x: 4613, y: 2947 }, center: doorCenter, label: 'DOOR', kind: 'door center' });
  const doorRoom = await snapshot('room-from-door'); attachedRoom('room-from-door', doorBase, doorRoom, doorCenter, { left: 2413, right: 4613, top: 947, bottom: 2947 }, { existingDoor: true });
  await history('room-from-door', doorBase, doorRoom);
  await open(destination('room-from-door.revola.json'), doorRoom.name); assert.deepEqual(await snapshot('room-from-door-reopened'), doorRoom, 'Native reopen retains the original shared doorway ID and exact room placement');

  // A resolved anchor need not equal the raw press. Clicking its attraction
  // zone, or returning to that press after previewing, must never place the
  // minimum-sized room by accident.
  const clickBase = await fixture('attached-room-click-and-small-preview', createDocument(), 'room');
  const shipCenter = { x: 4110.5, y: 4700 }, inaccurateAim = { x: 4210.5, y: 4684 };
  const press = assertVisible(inaccurateAim);
  await page.mouse.move(press.x, press.y); await marker(shipCenter, 'DOOR');
  await page.mouse.down(); await page.mouse.up();
  assert.deepEqual(await snapshot('attached-room-click-only'), clickBase, 'A stationary click near the snapped ship door places no room');
  await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  await screenshot('attached-room-click-only');
  await drag('attached-room-early-small-preview', { aim: shipCenter, end: { x: shipCenter.x, y: shipCenter.y - 80 }, center: shipCenter,
    label: 'DOOR', kind: 'door center', cancel: true,
    expectedPreview: [{ x: 3660.5, y: 4480 }, { x: 4560.5, y: 4480 }, { x: 3880.5, y: 4250 }, { x: 4340.5, y: 4250 }] });
  assert.deepEqual(await snapshot('attached-room-early-small-preview-canceled'), clickBase, 'A small valid preview can be canceled without creating geometry or history');
  await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  const moved = assertVisible({ x: inaccurateAim.x, y: inaccurateAim.y - 500 });
  await page.mouse.move(press.x, press.y); await page.mouse.down(); await page.mouse.move(moved.x, moved.y); await settled();
  await page.mouse.move(press.x, press.y); await page.mouse.up();
  assert.deepEqual(await snapshot('attached-room-return-to-press'), clickBase, 'Returning to the raw press before release discards the room preview');
  await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push({ name: 'attached-room-click-and-small-preview', inaccurateStationaryClickClean: true, earlySmallPreviewVisible: true,
    earlyPreviewCancelClean: true, returnToRawPressClean: true });

  // Straight drags have one zero sizing component. They must still create a
  // usable square room with its base centered exactly on the same doorway.
  const naturalCases = [
    { name: 'ship-room-straight-outward', document: createDocument(), center: shipCenter, end: { x: 4110.5, y: 2700 }, label: 'DOOR', kind: 'door center',
      bounds: { left: 3110.5, right: 5110.5, top: 2700, bottom: 4700 } },
    { name: 'ship-room-tangent-only', document: createDocument(), center: shipCenter, end: { x: 5510.5, y: 4700 }, label: 'DOOR', kind: 'door center',
      bounds: { left: 2710.5, right: 5510.5, top: 1900, bottom: 4700 } },
    { name: 'corridor-room-straight-outward', document: structuredClone(corridorFixture), center: mouth, end: { x: 4110.5, y: 1900 }, label: 'END', kind: 'corridor end',
      bounds: { left: 3310.5, right: 4910.5, top: 1900, bottom: 3500 } },
    { name: 'wall-room-straight-outward', document: structuredClone(wall), center: wallCenter, end: { x: 5013, y: 2913 }, label: 'CENTER', kind: 'wall midpoint',
      bounds: { left: 2413, right: 5013, top: 1613, bottom: 4213 } },
    { name: 'door-room-straight-outward', document: structuredClone(withDoor), center: doorCenter, end: { x: 4013, y: 1947 }, label: 'DOOR', kind: 'door center', existingDoor: true,
      bounds: { left: 2413, right: 4013, top: 1147, bottom: 2747 } },
  ];
  const tangentWall = createDocument(); addWall(tangentWall, { x: 4013, y: 1113 }, { x: 4013, y: 4713 }, { joinTolerance: 0 });
  naturalCases.push({ name: 'wall-room-tangent-only', document: tangentWall, center: { x: 4013, y: 2913 }, end: { x: 4013, y: 4313 }, label: 'CENTER', kind: 'wall midpoint',
    bounds: { left: 1213, right: 4013, top: 1513, bottom: 4313 } });
  for (const natural of naturalCases) {
    const before = await fixture(natural.name, natural.document, 'room');
    await drag(natural.name, { aim: natural.center, end: natural.end, center: natural.center, label: natural.label, kind: natural.kind });
    const after = await snapshot(`${natural.name}-placed`);
    attachedRoom(natural.name, before, after, natural.center, natural.bounds, { existingDoor: natural.existingDoor });
    await history(natural.name, before, after);
  }

  const chamferOutline = (bounds, rotated = false) => {
    const { left, right, top, bottom } = bounds, chamfer = 220;
    const points = [{ x: left + chamfer, y: top }, { x: right - chamfer, y: top }, { x: right, y: top + chamfer }, { x: right, y: bottom - chamfer },
      { x: right - chamfer, y: bottom }, { x: left + chamfer, y: bottom }, { x: left, y: bottom - chamfer }, { x: left, y: top + chamfer }];
    if (!rotated) return points;
    const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
    return points.map(point => ({ x: center.x + ((point.x - center.x) - (point.y - center.y)) * Math.SQRT1_2,
      y: center.y + ((point.x - center.x) + (point.y - center.y)) * Math.SQRT1_2 }));
  };
  const expectPreview = async (name, points) => {
    await settled();
    const draws = await page.evaluate(() => window.__revolaConnectionDraws.paths);
    for (const point of points) assert.ok(draws.some(draw => draw.color === '#b5e8c6' && draw.points?.some(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-6)),
      `${name}: the actual green Canvas preview contains the independently specified corner (${point.x},${point.y})`);
    await expect(page.locator('#status-message')).not.toHaveClass(/error/);
    await screenshot(name);
  };
  const freeBounds = { left: 2000, right: 3100, top: 1200, bottom: 1800 };
  const freeSquareBounds = { left: 2000, right: 3100, top: 1200, bottom: 2300 };
  for (const rotated of [false, true]) {
    const name = `shift-free-room-${rotated ? 'rotated' : 'axis'}`, before = await fixture(name, createDocument(), 'room');
    await page.locator('#rotate-room').uncheck();
    // Preserve the existing Shift+R rotation shortcut while adding Shift's
    // independent drawing modifier. The keyboard toggles the real UI control.
    await page.keyboard.press('Shift+r'); await expect(page.locator('#rotate-room')).toBeChecked();
    await page.keyboard.press('Shift+r'); await expect(page.locator('#rotate-room')).not.toBeChecked();
    if (rotated) { await page.keyboard.press('Shift+r'); await expect(page.locator('#rotate-room')).toBeChecked(); }
    const a = assertVisible({ x: 2000, y: 1200 }), b = assertVisible({ x: 3100, y: 1800 });
    await page.mouse.move(a.x, a.y); await page.keyboard.down('Shift'); await resetDraws();
    await page.mouse.down(); await page.mouse.move(b.x, b.y);
    await expectPreview(`${name}-held-before-press`, chamferOutline(freeSquareBounds, rotated));
    // No pointer movement accompanies these keyboard transitions. This checks
    // immediate preview recomputation from the original rectangular drag aim.
    await resetDraws(); await page.keyboard.up('Shift');
    await expectPreview(`${name}-shift-released`, chamferOutline(freeBounds, rotated));
    await resetDraws(); await page.keyboard.down('Shift');
    await expectPreview(`${name}-shift-pressed`, chamferOutline(freeSquareBounds, rotated));
    await page.mouse.up(); await expect(page.locator('#status-message')).toContainText('Room placed'); await page.keyboard.up('Shift');
    const after = await snapshot(`${name}-placed`), expectedPoints = chamferOutline(freeSquareBounds, rotated);
    sameBase(before, after); assert.equal(after.edges.length, 8); assert.equal(after.vertices.length, 8); assert.equal(cuts(after).length, 0);
    for (const point of expectedPoints) assert.ok(after.vertices.some(vertex => Math.hypot(vertex.x - point.x, vertex.y - point.y) < 1e-6), 'The saved free room is exactly the previewed 1100 px square, including optional 45° rotation');
    await history(name, before, after); await screenshot(`${name}-placed`);
    evidence.interactions.push({ name, squareSide: 1100, rotated, heldBeforePress: true, keyTransitionsAtStationaryPointer: true,
      releasedWithShiftHeld: true, shiftRShortcutPreserved: true, oneStepUndoRedo: true });
  }
  await page.locator('#rotate-room').uncheck();
  const shiftAttachments = [
    { name: 'shift-ship-door-room', document: createDocument(), center: shipCenter, end: { x: 5510.5, y: 2700 }, label: 'DOOR', kind: 'door center',
      rectangle: { left: 2710.5, right: 5510.5, top: 2700, bottom: 4700 }, square: { left: 2710.5, right: 5510.5, top: 1900, bottom: 4700 } },
    { name: 'shift-corridor-end-room', document: structuredClone(corridorFixture), center: mouth, end: { x: 5310.5, y: 1900 }, label: 'END', kind: 'corridor end',
      rectangle: { left: 2910.5, right: 5310.5, top: 1900, bottom: 3500 }, square: { left: 2910.5, right: 5310.5, top: 1100, bottom: 3500 } },
    { name: 'shift-wall-center-room', document: structuredClone(wall), center: wallCenter, end: { x: 5013, y: 4313 }, label: 'CENTER', kind: 'wall midpoint',
      rectangle: { left: 2413, right: 5013, top: 1513, bottom: 4313 }, square: { left: 2413, right: 5213, top: 1513, bottom: 4313 } },
    { name: 'shift-existing-door-room', document: structuredClone(withDoor), center: doorCenter, end: { x: 4013, y: 2547 }, label: 'DOOR', kind: 'door center', existingDoor: true,
      rectangle: { left: 2413, right: 4013, top: 1347, bottom: 2547 }, square: { left: 2413, right: 4013, top: 1147, bottom: 2747 } },
  ];
  for (const attachment of shiftAttachments) {
    const before = await fixture(attachment.name, attachment.document, 'room');
    const a = assertVisible(attachment.center), b = assertVisible(attachment.end);
    await page.mouse.move(a.x, a.y); await marker(attachment.center, attachment.label); await page.keyboard.down('Shift'); await resetDraws();
    await page.mouse.down(); await expect(page.locator('#status-message')).toContainText(`Room start aligned to the ${attachment.kind}`); await page.mouse.move(b.x, b.y);
    await expectPreview(`${attachment.name}-held-before-press`, chamferOutline(attachment.square));
    await resetDraws(); await page.keyboard.up('Shift');
    await expectPreview(`${attachment.name}-shift-released`, chamferOutline(attachment.rectangle));
    await resetDraws(); await page.keyboard.down('Shift');
    await expectPreview(`${attachment.name}-shift-pressed`, chamferOutline(attachment.square));
    await marker(attachment.center, attachment.label);
    await page.mouse.up(); await expect(page.locator('#status-message')).toContainText('Room placed'); await page.keyboard.up('Shift');
    const after = await snapshot(`${attachment.name}-placed`);
    attachedRoom(attachment.name, before, after, attachment.center, attachment.square, { existingDoor: attachment.existingDoor });
    close(attachment.square.right - attachment.square.left, attachment.square.bottom - attachment.square.top, 'Attached Shift room has equal sides');
    await history(attachment.name, before, after); await screenshot(`${attachment.name}-placed`);
    evidence.interactions.push({ name: attachment.name, heldBeforePress: true, keyTransitionsAtStationaryPointer: true, releasedWithShiftHeld: true,
      exactDoorAndBaseCenterPreserved: true, oneStepUndoRedo: true });
  }

  // Keep the high-zoom 25 px fixtures close enough to the fixed hull that both
  // rails and actual ship pixels fit compact displays. The original y1947 door
  // and its upper rail y1657 are physically too far from hull y5390 at16% zoom.
  const nearbyDoor = createDocument(); addWall(nearbyDoor, { x: 2413, y: 2600 }, { x: 2413, y: 4600 }, { joinTolerance: 0 });
  addDoor(nearbyDoor, nearbyDoor.edges[0].id, { x: 2413, y: 3500 }, { centerTolerance: 0 });
  const shortCorridors = [
    { name: 'one-grid-step-free-corridor', document: createDocument(), center: { x: 3100, y: 3600 }, aim: { x: 3100, y: 3600 }, end: { x: 3125, y: 3600 }, direction: { x: 1, y: 0 }, length: 25, zoom: .15 },
    { name: 'short-free-corridor', document: createDocument(), center: { x: 3100, y: 2600 }, aim: { x: 3103, y: 2603 }, end: { x: 3200, y: 2600 }, direction: { x: 1, y: 0 }, length: 100 },
    { name: 'short-door-corridor', document: structuredClone(withDoor), center: doorCenter, aim: { x: 2435, y: 2070 }, release: { x: 2560, y: 2070 }, end: { x: 2538, y: 1947 }, direction: { x: 1, y: 0 }, length: 125, label: 'DOOR', kind: 'door center', hostWall: true },
    { name: 'short-end-corridor', document: structuredClone(corridorFixture), center: mouth, aim: { x: 4130.5, y: 3514 }, release: { x: 4130.5, y: 3439 }, end: { x: 4110.5, y: 3425 }, direction: { x: 0, y: -1 }, length: 75, label: 'END', kind: 'corridor end' },
    { name: 'offset-door-one-grid-step-corridor', document: nearbyDoor, center: { x: 2413, y: 3500 }, aim: { x: 2413, y: 3680 }, release: { x: 2438, y: 3680 }, end: { x: 2438, y: 3500 },
      direction: { x: 1, y: 0 }, length: 25, zoom: .16, label: 'DOOR', kind: 'door center', hostWall: true },
    { name: 'offset-ship-door-short-corridor', document: createDocument(), center: shipCenter, aim: { x: 4210.5, y: 4700 }, release: { x: 4210.5, y: 4650 }, end: { x: 4110.5, y: 4650 },
      direction: { x: 0, y: -1 }, length: 50, zoom: .15, label: 'DOOR', kind: 'door center' },
    { name: 'offset-ship-raw-release-at-anchor', document: createDocument(), center: shipCenter, aim: { x: 4110.5, y: 4750 }, release: { x: 4110.5, y: 4700 }, end: { x: 4110.5, y: 4650 },
      direction: { x: 0, y: -1 }, length: 50, zoom: .15, steps: 1, label: 'DOOR', kind: 'door center' },
  ];
  for (const short of shortCorridors) {
    const before = await fixture(short.name, short.document, 'corridor');
    const normal = { x: -short.direction.y, y: short.direction.x };
    const rails = [-1, 1].map(sign => ({ a: { x: short.center.x + normal.x * 290 * sign, y: short.center.y + normal.y * 290 * sign },
      b: { x: short.end.x + normal.x * 290 * sign, y: short.end.y + normal.y * 290 * sign } }));
    if (short.zoom) {
      // A 25 px map-space drag must exceed the intentional three-screen-pixel
      // threshold. Use the real wheel and middle-button pan, then recalibrate
      // the actual viewport. The crop includes a white band of the fixed hull.
      const focusPoints = [short.aim, short.release ?? short.end, ...rails.flatMap(rail => [rail.a, rail.b]), { x: 3300, y: 5390 }, { x: 4750, y: 5500 }];
      const focus = { left: Math.min(...focusPoints.map(point => point.x)), right: Math.max(...focusPoints.map(point => point.x)),
        top: Math.min(...focusPoints.map(point => point.y)), bottom: Math.max(...focusPoints.map(point => point.y)) };
      const inset = 20;
      assert.ok((focus.right - focus.left) * short.zoom <= view.width - 2 * inset && (focus.bottom - focus.top) * short.zoom <= view.height - 2 * inset,
        'The short fixture and visible hull band physically fit the actual canvas at the required zoom');
      const pivot = { x: view.x + view.width / 2, y: view.y + view.height / 2 }, scale = view.a / view.ratioX;
      await page.mouse.move(pivot.x, pivot.y); await page.mouse.wheel(0, -Math.log(short.zoom / scale) / .0015); await calibrate();
      const actualCenter = mapPoint({ x: (focus.left + focus.right) / 2, y: (focus.top + focus.bottom) / 2 });
      const desiredCenter = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
      await page.mouse.move(desiredCenter.x, desiredCenter.y); await page.mouse.down({ button: 'middle' });
      await page.mouse.move(desiredCenter.x + desiredCenter.x - actualCenter.x, desiredCenter.y + desiredCenter.y - actualCenter.y);
      await page.mouse.up({ button: 'middle' }); await calibrate();
      for (const point of focusPoints) assertVisible(point);
      evidence.fixtureViews.push({ fixture: short.name, width: view.width, height: view.height, requiredZoom: short.zoom, actualScale: view.a / view.ratioX,
        focus, realWheelZoomAndMiddlePan: true });
    }
    // Resolved starts retain the exact center while the actual drag displacement
    // supplies its direction/length. A raw press far along a doorway must not
    // turn a small normal drag into a much longer diagonal corridor.
    const a = assertVisible(short.aim), b = assertVisible(short.release ?? short.end);
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) > 3, 'The short drag exceeds the real screen-space placement threshold');
    await page.mouse.move(a.x, a.y); if (short.label) await marker(short.center, short.label);
    await resetDraws(); await page.mouse.down();
    await expect(page.locator('#status-message')).toContainText(short.kind ? `Corridor start aligned to the ${short.kind}` : 'Drag a route');
    await page.mouse.move(b.x, b.y, { steps: short.steps ?? 5 });
    await expectPreview(`${short.name}-preview`, rails.flatMap(rail => [rail.a, rail.b]));
    await page.mouse.up(); await expect(page.locator('#status-message')).toContainText('Corridor placed');
    const after = await snapshot(`${short.name}-placed`), vertices = vertexMap(after); sameBase(before, after);
    assert.equal(cuts(after).length, cuts(before).length, 'A short corridor neither fills nor adds a door');
    for (const rail of rails) {
      const edges = after.edges.filter(edge => {
        const a = vertices.get(edge.a), b = vertices.get(edge.b);
        return (Math.hypot(a.x - rail.a.x, a.y - rail.a.y) < 1e-6 && Math.hypot(b.x - rail.b.x, b.y - rail.b.y) < 1e-6)
          || (Math.hypot(b.x - rail.a.x, b.y - rail.a.y) < 1e-6 && Math.hypot(a.x - rail.b.x, a.y - rail.b.y) < 1e-6);
      });
      assert.equal(edges.length, 1, 'Each short drag adds exactly one full-length boundary on each side');
      close(Math.hypot(rail.b.x - rail.a.x, rail.b.y - rail.a.y), short.length, 'The short corridor has its requested map-space length');
      const terminal = after.vertices.find(vertex => Math.hypot(vertex.x - rail.b.x, vertex.y - rail.b.y) < 1e-6);
      assert.equal(after.edges.filter(edge => edge.a === terminal.id || edge.b === terminal.id).length, 1, 'A short corridor end has no extra branch or terminal spur');
    }
    assert.equal(after.edges.length, short.hostWall ? 5 : before.edges.length + 2, 'Only the two rails and necessary host-wall splits are added');
    await history(short.name, before, after); await screenshot(`${short.name}-placed`);
    evidence.interactions.push({ name: short.name, length: short.length, width: 580, actualZoom: view.a / view.ratioX,
      screenDragPixels: Math.hypot(b.x - a.x, b.y - a.y), rawPress: short.aim, rawRelease: short.release ?? short.end,
      resolvedCenter: short.center, exactRails: rails, positivePreview: true, noExtraBranch: true, oneStepUndoRedo: true });
  }
  const shortClickBase = await fixture('short-corridor-click-protection', structuredClone(withDoor), 'corridor');
  const shortClickAim = assertVisible({ x: 2435, y: 2070 }), shortClickEnd = assertVisible({ x: 2560, y: 2070 });
  await page.mouse.move(shortClickAim.x, shortClickAim.y); await page.mouse.down(); await page.mouse.up();
  assert.deepEqual(await snapshot('short-corridor-click-only'), shortClickBase, 'An offset click attracted to a door cannot create an accidental short corridor');
  await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  await page.mouse.move(shortClickAim.x, shortClickAim.y); await page.mouse.down(); await page.mouse.move(shortClickEnd.x, shortClickEnd.y); await settled();
  await page.mouse.move(shortClickAim.x, shortClickAim.y); await page.mouse.up();
  assert.deepEqual(await snapshot('short-corridor-return-to-press'), shortClickBase, 'Returning to the raw corridor press before release discards the short preview');
  await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push({ name: 'short-corridor-click-protection', inaccurateStationaryClickClean: true, returnToRawPressClean: true });

  const blocked = createDocument(); addWall(blocked, { x: 5000, y: 1800 }, { x: 5000, y: 4900 }, { joinTolerance: 0 });
  const blockedBase = await fixture('blocked-attached-room', blocked, 'room');
  await drag('room-blocked-by-wall', { aim: { x: 4210.5, y: 4684 }, end: { x: 5510.5, y: 2700 }, center: { x: 4110.5, y: 4700 }, label: 'DOOR', kind: 'door center', rejected: true });
  assert.deepEqual(await snapshot('room-blocked-by-wall'), blockedBase, 'Rejected room leaves existing geometry and doorway unchanged');
  await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push({ name: 'room-blocked-by-wall', redPreview: true, errorStatus: true, graphHistoryAndDirtyUnchanged: true });

  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: destination('failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors); throw error;
} finally { await desktop.close(); }
