import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, addWall, addDoor, snapWallStart, validateDocument } from '../src/model.js';

const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const at = (origin, direction, length) => ({ x: origin.x + direction[0] * length, y: origin.y + direction[1] * length });
const degree = (doc, vertex) => doc.edges.filter(edge => edge.a === vertex.id || edge.b === vertex.id).length;

test('starting a diagonal near a solid connected corner reuses that corner instead of creating a tiny triangle', () => {
  for (const mirrorX of [-1, 1]) for (const mirrorY of [-1, 1]) {
    const doc = createDocument(), corner = { x: 3000, y: 3000 };
    const point = (x, y) => ({ x: corner.x + mirrorX * x, y: corner.y + mirrorY * y });
    addWall(doc, point(-1000, 0), corner, { joinTolerance: 0 });
    addWall(doc, corner, point(0, 1000), { joinTolerance: 0 });
    const originalVertices = structuredClone(doc.vertices), originalEdges = structuredClone(doc.edges);
    const start = point(-25, 25), end = point(975, 1025);
    assert.deepEqual(snapWallStart(doc, start), corner, 'The nearer wall-face projection must not replace a nearby structural corner');
    const added = addWall(doc, start, end);
    assert.deepEqual(added.start, corner);
    assert.deepEqual(added.end, point(1000, 1000));
    assert.equal(doc.edges.length, 3, 'No short wall triangle is inserted beside the existing corner');
    assert.equal(doc.vertices.length, 4);
    for (const vertex of originalVertices) assert.deepEqual(doc.vertices.find(current => current.id === vertex.id), vertex);
    for (const edge of originalEdges) assert.deepEqual(doc.edges.find(current => current.id === edge.id), edge);
    const junction = doc.vertices.find(vertex => vertex.x === corner.x && vertex.y === corner.y);
    assert.equal(degree(doc, junction), 3);
    assert.deepEqual(validateDocument(doc), doc);
  }
});

test('corner start attraction stays bounded and does not target wholly erased corner arms', () => {
  const doc = createDocument(), corner = { x: 3000, y: 3000 };
  const [horizontal] = addWall(doc, { x: 2000, y: 3000 }, corner, { joinTolerance: 0 });
  const [vertical] = addWall(doc, corner, { x: 3000, y: 4000 }, { joinTolerance: 0 });
  assert.deepEqual(snapWallStart(doc, { x: 2950, y: 3025 }), { x: 2950, y: 3000 }, 'A structural corner farther than 50 px cannot attract');
  assert.deepEqual(snapWallStart(doc, { x: 2975, y: 3025 }, { joinTolerance: 0 }), { x: 2975, y: 3025 });
  doc.edges.find(edge => edge.id === horizontal.id).gaps.push({ id: 'erased_horizontal_end', start: 0.95, end: 1 });
  doc.edges.find(edge => edge.id === vertical.id).gaps.push({ id: 'erased_vertical_start', start: 0, end: 0.05 });
  assert.deepEqual(snapWallStart(doc, { x: 2975, y: 3025 }), { x: 2975, y: 3025 }, 'Erasing a corner must not create an invisible attraction target');
  assert.deepEqual(validateDocument(doc), doc);
});

