import { ensureCanvasContains, validateDocument } from './model.js';
import { selectionVertices } from './selection.js';
import { isShipPort } from './ship.js';

const EPS = 1e-6;
const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const clean = value => Math.round(value * 1e9) / 1e9;

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

/** Capture selected walls and walls between selected points as a detached graph. */
export function copySelection(doc, selection) {
  if (!selection || !Array.isArray(selection.edgeIds) || !Array.isArray(selection.vertexIds)) {
    throw new Error('Select walls or connected points to copy.');
  }
  const selected = selectionVertices(doc, selection), explicitEdges = new Set(selection.edgeIds);
  const edges = doc.edges.filter(edge => explicitEdges.has(edge.id) || (selected.has(edge.a) && selected.has(edge.b)));
  if (!edges.length) throw new Error('Select at least one wall or both endpoints of a wall to copy.');
  const included = new Set(edges.flatMap(edge => [edge.a, edge.b]));
  const vertices = doc.vertices.filter(vertex => included.has(vertex.id));
  const bounds = vertices.reduce((box, vertex) => ({
    left: Math.min(box.left, vertex.x), right: Math.max(box.right, vertex.x),
    top: Math.min(box.top, vertex.y), bottom: Math.max(box.bottom, vertex.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  return freeze({
    vertices: vertices.map(vertex => ({ id: vertex.id, x: vertex.x, y: vertex.y })),
    edges: edges.map(edge => ({ id: edge.id, a: edge.a, b: edge.b,
      doors: edge.doors.map(door => ({ id: door.id, t: door.t })),
      gaps: (edge.gaps ?? []).map(gap => ({ id: gap.id, start: gap.start, end: gap.end })),
    })),
    anchor: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  });
}

/** Paste one rigid translation atomically, without snapping or joining old walls. */
export function pasteSelection(doc, fragment, delta) {
  if (!validPoint(delta)) throw new Error('Invalid paste position.');
  if (!fragment || !Array.isArray(fragment.vertices) || !Array.isArray(fragment.edges)
    || !fragment.vertices.length || !fragment.edges.length) throw new Error('Copy some walls before pasting.');

  const sourceIds = new Set();
  const reserveSourceId = id => {
    if (typeof id !== 'string' || sourceIds.has(id)) throw new Error('Invalid copied graph identifiers.');
    sourceIds.add(id);
  };
  for (const vertex of fragment.vertices) reserveSourceId(vertex.id);
  for (const edge of fragment.edges) {
    reserveSourceId(edge.id);
    if (!Array.isArray(edge.doors) || !Array.isArray(edge.gaps)) throw new Error('Invalid copied wall openings.');
    for (const opening of [...edge.doors, ...edge.gaps]) reserveSourceId(opening.id);
  }
  // Reserve the snapshot's IDs too, so pasting into another/new document still
  // creates new identities. Allocate once per prefix instead of scanning for
  // every new vertex, wall and opening in a large selection.
  const usedIds = new Set(sourceIds), next = new Map();
  for (const vertex of doc.vertices) usedIds.add(vertex.id);
  for (const edge of doc.edges) {
    usedIds.add(edge.id);
    for (const opening of [...edge.doors, ...(edge.gaps ?? [])]) usedIds.add(opening.id);
  }
  const allocate = prefix => {
    let index = next.get(prefix) ?? 1;
    while (usedIds.has(`${prefix}${index}`)) index++;
    const id = `${prefix}${index}`;
    next.set(prefix, index + 1); usedIds.add(id);
    return id;
  };

  const remap = new Map(), vertices = fragment.vertices.map(vertex => {
    if (!validPoint(vertex)) throw new Error('Invalid copied point.');
    const id = allocate('v'); remap.set(vertex.id, id);
    // Keep the common off-grid delta, then use the model's coordinate precision
    // so arithmetic noise cannot change a pasted point on project reopen.
    return { id, x: clean(vertex.x + delta.x), y: clean(vertex.y + delta.y) };
  });
  if (vertices.some(vertex => isShipPort(doc.ship, vertex, EPS))) {
    throw new Error('A pasted group must stay separate from the fixed ship ports.');
  }
  const edges = fragment.edges.map(edge => ({
    id: allocate('e'), a: remap.get(edge.a), b: remap.get(edge.b),
    doors: edge.doors.map(door => ({ id: allocate('d'), t: door.t })),
    gaps: edge.gaps.map(gap => ({ id: allocate('g'), start: gap.start, end: gap.end })),
  }));
  const draft = structuredClone(doc);
  ensureCanvasContains(draft, vertices);
  draft.vertices.push(...vertices); draft.edges.push(...edges);
  // Full validation protects counts, topology, cuts and existing geometry.
  validateDocument(draft);
  Object.assign(doc, draft);
  return { edgeIds: edges.map(edge => edge.id), vertexIds: [] };
}
