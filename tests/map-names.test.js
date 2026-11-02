import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_NAME_VARIANTS, mapNameAt, assignMapName, randomMapName } from '../src/map-names.js';
test('over ten thousand unique safe space station names include the requested styles', () => {
  const names = new Set(Array.from({ length: MAP_NAME_VARIANTS }, (_, i) => mapNameAt(i)));
  assert.equal(names.size, MAP_NAME_VARIANTS); assert.ok(names.size >= 10000);
  assert.ok(names.has('Starseed Station')); assert.ok(names.has('Blue Dust Outpost'));
  for (const name of names) assert.match(name, /^[A-Za-z ]{1,80}$/);
});
test('unnamed sources receive one persistent name and authored names stay literal', () => {
  const p = { name: '' }; assignMapName(p); const value = p.name; assignMapName(p); assert.equal(p.name, value);
  const custom = { name: 'Minun asema 日本語' }; assignMapName(custom); assert.equal(custom.name, 'Minun asema 日本語');
  assert.equal(randomMapName(() => 0), mapNameAt(0)); assert.equal(randomMapName(() => .999999), mapNameAt(MAP_NAME_VARIANTS - 1));
});
