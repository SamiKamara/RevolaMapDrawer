// Document transactions for Revola's authenticated in-game session only.
// No network, filesystem or UI entry point is exposed by this module.
import { validateDocument } from './model.js';
import { checkObjectLimits } from './object-limits.js';

const groups = ['vertices', 'edges', 'objects'];
const fields = ['name', 'width', 'height', 'originX', 'originY', 'style', 'ship', 'seed', 'objectGeneration'];
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const key = change => `${change.kind}:${change.id}`;
const conflict = () => { throw new Error('Another player changed this part of the map. Your edit was not applied.'); };

export function documentPatch(before, after) {
  const changes = [];
  for (const kind of groups) {
    const old = before[kind] ?? [], next = after[kind] ?? [];
    const a = new Map(old.map(value => [value.id, value])), b = new Map(next.map(value => [value.id, value]));
    for (const id of new Set([...a.keys(), ...b.keys()])) if (!equal(a.get(id), b.get(id)))
      changes.push({ kind, id, before: a.get(id) ?? null, after: b.get(id) ?? null,
        index: next.findIndex(value => value.id === id), previousIndex: old.findIndex(value => value.id === id) });
  }
  for (const id of fields) if (!equal(before[id], after[id])) changes.push({ kind: 'field', id, before: before[id] ?? null, after: after[id] ?? null });
  return clone(changes);
}

export function applyDocumentPatch(document, changes, strict = true) {
  if (!Array.isArray(changes) || changes.length > 50000) throw new Error('Invalid shared edit.');
  const next = clone(document), seen = new Set();
  for (const change of changes) {
    if (!change || seen.has(key(change))) throw new Error('Duplicate shared edit target.');
    seen.add(key(change));
    if (change.kind === 'field') {
      if (!fields.includes(change.id)) throw new Error('Invalid shared field.');
      if (strict && !equal(next[change.id], change.before)) conflict();
      if (change.after === null) delete next[change.id]; else next[change.id] = clone(change.after);
    } else {
      if (!groups.includes(change.kind) || typeof change.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(change.id)) throw new Error('Invalid shared entity.');
      const values = next[change.kind] ??= [], index = values.findIndex(value => value.id === change.id);
      if (strict && !equal(index < 0 ? null : values[index], change.before)) conflict();
      if (change.after !== null && change.after.id !== change.id) throw new Error('Shared entity identity changed.');
      if (index >= 0) {
        if (change.after === null) values.splice(index, 1); else values[index] = clone(change.after);
      } else if (change.after !== null) values.splice(Number.isInteger(change.index) && change.index >= 0 ? Math.min(change.index, values.length) : values.length, 0, clone(change.after));
    }
  }
  return validateDocument(next);
}

function allocate(document, changes, prefix) {
  if (!Array.isArray(changes) || changes.length > 50000) throw new Error('Invalid shared edit.');
  const aliases = Object.create(null), skip = new Set(); let serial = 0;
  // A saved shared map retains its canonical IDs, while a newly opened
  // authority starts its transaction counter at zero. Reserve the complete
  // existing namespace, including nested openings and gameplay objects.
  const used = new Set([...document.vertices, ...document.edges, ...(document.objects ?? []),
    ...document.edges.flatMap(edge => [...edge.doors, ...(edge.gaps ?? [])])].map(value => value.id));
  const allocateId = id => {
    if (aliases[id]) return;
    let value; do { value = `${prefix}_${++serial}`; } while (used.has(value));
    used.add(value); aliases[id] = value;
  };
  for (const change of changes) if (groups.includes(change.kind) && change.before === null && change.after) {
    if (change.kind === 'vertices') {
      const shared = document.vertices.find(v => v.x === change.after.x && v.y === change.after.y);
      if (shared) { aliases[change.id] = shared.id; skip.add(key(change)); continue; }
    }
    allocateId(change.id);
  }
  for (const change of changes) if (change.kind === 'edges' && change.after) {
    const old = new Set([...(change.before?.doors ?? []), ...(change.before?.gaps ?? [])].map(v => v.id));
    for (const value of [...change.after.doors, ...(change.after.gaps ?? [])]) if (!old.has(value.id)) allocateId(value.id);
  }
  const remap = value => JSON.parse(JSON.stringify(value, (name, item) => ['id', 'a', 'b', 'doorId'].includes(name) && aliases[item] ? aliases[item] : item));
  return { changes: changes.filter(value => !skip.has(key(value))).map(remap), aliases };
}

