import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedCursors } from '../src/shared-cursors.js';
test('UI coordinates smooth within the normalized viewport and switching spaces snaps safely', () => {
  const cursors = new SharedCursors();
  cursors.update({ author: '2', x: 1000, y: 3000, visible: true }, 0);
  cursors.update({ author: '2', x: .2, y: .4, space: 'ui', visible: true }, 50);
  assert.equal([...cursors.values(50)][0].x, .2);
  cursors.update({ author: '2', x: .8, y: .4, space: 'ui', visible: true }, 60);
  const x = [...cursors.values(100)][0].x; assert.ok(x > .2 && x < .8);
  cursors.update({ author: '2', x: 2, y: .4, space: 'ui', visible: true }, 110);
  assert.equal(cursors.cursors.get('2').x, .8);
});

const cursor = (author, x, y = 0, visible = true) => ({ author, x, y, visible, name: `Player ${author}` });
const point = (cursors, author, now) => [...cursors.values(now)].find(value => value.author === author);

test('a first remote cursor appears at its actual position; later packets move through intermediate positions', () => {
  const cursors = new SharedCursors(); cursors.update(cursor('1', 1000, 2000), 0);
  assert.equal(point(cursors, '1', 0).x, 1000); assert.equal(cursors.moving(0), false);
  cursors.update(cursor('1', 1600, 2200), 100);
  assert.equal(point(cursors, '1', 100).x, 1000);
  const first = point(cursors, '1', 116), second = point(cursors, '1', 132);
  assert.ok(first.x > 1000 && second.x > first.x && second.x < 1600);
  assert.ok(first.y > 2000 && second.y > first.y && second.y < 2200);
  assert.equal(first.name, 'Player 1'); assert.equal(cursors.moving(132), true);
});

test('each author has an independent receiver-local trajectory', () => {
  const cursors = new SharedCursors();
  cursors.update(cursor('1', 0), 0); cursors.update(cursor('2', 1000), 0);
  cursors.update(cursor('1', 500), 100); const before = point(cursors, '1', 140).x;
  cursors.update(cursor('2', 2000), 140);
  assert.equal(point(cursors, '1', 140).x, before);
  assert.equal(point(cursors, '2', 140).x, 1000);
  assert.ok(point(cursors, '1', 180).x < 500 && point(cursors, '2', 180).x > 1000);
});

test('sampling at 30 60 or 144 fps gives the same position and stops repainting once settled', () => {
  const positions = [];
  for (const fps of [30, 60, 144]) {
    const cursors = new SharedCursors(); cursors.update(cursor('1', 0), 0); cursors.update(cursor('1', 100), 100);
    for (let frame = 0; frame < fps; frame++) point(cursors, '1', 100 + frame * 1000 / fps);
    positions.push(point(cursors, '1', 200).x);
    assert.equal(point(cursors, '1', 1100).x, 100);
    assert.equal(cursors.moving(1100), false);
  }
  assert.equal(new Set(positions).size, 1);
});

test('an irregular packet retargets from the displayed point without a jump or overshoot', () => {
  const cursors = new SharedCursors(); cursors.update(cursor('1', 0), 0); cursors.update(cursor('1', 1000), 100);
  const before = point(cursors, '1', 193).x; cursors.update(cursor('1', 400), 193);
  assert.equal(point(cursors, '1', 193).x, before);
  assert.ok(point(cursors, '1', 230).x < before && point(cursors, '1', 230).x > 400);
  assert.equal(point(cursors, '1', 2000).x, 400);
});

test('hidden cursors disappear immediately and reappear at the new point without a trail across the map', () => {
  const cursors = new SharedCursors(); cursors.update(cursor('1', 100), 0); cursors.update(cursor('1', 1000), 100);
  cursors.update(cursor('1', 0, 0, false), 120);
  assert.equal(point(cursors, '1', 120).visible, false); assert.equal(cursors.moving(120), false);
  cursors.update(cursor('1', 5000), 200);
  assert.equal(point(cursors, '1', 200).x, 5000); assert.equal(cursors.moving(200), false);
});

test('packet age expires presence even while presentation is moving; document replacement clears it', () => {
  const cursors = new SharedCursors(); cursors.update(cursor('1', 100), 0); cursors.update(cursor('1', 1000), 100);
  assert.equal(cursors.expire(3100), false); assert.equal(cursors.expire(3101), true);
  assert.deepEqual([...cursors.values(3101)], []);
  cursors.update(cursor('2', 300), 4000); cursors.clear();
  assert.deepEqual([...cursors.values(4000)], []); assert.equal(cursors.moving(4000), false);
});

test('presentation never mutates received coordinates or accepts non-finite positions', () => {
  const cursors = new SharedCursors(), value = cursor('1', 100, 200);
  cursors.update(value, 0); cursors.update(cursor('1', 500, 700), 100); point(cursors, '1', 150);
  assert.deepEqual(value, cursor('1', 100, 200));
  cursors.update(cursor('2', NaN), 200); cursors.update(cursor('3', Infinity), 200);
  assert.equal([...cursors.values(200)].length, 1);
});
