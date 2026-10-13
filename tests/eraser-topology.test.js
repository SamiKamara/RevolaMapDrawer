import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument, validateDocument, addWall, addDoor, eraseWalls, nearestEdge,
  snapWallStart, resolveWallEndpoint, moveVertex, moveWall, removeDoor,
} from '../src/model.js';
import { drawMap, segmentVisibleParts } from '../src/render.js';

const vertex = (doc, id) => doc.vertices.find(point => point.id === id);
const ends = (doc, edge) => [vertex(doc, edge.a), vertex(doc, edge.b)];
const barePoint = ({ x, y }) => ({ x, y });
const insert = (doc, a, b) => addWall(doc, a, b, { joinTolerance: 0 });
const roundtrip = doc => validateDocument(JSON.parse(JSON.stringify(doc)));
const visible = doc => doc.edges.flatMap(edge => {
  const [a, b] = ends(doc, edge);
  return segmentVisibleParts(a, b, edge.doors, doc.style.doorWidth, edge.gaps)
    .map(part => [part.a, part.b]);
});
function assertPointsClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((points, index) => points.forEach((point, end) => {
    assert.ok(Math.hypot(point.x - expected[index][end].x, point.y - expected[index][end].y) < 2e-9);
  }));
}
function paint(doc) {
  const calls = [], context = {};
  for (const name of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'fill']) {
    context[name] = (...args) => calls.push([name, ...args]);
  }
  drawMap(context, doc, { drawShip: false });
  return calls;
}

test('terminal erasures replace invisible skeleton ends with exact physical cut endpoints', () => {
  for (const to of [{ x: 3000, y: 1000 }, { x: 1000, y: 3000 }, { x: 3000, y: 3000 }]) {
    const doc = createDocument(), [wall] = insert(doc, { x: 1000, y: 1000 }, to);
    const removed = wall.a, pinned = structuredClone(doc.ship);
    assert.equal(eraseWalls(doc, { x: 1000, y: 1000 }, { x: 1000, y: 1000 }, 200), true);
    assert.equal(vertex(doc, removed), undefined);
    assert.equal(doc.edges.length, 1);
    const current = doc.edges[0], [a, b] = ends(doc, current);
    assert.ok(Math.abs(Math.hypot(a.x - 1000, a.y - 1000) - 200) < 2e-9);
    assert.deepEqual(barePoint(b), to);
    assert.deepEqual(current.cutEnds, { a: true, b: false });
    assert.deepEqual(current.gaps, []);
    assert.equal(nearestEdge(doc, { x: 1000, y: 1000 }, 20), null);
    assert.equal(moveVertex(doc, removed, { x: 1100, y: 1100 }), false);
    assert.deepEqual(doc.ship, pinned);
    assert.deepEqual(roundtrip(doc), doc);
  }
});

test('erasing a shared T junction removes its vertex and disconnects only the erased runs', () => {
  const doc = createDocument();
  insert(doc, { x: 1000, y: 2000 }, { x: 3000, y: 2000 });
  insert(doc, { x: 2000, y: 1000 }, { x: 2000, y: 2000 });
  const joint = doc.vertices.find(point => point.x === 2000 && point.y === 2000);
  assert.equal(doc.edges.filter(edge => edge.a === joint.id || edge.b === joint.id).length, 3);
  assert.equal(eraseWalls(doc, joint, joint, 100), true);
  assert.equal(vertex(doc, joint.id), undefined);
  assert.equal(doc.edges.length, 3);
  assert.deepEqual(doc.vertices.map(barePoint).sort((a, b) => a.x - b.x || a.y - b.y), [
    { x: 1000, y: 2000 }, { x: 1900, y: 2000 }, { x: 2000, y: 1000 },
    { x: 2000, y: 1900 }, { x: 2100, y: 2000 }, { x: 3000, y: 2000 },
  ]);
  assert.equal(nearestEdge(doc, joint, 50), null);
  assert.deepEqual(roundtrip(doc), doc);
  assert.equal(eraseWalls(doc, { x: 2000, y: 2000 }, { x: 2000, y: 2000 }, 100), false);
});

