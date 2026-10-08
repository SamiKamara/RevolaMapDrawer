import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, addWall, addDoor } from '../src/model.js';
import { drawMap } from '../src/render.js';
import { FLOOR_RIM, generateFloor, drawFloor, floorContainsPoint, floorRegionContainsPoint, renderFloorSvg } from '../src/floors.js';

function square(document, { x = 500, y = 500, size = 7000, prefix = 'outer' } = {}) {
  const points = [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];
  return ring(document, points, prefix);
}

function ring(document, points, prefix) {
  document.vertices.push(...points.map((point, index) => ({ id: `${prefix}v${index}`, ...point })));
  document.edges.push(...points.map((_, index) => ({ id: `${prefix}e${index}`,
    a: `${prefix}v${index}`, b: `${prefix}v${(index + 1) % points.length}`, doors: [], gaps: [] })));
  return document.edges.slice(-4);
}

function collectingContext() {
  const paths = [], strokes = [];
  let polygons, current;
  const context = { save() {}, restore() {},
    beginPath() { polygons = []; },
    moveTo(x, y) { current = [{ x, y }]; },
    lineTo(x, y) { current.push({ x, y }); },
    closePath() { polygons.push(current); },
    fill() { paths.push(polygons); },
    stroke() { strokes.push({ polygons, width: this.lineWidth, color: this.strokeStyle }); },
  };
  return { context, paths, strokes };
}

function svgRegionPolygons(output, pathIndex = 0) {
  const path = [...output.matchAll(/<path fill="#000" fill-rule="nonzero" d="([^"]+)"/g)][pathIndex][1];
  return [...path.matchAll(/M([^MZ]+)Z/g)].map(([_, polygon]) => {
    const values = polygon.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi).map(Number);
    return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
  });
}

test('an empty map is open because both protected ship doorways are traversable', () => {
  const document = createDocument(), before = structuredClone(document);
  const floor = generateFloor(document);
  assert.equal(floor.closed, false);
  assert.match(floor.reason, /ship can reach the exterior/);
  assert.deepEqual(floor.polygons, []);
  assert.deepEqual(document, before);
  assert.throws(() => drawFloor(collectingContext().context, floor), /Open map/);
  assert.throws(() => renderFloorSvg(document), /Open map/);
});

test('closed outer walls enclose the ship and all interiors without changing source geometry', () => {
  const document = createDocument(); square(document);
  const before = structuredClone(document), floor = generateFloor(document);
  assert.equal(floor.closed, true);
  assert.ok(floor.polygons.some(polygon => floorContainsPoint(polygon, { x: 600, y: 600 })));
  assert.ok(floor.shipPolygons.some(polygon => floorContainsPoint(polygon, { x: 4110.5, y: 5570 })));
  assert.equal(floor.outlineWidth, FLOOR_RIM * 2);
  assert.deepEqual(document, before);
  assert.deepEqual(generateFloor(document), floor);
});

test('every outer doorway and subpixel erasure permits travel to space', () => {
  for (const index of [0, 1, 2, 3]) {
    for (const cut of ['door', 'slit']) {
      const document = createDocument(), edges = square(document);
      if (cut === 'door') edges[index].doors.push({ id: 'outer-door', t: 0.5 });
      else edges[index].gaps.push({ id: 'outer-slit', start: 0.50000001, end: 0.50000111 });
      assert.equal(generateFloor(document).closed, false, `Outer ${cut} on wall ${index} cannot be sealed by a raster grid`);
    }
  }
});

test('a disconnected closed courtyard stays transparent until an interior doorway connects it', () => {
  const document = createDocument(); square(document);
  const inner = square(document, { x: 1500, y: 1500, size: 1200, prefix: 'inner' });
  const courtyard = generateFloor(document);
  assert.equal(courtyard.closed, true);
  assert.equal(floorRegionContainsPoint(courtyard.polygons, { x: 2100, y: 2100 }), false);
  assert.equal(floorRegionContainsPoint(courtyard.polygons, { x: 1000, y: 2100 }), true);
  assert.equal(courtyard.polygons.length, 2, 'The disconnected inner outline is a negative hole boundary');
  const painted = collectingContext(); drawFloor(painted.context, courtyard);
  const courtyardPoint = { x: 2100, y: 2100 };
  assert.equal(floorRegionContainsPoint(painted.paths[0], courtyardPoint), false, 'Canvas keeps the negative boundary winding');
  assert.equal(painted.paths[1].some(polygon => floorContainsPoint(polygon, courtyardPoint)), false, 'Wall footprint fills cannot hide the central void');
  assert.equal(floorRegionContainsPoint(svgRegionPolygons(renderFloorSvg(document, { floor: courtyard })), courtyardPoint), false,
    'Serialized SVG uses the same signed hole contours');
  inner[0].doors.push({ id: 'inner-door', t: 0.5 });
  const floor = generateFloor(document);
  assert.equal(floor.closed, true);
  assert.equal(floorRegionContainsPoint(floor.polygons, { x: 2100, y: 2100 }), true);
});

