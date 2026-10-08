import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, validateDocument, addWall, addDoor, removeDoor } from '../src/model.js';
import { resolveDoorPlacement } from '../src/doors.js';
import { segmentVisibleParts } from '../src/render.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);
const fixture = (points, links) => {
  const doc = createDocument();
  doc.vertices = points.map(([x, y], i) => ({ id: `v${i}`, x, y }));
  doc.edges = links.map(([a, b], i) => ({ id: `e${i}`, a: `v${a}`, b: `v${b}`, doors: [], gaps: [] }));
  return validateDocument(doc);
};
const ends = (doc, edge) => [edge.a, edge.b].map(id => doc.vertices.find(v => v.id === id));
const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const allDoors = doc => doc.edges.flatMap(edge => {
  const [a, b] = ends(doc, edge);
  return edge.doors.map(door => ({ id: door.id, ...at(a, b, door.t) }));
});
const allGaps = doc => doc.edges.flatMap(edge => {
  const [a, b] = ends(doc, edge);
  return edge.gaps.map(gap => ({ id: gap.id, ends: [at(a, b, gap.start), at(a, b, gap.end)]
    .sort((one, two) => one.x - two.x || one.y - two.y) }));
});

test('centered door crosses reversed incidental splits with exactly 375 px of clear wall', () => {
  const doc = fixture([[2400, 1200], [2400, 2500], [2400, 2700], [2400, 4000]], [[1, 0], [1, 2], [3, 2]]);
  const preview = resolveDoorPlacement(doc, 'e1', { x: 2400, y: 2640 });
  assert.equal(preview.crossesSplit, true);
  assert.equal(addDoor(doc, 'e1', { x: 2400, y: 2640 }), true);
  assert.equal(doc.edges.length, 1);
  assert.deepEqual(doc.vertices.map(v => v.id), ['v0', 'v3']);
  const edge = doc.edges[0], [a, b] = ends(doc, edge);
  assert.equal(edge.id, 'e1');
  assert.deepEqual(allDoors(doc)[0], { id: edge.doors[0].id, ...preview.point });
  const parts = segmentVisibleParts(a, b, edge.doors, doc.style.doorWidth, edge.gaps);
  assert.equal(parts.length, 2);
  near(parts[0].b.y, 2412.5);
  near(parts[1].a.y, 2787.5);
  near(Math.hypot(parts[1].a.x - parts[0].b.x, parts[1].a.y - parts[0].b.y), 375);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
});

test('consolidating a split door preserves existing door and erasure IDs and world positions', () => {
  const doc = fixture([[100, 1000], [1800, 1000], [2400, 1000], [4100, 1000], [5000, 2000], [6000, 2000]],
    [[1, 0], [1, 2], [3, 2], [4, 5]]);
  doc.edges[0].doors.push({ id: 'existing-door', t: (1800 - 700) / 1700 });
  doc.edges[2].gaps.push({ id: 'existing-gap', start: (4100 - 3700) / 1700, end: (4100 - 3500) / 1700 });
  validateDocument(doc);
  const originalDoors = allDoors(doc), originalGaps = allGaps(doc), unrelated = structuredClone(doc.edges[3]);
  assert.equal(addDoor(doc, 'e1', { x: 1840, y: 1000 }), true);
  assert.equal(doc.edges.length, 2);
  assert.deepEqual(allDoors(doc).filter(door => door.id === 'existing-door'), originalDoors);
  assert.deepEqual(allGaps(doc), originalGaps);
  assert.deepEqual(doc.edges.find(edge => edge.id === unrelated.id), unrelated);
  const placed = allDoors(doc).find(door => door.id !== 'existing-door');
  assert.deepEqual({ x: placed.x, y: placed.y }, { x: 1800, y: 1000 });
  assert.equal(removeDoor(doc, 'e1', placed.id), true);
  assert.deepEqual(allDoors(doc), originalDoors);
  assert.deepEqual(allGaps(doc), originalGaps);
  validateDocument(doc);
});

