import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { shipPorts, legacyShipPorts, isShipPort, shipDoorways } from '../src/ship.js';
import { createDocument, validateDocument, addWall, snapWallStart, moveVertex, moveWall, moveSelection, ensureCanvasContains, eraseWalls } from '../src/model.js';
import { getWallSpan, resolveDoorPlacement } from '../src/doors.js';
import { copySelection, pasteSelection } from '../src/clipboard.js';
import { generateFloor, floorRegionContainsPoint } from '../src/floors.js';
import { createPngChunk, encodePngMetadata, decodePngMetadata } from '../src/png.js';

const corrected = [{ x: 3739.5, y: 4700 }, { x: 4481.5, y: 4700 }];
const legacy = [{ x: 3739.5, y: 4740 }, { x: 4452.5, y: 4740 }];
const pointOf = (document, id) => {
  const { x, y } = document.vertices.find(vertex => vertex.id === id);
  return { x, y };
};
const select = edgeId => ({ edgeIds: [edgeId], vertexIds: [] });

function blankPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255, 0]))),
    createPngChunk('IEND'),
  ]);
}

function station(ports, mirrored) {
  const document = createDocument(); document.ship.mirrored = mirrored;
  const [left, right] = ports;
  const points = [left, { x: left.x, y: 4400 }, { x: 2000, y: 4400 },
    { x: 2000, y: 1000 }, { x: 6500, y: 1000 }, { x: 6500, y: 4400 },
    { x: right.x, y: 4400 }, right];
  for (let index = 1; index < points.length; index++) {
    addWall(document, points[index - 1], points[index], { joinTolerance: 0 });
  }
  return document;
}

test('new airlock wall starts use the measured upright centers and upper doorway plane in both facings', () => {
  for (const mirrored of [false, true]) {
    const document = createDocument(); document.ship.mirrored = mirrored;
    const ports = shipPorts(document.ship);
    assert.deepEqual(ports, corrected);
    assert.deepEqual(legacyShipPorts(document.ship), legacy);
    const doorway = shipDoorways(document.ship)[0].point;
    assert.equal(ports[0].y, doorway.y);
    assert.equal(ports[1].y, doorway.y);
    assert.equal((ports[0].x + ports[1].x) / 2, doorway.x);
    assert.equal(ports[1].x - ports[0].x, 742);
    for (const point of [...ports, ...legacy]) assert.ok(isShipPort(document.ship, point));
    assert.equal(isShipPort(document.ship, { x: 4452.5, y: 4700 }), false,
      'The former horizontal bridge corner is not another visible start or protected graph pin');
    assert.equal(isShipPort(document.ship, { x: 4481.5, y: 4740 }), false);
  }
});

test('corrected and legacy ship attachments stay pinned while their free endpoints remain editable', () => {
  for (const mirrored of [false, true]) for (const port of [...corrected, ...legacy]) {
    const document = createDocument(); document.ship.mirrored = mirrored;
    const [edge] = addWall(document, port, { x: port.x, y: 3700 }, { joinTolerance: 0 });
    const before = structuredClone(document);
    assert.equal(moveVertex(document, edge.a, { x: port.x, y: port.y + 100 }), false);
    assert.deepEqual(document, before);
    assert.equal(moveWall(document, edge.id, { x: 100, y: 0 }), false);
    assert.deepEqual(document, before);
    assert.equal(moveSelection(document, select(edge.id), { x: 100, y: -100 }), false);
    assert.deepEqual(document, before);
    assert.equal(moveVertex(document, edge.b, { x: port.x, y: 3600 }), true);
    assert.deepEqual(pointOf(document, edge.a), port);
    assert.deepEqual(pointOf(document, edge.b), { x: port.x, y: 3600 });
    assert.deepEqual(validateDocument(document), document);
  }
});

