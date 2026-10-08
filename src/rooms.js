// Geometric room recognition, independent of primitive history and document versions.
// This module never mutates a document. The model must validate every proposed move,
// including external attachments, pinned ports, doorway clearance and map bounds.
const EPS = 1e-5;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a, b) => a.x * b.y - a.y * b.x;
const length = p => Math.hypot(p.x, p.y);
const close = (a, b) => Math.abs(a - b) <= EPS;
const clean = value => Math.round(value * 1e9) / 1e9;
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const other = (edge, id) => edge.a === id ? edge.b : edge.a;

function graphIndex(doc) {
  if (!Array.isArray(doc?.vertices) || !Array.isArray(doc.edges)) return null;
  const vertices = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const edges = new Map();
  const outgoing = new Map();
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (!finitePoint(a) || !finitePoint(b) || length(sub(a, b)) <= EPS) return null;
    edges.set(edge.id, edge);
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!outgoing.has(from.id)) outgoing.set(from.id, []);
      outgoing.get(from.id).push({ edge, from: from.id, to: to.id, angle: Math.atan2(to.y - from.y, to.x - from.x) });
    }
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.angle - b.angle);
  return { vertices, edges, outgoing };
}

function opposite(a, b) {
  return a.edge.id === b.edge.id && a.from === b.to && a.to === b.from;
}

// A face boundary can detour down a dangling branch and back. Removing those
// consecutive inverse half-edges leaves the same face without losing its wall.
function removeBranchDetours(walk) {
  const stack = [];
  for (const half of walk) {
    if (stack.length && opposite(stack.at(-1), half)) stack.pop();
    else stack.push(half);
  }
  let start = 0, end = stack.length;
  while (end - start >= 2 && opposite(stack[start], stack[end - 1])) { start++; end--; }
  return stack.slice(start, end);
}

function faceWalk(index, edge, from) {
  const startKey = `${edge.id}:${from}`;
  const seen = new Set();
  const walk = [];
  let half = { edge, from, to: other(edge, from) };
  // A directed half-edge can appear only once in one face walk.
  for (let step = 0; step <= index.edges.size * 2; step++) {
    const key = `${half.edge.id}:${half.from}`;
    if (seen.has(key)) return key === startKey ? removeBranchDetours(walk) : null;
    seen.add(key);
    walk.push(half);
    const next = index.outgoing.get(half.to);
    const reverseIndex = next.findIndex(candidate => candidate.edge.id === half.edge.id && candidate.to === half.from);
    if (reverseIndex < 0) return null;
    half = next[(reverseIndex - 1 + next.length) % next.length];
  }
  return null;
}

function simplifyFace(index, walk, selectedId) {
  if (!walk || walk.length < 4 || !walk.some(half => half.edge.id === selectedId)) return null;
  const ids = walk.map(half => half.from);
  if (new Set(ids).size !== ids.length) return null;
  // Intentional doors retain the room boundary. Arbitrary erasure breaks it.
  if (walk.some(({ edge }) => edge.gaps?.some(gap => gap.end - gap.start > EPS))) return null;
  const points = ids.map(id => index.vertices.get(id));
  const area = points.reduce((sum, point, i) => sum + cross(point, points[(i + 1) % points.length]), 0) / 2;
  // The clockwise successor to each incoming reverse traces bounded faces with
  // positive area, including on the canvas's downward-positive y axis.
  if (area <= EPS) return null;
  const cornerIndices = [];
  for (let i = 0; i < points.length; i++) {
    const before = sub(points[i], points[(i - 1 + points.length) % points.length]);
    const after = sub(points[(i + 1) % points.length], points[i]);
    const turn = cross(before, after) / (length(before) * length(after));
    if (Math.abs(turn) <= EPS) {
      if (dot(before, after) <= 0) return null;
    } else {
      if (turn < 0) return null; // Concave faces are not rectangular rooms.
      cornerIndices.push(i);
    }
  }
  if (![4, 8].includes(cornerIndices.length)) return null;
  const sides = cornerIndices.map((start, sideIndex) => {
    const end = cornerIndices[(sideIndex + 1) % cornerIndices.length];
    const edgeIds = [], vertexIds = [ids[start]];
    for (let i = start; i !== end; i = (i + 1) % walk.length) {
      edgeIds.push(walk[i].edge.id);
      vertexIds.push(walk[i].to);
    }
    return { index: sideIndex, edgeIds, vertexIds, a: { ...points[start] }, b: { ...points[end] } };
  });
  return { area, vertexIds: ids, edgeIds: walk.map(half => half.edge.id), corners: cornerIndices.map(i => ({ ...points[i] })), sides };
}

