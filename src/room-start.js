// Room attachment is derived from the existing graph; it adds no saved schema.
// Hover/outline helpers are pure, and placement commits one fully checked draft.
import { resolveCorridorStart, corridorEndTargets } from './corridors.js';
import { getWallSpan, resolveDoorPlacement } from './doors.js';
import { addWall, addDoor, validateDocument } from './model.js';
import { isShipPort, shipWorldPoint, shipDoorways } from './ship.js';
import { SHIP_FLOOR_BARRIER } from '../assets/ship-floor-contour.js';

const EPS = 1e-6;
const finite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a, b) => a.x * b.y - a.y * b.x;
const clean = value => Math.round(value * 1e9) / 1e9;
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const fail = message => { throw new Error(message); };

function hostSpan(doc, target) {
  if (target?.source === 'ship' || target?.source === 'corridor') return null;
  const span = getWallSpan(doc, target?.edgeId);
  if (!span || !finite(target.point)) return null;
  const offset = dot(sub(target.point, span.a), span.direction);
  const projected = { x: span.a.x + span.direction.x * offset, y: span.a.y + span.direction.y * offset };
  if (!same(target.point, projected) || offset < -EPS || offset > span.length + EPS) return null;
  return { ...span, offset };
}

/** Resolve the same exact door/midpoint/end anchors used by the corridor tool.
 * A solid wall must also support a new centered doorway without touching a cut,
 * corner, branch or pinned port. Actual room size/collisions are checked on drag.
 */
export function resolveRoomStart(doc, point, options = {}) {
  const target = resolveCorridorStart(doc, point, options);
  if (!target) return null;
  if (target.source === 'ship' || target.source === 'corridor') return target;
  const span = hostSpan(doc, target);
  if (!span) return null;
  if (target.kind === 'door') {
    const cut = span.cuts.find(cut => cut.kind === 'door' && cut.id === target.doorId);
    return cut && Math.abs((cut.start + cut.end) / 2 - span.offset) <= EPS ? target : null;
  }
  const placement = resolveDoorPlacement(doc, target.edgeId, target.point, { centerTolerance: 0 });
  return placement && same(placement.point, target.point) ? target : null;
}

