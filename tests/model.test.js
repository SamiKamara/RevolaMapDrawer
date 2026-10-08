import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, createDocument, validateDocument, snapPoint, snapEndpoint, snapWallStart, resolveWallEndpoint, addWall, addDoor, removeDoor, removeEdge, nearestEdge, roomSegments, addRoom, corridorSegments, addCorridor, moveWall, moveVertex, getMapBounds, ensureCanvasContains, eraseWalls, edgeGapIntervals, edgeWallIntervals } from '../src/model.js';
import { detectRoom } from '../src/rooms.js';

const endpoints = (doc, edge) => [edge.a, edge.b].map(id => doc.vertices.find(v => v.id === id));
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const assertAngles = segments => segments.forEach(({ a, b }) => {
  const x = Math.abs(a.x - b.x), y = Math.abs(a.y - b.y);
  assert.ok(x < 1e-6 || y < 1e-6 || Math.abs(x - y) < 1e-6);
});

test('default document has measured style and independent copies', () => {
  const doc = createDocument();
  assert.equal(doc.style.doorWidth, 375);
  assert.equal(doc.ship.y, 4740);
  const imported = validateDocument(doc);
  imported.style.wallWidth = 90;
  assert.equal(doc.style.wallWidth, DEFAULTS.wallWidth);
});

test('construction snaps to a true 8-way grid, including non-grid anchors', () => {
  assert.deepEqual(snapPoint({ x: 63, y: 87 }), { x: 75, y: 75 });
  assert.deepEqual(snapEndpoint({ x: 101, y: 103 }, { x: 404, y: 388 }), { x: 401, y: 403 });
  assert.deepEqual(snapEndpoint({ x: 100, y: 100 }, { x: 506, y: 160 }), { x: 500, y: 100 });
});

test('crossing walls split into one shared graph vertex', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 500 }, { x: 900, y: 500 });
  addWall(doc, { x: 500, y: 100 }, { x: 500, y: 900 });
  assert.equal(doc.edges.length, 4);
  assert.equal(doc.vertices.length, 5);
  const center = doc.vertices.find(v => v.x === 500 && v.y === 500);
  assert.equal(doc.edges.filter(e => e.a === center.id || e.b === center.id).length, 4);
  validateDocument(doc);
});

test('touching and overlapping walls share vertices without duplicate strokes', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 100 }, { x: 600, y: 100 });
  addWall(doc, { x: 400, y: 100 }, { x: 900, y: 100 });
  addWall(doc, { x: 900, y: 100 }, { x: 900, y: 500 });
  assert.equal(doc.edges.length, 3);
  assert.equal(doc.vertices.length, 4);
  addWall(doc, { x: 100, y: 100 }, { x: 900, y: 100 });
  assert.equal(doc.edges.length, 3);
  validateDocument(doc);
});

test('door placement rejects overlap and ends and removal restores edge', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 100 }, { x: 1600, y: 100 });
  assert.equal(addDoor(doc, edge.id, { x: 180, y: 100 }), false);
  assert.equal(addDoor(doc, edge.id, { x: 500, y: 100 }), true);
  assert.equal(addDoor(doc, edge.id, { x: 600, y: 100 }), false);
  assert.equal(addDoor(doc, edge.id, { x: 1100, y: 100 }), true);
  assert.equal(removeDoor(doc, edge.id, edge.doors[0].id), true);
  assert.equal(edge.doors.length, 1);
  validateDocument(doc);
});

test('splits preserve doorway world positions and reject cuts through doors atomically', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  addDoor(doc, edge.id, { x: 1500, y: 500 });
  addWall(doc, { x: 600, y: 100 }, { x: 600, y: 900 });
  const doorEdge = doc.edges.find(e => e.doors.length);
  const [a, b] = endpoints(doc, doorEdge);
  assert.equal(a.x + (b.x - a.x) * doorEdge.doors[0].t, 1500);
  const before = structuredClone(doc);
  assert.throws(() => addWall(doc, { x: 1500, y: 100 }, { x: 1500, y: 900 }), /doorway/);
  assert.deepEqual(doc, before);
  validateDocument(doc);
});

test('doors keep a constant physical width on diagonal edges', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 100 }, { x: 1100, y: 1100 });
  assert.equal(addDoor(doc, edge.id, { x: 600, y: 600 }), true);
  const [a, b] = endpoints(doc, edge), half = doc.style.doorWidth / (2 * length(a, b));
  assert.ok(Math.abs((2 * half) * length(a, b) - 375) < 1e-6);
});

test('nearest wall projection and deletion retain graph integrity', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 100 }, { x: 1000, y: 100 });
  const hit = nearestEdge(doc, { x: 550, y: 145 }, 50);
  assert.equal(hit.edge.id, edge.id);
  assert.equal(hit.t, 0.5);
  assert.equal(hit.distance, 45);
  assert.equal(nearestEdge(doc, { x: 550, y: 145 }, 40), null);
  assert.equal(removeEdge(doc, edge.id), true);
  assert.deepEqual(doc.vertices, []);
});