test('legacy erased junction and orphan data reopen without ghost graph points or changed wall pixels', () => {
  const legacy = createDocument();
  legacy.vertices = [{ id: 'a', x: 1000, y: 1000 }, { id: 'joint', x: 2000, y: 1000 },
    { id: 'b', x: 2000, y: 2000 }, { id: 'orphan', x: 4000, y: 4000 }];
  legacy.edges = [{ id: 'h', a: 'a', b: 'joint', doors: [], gaps: [{ id: 'hg', start: .9, end: 1 }] },
    { id: 'v', a: 'joint', b: 'b', doors: [], gaps: [{ id: 'vg', start: 0, end: .1 }] }];
  const before = structuredClone(legacy), normalized = validateDocument(legacy);
  assert.deepEqual(legacy, before, 'Import must never mutate the caller or its source file');
  assert.equal(vertex(normalized, 'joint'), undefined);
  assert.equal(vertex(normalized, 'orphan'), undefined);
  assert.deepEqual(paint(normalized), paint(legacy), 'World texture, butt cuts and erased corner remain exact');
  assertPointsClose(visible(normalized), visible(legacy));
  assert.deepEqual(roundtrip(normalized), normalized);
});

test('crossing through an interior erasure creates no invisible junction and can move independently', () => {
  const doc = createDocument();
  const [host] = insert(doc, { x: 1000, y: 2000 }, { x: 3000, y: 2000 });
  eraseWalls(doc, { x: 2000, y: 2000 }, { x: 2000, y: 2000 }, 200);
  const original = structuredClone(doc.edges[0]);
  assert.equal(nearestEdge(doc, { x: 2000, y: 2000 }, 100), null);
  const [crossing] = insert(doc, { x: 2000, y: 1000 }, { x: 2000, y: 3000 });
  assert.equal(doc.edges.length, 2);
  assert.equal(doc.vertices.length, 4);
  assert.equal(doc.vertices.some(point => point.x === 2000 && point.y === 2000), false);
  assert.deepEqual(doc.edges.find(edge => edge.id === host.id), original);
  assert.deepEqual(roundtrip(doc), doc);
  assert.equal(moveWall(doc, crossing.id, { x: 100, y: 0 }, { joinTolerance: 0 }), true);
  assert.deepEqual(doc.edges.find(edge => edge.id === host.id), original);
  assert.deepEqual(roundtrip(doc), doc);
});

test('erased terminal markers survive reopen and prevent unrelated snapping or extension across the cut', () => {
  const doc = createDocument();
  insert(doc, { x: 1000, y: 1000 }, { x: 3000, y: 1000 });
  eraseWalls(doc, { x: 1000, y: 1000 }, { x: 1000, y: 1000 }, 200);
  const reopened = roundtrip(doc), aim = { x: 1180, y: 990 };
  assert.deepEqual(snapWallStart(reopened, aim, { joinTolerance: 100 }), aim);
  assert.deepEqual(resolveWallEndpoint(reopened, { x: 1180, y: 400 }, { x: 1180, y: 990 }, { joinTolerance: 100 }), { x: 1180, y: 990 });
  addWall(reopened, { x: 1180, y: 400 }, { x: 1180, y: 1100 });
  const trimmed = reopened.edges.find(edge => edge.id === doc.edges[0].id);
  assert.equal(vertex(reopened, trimmed.a).x, 1200);
  assert.deepEqual(trimmed.cutEnds, { a: true, b: false });
  assert.deepEqual(roundtrip(reopened), reopened);
});

test('manual overdraw deliberately reconnects a trimmed erased end and keeps undo snapshots independent', () => {
  const doc = createDocument();
  insert(doc, { x: 1000, y: 1000 }, { x: 3000, y: 1000 });
  const original = JSON.stringify(doc);
  eraseWalls(doc, { x: 1000, y: 1000 }, { x: 1000, y: 1000 }, 200);
  const erased = JSON.stringify(doc);
  insert(doc, { x: 1000, y: 1000 }, { x: 1300, y: 1000 });
  assert.equal(doc.vertices.some(point => point.x === 1000 && point.y === 1000), true);
  assert.equal(nearestEdge(doc, { x: 1100, y: 1000 }, 1)?.distance, 0);
  assert.deepEqual(roundtrip(doc), doc);
  assert.equal(JSON.parse(erased).vertices.some(point => point.x === 1000), false);
  assert.equal(JSON.parse(original).vertices.some(point => point.x === 1000), true);
});