test('a courtyard connected by a wall bridge remains a hole even when the bridge is the first graph edge', () => {
  const document = createDocument(); square(document);
  square(document, { x: 1500, y: 1500, size: 1200, prefix: 'courtyard' });
  addWall(document, { x: 2000, y: 500 }, { x: 2000, y: 1500 }, { joinTolerance: 0 });
  const bridge = document.edges.find(edge => {
    const a = document.vertices.find(vertex => vertex.id === edge.a), b = document.vertices.find(vertex => vertex.id === edge.b);
    return a.x === 2000 && b.x === 2000;
  });
  document.edges = [bridge, ...document.edges.filter(edge => edge !== bridge)];
  for (const reverse of [false, true]) {
    if (reverse) document.edges.forEach(edge => { [edge.a, edge.b] = [edge.b, edge.a]; });
    const floor = generateFloor(document);
    assert.equal(floor.closed, true);
    assert.equal(floorRegionContainsPoint(floor.polygons, { x: 2100, y: 2100 }), false);
    assert.equal(floorRegionContainsPoint(floor.polygons, { x: 1000, y: 2100 }), true);
    assert.equal(floorRegionContainsPoint(floor.polygons, { x: 3000, y: 2100 }), true);
  }
});

test('a tilted courtyard preserves its void and opens through a diagonal internal door', () => {
  for (const reverse of [false, true]) {
    const document = createDocument(); square(document);
    const courtyard = ring(document, [{ x: 3000, y: 1000 }, { x: 4200, y: 2200 },
      { x: 3000, y: 3400 }, { x: 1800, y: 2200 }], 'diamond');
    if (reverse) document.edges.forEach(edge => { [edge.a, edge.b] = [edge.b, edge.a]; });
    const floor = generateFloor(document);
    assert.equal(floor.closed, true);
    assert.equal(floorRegionContainsPoint(floor.polygons, { x: 3000, y: 2200 }), false);
    assert.equal(floorRegionContainsPoint(floor.polygons, { x: 1500, y: 2200 }), true);
    addDoor(document, courtyard[0].id, { x: 3600, y: 1600 }, { centerTolerance: 0 });
    const connected = generateFloor(document);
    assert.equal(connected.closed, true);
    assert.equal(floorRegionContainsPoint(connected.polygons, { x: 3000, y: 2200 }), true);
  }
});

test('nested disconnected cycles choose the innermost reachable face rather than filling surrounding chambers', () => {
  const document = createDocument(); square(document);
  ring(document, [{ x: 1500, y: 3500 }, { x: 6500, y: 3500 },
    { x: 6500, y: 7200 }, { x: 1500, y: 7200 }], 'middle');
  ring(document, [{ x: 2500, y: 4500 }, { x: 5700, y: 4500 },
    { x: 5700, y: 6800 }, { x: 2500, y: 6800 }], 'inner');
  const floor = generateFloor(document);
  assert.equal(floor.closed, true);
  assert.equal(floorRegionContainsPoint(floor.polygons, { x: 4110.5, y: 5570 }), true);
  assert.equal(floorRegionContainsPoint(floor.polygons, { x: 6000, y: 6000 }), false);
  assert.equal(floorRegionContainsPoint(floor.polygons, { x: 1000, y: 2000 }), false);
  assert.equal(floor.polygons.length, 1, 'The exterior negative cycle is not mistaken for a hole of its own bounded face');
});

test('nested courtyard islands stay transparent when the ship is outside both cycles', () => {
  const document = createDocument(); square(document);
  square(document, { x: 1000, y: 1000, size: 2500, prefix: 'courtyard' });
  square(document, { x: 1500, y: 1500, size: 1000, prefix: 'island' });
  const floor = generateFloor(document);
  assert.equal(floor.closed, true);
  assert.equal(floorRegionContainsPoint(floor.polygons, { x: 2000, y: 2000 }), false);
  assert.equal(floorRegionContainsPoint(floor.polygons, { x: 3000, y: 2000 }), false);
  assert.equal(floorRegionContainsPoint(floor.polygons, { x: 4000, y: 2000 }), true);
  assert.equal(floor.polygons.length, 2, 'Only the immediate containing courtyard boundary belongs to the reachable face');
});

