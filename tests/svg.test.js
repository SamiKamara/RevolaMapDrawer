import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDocument } from '../src/model.js';
import { drawMap } from '../src/render.js';
import { renderMapSvg } from '../src/svg.js';

const shipBytes = readFileSync(new URL('../assets/ship.png', import.meta.url));
const shipDataUrl = `data:image/png;base64,${shipBytes.toString('base64')}`;
const svg = document => renderMapSvg(document, { shipDataUrl });

function documentWithWalls(points, { roughness = 0, reverse = false } = {}) {
  const document = createDocument();
  document.style.roughness = roughness;
  document.vertices = points.map((point, index) => ({ id: `v${index}`, ...point }));
  document.edges = points.slice(1).map((_, index) => ({ id: `e${index}`,
    a: `v${reverse ? index + 1 : index}`, b: `v${reverse ? index : index + 1}`, doors: [], gaps: [] }));
  return document;
}

function pathData(output) { return /<path[^>]* d="([^"]*)"/.exec(output)?.[1] ?? ''; }

/** Decode the export's compact implicit lines, H/V commands, and closed subpaths. */
function polygonsFromSvg(output) {
  const tokens = pathData(output).match(/[MLHVZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) ?? [];
  const polygons = [];
  let command, points, x = 0, y = 0, index = 0;
  while (index < tokens.length) {
    if (/^[MLHVZ]$/.test(tokens[index])) command = tokens[index++];
    if (command === 'Z') { polygons.push(points); points = undefined; command = undefined; continue; }
    if (command === 'M' || command === 'L') {
      x = Number(tokens[index++]); y = Number(tokens[index++]);
      if (command === 'M') { points = []; command = 'L'; }
    } else if (command === 'H') x = Number(tokens[index++]);
    else if (command === 'V') y = Number(tokens[index++]);
    else throw new Error(`Unexpected SVG command ${command}`);
    points.push({ x, y });
  }
  return polygons;
}

function originalPolygons(document) {
  const polygons = [];
  let points;
  drawMap({ save() {}, restore() {}, beginPath() {}, fill() {},
    moveTo(x, y) { points = [{ x, y }]; }, lineTo(x, y) { points.push({ x, y }); },
    closePath() { polygons.push(points); } }, document, { drawShip: false });
  return polygons;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function distanceToPolygon(point, polygon) {
  return Math.min(...polygon.map((a, index) => distanceToSegment(point, a, polygon[(index + 1) % polygon.length])));
}
function area(polygon) {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
}

test('zero-roughness SVG walls retain four corners regardless of length or graph subdivision', () => {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    // Use one allowed ray, with enough space inside the initial canvas.
    const start = { x: 1000, y: dy < 0 ? 7000 : 1000 };
    const point = length => ({ x: start.x + length * dx, y: start.y + length * dy });
    for (const length of [27, 250, 6000]) {
      const whole = documentWithWalls([point(0), point(length)]);
      const baseline = pathData(svg(whole));
      assert.equal(polygonsFromSvg(svg(whole))[0].length, 4);
      assert.ok(baseline.length < 170, 'Long plain walls do not serialize an 18-pixel sampling lattice');
      const split = documentWithWalls([0, length / 7, length / 2, length * 0.8, length].map(point), { reverse: true });
      split.edges.reverse();
      assert.equal(pathData(svg(split)), baseline, 'IDs, orientation and incidental splits do not add vector points');
    }
  }
});

test('SVG preserves real 375-pixel doors and sub-millipixel erased gaps at full cap precision', () => {
  const document = documentWithWalls([{ x: 1000, y: 1000 }, { x: 2200, y: 1000 }]);
  document.edges[0].doors.push({ id: 'door', t: 0.5 });
  document.edges[0].gaps.push({ id: 'gap', start: 0.80000013, end: 0.80000123 });
  const polygons = polygonsFromSvg(svg(document));
  assert.equal(polygons.length, 3);
  const ranges = polygons.map(points => [Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x))]);
  assert.equal(ranges[1][0] - ranges[0][1], 375);
  assert.ok(Math.abs(ranges[2][0] - ranges[1][1] - 0.00132) < 1e-10);
  assert.ok(ranges[2][0] > ranges[1][1]);
  assert.ok(pathData(svg(document)).includes('1960.000156'));
});

