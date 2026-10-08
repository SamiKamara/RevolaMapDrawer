import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, validateDocument, edgeGapIntervals, moveSelection } from '../src/model.js';
import { copySelection, pasteSelection } from '../src/clipboard.js';

function graph(points, links) {
  const doc = createDocument();
  doc.vertices = points.map(([x, y], index) => ({ id: `v${index + 1}`, x, y }));
  doc.edges = links.map(([a, b, openings = {}], index) => ({ id: `e${index + 1}`, a: `v${a}`, b: `v${b}`, doors: [], gaps: [], ...openings }));
  return validateDocument(doc);
}
const select = (edgeIds = [], vertexIds = []) => ({ edgeIds, vertexIds });
const basic = () => graph([[1000, 1000], [2500, 1000]], [[1, 2]]);
const allIds = doc => [...doc.vertices.map(vertex => vertex.id), ...doc.edges.flatMap(edge => [edge.id,
  ...edge.doors.map(door => door.id), ...edge.gaps.map(gap => gap.id)])];
const endpoints = (doc, edge) => [edge.a, edge.b].map(id => doc.vertices.find(vertex => vertex.id === id));
const length = (doc, edge) => { const [a, b] = endpoints(doc, edge); return Math.hypot(a.x - b.x, a.y - b.y); };
function rejected(doc, fragment, delta, pattern) {
  const before = structuredClone(doc);
  assert.throws(() => pasteSelection(doc, fragment, delta), pattern);
  assert.deepEqual(doc, before);
}

test('point-only selection copies its induced connected walls and omits outside walls and loose points', () => {
  const doc = graph([[1000, 1000], [2500, 1000], [2500, 2500], [4000, 2500], [1000, 4000]], [[1, 2], [2, 3], [3, 4]]);
  const before = structuredClone(doc), selection = select([], ['v1', 'v2', 'v3', 'v5', 'missing']);
  const fragment = copySelection(doc, selection);
  assert.deepEqual(fragment.edges.map(edge => edge.id), ['e1', 'e2']);
  assert.deepEqual(fragment.vertices.map(vertex => vertex.id), ['v1', 'v2', 'v3']);
  assert.equal(fragment.edges[0].b, fragment.edges[1].a);
  assert.deepEqual(fragment.anchor, { x: 1750, y: 1750 });
  assert.deepEqual(doc, before);
  assert.deepEqual(selection, select([], ['v1', 'v2', 'v3', 'v5', 'missing']));
});

test('mixed selection includes implicit wall endpoints when resolving walls between selected points', () => {
  const doc = graph([[1000, 1000], [2500, 1000], [2500, 2500], [4000, 2500]], [[1, 2], [2, 3], [3, 4]]);
  const fragment = copySelection(doc, select(['e1', 'e1'], ['v3', 'v3']));
  assert.deepEqual(fragment.edges.map(edge => edge.id), ['e1', 'e2']);
  assert.equal(fragment.vertices.length, 3);
});

test('copy produces an immutable independent snapshot of points and all openings', () => {
  const doc = graph([[1000, 1000], [3000, 1000]], [[1, 2, { doors: [{ id: 'd1', t: 0.4 }], gaps: [{ id: 'g1', start: 0.8, end: 0.9 }] }]]);
  const fragment = copySelection(doc, select(['e1'])), expected = structuredClone(fragment);
  doc.vertices[0].x = 1100;
  doc.edges[0].doors[0].t = 0.5;
  doc.edges[0].gaps[0].end = 0.95;
  assert.deepEqual(fragment, expected);
  for (const value of [fragment, fragment.anchor, fragment.vertices, fragment.vertices[0], fragment.edges,
    fragment.edges[0], fragment.edges[0].doors[0], fragment.edges[0].gaps[0]]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { fragment.vertices[0].x = 0; }, TypeError);
  assert.throws(() => { fragment.edges[0].doors[0].t = 0; }, TypeError);
});

test('copy requires a wall or both of its selected endpoints without changing the document', () => {
  const doc = basic(), before = structuredClone(doc);
  for (const selection of [null, select(), select(['gone']), select([], ['v1']), { edgeIds: 'e1', vertexIds: [] }]) {
    assert.throws(() => copySelection(doc, selection), /Select/);
    assert.deepEqual(doc, before);
  }
});