test('an unrelated closed room does not classify the exposed ship as enclosed', () => {
  const document = createDocument(); square(document, { x: 500, y: 500, size: 1500 });
  assert.equal(generateFloor(document).closed, false);
});

test('exterior openings remain forbidden in compartments unreachable from the ship', () => {
  for (const type of ['door', 'gap']) {
    const document = createDocument(); square(document);
    addWall(document, { x: 4000, y: 500 }, { x: 4000, y: 7500 }, { joinTolerance: 0 });
    const topLeft = document.edges.find(edge => {
      const a = document.vertices.find(vertex => vertex.id === edge.a), b = document.vertices.find(vertex => vertex.id === edge.b);
      return a.y === 500 && b.y === 500 && Math.max(a.x, b.x) === 4000;
    });
    assert.equal(generateFloor(document).closed, true);
    if (type === 'door') addDoor(document, topLeft.id, { x: 2200, y: 500 }, { centerTolerance: 0 });
    else topLeft.gaps.push({ id: 'unreachable-exterior-slit', start: .5, end: .5000011 });
    const floor = generateFloor(document);
    assert.equal(floor.closed, false, 'An isolated compartment may not hide an opening in the exterior wall');
    assert.match(floor.reason, /exterior wall has (?:a doorway|an erased gap)/);
  }
});

test('a station attached at both pinned ports closes through the fixed hull and its open airlock', () => {
  for (const mirrored of [false, true]) {
    const document = createDocument(); document.ship.mirrored = mirrored;
    const wall = (ax, ay, bx, by) => addWall(document, { x: ax, y: ay }, { x: bx, y: by }, { joinTolerance: 0 });
    wall(3739.5, 4740, 3739.5, 4400); wall(3739.5, 4400, 2000, 4400);
    wall(2000, 4400, 2000, 1000); wall(2000, 1000, 6500, 1000);
    wall(6500, 1000, 6500, 4400); wall(6500, 4400, 4452.5, 4400); wall(4452.5, 4400, 4452.5, 4740);
    wall(4300, 1000, 4300, 4400);
    const internal = document.edges.find(edge => {
      const a = document.vertices.find(vertex => vertex.id === edge.a), b = document.vertices.find(vertex => vertex.id === edge.b);
      return a.x === 4300 && b.x === 4300;
    });
    addDoor(document, internal.id, { x: 4300, y: 2700 }, { centerTolerance: 0 });
    const floor = generateFloor(document);
    assert.equal(floor.closed, true, 'The protected ship openings join the station instead of opening to space');
    for (const point of [{ x: 3000, y: 2000 }, { x: 5500, y: 3000 }, { x: 4110.5, y: 5308 }]) {
      assert.ok(floor.polygons.some(polygon => floorContainsPoint(polygon, point)), 'Both sides of an internal door receive floor');
    }
    const graph = structuredClone({ vertices: document.vertices, edges: document.edges });
    document.ship.mirrored = !mirrored;
    const flipped = generateFloor(document);
    assert.equal(flipped.closed, true, 'Facing changes preserve closure at both original graph pins');
    assert.ok(floorRegionContainsPoint(flipped.polygons, { x: 4110.5, y: 4700 }), 'The same outer door center remains reachable after the flip');
    assert.deepEqual({ vertices: document.vertices, edges: document.edges }, graph);
    document.ship.mirrored = mirrored;
    assert.deepEqual(generateFloor(document), floor, 'Toggling back restores the original pinned-station floor');
    const top = document.edges.find(edge => {
      const a = document.vertices.find(vertex => vertex.id === edge.a), b = document.vertices.find(vertex => vertex.id === edge.b);
      return a.y === 1000 && b.y === 1000 && Math.min(a.x, b.x) <= 3000 && Math.max(a.x, b.x) >= 3000;
    });
    addDoor(document, top.id, { x: 3000, y: 1000 }, { centerTolerance: 0 });
    assert.equal(generateFloor(document).closed, false, 'Walking through the internal and outer door reaches space');
  }
});