test('invalid geometry and imports are rejected', () => {
  const doc = createDocument();
  assert.throws(() => addWall(doc, { x: 100, y: 100 }, { x: 900, y: 400 }), /45/);
  assert.throws(() => addWall(doc, { x: 100, y: 100 }, { x: -4200, y: 100 }), /inside/);
  addWall(doc, { x: 100, y: 100 }, { x: 1000, y: 100 });
  const missing = structuredClone(doc); missing.edges[0].b = 'missing';
  assert.throws(() => validateDocument(missing));
  const duplicate = structuredClone(doc); duplicate.vertices[1].id = duplicate.vertices[0].id;
  assert.throws(() => validateDocument(duplicate));
  const nonfinite = structuredClone(doc); nonfinite.vertices[0].x = Infinity;
  assert.throws(() => validateDocument(nonfinite));
  const malicious = structuredClone(doc); malicious.style.grid = 0;
  assert.throws(() => validateDocument(malicious));
  const oversize = structuredClone(doc); oversize.width = 999999;
  assert.throws(() => validateDocument(oversize));
  const extra = structuredClone(doc); extra.script = 'untrusted';
  assert.equal(validateDocument(extra).script, undefined);
});

test('rooms retain fixed chamfers and legal rotated edges', () => {
  for (const rotated of [false, true]) {
    const segments = roomSegments({ x: 1000, y: 1000 }, { x: 2200, y: 1900 }, rotated);
    assert.equal(segments.length, 8);
    assertAngles(segments);
    assert.ok(Math.abs(length(segments[1].a, segments[1].b) - DEFAULTS.chamfer * Math.SQRT2) < 1e-6);
    const doc = createDocument();
    addRoom(doc, { x: 1000, y: 1000 }, { x: 2200, y: 1900 }, rotated);
    assert.equal(doc.vertices.length, 8);
    validateDocument(doc);
  }
  assert.throws(() => roomSegments({ x: 0, y: 0 }, { x: 300, y: 600 }), /wider/);
});

test('corridors maintain width, legal mitres, and reject reversals', () => {
  const straight = corridorSegments([{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }]);
  assert.equal(Math.abs(straight[0].a.y - straight[1].a.y), 580);
  const path = [{ x: 1000, y: 1000 }, { x: 2400, y: 1000 }, { x: 3200, y: 1800 }, { x: 3200, y: 3200 }];
  assertAngles(corridorSegments(path));
  const doc = createDocument();
  addCorridor(doc, path);
  assert.equal(doc.edges.length, 6);
  validateDocument(doc);
  assert.throws(() => corridorSegments([{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 1000, y: 1000 }]), /90/);
  assert.throws(() => corridorSegments([{ x: 1000, y: 1000 }, { x: 1100, y: 1000 }, { x: 1100, y: 1100 }]), /close/);
});

test('room and corridor transactions leave the original unchanged on failure', () => {
  const doc = createDocument(), before = structuredClone(doc);
  assert.throws(() => addRoom(doc, { x: -4100, y: -4100 }, { x: -2900, y: -2900 }, true), /inside/);
  assert.deepEqual(doc, before);
  assert.throws(() => addCorridor(doc, [{ x: -4000, y: -4000 }, { x: -2800, y: -4000 }]), /inside/);
  assert.deepEqual(doc, before);
});

test('door endpoint and split clearance includes wall caps and roughness', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  assert.equal(addDoor(doc, edge.id, { x: 300, y: 500 }), false);
  assert.equal(addDoor(doc, edge.id, { x: 1500, y: 500 }), true);
  const before = structuredClone(doc);
  assert.throws(() => addWall(doc, { x: 1700, y: 100 }, { x: 1700, y: 900 }), /doorway/);
  assert.deepEqual(doc, before);
  const imported = structuredClone(doc); imported.edges[0].doors[0].t = 0.1;
  assert.throws(() => validateDocument(imported), /endpoint/);
});

test('import preserves fixed Revola measurements and ship anchor', () => {
  for (const key of ['wallWidth', 'doorWidth', 'corridorWidth', 'chamfer', 'grid']) {
    const doc = createDocument(); doc.style[key]++;
    assert.throws(() => validateDocument(doc), /fixed/);
  }
  const doc = createDocument(); doc.ship.x = 5000;
  assert.throws(() => validateDocument(doc), /anchor/);
});

test('wall drag resizes a room while preserving chamfers and the opposite wall', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const top = doc.edges[0];
  addDoor(doc, top.id, { x: 2000, y: 1000 });
  const before = structuredClone(doc);
  assert.equal(moveWall(doc, top.id, { x: 70, y: -100 }), true);
  const moved = doc.edges.find(e => e.id === top.id), [a, b] = endpoints(doc, moved);
  assert.equal(a.y, 900); assert.equal(b.y, 900);
  assert.equal(a.x, 1220); assert.equal(b.x, 2780);
  assert.deepEqual(doc.edges, before.edges);
  for (const old of before.vertices) {
    const current = doc.vertices.find(v => v.id === old.id);
    assert.equal(current.x, old.x);
    assert.equal(current.y, old.y <= 1220 ? old.y - 100 : old.y);
  }
  assert.equal(detectRoom(doc, top.id).chamfer, 220);
  assert.equal(moved.doors.length, 1);
  validateDocument(doc);
});

