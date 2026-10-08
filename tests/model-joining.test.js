import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, validateDocument, addWall, addDoor, addRoom, addCorridor, moveWall, moveVertex } from '../src/model.js';

const wall = (doc, ax, ay, bx, by, options = { joinTolerance: 0 }) => addWall(doc, { x: ax, y: ay }, { x: bx, y: by }, options)[0];
const joint = (doc, x, y, degree = 3) => {
  const vertex = doc.vertices.find(v => Math.abs(v.x - x) < 1e-6 && Math.abs(v.y - y) < 1e-6);
  assert.ok(vertex, `Shared joint at ${x},${y}`);
  assert.equal(doc.edges.filter(e => e.a === vertex.id || e.b === vertex.id).length, degree);
  assert.deepEqual(validateDocument(doc), doc);
};
const pointAt = (doc, edge, t) => {
  const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};

test('receiving wall drawn last closes multiple small face gaps into real shared joints', () => {
  const doc = createDocument();
  wall(doc, 2000, 1000, 2000, 1970);
  wall(doc, 3000, 1000, 3000, 1975);
  wall(doc, 1000, 2000, 4000, 2000, {});
  joint(doc, 2000, 2000); joint(doc, 3000, 2000);
  assert.equal(doc.edges.length, 5);
  assert.ok(!doc.vertices.some(v => v.y === 1970 || v.y === 1975));
});

test('diagonal wall ends extend on their own ray and keep 45-degree directions', () => {
  const doc = createDocument();
  wall(doc, 1000, 975, 2000, 1975);
  wall(doc, 1000, 2000, 4000, 2000, {});
  joint(doc, 2025, 2000);
});

test('receiving face attraction does not absorb larger deliberate gaps or parallel walls', () => {
  const doc = createDocument();
  wall(doc, 2400, 1200, 2400, 1960);
  wall(doc, 1300, 1975, 3500, 1975);
  const before = structuredClone(doc.vertices);
  wall(doc, 1000, 2000, 4000, 2000, {});
  for (const vertex of before) assert.deepEqual(doc.vertices.find(v => v.id === vertex.id), vertex);
  assert.equal(doc.edges.length, 3);
  validateDocument(doc);
});

test('redrawing a touched old near-wall stub repairs it but import and unrelated edits do not', () => {
  const doc = createDocument();
  wall(doc, 1000, 2000, 4000, 2000);
  wall(doc, 2400, 1200, 2400, 1970);
  const before = structuredClone(doc);
  assert.deepEqual(validateDocument(doc), before);
  wall(doc, 5000, 1000, 6000, 1000, {});
  assert.ok(doc.vertices.some(v => v.x === 2400 && v.y === 1970));
  const result = addWall(doc, { x: 2400, y: 1600 }, { x: 2400, y: 1970 });
  joint(doc, 2400, 2000);
  assert.deepEqual(result.end, { x: 2400, y: 2000 }, 'Chained drawing continues at the repaired endpoint');
});

test('extending an old end preserves existing door and erasure world positions and IDs', () => {
  const doc = createDocument();
  const old = wall(doc, 2400, 300, 2400, 1970);
  assert.equal(addDoor(doc, old.id, { x: 2400, y: 750 }, { centerTolerance: 0 }), true);
  old.gaps.push({ id: 'saved_gap', start: 1100 / 1670, end: 1200 / 1670 });
  const before = { door: pointAt(doc, old, old.doors[0].t), gap: old.gaps.map(g => [pointAt(doc, old, g.start), pointAt(doc, old, g.end)]) };
  const doorId = old.doors[0].id;
  wall(doc, 1000, 2000, 4000, 2000, {});
  joint(doc, 2400, 2000);
  const updated = doc.edges.find(e => e.id === old.id);
  assert.equal(updated.doors[0].id, doorId);
  assert.equal(updated.gaps[0].id, 'saved_gap');
  assert.deepEqual(pointAt(doc, updated, updated.doors[0].t), before.door);
  assert.deepEqual(updated.gaps.map(g => [pointAt(doc, updated, g.start), pointAt(doc, updated, g.end)]), before.gap);
});