test('a door near a new erased terminal retains its ID, exact width and removal behavior', () => {
  const doc = createDocument(), [host] = insert(doc, { x: 1000, y: 1000 }, { x: 3000, y: 1000 });
  assert.equal(addDoor(doc, host.id, { x: 1600, y: 1000 }), true);
  const doorId = doc.edges[0].doors[0].id;
  eraseWalls(doc, { x: 1000, y: 1000 }, { x: 1300, y: 1000 }, 100);
  const reopened = roundtrip(doc), wall = reopened.edges[0], [a, b] = ends(reopened, wall);
  assert.equal(a.x, 1400);
  assert.equal(wall.doors[0].id, doorId);
  const parts = segmentVisibleParts(a, b, wall.doors, reopened.style.doorWidth, wall.gaps);
  assert.equal(parts[1].a.x - parts[0].b.x, 375);
  const target = nearestEdge(reopened, { x: 1600, y: 1000 }, 1);
  assert.equal(target.edge.id, host.id, 'The existing fixed door remains removable');
  assert.equal(removeDoor(reopened, host.id, doorId), true);
  assert.equal(visible(reopened)[0][0].x, 1400, 'Door removal cannot restore the erased end');
  assert.deepEqual(roundtrip(reopened), reopened);
});

test('door consolidation keeps marked cuts on reversed outer pieces and movement preserves them', () => {
  const legacy = createDocument();
  legacy.vertices = [1000, 2000, 3000, 4000].map((x, index) => ({ id: `v${index}`, x, y: 2000 }));
  legacy.edges = [
    { id: 'left', a: 'v1', b: 'v0', doors: [], gaps: [{ id: 'leftCut', start: .8, end: 1 }] },
    { id: 'middle', a: 'v1', b: 'v2', doors: [], gaps: [] },
    { id: 'right', a: 'v3', b: 'v2', doors: [], gaps: [{ id: 'rightCut', start: 0, end: .2 }] },
  ];
  const doc = validateDocument(legacy);
  assert.equal(addDoor(doc, 'middle', { x: 2000, y: 2000 }), true);
  assert.equal(doc.edges.length, 1);
  assert.deepEqual(doc.edges[0].cutEnds, { a: true, b: true });
  assert.deepEqual(ends(doc, doc.edges[0]).map(barePoint), [{ x: 1200, y: 2000 }, { x: 3800, y: 2000 }]);
  assert.equal(moveWall(doc, doc.edges[0].id, { x: 0, y: 100 }, { joinTolerance: 0 }), true);
  assert.deepEqual(doc.edges[0].cutEnds, { a: true, b: true });
  assert.deepEqual(ends(doc, doc.edges[0]).map(barePoint), [{ x: 1200, y: 2100 }, { x: 3800, y: 2100 }]);
  assert.deepEqual(roundtrip(doc), doc);
});

test('tiny surviving end slivers are preserved rather than mistaken for fully erased walls', () => {
  const legacy = createDocument();
  legacy.vertices = [{ id: 'a', x: 1000, y: 1000 }, { id: 'b', x: 3000, y: 1000 }];
  legacy.edges = [{ id: 'wall', a: 'a', b: 'b', doors: [], gaps: [{ id: 'cut', start: .0000001, end: .9999999 }] }];
  const doc = validateDocument(legacy);
  assert.deepEqual(doc, legacy);
  assert.deepEqual(paint(doc), paint(legacy));
});

test('legacy separately identified touching erasures trim their complete terminal union', () => {
  const legacy = createDocument();
  legacy.vertices = [{ id: 'a', x: 1000, y: 1000 }, { id: 'b', x: 3000, y: 1000 }];
  legacy.edges = [{ id: 'wall', a: 'a', b: 'b', doors: [], gaps: [
    { id: 'first', start: 0, end: .1 }, { id: 'second', start: .1, end: .2 },
    { id: 'third', start: .8, end: .9 }, { id: 'fourth', start: .9, end: 1 },
  ] }];
  const doc = validateDocument(legacy);
  assert.deepEqual(ends(doc, doc.edges[0]).map(barePoint), [{ x: 1400, y: 1000 }, { x: 2600, y: 1000 }]);
  assert.deepEqual(doc.edges[0].gaps, []);
  assert.deepEqual(doc.edges[0].cutEnds, { a: true, b: true });
  assert.deepEqual(roundtrip(doc), doc);
  assert.deepEqual(paint(doc), paint(legacy));
});