test('corner drag slides its two neighbors while preserving graph angles', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const corner = doc.vertices.find(v => v.x === 1220 && v.y === 1000);
  const before = structuredClone(doc);
  assert.equal(moveVertex(doc, corner.id, { x: 1300, y: 900 }), true);
  assert.equal(doc.vertices.find(v => v.id === corner.id).x, 1300);
  assert.equal(doc.vertices.find(v => v.id === corner.id).y, 900);
  for (const edge of doc.edges) {
    const [a, b] = endpoints(doc, edge), [oldA, oldB] = endpoints(before, edge);
    assert.ok(Math.abs((b.x - a.x) * (oldB.y - oldA.y) - (b.y - a.y) * (oldB.x - oldA.x)) < 1e-6);
  }
  validateDocument(doc);
});

test('rejected boundary, collision, and branch drags leave complete state intact', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 1100, y: 500 });
  addWall(doc, { x: 100, y: 700 }, { x: 1100, y: 700 });
  let before = structuredClone(doc);
  assert.equal(moveWall(doc, edge.id, { x: 0, y: -5000 }), false);
  assert.deepEqual(doc, before);
  assert.equal(moveWall(doc, edge.id, { x: 0, y: 200 }), false);
  assert.deepEqual(doc, before);
  addWall(doc, { x: 500, y: 100 }, { x: 500, y: 500 });
  const junction = doc.vertices.find(v => v.x === 500 && v.y === 500);
  before = structuredClone(doc);
  assert.equal(moveVertex(doc, junction.id, { x: 600, y: 400 }), false);
  assert.deepEqual(doc, before);
});

test('drag cannot shorten a wall until its doorway hits a cap', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 2000, y: 2000 });
  const top = doc.edges[0];
  assert.equal(addDoor(doc, top.id, { x: 1500, y: 1000 }), true);
  const before = structuredClone(doc);
  const right = doc.edges[2];
  assert.equal(moveWall(doc, right.id, { x: -150, y: 0 }), false);
  assert.deepEqual(doc, before);
});

test('a terminal vertex stretches its wall while keeping the opposite end fixed', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 100 }, { x: 1000, y: 100 });
  assert.equal(moveVertex(doc, edge.b, { x: 1200, y: 175 }), true);
  const [a, b] = endpoints(doc, edge);
  assert.equal(a.x, 100); assert.equal(a.y, 100);
  assert.equal(b.x, 1200); assert.equal(b.y, 100);
});

test('ship port handles stay pinned and invalid drags roll back completely', () => {
  for (const offset of [-356.5, 356.5]) {
    const doc = createDocument(), port = { x: doc.ship.x + offset, y: doc.ship.y };
    const [edge] = addWall(doc, port, { x: port.x, y: 4000 });
    const before = structuredClone(doc);
    assert.equal(moveVertex(doc, edge.a, { x: port.x, y: 4800 }), false);
    assert.deepEqual(doc, before);
    assert.equal(moveWall(doc, edge.id, { x: 100, y: 0 }), false);
    assert.deepEqual(doc, before);
    assert.equal(moveVertex(doc, edge.b, { x: port.x, y: 3900 }), true);
    assert.deepEqual(endpoints(doc, edge)[0], before.vertices[0]);
    validateDocument(doc);
  }
});

test('moving a connected wall stretches its neighbor without moving the ship port', () => {
  const doc = createDocument(), port = { x: doc.ship.x - 356.5, y: doc.ship.y };
  const [vertical] = addWall(doc, port, { x: port.x, y: 4000 });
  const [horizontal] = addWall(doc, { x: port.x, y: 4000 }, { x: port.x + 1000, y: 4000 });
  assert.equal(moveWall(doc, horizontal.id, { x: 0, y: -100 }), true);
  const [pinned, moved] = endpoints(doc, vertical);
  assert.equal(pinned.x, port.x); assert.equal(pinned.y, port.y);
  assert.equal(moved.y, 3900);
  validateDocument(doc);
});

function unsplitDocument(segments) {
  const doc = createDocument();
  segments.forEach(([a, b], i) => {
    doc.vertices.push({ id: `a${i}`, x: a[0], y: a[1] }, { id: `b${i}`, x: b[0], y: b[1] });
    doc.edges.push({ id: `e${i}`, a: `a${i}`, b: `b${i}`, doors: [] });
  });
  return doc;
}

test('imports reject unsplit crossings, T-junctions, and nested overlaps', () => {
  const invalid = [
    [[[0, 128], [256, 128]], [[128, 0], [128, 256]]],
    [[[100, 100], [900, 900]], [[100, 900], [900, 100]]],
    [[[0, 128], [256, 128]], [[128, 128], [128, 256]]],
    [[[0, 100], [800, 100]], [[100, 100], [300, 100]]],
    [[[100, 100], [500, 500]], [[300, 300], [900, 900]]],
  ];
  for (const segments of invalid) assert.throws(() => validateDocument(unsplitDocument(segments)), /shared graph/);
});

