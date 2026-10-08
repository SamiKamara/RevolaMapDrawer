import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePngStripes, renderMapPng, renderFloorPng, EXPORT_STRIPE_HEIGHT } from '../src/export.js';
import { decodePngMetadata } from '../src/png.js';
import { createDocument } from '../src/model.js';

function chunks(png) {
  const bytes = Buffer.from(png), result = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    result.push({ type: bytes.toString('ascii', offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  return result;
}

function readRaster(png) {
  const records = chunks(png), header = records[0].data;
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.deepEqual([...header.subarray(8)], [8, 4, 0, 0, 0]);
  const raw = inflateSync(Buffer.concat(records.filter((record) => record.type === 'IDAT').map((record) => record.data)));
  assert.equal(raw.length, (width * 2 + 1) * height);
  const grayAlpha = Buffer.alloc(width * height * 2);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 2 + 1);
    assert.equal(raw[row], 1, 'PNG uses a Sub-filtered row');
    for (let i = 0; i < width * 2; i++) {
      grayAlpha[y * width * 2 + i] = (raw[row + 1 + i] + (i < 2 ? 0 : grayAlpha[y * width * 2 + i - 2])) & 255;
    }
  }
  return { width, height, grayAlpha };
}

test('streamed PNG preserves every alpha byte and forces white through stripe boundaries', async () => {
  const width = 257, height = 529;
  const metadata = { format: 'revola-map', version: 2, name: 'Laajennus 船', width, height, originX: -4096, originY: -4096 };
  const progress = [], generated = [];
  async function* stripes() {
    for (let top = 0; top < height; top += EXPORT_STRIPE_HEIGHT) {
      const count = Math.min(EXPORT_STRIPE_HEIGHT, height - top);
      const data = new Uint8ClampedArray(width * count * 4);
      for (let y = 0; y < count; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = 19; data[i + 1] = 83; data[i + 2] = 137;
        data[i + 3] = (x * 73 + (y + top) * 37) & 255;
      }
      generated.push(count);
      yield { data, height: count };
    }
  }
  const png = await encodePngStripes({ width, height, stripes: stripes(), metadata, onProgress: (value) => progress.push(value) });
  assert.deepEqual(decodePngMetadata(png), metadata, 'All chunks have valid CRCs and metadata round-trips');
  const raster = readRaster(png);
  assert.equal(raster.width, width); assert.equal(raster.height, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    assert.equal(raster.grayAlpha[(y * width + x) * 2], 255);
    assert.equal(raster.grayAlpha[(y * width + x) * 2 + 1], (x * 73 + y * 37) & 255);
  }
  assert.deepEqual(generated, [256, 256, 17]);
  assert.equal(progress[0], 0); assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => !index || value > progress[index - 1]));
});

test('streaming handles all-transparent and partially transparent single rows', async () => {
  for (const alpha of [0, 1, 127, 255]) {
    const png = await encodePngStripes({ width: 1, height: 1, metadata: { alpha }, stripes: [{ data: new Uint8Array([0, 0, 0, alpha]), height: 1 }] });
    assert.deepEqual([...readRaster(png).grayAlpha], [255, alpha]);
  }
});

test('visual PNGs omit editable metadata and retain black coverage across stripes', async () => {
  const width = 17, height = 259;
  async function* stripes() {
    for (let top = 0; top < height; top += EXPORT_STRIPE_HEIGHT) {
      const count = Math.min(EXPORT_STRIPE_HEIGHT, height - top);
      const data = new Uint8ClampedArray(width * count * 4);
      for (let y = 0; y < count; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        // The encoder takes only coverage; input color cannot leak into a floor.
        data[offset] = 255; data[offset + 1] = 100; data[offset + 2] = 50;
        data[offset + 3] = (x * 41 + (y + top) * 17) & 255;
      }
      yield { data, height: count };
    }
  }
  const png = await encodePngStripes({ width, height, stripes: stripes(), grayscale: 0 });
  assert.ok(!chunks(png).some(({ type }) => type === 'iTXt'), 'Floor export is a visual asset only');
  assert.throws(() => decodePngMetadata(png), /no Revola Map metadata/, 'PNG chunks and CRCs remain valid without editable metadata');
  const { grayAlpha } = readRaster(png);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    assert.equal(grayAlpha[(y * width + x) * 2], 0);
    assert.equal(grayAlpha[(y * width + x) * 2 + 1], (x * 41 + y * 17) & 255);
  }
  const intermediate = await encodePngStripes({ width: 1, height: 1, grayscale: 137, metadata: null, stripes: [{ data: new Uint8Array([255, 255, 255, 127]), height: 1 }] });
  assert.deepEqual([...readRaster(intermediate).grayAlpha], [137, 127]);
});

