import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { SHIP_ANCHOR, SHIP_BOUNDS } from '../src/render.js';
import { shipWorldPoint } from '../src/ship.js';

// Decode the actual bundled raster independently of the Python extraction.
// The only accepted asset format is noninterlaced 8-bit RGBA PNG.
function decodeAsset() {
  const png = readFileSync(new URL('../assets/ship.png', import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.deepEqual([...png.subarray(24, 29)], [8, 6, 0, 0, 0]);
  const compressed = [];
  for (let cursor = 8; cursor < png.length;) {
    const size = png.readUInt32BE(cursor), type = png.toString('ascii', cursor + 4, cursor + 8);
    if (type === 'IDAT') compressed.push(png.subarray(cursor + 8, cursor + 8 + size));
    cursor += size + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed)), stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height);
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? rgba[i - 4] : 0;
      const b = y > 0 ? rgba[i - stride] : 0, c = y > 0 && x >= 4 ? rgba[i - stride - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      rgba[i] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, rgba, stride };
}

const asset = decodeAsset();
const alpha = (x, y) => asset.rgba[(y * asset.width + x) * 4 + 3];

function cropHash(left, top, right, bottom) {
  const hash = createHash('sha256');
  for (let y = top; y < bottom; y++) {
    hash.update(asset.rgba.subarray(y * asset.stride + left * 4, y * asset.stride + right * 4));
  }
  return hash.digest('hex');
}

test('corrected airlock is exactly symmetric while the hull and exterior crop stay byte-identical', () => {
  assert.deepEqual([asset.width, asset.height], [2459, 1931]);
  assert.deepEqual(SHIP_BOUNDS, { width: 2459, height: 1931 });
  assert.deepEqual([SHIP_ANCHOR.x, SHIP_ANCHOR.y], [1269, 70]);
  for (let y = 0; y < 685; y++) {
    for (let x = 863; x <= 1283; x++) assert.equal(alpha(x, y), alpha(2566 - x, y), `Symmetry at ${x},${y}`);
  }
  // These are the original source RGBA hashes, not hashes of the new right wall.
  assert.equal(cropHash(0, 685, 2459, 1931), 'a7092785290653205c82412db6b295fe9b246615ebba4b6c4d183c41b41db678');
  assert.equal(cropHash(0, 0, 863, 685), '5712ef2dcb0c81412c7af3d831a526cca5f5128c520df2ecf1324295e27b746e');
  assert.equal(cropHash(1704, 0, 2459, 685), 'b7ca11d7020c6580083babdf96f3dc2f4d73e1809f2c31eb22336b883394acf0');
});

test('both fixed airlock openings retain exactly 375 clear pixels and their shared world center', () => {
  for (const y of [30, 638]) {
    assert.ok(alpha(1095, y) >= 128);
    assert.ok(alpha(1471, y) >= 128);
    for (let x = 1096; x < 1471; x++) assert.equal(alpha(x, y), 0);
    const localCenter = (1096 + 1471) / 2;
    assert.equal(1471 - 1096, 375);
    for (const mirrored of [false, true]) {
      assert.deepEqual(shipWorldPoint({ x: 4096, y: 4740, mirrored },
        { x: localCenter - SHIP_ANCHOR.x, y: y - SHIP_ANCHOR.y }), { x: 4110.5, y: y === 30 ? 4700 : 5308 });
    }
  }
  // No residual one-pixel source lip may narrow either cut through its wall.
  for (let y = 0; y < 685; y++) for (let x = 1096; x < 1471; x++) assert.equal(alpha(x, y), 0);
});

test('the widened right upright still overlaps a 50 px wall at each unchanged pinned ship port', () => {
  assert.deepEqual(SHIP_ANCHOR.portOffsets, [-356.5, 356.5]);
  const runs = [[885, 940], [1627, 1682]];
  for (const mirrored of [false, true]) {
    const worldRuns = runs.map(([left, right]) => mirrored
      ? [4125 - (right - SHIP_ANCHOR.x), 4125 - (left - SHIP_ANCHOR.x)]
      : [4096 + left - SHIP_ANCHOR.x, 4096 + right - SHIP_ANCHOR.x]).sort((a, b) => a[0] - b[0]);
    const overlaps = SHIP_ANCHOR.portOffsets.map((offset, index) => {
      const pin = 4096 + offset, [left, right] = worldRuns[index];
      return Math.max(0, Math.min(pin + 25, right) - Math.max(pin - 25, left));
    });
    assert.deepEqual(overlaps, [50, 23.5]);
  }
  for (const [left, right] of runs) {
    for (let x = left; x < right; x++) assert.ok(alpha(x, 70) >= 128);
  }
});

test('every bundled ship pixel remains white RGB with alpha-only transparency', () => {
  for (let i = 0; i < asset.rgba.length; i += 4) {
    assert.equal(asset.rgba[i], 255);
    assert.equal(asset.rgba[i + 1], 255);
    assert.equal(asset.rgba[i + 2], 255);
  }
});
