import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, validateDocument } from '../src/model.js';
import { shipPorts } from '../src/ship.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged') || process.env.PACKAGED === '1';
const prefix = packaged ? 'ship-port-packaged' : 'ship-port';
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const destination = name => path.join(artifacts, `${prefix}-${name}`);
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const matchingSourceFiles = ['index.html', 'src/app.js', 'src/model.js', 'src/ship.js', 'src/render.js', 'assets/ship.png'];
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
  for (const file of matchingSourceFiles) assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches current source`);
}

// Literal expectations come from the measured artwork corner centerlines,
// independently of the helper used by the editor and model pin guards.
const measuredPorts = [{ x: 3739.5, y: 4700 }, { x: 4481.5, y: 4700 }];
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, matchingSourceFiles: packaged ? matchingSourceFiles : [], measuredPorts, placements: [], interactions: [], raster: [], rendererErrors: errors };

try {
  await desktop.evaluate(({ dialog }) => {
    // Replace file choices only; native IPC, project validation and filesystem
    // reads/writes stay in use. This application instance is owned by this test.
    global.__revolaShipPorts = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaShipPorts.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaShipPorts.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  const canvas = page.locator('#map-canvas'); await expect(canvas).toBeVisible();
  if (packaged) assert.match((await page.evaluate(() => location.href)).toLowerCase(), /\/dist\/revolamapdrawer-win32-x64\/resources\/app(?:\.asar)?\/index\.html$/);
  await page.evaluate(() => {
    // Observe the actual dashed Wall preview sent to Canvas, leaving geometry,
    // event handlers, the renderer transform and all original methods intact.
    window.__revolaShipPortPreviews = [];
    const prototype = CanvasRenderingContext2D.prototype;
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke']) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        if (this.canvas.id === 'map-canvas') {
          if (method === 'beginPath') this.__revolaShipPortPath = [];
          if (method === 'moveTo' || method === 'lineTo') this.__revolaShipPortPath?.push({ x: args[0], y: args[1] });
          if (method === 'stroke' && this.strokeStyle === '#b5e8c6' && this.getLineDash().length) {
            window.__revolaShipPortPreviews.push(this.__revolaShipPortPath?.map(point => ({ ...point })));
          }
        }
        return original.apply(this, args);
      };
    }
  });
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let mapPoint, view;
  const calibrate = async () => {
    await settled();
    view = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect(), transform = element.getContext('2d').getTransform();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        ratioX: element.width / rect.width, ratioY: element.height / rect.height,
        a: transform.a, d: transform.d, e: transform.e, f: transform.f };
    });
    assert.ok(view.width > 300 && view.height > 300);
    mapPoint = (x, y) => ({ x: view.x + (x * view.a + view.e) / view.ratioX,
      y: view.y + (y * view.d + view.f) / view.ratioY });
  };
  const snapshot = async name => {
    const filePath = destination(`${name}.revola.json`); await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, target) => global.__revolaShipPorts.saves.push(target), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(stat => stat.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native project validates without normalization');
    return document;
  };
  const open = async (filePath, name) => {
    await desktop.evaluate((_electron, source) => global.__revolaShipPorts.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await page.locator('#fit-button').click(); await calibrate();
    await page.locator('[data-tool="wall"]').click();
    await expect(page.locator('#undo-button')).toBeDisabled();
    await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    // Real wheel input increases the visible wall thickness for precise pointer
    // placement and screenshot review. It changes the camera only.
    const pivot = mapPoint(4110.5, 4700), scale = view.a / view.ratioX;
    await page.mouse.move(pivot.x, pivot.y);
    await page.mouse.wheel(0, -Math.log(.35 / scale) / .0015); await calibrate();
  };
  const marker = async port => {
    await settled();
    const point = mapPoint(port.x, port.y);
    const colored = await canvas.evaluate((element, p) => {
      const rect = element.getBoundingClientRect(), ratioX = element.width / rect.width, ratioY = element.height / rect.height;
      const x = Math.round((p.x - rect.left) * ratioX), y = Math.round((p.y - rect.top) * ratioY);
      const pixels = element.getContext('2d').getImageData(x - 6, y - 6, 13, 13).data;
      let green = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] + 15 && pixels[i + 1] > pixels[i + 2] + 10) green++;
      return green;
    }, point);
    assert.ok(colored > 0, 'Blank-map handle is visible at the independently measured airlock corner');
  };
  const editorCrop = async name => {
    await page.mouse.move(view.x + view.width - 10, view.y + 10); await settled();
    const a = mapPoint(2850, 3820), b = mapPoint(5365, 5360);
    const left = Math.max(view.x, a.x), top = Math.max(view.y, a.y);
    const right = Math.min(view.x + view.width, b.x), bottom = Math.min(view.y + view.height, b.y);
    assert.ok(right > left && bottom > top);
    await page.screenshot({ path: destination(`${name}-editor.png`), clip: { x: left, y: top, width: right - left, height: bottom - top } });
  };
  const raster = async (name, document) => {
    const result = await page.evaluate(async document => {
      const { drawMap, loadShip } = await import('./src/render.js');
      const shipImage = await loadShip();
      // Use native map pixels, literal scan planes, and independent joint samples;
      // no target helper or editor overlay contributes to this image.
      const left = 2850, top = 3820, width = 2515, height = 1540;
      const surface = window.document.createElement('canvas'); surface.width = width; surface.height = height;
      const ctx = surface.getContext('2d', { willReadFrequently: true });
      ctx.translate(-left, -top); drawMap(ctx, document, { shipImage });
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const at = (x, y) => {
        const i = ((y - top) * width + x - left) * 4;
        return Array.from(pixels.slice(i, i + 4));
      };
      const joints = [3739.5, 4481.5].map(x => {
        const samples = [];
        for (let offset = -60; offset <= 60; offset++) {
          samples.push(at(Math.floor(x), 4700 + offset));
          samples.push(at(Math.floor(x + offset), 4700));
        }
        return { x, y: 4700, solid: samples.filter(pixel => pixel.every(value => value === 255)).length, count: samples.length };
      });
      const scans = [4700, 5308].map(worldY => {
        const occupied = []; let start = null;
        // Restrict the doorway scan to the independently measured chamber box;
        // the full preview also includes unrelated hull sides at the inner plane.
        for (let x = 3690; x <= 4531; x++) {
          const solid = x < 4531 && pixels[((worldY - top) * width + x - left) * 4 + 3] >= 128;
          if (solid && start === null) start = x;
          if (!solid && start !== null) { occupied.push([start, x]); start = null; }
        }
        return { y: worldY, occupied, gap: occupied.length === 2 ? occupied[1][0] - occupied[0][1] : null };
      });
      let nonwhite = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255)) nonwhite++;
      const preview = window.document.createElement('canvas'); preview.width = width; preview.height = height;
      const previewContext = preview.getContext('2d'); previewContext.fillStyle = 'black'; previewContext.fillRect(0, 0, width, height); previewContext.drawImage(surface, 0, 0);
      return { left, top, width, height, joints, scans, nonwhite, image: preview.toDataURL('image/png') };
    }, document);
    assert.equal(result.nonwhite, 0, 'Visible native wall/airlock pixels stay white');
    for (const joint of result.joints) assert.equal(joint.solid, joint.count, 'Both centerline continuations stay opaque white through the fixed airlock joint');
    for (const scan of result.scans) {
      assert.equal(scan.occupied.length, 2, 'Each measured door plane has exactly two solid wall spans');
      assert.equal(scan.gap, 375, 'Outer and inner door openings stay exactly 375 pixels wide');
      assert.deepEqual([scan.occupied[0][1], scan.occupied[1][0]], [3923, 4298], 'Door cuts retain independently measured endpoints');
    }
    await fs.writeFile(destination(`${name}-native.png`), Buffer.from(result.image.split(',')[1], 'base64'));
    delete result.image; evidence.raster.push({ name, ...result });
  };
  const checkGraph = (document, starts) => {
    assert.equal(document.edges.length, starts.length, 'Each mouse drag adds one wall');
    const vertices = new Map(document.vertices.map(vertex => [vertex.id, vertex]));
    for (const { port, end, direction } of starts) {
      const matching = document.edges.filter(edge => {
        const a = vertices.get(edge.a), b = vertices.get(edge.b);
        return (a.x === port.x && a.y === port.y && b.x === end.x && b.y === end.y) ||
          (b.x === port.x && b.y === port.y && a.x === end.x && a.y === end.y);
      });
      assert.equal(matching.length, 1, `Saved ${direction} wall begins at its measured raster corner without grid rounding`);
      const edge = matching[0], a = vertices.get(edge.a), b = vertices.get(edge.b);
      assert.equal(edge.doors.length, 0); assert.equal(edge.gaps.length, 0);
      if (direction === 'upward') assert.equal(a.x, b.x, 'Upward continuation is exactly collinear with the airlock upright');
      else assert.equal(a.y, b.y, 'Outward continuation is exactly collinear with the outer-door wall plane');
    }
    for (const port of measuredPorts) assert.equal(document.vertices.filter(vertex => vertex.x === port.x && vertex.y === port.y).length,
      starts.some(start => start.port.x === port.x) ? 1 : 0, 'Incident wall continuations reuse a single shared corner vertex');
  };
  const draw = async (aim, end, previewStart) => {
    const a = mapPoint(aim.x, aim.y), b = mapPoint(end.x, end.y);
    assert.ok(a.x >= view.x && b.x >= view.x && a.x <= view.x + view.width && b.x <= view.x + view.width);
    assert.ok(a.y >= view.y && b.y >= view.y && a.y <= view.y + view.height && b.y <= view.y + view.height);
    await page.evaluate(() => { window.__revolaShipPortPreviews.length = 0; });
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await settled();
    const previews = await page.evaluate(() => window.__revolaShipPortPreviews);
    assert.ok(previews.some(points => points?.length === 2 && points[0].x === previewStart.x && points[0].y === previewStart.y &&
      points[1].x === end.x && points[1].y === end.y), 'Actual dashed Wall preview retains the expected exact start and endpoint');
    await page.mouse.up(); await expect(page.locator('#status-message')).toContainText('Wall drawn');
  };

  for (const mirrored of [false, true]) {
    const name = mirrored ? 'mirrored' : 'normal';
    const blank = createDocument(); blank.name = `aligned-ship-ports-${name}`; blank.ship.mirrored = mirrored;
    assert.deepEqual(shipPorts(blank.ship), measuredPorts, 'Both ship facings expose the same measured corners in left/right order');
    const fixturePath = destination(`${name}-fixture.revola.json`); await fs.writeFile(fixturePath, JSON.stringify(blank, null, 2));
    await open(fixturePath, blank.name); assert.deepEqual(await snapshot(`${name}-opened`), blank);
    for (const port of measuredPorts) await marker(port);
    await editorCrop(`${name}-blank`);
    let previous = blank; const starts = [];
    for (const direction of ['upward', 'outward']) for (const [index, port] of measuredPorts.entries()) {
      const side = index ? 'right' : 'left', caseName = `${name}-${side}-${direction}`;
      const end = direction === 'upward' ? { x: port.x, y: 3900 } : { x: port.x + (index ? 800 : -800), y: port.y };
      // Slight pointer inaccuracy must still retain the exact fractional pin.
      const aim = { x: port.x + 3, y: port.y + 7 };
      await draw(aim, end, port);
      const after = await snapshot(`${caseName}-placed`); starts.push({ port, end, direction }); checkGraph(after, starts);
      assert.deepEqual(after.ship, blank.ship, 'Drawing never changes the fixed ship anchor or facing');
      assert.deepEqual([after.width, after.height, after.originX, after.originY], [8192, 8192, 0, 0], 'Corrected attachment keeps the default map geometry and scale');
      await page.locator('#undo-button').click();
      assert.deepEqual(await snapshot(`${caseName}-undone`), previous, 'One undo restores the exact pre-wall graph and IDs');
      await page.locator('#redo-button').click();
      assert.deepEqual(await snapshot(`${caseName}-redone`), after, 'One redo restores the exact fractional attachment and shared topology');
      evidence.placements.push({ name: caseName, aim, port, end, oneStepUndoRedo: true }); previous = after;
    }
    const drawn = await snapshot(`${name}-drawn`); checkGraph(drawn, starts);
    await editorCrop(`${name}-drawn`); await raster(`${name}-drawn`, drawn);
    await page.locator('#mirror-button').click();
    await expect(page.locator('#mirror-label')).toHaveText(mirrored ? 'Ship facing right' : 'Ship facing left');
    const expectedFlip = structuredClone(drawn); expectedFlip.ship.mirrored = !mirrored;
    const flipped = await snapshot(`${name}-flipped`);
    assert.deepEqual(flipped, expectedFlip, 'Facing toggle changes only mirror state after the corner walls are drawn');
    await editorCrop(`${name}-flipped`); await raster(`${name}-flipped`, flipped);
    await page.locator('#undo-button').click(); assert.deepEqual(await snapshot(`${name}-flip-undone`), drawn, 'Facing undo retains exact connected geometry');
    await page.locator('#redo-button').click(); assert.deepEqual(await snapshot(`${name}-flip-redone`), flipped, 'Facing redo retains exact connected geometry');
    await open(fixturePath, blank.name);
    await open(destination(`${name}-flipped.revola.json`), blank.name);
    assert.deepEqual(await snapshot(`${name}-reopened`), flipped, 'Native save/reopen retains both pinned corners, shared walls and facing exactly');
    await editorCrop(`${name}-reopened`); await raster(`${name}-reopened`, flipped);
    evidence.interactions.push({ name, fromMirrored: mirrored, toMirrored: !mirrored, walls: 4, geometryUnchangedByFacing: true, facingUndoRedoExact: true, nativeReopenExact: true });

    // Older saved geometry is exact: its occupied legacy pin remains usable,
    // while aiming at the nearby corrected handle must not migrate to that pin.
    const legacy = createDocument(); legacy.name = `legacy-and-corrected-ship-ports-${name}`; legacy.ship.mirrored = mirrored;
    const legacyPort = { x: 4452.5, y: 4740 }, legacyEnd = { x: 4452.5, y: 3940 };
    addWall(legacy, legacyPort, { x: 5252.5, y: 4740 }, { joinTolerance: 0 });
    const legacyFixture = destination(`${name}-legacy-fixture.revola.json`); await fs.writeFile(legacyFixture, JSON.stringify(legacy, null, 2));
    await open(legacyFixture, legacy.name);
    assert.deepEqual(await snapshot(`${name}-legacy-opened`), legacy, 'Opening preserves legacy wall coordinates exactly');
    await draw(legacyPort, legacyEnd, legacyPort);
    const continuedLegacy = await snapshot(`${name}-legacy-continued`);
    const legacyCorner = continuedLegacy.vertices.find(vertex => vertex.x === legacyPort.x && vertex.y === legacyPort.y);
    const legacyTip = continuedLegacy.vertices.find(vertex => vertex.x === legacyEnd.x && vertex.y === legacyEnd.y);
    assert.ok(legacyCorner && legacyTip);
    assert.ok(continuedLegacy.edges.some(edge => [edge.a, edge.b].includes(legacyCorner.id) && [edge.a, edge.b].includes(legacyTip.id)),
      'Commit retains the exact legacy pin shown in the actual preview');
    const corrected = measuredPorts[1], correctedEnd = { x: corrected.x, y: 3900 };
    await draw(corrected, correctedEnd, corrected);
    const mixed = await snapshot(`${name}-legacy-and-corrected`);
    assert.ok(mixed.vertices.some(vertex => vertex.x === corrected.x && vertex.y === corrected.y), 'Corrected handle stays at the measured corner near the occupied legacy pin');
    assert.ok(mixed.vertices.some(vertex => vertex.x === correctedEnd.x && vertex.y === correctedEnd.y), 'Corrected upward continuation retains its exact centerline');
    await page.locator('#undo-button').click(); assert.deepEqual(await snapshot(`${name}-corrected-near-legacy-undone`), continuedLegacy);
    await page.locator('#redo-button').click(); assert.deepEqual(await snapshot(`${name}-corrected-near-legacy-redone`), mixed);
    await open(destination(`${name}-legacy-and-corrected.revola.json`), legacy.name);
    assert.deepEqual(await snapshot(`${name}-mixed-reopened`), mixed, 'Native reopen preserves legacy and corrected attachment coordinates without migration');
    evidence.interactions.push({ name: `${name}-legacy-compatibility`, legacyPort, correctedPort: corrected,
      actualPreviewMatchesCommit: true, correctedStartRetainedNearLegacyPin: true, oneStepUndoRedo: true, nativeReopenExact: true });
  }
  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: destination('failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors); throw error;
} finally { await desktop.close(); }