test('invalid grayscale is rejected before rendering or consuming any raster', async () => {
  let started = false;
  async function* stripes() { started = true; yield { data: new Uint8Array(4), height: 1 }; }
  for (const grayscale of [-1, 256, 0.5, NaN, Infinity, null, '0', true]) {
    await assert.rejects(encodePngStripes({ width: 1, height: 1, stripes: stripes(), grayscale }), /grayscale/);
  }
  assert.equal(started, false);
});

test('bad dimensions and oversized metadata are rejected before requesting raster data', async () => {
  let started = false;
  async function* stripes() { started = true; yield { data: new Uint8Array(4), height: 1 }; }
  for (const [width, height] of [[0, 1], [1, 0], [16385, 1], [1, 16385], [1.5, 1], [NaN, 1]]) {
    await assert.rejects(encodePngStripes({ width, height, metadata: {}, stripes: stripes() }), /dimensions/);
  }
  await assert.rejects(encodePngStripes({ width: 1, height: 1, metadata: { name: 'x'.repeat(4 * 1024 * 1024) }, stripes: stripes() }), /4 MiB/);
  assert.equal(started, false);
});

test('short, oversized and invalid stripes abort compression without hanging', async () => {
  const valid = { data: new Uint8Array(8), height: 1 };
  for (const stripes of [[], [valid], [valid, valid, valid], [{ data: new Uint8Array(4), height: 1 }], [{ data: [], height: 1 }], [{ data: new Uint8Array(8 * 257), height: 257 }]]) {
    await assert.rejects(encodePngStripes({ width: 2, height: 2, metadata: {}, stripes }), /raster stripe|every image row/);
  }
  let cleanedUp = false;
  async function* failing() {
    try { yield valid; throw new Error('Raster readback failed'); } finally { cleanedUp = true; }
  }
  await assert.rejects(encodePngStripes({ width: 2, height: 2, metadata: {}, stripes: failing() }), /Raster readback failed/);
  assert.equal(cleanedUp, true);
});

test('compressed output is bounded to 32 MiB while consuming one stripe at a time', { timeout: 30_000 }, async () => {
  let seed = 984613, generated = 0;
  async function* noise() {
    for (let top = 0; top < 3072; top += EXPORT_STRIPE_HEIGHT) {
      const data = new Uint8Array(16384 * EXPORT_STRIPE_HEIGHT * 4);
      for (let i = 3; i < data.length; i += 4) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        data[i] = seed & 255;
      }
      generated++;
      yield { data, height: EXPORT_STRIPE_HEIGHT };
    }
  }
  await assert.rejects(encodePngStripes({ width: 16384, height: 3072, metadata: {}, stripes: noise() }), /32 MiB/);
  assert.ok(generated < 12, 'The encoder stops requesting raster data when the byte budget is exceeded');
});

test('map export translates world origins and never requests a full-map canvas', async (t) => {
  const created = [], transforms = [], reads = [];
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; created.push({ width, height, canvas: this }); }
    getContext() {
      return {
        save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, scale() {}, drawImage() {}, setTransform() {}, clearRect() {},
        translate: (x, y) => transforms.push([x, y]),
        getImageData: (x, y, width, height) => { reads.push({ x, y, width, height }); return { data: new Uint8ClampedArray(width * height * 4) }; },
      };
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: Canvas });
  t.after(() => previous ? Object.defineProperty(globalThis, 'OffscreenCanvas', previous) : delete globalThis.OffscreenCanvas);
  const document = { width: 16384, height: 513, originX: -4096, originY: -4096, vertices: [], edges: [], ship: { x: 4096, y: 4740, mirrored: false } };
  const png = await renderMapPng(document, { shipImage: {} });
  assert.deepEqual(created.map(({ width, height }) => [width, height]), [[16384, 256]]);
  assert.deepEqual(reads.map(({ height }) => height), [192, 192, 129]);
  assert.ok(reads.every(({ x, y }) => x === 0 && y === 32), 'Guard rows are cropped from every exported stripe');
  assert.deepEqual(transforms.filter(([x]) => x === 4096).filter(([, y]) => y !== 4740), [[4096, 4128], [4096, 3936], [4096, 3744]]);
  assert.equal(created[0].canvas.width, 0, 'Temporary canvas is released');
  assert.deepEqual(decodePngMetadata(png), document);
});