test('imports accept split grid-boundary intersections and separate parallel walls', () => {
  const doc = createDocument();
  addWall(doc, { x: 0, y: 128 }, { x: 256, y: 128 });
  addWall(doc, { x: 128, y: 0 }, { x: 128, y: 256 });
  validateDocument(doc);
  const parallel = unsplitDocument(Array.from({ length: 1000 }, (_, i) => [[0, i * 8], [8192, i * 8]]));
  assert.equal(validateDocument(parallel).edges.length, 1000);
});

test('topology validation bounds pathological geometry density', () => {
  const crowded = unsplitDocument(Array.from({ length: 2100 }, (_, i) => [[1, 1 + i / 100], [2, 1 + i / 100]]));
  assert.throws(() => validateDocument(crowded), /too dense/);
});

test('legacy projects normalize to version2 without changing old roughness', () => {
  const legacy = createDocument();
  addWall(legacy, { x: 100, y: 100 }, { x: 1100, y: 100 });
  legacy.version = 1; legacy.style.roughness = 3;
  delete legacy.originX; delete legacy.originY; delete legacy.edges[0].gaps;
  const normalized = validateDocument(legacy);
  assert.equal(normalized.version, 2);
  assert.equal(normalized.originX, 0); assert.equal(normalized.originY, 0);
  assert.equal(normalized.style.roughness, 3);
  assert.deepEqual(normalized.edges[0].gaps, []);
  assert.equal(createDocument().style.roughness, 2.25);
});

test('drawing fully or partially over a doorway fills only the covered interval', () => {
  for (const reverse of [false, true]) {
    const doc = createDocument();
    const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
    addDoor(doc, edge.id, { x: 1100, y: 500 });
    const start = { x: 1000, y: 500 }, end = { x: 1200, y: 500 };
    addWall(doc, reverse ? end : start, reverse ? start : end);
    assert.equal(doc.edges.length, 1);
    assert.equal(doc.edges[0].doors.length, 0);
    assert.equal(doc.edges[0].gaps.length, 2);
    const gaps = edgeGapIntervals(doc, doc.edges[0]);
    assert.ok(Math.abs(gaps[0].start - 0.40625) < 1e-9);
    assert.ok(Math.abs(gaps[0].end - 0.45) < 1e-9);
    assert.ok(Math.abs(gaps[1].start - 0.55) < 1e-9);
    assert.ok(Math.abs(gaps[1].end - 0.59375) < 1e-9);
    validateDocument(doc);
    addWall(doc, { x: 800, y: 500 }, { x: 1400, y: 500 });
    assert.deepEqual(doc.edges[0].gaps, []);
    assert.deepEqual(doc.edges[0].doors, []);
    validateDocument(doc);
  }
});

test('collinear painting preserves disjoint doors and makes painting solid wall a no-op', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2600, y: 500 });
  addDoor(doc, edge.id, { x: 700, y: 500 }); addDoor(doc, edge.id, { x: 1900, y: 500 });
  const before = structuredClone(doc);
  addWall(doc, { x: 1000, y: 500 }, { x: 1300, y: 500 });
  assert.deepEqual(doc, before);
  addWall(doc, { x: 500, y: 500 }, { x: 900, y: 500 });
  assert.equal(doc.edges[0].doors.length, 1);
  assert.equal(doc.edges[0].doors[0].id, before.edges[0].doors[1].id);
  assert.equal(doc.edges[0].gaps.length, 0);
  validateDocument(doc);
});

test('free eraser sweeps exact capsule cuts and drawing restores arbitrary gaps', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  assert.equal(eraseWalls(doc, { x: 500, y: 500 }, { x: 900, y: 500 }, 100), true);
  assert.deepEqual(doc.edges[0].gaps.map(({ start, end }) => ({ start, end })), [{ start: 0.15, end: 0.45 }]);
  assert.equal(doc.edges[0].doors.length, 0);
  assert.deepEqual(edgeWallIntervals(doc, doc.edges[0]), [{ start: 0, end: 0.15 }, { start: 0.45, end: 1 }]);
  assert.equal(eraseWalls(doc, { x: 500, y: 500 }, { x: 900, y: 500 }, 100), false);
  addWall(doc, { x: 400, y: 500 }, { x: 1000, y: 500 });
  assert.equal(doc.edges[0].id, edge.id);
  assert.deepEqual(doc.edges[0].gaps, []);
  validateDocument(doc);
});

test('eraser cuts diagonal walls, handles point brushes and removes fully erased edges', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 100 }, { x: 1100, y: 1100 });
  assert.equal(eraseWalls(doc, { x: 600, y: 600 }, { x: 600, y: 600 }, 100), true);
  const gap = doc.edges[0].gaps[0];
  assert.ok(Math.abs((gap.end - gap.start) * Math.hypot(1000, 1000) - 200) < 1e-6);
  assert.equal(eraseWalls(doc, { x: 100, y: 100 }, { x: 1100, y: 1100 }, 100), true);
  assert.deepEqual(doc.edges, []); assert.deepEqual(doc.vertices, []);
});