test('a detached erased T arm does not regrow a miter on the two surviving corner walls', () => {
  const legacy = createDocument();
  legacy.vertices = [{ id: 'joint', x: 1000, y: 1000 }, { id: 'east', x: 2000, y: 1000 },
    { id: 'south', x: 1000, y: 2000 }, { id: 'north', x: 1000, y: 500 }];
  legacy.edges = [{ id: 'eastWall', a: 'joint', b: 'east', doors: [], gaps: [] },
    { id: 'southWall', a: 'joint', b: 'south', doors: [], gaps: [] },
    { id: 'northWall', a: 'joint', b: 'north', doors: [], gaps: [{ id: 'erasedArm', start: 0, end: .8 }] }];
  const originalPaint = paint(legacy);
  assert.equal(originalPaint.filter(([name]) => name === 'closePath').length, 3);
  const imported = validateDocument(legacy);
  assert.equal(vertex(imported, 'joint').x, 1000, 'The joint still belongs to actual surviving wall runs');
  assert.deepEqual(imported.edges[0].cutEnds, { a: true, b: false });
  assert.deepEqual(imported.edges[1].cutEnds, { a: true, b: false });
  assert.deepEqual(paint(imported), originalPaint);
  assert.deepEqual(roundtrip(imported), imported);
  const erased = structuredClone(legacy); erased.edges[2].gaps = [];
  assert.equal(eraseWalls(erased, { x: 1000, y: 800 }, { x: 1000, y: 800 }, 200), true);
  assert.deepEqual(paint(erased), originalPaint);
});

test('removing a fully erased branch retains its butt boundary on surviving incident walls', () => {
  const doc = createDocument();
  insert(doc, { x: 1000, y: 1000 }, { x: 2000, y: 1000 });
  insert(doc, { x: 1000, y: 1000 }, { x: 1000, y: 2000 });
  insert(doc, { x: 1000, y: 1000 }, { x: 1000, y: 850 });
  assert.equal(eraseWalls(doc, { x: 1000, y: 925 }, { x: 1000, y: 925 }, 75), true);
  assert.equal(doc.edges.length, 2);
  assert.ok(doc.edges.every(edge => edge.cutEnds?.a));
  assert.equal(paint(doc).filter(([name]) => name === 'closePath').length, 2);
  assert.deepEqual(roundtrip(doc), doc);
});

test('sub-tolerance surviving legacy slivers reopen as valid exact original intervals', () => {
  const legacy = createDocument();
  legacy.vertices = [{ id: 'a', x: 1000, y: 1000 }, { id: 'b', x: 3000, y: 1000 }];
  legacy.edges = [{ id: 'wall', a: 'a', b: 'b', doors: [], gaps: [
    { id: 'left', start: 0, end: .5 }, { id: 'right', start: .5000000001, end: 1 },
  ] }];
  const doc = validateDocument(legacy);
  assert.deepEqual(doc, legacy);
  assert.notEqual(doc.edges[0].a, doc.edges[0].b);
  assert.deepEqual(roundtrip(doc), doc);
  assert.deepEqual(paint(doc), paint(legacy));
});

test('erasing fully removed walls prunes all endpoints and preserves the fixed ship', () => {
  const doc = createDocument(), ship = structuredClone(doc.ship);
  insert(doc, { x: 3739.5, y: 4700 }, { x: 3739.5, y: 4300 });
  eraseWalls(doc, { x: 3739.5, y: 4700 }, { x: 3739.5, y: 4300 }, 100);
  assert.deepEqual(doc.edges, []);
  assert.deepEqual(doc.vertices, []);
  assert.deepEqual(doc.ship, ship);
  assert.deepEqual(roundtrip(doc), doc);
});

test('import rejects malformed cut markers and never accepts a door extending outside its wall', () => {
  const doc = createDocument();
  insert(doc, { x: 1000, y: 1000 }, { x: 3000, y: 1000 });
  for (const cutEnds of [null, {}, { a: true }, { a: 'true', b: false }, { a: false, b: 1 }]) {
    const broken = structuredClone(doc); broken.edges[0].cutEnds = cutEnds;
    assert.throws(() => validateDocument(broken), /erased wall endpoints/);
  }
  doc.edges[0].cutEnds = { a: true, b: false };
  doc.edges[0].doors = [{ id: 'door', t: .01 }];
  assert.throws(() => validateDocument(doc), /doorway/);
});
