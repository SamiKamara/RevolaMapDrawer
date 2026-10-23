import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, addWall, addDoor, validateDocument } from '../src/model.js';
import { generateFloor, renderFloorSvg, floorContainsPoint } from '../src/floors.js';
import { renderMapSvg } from '../src/svg.js';
import { filterGameplayObjects } from '../src/objects.js';
import { generateDefaultObjects, defaultPopulationCount, defaultRoomNpcCount, objectGenerationGeometry, placementGeometry } from '../src/population.js';
import { PLACEMENT_DEFAULTS } from '../src/placement-defaults.js';
import { populationFixture } from '../scripts/population-fixture.mjs';

const options = { yieldControl: () => Promise.resolve() };
function roomPopulationFixture() {
  const doc = populationFixture();
  addWall(doc, { x: 6500, y: 3000 }, { x: 7500, y: 3000 }, { joinTolerance: 0 });
  addWall(doc, { x: 2500, y: 500 }, { x: 2500, y: 3000 }, { joinTolerance: 0 });
  const edge = doc.edges.find(e => {
    const a = doc.vertices.find(v => v.id === e.a), b = doc.vertices.find(v => v.id === e.b);
    return a.x === 2500 && b.x === 2500;
  });
  addDoor(doc, edge.id, { x: 2500, y: 1500 });
  return doc;
}
test('default population is deterministic, editable, bounded, occluded, and absent from architecture exports', async () => {
  const doc = populationFixture(), before = JSON.stringify(doc), walls = renderMapSvg(doc), floor = generateFloor(doc), svg = renderFloorSvg(doc);
  const result = await generateDefaultObjects(doc, options);
  assert.equal(JSON.stringify(doc), before);
  assert.ok(result.counts.npc > 0); assert.ok(result.counts.weapons > 0); assert.ok(result.counts.devices > 0);
  assert.deepEqual(await generateDefaultObjects(doc, options), result);
  const output = validateDocument({ ...doc, objects: result.objects });
  assert.equal(filterGameplayObjects(output, floor).rejected.length, 0);
  assert.equal(renderMapSvg(output), walls); assert.equal(renderFloorSvg(output), svg);
  const query = placementGeometry(doc, floor), entry = doc.ship;
  for (const npc of output.objects.filter(o => o.category === 'npc')) {
    assert.ok(!query.line(entry, npc)); assert.ok(query.fits(npc, 141));
    assert.ok([0, 1, 8].includes(npc.npc.currentGeneralState)); assert.ok(npc.npcWeapon);
    if (npc.npc.currentGeneralState === 8) assert.ok(npc.patrolPoints.length >= 2);
  }
  for (const [group, target] of Object.entries(result.targets)) assert.ok((result.counts[group] ?? 0) <= target);
});
test('each valid manual category is preserved independently; invalid centers do not suppress defaults', async () => {
  const doc = populationFixture(), baseline = await generateDefaultObjects(doc, options);
  const example = baseline.objects.find(o => o.category === 'npc');
  doc.objects = [{ ...example, id: 'mine', npc: { currentGeneralState: 0 }, patrolPoints: undefined }, { id: 'invalid', category: 'crates', type: '', x: 0, y: 0, rotation: 0 }];
  const before = JSON.stringify(doc.objects), result = await generateDefaultObjects(doc, options);
  assert.equal(result.objects.some(o => o.category === 'npc'), false); assert.deepEqual(result.skipped, ['npc']);
  assert.ok(result.counts.weapons > 0); assert.ok([4, 5].includes(result.targets.crates)); assert.equal(JSON.stringify(doc.objects), before);
  const complete = { ...doc, objects: baseline.objects };
  const second = await generateDefaultObjects(complete, options);
  for (const category of new Set(baseline.objects.map(o => o.category))) assert.equal(second.objects.some(o => o.category === category), false);
});
test('generation history round-trips, detects geometry changes, and ignores names/object edits', async () => {
  const doc = populationFixture(), signature = await objectGenerationGeometry(doc);
  doc.objectGeneration = { version: 1, geometry: signature };
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))).objectGeneration, doc.objectGeneration);
  doc.name = 'Renamed'; doc.objects = [];
  assert.equal(await objectGenerationGeometry(doc), signature);
  addWall(doc, { x: 500, y: 6000 }, { x: 2000, y: 6000 }, { joinTolerance: 0 });
  assert.notEqual(await objectGenerationGeometry(doc), signature);
  for (const stamp of [null, {}, { version: 2, geometry: signature }, { version: 1, geometry: 'bad' }])
    assert.throws(() => validateDocument({ ...doc, objectGeneration: stamp }), /generation history/i);
});
test('a movable manual NPC near an opening does not suppress its generated door', async () => {
  const doc = populationFixture();
  doc.objects = [{ id: 'my-actor', category: 'npc', type: 'melee', x: 4096, y: 4340, rotation: 0 }];
  const result = await generateDefaultObjects(doc, options);
  assert.ok(result.skipped.includes('npc')); assert.ok(result.objects.some(o => o.doorId === 'ship-outer-door'));
  assert.deepEqual(doc.objects.map(o => o.id), ['my-actor']);
});

