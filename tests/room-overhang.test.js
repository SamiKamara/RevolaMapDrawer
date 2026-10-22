import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, addWall, addDoor, validateDocument } from '../src/model.js';
import { resolveRoomStart, attachedRoomSegments, addAttachedRoom } from '../src/room-start.js';
import { shipPorts } from '../src/ship.js';

const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-5;

function hostRoom(rectangular, angle = 0, existingDoor = false) {
  const doc = createDocument(), tangent = { x: Math.cos(angle), y: Math.sin(angle) };
  const outward = { x: -tangent.y, y: tangent.x }, center = { x: 2500.5, y: 2500.25 };
  const world = (x, y) => ({ x: center.x + tangent.x * x + outward.x * y,
    y: center.y + tangent.y * x + outward.y * y });
  const points = (rectangular
    ? [[-550, 0], [550, 0], [550, -900], [-550, -900]]
    : [[-330, 0], [330, 0], [550, -220], [550, -680], [330, -900], [-330, -900], [-550, -680], [-550, -220]])
    .map(([x, y]) => world(x, y));
  for (let i = 0; i < points.length; i++) addWall(doc, points[i], points[(i + 1) % points.length], { joinTolerance: 0 });
  if (existingDoor) assert.equal(addDoor(doc, doc.edges[0].id, center), true);
  const target = resolveRoomStart(doc, center); assert.ok(target);
  return { doc, target, world, corners: points.slice(0, 2) };
}

test('both room types overhang either host type in all eight directions with new or existing doors', () => {
  for (const hostRectangle of [false, true]) for (const rectangular of [false, true]) {
    for (let index = 0; index < 8; index++) for (const existingDoor of [false, true]) {
      const { doc, target, world, corners } = hostRoom(hostRectangle, index * Math.PI / 4, existingDoor);
      const before = structuredClone(doc), options = { rectangular, square: index % 2 === 0 };
      const aim = world(1050, 800), preview = attachedRoomSegments(doc, target, aim, options);
      assert.deepEqual(doc, before, 'Preview is pure');
      assert.ok(Math.hypot(preview[1].b.x - preview[0].a.x, preview[1].b.y - preview[0].a.y) > 1100);
      assert.doesNotThrow(() => addAttachedRoom(doc, target, aim, options),
        JSON.stringify({ hostRectangle, rectangular, index, existingDoor }));
      for (const corner of corners) {
        const original = before.vertices.find(point => near(point, corner));
        assert.deepEqual(doc.vertices.find(point => point.id === original.id), original);
        assert.equal(doc.edges.filter(edge => edge.a === original.id || edge.b === original.id).length, 3,
          'The extended base shares each original corner');
      }
      const doors = doc.edges.flatMap(edge => edge.doors.map(door => {
        const a = doc.vertices.find(point => point.id === edge.a), b = doc.vertices.find(point => point.id === edge.b);
        return { id: door.id, x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t };
      }));
      assert.equal(doors.length, 1); assert.ok(near(doors[0], target.point));
      if (existingDoor) assert.equal(doors[0].id, before.edges.flatMap(edge => edge.doors)[0].id);
      assert.deepEqual(doc.ship, before.ship); assert.equal(doc.version, 2);
      assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
    }
  }
});

test('overhanging rooms reject outward host branches and unrelated obstructions without mutation', () => {
  for (const hostRectangle of [false, true]) for (const rectangular of [false, true]) {
    for (const obstruction of [
      [[-700, 0], [-700, -500]], // unrelated wall touches the extended base from behind
      [[800, -300], [800, 1100]], // crosses extension and new side
      [[-400, 800], [400, 800]], // touches far wall
      [[-300, 400], [300, 400]], // enclosed wall
      [[hostRectangle ? 550 : 330, 0], [hostRectangle ? 550 : 330, 400]], // outward corner branch
    ]) {
      const { doc, target, world } = hostRoom(hostRectangle);
      addWall(doc, world(...obstruction[0]), world(...obstruction[1]), { joinTolerance: 0 });
      const before = structuredClone(doc);
      assert.throws(() => addAttachedRoom(doc, target, world(1050, 800), { rectangular }),
        JSON.stringify({ hostRectangle, rectangular, obstruction }));
      assert.deepEqual(doc, before);
    }
    const { doc, target, world } = hostRoom(hostRectangle), before = structuredClone(doc);
    assert.throws(() => addAttachedRoom(doc, target, world(1050, -800), { rectangular }), 'The host interior is obstructed');
    assert.deepEqual(doc, before);
  }
});

test('off-center existing doors allow overhang on just one end of either host type', () => {
  for (const hostRectangle of [false, true]) for (const rectangular of [false, true]) {
    for (const side of [-1, 1]) {
      const { doc, world } = hostRoom(hostRectangle), center = world(side * 100, 0);
      assert.equal(addDoor(doc, doc.edges[0].id, center, { centerTolerance: 0 }), true);
      const target = resolveRoomStart(doc, center), original = doc.edges.flatMap(edge => edge.doors)[0].id;
      addAttachedRoom(doc, target, world(side * 100 + 600, 800), { rectangular });
      const doors = doc.edges.flatMap(edge => edge.doors);
      assert.equal(doors.length, 1); assert.equal(doors[0].id, original);
      assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
    }
  }
});

test('overhang expansion keeps the original world geometry and fixed ship ports remain protected', () => {
  for (const rectangular of [false, true]) {
    const { doc, target, world } = hostRoom(true), before = structuredClone(doc);
    addAttachedRoom(doc, target, world(3000, 800), { rectangular });
    assert.equal(doc.width, 16384); assert.equal(doc.originX, -4096); assert.equal(doc.originY, -4096);
    assert.deepEqual(doc.ship, before.ship);
    for (const point of before.vertices) assert.deepEqual(doc.vertices.find(vertex => vertex.id === point.id), point);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);

    const pinned = createDocument(), port = shipPorts(pinned.ship)[0];
    addWall(pinned, { x: port.x - 800, y: port.y }, port, { joinTolerance: 0 });
    const connection = resolveRoomStart(pinned, { x: port.x - 400, y: port.y }), original = structuredClone(pinned);
    assert.ok(connection);
    assert.throws(() => addAttachedRoom(pinned, connection, { x: port.x + 600, y: port.y - 800 }, { rectangular }), /ship port/);
    assert.deepEqual(pinned, original);
  }
});
