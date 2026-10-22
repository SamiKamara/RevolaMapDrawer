import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, addDoor, ensureCanvasContains, validateDocument } from '../src/model.js';
import { validateObjects, WEAPONS, NPC_WEAPONS, OBJECT_TYPES } from '../src/object-schema.js';
import { WEAPON_CATALOG } from '../src/weapon-catalog.js';
import { chooseNpcVisual, objectVisualKey } from '../src/object-visuals.js';
import { OBJECT_VECTORS } from '../src/object-vectors.js';
import { NPC_DEFAULTS } from '../src/npc-defaults.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { generateFloor, renderFloorSvg } from '../src/floors.js';
import { renderMapSvg } from '../src/svg.js';
import { filterGameplayObjects, gameplayPointIsPlayable, objectPosition, objectDoorSnap, objectDoorTargets } from '../src/objects.js';

function fixture() {
  const doc = createDocument();
  doc.vertices = [{ id: 'a', x: 500, y: 500 }, { id: 'b', x: 7500, y: 500 }, { id: 'c', x: 7500, y: 7500 }, { id: 'd', x: 500, y: 7500 }];
  doc.edges = ['ab', 'bc', 'cd', 'da'].map(([a, b]) => ({ id: a + b, a, b, doors: [], gaps: [] }));
  return doc;
}
const object = (id, category, type, x = 2000, y = 2000) => ({ id, category, type, x, y, rotation: 45 });

test('manual patrol routes preserve ordered absolute source points through projects, expansion and metadata without changing exports', () => {
  const doc = fixture(), walls = renderMapSvg(doc), floorSvg = renderFloorSvg(doc);
  const npc = { ...object('patroller', 'npc', 'ranged'), npc: { currentGeneralState: 8, canSmell: false }, patrolPoints: [{ x: 2500, y: 2300 }, { x: 1700, y: 1600 }, { x: 2100, y: 2400 }] };
  doc.objects = [npc];
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))).objects, [npc]);
  assert.equal(renderMapSvg(doc), walls); assert.equal(renderFloorSvg(doc), floorSvg);
  const points = structuredClone(npc.patrolPoints); ensureCanvasContains(doc, [{ x: -200, y: 1000 }]);
  assert.deepEqual(validateDocument(doc).objects[0].patrolPoints, points);
  for (const patrolPoints of [[points[0]], Array.from({ length: 128 }, () => points[0])])
    assert.deepEqual(validateObjects([{ ...npc, patrolPoints }])[0].patrolPoints, patrolPoints);
  for (const patrolPoints of [null, [], Array(129).fill(points[0]), [{ x: NaN, y: 3 }], [{ x: 100001, y: 1 }], [null]])
    assert.throws(() => validateObjects([{ ...npc, patrolPoints }]), /patrol/i);
  assert.throws(() => validateObjects([{ ...npc, npc: { currentGeneralState: 0 } }]), /patrol/i);
  assert.throws(() => validateObjects([{ ...object('crate', 'crates', ''), patrolPoints: points }]), /patrol/i);
  const floor = generateFloor(doc);
  assert.ok(gameplayPointIsPlayable(doc, floor, points[0]));
  assert.equal(gameplayPointIsPlayable(doc, floor, { x: 500, y: 2000 }), false);
  assert.equal(gameplayPointIsPlayable(doc, floor, { x: 100, y: 2000 }), false);
  assert.equal(gameplayPointIsPlayable(doc, null, points[0]), false);
});
test('legacy projects stay byte-for-byte structurally identical; optional objects retain partial false/zero overrides', () => {
  const doc = fixture(); assert.deepEqual(validateDocument(doc), doc);
  doc.objects = [object('npc1', 'npc', 'ranged')]; doc.objects[0].npc = { canSidestep: false, chanceToSidestepOutOfHundred: 0, currentGeneralState: 8 };
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  ensureCanvasContains(doc, [{ x: -200, y: 1000 }]); assert.deepEqual(validateDocument(doc).objects, doc.objects);
});
test('center filtering excludes exterior, white wall, decorative ship voids and overlapping centers while allowing close walls and neighbors', () => {
  const doc = fixture(); doc.objects = [object('nearwall', 'crates', '', 535, 1000), object('nearby', 'barrels', 'ExplosiveBarrelAGob', 585, 1000),
    object('wall', 'npc', 'melee', 500, 2000), object('outside', 'npc', 'ranged', 100, 2000), object('overlap', 'weapons', 'UniSwordGob', 536, 1000),
    object('cockpit', 'devices', 'OnGroundShieldGob', 5150, 5800)];
  const result = filterGameplayObjects(doc, generateFloor(doc));
  assert.deepEqual(result.accepted.map(item => item.id), ['nearwall', 'nearby']); assert.equal(result.rejected.length, 4);
});
test('all supported objects and overrides stay out of architecture SVG output', () => {
  const doc = fixture(), walls = renderMapSvg(doc), floor = renderFloorSvg(doc);
  doc.objects = [object('npc1', 'npc', 'ranged'), object('box', 'crates', ''), object('barrel', 'barrels', 'ExplosiveBarrelAGob'), object('gun', 'weapons', 'UniLaserPistolGob'), object('device', 'devices', 'OnGroundShieldGob')];
  assert.equal(renderMapSvg(doc), walls); assert.equal(renderFloorSvg(doc), floor);
});
test('door objects follow stable opening IDs through geometry changes and stale openings are excluded', () => {
  const doc = fixture(); doc.vertices.push({ id: 'e', x: 1000, y: 3000 }, { id: 'f', x: 6500, y: 3000 });
  doc.edges.push({ id: 'ef', a: 'e', b: 'f', doors: [], gaps: [] }); addDoor(doc, 'ef', { x: 3000, y: 3000 });
  const id = doc.edges.at(-1).doors[0].id;
  doc.objects = [{ ...object('door', 'doors', 'auto', 0, 0), doorId: id }];
  assert.equal(filterGameplayObjects(doc, generateFloor(doc)).accepted.length, 1);
  doc.edges.at(-1).doors[0].t = .6; assert.equal(objectPosition(doc, doc.objects[0]).x, 4300);
  doc.edges.at(-1).doors = []; assert.equal(filterGameplayObjects(doc, generateFloor(doc)).rejected.length, 1);
});