test('floor PNG preserves world alignment and uses bounded transparent stripes without ship artwork', async (t) => {
  const created = [], transforms = [], reads = [], paintColors = [], points = [];
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; created.push({ width, height, canvas: this }); }
    getContext() {
      return {
        save() {}, restore() {}, beginPath() {}, closePath() {}, setTransform() {}, clearRect() {},
        moveTo: (x, y) => points.push([x, y]), lineTo: (x, y) => points.push([x, y]),
        fill() { paintColors.push(this.fillStyle); }, stroke() { paintColors.push(this.strokeStyle); },
        drawImage() { assert.fail('Floor export must not paint ship artwork'); },
        translate: (x, y) => transforms.push([x, y]),
        getImageData: (x, y, width, height) => {
          reads.push({ x, y, width, height });
          const data = new Uint8ClampedArray(width * height * 4);
          // One opaque sample makes the encoded grayscale observable.
          data.set([255, 255, 255, 255]);
          return { data };
        },
      };
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: Canvas });
  t.after(() => previous ? Object.defineProperty(globalThis, 'OffscreenCanvas', previous) : delete globalThis.OffscreenCanvas);
  const document = { width: 16384, height: 513, originX: -4096, originY: -4096 };
  const floor = { ...document, closed: true, outlineWidth: 60, shipOutlineWidth: 24, shipPolygons: [], polygons: [[{ x: -100, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 300 }, { x: -100, y: 300 }]] };
  const before = structuredClone({ document, floor });
  const png = await renderFloorPng(document, { floor });
  assert.deepEqual(created.map(({ width, height }) => [width, height]), [[16384, 256]]);
  assert.deepEqual(reads.map(({ height }) => height), [192, 192, 129]);
  assert.ok(reads.every(({ x, y }) => x === 0 && y === 32));
  assert.deepEqual(transforms, [[4096, 4128], [4096, 3936], [4096, 3744]]);
  assert.equal(created[0].canvas.width, 0, 'Temporary stripe canvas is released');
  assert.ok(points.some(([x, y]) => x === -100 && y === 100), 'Floor retains its original world coordinates');
  assert.ok(paintColors.length > 0);
  assert.ok(paintColors.every(color => color === '#000' || color === '#000000' || color === 'black'), 'Only black floor geometry is painted');
  assert.throws(() => decodePngMetadata(png), /no Revola Map metadata/);
  const raster = readRaster(png);
  assert.equal(raster.width, 16384); assert.equal(raster.height, 513);
  for (const y of [0, 192, 384]) {
    assert.deepEqual([...raster.grayAlpha.subarray(y * 16384 * 2, y * 16384 * 2 + 4)], [0, 255, 0, 0]);
  }
  assert.deepEqual({ document, floor }, before, 'Visual export never edits the map or generated coverage');
});

test('floor PNG rejects an open map before allocating raster storage', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: class { constructor() { assert.fail('Open floors must be rejected before canvas allocation'); } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'OffscreenCanvas', previous) : delete globalThis.OffscreenCanvas);
  await assert.rejects(renderFloorPng(createDocument()), /closed|outside|open|escape/i);
  await assert.rejects(renderFloorPng(createDocument(), { floor: { closed: false, reason: 'An outer door reaches space.' } }), /outer door reaches space/);
  await assert.rejects(renderFloorPng(createDocument(), { floor: { closed: true, width: 16384, height: 16384, originX: -4096, originY: -4096 } }), /Regenerate the floor/);
});