function frame(doc, target, aim, options = {}) {
  if (!finite(target?.point) || !finite(target.direction) || !finite(aim)) fail('Invalid attached room geometry.');
  const length = Math.hypot(target.direction.x, target.direction.y);
  const tx = Math.abs(target.direction.x), ty = Math.abs(target.direction.y);
  if (Math.abs(length - 1) > EPS || !(tx <= EPS || ty <= EPS || Math.abs(tx - ty) <= EPS)) fail('Invalid room attachment direction.');
  const tangent = { ...target.direction };
  const delta = sub(aim, target.point);
  // Resolved starts can be 75 map pixels from the actual click. Treat that
  // small component as absent so natural straight drags still form a room.
  const axisDeadZone = Math.max(doc.style.wallWidth, 75);
  let normal = { x: -tangent.y, y: tangent.x };
  if (target.source === 'ship') normal = { x: 0, y: -1 };
  else if (target.source === 'corridor') {
    if (!finite(target.outwardDirection) || Math.abs(dot(tangent, target.outwardDirection)) > EPS
      || Math.abs(Math.hypot(target.outwardDirection.x, target.outwardDirection.y) - 1) > EPS) fail('Invalid corridor mouth.');
    normal = { ...target.outwardDirection };
  } else {
    const signedDepth = dot(delta, normal);
    if (Math.abs(signedDepth) > axisDeadZone) {
      if (signedDepth < 0) normal = { x: -normal.x, y: -normal.y };
    } else if (normal.y > EPS || (Math.abs(normal.y) <= EPS && normal.x > 0)) {
      // A tangent-only drag has no requested side. Use the upper side, or
      // left side of a vertical wall, rather than hiding the entire preview.
      normal = { x: -normal.x, y: -normal.y };
    }
  }
  const signedDepth = dot(delta, normal);
  if (signedDepth < -axisDeadZone - EPS) fail('Drag the room outward from its connection.');
  const grid = doc.style.grid, chamfer = doc.style.chamfer;
  const clearance = doc.style.wallWidth / 2 + doc.style.roughness;
  const minimumBaseHalf = Math.max(doc.style.doorWidth / 2 + clearance,
    target.source === 'corridor' ? doc.style.corridorWidth / 2 : 0);
  const minimumHalfWidth = Math.ceil((chamfer + minimumBaseHalf) / grid) * grid;
  const minimumDepth = (Math.floor(2 * chamfer / grid) + 1) * grid;
  const rawTangent = Math.abs(dot(delta, tangent));
  const tangentSize = rawTangent > axisDeadZone ? Math.round(rawTangent / grid) * grid : 0;
  const normalSize = signedDepth > axisDeadZone ? Math.round(signedDepth / grid) * grid : 0;
  // A missing component follows the dragged dimension to form a square.
  // Clamp early previews to legal minima; click-only cancellation is the
  // caller's gesture responsibility. Existing two-axis dimensions stay exact.
  let halfWidth = Math.max(minimumHalfWidth, tangentSize || Math.round(normalSize / (2 * grid)) * grid);
  let depth = Math.max(minimumDepth, normalSize || tangentSize * 2);
  if (options.square) {
    // A centered base needs a grid-aligned half-width as well as full depth.
    // Round upward to two grid steps so both dimensions are exactly equal
    // without shortening either requested extent or the doorway clearances.
    const side = Math.ceil(Math.max(halfWidth * 2, depth) / (2 * grid)) * 2 * grid;
    halfWidth = side / 2;
    depth = side;
  }
  const baseHalf = halfWidth - chamfer;
  const toWorld = (x, y) => ({ x: clean(target.point.x + tangent.x * x + normal.x * y),
    y: clean(target.point.y + tangent.y * x + normal.y * y) });
  const toLocal = point => ({ x: dot(sub(point, target.point), tangent), y: dot(sub(point, target.point), normal) });
  const local = [{ x: -baseHalf, y: 0 }, { x: baseHalf, y: 0 }, { x: halfWidth, y: chamfer },
    { x: halfWidth, y: depth - chamfer }, { x: baseHalf, y: depth }, { x: -baseHalf, y: depth },
    { x: -halfWidth, y: depth - chamfer }, { x: -halfWidth, y: chamfer }];
  const points = local.map(({ x, y }) => toWorld(x, y));
  return { tangent, normal, halfWidth, depth, baseHalf, local, points, toWorld, toLocal,
    segments: points.map((a, index) => ({ a, b: points[(index + 1) % points.length] })) };
}

/** Preview the proposed room's actual doorway gap, with the base midpoint fixed
 * exactly at the target. Host orientation takes precedence over free rotation.
 * options.square makes width/depth equal without moving the attachment.
 */
export function attachedRoomSegments(doc, target, aim, options = {}) {
  const shape = frame(doc, target, aim, options), halfDoor = doc.style.doorWidth / 2;
  return [{ a: shape.points[0], b: shape.toWorld(-halfDoor, 0) },
    { a: shape.toWorld(halfDoor, 0), b: shape.points[1] }, ...shape.segments.slice(1)];
}

function intersection(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c), denominator = cross(r, s);
  if (Math.abs(denominator) <= EPS) {
    if (Math.abs(cross(sub(c, a), r)) > EPS) return null;
    const squared = dot(r, r), from = dot(sub(c, a), r) / squared, to = dot(sub(d, a), r) / squared;
    const low = Math.max(0, Math.min(from, to)), high = Math.min(1, Math.max(from, to));
    return low <= high + EPS ? { point: { x: a.x + r.x * low, y: a.y + r.y * low }, overlap: high - low > EPS } : null;
  }
  const t = cross(sub(c, a), s) / denominator, u = cross(sub(c, a), r) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS
    ? { point: { x: a.x + r.x * t, y: a.y + r.y * t }, overlap: false } : null;
}