test('eraser preserves untouched doors and converts widened doors to ordinary gaps', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  addDoor(doc, edge.id, { x: 1100, y: 500 });
  const before = structuredClone(doc);
  assert.equal(eraseWalls(doc, { x: 1100, y: 500 }, { x: 1100, y: 500 }, 100), false);
  assert.deepEqual(doc, before);
  assert.equal(eraseWalls(doc, { x: 1250, y: 500 }, { x: 1450, y: 500 }, 100), true);
  assert.equal(doc.edges[0].doors.length, 0);
  assert.equal(doc.edges[0].gaps.length, 1);
  assert.ok(Math.abs(doc.edges[0].gaps[0].start - 0.40625) < 1e-9);
  assert.ok(Math.abs(doc.edges[0].gaps[0].end - 0.725) < 1e-9);
  assert.equal(addDoor(doc, edge.id, { x: 1400, y: 500 }), false);
  validateDocument(doc);
});

test('new cuts and partial door fills cannot reuse an unchanged later gap identifier', () => {
  for (const fillDoor of [false, true]) {
    const doc = createDocument();
    const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
    eraseWalls(doc, { x: 1600, y: 500 }, { x: 1600, y: 500 }, 100);
    const retained = structuredClone(doc.edges[0].gaps[0]);
    if (fillDoor) {
      assert.equal(addDoor(doc, edge.id, { x: 600, y: 500 }), true);
      addWall(doc, { x: 550, y: 500 }, { x: 650, y: 500 });
    } else eraseWalls(doc, { x: 600, y: 500 }, { x: 600, y: 500 }, 100);
    const gaps = doc.edges[0].gaps;
    assert.deepEqual(gaps.at(-1), retained);
    assert.equal(new Set(gaps.map(g => g.id)).size, gaps.length);
    assert.deepEqual(validateDocument(doc), doc);
  }
});

test('intersections remap free gaps on both sides without creating a doorway', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  eraseWalls(doc, { x: 1000, y: 500 }, { x: 1200, y: 500 }, 100);
  addWall(doc, { x: 1100, y: 100 }, { x: 1100, y: 900 });
  const cuts = doc.edges.filter(e => e.gaps.length);
  assert.equal(cuts.length, 2);
  assert.ok(cuts.some(e => e.gaps[0].end === 1));
  assert.ok(cuts.some(e => e.gaps[0].start === 0));
  assert.notEqual(cuts[0].gaps[0].id, cuts[1].gaps[0].id);
  assert.equal(doc.edges.reduce((n, e) => n + e.doors.length, 0), 0);
  validateDocument(doc);
});

test('gap imports reject malformed ranges, overlaps and collisions with fixed doors', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  for (const gaps of [[{ id: 'g1', start: -0.1, end: 0.5 }], [{ id: 'g1', start: 0.6, end: 0.5 }],
    [{ id: 'g1', start: 0.2, end: 0.5 }, { id: 'g2', start: 0.4, end: 0.6 }]]) {
    const broken = structuredClone(doc); broken.edges[0].gaps = gaps;
    assert.throws(() => validateDocument(broken), /gap/);
  }
  addDoor(doc, edge.id, { x: 1100, y: 500 });
  doc.edges[0].gaps = [{ id: 'g1', start: 0.4, end: 0.6 }];
  assert.throws(() => validateDocument(doc), /doorway/);
});

test('canvas expansion keeps existing graph and ship coordinates stable', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  const originalVertices = structuredClone(doc.vertices), ship = structuredClone(doc.ship);
  addWall(doc, { x: -100, y: 1000 }, { x: 2100, y: 1000 });
  assert.equal(doc.width, 16384); assert.equal(doc.height, 16384);
  assert.deepEqual(getMapBounds(doc), { left: -4096, top: -4096, right: 12288, bottom: 12288 });
  assert.deepEqual(doc.vertices.slice(0, 2), originalVertices);
  assert.deepEqual(doc.ship, ship);
  assert.deepEqual(validateDocument(doc), doc);
  assert.equal(ensureCanvasContains(doc, [{ x: 9000, y: 9000 }]), false);
});

test('movement can expand the canvas and hard-bound failures roll back expansion', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 100 }, { x: 1000, y: 100 });
  assert.equal(moveWall(doc, edge.id, { x: 0, y: -300 }), true);
  assert.equal(doc.width, 16384);
  assert.equal(doc.vertices[0].y, -200);
  const before = structuredClone(doc);
  assert.equal(moveWall(doc, edge.id, { x: 0, y: -5000 }), false);
  assert.deepEqual(doc, before);
  const initial = createDocument(), initialBefore = structuredClone(initial);
  assert.throws(() => addWall(initial, { x: -100, y: 100 }, { x: 12300, y: 100 }), /maximum/);
  assert.deepEqual(initial, initialBefore);
});

