import test from 'node:test';
import assert from 'node:assert/strict';
import { setupObjectGeneration } from '../src/population-ui.js';
import { generateFloor } from '../src/floors.js';
import { objectGenerationGeometry } from '../src/population.js';
import { populationFixture } from '../scripts/population-fixture.mjs';

class Element extends EventTarget {
  disabled = false;
  open = false;
  returnValue = '';
  children = new Map();
  querySelector(selector) { return this.children.get(selector); }
  showModal() { this.open = true; }
  close(value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')); }
  click() { this.dispatchEvent(new Event('click')); }
}
const until = async predicate => {
  const deadline = Date.now() + 20000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Object-generation UI did not settle.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};
function fixture(t) {
  const button = new Element(), confirm = new Element(), progress = new Element();
  for (const selector of ['progress', '[role=status]', 'button']) progress.children.set(selector, new Element());
  const elements = { 'generate-objects': button, 'object-regenerate-dialog': confirm, 'object-generation-progress': progress };
  const previous = globalThis.document;
  globalThis.document = { getElementById: id => elements[id] };
  t.after(() => { globalThis.document = previous; });
  let doc = populationFixture(), floor = generateFloor(doc), busy = false;
  doc.objects = [{ id: 'legacy-npc', category: 'npc', type: 'ranged', x: 1200, y: 1400, rotation: 0 }];
  const history = [], statuses = [];
  const ui = setupObjectGeneration({ doc: () => doc, floor: () => floor, blocked: () => busy,
    setBusy: value => { busy = value; }, status: message => statuses.push(message), clearSelection() {},
    commit(operation, message) { history.push(JSON.stringify(doc)); operation(); statuses.push(message); ui.update(); } });
  const replace = next => { doc = next; floor = generateFloor(doc); ui.update(); };
  ui.update();
  return { button, confirm, progress, ui, history, statuses, doc: () => doc, replace };
}

test('expanding an unstamped map replaces preserved categories after confirmation and remains undoable', async t => {
  const f = fixture(t), initial = JSON.stringify(f.doc());
  // Room resizing uses a replacement preview document, rather than mutating
  // the original instance. The remembered baseline must survive this path.
  const expanded = structuredClone(f.doc());
  expanded.vertices.filter(v => v.x === 7500).forEach(v => v.x = 8500);
  expanded.width = expanded.height = 16384; expanded.originX = expanded.originY = -4096;
  f.replace(expanded);
  const before = JSON.stringify(f.doc());
  f.button.click(); await until(() => f.confirm.open);
  f.confirm.close('cancel'); await until(() => !f.button.disabled);
  assert.equal(JSON.stringify(f.doc()), before); assert.equal(f.history.length, 0);
  f.button.click(); await until(() => f.confirm.open); f.confirm.close('regenerate');
  await until(() => f.history.length === 1 && !f.button.disabled);
  assert.ok(!f.doc().objects.some(o => o.id === 'legacy-npc'));
  assert.ok(f.doc().objects.some(o => o.category === 'npc')); assert.ok(f.doc().objectGeneration);
  const regenerated = JSON.stringify(f.doc());
  f.replace(JSON.parse(f.history[0])); assert.equal(JSON.stringify(f.doc()), before);
  f.button.click(); await until(() => f.confirm.open); f.confirm.close('cancel'); await until(() => !f.button.disabled);
  assert.equal(JSON.stringify(f.doc()), before, 'Undo retains the legacy replacement decision');
  f.replace(JSON.parse(regenerated)); assert.equal(JSON.stringify(f.doc()), regenerated);
  assert.notEqual(before, initial);
});

test('initial generation keeps manual categories and opening another legacy map resets its baseline', async t => {
  const f = fixture(t), initialNpc = structuredClone(f.doc().objects[0]);
  f.button.click(); await until(() => f.history.length === 1 && !f.button.disabled);
  assert.ok(!f.confirm.open); assert.deepEqual(f.doc().objects.filter(o => o.category === 'npc'), [initialNpc]);
  const another = populationFixture(); another.vertices.filter(v => v.x === 7500).forEach(v => v.x = 7000);
  another.objects = [{ ...initialNpc, id: 'other-manual-npc' }];
  const otherNpc = structuredClone(another.objects[0]);
  f.replace(another); f.ui.reset();
  f.button.click(); await until(() => f.history.length === 2 && !f.button.disabled);
  assert.ok(!f.confirm.open); assert.deepEqual(f.doc().objects.filter(o => o.category === 'npc'), [otherNpc]);
});

test('a previous population policy stamp confirms replacement even with unchanged geometry', async t => {
  const f = fixture(t), doc = f.doc();
  const oldInput = [doc.width, doc.height, doc.originX, doc.originY, doc.ship, doc.seed, doc.style, doc.vertices, doc.edges];
  const bytes = new TextEncoder().encode(JSON.stringify(oldInput));
  const oldGeometry = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  doc.objectGeneration = { version: 1, geometry: oldGeometry }; f.ui.update();
  const before = JSON.stringify(doc), architecture = JSON.stringify([doc.vertices, doc.edges]);
  f.button.click(); await until(() => f.confirm.open); f.confirm.close('regenerate');
  await until(() => f.history.length === 1 && !f.button.disabled);
  assert.ok(!doc.objects.some(o => o.id === 'legacy-npc'));
  assert.equal(doc.objectGeneration.geometry, await objectGenerationGeometry(doc));
  assert.notEqual(doc.objectGeneration.geometry, oldGeometry);
  assert.equal(JSON.stringify([doc.vertices, doc.edges]), architecture);
  assert.equal(f.history[0], before);
});

test('changing the source during asynchronous preparation or confirmation cannot apply stale objects', async t => {
  const f = fixture(t);
  f.button.click();
  const changed = structuredClone(f.doc()); changed.name = 'A different map'; f.replace(changed);
  await until(() => !f.button.disabled);
  assert.equal(f.history.length, 0); assert.ok(!f.confirm.open); assert.ok(!f.progress.open);
  assert.ok(f.statuses.some(message => message.includes('map changed')));
  changed.vertices.filter(v => v.x === 7500).forEach(v => v.x = 7000); f.replace(changed);
  f.button.click(); await until(() => f.confirm.open);
  const another = structuredClone(changed); another.name = 'Changed during confirmation'; f.replace(another);
  f.confirm.close('regenerate'); await until(() => !f.button.disabled);
  assert.equal(f.history.length, 0); assert.deepEqual(f.doc().objects, changed.objects);
});