test('door snap previews resolve the same center, occupancy and moving-instance exemption for all opening orientations', () => {
  const doc = fixture();
  for (const [index, end] of [{x:6500,y:3000},{x:1000,y:6500},{x:4500,y:6500}].entries()) {
    doc.vertices.push({id:'p'+index,x:1000,y:3000},{id:'q'+index,...end});
    const edge = {id:'line'+index,a:'p'+index,b:'q'+index,doors:[{id:'opening'+index,t:.5}],gaps:[]}; doc.edges.push(edge);
  }
  for (const target of objectDoorTargets(doc)) {
    const point = {x:target.point.x+30,y:target.point.y+20};
    const snap = objectDoorSnap(doc,point,100);
    assert.equal(snap.id,target.id); assert.deepEqual(snap.point,target.point); assert.equal(snap.occupied,false);
    doc.objects = [{...object('placed','doors','hinged'),doorId:target.id}];
    assert.equal(objectDoorSnap(doc,point,100).occupied,true);
    assert.equal(objectDoorSnap(doc,point,100,'placed').occupied,false); doc.objects=[];
  }
  assert.equal(objectDoorSnap(doc,{x:-10000,y:-10000},200),null);
  for (const type of ['auto','sliding','hinged']) {
    const door = {...object('door','doors',type),doorId:'opening0'};
    assert.deepEqual(validateObjects([door]),[door]);
  }
  assert.equal(objectVisualKey(object('door','doors','hinged')),'door-hinged');
  assert.throws(()=>validateObjects([{...object('door','doors','other'),doorId:'opening0'}]),/Unknown/);
});
test('untrusted object data is bounded and reconstructed without unknown keys', () => {
  assert.throws(() => validateObjects(Array(4097).fill({})), /maximum/);
  assert.throws(() => validateObjects([object('a', 'weapons', '../../script')]), /Unknown/);
  assert.throws(() => validateObjects([{ ...object('a', 'npc', 'melee'), npc: { currentGeneralState: 4 } }]), /Invalid NPC/);
  const clean = validateObjects([{ ...object('a', 'npc', 'melee'), npc: { canSidestep: false, unknown: true }, code: 'x' }]);
  assert.deepEqual(clean[0].npc, { canSidestep: false }); assert.equal(clean[0].code, undefined);
});

