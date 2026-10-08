// Door targeting follows the visible straight run, not incidental graph splits.
// Pure helpers shared by the preview and committed edit; no document mutation.
const EPS = 1e-6;
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const clean = value => Math.round(value * 1e9) / 1e9;
const pointAt = (span, offset) => ({
  x: clean(span.a.x + span.direction.x * offset),
  y: clean(span.a.y + span.direction.y * offset),
});
const atShipPort = (doc, point) => doc.ship && Math.abs(point.y - doc.ship.y) < EPS
  && Math.abs(Math.abs(point.x - doc.ship.x) - 356.5) < EPS;

/**
 * Return the full straight structural span containing an edge. Only degree-two
 * collinear vertices are crossed; corners, branches, ends and fixed ship ports
 * terminate the span. Segments and cut offsets run in canonical world order
 * (increasing x, or increasing y for a vertical wall), regardless of edge order.
 * Erased cuts are retained here so a caller can preserve them when consolidating
 * split edges; resolveDoorPlacement clips its target span at physical erasures.
 */
export function getWallSpan(doc, edgeId) {
  if (!Array.isArray(doc?.vertices) || !Array.isArray(doc.edges)) return null;
  const vertices = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const edges = new Map(doc.edges.map(edge => [edge.id, edge]));
  const selected = edges.get(edgeId);
  if (!selected) return null;
  const adjacent = new Map();
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (!finitePoint(a) || !finitePoint(b) || distance(a, b) <= EPS) return null;
    for (const id of [edge.a, edge.b]) {
      if (!adjacent.has(id)) adjacent.set(id, []);
      adjacent.get(id).push(edge);
    }
  }
  const chosenA = vertices.get(selected.a), chosenB = vertices.get(selected.b);
  const chosenLength = distance(chosenA, chosenB);
  let direction = { x: (chosenB.x - chosenA.x) / chosenLength, y: (chosenB.y - chosenA.y) / chosenLength };
  if (direction.x < -EPS || (Math.abs(direction.x) <= EPS && direction.y < 0)) {
    direction = { x: -direction.x, y: -direction.y };
  }
  const found = new Set([edgeId]);
  for (const initial of [selected.a, selected.b]) {
    let at = initial, previous = selected;
    while (found.size <= doc.edges.length) {
      const joint = vertices.get(at), incident = adjacent.get(at);
      if (incident.length !== 2 || atShipPort(doc, joint)) break;
      const next = incident.find(edge => edge.id !== previous.id);
      if (!next || found.has(next.id)) break;
      const priorPoint = vertices.get(previous.a === at ? previous.b : previous.a);
      const nextPoint = vertices.get(next.a === at ? next.b : next.a);
      const incoming = sub(joint, priorPoint), outgoing = sub(nextPoint, joint);
      const scale = distance(joint, priorPoint) * distance(joint, nextPoint);
      if (Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) > EPS * scale
        || dot(incoming, outgoing) <= 0) break;
      found.add(next.id);
      at = nextPoint.id;
      previous = next;
    }
  }
  const project = point => dot(sub(point, chosenA), direction);
  const ordered = [...found].map(id => {
    const edge = edges.get(id), a = vertices.get(edge.a), b = vertices.get(edge.b);
    const reversed = project(a) > project(b);
    return { edge, a: reversed ? b : a, b: reversed ? a : b, reversed };
  }).sort((left, right) => project(left.a) - project(right.a));
  const a = { ...ordered[0].a }, b = { ...ordered.at(-1).b }, length = distance(a, b);
  const segments = ordered.map(item => ({
    edgeId: item.edge.id, from: item.a.id, to: item.b.id, a: { ...item.a }, b: { ...item.b },
    length: distance(item.a, item.b), start: dot(sub(item.a, a), direction), end: dot(sub(item.b, a), direction),
    reversed: item.reversed,
  }));
  const cuts = [];
  for (const segment of segments) {
    const edge = edges.get(segment.edgeId);
    const offsetAt = t => segment.start + (segment.reversed ? 1 - t : t) * segment.length;
    for (const gap of edge.gaps ?? []) {
      const from = offsetAt(gap.start), to = offsetAt(gap.end);
      cuts.push({ id: gap.id, edgeId: edge.id, kind: 'gap', start: Math.min(from, to), end: Math.max(from, to) });
    }
    for (const door of edge.doors ?? []) {
      const middle = offsetAt(door.t), half = doc.style.doorWidth / 2;
      cuts.push({ id: door.id, edgeId: edge.id, kind: 'door', start: middle - half, end: middle + half });
    }
  }
  cuts.sort((left, right) => left.start - right.start || left.end - right.end);
  return {
    a, b, length, direction, segments, cuts,
    edgeIds: segments.map(segment => segment.edgeId),
    vertexIds: [segments[0].from, ...segments.map(segment => segment.to)],
  };
}

/**
 * Project an aim onto its straight wall, attracting gently to the midpoint only
 * within 50 map px and 5% of the uninterrupted span. Explicit zero disables the
 * attraction. Existing doors exclude placement; erased gaps also end the span.
 * The returned t/offset use the full structural span, allowing the model to
 * consolidate artificial splits without losing the physical cut position.
 */
export function resolveDoorPlacement(doc, edgeId, point, options = {}) {
  if (!finitePoint(point)) return null;
  const span = getWallSpan(doc, edgeId);
  if (!span) return null;
  const projectedOffset = dot(sub(point, span.a), span.direction);
  if (projectedOffset < -EPS || projectedOffset > span.length + EPS) return null;
  let start = 0, end = span.length;
  for (const cut of span.cuts) {
    if (cut.kind !== 'gap') continue;
    // Never attract across a real erasure or start a door inside one.
    if (projectedOffset >= cut.start - EPS && projectedOffset <= cut.end + EPS) return null;
    if (cut.end < projectedOffset) start = Math.max(start, cut.end);
    if (cut.start > projectedOffset) end = Math.min(end, cut.start);
  }
  const placementSpan = { a: pointAt(span, start), b: pointAt(span, end), start, end, length: end - start };
  const half = doc.style.doorWidth / 2;
  const clearance = doc.style.wallWidth / 2 + doc.style.roughness;
  const valid = offset => offset - half >= start + clearance - EPS && offset + half <= end - clearance + EPS
    && !span.cuts.some(cut => offset - half < cut.end - EPS && offset + half > cut.start + EPS);
  const requestedTolerance = options.centerTolerance ?? 50;
  const tolerance = Math.min(Number.isFinite(requestedTolerance) ? Math.max(0, requestedTolerance) : 50, placementSpan.length * 0.05);
  const middle = (start + end) / 2;
  const centered = tolerance > 0 && Math.abs(projectedOffset - middle) <= tolerance + EPS && valid(middle);
  const offset = centered ? middle : projectedOffset;
  if (!valid(offset)) return null;
  const host = span.segments.find(segment => offset >= segment.start - EPS && offset <= segment.end + EPS);
  const hostT = (offset - host.start) / host.length;
  return {
    point: pointAt(span, offset), projectedPoint: pointAt(span, projectedOffset), centered,
    t: offset / span.length, offset, edgeId, hostEdgeId: host.edgeId,
    hostT: host.reversed ? 1 - hostT : hostT,
    crossesSplit: span.segments.slice(0, -1).some(segment => segment.end > offset - half - clearance + EPS
      && segment.end < offset + half + clearance - EPS),
    span, placementSpan,
  };
}
