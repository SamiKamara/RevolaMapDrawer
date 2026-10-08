import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, validateDocument, addRoom, moveSelection, edgeGapIntervals } from '../src/model.js';

function graph(points, lines) {
  const doc = createDocument();
  doc.vertices = points.map(([x, y], i) => ({ id: `v${i + 1}`, x, y }));
  doc.edges = lines.map(([a, b, cuts = {}], i) => ({ id: `e${i + 1}`, a: `v${a}`, b: `v${b}`, doors: [], gaps: [], ...cuts }));
  return validateDocument(doc);
}

const select = (edgeIds = [], vertexIds = []) => ({ edgeIds, vertexIds });
const point = (doc, id) => doc.vertices.find(vertex => vertex.id === id);
const length = (doc, edge) => {
  const a = point(doc, edge.a), b = point(doc, edge.b);
  return Math.hypot(b.x - a.x, b.y - a.y);
};
function assertUnchanged(doc, selection, delta) {
  const before = structuredClone(doc);
  assert.equal(moveSelection(doc, selection, delta), false);
  assert.deepEqual(doc, before);
}
function assertTranslated(before, after, ids, delta) {
  const selected = new Set(ids);
  for (const vertex of before.vertices) {
    const moved = point(after, vertex.id);
    if (selected.has(vertex.id)) {
      assert.ok(Math.abs(moved.x - vertex.x - delta.x) < 1e-7);
      assert.ok(Math.abs(moved.y - vertex.y - delta.y) < 1e-7);
    } else assert.deepEqual(moved, vertex);
  }
}

test('a complete chamfered room translates rigidly without resizing any side', () => {
  for (const rotated of [false, true]) {
    const doc = createDocument();
    addRoom(doc, { x: 1200, y: 1200 }, { x: 3000, y: 2800 }, rotated);
    const before = structuredClone(doc), delta = { x: 125, y: -75 };
    assert.equal(moveSelection(doc, select(doc.edges.map(edge => edge.id)), delta), true);
    assertTranslated(before, doc, doc.vertices.map(vertex => vertex.id), delta);
    assert.deepEqual(doc.edges, before.edges);
    assert.deepEqual(doc.ship, before.ship);
    assert.deepEqual(validateDocument(doc), doc);
  }
});

test('disconnected walls translate together and retain internal doors, gaps and persistence', () => {
  const doc = graph([[1000, 1000], [4000, 1000], [1500, 2000], [3500, 4000]], [
    [1, 2, { doors: [{ id: 'd1', t: 0.3 }], gaps: [{ id: 'g1', start: 0.7, end: 0.8 }] }],
    [3, 4, { doors: [{ id: 'd2', t: 0.4 }], gaps: [{ id: 'g2', start: 0.75, end: 0.9 }] }],
  ]);
  const before = structuredClone(doc), delta = { x: -175, y: 250 };
  assert.equal(moveSelection(doc, select(['e1', 'e2']), delta), true);
  assertTranslated(before, doc, ['v1', 'v2', 'v3', 'v4'], delta);
  assert.deepEqual(doc.edges, before.edges);
  for (const edge of doc.edges) {
    const opening = edgeGapIntervals(doc, edge)[0];
    assert.ok(Math.abs((opening.end - opening.start) * length(doc, edge) - 375) < 1e-6);
  }
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
});

test('mixed point and wall selections deduplicate shared endpoints', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [2000, 2000]], [[1, 2], [2, 3]]);
  const before = structuredClone(doc), delta = { x: 150, y: 225 };
  assert.equal(moveSelection(doc, select(['e1', 'e1'], ['v1', 'v2', 'v3', 'v3']), delta), true);
  assertTranslated(before, doc, ['v1', 'v2', 'v3'], delta);
});

test('parallel boundary connections project one common translation and leave neighbors fixed', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [1000, 2000], [2000, 2000]], [[1, 2], [3, 4], [2, 4]]);
  const before = structuredClone(doc);
  assert.equal(moveSelection(doc, select(['e3']), { x: 200, y: 125 }), true);
  assertTranslated(before, doc, ['v2', 'v4'], { x: 200, y: 0 });
  assert.deepEqual(doc.edges, before.edges);
  validateDocument(doc);
});

test('explicit point selections share a fractional diagonal projection', () => {
  const doc = graph([[1000, 1000], [2000, 2000], [1000, 3000], [2000, 4000]], [[1, 2], [3, 4]]);
  const before = structuredClone(doc);
  assert.equal(moveSelection(doc, select([], ['v2', 'v4']), { x: 50, y: 25 }), true);
  assertTranslated(before, doc, ['v2', 'v4'], { x: 37.5, y: 37.5 });
  validateDocument(doc);
});

