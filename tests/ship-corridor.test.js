import test from 'node:test';
import assert from 'node:assert/strict';
import { shipDoorways } from '../src/ship.js';
import { resolveCorridorStart, fitCorridorEnd } from '../src/corridors.js';
import { createDocument, addWall, addCorridor, validateDocument } from '../src/model.js';
import { segmentVisibleParts } from '../src/render.js';

test('the fixed outer airlock attracts across its exact opening and bounded margins in both orientations', () => {
  for (const mirrored of [false, true]) {
    const doc = createDocument(); doc.ship.mirrored = mirrored;
    const x = 4110.5, before = structuredClone(doc);
    const [door] = shipDoorways(doc.ship);
    assert.deepEqual(door.point, { x, y: 4700 });
    assert.equal(door.width, 375);
    for (const dx of [-237.5, -187.5, 0, 187.5, 237.5]) {
      const target = resolveCorridorStart(doc, { x: x + dx, y: 4640 });
      assert.equal(target.kind, 'door');
      assert.equal(target.source, 'ship');
      assert.equal(target.doorId, 'ship-outer-door');
      assert.deepEqual(target.point, { x, y: 4700 });
      assert.deepEqual(target.direction, { x: 1, y: 0 });
    }
    assert.equal(resolveCorridorStart(doc, { x: x + 237.51, y: 4700 }), null);
    assert.equal(resolveCorridorStart(doc, { x, y: 4624.99 }), null);
    assert.equal(resolveCorridorStart(doc, { x: x + 188, y: 4700 }, { doorMargin: 0 }), null);
    assert.equal(resolveCorridorStart(doc, { x, y: 4701 }, { wallTolerance: 0 }), null);
    assert.deepEqual(doc, before);
  }
});

test('a nearer graph wall blocks ship attraction even when its own midpoint does not attract', () => {
  const doc = createDocument();
  addWall(doc, { x: 3400, y: 4688 }, { x: 4800, y: 4688 }, { joinTolerance: 0 });
  assert.equal(resolveCorridorStart(doc, { x: 4210.5, y: 4680 }), null);
  const midpoint = resolveCorridorStart(doc, { x: 4110.5, y: 4680 });
  assert.equal(midpoint.kind, 'center');
  assert.deepEqual(midpoint.point, { x: 4100, y: 4688 });
  assert.equal(resolveCorridorStart(doc, { x: 4210.5, y: 4699 }).source, 'ship');
});

test('the nearer outer door wins over a farther graph wall and door', () => {
  const doc = createDocument();
  doc.vertices = [{ id: 'left', x: 3400, y: 4630 }, { id: 'right', x: 4800, y: 4630 }];
  doc.edges = [{ id: 'wall', a: 'left', b: 'right', doors: [{ id: 'door', t: .5 }], gaps: [] }];
  assert.equal(resolveCorridorStart(doc, { x: 4110.5, y: 4690 }).source, 'ship');
  assert.equal(resolveCorridorStart(doc, { x: 4110.5, y: 4631 }).doorId, 'door');
});