test('branch vertices bound door centering and remain shared graph junctions', () => {
  const doc = fixture([[2400, 1200], [2400, 2600], [2400, 4000], [3600, 2600]], [[0, 1], [1, 2], [1, 3]]);
  assert.equal(addDoor(doc, 'e0', { x: 2400, y: 1935 }), true);
  assert.deepEqual({ x: allDoors(doc)[0].x, y: allDoors(doc)[0].y }, { x: 2400, y: 1900 });
  assert.equal(doc.edges.length, 3);
  assert.equal(doc.edges.filter(edge => edge.a === 'v1' || edge.b === 'v1').length, 3);
  const before = structuredClone(doc);
  assert.equal(addDoor(doc, 'e1', { x: 2400, y: 2630 }), false);
  assert.deepEqual(doc, before, 'A doorway cannot erase the branch junction');
  validateDocument(doc);
});

test('invalid placements on split spans leave graph, cuts and ordering untouched', () => {
  const doc = fixture([[100, 1000], [1100, 1000], [2100, 1000]], [[1, 0], [1, 2]]);
  doc.edges[0].doors.push({ id: 'old-door', t: 0.6 });
  doc.edges[1].gaps.push({ id: 'old-gap', start: 0.55, end: 0.65 });
  validateDocument(doc);
  const before = structuredClone(doc);
  for (const [edgeId, point] of [
    ['e0', { x: 125, y: 1000 }],
    ['e0', { x: 500, y: 1000 }],
    ['e1', { x: 1700, y: 1000 }],
    ['e1', { x: 2101, y: 1000 }],
    ['missing', { x: 1100, y: 1000 }],
    ['e1', { x: NaN, y: 1000 }],
  ]) {
    assert.equal(addDoor(doc, edgeId, point), false);
    assert.deepEqual(doc, before);
  }
});

test('ordinary door placement keeps the existing edge object usable for removal', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  const vertices = doc.vertices;
  assert.equal(addDoor(doc, edge.id, { x: 1140, y: 500 }), true);
  assert.equal(doc.edges[0], edge);
  assert.equal(doc.vertices, vertices);
  assert.equal(edge.doors[0].t, 0.5);
  assert.equal(removeDoor(doc, edge.id, edge.doors[0].id), true);
  assert.equal(edge.doors.length, 0);
  validateDocument(doc);
});

test('a target staying within one split edge does not unnecessarily consolidate its neighbors', () => {
  const doc = fixture([[100, 1000], [1100, 1000], [3100, 1000]], [[1, 0], [2, 1]]);
  const [left, right] = doc.edges;
  assert.equal(addDoor(doc, left.id, { x: 600, y: 1000 }), true);
  assert.equal(doc.edges[0], left);
  assert.equal(doc.edges[1], right);
  assert.equal(doc.vertices.length, 3);
  assert.deepEqual({ x: allDoors(doc)[0].x, y: allDoors(doc)[0].y }, { x: 600, y: 1000 });
  validateDocument(doc);
});

test('diagonal split consolidation uses physical width and agrees with the preview', () => {
  const doc = fixture([[1000, 3000], [2000, 2000], [3000, 1000]], [[1, 0], [2, 1]]);
  const point = { x: 2020, y: 1980 }, preview = resolveDoorPlacement(doc, 'e1', point);
  assert.equal(addDoor(doc, 'e1', point), true);
  assert.equal(doc.edges.length, 1);
  const edge = doc.edges[0], [a, b] = ends(doc, edge), parts = segmentVisibleParts(a, b, edge.doors);
  assert.deepEqual({ x: allDoors(doc)[0].x, y: allDoors(doc)[0].y }, preview.point);
  near(Math.hypot(parts[1].a.x - parts[0].b.x, parts[1].a.y - parts[0].b.y), 375);
  validateDocument(doc);
});

test('fixed ship ports survive nearby door consolidation and still bound its span', () => {
  const x = 3739.5;
  const doc = fixture([[x, 2740], [x, 3740], [x, 4740], [x, 6740]], [[1, 0], [1, 2], [3, 2]]);
  assert.equal(addDoor(doc, 'e0', { x, y: 3770 }), true);
  assert.equal(doc.edges.length, 2);
  assert.deepEqual(doc.vertices.find(v => v.id === 'v2'), { id: 'v2', x, y: 4740 });
  assert.equal(doc.edges.filter(edge => edge.a === 'v2' || edge.b === 'v2').length, 2);
  assert.deepEqual({ x: allDoors(doc)[0].x, y: allDoors(doc)[0].y }, { x, y: 3740 });
  validateDocument(doc);
});
