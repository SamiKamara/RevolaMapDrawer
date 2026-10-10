import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, addWall, addDoor, addCorridor, eraseWalls, validateDocument } from '../src/model.js';
import { resolveRoomStart, attachedRoomSegments, addAttachedRoom } from '../src/room-start.js';
import { corridorEndTargets } from '../src/corridors.js';
import { segmentVisibleParts } from '../src/render.js';
import { shipPorts } from '../src/ship.js';
import { generateFloor } from '../src/floors.js';

const EPS = 1e-5;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < EPS, `${actual} != ${expected}`);
const pointNear = (actual, expected) => { near(actual.x, expected.x); near(actual.y, expected.y); };
const add = (doc, a, b) => addWall(doc, a, b, { joinTolerance: 0 });
const at = (point, direction, offset) => ({ x: point.x + direction.x * offset, y: point.y + direction.y * offset });
const aimAt = (point, tangent, normal, halfWidth, depth) => ({ x: point.x + tangent.x * halfWidth + normal.x * depth,
  y: point.y + tangent.y * halfWidth + normal.y * depth });
const doorRecords = doc => doc.edges.flatMap(edge => edge.doors.map(door => {
  const a = doc.vertices.find(vertex => vertex.id === edge.a), b = doc.vertices.find(vertex => vertex.id === edge.b);
  return { id: door.id, point: { x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t } };
}));

test('an attached room keeps the fixed outer door at its bottom midpoint in both ship facings', () => {
  for (const mirrored of [false, true]) {
    const doc = createDocument(); doc.ship.mirrored = mirrored;
    for (const port of shipPorts(doc.ship)) add(doc, port, { x: port.x, y: port.y + 300 });
    const pins = structuredClone(doc.vertices), ship = structuredClone(doc.ship);
    const target = resolveRoomStart(doc, { x: 4210, y: 4690 });
    const aim = { x: 5510.5, y: 2700 }, before = structuredClone(doc);
    const segments = attachedRoomSegments(doc, target, aim);
    assert.equal(segments.length, 9); assert.deepEqual(doc, before);
    assert.deepEqual(segments[0].a, { x: 2930.5, y: 4700 });
    assert.deepEqual(segments[0].b, { x: 3923, y: 4700 });
    assert.deepEqual(segments[1].a, { x: 4298, y: 4700 });
    addAttachedRoom(doc, target, aim);
    assert.deepEqual(doc.ship, ship);
    for (const pin of pins) assert.deepEqual(doc.vertices.find(vertex => vertex.id === pin.id), pin);
    assert.equal(doorRecords(doc).length, 1);
    assert.deepEqual(doorRecords(doc)[0].point, { x: 4110.5, y: 4700 });
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
    assert.equal(generateFloor(doc).closed, true, 'The shared fixed door leads into the closed new room');
  }
});

