import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCorridorStart, fitCorridorEnd, corridorPreservesOpenings } from '../src/corridors.js';
import { createDocument, addWall, addDoor, addCorridor, corridorSegments, validateDocument } from '../src/model.js';

const make = (points, links) => ({
  style: { doorWidth: 375, wallWidth: 50, roughness: 2.25 },
  ship: { x: 4096, y: 4740 },
  vertices: points.map(([x, y], index) => ({ id: `v${index}`, x, y })),
  edges: links.map(([a, b], index) => ({ id: `e${index}`, a: `v${a}`, b: `v${b}`, doors: [], gaps: [] })),
});
const horizontal = () => make([[100, 100], [2100, 100]], [[0, 1]]);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test('corridor start gently attracts to a midpoint without mutating or grid rounding', () => {
  const doc = make([[100.5, 123.25], [2100, 123.25]], [[0, 1]]), before = structuredClone(doc);
  const target = resolveCorridorStart(doc, { x: 1137, y: 171.5 });
  assert.equal(target.kind, 'center');
  assert.deepEqual(target.point, { x: 1100.25, y: 123.25 });
  assert.deepEqual(target.projectedPoint, { x: 1137, y: 123.25 });
  assert.equal(target.edgeId, 'e0');
  assert.equal(target.distance, 48.25);
  assert.equal(resolveCorridorStart(doc, { x: 1151, y: 123.25 }), null);
  assert.equal(resolveCorridorStart(doc, { x: 1100.25, y: 199 }), null);
  assert.deepEqual(doc, before);
});

test('midpoint tolerance follows the same 5 percent short-span limit as doors', () => {
  const doc = make([[100, 100], [600, 100]], [[0, 1]]);
  assert.deepEqual(resolveCorridorStart(doc, { x: 375, y: 100 }).point, { x: 350, y: 100 });
  assert.equal(resolveCorridorStart(doc, { x: 375.01, y: 100 }), null);
  assert.equal(resolveCorridorStart(doc, { x: 350, y: 100 }, { centerTolerance: 0 }), null);
  assert.deepEqual(resolveCorridorStart(horizontal(), { x: 1130, y: 190 }, { wallTolerance: 100 }).point, { x: 1100, y: 100 });
  assert.equal(resolveCorridorStart(horizontal(), { x: 1130, y: 190 }, { wallTolerance: 50 }), null);
});

test('vertical and reversed diagonal starts resolve to their exact centerline midpoint', () => {
  const vertical = make([[125.5, 2100], [125.5, 100]], [[0, 1]]);
  assert.deepEqual(resolveCorridorStart(vertical, { x: 160, y: 1125 }).point, { x: 125.5, y: 1100 });
  const diagonal = make([[1200.5, 800.25], [200.5, 1800.25]], [[0, 1]]);
  const target = resolveCorridorStart(diagonal, { x: 740.5, y: 1290.25 });
  assert.deepEqual(target.point, { x: 700.5, y: 1300.25 });
  near(target.distance, 30 / Math.SQRT2);
  near(target.spanLength, 1000 * Math.SQRT2);
  assert.equal(resolveCorridorStart(diagonal, { x: 740.5, y: 1260.25 }), null);
});

test('incidental collinear splits measure the full span and report the actual target host', () => {
  const doc = make([[100, 100], [1080, 100], [1300, 100], [2100, 100]], [[1, 0], [2, 1], [2, 3]]);
  const target = resolveCorridorStart(doc, { x: 1060, y: 130 });
  assert.deepEqual(target.point, { x: 1100, y: 100 });
  assert.equal(target.edgeId, 'e1');
  assert.equal(target.spanLength, 2000);
});

test('corners, branches and fixed ship ports terminate corridor midpoint spans', () => {
  const branch = make([[100, 100], [100, 1100], [100, 2100], [1100, 1100], [1100, 2100]], [[0, 1], [1, 2], [1, 3], [2, 4]]);
  const target = resolveCorridorStart(branch, { x: 120, y: 1630 });
  assert.deepEqual(target.point, { x: 100, y: 1600 });
  assert.equal(target.spanLength, 1000);
  const pinned = make([[3739.5, 3740], [3739.5, 4740], [3739.5, 5740]], [[0, 1], [1, 2]]);
  assert.deepEqual(resolveCorridorStart(pinned, { x: 3750, y: 4280 }).point, { x: 3739.5, y: 4240 });
});

