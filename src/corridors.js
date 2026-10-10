import { getWallSpan } from './doors.js';
import { corridorSegments, DEFAULTS } from './model.js';
import { isShipPort, shipDoorways } from './ship.js';

const EPS = 1e-6;
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const clean = value => Math.round(value * 1e9) / 1e9;
const tolerance = (value, fallback) => Number.isFinite(value) ? Math.max(0, value) : fallback;
const pointAt = (span, offset) => ({
  x: clean(span.a.x + span.direction.x * offset),
  y: clean(span.a.y + span.direction.y * offset),
});

const eightDirection = delta => Math.abs(delta.x) < EPS || Math.abs(delta.y) < EPS
  || Math.abs(Math.abs(delta.x) - Math.abs(delta.y)) < EPS;

function physicalCuts(doc, edge, length) {
  const halfDoor = doc.style.doorWidth / 2;
  return [...(edge.gaps ?? []).map(gap => ({ start: gap.start * length, end: gap.end * length })),
    ...(edge.doors ?? []).map(door => ({ start: door.t * length - halfDoor, end: door.t * length + halfDoor }))]
    .sort((a, b) => a.start - b.start);
}

// Index only cells touched by a solid segment. Crossing parameters keep a long
// diagonal from filling its complete rectangular bounding box.
function segmentCells(a, b, size) {
  const times = [0, 1], cells = new Set();
  for (const axis of ['x', 'y']) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPS) continue;
    const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]);
    for (let line = Math.floor(low / size) + 1; line * size < high; line++) times.push((line * size - a[axis]) / delta);
  }
  times.sort((x, y) => x - y);
  const include = t => {
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    for (let x = Math.floor((point.x - EPS) / size); x <= Math.floor((point.x + EPS) / size); x++) {
      for (let y = Math.floor((point.y - EPS) / size); y <= Math.floor((point.y + EPS) / size); y++) cells.add(`${x},${y}`);
    }
  };
  for (let i = 0; i < times.length; i++) {
    include(times[i]);
    if (i) include((times[i - 1] + times[i]) / 2);
  }
  return cells;
}

// The proposed mouth is a virtual receiving wall. Any other solid wall through
// it would make its opening ambiguous, even when that wall ends at the mouth.
function mouthIsClear(first, second, walls) {
  const tangent = sub(second.point, first.point), width = Math.hypot(tangent.x, tangent.y);
  const direction = { x: tangent.x / width, y: tangent.y / width };
  const normal = { x: -direction.y, y: direction.x };
  for (const wall of walls) {
    if (wall.edge.id === first.edge.id || wall.edge.id === second.edge.id) continue;
    const a = sub(wall.a, first.point), b = sub(wall.b, first.point);
    const aNormal = dot(a, normal), bNormal = dot(b, normal);
    if (Math.min(aNormal, bNormal) > EPS || Math.max(aNormal, bNormal) < -EPS) continue;
    const aAlong = dot(a, direction), bAlong = dot(b, direction);
    if (Math.abs(aNormal) < EPS && Math.abs(bNormal) < EPS) {
      if (Math.min(aAlong, bAlong) <= width + EPS && Math.max(aAlong, bAlong) >= -EPS) return false;
    } else {
      const t = aNormal / (aNormal - bNormal), offset = aAlong + (bAlong - aAlong) * t;
      if (t >= -EPS && t <= 1 + EPS && offset >= -EPS && offset <= width + EPS) return false;
    }
  }
  return true;
}

/**
 * Infer open corridor mouths from the existing graph, without provenance or
 * schema changes. A mouth has two unique solid free rail ends exactly one
 * corridor width apart, with parallel rails extending into the same side and
 * no conflicting solid wall across their opening. Pinned ship ports, branches,
 * erased endpoints, opposing rails and ambiguous pairings do not qualify.
 * `direction` is the canonical receiving-mouth tangent; `outwardDirection`
 * points away from the existing rails for a continuation or adjoining room.
 */
