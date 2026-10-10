import test from 'node:test';
import assert from 'node:assert/strict';
import { addWall, addRoom, addDoor, createDocument, roomSegments, validateDocument } from '../src/model.js';
import { detectRoom, proposeRoomResize, constrainRoomEnd } from '../src/rooms.js';

const EPS = 1e-5;
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < EPS, `${actual} != ${expected}`);
function rectangle(doc, points) {
  return points.flatMap((a, i) => addWall(doc, a, points[(i + 1) % points.length]));
}
function applyProposal(doc, proposal) {
  const copy = structuredClone(doc);
  for (const vertex of copy.vertices) if (proposal.positions.has(vertex.id)) Object.assign(vertex, proposal.positions.get(vertex.id));
  return copy;
}

test('square sizing preserves the free start corner and drag signs for upright and rotated rooms', () => {
  for (const rotated of [false, true]) for (const xSign of [-1, 1]) for (const ySign of [-1, 1]) {
    const start = { x: 3000.5, y: 3000.25 }, aim = { x: start.x + xSign * 1100, y: start.y + ySign * 600 };
    const inputs = structuredClone([start, aim]);
    const end = constrainRoomEnd(start, aim, { square: true });
    assert.deepEqual(end, { x: start.x + xSign * 1100, y: start.y + ySign * 1100 });
    assert.deepEqual([start, aim], inputs);
    const doc = createDocument(); addRoom(doc, start, end, rotated);
    const room = detectRoom(doc, doc.edges[0].id);
    assert.equal(room.orientation, rotated ? 45 : 0);
    near(room.bounds.right - room.bounds.left, 1100); near(room.bounds.bottom - room.bounds.top, 1100);
    near(room.chamfer, 220);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('square constraint follows either dominant dimension and uses a stable sign for an absent axis', () => {
  const start = { x: 2000, y: 2000 };
  for (const [aim, expected] of [
    [{ x: 2500, y: 3400 }, { x: 3400, y: 3400 }],
    [{ x: 2000, y: 600 }, { x: 3400, y: 600 }],
    [{ x: 600, y: 2000 }, { x: 600, y: 3400 }],
    [{ x: 2000, y: 2000 }, { x: 2000, y: 2000 }],
  ]) assert.deepEqual(constrainRoomEnd(start, aim, { square: true }), expected);
});

test('toggling square sizing is pure and restores the same unconstrained free geometry', () => {
  const start = { x: 2000, y: 1200 }, aim = { x: 3100, y: 1800 }, inputs = structuredClone([start, aim]);
  for (const rotated of [false, true]) {
    const original = roomSegments(start, aim, rotated);
    assert.deepEqual(roomSegments(start, constrainRoomEnd(start, aim), rotated), original);
    assert.deepEqual(roomSegments(start, constrainRoomEnd(start, aim, { square: false }), rotated), original);
    assert.notDeepEqual(roomSegments(start, constrainRoomEnd(start, aim, { square: true }), rotated), original);
    assert.deepEqual(roomSegments(start, constrainRoomEnd(start, aim), rotated), original);
  }
  assert.deepEqual([start, aim], inputs);
  assert.throws(() => constrainRoomEnd(start, { x: NaN, y: 1800 }, { square: true }), /Invalid room geometry/);
});

test('free squares retain primitive minimum/bounds validation and centered expansion behavior', () => {
  const tiny = createDocument(), savedTiny = structuredClone(tiny);
  assert.throws(() => addRoom(tiny, { x: 1000, y: 1000 }, constrainRoomEnd({ x: 1000, y: 1000 }, { x: 1200, y: 1100 }, { square: true })), /wider and taller/);
  assert.deepEqual(tiny, savedTiny);
  const doc = createDocument(), start = { x: 1000, y: 1000 };
  addRoom(doc, start, constrainRoomEnd(start, { x: 500, y: -500 }, { square: true }));
  assert.deepEqual([doc.width, doc.height, doc.originX, doc.originY], [16384, 16384, -4096, -4096]);
  assert.deepEqual(doc.ship, createDocument().ship);
  const invalid = createDocument(), before = structuredClone(invalid);
  assert.throws(() => addRoom(invalid, start, constrainRoomEnd(start, { x: -5000, y: 800 }, { square: true })), /16384/);
  assert.deepEqual(invalid, before);
});

test('axis room wall resize translates all four near corners and preserves fixed chamfers', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const before = structuredClone(doc), edge = doc.edges[0];
  addDoor(doc, edge.id, { x: 2000, y: 1000 });
  const saved = structuredClone(doc);
  const room = detectRoom(doc, edge.id);
  assert.equal(room.kind, 'chamfered'); assert.equal(room.orientation, 0); assert.equal(room.side.boundary, 'top');
  const proposal = proposeRoomResize(doc, edge.id, { x: 91, y: -300 });
  assert.equal(proposal.blocked, false);
  assert.deepEqual(doc, saved);
  for (const vertex of before.vertices) {
    near(proposal.positions.get(vertex.id).x, vertex.x);
    near(proposal.positions.get(vertex.id).y, vertex.y <= 1220 ? vertex.y - 300 : vertex.y);
  }
  const resized = applyProposal(doc, proposal);
  const after = detectRoom(resized, edge.id);
  near(after.chamfer, 220); near(after.bounds.top, 700); near(after.bounds.bottom, 2500);
  assert.deepEqual(resized.edges, doc.edges);
});

test('a diagonal long wall resizes a rotated room in its local frame', () => {
  const doc = createDocument();
  addRoom(doc, { x: 2500, y: 2500 }, { x: 4500, y: 4000 }, true);
  const edge = doc.edges[0], room = detectRoom(doc, edge.id);
  assert.equal(room.orientation, 45);
  const proposal = proposeRoomResize(doc, edge.id, { x: 200, y: -200 });
  assert.equal(proposal.blocked, false);
  const after = detectRoom(applyProposal(doc, proposal), edge.id);
  near(after.chamfer, 220);
  near(after.bounds.top - room.bounds.top, -200 * Math.SQRT2);
  near(after.bounds.bottom, room.bounds.bottom);
  for (const side of room.sides.filter(side => !side.boundary)) {
    near(distance(proposal.positions.get(side.a.id), proposal.positions.get(side.b.id)), 220 * Math.SQRT2);
  }
});

test('long-side classification uses nominal chamfer to disambiguate square rooms', () => {
  for (const size of [500, 2000]) for (const rotated of [false, true]) {
    const doc = createDocument();
    addRoom(doc, { x: 3000, y: 3000 }, { x: 3000 + size, y: 3000 + size }, rotated);
    assert.equal(detectRoom(doc, doc.edges[0].id)?.orientation, rotated ? 45 : 0);
    assert.equal(detectRoom(doc, doc.edges[1].id), null);
    assert.equal(proposeRoomResize(doc, doc.edges[1].id, { x: 100, y: 100 }), null);
  }
});

test('manually drawn rectangle remains recognizable after reload with reversed edge directions', () => {
  const doc = createDocument();
  const points = [{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2500 }, { x: 1000, y: 2500 }];
  rectangle(doc, points);
  for (const edge of doc.edges) [edge.a, edge.b] = [edge.b, edge.a];
  const loaded = JSON.parse(JSON.stringify(doc));
  const room = detectRoom(loaded, loaded.edges[0].id);
  assert.equal(room.kind, 'rectangle');
  const proposal = proposeRoomResize(loaded, loaded.edges[0].id, { x: 900, y: -250 });
  const moved = applyProposal(loaded, proposal);
  assert.deepEqual(moved.vertices.map(({ x, y }) => ({ x, y })), points.map(point => ({ ...point, y: point.y === 1000 ? 750 : point.y })));
});

test('split sides, outward attachments and door metadata do not prevent recognition', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 4000, y: 3500 });
  addWall(doc, { x: 2100, y: 1000 }, { x: 2100, y: 500 });
  const selected = doc.edges.find(edge => {
    const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
    return a.y === 1000 && b.y === 1000 && a.x < 2100;
  });
  assert.equal(addDoor(doc, selected.id, { x: 1600, y: 1000 }), true);
  const room = detectRoom(doc, selected.id);
  assert.equal(room.side.edgeIds.length, 2);
  assert.equal(room.vertexIds.length, 9);
  const attachment = doc.vertices.find(vertex => vertex.x === 2100 && vertex.y === 1000);
  const proposal = proposeRoomResize(doc, selected.id, { x: 0, y: -100 });
  near(proposal.positions.get(attachment.id).y, 900);
  assert.equal(proposal.positions.has(doc.vertices.find(vertex => vertex.y === 500).id), false);
});