test('ship doorway targeting keeps the exact fractional corridor origin through insertion and persistence', () => {
  for (const mirrored of [false, true]) {
    const doc = createDocument(); doc.ship.mirrored = mirrored;
    const ship = structuredClone(doc.ship);
    // Keep both established graph attachments pinned at their existing coordinates.
    for (const x of [3739.5, 4452.5]) addWall(doc, { x, y: 4740 }, { x, y: 5140 }, { joinTolerance: 0 });
    const target = resolveCorridorStart(doc, { x: mirrored ? 4150 : 4180, y: 4670 });
    const start = target.point, end = { x: start.x, y: 3200 };
    addCorridor(doc, [start, end]);
    const railStarts = doc.vertices.filter(v => v.y === start.y).sort((a, b) => a.x - b.x);
    assert.equal(railStarts.length, 2);
    assert.equal(railStarts[1].x - railStarts[0].x, 580);
    assert.equal((railStarts[0].x + railStarts[1].x) / 2, 4110.5);
    assert.deepEqual(doc.ship, ship);
    for (const x of [3739.5, 4452.5]) assert.ok(doc.vertices.some(v => v.x === x && v.y === 4740));
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('short outer-airlock corridors preserve the exact fractional center and ship in both facings', () => {
  for (const mirrored of [false, true]) for (const length of [25, 75, 150]) {
    const doc = createDocument(); doc.ship.mirrored = mirrored;
    const ship = structuredClone(doc.ship), target = resolveCorridorStart(doc, { x: 4210.5, y: 4690 });
    assert.deepEqual(target.point, { x: 4110.5, y: 4700 });
    addCorridor(doc, [target.point, { x: target.point.x, y: target.point.y - length }]);
    assert.equal(doc.edges.length, 2);
    const starts = doc.vertices.filter(vertex => vertex.y === 4700).sort((a, b) => a.x - b.x);
    const ends = doc.vertices.filter(vertex => vertex.y === 4700 - length).sort((a, b) => a.x - b.x);
    assert.equal(starts.length, 2); assert.equal(ends.length, 2);
    assert.equal(starts[1].x - starts[0].x, 580); assert.equal(ends[1].x - ends[0].x, 580);
    assert.equal((starts[0].x + starts[1].x) / 2, 4110.5); assert.equal((ends[0].x + ends[1].x) / 2, 4110.5);
    assert.deepEqual(doc.ship, ship); assert.equal(doc.edges.flatMap(edge => edge.doors).length, 0);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test('a corridor remains centered on the outer airlock after facing changes in either direction', () => {
  for (const initiallyMirrored of [false, true]) {
    const doc = createDocument(); doc.ship.mirrored = initiallyMirrored;
    for (const x of [3739.5, 4452.5]) addWall(doc, { x, y: 4740 }, { x, y: 5140 }, { joinTolerance: 0 });
    const target = resolveCorridorStart(doc, { x: 4125, y: 4680 });
    assert.deepEqual(target.point, { x: 4110.5, y: 4700 });
    addCorridor(doc, [target.point, { x: 4110.5, y: 3200 }]);
    const graph = structuredClone({ vertices: doc.vertices, edges: doc.edges });
    const bounds = [doc.width, doc.height, doc.originX, doc.originY];
    for (const mirrored of [!initiallyMirrored, initiallyMirrored]) {
      doc.ship.mirrored = mirrored;
      const rails = doc.vertices.filter(vertex => vertex.y === 4700).sort((a, b) => a.x - b.x);
      const doorway = shipDoorways(doc.ship)[0];
      assert.equal(rails.length, 2);
      assert.deepEqual(doorway.point, { x: (rails[0].x + rails[1].x) / 2, y: 4700 });
      assert.equal(rails[1].x - rails[0].x, 580);
      assert.deepEqual({ vertices: doc.vertices, edges: doc.edges }, graph, 'Facing changes preserve every saved graph coordinate, pin and ID');
      assert.deepEqual([doc.width, doc.height, doc.originX, doc.originY], bounds);
      assert.deepEqual(doc.ship, { x: 4096, y: 4740, mirrored });
      assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc, 'Both facing states reopen with exact corridor alignment');
    }
  }
});

test('the ship outer door also supplies a fractional target for automatic endpoint fitting', () => {
  const doc = createDocument(), target = resolveCorridorStart(doc, { x: 4125, y: 4680 });
  const path = [{ x: 3000, y: 3000 }, { x: 4100, y: 4100 }, { x: 4100, y: 4700 }];
  const fit = fitCorridorEnd(path, target.point);
  assert.ok(fit);
  assert.deepEqual(fit.path.at(-1), { x: 4110.5, y: 4700 });
  assert.deepEqual(fit.path[0], path[0]);
});

test('ship targets do not introduce editable door cuts or alter graph door widths', () => {
  const doc = createDocument(), [target] = shipDoorways(doc.ship);
  assert.equal(target.width, doc.style.doorWidth);
  const parts = segmentVisibleParts({ x: 3500, y: 4700 }, { x: 4700, y: 4700 }, [{ t: .5 }], doc.style.doorWidth);
  assert.equal(parts[1].a.x - parts[0].b.x, 375);
  assert.deepEqual(doc.vertices, []);
  assert.deepEqual(doc.edges, []);
  assert.deepEqual(shipDoorways(null), []);
});