test('rotated room resizing preserves all chamfer lengths, doors and the opposite extent', () => {
  const doc = createDocument();
  addRoom(doc, { x: 2500, y: 2500 }, { x: 4500, y: 4000 }, true);
  const edge = doc.edges[0], [a, b] = endpoints(doc, edge);
  assert.equal(addDoor(doc, edge.id, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), true);
  const before = structuredClone(doc), room = detectRoom(doc, edge.id);
  assert.equal(moveWall(doc, edge.id, { x: 200, y: -200 }), true);
  const after = detectRoom(doc, edge.id);
  assert.equal(after.orientation, 45);
  assert.ok(Math.abs(after.bounds.top - room.bounds.top + 200 * Math.SQRT2) < 1e-5);
  assert.ok(Math.abs(after.bounds.bottom - room.bounds.bottom) < 1e-5);
  for (const side of room.sides.filter(s => !s.boundary)) {
    const oldA = before.vertices.find(v => v.id === side.a.id), oldB = before.vertices.find(v => v.id === side.b.id);
    const newA = doc.vertices.find(v => v.id === side.a.id), newB = doc.vertices.find(v => v.id === side.b.id);
    assert.ok(Math.abs(length(oldA, oldB) - length(newA, newB)) < 1e-5);
  }
  assert.deepEqual(doc.edges, before.edges);
  validateDocument(doc);
});

test('manually drawn and reloaded rectangular walls resize without primitive metadata', () => {
  let doc = createDocument();
  const points = [{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2500 }, { x: 1000, y: 2500 }];
  for (let i = 0; i < points.length; i++) addWall(doc, points[(i + 1) % points.length], points[i]);
  doc = validateDocument(JSON.parse(JSON.stringify(doc)));
  const top = doc.edges[0], before = structuredClone(doc);
  assert.equal(moveWall(doc, top.id, { x: 300, y: -250 }), true);
  assert.equal(detectRoom(doc, top.id).kind, 'rectangle');
  for (const old of before.vertices) {
    const vertex = doc.vertices.find(v => v.id === old.id);
    assert.equal(vertex.x, old.x);
    assert.equal(vertex.y, old.y === 1000 ? 750 : old.y);
  }
  validateDocument(doc);
});

test('dragging a split room side moves both pieces and stretches a legal attachment', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 4000, y: 3500 });
  const [attachment] = addWall(doc, { x: 2100, y: 1000 }, { x: 2100, y: 500 });
  const selected = doc.edges.find(edge => {
    const [a, b] = endpoints(doc, edge);
    return a.y === 1000 && b.y === 1000 && a.x < 2100;
  });
  assert.equal(addDoor(doc, selected.id, { x: 1600, y: 1000 }), true);
  const before = structuredClone(doc), room = detectRoom(doc, selected.id);
  assert.equal(room.side.edgeIds.length, 2);
  assert.equal(moveWall(doc, selected.id, { x: 0, y: -100 }), true);
  for (const id of room.side.vertexIds) assert.equal(doc.vertices.find(v => v.id === id).y, 900);
  assert.equal(endpoints(doc, attachment)[1].y, 500);
  assert.deepEqual(doc.edges, before.edges);
  assert.equal(detectRoom(doc, selected.id).chamfer, 220);
  validateDocument(doc);
});

test('room resize rejects minimum size and incompatible external attachment without local fallback', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const top = doc.edges[0];
  let before = structuredClone(doc);
  assert.equal(moveWall(doc, top.id, { x: 0, y: 1200 }), false);
  assert.deepEqual(doc, before);
  assert.equal(moveWall(doc, top.id, { x: 100, y: 0 }), false);
  assert.deepEqual(doc, before);
  addWall(doc, { x: 1000, y: 1700 }, { x: 500, y: 1700 });
  assert.ok(detectRoom(doc, top.id));
  before = structuredClone(doc);
  assert.equal(moveWall(doc, top.id, { x: 0, y: -100 }), false);
  assert.deepEqual(doc, before);
});

test('room resizing rejects collisions and pinned ship-port movement atomically', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const top = doc.edges[0];
  addWall(doc, { x: 1500, y: 500 }, { x: 2500, y: 500 });
  const before = structuredClone(doc);
  assert.equal(moveWall(doc, top.id, { x: 0, y: -500 }), false);
  assert.deepEqual(doc, before);
  const pinned = createDocument(), port = { x: pinned.ship.x - 356.5, y: pinned.ship.y };
  const points = [{ x: port.x, y: 3740 }, { x: port.x + 1000, y: 3740 }, { x: port.x + 1000, y: port.y }, port];
  for (let i = 0; i < points.length; i++) addWall(pinned, points[i], points[(i + 1) % points.length]);
  const left = pinned.edges[3], pinnedBefore = structuredClone(pinned);
  assert.equal(detectRoom(pinned, left.id).kind, 'rectangle');
  assert.equal(moveWall(pinned, left.id, { x: -100, y: 0 }), false);
  assert.deepEqual(pinned, pinnedBefore);
  assert.equal(moveWall(pinned, pinned.edges[0].id, { x: 0, y: -100 }), true);
  assert.deepEqual(pinned.vertices.find(v => v.x === port.x && v.y === port.y), pinnedBefore.vertices.find(v => v.x === port.x && v.y === port.y));
  validateDocument(pinned);
});