test('paste remaps every graph and opening ID while preserving shared topology and fixed dimensions', () => {
  const doc = graph([[1000, 1000], [3000, 1000], [3000, 3000]], [
    [1, 2, { doors: [{ id: 'd1', t: 0.4 }], gaps: [{ id: 'g1', start: 0.8, end: 0.9 }] }], [2, 3],
  ]);
  const before = structuredClone(doc), fragment = copySelection(doc, select([], ['v1', 'v2', 'v3']));
  const selection = pasteSelection(doc, fragment, { x: 3500, y: 0 });
  assert.deepEqual(selection.vertexIds, []);
  assert.equal(selection.edgeIds.length, 2);
  const copied = doc.edges.filter(edge => selection.edgeIds.includes(edge.id));
  assert.equal(copied[0].b, copied[1].a);
  assert.equal(doc.vertices.length, 6);
  assert.equal(new Set(allIds(doc)).size, allIds(doc).length);
  assert.ok(allIds({ vertices: doc.vertices.slice(3), edges: copied }).every(id => !allIds(before).includes(id)));
  assert.equal(copied[0].doors[0].t, before.edges[0].doors[0].t);
  assert.equal(copied[0].gaps[0].start, before.edges[0].gaps[0].start);
  assert.equal(copied[0].gaps[0].end, before.edges[0].gaps[0].end);
  const cuts = edgeGapIntervals(doc, copied[0]);
  assert.ok(Math.abs((cuts[0].end - cuts[0].start) * length(doc, copied[0]) - 375) < 1e-6);
  assert.ok(Math.abs((cuts[1].end - cuts[1].start) * length(doc, copied[0]) - 200) < 1e-6);
  assert.deepEqual(doc.vertices.slice(0, 3), before.vertices);
  assert.deepEqual(doc.edges.slice(0, 2), before.edges);
  assert.deepEqual(doc.ship, before.ship);
  assert.deepEqual(validateDocument(doc), doc);
});

test('one common unsnapped delta preserves fractional reversed diagonal geometry and door width', () => {
  const doc = graph([[2500.125, 2500.375], [1000.125, 1000.375]], [[1, 2, { doors: [{ id: 'd1', t: 0.5 }] }]]);
  const fragment = copySelection(doc, select(['e1'])), delta = { x: 2750.25, y: 13.625 };
  const selection = pasteSelection(doc, fragment, delta), edge = doc.edges.find(value => value.id === selection.edgeIds[0]);
  const actual = endpoints(doc, edge);
  for (let index = 0; index < 2; index++) {
    assert.equal(actual[index].x, fragment.vertices[index].x + delta.x);
    assert.equal(actual[index].y, fragment.vertices[index].y + delta.y);
  }
  assert.equal(length(doc, edge), Math.hypot(1500, 1500));
  const cut = edgeGapIntervals(doc, edge)[0];
  assert.ok(Math.abs((cut.end - cut.start) * length(doc, edge) - 375) < 1e-6);
});

test('decimal-fraction pastes use model precision and reopen without changing coordinates', () => {
  const doc = graph([[1000.123456789, 1000.987654321], [2500.123456789, 2500.987654321]], [
    [1, 2, { doors: [{ id: 'd1', t: 0.5 }] }],
  ]);
  const fragment = copySelection(doc, select(['e1']));
  const selection = pasteSelection(doc, fragment, { x: 3500, y: 123.456789123 });
  const edge = doc.edges.find(value => value.id === selection.edgeIds[0]);
  const [a, b] = endpoints(doc, edge);
  assert.deepEqual({ x: a.x, y: a.y }, { x: 4500.123456789, y: 1124.444443444 });
  assert.deepEqual({ x: b.x, y: b.y }, { x: 6000.123456789, y: 2624.444443444 });
  assert.ok(Math.abs((b.x - a.x) - (b.y - a.y)) < 1e-6);
  assert.ok(Math.abs(length(doc, edge) - Math.hypot(1500, 1500)) < 1e-6);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
});

test('repeated paste creates independent groups and the snapshot can paste into a new document', () => {
  const doc = basic(), fragment = copySelection(doc, select(['e1']));
  const first = pasteSelection(doc, fragment, { x: 0, y: 1000 });
  const second = pasteSelection(doc, fragment, { x: 0, y: 2000 });
  assert.notEqual(first.edgeIds[0], second.edgeIds[0]);
  const beforeMove = structuredClone(doc);
  assert.equal(moveSelection(doc, first, { x: 125, y: 125 }), true);
  assert.deepEqual(doc.vertices.slice(0, 2), beforeMove.vertices.slice(0, 2));
  assert.deepEqual(doc.vertices.slice(4), beforeMove.vertices.slice(4));
  const fresh = createDocument();
  const other = pasteSelection(fresh, fragment, { x: 0, y: 0 });
  assert.equal(fresh.edges.length, 1);
  assert.ok(allIds(fresh).every(id => !allIds(fragment).includes(id)));
  assert.deepEqual(other.edgeIds, fresh.edges.map(edge => edge.id));
  assert.deepEqual(fragment.vertices.map(({ x, y }) => ({ x, y })), [{ x: 1000, y: 1000 }, { x: 2500, y: 1000 }]);
});