function fitFrame(face, orientation) {
  const frame = orientation === 0
    ? { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } }
    : { u: { x: Math.SQRT1_2, y: Math.SQRT1_2 }, v: { x: -Math.SQRT1_2, y: Math.SQRT1_2 } };
  const projected = face.corners.map(point => ({ id: point.id, x: dot(point, frame.u), y: dot(point, frame.v) }));
  const bounds = {
    left: Math.min(...projected.map(p => p.x)), right: Math.max(...projected.map(p => p.x)),
    top: Math.min(...projected.map(p => p.y)), bottom: Math.max(...projected.map(p => p.y)),
  };
  const { left, right, top, bottom } = bounds;
  if (right - left <= EPS || bottom - top <= EPS) return null;
  let chamfer = 0;
  if (projected.length === 4) {
    if (!projected.every(p => (close(p.x, left) || close(p.x, right)) && (close(p.y, top) || close(p.y, bottom)))) return null;
  } else {
    const topSide = projected.filter(p => close(p.y, top)).sort((a, b) => a.x - b.x);
    const bottomSide = projected.filter(p => close(p.y, bottom)).sort((a, b) => a.x - b.x);
    const leftSide = projected.filter(p => close(p.x, left)).sort((a, b) => a.y - b.y);
    const rightSide = projected.filter(p => close(p.x, right)).sort((a, b) => a.y - b.y);
    if ([topSide, bottomSide, leftSide, rightSide].some(side => side.length !== 2)) return null;
    const insets = [topSide[0].x - left, right - topSide[1].x, bottomSide[0].x - left, right - bottomSide[1].x,
      leftSide[0].y - top, bottom - leftSide[1].y, rightSide[0].y - top, bottom - rightSide[1].y];
    chamfer = insets.reduce((sum, inset) => sum + inset, 0) / insets.length;
    if (chamfer <= EPS || insets.some(inset => !close(inset, chamfer)) || right - left <= 2 * chamfer + EPS || bottom - top <= 2 * chamfer + EPS) return null;
  }
  const sides = face.sides.map(side => {
    const a = projected.find(point => point.id === side.a.id), b = projected.find(point => point.id === side.b.id);
    let boundary = null;
    if (close(a.x, b.x)) {
      if (close(a.x, left)) boundary = 'left';
      else if (close(a.x, right)) boundary = 'right';
    } else if (close(a.y, b.y)) {
      if (close(a.y, top)) boundary = 'top';
      else if (close(a.y, bottom)) boundary = 'bottom';
    }
    return { ...side, boundary, axis: boundary === 'left' || boundary === 'right' ? 'u' : boundary ? 'v' : null };
  });
  if (sides.filter(side => side.boundary).length !== 4) return null;
  return { ...face, kind: chamfer ? 'chamfered' : 'rectangle', orientation, chamfer, frame, bounds, sides };
}

/**
 * Recognize the bounded room beside a selected long wall, including collinear
 * wall pieces split by attachments. Plain doors do not prevent recognition.
 * Returns null for chamfers, eroded/unrecognized outlines and ambiguous shared
 * walls. No persistent primitive identifier or creation history is required.
 */
export function detectRoom(doc, edgeId) {
  const index = graphIndex(doc);
  const edge = index?.edges.get(edgeId);
  if (!edge) return null;
  const candidates = [];
  for (const from of [edge.a, edge.b]) {
    const face = simplifyFace(index, faceWalk(index, edge, from), edgeId);
    if (!face) continue;
    let fits = [0, 45].map(orientation => fitFrame(face, orientation)).filter(Boolean);
    // A clipped square has a second mathematical interpretation rotated by45°.
    // The fixed chamfer measurement identifies its actual four long sides.
    const nominal = fits.filter(fit => fit.kind === 'rectangle' || close(fit.chamfer, doc.style?.chamfer ?? 220));
    if (nominal.length) fits = nominal;
    if (fits.length !== 1) continue;
    const room = fits[0];
    const side = room.sides.find(candidate => candidate.edgeIds.includes(edgeId));
    if (side?.boundary) candidates.push({ ...room, side });
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * null means no recognized room: the caller may try ordinary wall dragging.
 * A recognized blocked result MUST reject the gesture without a local fallback.
 * Success positions contain every outline vertex; all other vertices are left
 * to the model's constraints. This function deliberately performs no mutation.
 */
export function proposeRoomResize(doc, edgeId, delta) {
  const room = detectRoom(doc, edgeId);
  if (!room) return null;
  const blocked = reason => ({ recognized: true, blocked: true, positions: null, room, reason });
  if (!finitePoint(delta)) return blocked('Invalid room movement.');
  const axis = room.frame[room.side.axis];
  const shift = dot(delta, axis);
  if (Math.abs(shift) <= EPS) return blocked('The room wall has not moved.');
  const boundary = room.side.boundary;
  const nextBounds = { ...room.bounds, [boundary]: room.bounds[boundary] + shift };
  if (nextBounds.right - nextBounds.left <= 2 * room.chamfer + EPS || nextBounds.bottom - nextBounds.top <= 2 * room.chamfer + EPS) {
    return blocked('The room is too small to preserve its corners.');
  }
  const movingLow = boundary === 'left' || boundary === 'top';
  const limit = room.bounds[boundary] + (movingLow ? room.chamfer : -room.chamfer);
  const corners = new Map(room.corners.map(point => {
    const coordinate = dot(point, axis);
    const moves = movingLow ? coordinate <= limit + EPS : coordinate >= limit - EPS;
    return [point.id, { x: point.x + (moves ? axis.x * shift : 0), y: point.y + (moves ? axis.y * shift : 0) }];
  }));
  const source = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const positions = new Map();
  for (const side of room.sides) {
    const a = corners.get(side.a.id), b = corners.get(side.b.id);
    const vector = sub(side.b, side.a), lengthSquared = dot(vector, vector);
    for (const id of side.vertexIds) {
      const t = dot(sub(source.get(id), side.a), vector) / lengthSquared;
      positions.set(id, { x: clean(a.x + (b.x - a.x) * t), y: clean(a.y + (b.y - a.y) * t) });
    }
  }
  return { recognized: true, blocked: false, positions, room, nextBounds };
}
