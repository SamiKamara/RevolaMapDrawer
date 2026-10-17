import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_VECTOR_OUTLINES, SHIP_VECTOR_POINT_COUNT, appendShipPath } from '../src/ship-vector.js';
import { SHIP_ANCHOR, drawMap } from '../src/render.js';
import { shipWorldPoint, shipPorts, legacyShipPorts } from '../src/ship.js';
import { FLOOR_RIM, floorContainsPoint } from '../src/floors.js';
import { SHIP_FLOOR_OUTLINE } from '../assets/ship-floor-contour.js';

function winding(point, ring) {
  let result = 0;
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index], b = ring[(index + 1) % ring.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
    if (a.y <= point.y && b.y > point.y && cross > 0) result++;
    if (a.y > point.y && b.y <= point.y && cross < 0) result--;
  }
  return result;
}
const contains = point => SHIP_VECTOR_OUTLINES.reduce((sum, ring) => sum + winding(point, ring), 0) !== 0;

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

test('simplified ship uses five straight-line rings and a bounded vector point count', () => {
  assert.equal(SHIP_VECTOR_OUTLINES.length, 5);
  assert.ok(SHIP_VECTOR_POINT_COUNT <= 150, 'The full ship uses fewer points than a short textured wall');
  const operations = [];
  appendShipPath({ moveTo: (x, y) => operations.push(['M', x, y]),
    lineTo: (x, y) => operations.push(['L', x, y]), closePath: () => operations.push(['Z']) });
  assert.equal(operations.filter(([command]) => command === 'M').length, 5);
  assert.equal(operations.filter(([command]) => command === 'Z').length, 5);
  assert.equal(operations.filter(([command]) => command !== 'Z').length, SHIP_VECTOR_POINT_COUNT);
  assert.equal(contains({ x: 0, y: 830 }), false, 'The main hull interior stays transparent');
  for (const [x, y] of [[600, 550], [600, 1800], [100, 1150], [2320, 1150]]) {
    assert.equal(contains({ x: x - SHIP_ANCHOR.x, y: y - SHIP_ANCHOR.y }), false, 'Engine and cockpit apertures stay transparent');
  }
});

test('vector airlock retains straight measured ports, both exact 375 px openings and the original mirror pivot', () => {
  for (const y of [-40, 568]) {
    for (const x of [-173.001, 202.001]) assert.equal(contains({ x, y }), true);
    for (let x = -173; x < 202; x += 0.5) assert.equal(contains({ x: x + 0.25, y }), false);
    assert.equal(202 - -173, 375);
  }
  for (const mirrored of [false, true]) {
    const ship = { x: 4096, y: 4740, mirrored };
    for (const port of [...shipPorts(ship), ...legacyShipPorts(ship)]) {
      const local = shipWorldPoint({ x: -ship.x, y: -ship.y, mirrored: false }, port);
      const reflected = { x: mirrored ? 29 - local.x : local.x, y: local.y };
      // Old right pins sit beside the newer upright; their wall-width footprint
      // still overlaps it by at least the original 23.5 pixels.
      let covered = 0;
      for (let x = -25; x < 25; x += 0.5) if (contains({ x: reflected.x + x + 0.25, y: reflected.y })) covered += 0.5;
      assert.ok(covered >= 23.5);
    }
    assert.deepEqual(shipWorldPoint(ship, { x: 14.5, y: -40 }), { x: 4110.5, y: 4700 });
    assert.deepEqual(shipWorldPoint(ship, { x: 14.5, y: 568 }), { x: 4110.5, y: 5308 });
  }
  for (let y = -63.75; y < 595; y += 11) for (let x = -419.75; x < 449; x += 7) {
    assert.equal(contains({ x, y }), contains({ x: 29 - x, y }), `The whole airlock chamber stays symmetric at ${x},${y}`);
  }
});

test('every simplified ship edge remains inside the existing black floor footprint and its measured rim', () => {
  for (const ring of SHIP_VECTOR_OUTLINES) {
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index], b = ring[(index + 1) % ring.length];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let step = 0; step <= steps; step++) {
        const point = { x: SHIP_ANCHOR.x + a.x + (b.x - a.x) * step / steps,
          y: SHIP_ANCHOR.y + a.y + (b.y - a.y) * step / steps };
        if (floorContainsPoint(SHIP_FLOOR_OUTLINE, point)) continue;
        const distance = Math.min(...SHIP_FLOOR_OUTLINE.map((p, i) =>
          distanceToSegment(point, p, SHIP_FLOOR_OUTLINE[(i + 1) % SHIP_FLOOR_OUTLINE.length])));
        assert.ok(distance < FLOOR_RIM - 0.5,
          `Vector edge ${point.x},${point.y} has black floor/rim coverage (${distance} px)`);
      }
    }
  }
});

test('canvas map rendering uses vectors directly without requiring a raster asset', () => {
  let points = 0, images = 0;
  const context = { save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, translate() {}, scale() {},
    moveTo() { points++; }, lineTo() { points++; }, drawImage() { images++; } };
  drawMap(context, { vertices: [], edges: [], ship: { x: 4096, y: 4740, mirrored: false } });
  assert.equal(points, SHIP_VECTOR_POINT_COUNT);
  assert.equal(images, 0);
});
