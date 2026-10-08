import test from 'node:test';
import assert from 'node:assert/strict';
import { drawMap, segmentVisibleParts, shipBounds, SHIP_ANCHOR, SHIP_BOUNDS } from '../src/render.js';

test('physical door clearance is 375 map pixels on horizontal and diagonal edges', () => {
  for (const b of [{ x: 1000, y: 0 }, { x: 1000, y: 1000 }]) {
    const parts = segmentVisibleParts({ x: 0, y: 0 }, b, [{ id: 'door', t: 0.5 }], 375);
    assert.equal(parts.length, 2);
    assert.ok(Math.abs(Math.hypot(parts[1].a.x - parts[0].b.x, parts[1].a.y - parts[0].b.y) - 375) < 1e-9);
  }
});

test('overlapping door intervals merge and out-of-range cuts do not paint negative intervals', () => {
  const parts = segmentVisibleParts({ x: 0, y: 0 }, { x: 1000, y: 0 }, [{ t: 0.45 }, { t: 0.55 }], 375);
  assert.deepEqual(parts.map(({ start, end }) => [start, end]), [[0, 0.2625], [0.7375, 1]]);
  assert.deepEqual(segmentVisibleParts({ x: 0, y: 0 }, { x: 0, y: 0 }), []);
});

test('arbitrary erasure and partial door fills render only their remaining intervals', () => {
  const a = { x: 0, y: 0 }, b = { x: 1000, y: 0 };
  const parts = segmentVisibleParts(a, b, [{ t: 0.5 }], 375, [{ start: 0.1, end: 0.2 }]);
  assert.deepEqual(parts.map(({ start, end }) => [start, end]), [[0, 0.1], [0.2, 0.3125], [0.6875, 1]]);
  const partial = segmentVisibleParts(a, b, [], 375, [{ start: 0.5, end: 0.6875 }]);
  assert.equal(partial[0].b.x, 500);
  assert.equal(partial[1].a.x, 687.5);
  assert.deepEqual(segmentVisibleParts(a, b, [], 375, [{ start: 0, end: 1 }]), []);
});

function recordingContext() {
  const calls = [];
  const context = { calls };
  for (const name of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'fill', 'translate', 'scale', 'drawImage']) {
    context[name] = (...args) => calls.push([name, ...args]);
  }
  return context;
}

test('sharp miter joins close solid corners without regrowing an erased corner', () => {
  const document = {
    style: { roughness: 0 },
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1000, y: 0 }, { id: 'c', x: 1000, y: 1000 }],
    edges: [{ id: 'one', a: 'a', b: 'b', doors: [], gaps: [{ start: 0.9, end: 1 }] },
      { id: 'two', a: 'b', b: 'c', doors: [], gaps: [{ start: 0, end: 0.1 }] }],
  };
  const erased = recordingContext();
  drawMap(erased, document);
  assert.equal(erased.calls.filter(([name]) => name === 'arc').length, 0);
  assert.equal(erased.calls.filter(([name]) => name === 'closePath').length, 2);
  document.edges.forEach(edge => { edge.gaps = []; });
  const restored = recordingContext();
  drawMap(restored, document);
  assert.equal(restored.calls.filter(([name]) => name === 'closePath').length, 3);
  assert.ok(restored.calls.some(([name, x, y]) => name === 'lineTo' && x === 1025 && y === -25), 'The external corner has a square miter');
  assert.equal(restored.calls.filter(([name]) => name === 'fill').length, 1, 'Join and walls share one fill so no translucent internal seam is composited');
});

test('wall texture remains deterministic across redraws and document round trips', () => {
  const document = {
    vertices: [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 1500, y: 100 }],
    edges: [{ id: 'edge', a: 'a', b: 'b', doors: [{ id: 'door', t: 0.5 }] }],
    style: { wallWidth: 50, doorWidth: 375, roughness: 3 }, textureSeed: 123,
  };
  const first = recordingContext();
  const second = recordingContext();
  drawMap(first, document);
  drawMap(second, JSON.parse(JSON.stringify(document)));
  assert.deepEqual(first.calls, second.calls);
  assert.equal(first.fillStyle, '#ffffff');
  assert.equal(first.globalAlpha, 1);
  assert.equal(first.calls.filter(([name]) => name === 'arc').length, 0, 'Free wall ends are butt-ended');
});

