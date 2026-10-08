import test from 'node:test';
import assert from 'node:assert/strict';
import { getWallSpan, resolveDoorPlacement } from '../src/doors.js';

const make = (points, links, extras = {}) => ({
  style: { doorWidth: 375, wallWidth: 50, roughness: 2.25 },
  ship: { x: 4096, y: 4740 },
  vertices: points.map(([x, y], index) => ({ id: `v${index}`, x, y })),
  edges: links.map(([a, b], index) => ({ id: `e${index}`, a: `v${a}`, b: `v${b}`, doors: [], gaps: [] })),
  ...extras,
});
const horizontal = () => make([[100, 100], [1100, 100]], [[0, 1]]);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test('door aim gently centers with an exact midpoint, an outside threshold, and a zero opt-out', () => {
  const doc = horizontal(), before = structuredClone(doc);
  const centered = resolveDoorPlacement(doc, 'e0', { x: 637, y: 120 });
  assert.deepEqual(centered.point, { x: 600, y: 100 });
  assert.deepEqual(centered.projectedPoint, { x: 637, y: 100 });
  assert.equal(centered.centered, true);
  assert.equal(centered.t, 0.5);
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: 651, y: 100 }).centered, false);
  assert.deepEqual(resolveDoorPlacement(doc, 'e0', { x: 630, y: 100 }, { centerTolerance: 0 }).point, { x: 630, y: 100 });
  assert.deepEqual(doc, before);
});

test('short spans limit midpoint attraction to five percent and reject impossible openings', () => {
  const doc = make([[100, 100], [600, 100]], [[0, 1]]);
  assert.deepEqual(resolveDoorPlacement(doc, 'e0', { x: 374, y: 100 }).point, { x: 350, y: 100 });
  assert.deepEqual(resolveDoorPlacement(doc, 'e0', { x: 376, y: 100 }).point, { x: 376, y: 100 });
  const tooShort = make([[100, 100], [500, 100]], [[0, 1]]);
  assert.equal(resolveDoorPlacement(tooShort, 'e0', { x: 300, y: 100 }), null);
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: 200, y: 100 }), null);
});

test('degree-two straight splits do not change the measured midpoint or cut target', () => {
  const doc = make([[100, 100], [500, 100], [700, 100], [1100, 100]], [[1, 0], [1, 2], [3, 2]]);
  const before = structuredClone(doc), span = getWallSpan(doc, 'e2');
  assert.deepEqual(span.edgeIds, ['e0', 'e1', 'e2']);
  assert.deepEqual(span.vertexIds, ['v0', 'v1', 'v2', 'v3']);
  assert.deepEqual(span.segments.map(segment => segment.reversed), [true, false, true]);
  assert.equal(span.length, 1000);
  const target = resolveDoorPlacement(doc, 'e1', { x: 625, y: 100 });
  assert.deepEqual(target.point, { x: 600, y: 100 });
  assert.equal(target.crossesSplit, true);
  assert.equal(target.hostEdgeId, 'e1');
  assert.equal(target.hostT, 0.5);
  assert.deepEqual(doc, before);
});

test('corners and branches, including straight branches on both ends, bound the target span', () => {
  const doc = make([[100, 100], [100, 1100], [100, 2100], [1100, 1100], [1100, 2100]], [[0, 1], [1, 2], [1, 3], [2, 4]]);
  const span = getWallSpan(doc, 'e1');
  assert.deepEqual(span.edgeIds, ['e1']);
  assert.deepEqual(resolveDoorPlacement(doc, 'e1', { x: 105, y: 1630 }).point, { x: 100, y: 1600 });
  const corner = getWallSpan(doc, 'e3');
  assert.deepEqual(corner.edgeIds, ['e3']);
});

test('diagonal reversed spans use physical lengths and keep an exact geometric center', () => {
  const doc = make([[200, 1800], [700, 1300], [1200, 800]], [[1, 0], [2, 1]]);
  const target = resolveDoorPlacement(doc, 'e0', { x: 730, y: 1270 });
  assert.deepEqual(target.point, { x: 700, y: 1300 });
  assert.equal(target.centered, true);
  near(target.span.length, 1000 * Math.SQRT2);
  near(target.offset, 500 * Math.SQRT2);
  assert.equal(target.crossesSplit, true);
  const unsnapped = resolveDoorPlacement(doc, 'e0', { x: 740, y: 1260 });
  assert.equal(unsnapped.centered, false);
  assert.deepEqual(unsnapped.point, { x: 740, y: 1260 });
});

test('existing door intervals are preserved as exclusions without becoming span endpoints', () => {
  const doc = make([[100, 100], [1100, 100], [2100, 100]], [[1, 0], [1, 2]]);
  doc.edges[0].doors.push({ id: 'old', t: 0.6 });
  const span = getWallSpan(doc, 'e1');
  assert.equal(span.length, 2000);
  assert.deepEqual(span.cuts, [{ id: 'old', edgeId: 'e0', kind: 'door', start: 212.5, end: 587.5 }]);
  assert.deepEqual(resolveDoorPlacement(doc, 'e1', { x: 1130, y: 100 }).point, { x: 1100, y: 100 });
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: 500, y: 100 }), null);
});

test('a blocked midpoint leaves a nearby valid intentional placement alone', () => {
  const doc = make([[100, 100], [2100, 100]], [[0, 1]]);
  // Door spans x500..875; the new centered door would start x912.5.
  // Move the existing door 50px right: centering overlaps, aiming 50px right does not.
  doc.edges[0].doors.push({ id: 'old', t: (737.5 - 100) / 2000 });
  const target = resolveDoorPlacement(doc, 'e0', { x: 1150, y: 100 });
  assert.equal(target.centered, false);
  assert.deepEqual(target.point, { x: 1150, y: 100 });
});

test('erased gaps terminate midpoint measurement and cannot be bridged by attraction', () => {
  const doc = make([[100, 100], [2100, 100]], [[1, 0]]);
  doc.edges[0].gaps.push({ id: 'cut', start: 0.45, end: 0.55 });
  const left = resolveDoorPlacement(doc, 'e0', { x: 570, y: 100 });
  assert.deepEqual(left.point, { x: 550, y: 100 });
  near(left.placementSpan.length, 900);
  assert.deepEqual(left.placementSpan.b, { x: 1000, y: 100 });
  const right = resolveDoorPlacement(doc, 'e0', { x: 1620, y: 100 });
  assert.deepEqual(right.point, { x: 1650, y: 100 });
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: 1100, y: 100 }), null);
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: 850, y: 100 }), null);
});

test('fixed ship-port joints stay structural endpoints even when collinear', () => {
  const doc = make([[3739.5, 3740], [3739.5, 4740], [3739.5, 5740]], [[0, 1], [1, 2]]);
  assert.deepEqual(getWallSpan(doc, 'e0').edgeIds, ['e0']);
  assert.deepEqual(getWallSpan(doc, 'e1').edgeIds, ['e1']);
  assert.deepEqual(resolveDoorPlacement(doc, 'e0', { x: 3739.5, y: 4280 }).point, { x: 3739.5, y: 4240 });
});

test('invalid references and nonfinite or off-span aims do not produce targets', () => {
  const doc = horizontal();
  assert.equal(getWallSpan(doc, 'missing'), null);
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: NaN, y: 100 }), null);
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: 50, y: 100 }), null);
  assert.equal(resolveDoorPlacement(doc, 'e0', { x: 1200, y: 100 }), null);
});
