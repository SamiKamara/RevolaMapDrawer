import test from 'node:test';
import assert from 'node:assert/strict';
import { populationFixture } from '../scripts/population-fixture.mjs';
import { generateFloor } from '../src/floors.js';
import { doorPreviewTypes } from '../src/door-preview.js';
import { objectVisualKey } from '../src/object-visuals.js';
import { validateObjects } from '../src/object-schema.js';

test('automatic door preview distinguishes supported sliding tracks from hinged ship doors without changing the source', () => {
  const doc = populationFixture(), original = JSON.stringify(doc), types = doorPreviewTypes(doc, generateFloor(doc));
  assert.equal(types.get('d1'), 'sliding'); assert.equal(types.get('ship-inner-door'), 'hinged');
  assert.equal(JSON.stringify(doc), original);
  const door = { id: 'generated-door', category: 'doors', type: 'auto', doorId: 'ship-inner-door', x: 0, y: 0, rotation: 0 };
  assert.equal(objectVisualKey({ ...door, previewDoorType: types.get(door.doorId) }), 'door-hinged');
  assert.deepEqual(validateObjects([{ ...door, previewDoorType: 'hinged' }]), [door]);
  assert.equal(objectVisualKey({ ...door, type: 'sliding', previewDoorType: 'hinged' }), 'door');
  assert.equal(objectVisualKey({ ...door, type: 'hinged', previewDoorType: 'sliding' }), 'door-hinged');
});

test('continuous pocket coverage detects tiny erased gaps on both tracks after a geometry edit', () => {
  const doc = populationFixture(), edge = doc.edges.find(e => e.doors.length);
  assert.equal(doorPreviewTypes(doc, generateFloor(doc)).get('d1'), 'sliding');
  edge.gaps = [{ id: 'left-cut', start: .43333, end: .43334 }, { id: 'right-cut', start: .56666, end: .56667 }];
  const floor = generateFloor(doc); assert.equal(floor.closed, true);
  assert.equal(doorPreviewTypes(doc, floor).get('d1'), 'hinged');
  assert.equal(doorPreviewTypes(doc, { closed: false }).size, 0);
});