test('ship mirrors around the outer doorway center and reports the corresponding asymmetric bounds', () => {
  const document = { vertices: [], edges: [], ship: { x: 4096, y: 4740, mirrored: true } };
  const context = recordingContext();
  const image = {};
  drawMap(context, document, { shipImage: image });
  assert.ok(context.calls.some((call) => JSON.stringify(call) === JSON.stringify(['translate', 4125, 4740])));
  assert.ok(context.calls.some((call) => JSON.stringify(call) === JSON.stringify(['scale', -1, 1])));
  assert.deepEqual(context.calls.find(([name]) => name === 'drawImage'), ['drawImage', image, -1269, -70, 2459, 1931]);
  const bounds = shipBounds(document.ship);
  assert.equal(bounds.left, document.ship.x + 29 - (SHIP_BOUNDS.width - SHIP_ANCHOR.x));
  assert.equal(bounds.right - bounds.left, SHIP_BOUNDS.width);
  assert.equal(bounds.top, 4670);
  assert.equal(bounds.bottom, 6601);
});

test('Canvas reflects both raster door centers around one fixed world point without moving drawn walls', () => {
  const document = { vertices: [{ id: 'a', x: 3820.5, y: 4700 }, { id: 'b', x: 3820.5, y: 3200 }],
    edges: [{ id: 'rail', a: 'a', b: 'b', doors: [], gaps: [] }], ship: { x: 4096, y: 4740, mirrored: false } };
  const image = {}, first = recordingContext();
  drawMap(first, document, { shipImage: image });
  const graph = structuredClone({ vertices: document.vertices, edges: document.edges });
  for (const mirrored of [true, false]) {
    document.ship.mirrored = mirrored;
    const context = recordingContext(); drawMap(context, document, { shipImage: image });
    const [, translateX, translateY] = context.calls.find(([name]) => name === 'translate');
    const scaleX = context.calls.find(([name]) => name === 'scale')?.[1] ?? 1;
    const [, , left, top, width, height] = context.calls.find(([name]) => name === 'drawImage');
    for (const localY of [30, 638]) {
      assert.equal(translateX + scaleX * (left + 1283.5), 4110.5, 'Outer and inner raster cuts share the unchanged corridor center');
      assert.equal(translateY + top + localY, localY === 30 ? 4700 : 5308);
    }
    const bounds = shipBounds(document.ship);
    assert.equal(bounds.left, Math.min(translateX + scaleX * left, translateX + scaleX * (left + width)));
    assert.equal(bounds.right, Math.max(translateX + scaleX * left, translateX + scaleX * (left + width)));
    assert.equal(bounds.bottom - bounds.top, height);
    assert.deepEqual(context.calls.filter(([name]) => ['moveTo', 'lineTo', 'closePath'].includes(name)),
      first.calls.filter(([name]) => ['moveTo', 'lineTo', 'closePath'].includes(name)), 'Only the prefab changes facing');
    assert.deepEqual({ vertices: document.vertices, edges: document.edges }, graph);
  }
});


function wallDocument(points, reversed = false) {
  return {
    vertices: points.map((point, index) => ({ id: `v${index}`, ...point })),
    edges: points.slice(1).map((_, index) => ({ id: `e${index}`, a: `v${reversed ? index + 1 : index}`, b: `v${reversed ? index : index + 1}`, doors: [], gaps: [] })),
    textureSeed: 4252,
  };
}

test('arbitrary collinear subdivisions and reverse drawing produce the identical wall outline', () => {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const point = distance => ({ x: -730.25 + distance * dx, y: 215.125 + distance * dy });
    const full = recordingContext();
    drawMap(full, wallDocument([point(0), point(1823.75)]));
    for (const reversed of [false, true]) {
      const split = recordingContext();
      const document = wallDocument([0, 63.5, 371, 705.25, 901.625, 1603, 1823.75].map(point), reversed);
      document.edges.reverse().forEach((edge, index) => { edge.id = `unrelated-${index}`; });
      drawMap(split, document);
      assert.deepEqual(split.calls, full.calls, `The ${dx},${dy} wall must not acquire seams, steps or texture changes`);
    }
  }
});

test('a repeated overlapping extension is painted as one continuous silhouette', () => {
  const points = [{ x: 37.125, y: 300.5 }, { x: 490, y: 300.5 }, { x: 201.75, y: 300.5 }, { x: 989, y: 300.5 }];
  const overlap = wallDocument(points);
  overlap.edges = [{ id: 'a', a: 'v0', b: 'v1' }, { id: 'b', a: 'v3', b: 'v2' }];
  const expected = recordingContext(), actual = recordingContext();
  drawMap(expected, wallDocument([points[0], points[3]]));
  drawMap(actual, overlap);
  assert.deepEqual(actual.calls, expected.calls);
});