test('the full door opening plus its small margin attracts to the exact existing center', () => {
  const doc = horizontal(), doorCenter = 740.5;
  doc.edges[0].doors.push({ id: 'existing', t: (doorCenter - 100) / 2000 });
  const before = structuredClone(doc);
  for (const x of [doorCenter - 237.5, doorCenter - 185, doorCenter, doorCenter + 185, doorCenter + 237.5]) {
    const target = resolveCorridorStart(doc, { x, y: 160 });
    assert.equal(target.kind, 'door');
    assert.equal(target.doorId, 'existing');
    assert.deepEqual(target.point, { x: doorCenter, y: 100 });
  }
  assert.equal(resolveCorridorStart(doc, { x: doorCenter + 237.51, y: 100 }), null);
  assert.equal(resolveCorridorStart(doc, { x: doorCenter + 200, y: 100 }, { doorMargin: 0 }), null);
  assert.deepEqual(doc, before);
});

test('door targeting takes precedence when its margin also includes the wall midpoint', () => {
  const doc = horizontal();
  doc.edges[0].doors.push({ id: 'offset-door', t: 0.4 });
  const target = resolveCorridorStart(doc, { x: 1100, y: 100 });
  assert.equal(target.kind, 'door');
  assert.deepEqual(target.point, { x: 900, y: 100 });
});

test('reversed split and diagonal door centers use physical opening widths', () => {
  const doc = make([[100, 100], [900, 100], [2100, 100]], [[1, 0], [2, 1]]);
  doc.edges[0].doors.push({ id: 'reverse', t: 0.5 });
  assert.deepEqual(resolveCorridorStart(doc, { x: 720, y: 100 }).point, { x: 500, y: 100 });
  const diagonal = make([[1200.5, 800.25], [200.5, 1800.25]], [[0, 1]]);
  diagonal.edges[0].doors.push({ id: 'diagonal', t: 0.6 });
  const target = resolveCorridorStart(diagonal, { x: 750.5, y: 1250.25 });
  assert.equal(target.kind, 'door');
  assert.deepEqual(target.point, { x: 600.5, y: 1400.25 });
  assert.equal(resolveCorridorStart(diagonal, { x: 770.5, y: 1230.25 }), null);
});

test('erased gaps bound midpoint measurement and block attraction through the erasure', () => {
  const doc = horizontal();
  doc.edges[0].gaps.push({ id: 'cut', start: 0.45, end: 0.55 });
  assert.deepEqual(resolveCorridorStart(doc, { x: 580, y: 100 }).point, { x: 550, y: 100 });
  assert.deepEqual(resolveCorridorStart(doc, { x: 1620, y: 100 }).point, { x: 1650, y: 100 });
  assert.equal(resolveCorridorStart(doc, { x: 1000, y: 100 }), null);
  assert.equal(resolveCorridorStart(doc, { x: 1100, y: 100 }), null);
  doc.edges[0].doors.push({ id: 'left-door', t: 0.33 }); // ends at 947.5; margin must not cross the gap
  assert.equal(resolveCorridorStart(doc, { x: 1005, y: 100 }), null);
  assert.equal(resolveCorridorStart(doc, { x: 1205, y: 100 }), null);
});

test('a nearby erasure blocks a door margin even when the physical cut is tiny', () => {
  const doc = horizontal();
  doc.edges[0].doors.push({ id: 'left-door', t: 0.3 }); // center700, end887.5, margin937.5
  doc.edges[0].gaps.push({ id: 'cut', start: 0.4, end: 0.405 }); // x900..910
  assert.equal(resolveCorridorStart(doc, { x: 905, y: 100 }), null);
  assert.equal(resolveCorridorStart(doc, { x: 920, y: 100 }), null);
});