test('rough diagonal SVG cuts remain open below the interior coordinate-rounding resolution', () => {
  for (const dy of [-1, 1]) {
    const start = { x: 1100.123, y: 2800.321 };
    const document = documentWithWalls([start, { x: start.x + 250, y: start.y + dy * 250 }], { roughness: 6.25 });
    document.edges[0].gaps.push({ id: 'fine-gap', start: 0.55000001, end: 0.55000111 });
    const original = originalPolygons(document), exported = polygonsFromSvg(svg(document));
    const along = point => (point.x + point.y * dy) * Math.SQRT1_2;
    const boundaryBefore = Math.max(...original[0].map(along));
    const boundaryAfter = Math.min(...original[1].map(along));
    assert.equal(exported.length, 2);
    const before = Math.max(...exported[0].map(along)), after = Math.min(...exported[1].map(along));
    assert.ok(Math.abs(before - boundaryBefore) < 1e-10);
    assert.ok(Math.abs(after - boundaryAfter) < 1e-10);
    assert.ok(after > before && after - before < 0.0005,
      'Each outline remains behind its true cap plane despite a gap below 0.0005 map pixels');
  }
});

test('SVG retains diagonal doorway length, sharp joined corners and erased corner suppression', () => {
  const document = documentWithWalls([{ x: 1000, y: 1000 }, { x: 2200, y: 2200 }, { x: 3400, y: 2200 }]);
  document.edges[0].doors.push({ id: 'door', t: 0.5 });
  const original = originalPolygons(document), exported = polygonsFromSvg(svg(document));
  assert.equal(exported.length, 4, 'Two door-separated runs, one horizontal run, and the shared miter');
  assert.deepEqual(exported.at(-1), original.at(-1), 'Every sharp miter point stays exact');
  const along = point => (point.x + point.y) * Math.SQRT1_2;
  const firstEnd = Math.max(...exported[1].map(along)), secondStart = Math.min(...exported[2].map(along));
  assert.ok(Math.abs(secondStart - firstEnd - 375) < 1e-9);
  const before = svg(document);
  assert.equal((before.match(/<path /g) ?? []).length, 1);
  assert.ok(before.includes('fill-rule="nonzero"'));
  assert.ok(!before.includes('<rect') && !before.includes('stroke='));
  document.edges[0].gaps.push({ id: 'corner-gap', start: 0.999998, end: 1 });
  assert.equal(polygonsFromSvg(svg(document)).length, 3, 'A real cut at a corner does not receive a joint cover');
});

test('rough wall simplification plus serialized rounding stays under 0.25 px in both directions', () => {
  let totalOriginal = 0, totalExported = 0;
  for (const roughness of [0.1, 2.25, 6.25]) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const document = documentWithWalls([{ x: 731.125, y: 3600.375 },
        { x: 731.125 + dx * 3500.25, y: 3600.375 + dy * 3500.25 }], { roughness });
      const original = originalPolygons(document)[0], exported = polygonsFromSvg(svg(document))[0];
      totalOriginal += original.length; totalExported += exported.length;
      assert.ok(area(original) * area(exported) > 0, 'The original nonzero union winding is retained');
      const half = original.length / 2;
      for (const index of [0, half - 1, half, original.length - 1]) {
        assert.ok(exported.some(point => point.x === original[index].x && point.y === original[index].y), 'Real caps remain exact');
      }
      // Original vertices bound the original piecewise-linear silhouette. Dense
      // samples in both directions also exercise replacement chords and rounding.
      for (const [source, target] of [[original, exported], [exported, original]]) {
        for (let index = 0; index < source.length; index++) {
          const a = source[index], b = source[(index + 1) % source.length];
          for (let fraction = 0; fraction < 1; fraction += 0.125) {
            const point = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
            assert.ok(distanceToPolygon(point, target) < 0.25, `Silhouette deviation is bounded at roughness ${roughness}`);
          }
        }
      }
    }
  }
  assert.ok(totalExported < totalOriginal * 0.65, 'Flat and smooth texture portions shed unnecessary vectors');
});

test('rough SVG outlines are unchanged by reversed collinear graph subdivisions', () => {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const point = length => ({ x: 900.125 + length * dx, y: 3600.125 + length * dy });
    const whole = documentWithWalls([point(0), point(2000.25)], { roughness: 2.25 });
    const split = documentWithWalls([0, 0.625, 46.375, 1327, 2000.25].map(point), { roughness: 2.25, reverse: true });
    split.edges.reverse();
    assert.equal(svg(split), svg(whole), 'The entire self-contained output remains independent of graph sampling');
  }
});

