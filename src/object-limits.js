// Editing limits are separate from the legacy source-format safety bound.
// Older projects still open intact, so their contents can be reduced safely.
export const OBJECT_LIMITS = Object.freeze({ npc: 99, barrels: 50, crates: 50, doors: 50, weapons: 50, devices: 50 });
export const OBJECT_NAMES = Object.freeze({ npc: 'NPCs', barrels: 'barrels', crates: 'crates', doors: 'doors', weapons: 'weapons', devices: 'devices' });
export function objectCounts(project) {
  const counts = Object.fromEntries(Object.keys(OBJECT_LIMITS).map(key => [key, 0]));
  for (const object of project?.objects ?? []) if (Object.prototype.hasOwnProperty.call(counts, object.category)) counts[object.category]++;
  return counts;
}
export class ObjectLimitError extends Error {
  constructor(category, count) {
    const limit = OBJECT_LIMITS[category];
    super(`You can place at most ${limit} ${OBJECT_NAMES[category]} in this map. Remove existing ${OBJECT_NAMES[category]} before adding more.`);
    this.issue = { code: 'object_limit', category, count, limit, message: this.message };
  }
}
export function checkObjectLimits(before, after) {
  const previous = objectCounts(before), next = objectCounts(after);
  for (const [category, limit] of Object.entries(OBJECT_LIMITS)) {
    if (next[category] > limit && (!before || next[category] > previous[category])) throw new ObjectLimitError(category, next[category]);
  }
}
