import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';
import { SharedDocumentAuthority, documentPatch, applyDocumentPatch } from '../src/shared-document.js';

const copy = value => structuredClone(value);
function wall(document, y, x = 1000) { const next = copy(document); model.addWall(next, { x, y }, { x: x + 1000, y }); return next; }
function edit(authority, author, before, after, id = 1) { return authority.execute(author, { id, revision: 0, action: 'edit', patch: documentPatch(before, after) }); }
test('independent concurrent edits allocate unique ids and each user undoes only their work', () => {
  const base = model.createDocument(), host = new SharedDocumentAuthority(base);
  edit(host, '1', base, wall(base, 1000)); edit(host, '2', base, wall(base, 1500));
  assert.equal(host.document.edges.length, 2); assert.equal(new Set(host.document.vertices.map(v => v.id)).size, 4);
  host.execute('1', { id: 2, revision: 2, action: 'undo' }); assert.equal(host.document.edges.length, 1);
  assert.equal(host.document.vertices[0].y, 1500);
  host.execute('1', { id: 3, revision: 3, action: 'redo' }); assert.equal(host.document.edges.length, 2);
  host.execute('2', { id: 2, revision: 4, action: 'undo' }); assert.equal(host.document.edges.length, 1);
});
test('shared endpoints merge; undo cannot remove another user dependent geometry', () => {
  const base = model.createDocument(), host = new SharedDocumentAuthority(base);
  edit(host, '1', base, wall(base, 1000));
  const next = copy(base); model.addWall(next, { x: 2000, y: 1000 }, { x: 2000, y: 2000 });
  edit(host, '2', base, next);
  assert.equal(host.document.vertices.length, 3);
  assert.throws(() => host.execute('1', { id: 2, revision: 2, action: 'undo' }), /cannot be applied/);
  assert.equal(host.document.edges.length, 2);
  host.execute('2', { id: 2, revision: 2, action: 'undo' });
  host.execute('1', { id: 3, revision: 3, action: 'undo' }); assert.equal(host.document.edges.length, 0);
});
test('multiple own edits undo and redo in order; other authors preserve redo', () => {
  const base = model.createDocument(), host = new SharedDocumentAuthority(base);
  edit(host, '1', base, wall(base, 1000));
  const before = copy(host.document), renamed = copy(before); renamed.name = 'First'; edit(host, '1', before, renamed, 2);
  host.execute('1', { id: 3, revision: 2, action: 'undo' });
  host.execute('1', { id: 4, revision: 3, action: 'undo' });
  edit(host, '2', host.document, wall(host.document, 2000));
  assert.equal(host.state('1').canRedo, true);
  host.execute('1', { id: 5, revision: 5, action: 'redo' });
  host.execute('1', { id: 6, revision: 6, action: 'redo' });
  assert.equal(host.document.name, 'First'); assert.equal(host.document.edges.length, 2);
});
test('new nested door ids are allocated and another author door prevents wall undo', () => {
  const base = model.createDocument(), host = new SharedDocumentAuthority(base);
  edit(host, '1', base, wall(base, 1000));
  const before = copy(host.document), next = copy(before); model.addDoor(next, next.edges[0].id, { x: 1500, y: 1000 });
  edit(host, '2', before, next);
  assert.match(host.document.edges[0].doors[0].id, /^p2_/);
  assert.throws(() => host.execute('1', { id: 2, revision: 2, action: 'undo' }), /Another player|cannot be applied/);
  host.execute('2', { id: 2, revision: 2, action: 'undo' });
  host.execute('1', { id: 3, revision: 3, action: 'undo' }); assert.equal(host.document.edges.length, 0);
});
test('same operation is idempotent; expired author ids and invalid targets are rejected', () => {
  const base = model.createDocument(), host = new SharedDocumentAuthority(base);
  const request = { id: 1, revision: 0, action: 'edit', patch: documentPatch(base, wall(base, 1000)) };
  const result = host.execute('1', request); assert.equal(host.execute('1', request).duplicate, true); assert.equal(host.revision, 1);
  assert.deepEqual(applyDocumentPatch(base, result.patch), host.document);
  assert.throws(() => host.execute('bad', request), /author/);
  assert.throws(() => host.execute('1', { ...request, id: 2, patch: [{ kind: 'field', id: '__proto__', before: null, after: {} }] }), /field/);
  assert.throws(() => host.execute('1', { id: 2, revision: 100, action: 'undo' }), /operation/);
});
test('conflicting changes do not overwrite document; reset clears author histories', () => {
  const base = model.createDocument(), host = new SharedDocumentAuthority(base), next = copy(base); next.name = 'A';
  edit(host, '1', base, next); next.name = 'B';
  assert.throws(() => edit(host, '2', base, next), /cannot be applied/); assert.equal(host.document.name, 'A');
  host.reset(base); assert.equal(host.state('1').canUndo, false); assert.equal(host.revision, 0);
});