test('a farther doorway cannot steal an aim at a nearer wall, even outside its midpoint zone', () => {
  const doc = make([[100, 100], [2100, 100], [100, 170], [2100, 170]], [[0, 1], [2, 3]]);
  doc.edges[1].doors.push({ id: 'far-door', t: 0.3 });
  assert.equal(resolveCorridorStart(doc, { x: 700, y: 110 }), null);
  const target = resolveCorridorStart(doc, { x: 1100, y: 110 });
  assert.equal(target.kind, 'center');
  assert.equal(target.edgeId, 'e0');
  assert.deepEqual(target.point, { x: 1100, y: 100 });
  assert.equal(resolveCorridorStart(doc, { x: 700, y: 160 }).doorId, 'far-door');
});

test('invalid points, empty documents and aims beyond wall endpoints do not attract', () => {
  assert.equal(resolveCorridorStart(horizontal(), { x: NaN, y: 100 }), null);
  assert.equal(resolveCorridorStart(horizontal(), { x: 2101, y: 100 }), null);
  assert.equal(resolveCorridorStart(horizontal(), { x: 99, y: 100 }), null);
  assert.equal(resolveCorridorStart(make([], []), { x: 100, y: 100 }), null);
  assert.equal(resolveCorridorStart(null, { x: 100, y: 100 }), null);
});

const bentPath = () => [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 3000, y: 2000 }, { x: 3000, y: 3000 }];
const displacementCost = (path, original) => path.slice(1, -1).reduce((sum, point, index) => sum
  + (point.x - original[index + 1].x) ** 2 + (point.y - original[index + 1].y) ** 2, 0);
const checkDirections = (path, original) => {
  assert.equal(path.length, original.length);
  for (let index = 1; index < path.length; index++) {
    const dx = path[index].x - path[index - 1].x, dy = path[index].y - path[index - 1].y;
    const oldDx = original[index].x - original[index - 1].x, oldDy = original[index].y - original[index - 1].y;
    near(dx * oldDy - dy * oldDx, 0);
    assert.ok(dx * oldDx + dy * oldDy > 0);
  }
};

test('automatic end fit redistributes multiple bends by the minimum squared point displacement', () => {
  const original = bentPath(), endpoint = { x: 3120, y: 3080 }, before = structuredClone(original);
  const fit = fitCorridorEnd(original, endpoint);
  assert.deepEqual(fit.path, [{ x: 1000, y: 1000 }, { x: 2060, y: 1000 }, { x: 3120, y: 2060 }, endpoint]);
  assert.equal(fit.squaredDisplacement, 21600);
  near(fit.endpointOffset, Math.hypot(120, 80));
  near(fit.maxDeviation, Math.hypot(120, 80));
  checkDirections(fit.path, original);
  // Every competing route with these directions has p1.x=2060+t and
  // p2.y=2060-t. Its interior displacement cost is 21600 + 2*t*t.
  for (const t of [-120, -17, 17, 120]) {
    const alternate = [original[0], { x: 2060 + t, y: 1000 }, { x: 3120, y: 2060 - t }, endpoint];
    corridorSegments(alternate);
    assert.equal(displacementCost(alternate, original), fit.squaredDisplacement + 2 * t * t);
  }
  assert.deepEqual(original, before);
  assert.deepEqual(endpoint, { x: 3120, y: 3080 });
  fit.path[0].x = -1;
  fit.path.at(-1).y = -1;
  assert.deepEqual(original, before);
  assert.deepEqual(endpoint, { x: 3120, y: 3080 });
});

test('diagonal endpoints and attracted starts keep their exact fractional coordinates in every orientation', () => {
  const original = [{ x: 1000.5, y: 1000.25 }, { x: 2000.5, y: 1000.25 }, { x: 3000.5, y: 2000.25 }];
  const endpoint = { x: 3010.75, y: 2050.25 };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const swap of [false, true]) {
    const transform = point => ({ x: (swap ? point.y : point.x) * sx, y: (swap ? point.x : point.y) * sy });
    const path = original.map(transform), end = transform(endpoint), fit = fitCorridorEnd(path, end);
    assert.deepEqual(fit.path, [path[0], transform({ x: 1960.75, y: 1000.25 }), end]);
    checkDirections(fit.path, path);
    corridorSegments(fit.path);
  }
});