test('mirroring and centered expansion preserve closure, geometry scale and transparent SVG origin', () => {
  const document = createDocument(); square(document);
  for (const mirrored of [false, true]) {
    document.ship.mirrored = mirrored;
    const initial = generateFloor(document);
    assert.equal(initial.closed, true);
    Object.assign(document, { width: 16384, height: 16384, originX: -4096, originY: -4096 });
    const expanded = generateFloor(document);
    assert.deepEqual(expanded.polygons, initial.polygons);
    assert.deepEqual(expanded.wallPolygons, initial.wallPolygons);
    assert.deepEqual(expanded.shipPolygons, initial.shipPolygons);
    document.name = '<script>"floor" & bad</script>';
    const output = renderFloorSvg(document, { floor: expanded });
    assert.ok(output.includes('width="16384" height="16384" viewBox="-4096 -4096 16384 16384"'));
    assert.ok(output.includes('fill="#000"'));
    assert.ok(output.includes(`stroke-width="${FLOOR_RIM * 2}"`));
    assert.ok(output.includes('&lt;script&gt;&quot;floor&quot; &amp; bad&lt;/script&gt;'));
    assert.ok(!output.includes('<image') && !output.includes('<rect') && !output.includes('<script>'));
    assert.equal(renderFloorSvg(document, { floor: expanded }), output);
    Object.assign(document, { width: 8192, height: 8192, originX: 0, originY: 0 });
  }
});

test('floor ship coverage reflects around the same fixed doorway center as Canvas and SVG artwork', () => {
  const document = createDocument(); square(document);
  const before = structuredClone(document), normal = generateFloor(document);
  assert.equal(normal.closed, true);
  document.ship.mirrored = true;
  const mirrored = generateFloor(document);
  assert.equal(mirrored.closed, true);
  assert.equal(mirrored.shipPolygons.length, normal.shipPolygons.length);
  for (let index = 0; index < normal.shipPolygons.length; index++) {
    assert.deepEqual(mirrored.shipPolygons[index], normal.shipPolygons[index].map(point => ({ x: 8221 - point.x, y: point.y })),
      'Every floor outline point follows reflection about the measured outer door x4110.5');
  }
  for (const floor of [normal, mirrored]) {
    assert.ok(floor.shipPolygons.some(polygon => floorContainsPoint(polygon, { x: 4110.5, y: 5308 })));
    assert.ok(floorRegionContainsPoint(floor.polygons, { x: 4110.5, y: 4700 }));
  }
  assert.deepEqual(mirrored.wallPolygons, normal.wallPolygons, 'Derived floor uses the unchanged user walls');
  const rendered = renderFloorSvg(document, { floor: mirrored });
  const exportedShip = svgRegionPolygons(rendered, 1).slice(-mirrored.shipPolygons.length);
  for (let index = 0; index < mirrored.shipPolygons.length; index++) {
    const polygon = mirrored.shipPolygons[index], actual = exportedShip[index];
    const pointsEqual = (a, b) => a.x === b.x && a.y === b.y;
    assert.equal(actual.length, polygon.length);
    assert.ok(actual.every((point, i) => pointsEqual(point, polygon[i])) ||
      actual.every((point, i) => pointsEqual(point, polygon[polygon.length - 1 - i])),
    'Floor SVG retains each reflected point; fill winding may reverse its traversal');
  }
  document.ship.mirrored = false;
  assert.deepEqual(generateFloor(document), normal, 'Toggling back restores exact floor and reachability');
  assert.deepEqual(document, before);
});

test('floor rim follows the same textured wall polygons and contains no white or star background', () => {
  const document = createDocument(); square(document);
  const floor = generateFloor(document), expected = collectingContext();
  drawMap(expected.context, document, { drawShip: false });
  assert.deepEqual(floor.wallPolygons, expected.paths[0]);
  const painted = collectingContext(); drawFloor(painted.context, floor);
  assert.equal(painted.context.fillStyle, '#000000');
  assert.equal(painted.context.globalAlpha, 1);
  assert.equal(painted.paths.length, 2);
  assert.equal(painted.strokes.length, 1);
  assert.equal(painted.strokes[0].width, 24);
  assert.equal(painted.strokes[0].color, '#000000');
});

test('floor exports reject stale dimensions and malformed derived data', () => {
  const document = createDocument(); square(document);
  const floor = generateFloor(document);
  assert.throws(() => drawFloor(collectingContext().context, { ...floor, outlineWidth: Infinity }), /Invalid generated floor/);
  assert.throws(() => drawFloor(collectingContext().context, { ...floor, polygons: [[{ x: 1, y: NaN }]] }), /Invalid generated floor/);
  Object.assign(document, { width: 16384, height: 16384, originX: -4096, originY: -4096 });
  assert.throws(() => renderFloorSvg(document, { floor }), /no longer matches/);
});