test('wall-midpoint rooms create one exact doorway and reuse the existing base instead of filling it', () => {
  for (const reverse of [false, true]) {
    const doc = createDocument(), a = { x: 1013.5, y: 2013.25 }, b = { x: 3013.5, y: 2013.25 };
    add(doc, reverse ? b : a, reverse ? a : b);
    const before = structuredClone(doc), target = resolveRoomStart(doc, { x: 2040, y: 2030 });
    assert.deepEqual(target.point, { x: 2013.5, y: 2013.25 }); assert.equal(target.kind, 'center');
    attachedRoomSegments(doc, target, { x: 2913.5, y: 1013.25 }); assert.deepEqual(doc, before);
    addAttachedRoom(doc, target, { x: 2913.5, y: 1013.25 });
    assert.equal(doorRecords(doc).length, 1); assert.deepEqual(doorRecords(doc)[0].point, target.point);
    assert.equal(doc.edges.filter(edge => {
      const a = doc.vertices.find(vertex => vertex.id === edge.a), b = doc.vertices.find(vertex => vertex.id === edge.b);
      return a.y === target.point.y && b.y === target.point.y;
    }).length, 3, 'Only the existing side and its two corner splits cover the base');
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('existing doors keep their IDs and exact world centers on all eight attachment orientations', () => {
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4, tangent = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -tangent.y, y: tangent.x }, center = { x: 2000.5, y: 2000.25 };
    const doc = createDocument(); add(doc, at(center, tangent, -1200), at(center, tangent, 1200));
    assert.equal(addDoor(doc, doc.edges[0].id, center), true);
    const original = doorRecords(doc)[0], target = resolveRoomStart(doc, at(center, normal, 30));
    const aim = aimAt(center, tangent, normal, 1000, 1000);
    const preview = attachedRoomSegments(doc, target, aim);
    pointNear({ x: (preview[0].b.x + preview[1].a.x) / 2, y: (preview[0].b.y + preview[1].a.y) / 2 }, original.point);
    near(Math.hypot(preview[1].a.x - preview[0].b.x, preview[1].a.y - preview[0].b.y), 375);
    addAttachedRoom(doc, target, aim);
    assert.equal(doorRecords(doc).length, 1); assert.equal(doorRecords(doc)[0].id, original.id);
    pointNear(doorRecords(doc)[0].point, original.point);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('corridor-mouth rooms share both rail endpoints and create the centered doorway in every direction', () => {
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4, normal = { x: Math.cos(angle), y: Math.sin(angle) };
    const doc = createDocument(), start = { x: 2000.5, y: 2000.25 }, end = at(start, normal, 700);
    addCorridor(doc, [start, end]);
    const target = corridorEndTargets(doc).find(target => Math.hypot(target.point.x - end.x, target.point.y - end.y) < EPS);
    assert.ok(target); assert.equal(resolveRoomStart(doc, target.point).source, 'corridor');
    const railEnds = target.vertexIds.map(id => structuredClone(doc.vertices.find(vertex => vertex.id === id)));
    addAttachedRoom(doc, target, aimAt(target.point, target.direction, target.outwardDirection, 1000, 1000));
    pointNear(doorRecords(doc)[0].point, target.point);
    for (const endpoint of railEnds) {
      assert.deepEqual(doc.vertices.find(vertex => vertex.id === endpoint.id), endpoint);
      assert.equal(doc.edges.filter(edge => edge.a === endpoint.id || edge.b === endpoint.id).length, 3);
    }
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('split and short free hosts can be safely reused or extended without losing their cuts', () => {
  const doc = createDocument(); add(doc, { x: 1000, y: 2000 }, { x: 1300, y: 2000 });
  add(doc, { x: 1300, y: 2000 }, { x: 1800, y: 2000 });
  const target = resolveRoomStart(doc, { x: 1400, y: 2000 }); assert.ok(target);
  addAttachedRoom(doc, target, { x: 2400, y: 1000 });
  assert.equal(doorRecords(doc).length, 1); pointNear(doorRecords(doc)[0].point, target.point);
  assert.deepEqual(validateDocument(doc), doc);
});

test('short doorway hosts, real erasures and branch-centered walls do not offer room starts', () => {
  const short = createDocument(); add(short, { x: 1000, y: 2000 }, { x: 1400, y: 2000 });
  assert.equal(resolveRoomStart(short, { x: 1200, y: 2000 }), null);
  const erased = createDocument(); add(erased, { x: 1000, y: 2000 }, { x: 3000, y: 2000 });
  eraseWalls(erased, { x: 2000, y: 2000 }, { x: 2000, y: 2000 }, 50);
  assert.equal(resolveRoomStart(erased, { x: 2000, y: 2000 }), null);
  const branch = createDocument(); add(branch, { x: 1000, y: 2000 }, { x: 3000, y: 2000 });
  add(branch, { x: 2000, y: 2000 }, { x: 2000, y: 1600 });
  assert.equal(resolveRoomStart(branch, { x: 2000, y: 2000 }), null);
});

test('unrelated crossing, touching, enclosed or competing walls reject the whole room atomically', () => {
  for (const obstruction of [
    [{ x: 1800, y: 1800 }, { x: 2200, y: 1800 }], // enclosed
    [{ x: 2500, y: 500 }, { x: 2500, y: 2500 }], // crosses
    [{ x: 1800, y: 1000 }, { x: 2200, y: 1000 }], // touches top
    [{ x: 1600, y: 2000 }, { x: 1600, y: 2400 }], // branch at base
  ]) {
    const doc = createDocument(); add(doc, { x: 1000, y: 2000 }, { x: 3000, y: 2000 });
    const target = resolveRoomStart(doc, { x: 2000, y: 2000 });
    add(doc, ...obstruction); const before = structuredClone(doc);
    assert.throws(() => addAttachedRoom(doc, target, { x: 2900, y: 1000 })); assert.deepEqual(doc, before);
  }
});

test('another shared-base doorway or erasure is preserved by rejecting attachment', () => {
  for (const cut of ['door', 'gap']) {
    const doc = createDocument(); add(doc, { x: 1000, y: 2000 }, { x: 4000, y: 2000 });
    assert.equal(addDoor(doc, doc.edges[0].id, { x: 2500, y: 2000 }), true);
    const target = resolveRoomStart(doc, { x: 2500, y: 2000 });
    if (cut === 'door') assert.equal(addDoor(doc, doc.edges[0].id, { x: 3200, y: 2000 }, { centerTolerance: 0 }), true);
    else eraseWalls(doc, { x: 3200, y: 2000 }, { x: 3200, y: 2000 }, 25);
    const before = structuredClone(doc);
    assert.throws(() => addAttachedRoom(doc, target, { x: 3700, y: 1000 }), /opening/); assert.deepEqual(doc, before);
  }
});

test('nearby external stubs keep their exact endpoints instead of automatically joining the room', () => {
  const doc = createDocument(); add(doc, { x: 1000, y: 2000 }, { x: 3000, y: 2000 });
  add(doc, { x: 1800, y: 500 }, { x: 1800, y: 970 });
  const stub = structuredClone(doc.edges.at(-1));
  const endpoints = [stub.a, stub.b].map(id => structuredClone(doc.vertices.find(vertex => vertex.id === id)));
  const target = resolveRoomStart(doc, { x: 2000, y: 2000 });
  addAttachedRoom(doc, target, { x: 2900, y: 1000 });
  assert.deepEqual(doc.edges.find(edge => edge.id === stub.id), stub);
  for (const endpoint of endpoints) assert.deepEqual(doc.vertices.find(vertex => vertex.id === endpoint.id), endpoint);
});

test('ship/corridor substantial inward drags and stale mouths preserve all original state', () => {
  const ship = createDocument(), shipTarget = resolveRoomStart(ship, { x: 4110.5, y: 4700 });
  for (const aim of [{ x: 5510.5, y: 6700 }, { x: 4110.5, y: 4775.01 }]) {
    const before = structuredClone(ship); assert.throws(() => addAttachedRoom(ship, shipTarget, aim)); assert.deepEqual(ship, before);
  }
  const doc = createDocument(); addCorridor(doc, [{ x: 2000, y: 2000 }, { x: 2000, y: 3000 }]);
  const target = resolveRoomStart(doc, { x: 2000, y: 3000 });
  for (const aim of [{ x: 3000, y: 2000 }, { x: 2000, y: 2924.99 }]) {
    const before = structuredClone(doc); assert.throws(() => addAttachedRoom(doc, target, aim)); assert.deepEqual(doc, before);
  }
  add(doc, { x: 1710, y: 3000 }, { x: 1710, y: 3500 });
  const before = structuredClone(doc); assert.throws(() => addAttachedRoom(doc, target, { x: 3000, y: 4000 }), /mouth/); assert.deepEqual(doc, before);
});

function previewDimensions(doc, target, aim) {
  const points = attachedRoomSegments(doc, target, aim).flatMap(segment => [segment.a, segment.b]);
  const normal = { x: -target.direction.y, y: target.direction.x };
  const along = points.map(point => (point.x - target.point.x) * target.direction.x + (point.y - target.point.y) * target.direction.y);
  const across = points.map(point => (point.x - target.point.x) * normal.x + (point.y - target.point.y) * normal.y);
  return { width: Math.max(...along) - Math.min(...along), depth: Math.max(...across) - Math.min(...across) };
}

test('straight outward and tangent-only ship drags produce centered square rooms', () => {
  for (const mirrored of [false, true]) for (const [aim, width, depth, left, top] of [
    [{ x: 4110.5, y: 2700 }, 2000, 2000, 3110.5, 2700],
    [{ x: 5510.5, y: 4700 }, 2800, 2800, 2710.5, 1900],
    [{ x: 5510.5, y: 4775 }, 2800, 2800, 2710.5, 1900],
    [{ x: 4185.5, y: 2700 }, 2000, 2000, 3110.5, 2700],
    [{ x: 4120.5, y: 4690 }, 900, 450, 3660.5, 4250],
  ]) {
    const doc = createDocument(); doc.ship.mirrored = mirrored;
    const target = resolveRoomStart(doc, { x: 4110.5, y: 4700 }), before = structuredClone(doc);
    const dimensions = previewDimensions(doc, target, aim);
    near(dimensions.width, width); near(dimensions.depth, depth); assert.deepEqual(doc, before);
    addAttachedRoom(doc, target, aim);
    near(Math.min(...doc.vertices.map(point => point.x)), left);
    near(Math.min(...doc.vertices.map(point => point.y)), top);
    near(Math.max(...doc.vertices.map(point => point.y)), 4700);
    pointNear(doorRecords(doc)[0].point, target.point);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('normal-only and tangent-only wall/door drags work in all eight orientations', () => {
  for (let index = 0; index < 8; index++) for (const existingDoor of [false, true]) for (const component of ['normal', 'tangent']) {
    const angle = index * Math.PI / 4, tangent = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -tangent.y, y: tangent.x }, center = { x: 2000.5, y: 2000.25 };
    const doc = createDocument(); add(doc, at(center, tangent, -1200), at(center, tangent, 1200));
    if (existingDoor) assert.equal(addDoor(doc, doc.edges[0].id, center), true);
    const target = resolveRoomStart(doc, center), originalDoor = existingDoor ? doorRecords(doc)[0] : null;
    const aim = at(center, component === 'normal' ? normal : tangent, component === 'normal' ? 1200 : 1000);
    const dimensions = previewDimensions(doc, target, aim), expected = component === 'normal' ? 1200 : 2000;
    near(dimensions.width, expected); near(dimensions.depth, expected);
    addAttachedRoom(doc, target, aim);
    assert.equal(doorRecords(doc).length, 1); pointNear(doorRecords(doc)[0].point, target.point);
    if (originalDoor) assert.equal(doorRecords(doc)[0].id, originalDoor.id);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('normal-only, tangent-only and tiny corridor drags preserve the mouth in every direction', () => {
  for (let index = 0; index < 8; index++) for (const component of ['normal', 'tangent', 'tiny']) {
    const angle = index * Math.PI / 4, direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const doc = createDocument(), center = { x: 2000.5, y: 2000.25 }, end = at(center, direction, 500);
    addCorridor(doc, [center, end]);
    const target = corridorEndTargets(doc).find(target => Math.hypot(target.point.x - end.x, target.point.y - end.y) < EPS);
    const aim = component === 'normal' ? at(target.point, target.outwardDirection, 1200)
      : component === 'tangent' ? at(target.point, target.direction, 1000)
      : aimAt(target.point, target.direction, target.outwardDirection, 10, 10);
    const dimensions = previewDimensions(doc, target, aim);
    near(dimensions.width, component === 'tiny' ? 1050 : component === 'normal' ? 1200 : 2000);
    near(dimensions.depth, component === 'tiny' ? 450 : component === 'normal' ? 1200 : 2000);
    const endpoints = target.vertexIds.map(id => structuredClone(doc.vertices.find(vertex => vertex.id === id)));
    addAttachedRoom(doc, target, aim);
    for (const endpoint of endpoints) assert.deepEqual(doc.vertices.find(vertex => vertex.id === endpoint.id), endpoint);
    pointNear(doorRecords(doc)[0].point, target.point);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('tiny wall/door previews clamp to legal minima while tangent-only walls choose up or left', () => {
  for (const vertical of [false, true]) for (const existingDoor of [false, true]) {
    const doc = createDocument(), center = { x: 2000, y: 2000 };
    const tangent = vertical ? { x: 0, y: 1 } : { x: 1, y: 0 };
    add(doc, at(center, tangent, -1200), at(center, tangent, 1200));
    if (existingDoor) addDoor(doc, doc.edges[0].id, center);
    const target = resolveRoomStart(doc, center), before = structuredClone(doc);
    const tiny = previewDimensions(doc, target, { x: 2010, y: 2010 });
    near(tiny.width, 900); near(tiny.depth, 450); assert.deepEqual(doc, before);
    const segments = attachedRoomSegments(doc, target, at(center, tangent, 1000));
    const points = segments.flatMap(segment => [segment.a, segment.b]);
    if (vertical) { near(Math.max(...points.map(point => point.x)), 2000); near(Math.min(...points.map(point => point.x)), 0); }
    else { near(Math.max(...points.map(point => point.y)), 2000); near(Math.min(...points.map(point => point.y)), 0); }
    addAttachedRoom(doc, target, at(center, tangent, 1000));
    pointNear(doorRecords(doc)[0].point, target.point);
  }
});

test('attached rooms avoid protected hull space and preserve centered expansion/atomic out-of-bounds failures', () => {
  const hull = createDocument(); add(hull, { x: 3000, y: 5500 }, { x: 3000, y: 7500 });
  const hullTarget = resolveRoomStart(hull, { x: 3000, y: 6500 }), savedHull = structuredClone(hull);
  assert.throws(() => addAttachedRoom(hull, hullTarget, { x: 4500, y: 7500 }), /ship/); assert.deepEqual(hull, savedHull);
  const expanded = createDocument(); add(expanded, { x: 400, y: 1000 }, { x: 2400, y: 1000 });
  const target = resolveRoomStart(expanded, { x: 1400, y: 1000 });
  const before = structuredClone(expanded);
  attachedRoomSegments(expanded, target, { x: 2300, y: -500 }); assert.deepEqual(expanded, before);
  addAttachedRoom(expanded, target, { x: 2300, y: -500 });
  assert.deepEqual([expanded.width, expanded.height, expanded.originX, expanded.originY], [16384, 16384, -4096, -4096]);
  assert.deepEqual(expanded.ship, before.ship);
  const failed = structuredClone(before);
  assert.throws(() => addAttachedRoom(failed, target, { x: 2300, y: -5000 }), /16384/); assert.deepEqual(failed, before);
});

test('the shared doorway still renders as a 375 pixel gap after host subdivisions and reload', () => {
  const doc = createDocument(); add(doc, { x: 1000.5, y: 2000.25 }, { x: 3000.5, y: 2000.25 });
  addDoor(doc, doc.edges[0].id, { x: 2000.5, y: 2000.25 });
  const target = resolveRoomStart(doc, { x: 2000, y: 1990 }); addAttachedRoom(doc, target, { x: 2900.5, y: 1000.25 });
  const loaded = validateDocument(JSON.parse(JSON.stringify(doc))), edge = loaded.edges.find(edge => edge.doors.length);
  const a = loaded.vertices.find(vertex => vertex.id === edge.a), b = loaded.vertices.find(vertex => vertex.id === edge.b);
  const parts = segmentVisibleParts(a, b, edge.doors, loaded.style.doorWidth, edge.gaps);
  near(Math.hypot(parts[1].a.x - parts[0].b.x, parts[1].a.y - parts[0].b.y), 375);
  assert.equal(edge.doors[0].id, target.doorId);
});
