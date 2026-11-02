import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_LIMITS, objectCounts, checkObjectLimits } from '../src/object-limits.js';
import { createDocument } from '../src/model.js';
import { SharedDocumentAuthority, documentPatch } from '../src/shared-document.js';
const objects = (category, count) => Array.from({ length: count }, (_, index) => ({ id: `${category}${index}`, category,
  type: category === 'npc' ? 'melee' : category === 'weapons' ? 'UniSwordGob' : category === 'devices' ? 'OnGroundShieldGob' : '', x: 1000 + index * 50, y: 1000, rotation: 0 }));
for (const [category, maximum] of Object.entries(OBJECT_LIMITS)) test(`${category} permits exactly ${maximum} and rejects the next addition without changing either source`, () => {
  const before = { objects: objects(category, maximum) }, after = { objects: objects(category, maximum + 1) };
  checkObjectLimits(null, before);
  const unchanged = JSON.stringify([before, after]);
  assert.throws(() => checkObjectLimits(before, after), error => error.issue.category === category && error.issue.limit === maximum && /Remove existing/.test(error.message));
  assert.equal(JSON.stringify([before, after]), unchanged);
});
test('weapons and devices each have their own fifty-object allowance; all NPC types share ninety-nine', () => {
  const project = { objects: [...objects('weapons', 50), ...objects('devices', 50), ...objects('npc', 99).map((value, i) => ({ ...value, type: i % 2 ? 'ranged' : 'melee' }))] };
  checkObjectLimits(null, project); assert.equal(objectCounts(project).npc, 99);
  assert.throws(() => checkObjectLimits(project, { objects: [...project.objects, ...objects('npc', 1)] }));
});
test('over-limit legacy projects permit edits and deletions while rejecting a new increase', () => {
  const before = { objects: objects('npc', 120) }, next = structuredClone(before); next.objects[0].x++;
  checkObjectLimits(before, next); next.objects.pop(); checkObjectLimits(before, next);
  assert.throws(() => checkObjectLimits(before, { objects: objects('npc', 121) }));
});
test('concurrent shared additions compete for the last slot atomically and failed edit does not enter history', () => {
  const base = createDocument(); base.objects = objects('npc', 98); const host = new SharedDocumentAuthority(base);
  function add(author, y) { const next = structuredClone(base); next.objects.push({ ...objects('npc', 1)[0], id: 'new', y });
    return host.execute(author, { id: 1, revision: 0, action: 'edit', patch: documentPatch(base, next) }); }
  add('1', 2000); assert.equal(host.document.objects.length, 99);
  assert.throws(() => add('2', 3000), error => error.issue?.code === 'object_limit');
  assert.equal(host.document.objects.length, 99); assert.equal(host.revision, 1); assert.equal(host.state('2').canUndo, false);
  host.execute('1', { id: 2, revision: 1, action: 'undo' }); assert.equal(host.document.objects.length, 98);
  add('2', 3000); assert.equal(host.document.objects.length, 99);
});