test('fixed wall starts and committed endpoints stay exact beside an attachment from the other generation', () => {
  for (const mirrored of [false, true]) for (const side of [0, 1]) {
    for (const startingAtCorrected of [false, true]) for (const horizontal of [false, true]) {
      const document = createDocument(); document.ship.mirrored = mirrored;
      const existingPort = (startingAtCorrected ? legacy : corrected)[side];
      const start = (startingAtCorrected ? corrected : legacy)[side];
      const existingEnd = { x: existingPort.x, y: existingPort.y + (startingAtCorrected ? 500 : -500) };
      addWall(document, existingPort, existingEnd);
      const before = structuredClone(document);
      assert.deepEqual(snapWallStart(document, start), start,
        'Default endpoint attraction must preserve the resolved fixed handle');
      assert.deepEqual(document, before, 'Start preview is read-only');
      const end = horizontal
        ? { x: start.x + (side === 0 ? -500 : 500), y: start.y }
        : { x: start.x, y: start.y + (startingAtCorrected ? -500 : 500) };
      const added = addWall(document, start, end);
      assert.deepEqual(added.start, start, 'Committed start matches the preview');
      assert.deepEqual(added.end, end, 'A preserved start cannot shift the opposite endpoint');
      assert.equal(added.length, 1);
      assert.deepEqual(pointOf(document, added[0].a), start);
      assert.deepEqual(pointOf(document, added[0].b), end);
      assert.deepEqual(document.vertices.filter(vertex => before.vertices.some(old => old.id === vertex.id)), before.vertices,
        'The other-generation saved graph remains exact');
      assert.deepEqual(document.edges.filter(edge => before.edges.some(old => old.id === edge.id)), before.edges);
      assert.equal(document.vertices.length, 4);
      assert.equal(document.edges.length, 2);
      assert.deepEqual(validateDocument(document), document);

      if (!horizontal) {
        const fixedId = added[0].a, graphBeforeReuse = structuredClone(document);
        const reuseEnd = { x: start.x + (side === 0 ? -500 : 500), y: start.y };
        assert.deepEqual(snapWallStart(document, start), start);
        const reused = addWall(document, start, reuseEnd);
        assert.equal(reused[0].a, fixedId, 'Additional walls reuse the exact existing fixed vertex');
        assert.deepEqual(reused.start, start);
        assert.deepEqual(reused.end, reuseEnd);
        assert.deepEqual(document.vertices.filter(vertex => graphBeforeReuse.vertices.some(old => old.id === vertex.id)), graphBeforeReuse.vertices);
        assert.deepEqual(document.edges.filter(edge => graphBeforeReuse.edges.some(old => old.id === edge.id)), graphBeforeReuse.edges);
        assert.equal(document.vertices.length, 5);
        assert.equal(document.edges.length, 3);
        assert.deepEqual(validateDocument(document), document);
      }
    }
  }
});

test('corrected and legacy airlock pins stop door spans through otherwise collinear joints', () => {
  for (const mirrored of [false, true]) for (const port of [...corrected, ...legacy]) {
    const document = createDocument(); document.ship.mirrored = mirrored;
    document.vertices = [
      { id: 'v0', x: port.x, y: port.y - 1000 },
      { id: 'v1', ...port },
      { id: 'v2', x: port.x, y: port.y + 1000 },
    ];
    document.edges = [
      { id: 'e0', a: 'v0', b: 'v1', doors: [], gaps: [] },
      { id: 'e1', a: 'v1', b: 'v2', doors: [], gaps: [] },
    ];
    assert.deepEqual(getWallSpan(document, 'e0').edgeIds, ['e0']);
    assert.deepEqual(getWallSpan(document, 'e1').edgeIds, ['e1']);
    assert.deepEqual(resolveDoorPlacement(document, 'e0', { x: port.x, y: port.y - 460 }).point,
      { x: port.x, y: port.y - 500 });
    assert.equal(resolveDoorPlacement(document, 'e0', { x: port.x, y: port.y - 100 }), null,
      'Door clearance cannot use a wall on the other side of the fixed attachment');
    assert.deepEqual(validateDocument(document), document);
  }
});

