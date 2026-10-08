// Real browser raster/export verification without decoding a 1 GiB RGBA image.
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createInflate } from 'node:zlib';
import { decodePngMetadata } from '../src/png.js';
import { validateDocument } from '../src/model.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ args: [root], cwd: root, env, timeout: 45_000 });
const evidence = [];

async function inspectRaster(bytes, expected) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.deepEqual([...bytes.subarray(24, 29)], [8, 4, 0, 0, 0]);
  const idats = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') idats.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const regions = expected.regions.map(region => ({ ...region, expectedAlpha: Buffer.from(region.alpha, 'base64'),
    actual: createHash('sha256'), rows: 0, differingPixels: 0, aboveOneAlphaPixels: 0, interiorDifferences: 0, maxAlphaDifference: 0,
    seamPixelsCompared: 0, seamDifferingPixels: 0, seamAboveOneAlphaPixels: 0, maxSeamAlphaDifference: 0, seamDifferences: [] }));
  const rowBytes = width * 2 + 1, alpha = Buffer.alloc(width);
  let remainder = Buffer.alloc(0), row = 0, visible = 0, semitransparent = 0, seamVisible = 0;
  for await (const part of Readable.from(idats).pipe(createInflate())) {
    const data = remainder.length ? Buffer.concat([remainder, part]) : part;
    let offset = 0;
    while (offset + rowBytes <= data.length) {
      assert.equal(data[offset], 1, 'Sub filter');
      assert.equal(data[offset + 1], 255, 'First grayscale sample is white');
      let lastAlpha = 0;
      for (let x = 0; x < width; x++) {
        if (x) assert.equal(data[offset + x * 2 + 1], 0, 'Every grayscale sample remains white');
        lastAlpha = (lastAlpha + data[offset + x * 2 + 2]) & 255;
        alpha[x] = lastAlpha;
        if (lastAlpha) {
          visible++;
          if (lastAlpha < 255) semitransparent++;
          if (row % 192 === 0 || row % 192 === 191) seamVisible++;
        }
      }
      for (const region of regions) {
        const py = region.y - expected.document.originY, px = region.x - expected.document.originX;
        if (row >= py && row < py + region.height) {
          region.actual.update(alpha.subarray(px, px + region.width));
          for (let x = 0; x < region.width; x++) {
            const actual = alpha[px + x], reference = region.expectedAlpha[region.rows * region.width + x];
            const difference = Math.abs(actual - reference);
            const seam = row % 192 === 0 || row % 192 === 191;
            if (seam) region.seamPixelsCompared++;
            if (difference) {
              region.differingPixels++;
              if (difference > 1) region.aboveOneAlphaPixels++;
              if ((reference === 0 || reference === 255) && x > 0 && x < region.width - 1 && region.rows > 0 && region.rows < region.height - 1) {
                const center = region.rows * region.width + x;
                const surrounded = [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => region.expectedAlpha[center + dy * region.width + dx] === reference));
                if (surrounded) region.interiorDifferences++;
              }
              region.maxAlphaDifference = Math.max(region.maxAlphaDifference, difference);
              if (seam) {
                region.seamDifferingPixels++;
                if (difference > 1) region.seamAboveOneAlphaPixels++;
                region.maxSeamAlphaDifference = Math.max(region.maxSeamAlphaDifference, difference);
                if (region.seamDifferences.length < 20) region.seamDifferences.push({ x: px + x, y: row, actual, reference });
              }
            }
          }
          region.rows++;
        }
      }
      row++; offset += rowBytes;
    }
    remainder = Buffer.from(data.subarray(offset));
  }
  assert.equal(remainder.length, 0);
  assert.equal(row, height);
  assert.ok(visible > 0 && visible < width * height);
  assert.ok(semitransparent > 0 && seamVisible > 0, 'Antialiasing and stripe-boundary geometry were exercised');
  for (const region of regions) {
    assert.equal(region.rows, region.height);
    region.actualSha256 = region.actual.digest('hex');
    if (region.name === 'whole ship') assert.equal(region.actualSha256, region.sha256, 'Ship alpha is pixel-exact');
    // Chromium quantizes edge coverage differently after integer translation.
    // A compound path can differ by one alpha unit along diagonal silhouettes.
    // Permit a single alpha unit only on the silhouette, never through solid
    // wall interiors or empty background. Larger differences retain the 0.01%
    // budget and maximum 8/255. Internal cracks fail even at one alpha unit.
    assert.equal(region.interiorDifferences, 0, `${region.name}: opaque walls and clear background must match exactly away from their silhouettes`);
    assert.ok(region.aboveOneAlphaPixels <= region.width * region.height / 10000, `${region.name}: fewer than 0.01% of pixels may differ by more than one alpha unit`);
    assert.ok(region.maxAlphaDifference <= 8, `${region.name}: maximum native alpha rounding is 8/255`);
    assert.ok(region.seamPixelsCompared > 0);
    // Apply the same rounding budget at stripe boundaries as in the interior.
    // Sharp fractional miter tips can land on one seam pixel; a seam-wide defect
    // must still fail, even when every individual alpha difference is small.
    assert.ok(region.seamAboveOneAlphaPixels <= region.seamPixelsCompared / 10000, `${region.name}: fewer than 0.01% of seam pixels may differ by more than one alpha unit`);
    assert.ok(region.maxSeamAlphaDifference <= 8, `${region.name}: seam alpha rounding is bounded to 8/255`);
  }
  return { width, height, visible, transparent: width * height - visible, semitransparent, seamVisible,
    referencePixels: regions.reduce((count, region) => count + region.width * region.height, 0),
    comparedRegions: regions.map(({ actual, alpha, expectedAlpha, ...region }) => region), maxDecoderRowBytes: rowBytes };
}

