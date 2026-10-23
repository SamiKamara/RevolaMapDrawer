// Optional version-2 project extension. Keys identify bundled game prefabs, never code or paths.
import { WEAPON_CATALOG } from './weapon-catalog.js';
export const OBJECT_CATEGORIES = ['npc', 'doors', 'crates', 'barrels', 'weapons', 'devices'];
export const WEAPONS = WEAPON_CATALOG.map(weapon => [weapon.key, weapon.label]);
export const NPC_WEAPONS = [...WEAPON_CATALOG.filter(weapon => weapon.npcCanUse).map(weapon => [weapon.key, weapon.label]), ['unarmed', 'Unarmed']];
export const MAX_PATROL_POINTS = 128;
const LEGACY_WEAPONS = ['UniGunpowderPistolGob', 'UniLaserAssaultgunGob', 'UniLaserShotgunGob'];
export const DEVICES = [
  ['OnGroundAmmoLoaderGob', 'Ammo loader'], ['OnGroundShieldGob', 'Shield'], ['OnGroundAimbotGob', 'Aimbot'],
  ['OnGroundBombSpawnerGob', 'Bomb spawner'], ['OnGroundInvisibilityGob', 'Invisibility'],
  ['OnGroundRocketBootsGob', 'Rocket boots'], ['OnGroundTeleporterGob', 'Teleporter'], ['OnGroundWarHornGob', 'War horn'],
];
export const OBJECT_TYPES = {
  npc: [['melee', 'Melee NPC'], ['ranged', 'Ranged NPC']],
  doors: [['auto', 'Automatic door type'], ['sliding', 'Sliding door'], ['hinged', 'Hinged door']], crates: [['', 'Empty'], ...WEAPONS, ...DEVICES],
  barrels: [['ExplosiveBarrelAGob', 'Explosive barrel']], weapons: WEAPONS, devices: DEVICES,
};
// Absent fields inherit generation defaults. Explicit false and zero are overrides.
export const NPC_FIELDS = [
  ['currentGeneralState', 'General state', 'state'], ['canSidestep', 'Can sidestep', 'bool'],
  ['chanceToSidestepOutOfHundred', 'Chance to sidestep (%)', 'number', 0, 100],
  ['canBackstep', 'Can backstep', 'bool'], ['canBackstepEvenWithMeleeWeapon', 'Can backstep with melee weapon', 'bool'],
  ['canBackstepEvenClose', 'Can backstep when close', 'bool'],
  ['ChanceToBackstepOutOfHundred', 'Chance to backstep (%)', 'number', 0, 100],
  ['stayFarAndFire', 'Stay far and fire', 'bool'], ['stayFarEvenWhenPlayerUnreachable', 'Stay far even when unreachable', 'bool'],
  ['myCurrentHitpoints', 'Current hitpoints', 'number', 0.01, 1000000], ['IgnoreIncomingSound', 'Ignore incoming sound', 'bool'],
  ['reduceIncomingSound', 'Reduce incoming sound', 'bool'], ['soundReductionMulti', 'Sound reduction multiplier', 'number', 1, 10],
  ['hearingRandomness', 'Hearing randomness', 'number', 0, 1], ['canSmell', 'Can smell', 'bool'],
  ['smellDistance', 'Smell distance (game units)', 'number', 0, 10000],
];
export function validateObjects(objects) {
  if (objects === undefined) return undefined;
  if (!Array.isArray(objects) || objects.length > 4096) throw new Error('Invalid or excessive gameplay objects (maximum 4096).');
  const ids = new Set();
  return objects.map(object => {
    if (!object || !/^[a-zA-Z0-9_-]{1,64}$/.test(object.id) || ids.has(object.id)) throw new Error('Invalid or duplicate object ID.');
    ids.add(object.id);
    // Previously saved spawns/loot remain readable, but are no longer offered.
    const legacyWeapon = ['weapons', 'crates'].includes(object.category) && LEGACY_WEAPONS.includes(object.type);
    if (!OBJECT_CATEGORIES.includes(object.category) || !legacyWeapon && !OBJECT_TYPES[object.category].some(([id]) => id === object.type)) throw new Error('Unknown gameplay object type.');
    if (![object.x, object.y, object.rotation].every(Number.isFinite) || Math.abs(object.x) > 100000 || Math.abs(object.y) > 100000 || Math.abs(object.rotation) > 360000) throw new Error('Invalid gameplay object position or rotation.');
    const result = { id: object.id, category: object.category, type: object.type, x: object.x, y: object.y, rotation: object.rotation };
    if (object.npcWeapon !== undefined) {
      if (object.category !== 'npc' || !NPC_WEAPONS.some(([key]) => key === object.npcWeapon)) throw new Error('Invalid NPC weapon.');
      result.npcWeapon = object.npcWeapon;
    }
    if (object.visualVariant !== undefined) {
      if (object.category !== 'npc' || !['male', 'female'].includes(object.visualVariant)) throw new Error('Invalid NPC visual variant.');
      result.visualVariant = object.visualVariant;
    }
    if (object.category === 'doors') {
      if (typeof object.doorId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(object.doorId)) throw new Error('A door object needs an opening ID.');
      result.doorId = object.doorId;
    }
    if (object.npc !== undefined) {
      if (object.category !== 'npc' || !object.npc || Array.isArray(object.npc) || typeof object.npc !== 'object') throw new Error('Invalid NPC overrides.');
      result.npc = {};
      for (const [key, , kind, min, max] of NPC_FIELDS) {
        const value = object.npc[key];
        if (value === undefined) continue;
        if (kind === 'bool' ? typeof value !== 'boolean' : kind === 'state' ? ![0, 1, 8].includes(value) : !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid NPC ${key}.`);
        result.npc[key] = value;
      }
    }
    if (object.patrolPoints !== undefined) {
      if (object.category !== 'npc' || result.npc?.currentGeneralState !== 8 || !Array.isArray(object.patrolPoints)
        || object.patrolPoints.length < 1 || object.patrolPoints.length > MAX_PATROL_POINTS) throw new Error(`Invalid manual patrol route (1–${MAX_PATROL_POINTS} points in Patrol state).`);
      result.patrolPoints = object.patrolPoints.map(point => {
        if (!point || ![point.x, point.y].every(Number.isFinite) || Math.abs(point.x) > 100000 || Math.abs(point.y) > 100000) throw new Error('Invalid manual patrol point.');
        return { x: point.x, y: point.y };
      });
    }
    return result;
  });
}