test('oppositely oriented parallel boundaries still permit a shared move', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [3000, 2000], [2000, 2000]], [[1, 2], [3, 4], [2, 4]]);
  const before = structuredClone(doc);
  assert.equal(moveSelection(doc, select(['e3']), { x: 200, y: 100 }), true);
  assertTranslated(before, doc, ['v2', 'v4'], { x: 200, y: 0 });
});

test('incompatible fixed boundary directions reject the entire selection', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [2000, 2000], [3000, 3000]], [[1, 2], [2, 3], [3, 4]]);
  assertUnchanged(doc, select(['e2']), { x: 200, y: 200 });
});

test('group movement rejects boundary reversal and collapsed walls atomically', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [1000, 2000], [2000, 2000]], [[1, 2], [3, 4]]);
  for (const x of [-1000, -1200]) assertUnchanged(doc, select([], ['v2', 'v4']), { x, y: 0 });
});

test('unselected geometry cannot be crossed, overlapped or silently rejoined', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [2500, 500], [2500, 2000]], [[1, 2], [3, 4]]);
  assertUnchanged(doc, select(['e1']), { x: 1000, y: 0 });
  assertUnchanged(doc, select(['e1']), { x: 500, y: 0 });
  const parallel = graph([[1000, 1000], [2000, 1000], [1000, 2000], [2000, 2000]], [[1, 2], [3, 4]]);
  assertUnchanged(parallel, select(['e1']), { x: 0, y: 1000 });
});

test('group movement never attracts or changes individual endpoints near other walls', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [2500, 500], [2500, 2000]], [[1, 2], [3, 4]]);
  const before = structuredClone(doc);
  assert.equal(moveSelection(doc, select(['e1']), { x: 475, y: 0 }), true);
  assertTranslated(before, doc, ['v1', 'v2'], { x: 475, y: 0 });
  assert.deepEqual(doc.edges, before.edges);
});

test('boundary doors retain identity and fixed physical width while clearance is validated', () => {
  const doc = graph([[1000, 1000], [3000, 1000], [1000, 2000], [3000, 2000]], [
    [1, 2, { doors: [{ id: 'd1', t: 0.5 }] }], [3, 4],
  ]);
  const selection = select([], ['v2', 'v4']);
  assert.equal(moveSelection(doc, selection, { x: -500, y: 0 }), true);
  assert.deepEqual(doc.edges[0].doors, [{ id: 'd1', t: 0.5 }]);
  const cut = edgeGapIntervals(doc, doc.edges[0])[0];
  assert.ok(Math.abs((cut.end - cut.start) * length(doc, doc.edges[0]) - 375) < 1e-6);
  assertUnchanged(doc, selection, { x: -1100, y: 0 });
});

test('selected ship ports block the group while a stationary port permits stretching', () => {
  const doc = graph([[3739.5, 4740], [3739.5, 3740], [2000, 3000], [3000, 3000]], [[1, 2], [3, 4]]);
  assertUnchanged(doc, select(['e1', 'e2']), { x: 100, y: 100 });
  const before = structuredClone(doc);
  assert.equal(moveSelection(doc, select([], ['v2']), { x: 100, y: -100 }), true);
  assertTranslated(before, doc, ['v2'], { x: 0, y: -100 });
  assert.deepEqual(doc.ship, before.ship);
});

test('group movement expands around the original world center and rejects maximum bounds atomically', () => {
  const doc = graph([[1000, 1000], [2000, 1000], [1000, 2000], [2000, 2000]], [[1, 2], [3, 4]]);
  const before = structuredClone(doc), selection = select(['e1', 'e2']);
  assert.equal(moveSelection(doc, selection, { x: -1100, y: 0 }), true);
  assert.equal(doc.width, 16384);
  assert.equal(doc.height, 16384);
  assert.equal(doc.originX, -4096);
  assert.equal(doc.originY, -4096);
  assertTranslated(before, doc, ['v1', 'v2', 'v3', 'v4'], { x: -1100, y: 0 });
  assert.deepEqual(doc.ship, before.ship);
  assertUnchanged(doc, selection, { x: -4000, y: 0 });
  const initial = structuredClone(before);
  assertUnchanged(initial, selection, { x: 11200, y: 0 });
});

test('empty, missing, invalid and zero-motion selections do not mutate the document', () => {
  const doc = graph([[1000, 1000], [2000, 1000]], [[1, 2]]);
  for (const selection of [null, select(), select(['missing']), select([], ['missing']), { edgeIds: 'e1' }]) {
    assertUnchanged(doc, selection, { x: 100, y: 0 });
  }
  for (const delta of [null, { x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 0 }]) {
    assertUnchanged(doc, select(['e1']), delta);
  }
  assertUnchanged(doc, select([], ['v2']), { x: 0, y: 100 });
});
