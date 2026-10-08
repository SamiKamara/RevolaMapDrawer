import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, addCorridor, validateDocument } from '../src/model.js';
import { resolveCorridorStart } from '../src/corridors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged') || process.env.PACKAGED === '1';
const prefix = packaged ? 'airlock-packaged' : 'airlock';
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const destination = name => path.join(artifacts, `${prefix}-${name}`);
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const matchingSourceFiles = ['index.html', 'src/app.js', 'src/corridors.js', 'src/model.js', 'src/ship.js', 'src/render.js', 'assets/ship.png'];
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
  for (const file of matchingSourceFiles) assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches current source`);
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, matchingSourceFiles: packaged ? matchingSourceFiles : [], raster: [], placements: [], interactions: [], rendererErrors: errors };

try {
  await desktop.evaluate(({ dialog }) => {
    // Stub file choices only. Production preload, IPC, validation and native
    // filesystem writes remain in use for every saved/reopened project.
    global.__revolaAirlock = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaAirlock.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaAirlock.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  const canvas = page.locator('#map-canvas'); await expect(canvas).toBeVisible();
  if (packaged) assert.match((await page.evaluate(() => location.href)).toLowerCase(), /\/dist\/revolamapdrawer-win32-x64\/resources\/app(?:\.asar)?\/index\.html$/);
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    // Observe the text actually drawn by the editor without modifying its
    // geometry, gesture handlers, target resolver or history.
    window.__revolaAirlockLabels = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      if (this.canvas.id === 'map-canvas') window.__revolaAirlockLabels.push(String(args[0]));
      return original.apply(this, args);
    };
  });
  let mapPoint;
  const calibrate = async () => {
    await settled();
    const state = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect(), transform = element.getContext('2d').getTransform();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        ratioX: element.width / rect.width, ratioY: element.height / rect.height,
        a: transform.a, d: transform.d, e: transform.e, f: transform.f };
    });
    assert.ok(state.width > 300 && state.height > 300);
    mapPoint = (x, y) => ({ x: state.x + (x * state.a + state.e) / state.ratioX,
      y: state.y + (y * state.d + state.f) / state.ratioY });
  };
  const snapshot = async (name, { programmatic = false } = {}) => {
    const filePath = destination(`${name}.revola.json`); await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, target) => global.__revolaAirlock.saves.push(target), filePath);
    if (programmatic) await page.locator('#project-button').evaluate(button => button.click());
    else await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(stat => stat.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native project validates without normalization');
    return document;
  };
  const open = async (filePath, name) => {
    await desktop.evaluate((_electron, source) => global.__revolaAirlock.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await page.locator('#fit-button').click(); await calibrate();
    await page.locator('[data-tool="corridor"]').click();
    await expect(page.locator('#undo-button')).toBeDisabled();
    await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  };
  const marker = async point => {
    await settled();
    const result = await canvas.evaluate((element, p) => {
      const rect = element.getBoundingClientRect(), scale = element.width / rect.width;
      const cx = Math.round((p.x - rect.left) * scale), cy = Math.round((p.y - rect.top) * scale);
      const pixels = element.getContext('2d').getImageData(cx - 7, cy - 7, 15, 15).data;
      let green = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] + 20 && pixels[i + 1] > pixels[i + 2] + 20) green++;
      return { green, label: window.__revolaAirlockLabels.includes('DOOR') };
    }, mapPoint(point.x, point.y));
    assert.ok(result.green > 0, 'Editor draws a green marker at the exact outer doorway center');
    assert.equal(result.label, true, 'Editor actually draws the DOOR label');
    return result;
  };
  const raster = async (name, ship) => {
    const result = await page.evaluate(async ship => {
      const { drawMap, loadShip } = await import('./src/render.js');
      const shipImage = await loadShip();
      // Literal correction bounds and door scan planes are independent of the
      // attraction helper. The measured 29 px correction mirrors around the
      // doorway center (4110.5), retaining the same chamber in both facings.
      const left = 3690, top = 4670, width = 841, height = 685;
      const surface = document.createElement('canvas'); surface.width = width; surface.height = height;
      const ctx = surface.getContext('2d', { willReadFrequently: true });
      ctx.translate(-left, -top); drawMap(ctx, { ship, vertices: [], edges: [] }, { shipImage });
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let visible = 0, nonwhite = 0, asymmetry = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, opposite = (y * width + width - 1 - x) * 4;
        if (pixels[i + 3]) { visible++; if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) nonwhite++; }
        if (pixels[i + 3] !== pixels[opposite + 3]) asymmetry++;
      }
      const scans = [4700, 5000, 5308].map(worldY => {
        const occupied = []; let start = null;
        for (let x = 0; x <= width; x++) {
          const solid = x < width && pixels[((worldY - top) * width + x) * 4 + 3] >= 128;
          if (solid && start === null) start = x;
          if (!solid && start !== null) { occupied.push([left + start, left + x]); start = null; }
        }
        return { y: worldY, occupied, gap: occupied.length === 2 ? occupied[1][0] - occupied[0][1] : null };
      });
      const preview = document.createElement('canvas'); preview.width = width; preview.height = height;
      const previewContext = preview.getContext('2d'); previewContext.fillStyle = 'black'; previewContext.fillRect(0, 0, width, height); previewContext.drawImage(surface, 0, 0);
      return { left, top, width, height, visible, nonwhite, asymmetry, scans, image: preview.toDataURL('image/png') };
    }, ship);
    assert.ok(result.visible > 0); assert.equal(result.nonwhite, 0, 'Visible airlock pixels remain white');
    assert.equal(result.asymmetry, 0, 'The entire corrected chamber is pixel-symmetric in both mirror orientations');
    for (const scan of [result.scans[0], result.scans[2]]) {
      assert.equal(scan.occupied.length, 2); assert.equal(scan.gap, 375, 'Both airlock doors remain exactly 375 raster pixels wide');
      assert.deepEqual([scan.occupied[0][1], scan.occupied[1][0]], [3923, 4298], 'Both facings retain the independently measured door cut endpoints');
      assert.equal((scan.occupied[0][1] + scan.occupied[1][0]) / 2, 4110.5, 'Both door pivots stay at the same exact world center');
    }
    await fs.writeFile(destination(`${name}-airlock.png`), Buffer.from(result.image.split(',')[1], 'base64'));
    delete result.image; evidence.raster.push({ name, ...result });
  };
  const geometry = (before, after, center, name) => {
    assert.equal(after.edges.length, 2, 'Straight outward corridor consists of two rails');
    const rails = after.edges.map(edge => {
      const a = after.vertices.find(vertex => vertex.id === edge.a), b = after.vertices.find(vertex => vertex.id === edge.b);
      assert.ok(Math.abs(a.x - b.x) < 1e-6, 'Each outward rail remains exactly vertical');
      assert.equal(edge.doors.length, 0); assert.equal(edge.gaps.length, 0);
      return a.y > b.y ? { start: a, end: b } : { start: b, end: a };
    }).sort((a, b) => a.start.x - b.start.x);
    assert.equal(rails[0].start.y, 4700); assert.equal(rails[1].start.y, 4700);
    assert.equal(rails[0].start.x, center.x - 290); assert.equal(rails[1].start.x, center.x + 290);
    assert.equal(rails[1].start.x - rails[0].start.x, 580, 'Corridor wall centers stay exactly 580 px apart');
    assert.equal((rails[0].start.x + rails[1].start.x) / 2, center.x, 'Fractional outer door center survives grid snapping and commit');
    assert.ok(rails.every(rail => rail.start.y - rail.end.y > 1800));
    assert.deepEqual(after.ship, before.ship, 'Corridor placement preserves the prefab anchor and mirror state');
    assert.equal(after.width, before.width); assert.equal(after.height, before.height);
    assert.equal(after.originX, before.originX); assert.equal(after.originY, before.originY);
    evidence.placements.push({ name, center, corridorWidth: 580, rails });
  };

  for (const mirrored of [false, true]) {
    const name = mirrored ? 'mirrored' : 'normal';
    const before = createDocument(); before.name = `outer-airlock-${name}`; before.ship.mirrored = mirrored;
    const fixturePath = destination(`${name}-fixture.revola.json`); await fs.writeFile(fixturePath, JSON.stringify(before, null, 2));
    await open(fixturePath, before.name); assert.deepEqual(await snapshot(`${name}-opened`), before);
    const center = { x: 4110.5, y: 4700 };
    const aim = { x: center.x + 123, y: center.y - 22 }, end = { x: center.x, y: 2500 };
    const pureTarget = resolveCorridorStart(before, aim, { wallTolerance: 75 });
    assert.equal(pureTarget?.kind, 'door'); assert.equal(pureTarget?.source, 'ship'); assert.equal(pureTarget?.doorId, 'ship-outer-door');
    assert.deepEqual(pureTarget.point, center); assert.deepEqual(pureTarget.direction, { x: 1, y: 0 });
    await raster(name, before.ship);
    await page.evaluate(() => { window.__revolaAirlockLabels.length = 0; });
    const a = mapPoint(aim.x, aim.y), b = mapPoint(end.x, end.y);
    await page.mouse.move(a.x, a.y); const hover = await marker(center);
    await page.screenshot({ path: destination(`${name}-hover.png`) });
    await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    await page.mouse.down(); await expect(page.locator('#status-message')).toContainText('door center');
    await page.mouse.move(b.x, b.y, { steps: 10 }); await marker(center);
    await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    assert.deepEqual(await snapshot(`${name}-preview`, { programmatic: true }), before, 'Live route preview leaves exact saved document unchanged');
    await page.screenshot({ path: destination(`${name}-preview.png`) });
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await snapshot(`${name}-canceled`), before, 'Escape cancels without altering geometry or prefab');
    await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Corridor placed from the door center');
    await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
    const after = await snapshot(`${name}-placed`); geometry(before, after, center, name);
    await page.locator('#undo-button').click(); assert.deepEqual(await snapshot(`${name}-undone`), before, 'One undo restores exact empty map');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click(); assert.deepEqual(await snapshot(`${name}-redone`), after, 'One redo restores exact fractional rails and IDs');

    // Reproduce the reported order: draw from the doorway first, then change
    // ship facing. Exact graph comparison detects any rail translation or pin
    // mutation; native raster scans independently check both door centers.
    await page.locator('#mirror-button').click();
    await expect(page.locator('#mirror-label')).toHaveText(mirrored ? 'Ship facing right' : 'Ship facing left');
    await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
    const flippedExpected = structuredClone(after); flippedExpected.ship.mirrored = !mirrored;
    const flipped = await snapshot(`${name}-flipped`);
    assert.deepEqual(flipped, flippedExpected, 'Facing toggle changes only mirror state after the corridor was drawn');
    assert.deepEqual(flipped.ship, { ...before.ship, mirrored: !mirrored }, 'Legacy anchor stays exactly (4096,4740)');
    assert.deepEqual(resolveCorridorStart(flipped, aim, { wallTolerance: 75 })?.point, center, 'Target remains centered between the existing rails after facing changes');
    await raster(`${name}-flipped`, flipped.ship);
    await page.evaluate(() => { window.__revolaAirlockLabels.length = 0; });
    await page.mouse.move(a.x, a.y); const flippedHover = await marker(center);
    await page.screenshot({ path: destination(`${name}-flipped-editor.png`) });
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-flip-undone`), after, 'One undo restores the prior facing with exact rails');
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-flip-and-corridor-undone`), before, 'A second undo removes only the corridor');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-corridor-redone`), after, 'First redo restores exact original corridor');
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-flip-redone`), flipped, 'Second redo changes facing without moving doorway or corridor');
    await open(fixturePath, before.name);
    await open(destination(`${name}-flipped.revola.json`), before.name);
    assert.deepEqual(await snapshot(`${name}-flip-reopened`), flipped, 'Native save/reopen retains flipped ship and exact pre-existing corridor');
    await raster(`${name}-flip-reopened`, flipped.ship);
    await page.mouse.move(mapPoint(aim.x, aim.y).x, mapPoint(aim.x, aim.y).y); await marker(center);
    evidence.interactions.push({ name: `${name}-flip-after-drawing`, fromMirrored: mirrored, toMirrored: !mirrored,
      exactCenter: center, flippedHover, graphAndAnchorUnchanged: true, separateCorridorAndMirrorUndoRedo: true, nativeReopenExact: true });

    await open(fixturePath, before.name);
    await open(destination(`${name}-placed.revola.json`), before.name);
    assert.deepEqual(await snapshot(`${name}-reopened`), after, 'Native save/reopen preserves exact outward corridor, anchor and bounds');
    await raster(`${name}-reopened`, after.ship);
    evidence.interactions.push({ name, hover, aim, exactCenter: center, previewUnchanged: true, cancellationUnchanged: true, oneStepUndoRedo: true, nativeReopenExact: true });

    const arrivalBefore = createDocument(); arrivalBefore.name = `arriving-airlock-${name}`; arrivalBefore.ship.mirrored = mirrored;
    const start = { x: center.x, y: 2500 };
    addWall(arrivalBefore, { x: center.x - 1200, y: 2500 }, { x: center.x + 1200, y: 2500 }, { joinTolerance: 0 });
    const arrivalFixture = destination(`${name}-arrival-fixture.revola.json`);
    await fs.writeFile(arrivalFixture, JSON.stringify(arrivalBefore, null, 2)); await open(arrivalFixture, arrivalBefore.name);
    const arrivalStart = mapPoint(center.x + 20, 2520), arrivalAim = mapPoint(center.x + 123, 4678);
    await page.mouse.move(arrivalStart.x, arrivalStart.y); await page.mouse.down();
    await expect(page.locator('#status-message')).toContainText('wall midpoint');
    await page.mouse.move(arrivalAim.x, arrivalAim.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('Corridor endpoint aligned to the door center');
    await expect(page.locator('#status-message')).toContainText('Release to place');
    await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    assert.deepEqual(await snapshot(`${name}-arrival-preview`, { programmatic: true }), arrivalBefore, 'Arrival preview preserves exact original wall and ship');
    await page.screenshot({ path: destination(`${name}-arrival-preview.png`) });
    await page.mouse.up(); await expect(page.locator('#status-message')).toContainText('Corridor endpoint aligned to the door center');
    const arrivalAfter = await snapshot(`${name}-arrived`), arrivalExpected = structuredClone(arrivalBefore);
    // Expected start/end come from literal independently measured coordinates;
    // use insertion only for stable subdivision IDs, never the target fitter.
    addCorridor(arrivalExpected, [start, center]);
    assert.deepEqual(arrivalAfter, arrivalExpected, 'Arrival commits the independently expected exact start and outer door endpoint');
    const arrivalRails = arrivalAfter.edges.filter(edge => {
      const a = arrivalAfter.vertices.find(vertex => vertex.id === edge.a), b = arrivalAfter.vertices.find(vertex => vertex.id === edge.b);
      return Math.abs(a.x - b.x) < 1e-6;
    }).map(edge => {
      const points = [edge.a, edge.b].map(id => arrivalAfter.vertices.find(vertex => vertex.id === id)).sort((a, b) => b.y - a.y);
      return { end: points[0], start: points[1] };
    }).sort((a, b) => a.end.x - b.end.x);
    assert.equal(arrivalRails.length, 2);
    assert.equal(arrivalRails[0].end.x, center.x - 290); assert.equal(arrivalRails[1].end.x, center.x + 290);
    assert.equal(arrivalRails[0].end.y, 4700); assert.equal(arrivalRails[1].end.y, 4700);
    assert.equal(arrivalRails[1].end.x - arrivalRails[0].end.x, 580);
    assert.deepEqual(arrivalAfter.ship, arrivalBefore.ship);
    await page.locator('#undo-button').click(); assert.deepEqual(await snapshot(`${name}-arrival-undone`), arrivalBefore);
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click(); assert.deepEqual(await snapshot(`${name}-arrival-redone`), arrivalAfter);
    await open(destination(`${name}-arrived.revola.json`), arrivalBefore.name);
    assert.deepEqual(await snapshot(`${name}-arrival-reopened`), arrivalAfter);
    evidence.placements.push({ name: `${name}-arrival`, start, end: center, corridorWidth: 580, rails: arrivalRails });
    evidence.interactions.push({ name: `${name}-arrival`, previewUnchanged: true, exactEndpoint: center, oneStepUndoRedo: true, nativeReopenExact: true });
  }
  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: destination('failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors); throw error;
} finally { await desktop.close(); }