test('room resize expands around the original center but rejects the hard boundary', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const top = doc.edges[0], ship = structuredClone(doc.ship);
  assert.equal(moveWall(doc, top.id, { x: 0, y: -1200 }), true);
  assert.equal(doc.width, 16384);
  assert.equal(doc.originX, -4096); assert.equal(doc.originY, -4096);
  assert.deepEqual(doc.ship, ship);
  assert.equal(detectRoom(doc, top.id).bounds.top, -200);
  const expanded = structuredClone(doc);
  assert.equal(moveWall(doc, top.id, { x: 0, y: -4000 }), false);
  assert.deepEqual(doc, expanded);
  validateDocument(doc);
});

test('chamfer dragging keeps ordinary local editing when no long room side is selected', () => {
  const doc = createDocument();
  addRoom(doc, { x: 1000, y: 1000 }, { x: 3000, y: 2500 });
  const chamfer = doc.edges[1], before = structuredClone(doc);
  assert.equal(detectRoom(doc, chamfer.id), null);
  assert.equal(moveWall(doc, chamfer.id, { x: 50, y: -50 }), true);
  const changed = doc.vertices.filter(v => {
    const old = before.vertices.find(item => item.id === v.id);
    return length(old, v) > 1e-6;
  });
  assert.equal(changed.length, 2);
  validateDocument(doc);
});

test('canvas growth and maximum bounds reserve the full sharp-corner silhouette', () => {
  const doc = createDocument(), options = { joinTolerance: 0 };
  addWall(doc, { x: 7660, y: 4000 }, { x: 8160, y: 4000 }, options);
  addWall(doc, { x: 8160, y: 4000 }, { x: 7660, y: 3500 }, options);
  assert.equal(doc.width, 16384);
  assert.equal(doc.originX, -4096);
  validateDocument(doc);
  const before = structuredClone(doc);
  assert.throws(() => addWall(doc, { x: 11750, y: 4000 }, { x: 12250, y: 4000 }, options), /maximum/);
  assert.deepEqual(doc, before, 'A miter that could exceed the maximum canvas is rejected atomically');
});

test('nearby perpendicular ends become a shared corner for undershot and overshot vertex drags', () => {
  for (const y of [475, 525]) {
    const doc = createDocument();
    addWall(doc, { x: 100, y: 500 }, { x: 900, y: 500 });
    const [vertical] = addWall(doc, { x: 925, y: 800 }, { x: 925, y: 1600 });
    assert.equal(moveVertex(doc, vertical.a, { x: 928, y }), true);
    const corner = doc.vertices.find(v => v.x === 925 && v.y === 500);
    assert.ok(corner);
    assert.equal(doc.vertices.length, 3); assert.equal(doc.edges.length, 2);
    assert.equal(doc.edges.filter(edge => edge.a === corner.id || edge.b === corner.id).length, 2);
    assert.equal(moveVertex(doc, corner.id, { x: 1000, y: 600 }), true);
    validateDocument(doc);
  }
});

test('wall dragging joins nearby ends without leaving a tiny overlapping spur', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 500 }, { x: 900, y: 500 });
  const [vertical] = addWall(doc, { x: 1000, y: 525 }, { x: 1000, y: 1600 });
  assert.equal(moveWall(doc, vertical.id, { x: -75, y: 0 }), true);
  assert.ok(doc.vertices.some(v => v.x === 925 && v.y === 500));
  assert.equal(doc.vertices.length, 3); assert.equal(doc.edges.length, 2);
  validateDocument(doc);
});

test('construction resolves both short gaps and overshoots before splitting wall intersections', () => {
  for (const x of [875, 925]) for (const y of [475, 525]) {
    const doc = createDocument();
    addWall(doc, { x: 100, y: 500 }, { x: x, y: 500 });
    const result = addWall(doc, { x: 900, y: 1600 }, { x: 900, y });
    assert.deepEqual(result.end, { x: 900, y: 500 });
    assert.equal(doc.vertices.length, 3); assert.equal(doc.edges.length, 2);
    assert.equal(doc.vertices.filter(v => v.x === 900 && v.y === 500).length, 1);
    validateDocument(doc);
  }
});

test('diagonal attraction and interior T-junctions preserve exact 45-degree topology', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 100 }, { x: 900, y: 900 });
  const [vertical] = addWall(doc, { x: 925, y: 1600 }, { x: 925, y: 1200 });
  assert.equal(moveVertex(doc, vertical.b, { x: 925, y: 950 }), true);
  assert.ok(doc.vertices.some(v => v.x === 925 && v.y === 925));
  assert.equal(doc.edges.length, 2); assert.equal(doc.vertices.length, 3);
  validateDocument(doc);
  const tee = createDocument();
  addWall(tee, { x: 100, y: 500 }, { x: 1900, y: 500 });
  const [stem] = addWall(tee, { x: 1000, y: 1600 }, { x: 1000, y: 800 });
  assert.equal(moveVertex(tee, stem.b, { x: 1000, y: 525 }), true);
  const junction = tee.vertices.find(v => v.x === 1000 && v.y === 500);
  assert.equal(tee.edges.filter(edge => edge.a === junction.id || edge.b === junction.id).length, 3);
  validateDocument(tee);
});