function strictlyInsideRoom(shape, point) {
  const p = shape.toLocal(point);
  return shape.local.every((a, index) => cross(sub(shape.local[(index + 1) % shape.local.length], a), sub(p, a)) > EPS);
}

function insidePolygon(polygon, point) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous], b = polygon[index];
    if (Math.abs(cross(sub(b, a), sub(point, a))) <= EPS
      && dot(sub(point, a), sub(point, b)) <= EPS) return false;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function checkShip(doc, target, shape) {
  // The measured upper wall plane is the intentional attachment boundary.
  // Raster thickness straddles it, but the chamber/hull lie on its inward side.
  const outerPlane = Math.abs(target.point.y - (doc.ship.y - 40)) <= EPS
    && Math.abs(shape.normal.x) <= EPS && shape.normal.y < 0;
  if (outerPlane) return;
  const polygon = SHIP_FLOOR_BARRIER.map(point => shipWorldPoint(doc.ship, point));
  if (shape.points.some(point => insidePolygon(polygon, point))
    || polygon.some(point => strictlyInsideRoom(shape, point))) fail('The room would overlap the fixed ship.');
  for (const segment of shape.segments) for (let index = 0; index < polygon.length; index++) {
    if (intersection(segment.a, segment.b, polygon[index], polygon[(index + 1) % polygon.length])) {
      fail('The room would touch the fixed ship.');
    }
  }
}

function checkConnection(doc, target, shape) {
  if (target.source === 'ship' && !shipDoorways(doc.ship).some(door => door.id === target.doorId
    && same(door.point, target.point) && same(door.direction, target.direction))) fail('The fixed doorway is no longer available.');
  if (target.source === 'corridor' && !corridorEndTargets(doc).some(end => same(end.point, target.point)
    && same(end.direction, target.direction) && same(end.outwardDirection, target.outwardDirection)
    && end.vertexIds.every(id => target.vertexIds?.includes(id)))) fail('The corridor mouth is no longer available.');
  const span = hostSpan(doc, target);
  if (target.source !== 'ship' && target.source !== 'corridor' && !span) fail('The room connection is no longer available.');
  if (span) {
    const low = span.offset - shape.baseHalf, high = span.offset + shape.baseHalf;
    if (span.cuts.some(cut => Math.min(high, cut.end) - Math.max(low, cut.start) > EPS
      && !(cut.kind === 'door' && cut.id === target.doorId))) fail('The shared room wall contains another opening.');
    if (target.kind === 'door') {
      const door = span.cuts.find(cut => cut.kind === 'door' && cut.id === target.doorId);
      if (!door || Math.abs((door.start + door.end) / 2 - span.offset) > EPS) fail('The original doorway is no longer available.');
    } else if (!resolveDoorPlacement(doc, target.edgeId, target.point, { centerTolerance: 0 })) {
      fail('A centered doorway does not fit this wall.');
    }
    // Extending a structural corner/branch would silently make a competing
    // shared boundary. Only solid unbranched free ends may extend the base.
    for (const [point, needsExtension] of [[span.a, low < -EPS], [span.b, high > span.length + EPS]]) {
      if (needsExtension && (isShipPort(doc.ship, point) || doc.edges.filter(edge => edge.a === point.id || edge.b === point.id).length !== 1)) {
        fail('The room base would cross a wall corner or branch.');
      }
    }
  }
  const vertices = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const hostIds = new Set(span?.edgeIds ?? []), railIds = new Set(target.source === 'corridor' ? target.edgeIds : []);
  const mouthPoints = (target.vertexIds ?? []).map(id => vertices.get(id)).filter(Boolean);
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b), localA = shape.toLocal(a), localB = shape.toLocal(b);
    if (strictlyInsideRoom(shape, a) || strictlyInsideRoom(shape, b)
      || strictlyInsideRoom(shape, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) fail('The room would enclose an existing wall.');
    for (const [index, segment] of shape.segments.entries()) {
      const hit = intersection(segment.a, segment.b, a, b);
      if (!hit) continue;
      if (hostIds.has(edge.id) && Math.abs(localA.y) <= EPS && Math.abs(localB.y) <= EPS
        && Math.abs(shape.toLocal(hit.point).y) <= EPS) continue;
      if (index === 0 && !hit.overlap && localA.y <= EPS && localB.y <= EPS) {
        if (railIds.has(edge.id) && mouthPoints.some(point => same(point, hit.point))) continue;
        if (target.source === 'ship' && isShipPort(doc.ship, hit.point)
          && [a, b].some(point => same(point, hit.point))) continue;
      }
      fail('The room would touch or cross another wall.');
    }
  }
  checkShip(doc, target, shape);
  return span;
}