test('dangling interior attachments are stripped from the face boundary', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 4000, y: 3500 });
  addWall(doc, { x: 2200, y: 1000 }, { x: 2200, y: 1800 });
  addWall(doc, { x: 2200, y: 1800 }, { x: 2800, y: 1800 });
  const room = detectRoom(doc, doc.edges[0].id);
  assert.equal(room.kind, 'chamfered');
  assert.equal(room.vertexIds.length, 9);
});

test('vertices along stretched adjacent sides interpolate while preserving their topology', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 4000, y: 3500 });
  addWall(doc, { x: 1000, y: 2000 }, { x: 500, y: 2000 });
  const split = doc.vertices.find(vertex => vertex.x === 1000 && vertex.y === 2000);
  const proposal = proposeRoomResize(doc, doc.edges[0].id, { x: 0, y: -400 });
  const t = (2000 - 1220) / (3280 - 1220);
  near(proposal.positions.get(split.id).y, 820 + (3280 - 820) * t);
  near(proposal.positions.get(split.id).x, 1000);
});

test('an eraser gap disables recognition but a door does not', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const edge = doc.edges[0];
  addDoor(doc, edge.id, { x: 2000, y: 1000 });
  assert.ok(detectRoom(doc, edge.id));
  doc.edges[2].gaps = [{ id: 'gap_test', start: 0.4, end: 0.6 }];
  assert.equal(detectRoom(doc, edge.id), null);
});

test('recognized room collapse is blocked rather than eligible for deforming fallback', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const proposal = proposeRoomResize(doc, doc.edges[0].id, { x: 0, y: 1200 });
  assert.equal(proposal.recognized, true); assert.equal(proposal.blocked, true); assert.equal(proposal.positions, null);
  assert.equal(proposeRoomResize(doc, doc.edges[0].id, { x: 100, y: 0 }).blocked, true);
});

test('non-room, uneven chamfers and shared-wall ambiguity do not invent a room', () => {
  const doc = createDocument();
  const [open] = addWall(doc, { x: 1000, y: 1000 }, { x: 3000, y: 1000 });
  assert.equal(detectRoom(doc, open.id), null);
  const uneven = createDocument();
  addRoom(uneven, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  uneven.vertices.find(vertex => vertex.x === 1220 && vertex.y === 1000).x += 30;
  assert.equal(detectRoom(uneven, uneven.edges[0].id), null);
  const shared = createDocument();
  rectangle(shared, [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }, { x: 1000, y: 2000 }]);
  rectangle(shared, [{ x: 2000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 2000, y: 2000 }]);
  const edge = shared.edges.find(edge => shared.vertices.find(v => v.id === edge.a).x === 2000 && shared.vertices.find(v => v.id === edge.b).x === 2000);
  assert.equal(detectRoom(shared, edge.id), null);
});
