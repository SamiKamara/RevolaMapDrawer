// Actual offline Electron automatic floors and native exports. Only file-dialog
// choices are stubbed; renderer, preload, IPC and atomic writes run normally.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInflate, inflateSync } from 'node:zlib';
import { extractFile } from '@electron/asar';
import { createDocument, addWall, addDoor, validateDocument } from '../src/model.js';
import { generateFloor, renderFloorSvg } from '../src/floors.js';
import { decodePngMetadata } from '../src/png.js';
import { SHIP_ANCHOR, SHIP_BOUNDS } from '../src/render.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged') || process.env.PACKAGED === '1';
const prefix = packaged ? 'floor-packaged' : 'floor';
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const destination = name => path.join(artifacts, `${prefix}-${name}`);
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const matchingSourceFiles = ['index.html', 'src/app.js', 'src/export.js', 'src/floors.js', 'src/render.js', 'src/ship.js', 'src/style.css', 'electron/main.cjs', 'electron/preload.cjs', 'assets/editor-stars.png', 'assets/ship-floor-contour.js'];
if (packaged) {
  const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
  for (const file of matchingSourceFiles) assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Packaged ${file} matches source`);
}

const fixture = createDocument(); fixture.name = 'Closed floor test';
const wall = (ax, ay, bx, by) => addWall(fixture, { x: ax, y: ay }, { x: bx, y: by }, { joinTolerance: 0 });
wall(3739.5, 4740, 3739.5, 4400); wall(3739.5, 4400, 2000, 4400);
wall(2000, 4400, 2000, 1000); wall(2000, 1000, 6500, 1000);
wall(6500, 1000, 6500, 4400); wall(6500, 4400, 4452.5, 4400); wall(4452.5, 4400, 4452.5, 4740);
wall(4300, 1000, 4300, 4400);
const internal = fixture.edges.find(edge => {
  const a = fixture.vertices.find(vertex => vertex.id === edge.a), b = fixture.vertices.find(vertex => vertex.id === edge.b);
  return a.x === 4300 && b.x === 4300;
});
addDoor(fixture, internal.id, { x: 4300, y: 2700 }, { centerTolerance: 0 });
assert.deepEqual(validateDocument(fixture), fixture);
assert.equal(generateFloor(fixture).closed, true, 'Internal doorway is traversable within the enclosure');
const fixturePath = destination('fixture.revola.json');
await fs.writeFile(fixturePath, JSON.stringify(fixture));
const alternateSeed = structuredClone(fixture); alternateSeed.seed = fixture.seed + 317;
const alternateSeedPath = destination('alternate-seed.revola.json');
await fs.writeFile(alternateSeedPath, JSON.stringify(alternateSeed));
const courtyard = structuredClone(fixture); courtyard.name = 'Sealed courtyard';
const diamond = [{ x: 2800, y: 2300 }, { x: 3200, y: 1900 }, { x: 3600, y: 2300 }, { x: 3200, y: 2700 }];
for (let index = 0; index < diamond.length; index++) addWall(courtyard, diamond[index], diamond[(index + 1) % diamond.length], { joinTolerance: 0 });
const courtyardPath = destination('courtyard.revola.json'); await fs.writeFile(courtyardPath, JSON.stringify(courtyard));
const exteriorDoor = structuredClone(fixture); exteriorDoor.name = 'Exterior door leak';
const top = exteriorDoor.edges.find(edge => {
  const a = exteriorDoor.vertices.find(vertex => vertex.id === edge.a), b = exteriorDoor.vertices.find(vertex => vertex.id === edge.b);
  return a.y === 1000 && b.y === 1000 && Math.min(a.x, b.x) <= 3000 && Math.max(a.x, b.x) >= 3000;
});
addDoor(exteriorDoor, top.id, { x: 3000, y: 1000 }, { centerTolerance: 0 });
assert.equal(generateFloor(exteriorDoor).closed, false, 'An exterior doorway cannot be treated as a closed wall');
const exteriorPath = destination('exterior-door.revola.json'); await fs.writeFile(exteriorPath, JSON.stringify(exteriorDoor));
const gap = structuredClone(fixture); gap.name = 'Tiny exterior gap';
gap.edges.find(edge => edge.id === top.id).gaps.push({ id: 'floor_tiny_gap', start: .1, end: .10001 });
assert.equal(generateFloor(gap).closed, false, 'A real narrow exterior erasure still reaches space');
const gapPath = destination('tiny-gap.revola.json'); await fs.writeFile(gapPath, JSON.stringify(gap));
// Optional read-only additional fixture; maintained generated cases always run.
// A supplied missing/invalid fixture must fail rather than silently lose coverage.
const userSource = process.env.REVOLA_FLOOR_FIXTURE ? path.resolve(process.env.REVOLA_FLOOR_FIXTURE) : undefined;
let userBytes, userDocument;
if (userSource) {
  userBytes = await fs.readFile(userSource);
  userDocument = validateDocument(JSON.parse(userBytes.toString('utf8')));
}
if (userDocument) assert.equal(generateFloor(userDocument).closed, true, 'Supplied complex map is enclosed');
const blockedPath = destination('blocked-directory'); await fs.mkdir(blockedPath, { recursive: true });

const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(packaged ? { executablePath } : { args: [root] }), cwd: root, env, timeout: 45_000 });
const page = await desktop.firstWindow({ timeout: 45_000 }); page.setDefaultTimeout(30_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = { packaged, matchingSourceFiles: packaged ? matchingSourceFiles : [], optionalComplexFixture: userSource ? 'Configured with REVOLA_FLOOR_FIXTURE' : 'Not configured; maintained generated floor fixtures run', interactions: [], exports: [], rendererErrors: errors };

function pngChunks(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const result = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    result.push({ type, data: png.subarray(offset + 8, offset + 8 + length) }); offset += length + 12;
  }
  return result;
}

async function inspectPng(png, source, probes = []) {
  // Decode scanlines incrementally: a 16384-square image never becomes a large
  // contiguous raster in the smoke-test process either.
  const chunks = pngChunks(png), header = chunks[0].data;
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.equal(width, source.width); assert.equal(height, source.height);
  assert.deepEqual([...header.subarray(8)], [8, 4, 0, 0, 0]);
  assert.ok(!chunks.some(({ type }) => type === 'iTXt'));
  assert.throws(() => decodePngMetadata(png), /no Revola Map metadata/, 'Valid CRCs and an intentionally noneditable visual PNG');
  const wanted = new Map(probes.map(probe => [((probe.y - source.originY) * width + probe.x - source.originX), probe.name]));
  const shipSamples = new Set();
  for (let y = 0; y < SHIP_BOUNDS.height; y += 17) for (let x = 0; x < SHIP_BOUNDS.width; x += 19) {
    if (shipAlpha[y * SHIP_BOUNDS.width + x] < 128) continue;
    // Independent measured pivot correction, rather than the shared transform.
    const worldX = source.ship.x + (source.ship.mirrored ? 29 + SHIP_ANCHOR.x - x - 1 : x - SHIP_ANCHOR.x);
    const worldY = source.ship.y + y - SHIP_ANCHOR.y;
    shipSamples.add((worldY - source.originY) * width + worldX - source.originX);
  }
  const probeAlpha = {}, inflater = createInflate(), scanlineLength = width * 2 + 1;
  let position = 0, previousAlpha = 0, visible = 0, transparent = 0, opaque = 0, coveredShipSamples = 0;
  const consuming = (async () => {
    for await (const bytes of inflater) for (const byte of bytes) {
      const column = position % scanlineLength;
      if (column === 0) { assert.equal(byte, 1); previousAlpha = 0; }
      else if (column % 2 === 1) assert.equal(byte, 0, 'Every grayscale byte is pure black');
      else {
        previousAlpha = (previousAlpha + byte) & 255;
        if (previousAlpha) visible++; else transparent++;
        if (previousAlpha === 255) opaque++;
        const pixel = Math.floor(position / scanlineLength) * width + column / 2 - 1;
        if (wanted.has(pixel)) probeAlpha[wanted.get(pixel)] = previousAlpha;
        if (shipSamples.has(pixel)) { assert.equal(previousAlpha, 255, 'Ship wall coverage remains exactly aligned beneath the original asset'); coveredShipSamples++; }
      }
      position++;
    }
  })();
  consuming.catch(() => {});
  for (const chunk of chunks.filter(({ type }) => type === 'IDAT')) {
    if (!inflater.write(chunk.data)) await new Promise(resolve => inflater.once('drain', resolve));
  }
  inflater.end(); await consuming;
  assert.equal(position, scanlineLength * height); assert.equal(visible + transparent, width * height);
  assert.ok(visible > 0 && transparent > 0 && opaque > 0);
  assert.equal(coveredShipSamples, shipSamples.size); assert.ok(coveredShipSamples > 100);
  return { width, height, bytes: png.length, visible, transparent, opaque, probeAlpha, coveredShipSamples };
}

// Independent asset decoder supplies native wall pixels, avoiding reuse of the
// generated contour transform in the alignment assertions.
function decodeShipAlpha(png) {
  const records = pngChunks(png), header = records[0].data;
  assert.equal(header.readUInt32BE(0), SHIP_BOUNDS.width); assert.equal(header.readUInt32BE(4), SHIP_BOUNDS.height);
  assert.deepEqual([...header.subarray(8)], [8, 6, 0, 0, 0]);
  const stride = SHIP_BOUNDS.width * 4, raw = inflateSync(Buffer.concat(records.filter(record => record.type === 'IDAT').map(record => record.data)));
  const rgba = Buffer.alloc(stride * SHIP_BOUNDS.height), alpha = Buffer.alloc(SHIP_BOUNDS.width * SHIP_BOUNDS.height);
  for (let y = 0; y < SHIP_BOUNDS.height; y++) {
    const filter = raw[y * (stride + 1)]; assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, left = x >= 4 ? rgba[index - 4] : 0, above = y > 0 ? rgba[index - stride] : 0;
      const corner = y > 0 && x >= 4 ? rgba[index - stride - 4] : 0, prediction = left + above - corner;
      const dl = Math.abs(prediction - left), da = Math.abs(prediction - above), dc = Math.abs(prediction - corner);
      const predictors = [0, left, above, Math.floor((left + above) / 2), dl <= da && dl <= dc ? left : da <= dc ? above : corner];
      rgba[index] = (raw[y * (stride + 1) + 1 + x] + predictors[filter]) & 255;
      if (x % 4 === 3) alpha[y * SHIP_BOUNDS.width + (x - 3) / 4] = rgba[index];
    }
  }
  return alpha;
}
const shipAlpha = decodeShipAlpha(await fs.readFile(path.join(root, 'assets', 'ship.png')));
let shiftedAssetProbe;
for (let y = 200; y < SHIP_BOUNDS.height && !shiftedAssetProbe; y++) for (let x = 2200; x < SHIP_BOUNDS.width; x++) {
  if (shipAlpha[y * SHIP_BOUNDS.width + x] >= 128) { shiftedAssetProbe = { name: 'incorrectly shifted hull', x: fixture.ship.x + x, y: fixture.ship.y + y }; break; }
}
assert.ok(shiftedAssetProbe);

try {
  await desktop.evaluate(({ dialog }) => {
    global.__revolaFloor = { saves: [], opens: [], dialogs: [], messages: [] };
    dialog.showSaveDialog = async (_window, options) => {
      global.__revolaFloor.dialogs.push(options); const filePath = global.__revolaFloor.saves.shift();
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showOpenDialog = async () => {
      const filePath = global.__revolaFloor.opens.shift(); return filePath ? { canceled: false, filePaths: [filePath] } : { canceled: true, filePaths: [] };
    };
    dialog.showMessageBox = async (_window, options) => { global.__revolaFloor.messages.push(options); return { response: 0 }; };
  });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  for (const id of ['floor-png-button', 'floor-svg-button']) await expect(page.locator(`#${id}`)).toBeDisabled();
  await expect(page.locator('.floor-section, #floor-badge, #floor-info, #floor-generate-button, #floor-preview-toggle')).toHaveCount(0);
  for (const [id, label] of [['export-button', 'Save wall PNG'], ['svg-button', 'Save wall SVG'],
    ['floor-png-button', 'Save floor PNG'], ['floor-svg-button', 'Save floor SVG']]) {
    await expect(page.locator(`#${id}`)).toHaveText(label);
    await expect(page.locator(`.topbar #${id}`)).toHaveCount(1);
  }
  await page.locator('#grid-toggle').uncheck();
  evidence.interactions.push('Empty map disables floor exports; four consistently named exports share the header and the manual Floors panel is absent');
  if (packaged) assert.match((await page.evaluate(() => location.href)).toLowerCase(), /\/dist\/revolamapdrawer-win32-x64\/resources\/app(?:\.asar)?\/index\.html$/);
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const queueSave = filePath => desktop.evaluate((_electron, value) => global.__revolaFloor.saves.push(value), filePath);
  const state = () => page.evaluate(() => ({ title: document.title, name: document.getElementById('map-name').value,
    stats: document.getElementById('graph-stats').textContent, dimensions: document.getElementById('canvas-dimensions').textContent,
    dirty: document.getElementById('dirty-dot').classList.contains('dirty'),
    history: ['undo-button', 'redo-button'].map(id => ({ id, disabled: document.getElementById(id).disabled })) }));
  const expectFloorReady = async (closed = true) => {
    for (const id of ['floor-png-button', 'floor-svg-button']) {
      if (closed) await expect(page.locator(`#${id}`)).toBeEnabled();
      else await expect(page.locator(`#${id}`)).toBeDisabled();
    }
    await settled();
  };
  const open = async (filePath, name, closed = true) => {
    await desktop.evaluate((_electron, value) => global.__revolaFloor.opens.push(value), filePath);
    await page.locator('#open-button').click();
    await expect.poll(async () => (await page.locator('#status-message').textContent()).startsWith('Opened ') || await page.locator('#confirm-dialog').isVisible()).toBeTruthy();
    if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#document-title')).toHaveText(name);
    await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    await page.locator('#fit-button').click(); await expectFloorReady(closed);
  };
  const write = async (selector, filePath) => {
    await fs.rm(filePath, { force: true }); await queueSave(filePath); await page.locator(selector).click();
    await expect.poll(() => fs.stat(filePath).then(info => info.size).catch(() => 0), { timeout: 120_000 }).toBeGreaterThan(100);
    await expect(page.locator(selector)).toBeEnabled(); await expect(page.locator('#status-message')).not.toHaveClass(/error/);
    return fs.readFile(filePath);
  };
  const inspectSvgProbes = async (svg, probes) => page.evaluate(async ({ svg, probes }) => {
    const values = {};
    for (const probe of probes) {
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = xml.documentElement;
      root.setAttribute('width', 32); root.setAttribute('height', 32); root.setAttribute('viewBox', `${probe.x - 16} ${probe.y - 16} 32 32`);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(xml)], { type: 'image/svg+xml' }));
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      values[probe.name] = context.getImageData(16, 16, 1, 1).data[3]; URL.revokeObjectURL(url);
    }
    return values;
  }, { svg, probes });
  const mapPoint = (source, x, y) => page.evaluate(({ source, x, y }) => {
    const container = document.getElementById('canvas-container'), box = container.getBoundingClientRect();
    const scale = Math.min((container.clientWidth - 64) / source.width, (container.clientHeight - 52) / source.height);
    return { x: box.left + (container.clientWidth - source.width * scale) / 2 + (x - source.originX) * scale,
      y: box.top + (container.clientHeight - source.height * scale) / 2 + (y - source.originY) * scale };
  }, { source, x, y });
  const canvasPixels = async (source, closed, room = true) => {
    // Compare the visible canvas with the supplied texture in screen coordinates,
    // independently of the application floor cache. A reachable room must hide
    // those stars with an opaque black floor; exterior space shows them only on
    // a closed map. Grid and pointer overlays are kept outside the sampled areas.
    await page.mouse.move(0, 0); await settled();
    return page.evaluate(async ({ source, closed, room }) => {
      const canvas = document.getElementById('map-canvas'), container = document.getElementById('canvas-container');
      const ratio = devicePixelRatio || 1;
      const scale = Math.min((container.clientWidth - 64) / source.width, (container.clientHeight - 52) / source.height);
      const offsetX = (container.clientWidth - source.width * scale) / 2 - source.originX * scale;
      const offsetY = (container.clientHeight - source.height * scale) / 2 - source.originY * scale;
      const image = new Image(); image.src = new URL('./assets/editor-stars.png', location.href).href; await image.decode();
      const reference = document.createElement('canvas'); reference.width = canvas.width; reference.height = canvas.height;
      const expected = reference.getContext('2d', { willReadFrequently: true });
      expected.setTransform(ratio, 0, 0, ratio, 0, 0); expected.fillStyle = expected.createPattern(image, 'repeat');
      expected.fillRect(0, 0, container.clientWidth, container.clientHeight);
      const actual = canvas.getContext('2d', { willReadFrequently: true });
      const regions = [{ name: 'exterior', x: source.originX + 200, y: source.originY + 1200, width: 1200, height: 1800 }];
      if (room) regions.push({ name: 'reachable room', x: 2300, y: 3000, width: 1600, height: 1000 });
      return regions.map(region => {
        const left = Math.ceil((offsetX + region.x * scale) * ratio), top = Math.ceil((offsetY + region.y * scale) * ratio);
        const width = Math.floor(region.width * scale * ratio) - 1, height = Math.floor(region.height * scale * ratio) - 1;
        const observed = actual.getImageData(left, top, width, height).data;
        const texture = expected.getImageData(left, top, width, height).data;
        const showStars = closed && region.name === 'exterior';
        let mismatches = 0, texturePixels = 0, nonblack = 0, nonopaque = 0;
        for (let index = 0; index < observed.length; index += 4) {
          if (texture[index] || texture[index + 1] || texture[index + 2]) texturePixels++;
          if (observed[index] || observed[index + 1] || observed[index + 2]) nonblack++;
          if (observed[index + 3] !== 255) nonopaque++;
          for (let channel = 0; channel < 3; channel++) if (observed[index + channel] !== (showStars ? texture[index + channel] : 0)) { mismatches++; break; }
        }
        return { name: region.name, width, height, texturePixels, nonblack, nonopaque, mismatches };
      });
    }, { source, closed, room });
  };
  const expectCanvas = async (source, closed, room = true) => {
    const before = await state(); let pixels;
    await expect.poll(async () => {
      pixels = await canvasPixels(source, closed, room);
      return pixels.every(region => region.mismatches === 0 && region.nonopaque === 0 && region.texturePixels > 0);
    }).toBeTruthy();
    assert.deepEqual(await state(), before, 'Automatic floor and star rendering preserve dirty state and history');
    evidence.canvas ||= []; evidence.canvas.push({ name: source.name, closed, regions: pixels });
  };
  const exportBoth = async (name, source, probes = []) => {
    const before = await state();
    const png = await write('#floor-png-button', destination(`${name}.png`));
    assert.deepEqual(await state(), before, 'PNG floor preserves project dirty state and history');
    const pngDialog = await desktop.evaluate(() => global.__revolaFloor.dialogs.at(-1));
    assert.equal(pngDialog.title, 'Export floor PNG'); assert.deepEqual(pngDialog.filters[0].extensions, ['png']);
    assert.ok(pngDialog.defaultPath.endsWith('-floors.png'));
    const pngInfo = await inspectPng(png, source, probes);
    const svgBytes = await write('#floor-svg-button', destination(`${name}.svg`));
    assert.deepEqual(await state(), before, 'SVG floor preserves project dirty state and history');
    const svgDialog = await desktop.evaluate(() => global.__revolaFloor.dialogs.at(-1));
    assert.equal(svgDialog.title, 'Export floor SVG'); assert.deepEqual(svgDialog.filters[0].extensions, ['svg']);
    const svgInfo = await page.evaluate(text => {
      const xml = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = xml.documentElement;
      return { errors: xml.querySelectorAll('parsererror').length, width: svg.getAttribute('width'), height: svg.getAttribute('height'),
        viewBox: svg.getAttribute('viewBox'), paths: xml.querySelectorAll('path').length,
        forbidden: xml.querySelectorAll('image,metadata,script,foreignObject,text,rect,circle').length,
        colors: [...xml.querySelectorAll('path')].map(element => ({ fill: element.getAttribute('fill'), stroke: element.getAttribute('stroke') })) };
    }, svgBytes.toString('utf8'));
    assert.equal(svgInfo.errors, 0); assert.equal(Number(svgInfo.width), source.width); assert.equal(Number(svgInfo.height), source.height);
    assert.equal(svgInfo.viewBox, `${source.originX} ${source.originY} ${source.width} ${source.height}`);
    assert.ok(svgInfo.paths > 0); assert.equal(svgInfo.forbidden, 0, 'No walls raster, stars, editor overlays, metadata or executable SVG content');
    assert.ok(svgInfo.colors.every(({ fill, stroke }) => [null, '#000', '#000000', 'black', 'none'].includes(fill) && [null, '#000', '#000000', 'black', 'none'].includes(stroke)));
    const svgProbes = await inspectSvgProbes(svgBytes.toString('utf8'), probes);
    for (const probe of probes) {
      assert.equal(svgProbes[probe.name], pngInfo.probeAlpha[probe.name], `${probe.name} has consistent native PNG and SVG coverage`);
      if (probe.expectedAlpha != null) assert.equal(pngInfo.probeAlpha[probe.name], probe.expectedAlpha, `${probe.name} has the independently expected floor coverage`);
    }
    const shipCoverage = await page.evaluate(async ({ svg, source }) => {
      const { loadShip, shipBounds } = await import('./src/render.js');
      const ship = await loadShip(), bounds = shipBounds(source.ship), padding = 20;
      const left = bounds.left - padding, top = bounds.top - padding, width = ship.width + padding * 2, height = ship.height + padding * 2;
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = xml.documentElement;
      root.setAttribute('width', width); root.setAttribute('height', height); root.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(xml)], { type: 'image/svg+xml' }));
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      const floor = context.getImageData(0, 0, width, height).data; context.clearRect(0, 0, width, height);
      // Use the measured 29 px correction independently of floor/render helpers.
      context.translate(source.ship.x + (source.ship.mirrored ? 29 : 0) - left, source.ship.y - top); if (source.ship.mirrored) context.scale(-1, 1);
      context.drawImage(ship, -1269, -70); context.setTransform(1, 0, 0, 1, 0, 0);
      const original = context.getImageData(0, 0, width, height).data;
      let whitePixels = 0, uncovered = 0, nonblack = 0;
      for (let index = 0; index < floor.length; index += 4) {
        if (original[index + 3] >= 128) { whitePixels++; if (floor[index + 3] !== 255) uncovered++; }
        if (floor[index + 3] && (floor[index] || floor[index + 1] || floor[index + 2])) nonblack++;
      }
      URL.revokeObjectURL(url); canvas.width = canvas.height = 0;
      return { width, height, whitePixels, uncovered, nonblack };
    }, { svg: svgBytes.toString('utf8'), source });
    assert.ok(shipCoverage.whitePixels > 100_000); assert.equal(shipCoverage.uncovered, 0); assert.equal(shipCoverage.nonblack, 0);
    evidence.exports.push({ name, png: pngInfo, svg: { ...svgInfo, bytes: svgBytes.length, probeAlpha: svgProbes, shipCoverage } });
    return pngInfo;
  };

  await open(exteriorPath, exteriorDoor.name, false); await expectCanvas(exteriorDoor, false);
  await page.screenshot({ path: destination('open-editor.png') });
  await open(gapPath, gap.name, false); await expectCanvas(gap, false);
  evidence.interactions.push('Exterior door and tiny exterior erasure automatically disable floor exports and remove the repeating star background');
  await open(fixturePath, fixture.name); await expectCanvas(fixture, true);
  const initialSeedSvg = await write('#floor-svg-button', destination('initial-seed.svg'));
  assert.equal(initialSeedSvg.toString('utf8'), renderFloorSvg(fixture), 'Initial native floor SVG matches the fresh pure geometry export');
  await open(alternateSeedPath, alternateSeed.name); await expectCanvas(alternateSeed, true);
  const differentSeedSvg = await write('#floor-svg-button', destination('alternate-seed.svg'));
  assert.equal(differentSeedSvg.toString('utf8'), renderFloorSvg(alternateSeed), 'Opening identical geometry with a new seed regenerates the current texture');
  assert.ok(!differentSeedSvg.equals(initialSeedSvg), 'A previous generated floor cannot leak through the geometry cache when only the texture seed changed');
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push('Open automatically renders the black floor and repeated stars; a texture-seed-only reopening exports fresh matching floor contours without changing the project');
  await page.locator('#new-button').click(); await expect(page.locator('#document-title')).toHaveText('Untitled map');
  await expectFloorReady(false); await page.locator('#fit-button').click(); await settled();
  await expectCanvas(createDocument(), false, false);
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#redo-button')).toBeDisabled();
  evidence.interactions.push('New removes the previous floor and stars, disables both floor exports and leaves an empty clean history');
  await open(courtyardPath, courtyard.name); await expectCanvas(courtyard, true);
  const courtyardProbes = [{ name: 'sealed courtyard', x: 3200, y: 2300, expectedAlpha: 0 },
    { name: 'courtyard wall', x: 3000, y: 2100, expectedAlpha: 255 },
    { name: 'courtyard rim', x: 3022, y: 2122, expectedAlpha: 255 },
    { name: 'accessible station', x: 2400, y: 1800, expectedAlpha: 255 },
    { name: 'exterior space', x: 1700, y: 1800, expectedAlpha: 0 }];
  await exportBoth('sealed-courtyard', courtyard, courtyardProbes);
  await page.screenshot({ path: destination('courtyard-editor.png') });
  await page.locator('[data-tool="door"]').click();
  const courtyardDoorAim = await mapPoint(courtyard, 3000, 2100); await page.mouse.click(courtyardDoorAim.x, courtyardDoorAim.y);
  await expectFloorReady(); await expectCanvas(courtyard, true); await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  const openedCourtyardSvg = await write('#floor-svg-button', destination('opened-courtyard.svg'));
  assert.equal((await inspectSvgProbes(openedCourtyardSvg.toString('utf8'), courtyardProbes))['sealed courtyard'], 255, 'A real internal door makes the courtyard reachable and fills it');
  await page.locator('#undo-button').click(); await expectFloorReady(); await expectCanvas(courtyard, true);
  const restoredCourtyardSvg = await write('#floor-svg-button', destination('restored-courtyard.svg'));
  assert.equal((await inspectSvgProbes(restoredCourtyardSvg.toString('utf8'), courtyardProbes))['sealed courtyard'], 0, 'Undo restores the courtyard hole');
  const restoredCourtyard = await write('#project-button', destination('courtyard-after-history.revola.json'));
  assert.deepEqual(validateDocument(JSON.parse(restoredCourtyard.toString('utf8'))), courtyard);
  evidence.interactions.push('Sealed inner courtyard remains transparent with a black wall rim; a real internal door fills it and undo restores its hole without opening the map');
  await open(fixturePath, fixture.name); await expectCanvas(fixture, true);
  await page.locator('[data-tool="door"]').click();
  const exteriorAim = await mapPoint(fixture, 3000, 1000);
  await page.mouse.click(exteriorAim.x, exteriorAim.y); await expectFloorReady(false); await expectCanvas(fixture, false);
  await page.locator('#undo-button').click(); await expectFloorReady(); await expectCanvas(fixture, true);
  await page.locator('#redo-button').click(); await expectFloorReady(false); await expectCanvas(fixture, false);
  await page.locator('#undo-button').click(); await expectFloorReady(); await expectCanvas(fixture, true);
  const restored = await write('#project-button', destination('closed-after-door-history.revola.json'));
  assert.deepEqual(validateDocument(JSON.parse(restored.toString('utf8'))), fixture, 'Real outer doorway cut and history restore exact map geometry');
  evidence.interactions.push('An outer-door edit removes floor and stars; one-step undo/redo automatically restores or removes them and export readiness with exact geometry');
  await page.screenshot({ path: destination('editor.png') });
  await page.locator('#map-name').fill('Unsaved floor test'); await page.locator('#map-name').blur();
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  const renamed = { ...fixture, name: 'Unsaved floor test' };
  const pngInfo = await exportBoth('closed', renamed, [
    { name: 'room', x: 2500, y: 2000 }, { name: 'door', x: 4300, y: 2700 },
    { name: 'white wall underfloor', x: 2500, y: 1000 }, { name: 'outer rim', x: 2500, y: 969 },
    { name: 'space', x: 2500, y: 900 }, { name: 'ship interior', x: 4200, y: 5600 },
    shiftedAssetProbe,
  ]);
  for (const name of ['room', 'door', 'white wall underfloor', 'outer rim', 'ship interior']) assert.equal(pngInfo.probeAlpha[name], 255, `${name} has solid black coverage`);
  assert.equal(pngInfo.probeAlpha.space, 0, 'Exterior space stays transparent');
  assert.equal(pngInfo.probeAlpha['incorrectly shifted hull'], 0, 'Asset-local contour coordinates do not shift the ship floor outside its real footprint');
  await page.locator('#mirror-button').click(); await expectFloorReady();
  const mirrored = structuredClone(renamed); mirrored.ship.mirrored = true;
  await expectCanvas(mirrored, true);
  await exportBoth('mirrored', mirrored);
  await page.locator('#undo-button').click(); await expectFloorReady(); await expectCanvas(renamed, true);
  evidence.interactions.push('Real ship mirroring regenerates both aligned floor formats; a single undo restores the original footprint');
  const beforeRapidHistory = await state();
  await page.evaluate(() => {
    // Both commands run before a deferred closure check can inspect the mirror.
    document.getElementById('mirror-button').click(); document.getElementById('undo-button').click();
  });
  await expectFloorReady(); await expectCanvas(renamed, true);
  assert.deepEqual(await state(), beforeRapidHistory, 'Rapid mirror and undo restore dirty state and history controls without a stale pending floor');
  const rapidHistorySvg = await write('#floor-svg-button', destination('rapid-mirror-undo.svg'));
  assert.equal(rapidHistorySvg.toString('utf8'), renderFloorSvg(renamed), 'Rapid history preserves the current ship orientation and exact floor contours');
  evidence.interactions.push('Synchronous mirror then undo retains enabled floor exports, automatic floor and stars, exact original SVG and unchanged dirty/history controls');
  evidence.interactions.push('Always-visible automatic black floor covers rooms, internal doors, white wall footprints and the exterior rim without adding document history');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(() => desktop.evaluate(() => global.__revolaFloor.messages.length)).toBe(1);
  assert.equal(await desktop.evaluate(() => global.__revolaFloor.messages[0].title), 'Unsaved map');
  await expect(page.locator('#map-canvas')).toBeVisible();
  const dirtyBefore = await state();
  for (const selector of ['#floor-png-button', '#floor-svg-button']) {
    await page.locator(selector).click(); await expect(page.locator('#status-message')).toContainText('canceled');
    assert.deepEqual(await state(), dirtyBefore);
    await queueSave(blockedPath); await page.locator(selector).click(); await expect(page.locator('#status-message')).toHaveClass(/error/);
    await expect(page.locator(selector)).toBeEnabled(); assert.deepEqual(await state(), dirtyBefore);
  }
  assert.ok((await fs.stat(blockedPath)).isDirectory());
  assert.equal((await fs.readdir(artifacts)).filter(name => name.startsWith(path.basename(blockedPath) + '.') && name.endsWith('.tmp')).length, 0);
  const savedProject = await write('#project-button', destination('after-exports.revola.json'));
  assert.deepEqual(validateDocument(JSON.parse(savedProject.toString('utf8'))), renamed);
  await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
  evidence.interactions.push('Both floor formats preserve dirty-close protection, native cancellation, atomic write failure and exact project geometry; project save clears dirty state');

  if (userDocument) {
    await open(userSource, userDocument.name); await expectCanvas(userDocument, true, false);
    await exportBoth('complex-user-map', userDocument, [
      { name: 'upper left courtyard', x: 2500, y: 1500, expectedAlpha: 0 },
      { name: 'central courtyard', x: 3500, y: 2500, expectedAlpha: 0 },
      { name: 'right courtyard', x: 5500, y: 3000, expectedAlpha: 0 },
      { name: 'lower left courtyard', x: 1500, y: 4500, expectedAlpha: 0 },
      { name: 'central reachable room', x: 3500, y: 3500, expectedAlpha: 255 },
      { name: 'upper reachable corridor', x: 5500, y: 1500, expectedAlpha: 255 },
      { name: 'lower reachable room', x: 4500, y: 4500, expectedAlpha: 255 },
    ]);
    assert.ok((await fs.readFile(userSource)).equals(userBytes), 'Supplied project remains byte-for-byte untouched');
    await page.screenshot({ path: destination('complex-editor.png') });
    evidence.interactions.push('Supplied complex 16384 map automatically shows floor and stars and exports both floor formats without changing its source project');
  }
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700)); await settled();
  const compact = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
    controls: ['export-button', 'svg-button', 'floor-png-button', 'floor-svg-button', 'map-canvas'].map(id => {
      const element = document.getElementById(id), box = element.getBoundingClientRect(), css = getComputedStyle(element);
      return { id, x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
        text: element.textContent.trim(), font: css.font, padding: css.padding, radius: css.borderRadius,
        borderWidth: css.borderWidth, background: css.backgroundColor, border: css.borderColor, color: css.color,
        clipped: element.scrollWidth > element.clientWidth };
    }) }));
  assert.equal(compact.overflow, false);
  for (const control of compact.controls) {
    assert.ok(control.x >= 0 && control.y >= 0 && control.right <= compact.width + 1 && control.bottom <= compact.height + 1, `${control.id} visible in compact window`);
    assert.ok(control.width > 20 && control.height > 20, `${control.id} usable in compact window`);
    assert.equal(control.clipped, false, `${control.id} label is not clipped`);
  }
  const buttons = compact.controls.filter(control => control.id !== 'map-canvas');
  for (const button of buttons) {
    for (const property of ['font', 'padding', 'radius', 'borderWidth']) assert.equal(button[property], buttons[0][property], `All export buttons share ${property}`);
    assert.equal(button.y, buttons[0].y, 'All four exports share the header row');
  }
  for (const [first, second] of [[buttons[0], buttons[2]], [buttons[1], buttons[3]]]) {
    for (const property of ['background', 'border', 'color']) assert.equal(first[property], second[property], `${first.id} and ${second.id} share format styling`);
  }
  assert.ok(['background', 'border', 'color'].some(property => buttons[0][property] !== buttons[1][property]), 'PNG and SVG formats have distinguishable styling');
  await page.screenshot({ path: destination('compact.png') }); evidence.compactWindow = compact;
  evidence.interactions.push('1024 × 700 header shows four unclipped, consistently styled export labels, with matching PNG and SVG pairs and no manual Floors panel');
  assert.deepEqual(errors, []);
  await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ packaged, interactions: evidence.interactions, exports: evidence.exports, compactWindow: `${compact.width} × ${compact.height}`, rendererErrors: errors, evidenceFile: destination('results.json') }, null, 2));
} catch (error) {
  await page.screenshot({ path: destination('failure.png') }).catch(() => {}); console.error('Renderer errors:', errors); throw error;
} finally { await desktop.close(); }