test('dense automatic NPCs need only their physical bodies between one another', async () => {
  const doc = populationFixture(), defaults = structuredClone(PLACEMENT_DEFAULTS);
  defaults.density.npc.minimum = defaults.density.npc.maximum = 100;
  const result = await generateDefaultObjects(doc, { ...options, defaults });
  const npcs = result.objects.filter(o => o.category === 'npc'), body = defaults.prefabs.find(p => p.group === 'npc').radius / defaults.unitsPerPixel;
  assert.equal(npcs.length, 85);
  let closest = Infinity;
  for (let i = 0; i < npcs.length; i++) for (let j = i + 1; j < npcs.length; j++) {
    const distance = Math.hypot(npcs[i].x - npcs[j].x, npcs[i].y - npcs[j].y);
    assert.ok(distance >= body * 2, 'Physical NPC bodies never overlap');
    closest = Math.min(closest, distance);
  }
  assert.ok(closest < body * 2 + 50, 'Adjacent bodies fit without the old door-width spacing buffer');
});

test('every automatic non-door category stays outside the ship in both facings', async () => {
  for (const mirrored of [false, true]) {
    const doc = populationFixture(); doc.ship.mirrored = mirrored;
    const before = JSON.stringify(doc), floor = generateFloor(doc), result = await generateDefaultObjects(doc, options);
    for (const group of ['npc', 'weapons', 'devices', 'crates', 'barrels']) {
      const objects = result.objects.filter(o => o.category === group);
      assert.ok(objects.length > 0, `${group} still generates on the station`);
      assert.ok(objects.every(o => floor.shipPolygons.every(ring => !floorContainsPoint(ring, o))), `${group} never generates inside the ship`);
    }
    assert.equal(JSON.stringify(doc), before);
  }
  const doc = populationFixture();
  doc.objects = [{ id: 'manual-ship-device', category: 'devices', type: 'OnGroundAimbotGob', x: doc.ship.x, y: doc.ship.y + 1060, rotation: 42 }];
  const result = await generateDefaultObjects(doc, options);
  assert.ok(result.skipped.includes('devices'));
  assert.deepEqual(doc.objects.map(o => [o.id, o.rotation]), [['manual-ship-device', 42]], 'The exclusion is automatic; existing authored objects remain intact');
});
test('generation does not add a category switch to old projects and cancelled runs do not mutate sources', async () => {
  const doc = populationFixture(), before = JSON.stringify(doc), signal = new AbortController();
  await assert.rejects(generateDefaultObjects(doc, { ...options, signal: signal.signal, onProgress: () => signal.abort() }), /cancelled/i);
  assert.equal(JSON.stringify(doc), before); assert.equal(validateDocument(doc).objectGeneration, undefined);
  await assert.rejects(generateDefaultObjects(createDocument(), options), /close the map/i);
});
test('audited defaults retain density limits, 70/20/10 loadouts and all canonical loot pools', async () => {
  assert.equal(defaultPopulationCount(1, 'npc'), 4); assert.equal(defaultPopulationCount(1000, 'npc'), 22);
  assert.equal(defaultPopulationCount(1000, 'weapons'), 4); assert.equal(defaultPopulationCount(1, 'devices'), 1);
  assert.equal(PLACEMENT_DEFAULTS.prefabs.filter(p => p.group === 'drops').length, 18);
  const result = await generateDefaultObjects(populationFixture(), options), npcs = result.objects.filter(o => o.category === 'npc');
  const actual = [npcs.filter(n => n.type === 'ranged').length, npcs.filter(n => n.type === 'melee' && n.npcWeapon !== 'unarmed').length, npcs.filter(n => n.npcWeapon === 'unarmed').length];
  assert.equal(actual.reduce((a, b) => a + b, 0), npcs.length); assert.ok(actual[0] > actual[1]); assert.ok(actual[2] > 0);
});
test('room preferences reach six at a useful area, and only smaller rooms can roll empty', () => {
  assert.deepEqual([1, 2, 3, 5.39, 25, 100].map(area => defaultRoomNpcCount(area)), [2, 2, 4, 6, 6, 6]);
  assert.equal(defaultRoomNpcCount(2, PLACEMENT_DEFAULTS, .14999), 0);
  assert.equal(defaultRoomNpcCount(2, PLACEMENT_DEFAULTS, .15), 2);
  assert.equal(defaultRoomNpcCount(5.39, PLACEMENT_DEFAULTS, 0), 6, 'a substantial room must not disappear into the small-room empty roll');
  assert.equal(defaultRoomNpcCount(25, PLACEMENT_DEFAULTS, 0), 6);
  assert.equal(defaultRoomNpcCount(0), 0); assert.equal(defaultRoomNpcCount(-1), 0);
  const sixMaximum = structuredClone(PLACEMENT_DEFAULTS); sixMaximum.density.npc.maximum = 6;
  assert.equal(defaultRoomNpcCount(25, sixMaximum, 0), 6, 'the global 0.85 ceiling must not turn a nominal six-NPC room into a small room');
  const disabled = structuredClone(PLACEMENT_DEFAULTS); disabled.density.npc.maximum = 0;
  assert.equal(defaultRoomNpcCount(25, disabled), 0);
  const fixed = structuredClone(PLACEMENT_DEFAULTS); fixed.density.npc.minimum = fixed.density.npc.maximum = 10;
  assert.equal(defaultRoomNpcCount(25, fixed, 0), 9);
});
test('twenty-percent prop increase survives saturated caps and stochastic integer rounding', () => {
  const average = category => Array.from({ length: 100 }, (_, i) => defaultPopulationCount(1000, category, PLACEMENT_DEFAULTS, (i + .5) / 100)).reduce((a, b) => a + b, 0) / 100;
  assert.equal(average('crates'), 4.8); assert.equal(average('barrels'), 2.4);
  const fixed = structuredClone(PLACEMENT_DEFAULTS); fixed.density.barrels.minimum = fixed.density.barrels.maximum = 2;
  assert.equal(defaultPopulationCount(1000, 'barrels', fixed, 0), 2);
  fixed.density.barrels.minimum = fixed.density.barrels.maximum = 0;
  assert.equal(defaultPopulationCount(1000, 'barrels', fixed, 0), 0);
});
test('room preferences distribute NPCs before recovering the global area budget in rooms with capacity', async () => {
  const doc = roomPopulationFixture(), result = await generateDefaultObjects(doc, options);
  const populated = result.rooms.filter(room => room.target).sort((a, b) => a.area - b.area);
  assert.deepEqual(populated.map(room => room.target), [5, 6, 6]);
  assert.ok(populated.every(room => room.count >= room.target), 'small rooms get their own quota before overflow');
  assert.equal(result.counts.npc, defaultPopulationCount(result.area, 'npc'));
  assert.equal(result.counts.npc, 22, 'room balancing must retain the old area budget plus ten percent');
  const policy = structuredClone(PLACEMENT_DEFAULTS); policy.populationPolicy.emptySmallRoomChance = 1;
  const empty = await generateDefaultObjects(doc, { ...options, defaults: policy });
  assert.ok(empty.rooms.filter(room => room.target === 0).every(room => room.count === 0));
  assert.equal(empty.rooms.find(room => room.area > 4 && room.area < 5).count, 0);
  assert.equal(empty.counts.npc, 22, 'an intentional empty small room must shift the remaining area budget to active rooms');
  const fixed = structuredClone(PLACEMENT_DEFAULTS); fixed.density.npc.minimum = fixed.density.npc.maximum = 10;
  const legacy = await generateDefaultObjects(doc, { ...options, defaults: fixed });
  assert.equal(legacy.targets.npc, 9); assert.equal(legacy.counts.npc, 9);
});
test('automatic NPC totals stay above the legacy area target while fixed counts keep their explicit tuning', () => {
  for (const area of [0.5, 2, 5.39, 17.44, 24, 80]) {
    const rule = PLACEMENT_DEFAULTS.density.npc;
    const legacy = Math.floor(Math.max(rule.minimum, Math.min(rule.maximum, area * rule.perWorldSquareUnit)) * PLACEMENT_DEFAULTS.npcCountMultiplier + .5);
    assert.ok(defaultPopulationCount(area, 'npc') >= legacy);
  }
  const fixed = structuredClone(PLACEMENT_DEFAULTS); fixed.density.npc.minimum = fixed.density.npc.maximum = 10;
  assert.equal(defaultPopulationCount(100, 'npc', fixed), 9);
  fixed.density.npc = { minimum: 0, maximum: 8, perWorldSquareUnit: 0 };
  assert.equal(defaultPopulationCount(12, 'npc', fixed), 0);
  fixed.density.npc = { minimum: 4, maximum: 0, perWorldSquareUnit: 1 };
  assert.equal(defaultPopulationCount(12, 'npc', fixed), 0);
  assert.equal(defaultPopulationCount(0, 'npc'), 0);
});
test('no safe NPC room retains a capacity target while intentional empty rooms remain empty', async () => {
  const doc = populationFixture(), before = JSON.stringify(doc), unsafe = structuredClone(PLACEMENT_DEFAULTS);
  unsafe.safety.npcEntryDistanceInOpeningWidths = 100;
  const shortfall = await generateDefaultObjects(doc, { ...options, defaults: unsafe });
  assert.ok(shortfall.targets.npc > 0); assert.equal(shortfall.counts.npc ?? 0, 0);
  assert.equal(JSON.stringify(doc), before);
  const intentional = structuredClone(PLACEMENT_DEFAULTS);
  intentional.density.npc.perWorldSquareUnit = .05; intentional.populationPolicy.emptySmallRoomChance = 1;
  const empty = await generateDefaultObjects(doc, { ...options, defaults: intentional });
  assert.equal(empty.targets.npc, 0); assert.equal(empty.counts.npc ?? 0, 0);
  assert.equal(JSON.stringify(doc), before);
});
test('generated props face random directions, and NPC deviations remain valid independent overrides', async () => {
  const doc = roomPopulationFixture(), defaults = structuredClone(PLACEMENT_DEFAULTS);
  defaults.populationPolicy.npcVariationChance = 1;
  const result = await generateDefaultObjects(doc, { ...options, defaults }), keys = ['IgnoreIncomingSound', 'stayFarAndFire', 'stayFarEvenWhenPlayerUnreachable'];
  for (const group of ['crates', 'barrels', 'weapons', 'devices']) {
    const props = result.objects.filter(o => o.category === group);
    assert.ok(props.length > 1); assert.ok(props.every(p => p.rotation > 0 && p.rotation < 360));
    assert.ok(new Set(props.map(p => p.rotation)).size > 1);
  }
  const npcs = result.objects.filter(o => o.category === 'npc');
  for (const npc of npcs) assert.ok(keys.every(key => npc.npc[key] === true));
  const roundTrip = validateDocument(JSON.parse(JSON.stringify({ ...doc, objects: result.objects })));
  assert.ok(roundTrip.objects.filter(o => o.category === 'npc').every(o => keys.every(key => o.npc[key] === true)));
  defaults.populationPolicy.npcVariationChance = 0;
  const ordinary = await generateDefaultObjects(doc, { ...options, defaults });
  assert.ok(ordinary.objects.filter(o => o.category === 'npc').every(o => keys.every(key => !(key in o.npc))));
});
test('occasional compact prop piles retain complete collision footprints and all floor clearances', async () => {
  const doc = populationFixture(), defaults = structuredClone(PLACEMENT_DEFAULTS);
  defaults.populationPolicy.propClusterChance = 1;
  defaults.density.npc.maximum = 0;
  const result = await generateDefaultObjects(doc, { ...options, defaults });
  const query = placementGeometry(doc, generateFloor(doc));
  const props = result.objects.filter(o => ['crates', 'barrels'].includes(o.category));
  const radius = prop => defaults.prefabs.find(p => p.group === prop.category).radius / defaults.unitsPerPixel;
  for (const group of ['crates', 'barrels']) {
    const props = result.objects.filter(o => o.category === group), r = defaults.prefabs.find(p => p.group === group).radius / defaults.unitsPerPixel;
    assert.ok(props.every(p => query.fits(p, r + 10)));
    let adjacent = false;
    for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) {
      const distance = Math.hypot(props[i].x - props[j].x, props[i].y - props[j].y);
      assert.ok(distance > 2 * r + 50);
      if (Math.abs(distance - (2 * r + 51)) < 1e-6) adjacent = true;
    }
    if (group === 'crates') assert.ok(adjacent, 'crates have a collision-safe neighbor in their pile');
  }
  assert.ok(props.some(a => a.category === 'barrels' && props.some(b => b.category === 'crates'
    && Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - (radius(a) + radius(b) + 51)) < 1e-6)), 'a barrel can join a crate pile');
  for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++)
    assert.ok(Math.hypot(props[i].x - props[j].x, props[i].y - props[j].y) > radius(props[i]) + radius(props[j]) + 50);
});
