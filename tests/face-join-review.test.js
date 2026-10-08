import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, validateDocument, addDoor, moveVertex } from '../src/model.js';

const cutPositions = doc => doc.edges.flatMap(edge => {
  const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
  const point = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return [...edge.doors.map(door => ({ id: door.id, points: [point(door.t)] })),
    ...edge.gaps.map(gap => ({ id: gap.id, points: [point(gap.start), point(gap.end)] }))];
}).sort((one, two) => one.id.localeCompare(two.id));

test('later face joins remap cuts on the correct child after an earlier join splits its wall', () => {
  const doc = createDocument();
  doc.vertices = [['a', 100, 2000], ['b', 3000, 2000], ['c', 2000, 1000], ['d', 2000, 1980],
    ['e', 3025, 1500], ['f', 3025, 2500]].map(([id, x, y]) => ({ id, x, y }));
  doc.edges = [['wall', 'a', 'b'], ['incoming', 'c', 'd'], ['far', 'e', 'f']]
    .map(([id, a, b]) => ({ id, a, b, doors: [], gaps: [] }));
  addDoor(doc, 'wall', { x: 2500, y: 2000 });
  doc.edges[0].gaps.push({ id: 'erasure', start: (2800 - 100) / 2900, end: (2850 - 100) / 2900 });
  validateDocument(doc);
  const ordinaryMove = structuredClone(doc);
  assert.equal(moveVertex(ordinaryMove, 'a', { x: 75, y: 2000 }, { joinTolerance: 0 }), true);
  assert.equal(moveVertex(doc, 'a', { x: 75, y: 2000 }), true);
  assert.deepEqual(doc.vertices.find(v => v.id === 'd'), { id: 'd', x: 2000, y: 2000 });
  assert.deepEqual(doc.vertices.find(v => v.id === 'b'), { id: 'b', x: 3025, y: 2000 });
  const expected = cutPositions(ordinaryMove), actual = cutPositions(doc);
  assert.deepEqual(actual.map(cut => cut.id), expected.map(cut => cut.id));
  for (let i = 0; i < expected.length; i++) for (let j = 0; j < expected[i].points.length; j++) {
    const a = actual[i].points[j], b = expected[i].points[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-7, `Optional joining moved ${actual[i].id} from ${b.x},${b.y} to ${a.x},${a.y}`);
  }
  validateDocument(doc);
});