try {
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const expanded of [false, true]) {
    const started = Date.now();
    console.log(`Rendering ${expanded ? 16384 : 8192} square with real Chromium Canvas 2D…`);
    const result = await page.evaluate(async expanded => {
      const { createDocument, addWall, addDoor, eraseWalls, validateDocument } = await import('./src/model.js');
      const { drawMap, loadShip } = await import('./src/render.js');
      const { renderMapPng } = await import('./src/export.js');
      const document = createDocument();
      document.name = expanded ? 'Expanded raster verification' : 'Default raster verification';
      addWall(document, { x: 100, y: 256 }, { x: 2600, y: 256 });
      addDoor(document, document.edges[0].id, { x: 1325, y: 256 });
      addWall(document, { x: 100, y: 600 }, { x: 2100, y: 600 });
      eraseWalls(document, { x: 1024, y: 600 }, { x: 1124, y: 600 }, 43.75);
      addWall(document, { x: 100, y: 900 }, { x: 1300, y: 2100 });
      addDoor(document, document.edges.at(-1).id, { x: 700, y: 1500 });
      // Sharp miters straddle output stripe boundaries, including an acute join.
      addWall(document, { x: 1700, y: 1536 }, { x: 2450, y: 1536 });
      addWall(document, { x: 2450, y: 1536 }, { x: 1950, y: 1036 });
      addWall(document, { x: 1700, y: 1920 }, { x: 2500, y: 1920 });
      addWall(document, { x: 2500, y: 1920 }, { x: 2500, y: 2300 });
      if (expanded) {
        addWall(document, { x: -900, y: -512 }, { x: -100, y: -512 });
        addWall(document, { x: -900, y: -900 }, { x: -100, y: -100 });
        document.ship.mirrored = true;
      }
      validateDocument(document);
      const shipImage = await loadShip();
      // Each conventional reference canvas crosses several export stripe seams.
      const regions = [
        { name: 'walls, doorway and erased gap', x: 0, y: 0, width: 2800, height: 2400 },
        { name: 'whole ship', x: 2800, y: 4660, width: 2600, height: 2048 },
      ];
      if (expanded) regions.push({ name: 'negative world coordinates', x: -1024, y: -1024, width: 1024, height: 1024 });
      for (const region of regions) {
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = region.width; canvas.height = region.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.translate(-region.x, -region.y);
        if (region.name === 'whole ship') {
          // Independent raw-image reference catches a renderer/export that
          // mirrors around the legacy anchor instead of the doorway center.
          context.translate(document.ship.x + (document.ship.mirrored ? 29 : 0), document.ship.y);
          if (document.ship.mirrored) context.scale(-1, 1);
          context.drawImage(shipImage, -1269, -70);
        } else drawMap(context, document, { shipImage });
        const rgba = context.getImageData(0, 0, region.width, region.height).data;
        const alpha = new Uint8Array(region.width * region.height);
        for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', alpha));
        region.sha256 = [...hash].map(value => value.toString(16).padStart(2, '0')).join('');
        let raw = '';
        for (let i = 0; i < alpha.length; i += 8192) raw += String.fromCharCode(...alpha.subarray(i, i + 8192));
        region.alpha = btoa(raw);
        canvas.width = canvas.height = 0;
      }
      const NativeCanvas = globalThis.OffscreenCanvas, allocations = [], reads = [], progress = [];
      const prototype = OffscreenCanvasRenderingContext2D.prototype;
      const nativeRead = prototype.getImageData;
      globalThis.OffscreenCanvas = class extends NativeCanvas {
        constructor(width, height) { super(width, height); allocations.push({ width, height, rgbaBytes: width * height * 4 }); }
      };
      prototype.getImageData = function (x, y, width, height, ...options) {
        reads.push({ width, height, rgbaBytes: width * height * 4 });
        return nativeRead.call(this, x, y, width, height, ...options);
      };
      let png;
      try { png = await renderMapPng(document, { shipImage, onProgress: value => progress.push(value) }); }
      finally { globalThis.OffscreenCanvas = NativeCanvas; prototype.getImageData = nativeRead; }
      let binary = '';
      for (let i = 0; i < png.length; i += 8192) binary += String.fromCharCode(...png.subarray(i, i + 8192));
      return { png: btoa(binary), document, allocations, reads, progress, regions };
    }, expanded);
    const png = Buffer.from(result.png, 'base64');
    const filename = `export-raster-${result.document.width}.png`;
    await fs.writeFile(path.join(artifacts, filename), png);
    assert.deepEqual(validateDocument(decodePngMetadata(png)), result.document);
    assert.equal(result.allocations.length, 1);
    assert.deepEqual(result.allocations[0], { width: result.document.width, height: 256, rgbaBytes: result.document.width * 256 * 4 });
    assert.equal(result.reads.length, Math.ceil(result.document.height / 192));
    assert.ok(result.reads.every(read => read.rgbaBytes <= 16 * 1024 * 1024));
    assert.equal(result.progress[0], 0); assert.equal(result.progress.at(-1), 1);
    assert.ok(result.progress.every((value, index) => !index || value > result.progress[index - 1]));
    const raster = await inspectRaster(png, result);
    evidence.push({ filename, bytes: png.length, milliseconds: Date.now() - started, originX: result.document.originX,
      originY: result.document.originY, shipMirrored: result.document.ship.mirrored, allocations: result.allocations,
      readbacks: result.reads.length, maxReadbackBytes: Math.max(...result.reads.map(read => read.rgbaBytes)),
      progressUpdates: result.progress.length, metadataRoundTrip: true, ...raster });
    console.log(JSON.stringify(evidence.at(-1), null, 2));
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'export-raster-results.json'), JSON.stringify({ evidence, rendererErrors: errors }, null, 2));
} finally { await desktop.close(); }
