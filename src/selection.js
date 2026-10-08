// UI-only selection state. It is never serialized into the map document.
export const emptySelection = () => ({ edgeIds: [], vertexIds: [] });

export function selectionVertices(doc, selection) {
  const ids = new Set(selection.vertexIds), edges = new Set(selection.edgeIds);
  for (const edge of doc.edges) if (edges.has(edge.id)) { ids.add(edge.a); ids.add(edge.b); }
  return ids;
}

export function pruneSelection(doc, selection) {
  const edges = new Set(doc.edges.map(e => e.id)), vertices = new Set(doc.vertices.map(v => v.id));
  const edgeIds = [...new Set(selection.edgeIds)].filter(id => edges.has(id));
  const covered = selectionVertices(doc, { edgeIds, vertexIds: [] });
  return { edgeIds, vertexIds: [...new Set(selection.vertexIds)].filter(id => vertices.has(id) && !covered.has(id)) };
}

export function rectangleSelection(doc, a, b) {
  const inside = p => p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
    && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  const vertexIds = doc.vertices.filter(inside).map(v => v.id), included = new Set(vertexIds);
  const edgeIds = doc.edges.filter(e => included.has(e.a) && included.has(e.b)).map(e => e.id);
  return pruneSelection(doc, { edgeIds, vertexIds });
}

export function combineSelection(doc, base, added) {
  return pruneSelection(doc, { edgeIds: [...base.edgeIds, ...added.edgeIds], vertexIds: [...base.vertexIds, ...added.vertexIds] });
}

export function toggleSelection(doc, selection, kind, id) {
  const next = { edgeIds: [...selection.edgeIds], vertexIds: [...selection.vertexIds] };
  if (kind === 'edge') {
    if (next.edgeIds.includes(id)) next.edgeIds = next.edgeIds.filter(value => value !== id);
    else next.edgeIds.push(id);
  } else if (selectionVertices(doc, next).has(id)) {
    // Removing a selected corner must actually exclude it from movement. Keep
    // the other ends of its selected walls as point selections.
    const removed = doc.edges.filter(e => next.edgeIds.includes(e.id) && (e.a === id || e.b === id));
    const removedIds = new Set(removed.map(e => e.id));
    next.edgeIds = next.edgeIds.filter(value => !removedIds.has(value));
    next.vertexIds = [...next.vertexIds.filter(value => value !== id), ...removed.map(e => e.a === id ? e.b : e.a)];
  } else next.vertexIds.push(id);
  return pruneSelection(doc, next);
}