test('NPC weapon overrides and stable editor gender are optional, bounded and retained by save/reopen', () => {
  const npc = { ...object('npc', 'npc', 'melee'), npcWeapon: 'UniLaserPistolGob', visualVariant: chooseNpcVisual(() => .499) };
  assert.equal(npc.visualVariant, 'female'); assert.equal(chooseNpcVisual(() => .5), 'male');
  assert.deepEqual(validateObjects(JSON.parse(JSON.stringify([npc]))), [npc]);
  assert.equal(validateObjects([object('default', 'npc', 'ranged')])[0].npcWeapon, undefined);
  for (const patch of [{ npcWeapon:'UniGunpowderPistolGob' }, { npcWeapon:'UniLaserAssaultgunGob' }, { npcWeapon:'UniLaserShotgunGob' }, { npcWeapon:'../../bad' }, { visualVariant:'bad' }])
    assert.throws(() => validateObjects([{ ...npc, ...patch }]), /Invalid NPC/);
  assert.throws(() => validateObjects([{ ...object('crate','crates',''), npcWeapon:'UniSwordGob' }]), /Invalid NPC/);
});

test('retired weapons stay readable without appearing in any new placement or NPC weapon list', () => {
  assert.equal(WEAPONS.find(([key]) => key === 'UniLaserPistolGob')[1], 'S7 Suppressed Pistol');
  for (const key of ['UniGunpowderPistolGob','UniLaserAssaultgunGob','UniLaserShotgunGob']) {
    assert.ok(!WEAPONS.some(([value]) => value === key)); assert.ok(!OBJECT_TYPES.crates.some(([value]) => value === key));
    const legacy = object('old','weapons',key); assert.deepEqual(validateObjects([legacy]), [legacy]);
    assert.ok(OBJECT_VECTORS[objectVisualKey(legacy)]);
  }
});

test('all shop weapons use the same English names across pickups, crate loot and usable NPC weapons', () => {
  const expected = [
    ['UniLaserPistolGob','S7 Suppressed Pistol'], ['UniPlasmaShotgunGob','S44 Ricochet Shotgun'],
    ['UniLauncherGob','Storm Rocket Launcher'], ['UniGunpowderUziGob','Uzi model C14'],
    ['UniRailgunGob','Dragonslayer Railgun'], ['UniSwordGob','Plainsteel Sword'],
    ['UniKatanaGob','Ashigaru Katana'], ['AssaultRifleGob','Ravager Assault Gun'],
    ['LaserRifleCopyGob','LAF Laser Rifle'], ['UniRicochetPistolGob','S66 Ricochet Pistol'],
  ];
  assert.deepEqual(WEAPONS, expected);
  assert.deepEqual(NPC_WEAPONS, expected);
  assert.deepEqual(OBJECT_TYPES.crates.slice(1, 1 + expected.length), expected);
  const doc = fixture(); doc.objects = expected.flatMap(([key], i) => [object('pickup'+i,'weapons',key), object('loot'+i,'crates',key), { ...object('npc'+i,'npc','ranged'), npcWeapon:key }]);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  const provenance = JSON.parse(fs.readFileSync(new URL('../assets/object-vectors/provenance.json', import.meta.url)));
  assert.deepEqual(provenance.weaponCatalog, WEAPON_CATALOG);
  assert.ok(Object.keys(provenance.catalogSources).some(path => path.endsWith('revola_eng.tsv')));
});

test('every selectable gameplay visual uses traced black/white vector paths and matching SVG source bytes', () => {
  const provenance = JSON.parse(fs.readFileSync(new URL('../assets/object-vectors/provenance.json', import.meta.url)));
  for (const key of [...WEAPONS.map(([key]) => key), ...OBJECT_TYPES.devices.map(([key]) => key), 'npc-male','npc-female','crate','barrel','door','door-hinged']) {
    const vector = OBJECT_VECTORS[key]; assert.ok(vector?.extent > 0 && vector.paths.every(path => path.d.startsWith('M') && ['#000','#fff'].includes(path.fill)), key);
    const svg = fs.readFileSync(new URL(`../assets/object-vectors/${key}.svg`, import.meta.url));
    assert.equal(crypto.createHash('sha256').update(svg.toString().replaceAll('\r\n', '\n')).digest('hex'), provenance.visuals[key].svgSha256);
    assert.ok(!/image|data:|https?:\/\/(?!www.w3.org)/.test(svg.toString()));
  }
  assert.notDeepEqual(OBJECT_VECTORS['npc-male'].paths, OBJECT_VECTORS['npc-female'].paths);
  assert.equal(NPC_DEFAULTS.canSidestep, true); assert.equal(NPC_DEFAULTS.chanceToSidestepOutOfHundred, 40.5);
  assert.equal(NPC_DEFAULTS.myCurrentHitpoints, 1.5); assert.equal(NPC_DEFAULTS.soundReductionMulti, 2.52);
});
