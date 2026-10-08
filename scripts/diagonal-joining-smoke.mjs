import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, validateDocument } from '../src/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.env.PACKAGED === '1';
const prefix = packaged ? 'diagonal-packaged' : 'diagonal';
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
  for (const file of ['src/model.js', 'src/render.js', 'src/app.js']) {
    assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches the source under test`);
  }
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({
  ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000,
});
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, interactions: [], rasters: [], rendererErrors: errors };

try {
  await desktop.evaluate(({ dialog }) => {
    // Only dialog selections are stubbed. Every save and open uses the actual
    // preload, native IPC, filesystem and production document validator.
    global.__revolaDiagonal = { saves: [], opens: [] };
    dialog.showSaveDialog = async () => {
      const filePath = global.__revolaDiagonal.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaDiagonal.opens.shift();
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
  const zoomAtCorner = async (x, y) => {
    const point = mapPoint(x, y);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -1300);
    await expect.poll(async () => parseInt(await page.locator('#zoom-value').textContent(), 10)).toBeGreaterThanOrEqual(24);
    await calibrate();
  };
  const snapshot = async name => {
    const filePath = path.join(artifacts, `${prefix}-${name}.revola.json`);
    await fs.rm(filePath, { force: true });
    await desktop.evaluate((_electron, destination) => global.__revolaDiagonal.saves.push(destination), filePath);
    await page.locator('#project-button').click();
    await expect.poll(async () => fs.stat(filePath).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    await expect(page.locator('#project-button')).toBeEnabled();
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(validateDocument(document), document, 'Native save produces a valid graph');
    return document;
  };
  const openDocument = async (name, document) => {
    const filePath = path.join(artifacts, `${prefix}-${name}-fixture.revola.json`);
    await fs.writeFile(filePath, JSON.stringify(document, null, 2));
    await desktop.evaluate((_electron, source) => global.__revolaDiagonal.opens.push(source), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#document-title').textContent()) === document.name || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(document.name);
    await page.locator('#fit-button').click();
    await calibrate();
    assert.deepEqual(await snapshot(`${name}-opened`), document, 'Opening does not implicitly repair or otherwise alter fixture geometry');
  };
  const fixture = async (name, segments) => {
    const document = createDocument();
    document.name = name;
    for (const [ax, ay, bx, by] of segments) {
      addWall(document, { x: ax, y: ay }, { x: bx, y: by }, { joinTolerance: 0 });
    }
    await openDocument(name, document);
    return document;
  };
  const degree = (document, id) => document.edges.filter(edge => edge.a === id || edge.b === id).length;
  const checkCorner = (document, expectedJoint) => {
    assert.equal(document.edges.length, 2, 'Joining retains two walls, without a tiny overshoot arm');
    assert.equal(document.vertices.length, 3, 'Both walls share one graph point');
    const joint = document.vertices.find(vertex => degree(document, vertex.id) === 2);
    assert.ok(joint, 'The corner is connected in editable topology');
    assert.deepEqual({ x: joint.x, y: joint.y }, expectedJoint, 'Original straight/diagonal rays meet at their exact intersection');
    const directions = document.edges.map(edge => {
      const a = document.vertices.find(vertex => vertex.id === edge.a), b = document.vertices.find(vertex => vertex.id === edge.b);
      assert.equal(edge.doors.length, 0); assert.equal(edge.gaps.length, 0);
      const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      assert.ok(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-7, 'The joined graph keeps exact permitted wall directions');
      return dx === 0 ? 'vertical' : dy === 0 ? 'horizontal' : 'diagonal';
    });
    assert.ok(directions.includes('diagonal') && directions.some(direction => direction !== 'diagonal'));
    return joint;
  };
  const checkHistoryAndReopen = async (name, before, after) => {
    await page.locator('#undo-button').click();
    assert.deepEqual(await snapshot(`${name}-undone`), before, 'Corner joining is one complete undo transaction');
    await page.locator('#redo-button').click();
    assert.deepEqual(await snapshot(`${name}-redone`), after, 'Redo restores the exact graph and IDs');
    await openDocument(`${name}-reopened`, after);
    assert.deepEqual(await snapshot(`${name}-reopened-saved`), after, 'Reopening keeps the connected corner editable and exact');
  };
  const rasterCorner = async (name, document, joint) => {
    const raster = await page.evaluate(async ({ document, joint }) => {
      const { drawMap } = await import('./src/render.js');
      const endpoints = document.vertices.filter(vertex => document.edges.filter(edge => edge.a === vertex.id || edge.b === vertex.id).length === 1);
      if (endpoints.length !== 2) throw new Error('A raster corner oracle requires two terminal endpoints');
      const render = reference => {
        const surface = new OffscreenCanvas(256, 256), context = surface.getContext('2d');
        context.translate(128 - joint.x, 128 - joint.y);
        if (reference) {
          // The independent browser stroker defines the width-preserving ideal
          // miter silhouette; this is not an expected graph built with addWall.
          context.strokeStyle = '#ffffff'; context.lineWidth = 50;
          context.lineJoin = 'miter'; context.miterLimit = 3; context.lineCap = 'butt';
          context.beginPath(); context.moveTo(endpoints[0].x, endpoints[0].y);
          context.lineTo(joint.x, joint.y); context.lineTo(endpoints[1].x, endpoints[1].y);
          context.stroke();
        } else {
          const smooth = structuredClone(document); smooth.style.roughness = 0;
          drawMap(context, smooth, { drawShip: false });
        }
        return context.getImageData(0, 0, 256, 256).data;
      };
      const actual = render(false), ideal = render(true);
      let missingSolidPixels = 0, extraExteriorPixels = 0, partialInteriorPixels = 0, nonwhitePixels = 0;
      const differences = [];
      for (let offset = 0; offset < actual.length; offset += 4) {
        const x = offset / 4 % 256, y = Math.floor(offset / 4 / 256);
        // Erode the expected interior/exterior by one raster pixel. The
        // browser stroker and polygon filler can round coverage differently
        // at a fractional boundary, which is unrelated to a wall-end step.
        let solidInterior = x > 0 && x < 255 && y > 0 && y < 255;
        let clearExterior = solidInterior;
        for (let dy = -1; dy <= 1 && (solidInterior || clearExterior); dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const alpha = ideal[((y + dy) * 256 + x + dx) * 4 + 3];
            solidInterior &&= alpha === 255;
            clearExterior &&= alpha === 0;
          }
        }
        if (solidInterior && actual[offset + 3] < 255) {
          missingSolidPixels++;
          if (differences.length < 10) differences.push({ x, y, actualAlpha: actual[offset + 3] });
        }
        if (clearExterior && actual[offset + 3] >= 128) extraExteriorPixels++;
        if (solidInterior && actual[offset + 3] > 0 && actual[offset + 3] < 255) partialInteriorPixels++;
        if (actual[offset + 3] && (actual[offset] !== 255 || actual[offset + 1] !== 255 || actual[offset + 2] !== 255)) nonwhitePixels++;
      }
      return { width: 256, height: 256, missingSolidPixels, extraExteriorPixels, partialInteriorPixels, nonwhitePixels, differences };
    }, { document, joint });
    evidence.rasters.push({ name, ...raster });
  };

  const cases = [
    { name: 'horizontal-to-diagonal', segments: [[1400, 2000, 3000, 2000]], draw: [[3900, 2900], [3025, 2025]], joint: { x: 3000, y: 2000 } },
    { name: 'diagonal-to-horizontal', segments: [[3025, 2025, 3900, 2900]], draw: [[1400, 2000], [2975, 2000]], joint: { x: 3000, y: 2000 } },
    { name: 'diagonal-to-vertical', segments: [[2000, 1000, 3000, 2000]], draw: [[3000, 3500], [3000, 2025]], joint: { x: 3000, y: 2000 } },
    { name: 'vertical-to-diagonal', segments: [[3000, 2025, 3000, 3500]], draw: [[2000, 1000], [2975, 1975]], joint: { x: 3000, y: 2000 } },
    { name: 'horizontal-near-end-start', segments: [[2000, 3000, 3000, 3000]], draw: [[2975, 3025], [3975, 4025]], joint: { x: 3000, y: 3000 }, zoom: true },
    { name: 'diagonal-near-end-start', segments: [[2000, 2000, 3000, 3000]], draw: [[2975, 2975], [2975, 3975]], joint: { x: 3000, y: 3000 }, zoom: true },
  ];
  for (const scenario of cases) {
    const before = await fixture(scenario.name, scenario.segments);
    if (scenario.zoom) await zoomAtCorner(scenario.joint.x, scenario.joint.y);
    await page.locator('[data-tool="wall"]').click();
    await dragMap(...scenario.draw);
    await page.keyboard.press('Escape');
    const after = await snapshot(`${scenario.name}-joined`);
    const joint = checkCorner(after, scenario.joint);
    await rasterCorner(scenario.name, after, joint);
    await checkHistoryAndReopen(scenario.name, before, after);
    evidence.interactions.push(`${scenario.name}: actual wall drag joins two rays; exact undo/redo and native reopen`);
  }

  const sharedBefore = await fixture('degree-two-near-corner-start', [[2000, 3000, 3000, 3000], [3000, 3000, 3000, 4000]]);
  await zoomAtCorner(3000, 3000);
  await page.locator('[data-tool="wall"]').click();
  await dragMap([2975, 3025], [3975, 4025]);
  await page.keyboard.press('Escape');
  const sharedAfter = await snapshot('degree-two-near-corner-start-joined');
  assert.equal(sharedAfter.edges.length, 3, 'Starting near a connected corner adds one diagonal rather than a tiny triangular loop');
  assert.equal(sharedAfter.vertices.length, 4, 'Existing corner remains one shared graph point');
  const sharedJoint = sharedAfter.vertices.find(vertex => vertex.x === 3000 && vertex.y === 3000);
  assert.ok(sharedJoint && degree(sharedAfter, sharedJoint.id) === 3, 'New diagonal starts at the original degree-two corner');
  assert.ok(sharedAfter.vertices.some(vertex => vertex.x === 4000 && vertex.y === 4000), 'Starting attraction translates the entire diagonal without changing its angle');
  await checkHistoryAndReopen('degree-two-near-corner-start', sharedBefore, sharedAfter);
  evidence.interactions.push('degree-two-near-corner-start: nearby diagonal starts at the shared corner with no triangle or spur; exact undo/redo and native reopen');

  // Existing disconnected projects open exactly. A real user drag repairs the
  // short diagonal end; importing a file alone must not change its geometry.
  const dragBefore = await fixture('diagonal-terminal-drag', [[1400, 2000, 3000, 2000], [3200, 2200, 3900, 2900]]);
  await page.locator('[data-tool="select"]').click();
  await dragMap([3200, 2200], [3025, 2025]);
  const dragAfter = await snapshot('diagonal-terminal-drag-joined');
  await rasterCorner('diagonal-terminal-drag', dragAfter, checkCorner(dragAfter, { x: 3000, y: 2000 }));
  await checkHistoryAndReopen('diagonal-terminal-drag', dragBefore, dragAfter);
  evidence.interactions.push('diagonal-terminal-drag: constrained endpoint drag repairs old disconnected rays; one undo/redo and native reopen');

  const redrawBefore = await fixture('diagonal-redraw', [[1400, 2000, 3000, 2000], [3025, 2025, 3900, 2900]]);
  await page.locator('[data-tool="wall"]').click();
  await dragMap([3600, 2600], [3025, 2025]);
  await page.keyboard.press('Escape');
  const redrawAfter = await snapshot('diagonal-redraw-joined');
  // Overlapping redraw may preserve an incidental collinear split, but the
  // corner itself must become a single degree-two point and remain seam-free.
  const redrawJoint = redrawAfter.vertices.find(vertex => vertex.x === 3000 && vertex.y === 2000);
  assert.ok(redrawJoint && degree(redrawAfter, redrawJoint.id) === 2, 'Redrawing the old stub connects its exact corner');
  assert.ok(!redrawAfter.vertices.some(vertex => vertex.x === 3025 && vertex.y === 2025 && degree(redrawAfter, vertex.id) === 1));
  await rasterCorner('diagonal-redraw', redrawAfter, redrawJoint);
  await checkHistoryAndReopen('diagonal-redraw', redrawBefore, redrawAfter);
  evidence.interactions.push('diagonal-redraw: overlapping stroke repairs an old near-corner without implicit import repair; exact undo/redo and reopen');

  // Check the same 45° bend in every permitted world direction against an
  // independent stroked outline, including orientations absent from the two
  // screenshots. Fractional coordinates exercise native diagonal rasterization.
  for (let turn = 0; turn < 8; turn++) {
    const angle = turn * Math.PI / 4, cosine = Math.cos(angle), sine = Math.sin(angle);
    const rotated = (x, y, id) => ({ id, x: 3000 + x * cosine - y * sine, y: 3000 + x * sine + y * cosine });
    const document = createDocument();
    document.vertices = [rotated(-700, 0, 'terminal-a'), { id: 'joint', x: 3000, y: 3000 }, rotated(700, 700, 'terminal-b')];
    document.edges = [{ id: 'wall-a', a: 'terminal-a', b: 'joint', doors: [], gaps: [] },
      { id: 'wall-b', a: 'joint', b: 'terminal-b', doors: [], gaps: [] }];
    await rasterCorner(`rotated-bend-${turn * 45}`, document, document.vertices[1]);
  }

  await page.locator('#grid-toggle').uncheck();
  const detail = mapPoint(3000, 2000);
  await page.mouse.move(detail.x, detail.y); await page.mouse.wheel(0, -1000);
  await page.screenshot({ path: path.join(artifacts, `${prefix}-corner-editor.png`) });
  for (const raster of evidence.rasters) {
    assert.equal(raster.missingSolidPixels, 0, `${raster.name}: the inside of the joined 45° bend stays fully solid ${JSON.stringify(raster.differences)}`);
    assert.equal(raster.extraExteriorPixels, 0, `${raster.name}: no butt-end step protrudes beyond the miter silhouette`);
    assert.equal(raster.partialInteriorPixels, 0, `${raster.name}: no translucent internal seam`);
    assert.equal(raster.nonwhitePixels, 0, `${raster.name}: every visible wall pixel has white RGB`);
  }
  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(path.join(artifacts, `${prefix}-results.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, `${prefix}-failure.png`) }).catch(() => {});
  await fs.writeFile(path.join(artifacts, `${prefix}-failure-results.json`), JSON.stringify({ ...evidence, failure: error.message }, null, 2)).catch(() => {});
  console.error('Renderer errors:', errors);
  throw error;
} finally { await desktop.close(); }