function missingBase(doc, shape) {
  const vertices = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const covered = [];
  for (const edge of doc.edges) {
    const a = shape.toLocal(vertices.get(edge.a)), b = shape.toLocal(vertices.get(edge.b));
    if (Math.abs(a.y) > EPS || Math.abs(b.y) > EPS) continue;
    const low = Math.max(-shape.baseHalf, Math.min(a.x, b.x)), high = Math.min(shape.baseHalf, Math.max(a.x, b.x));
    if (high - low > EPS) covered.push({ low, high });
  }
  covered.sort((a, b) => a.low - b.low);
  const missing = [];
  let cursor = -shape.baseHalf;
  for (const { low, high } of covered) {
    if (low > cursor + EPS) missing.push({ a: shape.toWorld(cursor, 0), b: shape.toWorld(low, 0) });
    cursor = Math.max(cursor, high);
  }
  if (cursor < shape.baseHalf - EPS) missing.push({ a: shape.toWorld(cursor, 0), b: shape.toWorld(shape.baseHalf, 0) });
  return missing;
}

/** Add an attached chamfered room and its one exact centered connection.
 * Reuse existing solid base geometry/door IDs; drawing never fills saved cuts.
 * A failed preview or placement preserves graph, bounds, ship and all IDs.
 */
export function addAttachedRoom(doc, target, aim, options = {}) {
  const shape = frame(doc, target, aim, options);
  checkConnection(doc, target, shape);
  const draft = structuredClone(doc), result = [];
  if (target.kind !== 'door' && target.source !== 'corridor') {
    if (!addDoor(draft, target.edgeId, target.point, { centerTolerance: 0 })) fail('A centered doorway does not fit this wall.');
  }
  for (const { a, b } of missingBase(draft, shape)) result.push(...addWall(draft, a, b, { joinTolerance: 0 }));
  if (target.source === 'ship' || target.source === 'corridor') {
    const vertices = new Map(draft.vertices.map(vertex => [vertex.id, vertex]));
    const base = draft.edges.find(edge => {
      const a = shape.toLocal(vertices.get(edge.a)), b = shape.toLocal(vertices.get(edge.b));
      return Math.abs(a.y) <= EPS && Math.abs(b.y) <= EPS && Math.min(a.x, b.x) <= EPS && Math.max(a.x, b.x) >= -EPS;
    });
    if (!base || !addDoor(draft, base.id, target.point, { centerTolerance: 0 })) fail('A centered doorway does not fit the room connection.');
  }
  for (const { a, b } of shape.segments.slice(1)) result.push(...addWall(draft, a, b, { joinTolerance: 0 }));
  validateDocument(draft);
  if (target.kind === 'door' && target.source !== 'ship'
    && !draft.edges.some(edge => edge.doors.some(door => door.id === target.doorId))) fail('The original doorway must remain unchanged.');
  Object.assign(doc, draft);
  return result.map(edge => doc.edges.find(current => current.id === edge.id)).filter(Boolean);
}