test('straight automatic end fitting accepts only targets on the existing forward ray', () => {
  const original = [{ x: 1000.25, y: 1000.5 }, { x: 2000.25, y: 1000.5 }];
  const fit = fitCorridorEnd(original, { x: 2040.125, y: 1000.5 });
  assert.deepEqual(fit.path, [original[0], { x: 2040.125, y: 1000.5 }]);
  assert.equal(fit.squaredDisplacement, 0);
  assert.equal(fitCorridorEnd(original, { x: 2040.125, y: 1001 }), null);
  assert.equal(fitCorridorEnd(original, { x: 900, y: 1000.5 }, { maxDeviation: 1500 }), null);
  assert.equal(fitCorridorEnd(original, { x: 1000.75, y: 1000.5 }, { maxDeviation: 1500 }), null);
  const collinear = [original[0], { x: 1500.25, y: 1000.5 }, original[1]];
  assert.deepEqual(fitCorridorEnd(collinear, { x: 2050.25, y: 1000.5 }).path,
    [collinear[0], collinear[1], { x: 2050.25, y: 1000.5 }]);
});

test('automatic fit is bounded in map pixels and supports an exact zero-displacement limit', () => {
  const original = bentPath(), endpoint = { x: 3120, y: 3080 };
  assert.equal(fitCorridorEnd(original, endpoint, { maxDeviation: 140 }), null);
  assert.ok(fitCorridorEnd(original, endpoint, { maxDeviation: 145 }));
  assert.deepEqual(fitCorridorEnd(original, original.at(-1), { maxDeviation: 0 }).path, original);
  assert.equal(fitCorridorEnd(original, { x: 3000, y: 3000.01 }, { maxDeviation: 0 }), null);
  const straight = [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }];
  assert.equal(fitCorridorEnd(straight, { x: 2301, y: 1000 }), null);
  assert.ok(fitCorridorEnd(straight, { x: 2301, y: 1000 }, { maxDeviation: 301 }));
});

test('unsafe end fits reject reversals, collapsed segments, width-tight corners and self-overlap', () => {
  const reversal = [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 1000, y: 1000 }];
  assert.equal(fitCorridorEnd(reversal, reversal.at(-1)), null);
  const corner = [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }];
  assert.equal(fitCorridorEnd(corner, { x: 2000, y: 900 }, { maxDeviation: 1500 }), null);
  assert.equal(fitCorridorEnd(corner, { x: 2000, y: 1250 }, { maxDeviation: 1000 }), null);
  const tight = [{ x: 1000, y: 1000 }, { x: 1100, y: 1000 }, { x: 1100, y: 1100 }];
  assert.equal(fitCorridorEnd(tight, tight.at(-1)), null);
  assert.ok(fitCorridorEnd(tight, tight.at(-1), { width: 50 }));
  const crossed = [{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 3000 }, { x: 1500, y: 3000 }, { x: 1500, y: 500 }];
  assert.equal(fitCorridorEnd(crossed, crossed.at(-1)), null);
});

test('invalid end-fit input fails without modifying the route', () => {
  for (const path of [null, [], [{ x: 1, y: 2 }], [{ x: 1, y: 2 }, { x: 1, y: 2 }],
    [{ x: 1, y: 2 }, { x: NaN, y: 2 }], [{ x: 1, y: 2 }, { x: 4, y: 3 }]]) {
    assert.equal(fitCorridorEnd(path, { x: 4, y: 2 }), null);
  }
  const path = bentPath(), before = structuredClone(path);
  assert.equal(fitCorridorEnd(path, { x: Infinity, y: 2 }), null);
  assert.equal(fitCorridorEnd(path, path.at(-1), { width: 0 }), null);
  assert.deepEqual(path, before);
});