test('erased free endpoints do not regrow a join and pinned ports cannot extend', () => {
  const doc = createDocument();
  const stub = wall(doc, 2400, 1200, 2400, 1970);
  stub.gaps.push({ id: 'erased_end', start: .95, end: 1 });
  wall(doc, 1000, 2000, 4000, 2000, {});
  assert.ok(doc.vertices.some(v => v.x === 2400 && v.y === 1970));
  const pin = wall(doc, 3739.5, 3740, 3739.5, 4740);
  const pinnedId = pin.b;
  wall(doc, 3000, 4770, 4500, 4770, {});
  assert.deepEqual(doc.vertices.find(v => v.id === pinnedId), { id: pinnedId, x: 3739.5, y: 4740 });
  validateDocument(doc);
});

test('moving a receiving wall joins old free ends, while door and erased target cuts remain open', () => {
  for (const cut of ['none', 'door', 'erased']) {
    const doc = createDocument();
    const receiver = wall(doc, 1000, 2100, 4000, 2100);
    if (cut === 'door') assert.equal(addDoor(doc, receiver.id, { x: 2500, y: 2100 }), true);
    if (cut === 'erased') receiver.gaps.push({ id: 'target_gap', start: .49, end: .51 });
    wall(doc, 2500, 1000, 2500, 1970);
    assert.equal(moveWall(doc, receiver.id, { x: 0, y: -100 }), true);
    if (cut === 'none') joint(doc, 2500, 2000);
    else {
      assert.ok(doc.vertices.some(v => v.x === 2500 && v.y === 1970));
      assert.equal(doc.edges.length, 2);
      assert.equal(doc.edges.find(e => e.id === receiver.id)[cut === 'door' ? 'doors' : 'gaps'].length, 1);
      validateDocument(doc);
    }
  }
});

test('room and corridor construction also join old ends at their receiving faces', () => {
  const room = createDocument();
  wall(room, 2400, 1000, 2400, 1970);
  addRoom(room, { x: 1000, y: 2000 }, { x: 4000, y: 4000 });
  joint(room, 2400, 2000);
  const corridor = createDocument();
  wall(corridor, 2400, 1000, 2400, 1970);
  addCorridor(corridor, [{ x: 1000, y: 2290 }, { x: 4000, y: 2290 }]);
  joint(corridor, 2400, 2000);
});

test('explicit zero joining tolerance leaves separate small gaps precise', () => {
  const doc = createDocument();
  wall(doc, 2400, 1000, 2400, 1970);
  wall(doc, 1000, 2000, 4000, 2000);
  assert.equal(doc.edges.length, 2);
  assert.ok(doc.vertices.some(v => v.y === 1970));
  validateDocument(doc);
});

test('successive joins remap cuts on the actual child edge after an earlier split', () => {
  const doc = createDocument();
  const receiver = wall(doc, 100, 2000, 3000, 2000);
  assert.equal(addDoor(doc, receiver.id, { x: 2500, y: 2000 }, { centerTolerance: 0 }), true);
  receiver.gaps.push({ id: 'later_gap', start: (2750 - 100) / 2900, end: (2800 - 100) / 2900 });
  const doorId = receiver.doors[0].id;
  wall(doc, 2000, 1000, 2000, 1980);
  wall(doc, 3025, 1500, 3025, 2500);
  const baseline = structuredClone(doc);
  assert.equal(moveVertex(baseline, receiver.a, { x: 75, y: 2000 }, { joinTolerance: 0 }), true);
  const baselineEdge = baseline.edges.find(e => e.id === receiver.id);
  const expectedDoor = pointAt(baseline, baselineEdge, baselineEdge.doors[0].t);
  const expectedGap = baselineEdge.gaps.map(g => [pointAt(baseline, baselineEdge, g.start), pointAt(baseline, baselineEdge, g.end)]);
  assert.equal(moveVertex(doc, receiver.a, { x: 75, y: 2000 }), true);
  joint(doc, 2000, 2000); joint(doc, 3025, 2000);
  const child = doc.edges.find(e => e.doors.some(d => d.id === doorId));
  const actualDoor = pointAt(doc, child, child.doors[0].t);
  assert.ok(Math.abs(actualDoor.x - expectedDoor.x) < 1e-6);
  assert.equal(actualDoor.y, expectedDoor.y);
  const actualGap = child.gaps.map(g => [pointAt(doc, child, g.start), pointAt(doc, child, g.end)]);
  actualGap[0].forEach((point, i) => assert.ok(Math.abs(point.x - expectedGap[0][i].x) < 1e-6));
  assert.equal(child.gaps[0].id, 'later_gap');
});
