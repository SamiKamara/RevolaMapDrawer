// Real Electron SVG export coverage. Only native dialog choices are stubbed;
// preload, IPC, atomic filesystem writes, renderer controls and SVG decoding run normally.
import { _electron as electron, chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, addDoor, validateDocument } from '../src/model.js';
import { decodePngMetadata } from '../src/png.js';
import { drawMap } from '../src/render.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged') || process.env.PACKAGED === '1';
const prefix = packaged ? 'svg-packaged' : 'svg';
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const destination = name => path.join(artifacts, `${prefix}-${name}`);
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const matchingSourceFiles = ['index.html', 'src/app.js', 'src/svg.js', 'src/ship.js', 'src/render.js', 'src/style.css', 'electron/main.cjs', 'electron/preload.cjs'];
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
  for (const file of matchingSourceFiles) {
    assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches current source`);
  }
}

const fixture = createDocument();
fixture.name = 'SVG <walls> & doors';
const wall = (ax, ay, bx, by) => addWall(fixture, { x: ax, y: ay }, { x: bx, y: by }, { joinTolerance: 0 });
wall(500, 1000, 3500, 1000);
addDoor(fixture, fixture.edges[0].id, { x: 1500, y: 1000 }, { centerTolerance: 0 });
fixture.edges[0].gaps.push({ id: 'svg_gap', start: .75, end: .85 });
wall(4500, 1000, 5500, 2000); wall(5500, 2000, 5500, 3500);
wall(900, 2600, 2300, 4000);
addDoor(fixture, fixture.edges.find(edge => fixture.vertices.find(v => v.id === edge.a)?.x === 900).id,
  { x: 1600, y: 3300 }, { centerTolerance: 0 });
wall(3000, 3000, 4000, 3000); wall(3500, 2000, 3500, 3000);
wall(3739.5, 4740, 3739.5, 4400); wall(3739.5, 4400, 4452.5, 4400); wall(4452.5, 4400, 4452.5, 4740);
assert.deepEqual(validateDocument(fixture), fixture, 'SVG fixture is a legal shared wall graph');
const fixturePath = destination('fixture.revola.json');
await fs.writeFile(fixturePath, JSON.stringify(fixture));
const expanded = structuredClone(fixture);
expanded.name = 'Expanded SVG map'; expanded.ship.mirrored = true;
addWall(expanded, { x: -1500, y: -1000 }, { x: 500, y: -1000 }, { joinTolerance: 0 });
assert.deepEqual(validateDocument(expanded), expanded);
const expandedPath = destination('expanded-fixture.revola.json');
await fs.writeFile(expandedPath, JSON.stringify(expanded));
const shipPng = await fs.readFile(path.join(root, 'assets', 'ship.png'));
const blockedPath = destination('blocked-directory');
await fs.mkdir(blockedPath, { recursive: true });

const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, matchingSourceFiles: packaged ? matchingSourceFiles : [], interactions: [], exports: [], rendererErrors: errors };

try {
  await desktop.evaluate(({ dialog }) => {
    global.__revolaSvg = { saves: [], opens: [], dialogs: [], messages: [] };
    dialog.showSaveDialog = async (_window, options) => {
      global.__revolaSvg.dialogs.push(options);
      const filePath = global.__revolaSvg.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaSvg.opens.shift();
      return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async (_window, options) => {
      global.__revolaSvg.messages.push(options); return { response: 0 };
    };
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  await expect(page.locator('#svg-button')).toHaveText('Save wall SVG');
  assert.equal(await page.evaluate(() => typeof window.revolaDesktop?.saveFile), 'function');
  if (packaged) assert.match((await page.evaluate(() => location.href)).toLowerCase(), /\/dist\/revolamapdrawer-win32-x64\/resources\/app(?:\.asar)?\/index\.html$/);

  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const queueSave = filePath => desktop.evaluate((_electron, value) => global.__revolaSvg.saves.push(value), filePath);
  const open = async (filePath, name) => {
    await desktop.evaluate((_electron, value) => global.__revolaSvg.opens.push(value), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#status-message')).toContainText('Opened ');
    await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    await page.locator('#fit-button').click(); await settled();
  };
  const state = () => page.evaluate(() => ({
    title: document.title, name: document.getElementById('map-name').value,
    stats: document.getElementById('graph-stats').textContent,
    dimensions: document.getElementById('canvas-dimensions').textContent,
    dirty: document.getElementById('dirty-dot').classList.contains('dirty'),
    buttons: ['project-button', 'export-button', 'svg-button', 'undo-button', 'redo-button'].map(id => ({ id, disabled: document.getElementById(id).disabled })),
  }));
  const write = async (selector, filePath) => {
    await fs.rm(filePath, { force: true }); await queueSave(filePath); await page.locator(selector).click();
    await expect.poll(() => fs.stat(filePath).then(s => s.size).catch(() => 0), { timeout: 90_000 }).toBeGreaterThan(100);
    await expect(page.locator(selector)).toBeEnabled();
    await expect(page.locator('#status-message')).not.toHaveClass(/error/);
    return fs.readFile(filePath);
  };
  const snapshot = async name => {
    const bytes = await write('#project-button', destination(`${name}.revola.json`));
    const document = JSON.parse(bytes.toString('utf8'));
    assert.deepEqual(validateDocument(document), document); return document;
  };
  const svgExport = async (name, document) => {
    const before = await state();
    const bytes = await write('#svg-button', destination(`${name}.svg`));
    assert.deepEqual(await state(), before, 'SVG export preserves document, dirty state and history controls');
    const dialog = await desktop.evaluate(() => global.__revolaSvg.dialogs.at(-1));
    assert.equal(dialog.title, 'Export SVG');
    assert.deepEqual(dialog.filters[0].extensions, ['svg']);
    assert.ok(dialog.defaultPath.endsWith('.svg'));
    const svg = bytes.toString('utf8');
    const pngs = [...svg.matchAll(/data:image\/png;base64,([A-Za-z\d+/=]+)/g)];
    assert.equal(pngs.length, 1, 'The original ship is embedded only once');
    assert.ok(Buffer.from(pngs[0][1], 'base64').equals(shipPng), 'Embedded ship keeps the supplied PNG bytes exactly');
    const parsed = await page.evaluate(svg => {
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const root = xml.documentElement;
      return { parseErrors: xml.querySelectorAll('parsererror').length, name: root.localName,
        namespace: root.namespaceURI, width: root.getAttribute('width'), height: root.getAttribute('height'),
        viewBox: root.getAttribute('viewBox'), title: xml.querySelector('title')?.textContent, paths: xml.querySelectorAll('path').length,
        images: xml.querySelectorAll('image').length, metadata: xml.querySelectorAll('metadata').length,
        forbidden: xml.querySelectorAll('script, foreignObject, text, rect, line, circle').length };
    }, svg);
    assert.equal(parsed.parseErrors, 0, 'Actual written SVG parses as valid XML');
    assert.equal(parsed.name, 'svg'); assert.equal(parsed.namespace, 'http://www.w3.org/2000/svg');
    assert.equal(Number(parsed.width), document.width); assert.equal(Number(parsed.height), document.height);
    assert.equal(parsed.viewBox, `${document.originX} ${document.originY} ${document.width} ${document.height}`, 'SVG viewport retains the original world origin');
    assert.equal(parsed.title, document.name, 'Map name is safely escaped as XML text');
    assert.ok(parsed.paths > 0); assert.equal(parsed.images, 1); assert.equal(parsed.metadata, 0);
    assert.equal(parsed.forbidden, 0, 'No background, editing overlays, labels or executable content are exported');
    let originalPoints = 0;
    drawMap({ save() {}, restore() {}, beginPath() {}, fill() {}, closePath() {},
      moveTo() { originalPoints++; }, lineTo() { originalPoints++; } }, document, { drawShip: false });
    const tokens = /<path[^>]* d="([^"]*)"/.exec(svg)[1].match(/[MLHVZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi);
    let command, pointCount = 0;
    for (let index = 0; index < tokens.length;) {
      if (/^[MLHVZ]$/.test(tokens[index])) command = tokens[index++];
      if (command === 'Z') continue;
      index += command === 'H' || command === 'V' ? 1 : 2;
      pointCount++; if (command === 'M') command = 'L';
    }
    assert.ok(pointCount < originalPoints, 'Actual SVG removes unnecessary sampled wall points');
    const raster = await inspectRaster(svg, document);
    evidence.exports.push({ name, bytes: bytes.length, wallDataBytes: bytes.length - Math.ceil(shipPng.length / 3) * 4,
      originalWallPoints: originalPoints, exportedWallPoints: pointCount, removedWallPoints: originalPoints - pointCount, parsed, raster });
    return bytes;
  };

  async function inspectRaster(svg, source) {
    // Crop at native map scale instead of allocating a 16384-square RGBA canvas.
    return page.evaluate(async ({ svg, source }) => {
      const { drawMap, loadShip, shipBounds } = await import('./src/render.js');
      const shipImage = await loadShip();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const image = new Image(); image.src = url; await image.decode();
      // Bounds and isolated raster expectation use literal measured dimensions
      // and the 29 px mirrored correction, independently of renderer helpers.
      const ship = { left: source.ship.x + (source.ship.mirrored ? 29 + 1269 - 2459 : -1269),
        top: source.ship.y - 70, right: source.ship.x + (source.ship.mirrored ? 29 + 1269 : 2459 - 1269),
        bottom: source.ship.y + 1931 - 70 };
      if (JSON.stringify(shipBounds(source.ship)) !== JSON.stringify(ship)) throw new Error('Ship bounds differ from independently measured pivot');
      const regions = [
        { name: 'axis door', x: 1250, y: 960, width: 500, height: 80 },
        { name: 'erased gap', x: 2700, y: 960, width: 400, height: 80 },
        { name: 'diagonal door', x: 1410, y: 3110, width: 380, height: 380 },
        { name: 'diagonal miter', x: 5430, y: 1930, width: 140, height: 140 },
        { name: 'shared T joint', x: 3410, y: 2910, width: 180, height: 180 },
        { name: 'solid wall', x: 1900, y: 970, width: 700, height: 60 },
        { name: 'empty background', x: 100, y: 100, width: 160, height: 160 },
        { name: 'airlock and ship composite', x: ship.left, y: ship.top, width: ship.right - ship.left, height: ship.bottom - ship.top },
        { name: 'ship artwork', shipOnly: true, x: ship.left, y: ship.top, width: ship.right - ship.left, height: ship.bottom - ship.top },
      ];
      if (source.originX < 0) regions.push({ name: 'negative world wall', x: -1550, y: -1040, width: 2100, height: 80 });
      const results = [];
      try {
        for (const region of regions) {
          const actual = document.createElement('canvas'), baseline = document.createElement('canvas');
          actual.width = baseline.width = region.width; actual.height = baseline.height = region.height;
          const a = actual.getContext('2d', { willReadFrequently: true });
          const b = baseline.getContext('2d', { willReadFrequently: true });
          // Reframe only the SVG root viewport to this world-space crop. Its
          // actual written geometry/image elements remain unchanged, and the
          // browser never needs to rasterize a 1 GiB full-size export surface.
          const crop = new DOMParser().parseFromString(svg, 'image/svg+xml');
          crop.documentElement.setAttribute('width', region.width);
          crop.documentElement.setAttribute('height', region.height);
          crop.documentElement.setAttribute('viewBox', `${region.x} ${region.y} ${region.width} ${region.height}`);
          // The crop's first 70 rows also include user walls at the pinned
          // ports. Test their composite silhouettes above, then isolate the
          // unchanged image element for a strict raster-asset comparison.
          if (region.shipOnly) for (const path of crop.querySelectorAll('path')) path.remove();
          const cropUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(crop)], { type: 'image/svg+xml' }));
          const cropImage = new Image(); cropImage.src = cropUrl;
          try { await cropImage.decode(); a.drawImage(cropImage, 0, 0); }
          finally { URL.revokeObjectURL(cropUrl); }
          b.translate(-region.x, -region.y);
          if (region.shipOnly) {
            b.translate(source.ship.x + (source.ship.mirrored ? 29 : 0), source.ship.y);
            if (source.ship.mirrored) b.scale(-1, 1);
            b.drawImage(shipImage, -1269, -70);
          } else drawMap(b, source, { shipImage });
          const pixels = a.getImageData(0, 0, region.width, region.height).data;
          const reference = b.getImageData(0, 0, region.width, region.height).data;
          let nonwhite = 0, visible = 0, transparent = 0, stableCompared = 0, stableDifferences = 0, differences = 0, maxAlphaDifference = 0;
          const differenceSamples = [];
          for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
            const index = (y * region.width + x) * 4, alpha = pixels[index + 3], expected = reference[index + 3];
            if (alpha) { visible++; if (pixels[index] !== 255 || pixels[index + 1] !== 255 || pixels[index + 2] !== 255) nonwhite++; }
            else transparent++;
            const delta = Math.abs(alpha - expected);
            if (delta) {
              differences++;
              if (differenceSamples.length < 20) differenceSamples.push({ x: region.x + x, y: region.y + y, alpha, expected });
            }
            maxAlphaDifference = Math.max(maxAlphaDifference, delta);
            if ((expected === 0 || expected === 255) && x >= 2 && y >= 2 && x < region.width - 2 && y < region.height - 2) {
              let stable = true;
              for (let dy = -2; dy <= 2 && stable; dy++) for (let dx = -2; dx <= 2; dx++) {
                if (reference[((y + dy) * region.width + x + dx) * 4 + 3] !== expected) { stable = false; break; }
              }
              if (stable) { stableCompared++; if (alpha !== expected) stableDifferences++; }
            }
          }
          results.push({ ...region, visible, transparent, nonwhite, stableCompared, stableDifferences, differences, maxAlphaDifference, differenceSamples });
          actual.width = actual.height = baseline.width = baseline.height = 1;
        }
      } finally { URL.revokeObjectURL(url); }
      return { width: image.naturalWidth, height: image.naturalHeight, regions: results };
    }, { svg, source }).then(result => {
      assert.equal(result.width, source.width); assert.equal(result.height, source.height);
      for (const region of result.regions) {
        assert.equal(region.nonwhite, 0, `${region.name}: all visible pixels are white`);
        assert.ok(region.stableCompared > 0);
        assert.equal(region.stableDifferences, 0, `${region.name}: solid interiors and transparent cuts match the map renderer`);
        if (region.name === 'empty background') assert.equal(region.visible, 0);
        else assert.ok(region.visible > 0, `${region.name}: expected geometry is present`);
        if (region.shipOnly) assert.equal(region.differences, 0, `Ship pixels match the original renderer exactly, including mirroring: ${JSON.stringify(region.differenceSamples)}`);
      }
      return result;
    });
  }

  await open(fixturePath, fixture.name);
  await page.locator('[data-tool="select"]').click();
  // Keep a live selection and grid visible to verify that SVG contains map content only.
  const target = await page.locator('#map-canvas').evaluate(element => {
    const rect = element.getBoundingClientRect(), transform = element.getContext('2d').getTransform();
    return { x: rect.x + (2100 * transform.a + transform.e) * rect.width / element.width,
      y: rect.y + (1000 * transform.d + transform.f) * rect.height / element.height };
  });
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#selection-info')).toBeVisible();
  await page.screenshot({ path: destination('editor.png') });
  await svgExport('normal', fixture);
  assert.deepEqual(await snapshot('normal-after-svg'), fixture, 'SVG export leaves exact graph, style, cuts and ship unchanged');

  await page.locator('#mirror-button').click();
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  const mirrored = structuredClone(fixture); mirrored.ship.mirrored = true;
  await svgExport('mirrored', mirrored);
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(() => desktop.evaluate(() => global.__revolaSvg.messages.length)).toBe(1);
  assert.equal(await desktop.evaluate(() => global.__revolaSvg.messages[0].title), 'Unsaved map');
  await expect(page.locator('#map-canvas')).toBeVisible();
  evidence.interactions.push('SVG export keeps native dirty state and dirty-close protection; original and mirrored ship pixels match');

  const dirtyBefore = await state();
  await page.locator('#svg-button').click();
  await expect(page.locator('#status-message')).toContainText('canceled');
  assert.deepEqual(await state(), dirtyBefore, 'Canceled SVG save leaves dirty state, controls and current document unchanged');
  await queueSave(blockedPath); await page.locator('#svg-button').click();
  await expect(page.locator('#status-message')).toHaveClass(/error/);
  await expect(page.locator('#svg-button')).toBeEnabled();
  assert.deepEqual(await state(), dirtyBefore, 'Failed SVG write leaves dirty state, controls and current document unchanged');
  assert.ok((await fs.stat(blockedPath)).isDirectory(), 'Existing destination is untouched by a failed replace');
  assert.equal((await fs.readdir(artifacts)).filter(name => name.startsWith(path.basename(blockedPath) + '.') && name.endsWith('.tmp')).length, 0, 'Failed write removes its temporary file');
  assert.deepEqual(await snapshot('after-cancel-and-failure'), mirrored, 'Cancellation and write failure preserve exact project geometry');
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push('Native SVG save dialog has SVG filter and extension; cancel and filesystem replace failure preserve exact geometry and re-enable save controls; project save clears dirty state');

  await page.locator('#mirror-button').click();
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  const png = await write('#export-button', destination('editable.png'));
  assert.deepEqual(validateDocument(decodePngMetadata(png)), fixture);
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push('Existing editable PNG save still preserves metadata and clears native dirty state');

  await open(expandedPath, expanded.name);
  await svgExport('expanded', expanded);
  assert.deepEqual(await snapshot('expanded-after-svg'), expanded, 'Expanded SVG preserves original world coordinates, geometry scale and fixed ship');
  evidence.interactions.push('16384 export includes negative world coordinates while retaining original geometry scale and center');

  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700));
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(1024);
  await settled();
  const compact = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
    controls: ['svg-button', 'project-button', 'export-button', 'open-button', 'map-canvas'].map(id => {
      const box = document.getElementById(id).getBoundingClientRect();
      return { id, x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    }) }));
  assert.equal(compact.overflow, false, 'Compact window has no horizontal page overflow');
  for (const control of compact.controls) {
    assert.ok(control.x >= 0 && control.y >= 0 && control.right <= compact.width + 1 && control.bottom <= compact.height + 1, `${control.id} remains in the compact window`);
    assert.ok(control.width > 20 && control.height > 20, `${control.id} remains usable`);
  }
  await page.locator('#svg-button').click();
  await expect(page.locator('#status-message')).toContainText('canceled');
  await page.screenshot({ path: destination('compact.png') });
  evidence.compactWindow = compact;
  evidence.interactions.push('1024 × 700 packaged/source window exposes usable Save wall SVG, Save wall PNG and project controls');
  if (!packaged) {
    // Exercise the browser-only fetch/FileReader and Blob download path in a
    // separate browser with no preload bridge. Serve only this repository locally.
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    const server = http.createServer(async (request, response) => {
      try {
        const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
        if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        const bytes = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(bytes);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
      const preview = await browser.newPage({ acceptDownloads: true });
      const browserErrors = []; preview.on('pageerror', error => browserErrors.push(error.message));
      await preview.goto(`http://127.0.0.1:${server.address().port}/`);
      await expect(preview.locator('#status-message')).not.toHaveText('Preparing workspace…');
      assert.equal(await preview.evaluate(() => typeof window.revolaDesktop), 'undefined');
      await preview.locator('#file-input').setInputFiles(fixturePath);
      await expect(preview.locator('#document-title')).toHaveText(fixture.name);
      await preview.locator('#mirror-button').click();
      const downloadPromise = preview.waitForEvent('download');
      await preview.locator('#svg-button').click();
      const download = await downloadPromise;
      assert.ok(download.suggestedFilename().endsWith('.svg'));
      await download.saveAs(destination('browser.svg'));
      const downloaded = await fs.readFile(destination('browser.svg'));
      assert.ok(downloaded.equals(await fs.readFile(destination('mirrored.svg'))), 'Browser download matches native SVG byte for byte, including original embedded ship PNG');
      await expect(preview.locator('#svg-button')).toBeEnabled();
      await expect(preview.locator('#dirty-dot')).toHaveClass(/dirty/);
      await expect(preview.locator('#status-message')).toContainText('Downloaded');
      await preview.screenshot({ path: destination('browser-editor.png') });
      // Opening the written file separately requires no editor/server or assets.
      const standalone = await browser.newPage();
      await standalone.goto(pathToFileURL(destination('browser.svg')).href);
      assert.equal(await standalone.locator('svg > image, svg image').count(), 1);
      assert.ok((await standalone.locator('image').getAttribute('href')).startsWith('data:image/png;base64,'));
      assert.deepEqual(browserErrors, [], 'Browser export has no renderer errors');
      evidence.browserPreview = { downloadName: download.suggestedFilename(), bytes: downloaded.length, nativeBytesIdentical: true,
        dirtyAfterExport: true, standaloneOfflineFile: true, rendererErrors: browserErrors };
      evidence.interactions.push('Browser fallback imports a project, embeds the exact bundled PNG through fetch/FileReader, downloads byte-identical SVG and retains dirty state; downloaded SVG opens separately offline');
    } finally {
      await browser?.close(); await new Promise(resolve => server.close(resolve));
    }
  }
  assert.deepEqual(errors, [], 'No unhandled renderer errors');
  await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ packaged, exports: evidence.exports.map(item => ({
    name: item.name, bytes: item.bytes, dimensions: `${item.raster.width} × ${item.raster.height}`,
    originalWallPoints: item.originalWallPoints, exportedWallPoints: item.exportedWallPoints,
    stablePixelsCompared: item.raster.regions.reduce((sum, region) => sum + region.stableCompared, 0),
    stablePixelDifferences: item.raster.regions.reduce((sum, region) => sum + region.stableDifferences, 0),
    shipPixelDifferences: item.raster.regions.find(region => region.shipOnly).differences,
  })), browserPreview: evidence.browserPreview, compactWindow: `${compact.width} × ${compact.height}`,
    interactions: evidence.interactions, rendererErrors: errors, evidenceFile: destination('results.json') }, null, 2));
} catch (error) {
  await page.screenshot({ path: destination('failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors); throw error;
} finally { await desktop.close(); }