test('start attraction cannot jump from a door or across an erased interval to a nearby endpoint', () => {
  for (const cut of ['door', 'erasure']) {
    const doc = createDocument();
    const [edge] = addWall(doc, { x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { joinTolerance: 0 });
    if (cut === 'door') assert.equal(addDoor(doc, edge.id, { x: 1215, y: 1000 }, { centerTolerance: 0 }), true);
    else edge.gaps.push({ id: 'cut_between_aim_and_endpoint', start: 0.015, end: 0.035 });
    const before = structuredClone(doc);
    // This grid point is inside the door, or on the solid wall beyond the
    // erasure. The left endpoint is 50 px away but separated by a real cut.
    const aim = { x: 1050, y: 1000 };
    assert.deepEqual(snapWallStart(doc, aim), aim, cut);
    assert.deepEqual(doc, before, 'Resolving a preview never changes openings');
    assert.deepEqual(validateDocument(doc), doc);
  }
});

test('a corner can still attract through its other uninterrupted solid arm beside an erased approach', () => {
  const doc = createDocument(), corner = { x: 3000, y: 3000 };
  const [horizontal] = addWall(doc, { x: 2000, y: 3000 }, corner, { joinTolerance: 0 });
  addWall(doc, corner, { x: 3000, y: 4000 }, { joinTolerance: 0 });
  const host = doc.edges.find(edge => edge.id === horizontal.id);
  host.gaps.push({ id: 'erased_one_corner_approach', start: 0.965, end: 0.985 });
  const originalHost = structuredClone(host), start = { x: 2975, y: 3025 };
  assert.deepEqual(snapWallStart(doc, start), corner, 'The vertical arm remains a legal solid approach to the corner');
  const added = addWall(doc, start, { x: 3975, y: 4025 });
  assert.deepEqual(added.start, corner);
  assert.equal(doc.edges.length, 3);
  assert.deepEqual(doc.edges.find(edge => edge.id === horizontal.id), originalHost, 'Attraction through the other arm preserves the erased interval');
  assert.deepEqual(validateDocument(doc), doc);
});

test('near diagonal corners join without a third arm in either drawing direction and every orientation', () => {
  const origin = { x: 3000, y: 3000 };
  for (let diagonal = 1; diagonal < directions.length; diagonal += 2) {
    for (let axis = 0; axis < directions.length; axis += 2) {
      for (const diagonalGap of [-20, 20]) for (const axisGap of [-20, 20]) {
        for (const diagonalFirst of [false, true]) for (const fromCorner of [false, true]) {
          const doc = createDocument();
          const first = directions[diagonalFirst ? diagonal : axis], second = directions[diagonalFirst ? axis : diagonal];
          const firstGap = diagonalFirst ? diagonalGap : axisGap, secondGap = diagonalFirst ? axisGap : diagonalGap;
          const fixed = at(origin, first, 1000);
          addWall(doc, fixed, at(origin, first, firstGap), { joinTolerance: 0 });
          const near = at(origin, second, secondGap), far = at(origin, second, 1000);
          addWall(doc, ...(fromCorner ? [near, far] : [far, near]));
          const label = `diagonal ${diagonal}, axis ${axis}, gaps ${diagonalGap}/${axisGap}, order ${diagonalFirst}/${fromCorner}`;
          assert.equal(doc.edges.length, 2, `${label}: a corner must not retain a short spur`);
          assert.equal(doc.vertices.length, 3, `${label}: both walls share one endpoint`);
          assert.equal(doc.vertices.filter(vertex => degree(doc, vertex) === 2).length, 1, label);
          assert.ok(doc.vertices.some(vertex => vertex.x === fixed.x && vertex.y === fixed.y), `${label}: the existing far end remains fixed`);
          assert.deepEqual(validateDocument(doc), doc, label);
        }
      }
    }
  }
});

test('a receiving diagonal drawn last closes horizontal and vertical face gaps into shared joints', () => {
  for (const reverse of [false, true]) {
    const doc = createDocument();
    addWall(doc, { x: 1000, y: 2000 }, { x: 1975, y: 2000 }, { joinTolerance: 0 });
    addWall(doc, { x: 3000, y: 4000 }, { x: 3000, y: 3025 }, { joinTolerance: 0 });
    const ends = [{ x: 1000, y: 1000 }, { x: 4000, y: 4000 }];
    addWall(doc, ...(reverse ? ends.toReversed() : ends));
    for (const point of [{ x: 2000, y: 2000 }, { x: 3000, y: 3000 }]) {
      const joint = doc.vertices.find(vertex => vertex.x === point.x && vertex.y === point.y);
      assert.ok(joint, `Missing shared diagonal junction at ${point.x},${point.y}`);
      assert.equal(degree(doc, joint), 3);
    }
    assert.equal(doc.edges.length, 5);
    assert.ok(!doc.vertices.some(vertex => vertex.x === 1975 || vertex.y === 3025));
    assert.deepEqual(validateDocument(doc), doc);
  }
});

test('a receiving diagonal preserves an erased free end and explicit zero joining', () => {
  for (const cut of ['erased', 'joining disabled']) {
    const doc = createDocument();
    const [stub] = addWall(doc, { x: 1000, y: 2000 }, { x: 1975, y: 2000 }, { joinTolerance: 0 });
    if (cut === 'erased') stub.gaps.push({ id: 'erased_diagonal_approach', start: 0.95, end: 1 });
    addWall(doc, { x: 1000, y: 1000 }, { x: 4000, y: 4000 }, cut === 'joining disabled' ? { joinTolerance: 0 } : {});
    assert.equal(doc.edges.length, 2, cut);
    assert.ok(doc.vertices.some(vertex => vertex.x === 1975 && vertex.y === 2000), cut);
    if (cut === 'erased') assert.deepEqual(doc.edges.find(edge => edge.id === stub.id).gaps, stub.gaps);
    assert.deepEqual(validateDocument(doc), doc, cut);
  }
});