test('copies of pinned endpoints become movable detached points and leave fixed ship ports unchanged', () => {
  const doc = graph([[3739.5, 4740], [3739.5, 3240]], [[1, 2]]), before = structuredClone(doc);
  const fragment = copySelection(doc, select(['e1']));
  const selection = pasteSelection(doc, fragment, { x: -1500, y: -1000 });
  assert.equal(moveSelection(doc, selection, { x: 500, y: 125 }), true);
  assert.deepEqual(doc.vertices.slice(0, 2), before.vertices);
  assert.deepEqual(doc.ship, before.ship);
  assert.equal(Object.hasOwn(fragment, 'ship'), false);
  rejected(createDocument(), fragment, { x: 713, y: 0 }, /fixed ship ports/);
});

test('paste rejects overlap and touching old endpoints atomically instead of joining or changing walls', () => {
  const doc = basic(), fragment = copySelection(doc, select(['e1']));
  rejected(doc, fragment, { x: 0, y: 0 }, /Coincident/);
  rejected(doc, fragment, { x: 500, y: 0 }, /Overlapping/);
  rejected(doc, fragment, { x: 1500, y: 0 }, /Coincident/);
});

test('paste rejects unsplit crossings and contacts inside an existing door opening atomically', () => {
  const doc = graph([[1000, 1000], [2500, 1000], [4500, 250], [4500, 1750]], [
    [1, 2], [3, 4, { doors: [{ id: 'd1', t: 0.5 }] }],
  ]);
  const fragment = copySelection(doc, select(['e1']));
  rejected(doc, fragment, { x: 3000, y: 0 }, /Intersecting/);
  rejected(doc, fragment, { x: 3500, y: 0 }, /Intersecting/);
});

test('paste may expand around the fixed world center and exactly round-trips through project metadata', () => {
  const doc = basic(), before = structuredClone(doc), fragment = copySelection(doc, select(['e1']));
  pasteSelection(doc, fragment, { x: -2000, y: 0 });
  assert.deepEqual([doc.width, doc.height, doc.originX, doc.originY], [16384, 16384, -4096, -4096]);
  assert.deepEqual(doc.vertices.slice(0, 2), before.vertices);
  assert.deepEqual(doc.edges.slice(0, 1), before.edges);
  assert.deepEqual(doc.ship, before.ship);
  assert.equal(doc.originX + doc.width / 2, 4096);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
});

test('maximum bounds include the miter margin and invalid expansion leaves the initial canvas intact', () => {
  const doc = basic(), fragment = copySelection(doc, select(['e1']));
  rejected(doc, fragment, { x: -5022, y: 0 }, /maximum 16384/);
  rejected(doc, fragment, { x: 11000, y: 0 }, /maximum 16384/);
  assert.equal(doc.width, 8192);
  pasteSelection(doc, fragment, { x: -5021, y: 0 });
  assert.equal(doc.vertices[2].x, -4096 + 75);
});

test('invalid copied geometry and deltas cannot partially mutate a map', () => {
  const doc = basic(), fragment = copySelection(doc, select(['e1']));
  for (const delta of [null, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) rejected(doc, fragment, delta, /paste position/);
  rejected(doc, { vertices: [], edges: [] }, { x: 0, y: 1000 }, /Copy some walls/);
  const broken = structuredClone(fragment);
  broken.edges[0].b = 'missing';
  rejected(doc, broken, { x: 0, y: 1000 }, /Every wall/);
  broken.edges[0].b = broken.edges[0].a;
  rejected(doc, broken, { x: 0, y: 1000 }, /Every wall/);
  broken.edges[0].id = broken.vertices[0].id;
  rejected(doc, broken, { x: 0, y: 1000 }, /graph identifiers/);
});

test('paste enforces the whole-document geometry limit atomically', () => {
  const doc = basic(), fragment = copySelection(doc, select(['e1']));
  while (doc.vertices.length < 19999) {
    const index = doc.vertices.length;
    doc.vertices.push({ id: `v${index + 1}`, x: 100.25 + (index % 200) * 25, y: 200.25 + Math.floor(index / 200) * 25 });
  }
  rejected(doc, fragment, { x: 0, y: 3000 }, /geometry limit/);
});