test('attraction keeps stationary doors and erased gaps at their world positions', () => {
  const doc = createDocument();
  const [wall] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  addDoor(doc, wall.id, { x: 600, y: 500 });
  eraseWalls(doc, { x: 1200, y: 500 }, { x: 1200, y: 500 }, 100);
  const [vertical] = addWall(doc, { x: 2125, y: 1600 }, { x: 2125, y: 800 });
  assert.equal(moveVertex(doc, vertical.b, { x: 2125, y: 525 }), true);
  const changed = doc.edges.find(edge => edge.id === wall.id), [a, b] = endpoints(doc, changed);
  assert.equal(a.x + (b.x - a.x) * changed.doors[0].t, 600);
  assert.equal(a.x + (b.x - a.x) * changed.gaps[0].start, 1100);
  assert.equal(a.x + (b.x - a.x) * changed.gaps[0].end, 1300);
  validateDocument(doc);
});

test('corner attraction does not close intentional doors or erased ends', () => {
  const doc = createDocument();
  const [wall] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  addDoor(doc, wall.id, { x: 1100, y: 500 });
  const [vertical] = addWall(doc, { x: 1100, y: 1600 }, { x: 1100, y: 800 });
  assert.equal(moveVertex(doc, vertical.b, { x: 1100, y: 525 }), true);
  assert.equal(doc.vertices.find(v => v.id === vertical.b).y, 525);
  assert.equal(doc.edges.find(edge => edge.id === wall.id).doors.length, 1);
  validateDocument(doc);
  const erased = createDocument();
  addWall(erased, { x: 100, y: 500 }, { x: 900, y: 500 });
  const [stem] = addWall(erased, { x: 925, y: 1600 }, { x: 925, y: 800 });
  eraseWalls(erased, { x: 925, y: 800 }, { x: 925, y: 800 }, 75);
  assert.equal(moveVertex(erased, stem.b, { x: 925, y: 525 }), true);
  assert.equal(erased.vertices.length, 4);
  assert.equal(erased.vertices.find(v => v.id === stem.b).y, 525);
  validateDocument(erased);
});

test('attraction tolerance is bounded and may be disabled for precise separate ends', () => {
  for (const [x, tolerance] of [[925, 0], [1025, 10000]]) {
    const doc = createDocument();
    addWall(doc, { x: 100, y: 500 }, { x: 900, y: 500 });
    const [stem] = addWall(doc, { x, y: 1600 }, { x, y: 800 });
    assert.equal(moveVertex(doc, stem.b, { x, y: 525 }, { joinTolerance: tolerance }), true);
    assert.equal(doc.vertices.length, 4);
    validateDocument(doc);
  }
});

test('near-collinear redraws extend one centerline and expose the actual chain endpoint', () => {
  const doc = createDocument();
  addWall(doc, { x: 100, y: 500 }, { x: 900, y: 500 });
  for (const [x, y, end] of [[750, 525, 1300], [1100, 475, 1800], [600, 520, 2300]]) {
    const result = addWall(doc, { x, y }, { x: end, y });
    assert.deepEqual(result.start, { x, y: 500 });
    assert.deepEqual(result.end, { x: end, y: 500 });
    assert.ok(doc.vertices.every(v => v.y === 500));
    validateDocument(doc);
  }
});

test('drawing previews use the committed corner and avoid snapping into doorway cuts', () => {
  const doc = createDocument();
  const [edge] = addWall(doc, { x: 100, y: 500 }, { x: 2100, y: 500 });
  addDoor(doc, edge.id, { x: 1100, y: 500 });
  assert.deepEqual(snapWallStart(doc, { x: 600, y: 525 }), { x: 600, y: 500 });
  assert.deepEqual(snapWallStart(doc, { x: 1100, y: 525 }), { x: 1100, y: 525 });
  assert.deepEqual(resolveWallEndpoint(doc, { x: 2125, y: 1600 }, { x: 2125, y: 525 }), { x: 2125, y: 500 });
  assert.deepEqual(resolveWallEndpoint(doc, { x: 1100, y: 1600 }, { x: 1100, y: 525 }), { x: 1100, y: 525 });
});

test('joining an existing ship-port attachment preserves the pinned coordinates', () => {
  const doc = createDocument(), port = { x: doc.ship.x - 356.5, y: doc.ship.y };
  const [attached] = addWall(doc, port, { x: port.x, y: port.y - 1000 });
  const [horizontal] = addWall(doc, { x: port.x - 1000, y: port.y }, { x: port.x - 100, y: port.y });
  assert.equal(moveVertex(doc, horizontal.b, { x: port.x - 25, y: port.y }), true);
  const pin = doc.vertices.find(v => v.id === attached.a);
  assert.deepEqual({ x: pin.x, y: pin.y }, port);
  assert.equal(doc.vertices.length, 3);
  const before = structuredClone(doc);
  assert.equal(moveVertex(doc, pin.id, { x: pin.x + 100, y: pin.y }), false);
  assert.deepEqual(doc, before);
  validateDocument(doc);
});
