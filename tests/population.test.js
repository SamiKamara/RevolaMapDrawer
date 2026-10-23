import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, addWall, addDoor, validateDocument } from '../src/model.js';
import { generateFloor, renderFloorSvg } from '../src/floors.js';
import { renderMapSvg } from '../src/svg.js';
import { filterGameplayObjects } from '../src/objects.js';
import { generateDefaultObjects, defaultPopulationCount, objectGenerationGeometry, placementGeometry } from '../src/population.js';
import { PLACEMENT_DEFAULTS } from '../src/placement-defaults.js';
import { populationFixture } from '../scripts/population-fixture.mjs';

const options = { yieldControl: () => Promise.resolve() };
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
  assert.ok(result.counts.weapons > 0); assert.equal(result.targets.crates, 4); assert.equal(JSON.stringify(doc.objects), before);
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
test('new doors do not replace or sweep through an existing manual actor near an opening', async () => {
  const doc = populationFixture();
  doc.objects = [{ id: 'my-actor', category: 'npc', type: 'melee', x: 4096, y: 4340, rotation: 0 }];
  const result = await generateDefaultObjects(doc, options);
  assert.ok(result.skipped.includes('npc')); assert.ok(!result.objects.some(o => o.doorId === 'ship-outer-door'));
  assert.deepEqual(doc.objects.map(o => o.id), ['my-actor']);
});
test('generation does not add a category switch to old projects and cancelled runs do not mutate sources', async () => {
  const doc = populationFixture(), before = JSON.stringify(doc), signal = new AbortController();
  await assert.rejects(generateDefaultObjects(doc, { ...options, signal: signal.signal, onProgress: () => signal.abort() }), /cancelled/i);
  assert.equal(JSON.stringify(doc), before); assert.equal(validateDocument(doc).objectGeneration, undefined);
  await assert.rejects(generateDefaultObjects(createDocument(), options), /close the map/i);
});
test('audited defaults retain density limits, 70/20/10 loadouts and all canonical loot pools', async () => {
  assert.equal(defaultPopulationCount(1, 'npc'), 3); assert.equal(defaultPopulationCount(1000, 'npc'), 20);
  assert.equal(defaultPopulationCount(1000, 'weapons'), 4); assert.equal(defaultPopulationCount(1, 'devices'), 1);
  assert.equal(PLACEMENT_DEFAULTS.prefabs.filter(p => p.group === 'drops').length, 18);
  const result = await generateDefaultObjects(populationFixture(), options), npcs = result.objects.filter(o => o.category === 'npc');
  const actual = [npcs.filter(n => n.type === 'ranged').length, npcs.filter(n => n.type === 'melee' && n.npcWeapon !== 'unarmed').length, npcs.filter(n => n.npcWeapon === 'unarmed').length];
  assert.equal(actual.reduce((a, b) => a + b, 0), npcs.length); assert.ok(actual[0] > actual[1]); assert.ok(actual[2] > 0);
});