export function corridorEndTargets(doc) {
  if (!Array.isArray(doc?.vertices) || !Array.isArray(doc.edges)
    || !Number.isFinite(doc.style?.corridorWidth) || doc.style.corridorWidth <= 0
    || !Number.isFinite(doc.style?.doorWidth) || doc.style.doorWidth <= 0) return [];
  const vertices = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const adjacent = new Map(), wallInfo = [];
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (!finitePoint(a) || !finitePoint(b)) return [];
    const delta = sub(b, a), length = Math.hypot(delta.x, delta.y);
    if (length <= EPS || !eightDirection(delta)) return [];
    const cuts = physicalCuts(doc, edge, length), info = { edge, a, b, length, cuts };
    wallInfo.push(info);
    for (const id of [edge.a, edge.b]) {
      if (!adjacent.has(id)) adjacent.set(id, []);
      adjacent.get(id).push(info);
    }
  }
  const ends = [];
  for (const point of doc.vertices) {
    const incident = adjacent.get(point.id);
    if (incident?.length !== 1 || isShipPort(doc.ship, point, EPS)) continue;
    const info = incident[0], atA = info.edge.a === point.id;
    const offset = atA ? 0 : info.length;
    if (info.cuts.some(cut => offset >= cut.start - EPS && offset <= cut.end + EPS)) continue;
    const delta = sub(atA ? info.b : info.a, point);
    ends.push({ point, edge: info.edge, inward: { x: delta.x / info.length, y: delta.y / info.length } });
  }

  // Spatial endpoint buckets avoid comparing every free end with every other
  // end. Dense unsupported geometry stops rather than blocking pointer input.
  const width = doc.style.corridorWidth, buckets = new Map(), pairs = [], degree = new Map();
  let checks = 0;
  for (const end of ends) {
    const x = Math.floor(end.point.x / width), y = Math.floor(end.point.y / width);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const other of buckets.get(`${x + dx},${y + dy}`) ?? []) {
        if (++checks > 2000000) return [];
        const mouth = sub(end.point, other.point), separation = Math.hypot(mouth.x, mouth.y);
        if (Math.abs(separation - width) > EPS || !eightDirection(mouth)
          || Math.abs(dot(mouth, end.inward)) > EPS
          || Math.abs(cross(end.inward, other.inward)) > EPS
          || dot(end.inward, other.inward) < 1 - EPS) continue;
        pairs.push([other, end]);
        for (const candidate of [other, end]) degree.set(candidate.point.id, (degree.get(candidate.point.id) ?? 0) + 1);
      }
    }
    const key = `${x},${y}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(end);
  }
  const uniquePairs = pairs.filter(pair => pair.every(end => degree.get(end.point.id) === 1));
  if (!uniquePairs.length) return [];
  const walls = [];
  for (const info of wallInfo) {
    let start = 0;
    const addSolid = end => {
      if (end - start <= EPS) return;
      const at = offset => ({ x: info.a.x + (info.b.x - info.a.x) * offset / info.length,
        y: info.a.y + (info.b.y - info.a.y) * offset / info.length });
      walls.push({ edge: info.edge, a: at(start), b: at(end) });
    };
    for (const cut of info.cuts) {
      addSolid(Math.min(cut.start, info.length));
      start = Math.max(start, cut.end);
    }
    addSolid(info.length);
  }
  const wallBuckets = new Map();
  for (const wall of walls) for (const key of segmentCells(wall.a, wall.b, width)) {
    if (!wallBuckets.has(key)) wallBuckets.set(key, []);
    wallBuckets.get(key).push(wall);
  }
  const targets = [];
  for (const pair of uniquePairs) {
    const [first, second] = pair.sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y);
    const nearby = new Set();
    for (const key of segmentCells(first.point, second.point, width)) {
      for (const wall of wallBuckets.get(key) ?? []) nearby.add(wall);
    }
    if ((checks += nearby.size) > 2000000) return [];
    if (!mouthIsClear(first, second, nearby)) continue;
    const delta = sub(second.point, first.point);
    targets.push({
      point: { x: (first.point.x + second.point.x) / 2, y: (first.point.y + second.point.y) / 2 },
      kind: 'end', source: 'corridor', direction: { x: delta.x / width || 0, y: delta.y / width || 0 },
      outwardDirection: { x: -first.inward.x || 0, y: -first.inward.y || 0 },
      vertexIds: [first.point.id, second.point.id], edgeIds: [first.edge.id, second.edge.id], spanLength: width,
    });
  }
  return targets;
}

function targetOnSpan(span, point, options, distance) {
  const offset = dot(sub(point, span.a), span.direction);
  let start = 0, end = span.length;
  for (const cut of span.cuts) {
    if (cut.kind !== 'gap') continue;
    // An erasure is a real break, even when a nearby door's margin reaches it.
    if (offset >= cut.start - EPS && offset <= cut.end + EPS) return null;
    if (cut.end < offset) start = Math.max(start, cut.end);
    if (cut.start > offset) end = Math.min(end, cut.start);
  }

  const doorMargin = tolerance(options.doorMargin, 50);
  const doors = span.cuts.filter(cut => cut.kind === 'door'
    && cut.start >= start - EPS && cut.end <= end + EPS
    && offset >= cut.start - doorMargin - EPS && offset <= cut.end + doorMargin + EPS);
  doors.sort((a, b) => Math.abs((a.start + a.end) / 2 - offset)
    - Math.abs((b.start + b.end) / 2 - offset));

  let targetOffset, kind, doorId;
  if (doors.length) {
    targetOffset = (doors[0].start + doors[0].end) / 2;
    kind = 'door';
    doorId = doors[0].id;
  } else {
    targetOffset = (start + end) / 2;
    const centerTolerance = Math.min(tolerance(options.centerTolerance, 50), (end - start) * 0.05);
    if (centerTolerance <= 0 || Math.abs(offset - targetOffset) > centerTolerance + EPS
      || span.cuts.some(cut => targetOffset >= cut.start - EPS && targetOffset <= cut.end + EPS)) return null;
    kind = 'center';
  }

  const host = span.segments.find(segment => targetOffset >= segment.start - EPS && targetOffset <= segment.end + EPS);
  return {
    point: pointAt(span, targetOffset), kind, edgeId: host.edgeId,
    ...(doorId === undefined ? {} : { doorId }),
    projectedPoint: pointAt(span, offset), distance, spanLength: end - start,
    direction: { ...span.direction },
  };
}

/**
 * Attract a corridor's initial centerline point to the nearest wall's midpoint,
 * existing doorway or open corridor mouth. Returns null outside an attraction
 * zone; the caller retains its ordinary free/grid start in that case. Coordinates are map pixels
 * and are never rounded to the grid. This helper does not change the document.
 *
 * wallTolerance bounds perpendicular distance (default 75). Midpoint attraction
 * uses centerTolerance (default 50), capped at 5% of the erasure-bounded straight
 * span. Door attraction covers the whole opening plus doorMargin (default 50)
 * on either side, and takes precedence over its wall's midpoint. Turns, branches
 * and pinned ship ports bound spans; incidental collinear splits do not. The
 * fixed ship's outer doorway and corridor mouths use the same tolerances and
 * nearest-wall priority. A mouth is a virtual wall of corridorWidth length.
 */
export function resolveCorridorStart(doc, point, options = {}) {
  if (!finitePoint(point) || !Array.isArray(doc?.vertices) || !Array.isArray(doc.edges)
    || !Number.isFinite(doc.style?.doorWidth) || doc.style.doorWidth <= 0) return null;
  const vertices = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const wallTolerance = tolerance(options.wallTolerance, 75);
  let nearest = Infinity;
  const hosts = [];
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (!finitePoint(a) || !finitePoint(b)) continue;
    const delta = sub(b, a), squaredLength = dot(delta, delta);
    if (squaredLength <= EPS * EPS) continue;
    const t = dot(sub(point, a), delta) / squaredLength;
    if (t < -EPS || t > 1 + EPS) continue;
    const projected = { x: a.x + delta.x * t, y: a.y + delta.y * t };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance > wallTolerance + EPS || distance > nearest + EPS) continue;
    if (distance < nearest - EPS) {
      nearest = distance;
      hosts.length = 0;
    }
    hosts.push({ edgeId: edge.id, distance });
  }

  const freeTargets = [];
  for (const end of corridorEndTargets(doc)) {
    const delta = sub(point, end.point), offset = dot(delta, end.direction);
    if (Math.abs(offset) > end.spanLength / 2 + EPS) continue;
    const projectedPoint = { x: end.point.x + end.direction.x * offset, y: end.point.y + end.direction.y * offset };
    const distance = Math.hypot(point.x - projectedPoint.x, point.y - projectedPoint.y);
    if (distance > wallTolerance + EPS || distance > nearest + EPS) continue;
    if (distance < nearest - EPS) {
      nearest = distance;
      hosts.length = 0;
      freeTargets.length = 0;
    }
    const centerTolerance = Math.min(tolerance(options.centerTolerance, 50), end.spanLength * 0.05);
    if (centerTolerance > 0 && Math.abs(offset) <= centerTolerance + EPS) {
      freeTargets.push({ ...end, projectedPoint, distance });
    }
  }
  for (const door of shipDoorways(doc.ship)) {
    const offset = point.x - door.point.x, distance = Math.abs(point.y - door.point.y);
    if (Math.abs(offset) > door.width / 2 + tolerance(options.doorMargin, 50) + EPS
      || distance > wallTolerance + EPS || distance > nearest + EPS) continue;
    if (distance < nearest - EPS) {
      nearest = distance;
      hosts.length = 0;
      freeTargets.length = 0;
    }
    freeTargets.push({
      point: { ...door.point }, kind: 'door', source: 'ship', doorId: door.id,
      projectedPoint: { x: point.x, y: door.point.y }, distance, spanLength: door.width,
      direction: { ...door.direction },
    });
  }

  // Choose the nearby wall before evaluating its attractions. Otherwise a door
  // on a farther parallel wall could pull an intentional aim off the nearer one.
  const visited = new Set(), targets = [...freeTargets];
  for (const host of hosts) {
    if (visited.has(host.edgeId)) continue;
    const span = getWallSpan(doc, host.edgeId);
    if (!span) continue;
    for (const edgeId of span.edgeIds) visited.add(edgeId);
    const target = targetOnSpan(span, point, options, host.distance);
    if (target) targets.push(target);
  }
  targets.sort((a, b) => (a.kind === 'door' ? 0 : 1) - (b.kind === 'door' ? 0 : 1)
    || Math.hypot(a.point.x - point.x, a.point.y - point.y) - Math.hypot(b.point.x - point.x, b.point.y - point.y));
  return targets[0] ?? null;
}

// Project interior point displacement onto the original direction constraints.
// Their Gram matrix is tridiagonal: adjacent segments share one point and other
// segments share none. Solving it takes linear space/time rather than a dense
// least-squares matrix, including on the maximum supported 1000-point route.
function fittedDisplacements(normals, endpointDelta) {
  const count = normals.length;
  if (normals.every(normal => Math.abs(normal.x - normals[0].x) < EPS
    && Math.abs(normal.y - normals[0].y) < EPS)) {
    if (Math.abs(dot(normals[0], endpointDelta)) > EPS) return null;
    return Array.from({ length: count - 1 }, () => ({ x: 0, y: 0 }));
  }
  const diagonal = Array.from({ length: count }, (_, index) => index === 0 || index === count - 1 ? 1 : 2);
  const offDiagonal = normals.slice(1).map((normal, index) => -dot(normal, normals[index]));
  const right = Array(count).fill(0);
  right[count - 1] = -dot(normals[count - 1], endpointDelta);
  for (let index = 1; index < count; index++) {
    const factor = offDiagonal[index - 1] / diagonal[index - 1];
    diagonal[index] -= factor * offDiagonal[index - 1];
    right[index] -= factor * right[index - 1];
  }
  if (diagonal.some(value => !Number.isFinite(value) || value <= 1e-12)) return null;
  const multipliers = Array(count);
  for (let index = count - 1; index >= 0; index--) {
    multipliers[index] = (right[index] - (index === count - 1 ? 0 : offDiagonal[index] * multipliers[index + 1])) / diagonal[index];
  }
  return normals.slice(1).map((normal, index) => ({
    x: normals[index].x * multipliers[index] - normal.x * multipliers[index + 1],
    y: normals[index].y * multipliers[index] - normal.y * multipliers[index + 1],
  }));
}

/**
 * Fit a nearby exact endpoint while retaining the original start, point count
 * and every segment's forward 45-degree direction. Among routes with that fixed
 * point/direction correspondence, minimize the sum of squared interior-point
 * displacement. This does not claim a globally closest freehand route or search
 * for routes with different bends.
 *
 * Return null when that optimum exceeds maxDeviation (default 300 map pixels),
 * reverses/shortens a segment below minSegmentLength (default 1 map pixel), or
 * fails the model's fixed-width corridor geometry checks. Unsafe optima are not
 * replaced by a more distorted alternative. Callers must separately validate
 * insertion and opening preservation against the destination document before
 * automatically applying the candidate.
 * Endpoints retain their exact fractional coordinates; input is never mutated.
 */
export function fitCorridorEnd(points, endpoint, options = {}) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 1000
    || !points.every(finitePoint) || !finitePoint(endpoint)) return null;
  const width = options.width ?? DEFAULTS.corridorWidth;
  const limit = tolerance(options.maxDeviation, 300);
  const minimumLength = Math.max(EPS * 2, tolerance(options.minSegmentLength, 1));
  if (!Number.isFinite(width) || width <= 0) return null;
  const directions = [], normals = [];
  for (let index = 1; index < points.length; index++) {
    const delta = sub(points[index], points[index - 1]);
    const dx = Math.abs(delta.x), dy = Math.abs(delta.y);
    if (Math.hypot(dx, dy) <= EPS || !(dx < EPS || dy < EPS || Math.abs(dx - dy) < EPS)) return null;
    const diagonal = dx >= EPS && dy >= EPS;
    const direction = { x: dx < EPS ? 0 : Math.sign(delta.x) * (diagonal ? Math.SQRT1_2 : 1),
      y: dy < EPS ? 0 : Math.sign(delta.y) * (diagonal ? Math.SQRT1_2 : 1) };
    if (directions.length && dot(direction, directions.at(-1)) < -EPS) return null;
    directions.push(direction);
    normals.push({ x: -direction.y, y: direction.x });
  }
  const endpointDelta = sub(endpoint, points.at(-1));
  const endpointOffset = Math.hypot(endpointDelta.x, endpointDelta.y);
  if (endpointOffset > limit + EPS) return null;
  const displacements = fittedDisplacements(normals, endpointDelta);
  if (!displacements) return null;
  const path = [{ x: points[0].x, y: points[0].y }, ...displacements.map((delta, index) => ({
    x: clean(points[index + 1].x + delta.x), y: clean(points[index + 1].y + delta.y),
  })), { x: endpoint.x, y: endpoint.y }];
  let maxDeviation = endpointOffset, squaredDisplacement = 0;
  for (let index = 1; index < path.length - 1; index++) {
    const delta = sub(path[index], points[index]), squared = dot(delta, delta);
    maxDeviation = Math.max(maxDeviation, Math.sqrt(squared));
    squaredDisplacement += squared;
  }
  if (maxDeviation > limit + EPS) return null;
  for (let index = 0; index < directions.length; index++) {
    const delta = sub(path[index + 1], path[index]);
    if (Math.abs(dot(normals[index], delta)) > EPS || dot(directions[index], delta) < minimumLength - EPS) return null;
  }
  try { corridorSegments(path, width); }
  catch { return null; }
  return { path, maxDeviation, squaredDisplacement, endpointOffset };
}

/**
 * An automatic endpoint correction must not redraw a receiving wall's existing
 * door or erased interval. Ordinary wall insertion can intentionally fill cuts,
 * so check proposed corridor rails before insertion: any positive-length
 * collinear overlap of a rail and a physical cut rejects the correction.
 * Touching a cut boundary or legally splitting a solid part remains allowed.
 * This supplements, rather than replaces, atomic model insertion validation.
 */
export function corridorPreservesOpenings(doc, path) {
  if (!Array.isArray(doc?.vertices) || !Array.isArray(doc.edges)
    || !Number.isFinite(doc.style?.doorWidth) || doc.style.doorWidth <= 0) return false;
  let rails;
  try { rails = corridorSegments(path, doc.style.corridorWidth); }
  catch { return false; }
  const vertices = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  for (const edge of doc.edges) {
    if (!(edge.doors?.length || edge.gaps?.length)) continue;
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (!finitePoint(a) || !finitePoint(b)) return false;
    const delta = sub(b, a), length = Math.hypot(delta.x, delta.y);
    if (length <= EPS) return false;
    const direction = { x: delta.x / length, y: delta.y / length };
    const normal = { x: -direction.y, y: direction.x };
    const halfDoor = doc.style.doorWidth / 2;
    const cuts = [...(edge.gaps ?? []).map(gap => ({ start: gap.start * length, end: gap.end * length })),
      ...(edge.doors ?? []).map(door => ({ start: door.t * length - halfDoor, end: door.t * length + halfDoor }))];
    for (const rail of rails) {
      const from = sub(rail.a, a), to = sub(rail.b, a);
      if (Math.abs(dot(normal, from)) >= EPS || Math.abs(dot(normal, to)) >= EPS) continue;
      const low = Math.min(dot(direction, from), dot(direction, to));
      const high = Math.max(dot(direction, from), dot(direction, to));
      if (cuts.some(cut => Math.min(high, cut.end) - Math.max(low, cut.start) > EPS)) return false;
    }
  }
  return true;
}