test('SVG embeds the unchanged ship once, retains native scale, and mirrors about the outer doorway center', () => {
  const document = createDocument();
  for (const mirrored of [false, true]) {
    document.ship.mirrored = mirrored;
    const output = svg(document);
    assert.equal((output.match(/<image /g) ?? []).length, 1);
    assert.equal((output.match(/data:image\/png;base64,/g) ?? []).length, 1);
    assert.ok(output.includes('x="-1269" y="-70" width="2459" height="1931"'));
    assert.ok(output.includes(`transform="translate(${mirrored ? 4125 : 4096} 4740)${mirrored ? ' scale(-1 1)' : ''}"`));
    const encoded = /href="data:image\/png;base64,([^"]+)"/.exec(output)[1];
    assert.deepEqual(Buffer.from(encoded, 'base64'), shipBytes);
    assert.ok(output.length < shipDataUrl.length + 400, 'Empty map overhead does not trace thousands of raster outline points');
    assert.ok(!output.includes('<path '));
  }
});

test('SVG keeps both door centers and the corridor path aligned when ship facing changes', () => {
  const document = documentWithWalls([{ x: 3820.5, y: 4700 }, { x: 3820.5, y: 3200 }]);
  const graph = structuredClone({ vertices: document.vertices, edges: document.edges });
  const wallPath = pathData(svg(document));
  for (const mirrored of [true, false]) {
    document.ship.mirrored = mirrored;
    const output = svg(document), image = /<image\s[^>]+>/.exec(output)[0];
    const [, translateX, translateY, scale] = /transform="translate\(([-\d.]+) ([-\d.]+)\)( scale\(-1 1\))?"/.exec(image);
    const left = Number(/\sx="([-\d.]+)"/.exec(image)[1]), top = Number(/\sy="([-\d.]+)"/.exec(image)[1]);
    for (const localY of [30, 638]) {
      assert.equal(Number(translateX) + (scale ? -1 : 1) * (left + 1283.5), 4110.5);
      assert.equal(Number(translateY) + top + localY, localY === 30 ? 4700 : 5308);
    }
    assert.equal(pathData(output), wallPath, 'SVG facing changes preserve the entire corridor wall path');
    assert.deepEqual({ vertices: document.vertices, edges: document.edges }, graph);
  }
});

test('expanded SVG preserves world origin, title safety, determinism and the exact input document', () => {
  const document = documentWithWalls([{ x: 1000.125, y: 1000.125 }, { x: 2500.875, y: 2500.875 }], { roughness: 2.25 });
  const originalPath = pathData(svg(document));
  Object.assign(document, { width: 16384, height: 16384, originX: -4096, originY: -4096,
    name: '<script>"Map" & \'name\'</script>\u0001' });
  const snapshot = structuredClone(document), output = svg(document);
  assert.ok(output.includes('width="16384" height="16384" viewBox="-4096 -4096 16384 16384"'));
  assert.ok(output.includes('<title>&lt;script&gt;&quot;Map&quot; &amp; &apos;name&apos;&lt;/script&gt;\ufffd</title>'));
  assert.ok(!output.includes('<script>') && !output.includes('revola-map') && !output.includes('<metadata'));
  assert.equal(svg(document), output);
  assert.equal(svg(JSON.parse(JSON.stringify(document))), output);
  assert.deepEqual(document, snapshot);
  assert.equal(pathData(output), originalPath,
    'The viewBox moves the canvas window without translating or scaling world geometry');
});

test('SVG rejects invalid documents and unsafe or missing asset URLs', () => {
  assert.throws(() => svg({}), /Unsupported Revola project/);
  const document = createDocument();
  for (const value of [undefined, 'file:///assets/ship.png', 'https://example.test/ship.png',
    'data:image/svg+xml;base64,PHN2Zz4=', `${shipDataUrl}" onload="alert(1)`,
    `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}`]) {
    assert.throws(() => renderMapSvg(document, { shipDataUrl: value }), /bundled ship PNG/);
  }
  const invalid = documentWithWalls([{ x: 1000, y: 1000 }, { x: 2300, y: 1700 }]);
  assert.throws(() => svg(invalid), /45° direction/);
});
