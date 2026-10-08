import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySelection, selectionVertices, pruneSelection, rectangleSelection, combineSelection, toggleSelection } from '../src/selection.js';

const doc = { vertices: [{ id: 'a', x: -100, y: 100 }, { id: 'b', x: 100, y: 100 }, { id: 'c', x: 100, y: 300 }, { id: 'd', x: 400, y: 300 }],
  edges: [{ id: 'one', a: 'a', b: 'b' }, { id: 'two', a: 'b', b: 'c' }, { id: 'three', a: 'c', b: 'd' }] };

test('marquee works in either direction and includes full walls and separate enclosed corners only', () => {
  const a = { x: -100, y: 100 }, b = { x: 100, y: 300 };
  const selected = rectangleSelection(doc, a, b);
  assert.deepEqual(selected, { edgeIds: ['one', 'two'], vertexIds: [] });
  assert.deepEqual(rectangleSelection(doc, b, a), selected);
  assert.deepEqual([...selectionVertices(doc, selected)].sort(), ['a', 'b', 'c']);
  assert.deepEqual(rectangleSelection(doc, { x: 50, y: 50 }, { x: 150, y: 150 }), { edgeIds: [], vertexIds: ['b'] });
  assert.deepEqual(rectangleSelection(doc, { x: -50, y: 90 }, { x: 50, y: 110 }), emptySelection());
});

test('Ctrl wall toggles and additive areas do not duplicate shared points or mutate existing selection', () => {
  const base = toggleSelection(doc, emptySelection(), 'edge', 'one');
  const selected = combineSelection(doc, base, { edgeIds: ['one', 'two'], vertexIds: ['b', 'd'] });
  assert.deepEqual(selected, { edgeIds: ['one', 'two'], vertexIds: ['d'] });
  assert.equal(selectionVertices(doc, selected).size, 4);
  assert.deepEqual(base, { edgeIds: ['one'], vertexIds: [] });
  assert.deepEqual(toggleSelection(doc, selected, 'edge', 'two'), { edgeIds: ['one'], vertexIds: ['d'] });
});

test('Ctrl removing an implicit selected corner truly excludes it and keeps other selected ends', () => {
  const selected = { edgeIds: ['one', 'two', 'three'], vertexIds: [] };
  const next = toggleSelection(doc, selected, 'vertex', 'b');
  assert.deepEqual(next, { edgeIds: ['three'], vertexIds: ['a'] });
  assert.deepEqual([...selectionVertices(doc, next)].sort(), ['a', 'c', 'd']);
  assert.equal(selectionVertices(doc, selected).size, 4);
});

test('point-only membership toggles independently and survives merging with a separate wall', () => {
  const point = toggleSelection(doc, emptySelection(), 'vertex', 'd');
  assert.deepEqual(toggleSelection(doc, point, 'vertex', 'd'), emptySelection());
  assert.deepEqual(toggleSelection(doc, point, 'edge', 'one'), { edgeIds: ['one'], vertexIds: ['d'] });
});

test('document replacement and deleted geometry prune stale IDs without changing map data', () => {
  const before = structuredClone(doc);
  assert.deepEqual(pruneSelection(doc, { edgeIds: ['gone', 'one', 'one'], vertexIds: ['missing', 'b', 'd', 'd'] }), { edgeIds: ['one'], vertexIds: ['d'] });
  assert.deepEqual(pruneSelection({ vertices: [], edges: [] }, { edgeIds: ['one'], vertexIds: ['d'] }), emptySelection());
  assert.deepEqual(doc, before);
});