test('clipboard rejects placing a detached copy on either attachment generation and accepts ordinary nearby space', () => {
  const source = createDocument();
  const [edge] = addWall(source, { x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { joinTolerance: 0 });
  const fragment = copySelection(source, select(edge.id));
  for (const mirrored of [false, true]) for (const port of [...corrected, ...legacy]) {
    const document = createDocument(); document.ship.mirrored = mirrored;
    const before = structuredClone(document);
    assert.throws(() => pasteSelection(document, fragment, { x: port.x - 1000, y: port.y - 1000 }), /fixed ship ports/);
    assert.deepEqual(document, before, 'Rejected paste remains atomic');
    const selection = pasteSelection(document, fragment, { x: port.x - 1000, y: port.y - 1200 });
    assert.equal(moveSelection(document, selection, { x: 0, y: -100 }), true);
    assert.deepEqual(document.ship, before.ship);
    validateDocument(document);
  }
});

test('JSON and editable PNG imports retain exact corrected and legacy attachment coordinates without migration', () => {
  for (const mirrored of [false, true]) for (const port of [...corrected, ...legacy]) {
    const document = createDocument(); document.ship.mirrored = mirrored;
    addWall(document, port, { x: port.x, y: 3700 }, { joinTolerance: 0 });
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(document))), document);
    const reopened = validateDocument(decodePngMetadata(encodePngMetadata(blankPng(), document)));
    assert.deepEqual(reopened, document);
    document.ship.mirrored = !mirrored;
    assert.deepEqual(shipPorts(document.ship), corrected);
    assert.deepEqual(legacyShipPorts(document.ship), legacy);
    assert.deepEqual(document.vertices, reopened.vertices, 'Changing facing leaves saved graph coordinates exact');
  }
});

test('stations close at corrected or legacy starts in both facings and exterior erasures remain open', () => {
  for (const ports of [corrected, legacy]) for (const mirrored of [false, true]) {
    const document = station(ports, mirrored), before = structuredClone(document);
    const floor = generateFloor(document);
    assert.equal(floor.closed, true, `${ports === corrected ? 'Corrected' : 'Legacy'} ports; mirrored=${mirrored}`);
    for (const point of [{ x: 3000, y: 2000 }, { x: 5500, y: 3000 }, { x: 4110.5, y: 4700 }, { x: 4110.5, y: 5308 }]) {
      assert.ok(floorRegionContainsPoint(floor.polygons, point), 'Station and both fixed openings share floor');
    }
    assert.deepEqual(document, before, 'Floor derivation cannot move graph attachments');
    document.ship.mirrored = !mirrored;
    assert.equal(generateFloor(document).closed, true, 'Artwork facing preserves attachment closure');
    assert.deepEqual(document.vertices, before.vertices);
    assert.deepEqual(document.edges, before.edges);
    document.ship.mirrored = mirrored;
    assert.equal(eraseWalls(document, { x: 3000, y: 1000 }, { x: 3000, y: 1000 }, 10), true);
    assert.equal(generateFloor(document).closed, false, 'A real exterior gap still connects to space');
  }
});

test('centered canvas expansion preserves corrected starts, saved geometry and derived floor scale', () => {
  for (const mirrored of [false, true]) {
    const document = station(corrected, mirrored), before = structuredClone(document);
    const floor = generateFloor(document);
    assert.equal(floor.closed, true);
    assert.equal(ensureCanvasContains(document, [{ x: -100, y: 1000 }]), true);
    assert.deepEqual([document.width, document.height, document.originX, document.originY], [16384, 16384, -4096, -4096]);
    assert.deepEqual(document.vertices, before.vertices);
    assert.deepEqual(document.edges, before.edges);
    assert.deepEqual(document.ship, before.ship);
    assert.deepEqual(shipPorts(document.ship), corrected);
    const expanded = generateFloor(document);
    assert.equal(expanded.closed, true);
    assert.deepEqual(expanded.polygons, floor.polygons);
    assert.deepEqual(expanded.wallPolygons, floor.wallPolygons);
    assert.deepEqual(expanded.shipPolygons, floor.shipPolygons);
    assert.deepEqual(validateDocument(document), document);
  }
});