test('visible run merging keeps genuine doors and arbitrarily small erased gaps open', () => {
  const document = wallDocument([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2200, y: 0 }]);
  document.edges[0].doors = [{ t: 0.5 }];
  document.edges[1].gaps = [{ start: 0.5, end: 0.5001 }];
  const context = recordingContext();
  drawMap(context, document);
  assert.equal(context.calls.filter(([name]) => name === 'closePath').length, 3);
  const xs = context.calls.filter(([name]) => name === 'moveTo' || name === 'lineTo').map(([, x]) => x);
  assert.ok(xs.includes(312.5) && xs.includes(687.5), 'Door ends retain exactly 375 units of clearance');
  assert.ok(xs.some(x => Math.abs(x - 1600.12) < 1e-8) && xs.includes(1600), 'The 0.12-unit gap is retained');
  assert.ok(!xs.some(x => x > 312.5 && x < 687.5));
  assert.ok(!xs.some(x => x > 1600 && x < 1600.12 - 1e-8));
});

test('all supported corner angles use bounded sharp joins and opaque continuous fills', () => {
  for (const angle of [45, 90, 135, 225, 270, 315]) {
    const radians = angle * Math.PI / 180;
    const document = wallDocument([{ x: 400, y: 0 }, { x: 0, y: 0 }, { x: Math.cos(radians) * 400, y: Math.sin(radians) * 400 }]);
    document.style = { roughness: 0 };
    const context = recordingContext();
    drawMap(context, document);
    assert.equal(context.calls.filter(([name]) => name === 'arc').length, 0);
    assert.equal(context.calls.filter(([name]) => name === 'fill').length, 1);
    const lastStart = context.calls.findLastIndex(([name]) => name === 'moveTo');
    const joinPoints = context.calls.slice(lastStart).filter(([name]) => name === 'moveTo' || name === 'lineTo');
    assert.equal(joinPoints.length, 6);
    assert.ok(joinPoints.every(([, x, y]) => Math.hypot(x, y) <= 75 + 1e-7), 'Acute corners cannot produce arbitrarily long spikes');
  }
});


test('tiny graph subdivisions beside a corner do not disable its solid miter', () => {
  const points = [{ x: 0, y: 0 }, { x: 990.125, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 3.625 }, { x: 1000, y: 1000 }];
  const whole = recordingContext(), split = recordingContext();
  drawMap(whole, wallDocument([points[0], points[2], points[4]]));
  drawMap(split, wallDocument(points));
  assert.deepEqual(split.calls, whole.calls);
});

test('45-degree corner texture is unchanged by tiny diagonal subdivisions and reverse drawing', () => {
  const corners = [
    [{ x: 2400, y: 2400 }, { x: 2800, y: 2400 }, { x: 3200, y: 2800 }],
    [{ x: 2400, y: 2000 }, { x: 2800, y: 2400 }, { x: 2800, y: 2800 }],
  ];
  for (const [a, joint, b] of corners) {
    const beforeJoint = { x: joint.x + (a.x - joint.x) / 80, y: joint.y + (a.y - joint.y) / 80 };
    const afterJoint = { x: joint.x + (b.x - joint.x) / 80, y: joint.y + (b.y - joint.y) / 80 };
    const whole = recordingContext();
    drawMap(whole, wallDocument([a, joint, b]));
    for (const reversed of [false, true]) {
      const split = recordingContext();
      drawMap(split, wallDocument([a, beforeJoint, joint, afterJoint, b], reversed));
      assert.deepEqual(split.calls, whole.calls, 'Short graph pieces cannot change a solid 45-degree corner');
    }
  }
});

test('diagonal corner miters never heal an actual small erasure at an incident cap', () => {
  const corners = [
    [{ x: 2400, y: 2400 }, { x: 2800, y: 2400 }, { x: 3200, y: 2800 }],
    [{ x: 2400, y: 2000 }, { x: 2800, y: 2400 }, { x: 2800, y: 2800 }],
  ];
  for (const points of corners) {
    const document = wallDocument(points);
    document.edges[0].gaps = [{ start: 1 - 1.843 / Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y), end: 1 }];
    const erased = recordingContext();
    drawMap(erased, document);
    assert.equal(erased.calls.filter(([name]) => name === 'closePath').length, 2, 'Only genuine wall pieces are filled; no corner cover is added');
    const expectedEnd = segmentVisibleParts(points[0], points[1], [], 375, document.edges[0].gaps)[0].b;
    assert.ok(Math.abs(Math.hypot(points[1].x - expectedEnd.x, points[1].y - expectedEnd.y) - 1.843) < 1e-9);
    document.edges[0].gaps = [];
    const solid = recordingContext();
    drawMap(solid, document);
    assert.equal(solid.calls.filter(([name]) => name === 'closePath').length, 3, 'Restoring actual solid geometry permits the miter again');
  }
});