export class SharedDocumentAuthority {
  constructor(project) { this.reset(project); }
  reset(project) {
    this.document = validateDocument(typeof project === 'string' ? JSON.parse(project) : project);
    this.revision = 0; this.serial = 0; this.histories = new Map(); this.receipts = new Map(); this.lastIds = new Map();
  }
  history(author) {
    if (typeof author !== 'string' || !/^[0-9]{1,20}$/.test(author)) throw new Error('Invalid shared author.');
    if (!this.histories.has(author)) { if (this.histories.size >= 32) throw new Error('Too many shared authors.'); this.histories.set(author, { undo: [], redo: [] }); }
    return this.histories.get(author);
  }
  state(author) {
    const history = this.history(author);
    return { revision: this.revision, project: JSON.stringify(this.document), canUndo: history.undo.length > 0, canRedo: history.redo.length > 0, lastId: this.lastIds.get(author) ?? 0 };
  }
  execute(author, request) {
    const history = this.history(author);
    if (!request || !Number.isSafeInteger(request.id) || request.id <= 0 || !Number.isSafeInteger(request.revision) || request.revision < 0 || request.revision > this.revision)
      throw new Error('Invalid shared operation.');
    const receiptKey = `${author}:${request.id}`;
    if (this.receipts.has(receiptKey)) return { ...this.receipts.get(receiptKey), duplicate: true };
    if (request.id <= (this.lastIds.get(author) ?? 0)) throw new Error('Expired shared operation.');
    let patch, entry, aliases = {}, source, destination;
    if (request.action === 'edit') {
      const allocated = allocate(this.document, request.patch, `p${author}_${++this.serial}`);
      patch = allocated.changes; aliases = allocated.aliases;
    } else if (request.action === 'undo' || request.action === 'redo') {
      source = request.action === 'undo' ? history.undo : history.redo;
      destination = request.action === 'undo' ? history.redo : history.undo;
      entry = source.at(-1);
      if (!entry) throw new Error(`Nothing to ${request.action}.`);
      patch = request.action === 'undo' ? entry.patch.map(change => ({ ...change, before: change.after, after: change.before, index: change.previousIndex, previousIndex: change.index })) : entry.patch;
    } else throw new Error('Invalid shared operation.');
    const previous = this.document;
    // Whole-document validation also protects dependencies (e.g. someone else's
    // door or edge using a vertex this undo would remove).
    let next;
    try { next = applyDocumentPatch(previous, patch); }
    catch (error) { throw new Error(`Edit cannot be applied without changing another edit or invalidating the map: ${error.message}`); }
    if (request.action === 'edit') checkObjectLimits(previous, next);
    const actual = documentPatch(previous, next);
    if (!actual.length) throw new Error('This edit no longer changes the map.');
    this.document = next; this.revision++;
    if (!entry) {
      entry = { patch: actual }; history.undo.push(entry); history.redo = [];
      if (history.undo.length > 100) history.undo.shift();
    } else { source.pop(); destination.push(entry); }
    const event = { revision: this.revision, patch: actual, author, id: request.id, aliases, canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 };
    this.receipts.set(receiptKey, event);
    this.lastIds.set(author, request.id);
    if (this.receipts.size > 256) this.receipts.delete(this.receipts.keys().next().value);
    return event;
  }
}