test('end fit handles the bounded 1000-point route without changing segment correspondence', () => {
  const path = [{ x: 1000, y: 1000 }];
  for (let index = 0; index < 999; index++) path.push({ x: path.at(-1).x + 20, y: path.at(-1).y + (index % 2 ? 20 : 0) });
  const endpoint = { x: path.at(-1).x + 5, y: path.at(-1).y + 5 };
  const fit = fitCorridorEnd(path, endpoint, { width: 2 });
  assert.ok(fit);
  assert.deepEqual(fit.path[0], path[0]);
  assert.deepEqual(fit.path.at(-1), endpoint);
  checkDirections(fit.path, path);
  assert.equal(fitCorridorEnd([...path, { x: endpoint.x + 20, y: endpoint.y }], endpoint, { width: 2 }), null);
});

function openingRepro(kind) {
  const doc = createDocument();
  addWall(doc, { x: 5000, y: 1000 }, { x: 5000, y: 5000 });
  const [host] = addWall(doc, { x: 3500, y: 3290 }, { x: 4500, y: 3290 });
  if (kind === 'door') addDoor(doc, host.id, { x: 4000, y: 3290 });
  else host.gaps.push({ id: 'kept-gap', start: .4, end: .6 });
  return doc;
}

test('automatic correction guard rejects a fitted rail that would fill an unrelated existing door', () => {
  const doc = openingRepro('door'), before = structuredClone(doc);
  const original = [{ x: 1000, y: 1000 }, { x: 2500, y: 1000 }, { x: 2500, y: 3040 }, { x: 4950, y: 3040 }];
  const fit = fitCorridorEnd(original, { x: 5000, y: 3000 });
  assert.ok(fit.maxDeviation < 65);
  assert.equal(corridorPreservesOpenings(doc, original), true);
  assert.equal(corridorPreservesOpenings(doc, fit.path), false);
  // Model validation alone allows intentional redraw over a doorway. Automatic
  // end correction needs the additional guard before committing that redraw.
  const unsafe = structuredClone(doc);
  addCorridor(unsafe, fit.path);
  assert.equal(unsafe.edges.flatMap(edge => edge.doors).length, 0);
  const safe = structuredClone(doc);
  addCorridor(safe, original);
  assert.equal(safe.edges.flatMap(edge => edge.doors).length, 1);
  assert.deepEqual(doc, before);
});

test('automatic correction guard preserves erased cuts and allows legal receiving-wall subdivision', () => {
  const doc = openingRepro('gap'), before = structuredClone(doc);
  const overlapping = [{ x: 1000, y: 3000 }, { x: 5000, y: 3000 }];
  assert.equal(corridorPreservesOpenings(doc, overlapping), false);
  const safe = [{ x: 1000, y: 2600 }, { x: 5000, y: 2600 }];
  assert.equal(corridorPreservesOpenings(doc, safe), true);
  const draft = structuredClone(doc);
  addCorridor(draft, safe);
  validateDocument(draft);
  assert.ok(draft.edges.length > doc.edges.length);
  assert.deepEqual(draft.edges.find(edge => edge.gaps.length).gaps, before.edges.find(edge => edge.gaps.length).gaps);
  assert.deepEqual(doc, before);
});

test('opening guard uses physical reversed-diagonal cut spans and permits boundary-only contact', () => {
  const start = { x: 1000, y: 1000 }, end = { x: 2000, y: 2000 };
  const rails = corridorSegments([start, end]);
  const rail = rails[0], dx = rail.b.x - rail.a.x, dy = rail.b.y - rail.a.y;
  const point = t => [rail.a.x + dx * t, rail.a.y + dy * t];
  const doc = make([point(1), point(0)], [[0, 1]]);
  doc.style.corridorWidth = 580;
  doc.edges[0].gaps.push({ id: 'diagonal-gap', start: .4, end: .6 });
  assert.equal(corridorPreservesOpenings(doc, [start, end]), false);
  const shortened = [start, { x: 1300, y: 1300 }];
  assert.equal(corridorPreservesOpenings(doc, shortened), true);
  const touching = [start, { x: 1400, y: 1400 }];
  assert.equal(corridorPreservesOpenings(doc, touching), true);
  assert.equal(corridorPreservesOpenings(doc, [start, { x: 1400.01, y: 1400.01 }]), false);
  assert.equal(corridorPreservesOpenings(null, [start, end]), false);
  assert.equal(corridorPreservesOpenings(doc, [start, start]), false);
});
