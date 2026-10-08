// Geometry is expressed in native map pixels. This module has no DOM dependency.
import { proposeRoomResize } from './rooms.js';
import { resolveDoorPlacement } from './doors.js';

export const DEFAULTS = Object.freeze({ width: 8192, height: 8192, wallWidth: 50, doorWidth: 375, corridorWidth: 580, chamfer: 220, roughness: 2.25, grid: 25 });
const EPS = 1e-6;
const MAX_VERTICES = 20000;
const MAX_EDGES = 20000;
const MAX_TOPOLOGY_CANDIDATES = 2000000;
const TOPOLOGY_CELL = 128;
const copy = value => structuredClone(value);
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const same = (a, b) => distance(a, b) < EPS;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const clean = p => ({ x: Math.round(p.x * 1e9) / 1e9, y: Math.round(p.y * 1e9) / 1e9 });
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const allowed = (a, b) => {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  return Math.hypot(dx, dy) > EPS && (dx < EPS || dy < EPS || Math.abs(dx - dy) < EPS);
};
const fail = message => { throw new Error(message); };
const inBounds = (doc, p) => {
  const bounds = getMapBounds(doc);
  return validPoint(p) && p.x >= bounds.left && p.y >= bounds.top && p.x <= bounds.right && p.y <= bounds.bottom;
};
const atShipPort = (doc, p) => Math.abs(p.y - doc.ship.y) < EPS && Math.abs(Math.abs(p.x - doc.ship.x) - 356.5) < EPS;

export function createDocument() {
  const { width, height, ...style } = DEFAULTS;
  return { format: 'revola-map', version: 2, name: 'Untitled map', width, height, originX: 0, originY: 0, style,
    vertices: [], edges: [], ship: { x: 4096, y: 4740, mirrored: false }, seed: 17 };
}

export function getMapBounds(doc) {
  const left = doc.originX ?? 0, top = doc.originY ?? 0;
  return { left, top, right: left + doc.width, bottom: top + doc.height };
}

/** Expand once around the fixed world center; existing coordinates never move. */
export function ensureCanvasContains(doc, points) {
  if (!Array.isArray(points)) fail('Invalid map geometry.');
  // Reserve the renderer's maximum miter radius so pointed corners cannot be
  // clipped at either the default canvas edge or the maximum expanded bounds.
  const padding = doc.style.wallWidth * 1.5;
  for (const point of points) {
    if (!validPoint(point) || point.x - padding < -4096 || point.y - padding < -4096
      || point.x + padding > 12288 || point.y + padding > 12288) fail('Walls must stay inside the maximum 16384 × 16384 map.');
  }
  const bounds = getMapBounds(doc);
  const expands = points.some(p => p.x - padding < bounds.left || p.y - padding < bounds.top || p.x + padding > bounds.right || p.y + padding > bounds.bottom);
  if (expands) Object.assign(doc, { width: 16384, height: 16384, originX: -4096, originY: -4096 });
  return expands;
}

function checkedId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) fail('Invalid graph identifier.');
  return value;
}

function boundedNumber(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) fail(`Invalid ${label}.`);
  return value;
}

// Rebuild an allowlisted object rather than trusting imported prototypes or extra keys.
export function validateDocument(input) {
  if (!input || input.format !== 'revola-map' || ![1, 2].includes(input.version)) fail('Unsupported Revola project format or version.');
  const originX = input.version === 1 ? 0 : input.originX, originY = input.version === 1 ? 0 : input.originY;
  const initial = input.width === 8192 && input.height === 8192 && originX === 0 && originY === 0;
  const expanded = input.version === 2 && input.width === 16384 && input.height === 16384 && originX === -4096 && originY === -4096;
  if (!initial && !expanded) fail('Maps must use the initial 8192 or centered expanded 16384 pixel canvas.');
  if (typeof input.name !== 'string' || input.name.length > 200) fail('Invalid map name.');
  if (!input.style || !Array.isArray(input.vertices) || !Array.isArray(input.edges)) fail('Project geometry is missing.');
  if (input.vertices.length > MAX_VERTICES || input.edges.length > MAX_EDGES) fail('Project exceeds the geometry limit.');
  const out = createDocument();
  out.name = input.name;
  Object.assign(out, { width: input.width, height: input.height, originX, originY });
  for (const key of ['wallWidth', 'doorWidth', 'corridorWidth', 'chamfer', 'grid']) {
    if (input.style[key] !== DEFAULTS[key]) fail(`Invalid ${key}: Revola maps use the fixed value ${DEFAULTS[key]}.`);
    out.style[key] = input.style[key];
  }
  out.style.roughness = boundedNumber(input.style.roughness, 0, out.style.wallWidth / 4, 'roughness');
  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) fail('Invalid texture seed.');
  out.seed = input.seed;
  if (!input.ship || typeof input.ship.mirrored !== 'boolean' || input.ship.x !== 4096 || input.ship.y !== 4740) fail('Invalid fixed ship anchor.');
  out.ship = { x: input.ship.x, y: input.ship.y, mirrored: input.ship.mirrored };
  const ids = new Set(), positions = new Set(), vertices = new Map(), pairs = new Set();
  const uniqueId = id => { checkedId(id); if (ids.has(id)) fail('Duplicate graph identifier.'); ids.add(id); return id; };
  for (const vertex of input.vertices) {
    if (!inBounds(out, vertex)) fail('A vertex is outside the map or is not finite.');
    const point = clean(vertex), key = `${point.x},${point.y}`;
    if (positions.has(key)) fail('Coincident vertices must share one graph identifier.');
    positions.add(key);
    const v = { id: uniqueId(vertex.id), ...point };
    out.vertices.push(v); vertices.set(v.id, v);
  }
  let doorCount = 0, gapCount = 0;
  for (const edge of input.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (!a || !b || !allowed(a, b)) fail('Every wall must be nonzero and follow a 45° direction.');
    const pair = [edge.a, edge.b].sort().join(':');
    if (pairs.has(pair)) fail('Duplicate wall.');
    pairs.add(pair);
    if (!Array.isArray(edge.doors) || (doorCount += edge.doors.length) > MAX_EDGES) fail('Invalid or excessive door data.');
    const length = distance(a, b), half = out.style.doorWidth / (2 * length);
    const endMargin = (out.style.doorWidth / 2 + out.style.wallWidth / 2 + out.style.roughness) / length;
    const doors = edge.doors.map(door => {
      const t = boundedNumber(door.t, 0, 1, 'door position');
      if (t - endMargin < -EPS || t + endMargin > 1 + EPS) fail('A doorway is too close to a wall endpoint.');
      return { id: uniqueId(door.id), t };
    }).sort((x, y) => x.t - y.t);
    for (let i = 1; i < doors.length; i++) if (doors[i].t - doors[i - 1].t < 2 * half - EPS) fail('Doorways cannot overlap.');
    const sourceGaps = edge.gaps ?? [];
    if (!Array.isArray(sourceGaps) || (gapCount += sourceGaps.length) > MAX_EDGES) fail('Invalid or excessive erased-gap data.');
    const gaps = sourceGaps.map(gap => {
      const start = boundedNumber(gap.start, 0, 1, 'erased gap start'), end = boundedNumber(gap.end, 0, 1, 'erased gap end');
      if (end - start <= EPS) fail('Erased gaps must have positive length.');
      return { id: uniqueId(gap.id), start, end };
    }).sort((a, b) => a.start - b.start);
    for (let i = 1; i < gaps.length; i++) if (gaps[i].start < gaps[i - 1].end - EPS) fail('Erased gaps cannot overlap.');
    for (const gap of gaps) if (doors.some(door => gap.start < door.t + half - EPS && gap.end > door.t - half + EPS)) fail('Erased gaps cannot overlap a doorway.');
    out.edges.push({ id: uniqueId(edge.id), a: edge.a, b: edge.b, doors, gaps });
  }
  validateTopology(out, vertices);
  return out;
}

export function snapPoint(point, grid = DEFAULTS.grid) {
  if (!validPoint(point) || !Number.isFinite(grid) || grid <= 0) fail('Invalid point or grid.');
  return clean({ x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid });
}

export function snapEndpoint(start, point, grid = DEFAULTS.grid) {
  if (!validPoint(start) || !validPoint(point) || !Number.isFinite(grid) || grid <= 0) fail('Invalid wall point.');
  let best = { ...start }, bestDistance = Infinity;
  const dx = point.x - start.x, dy = point.y - start.y;
  for (const [x, y] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
    const steps = Math.max(0, Math.round((dx * x + dy * y) / (x * x + y * y) / grid));
    const candidate = clean({ x: start.x + steps * grid * x, y: start.y + steps * grid * y });
    const d = distance(candidate, point);
    if (d < bestDistance) { best = candidate; bestDistance = d; }
  }
  return best;
}

function nextId(doc, prefix) {
  const ids = new Set([...doc.vertices.map(v => v.id), ...doc.edges.flatMap(e => [e.id, ...e.doors.map(d => d.id), ...(e.gaps ?? []).map(g => g.id)])]);
  let i = 1;
  while (ids.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function vertexAt(doc, point) {
  const found = doc.vertices.find(v => same(v, point));
  if (found) return found;
  const vertex = { id: nextId(doc, 'v'), ...clean(point) };
  doc.vertices.push(vertex);
  return vertex;
}

function projection(a, b, point) {
  const delta = sub(b, a), length2 = delta.x ** 2 + delta.y ** 2;
  return ((point.x - a.x) * delta.x + (point.y - a.y) * delta.y) / length2;
}

function onSegment(a, b, p) {
  const t = projection(a, b, p);
  return t >= -EPS && t <= 1 + EPS && distance(lerp(a, b, t), p) < EPS;
}

function intersection(a, b, c, d, infinite = false) {
  const r = sub(b, a), s = sub(d, c), denominator = cross(r, s);
  if (Math.abs(denominator) < EPS) return null;
  const t = cross(sub(c, a), s) / denominator, u = cross(sub(c, a), r) / denominator;
  if (!infinite && (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS)) return null;
  return { point: clean(lerp(a, b, t)), t, u };
}

// Include every grid cell touched by a segment without filling a diagonal's
// entire bounding box. Grid crossings partition it into one-cell intervals.
function segmentCells(a, b) {
  const ts = [0, 1], cells = new Set();
  for (const axis of ['x', 'y']) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPS) continue;
    const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]);
    for (let line = Math.floor(low / TOPOLOGY_CELL) + 1; line * TOPOLOGY_CELL < high; line++) {
      ts.push((line * TOPOLOGY_CELL - a[axis]) / delta);
    }
  }
  ts.sort((x, y) => x - y);
  const include = t => {
    const p = lerp(a, b, t);
    for (let x = Math.floor((p.x - EPS) / TOPOLOGY_CELL); x <= Math.floor((p.x + EPS) / TOPOLOGY_CELL); x++) {
      for (let y = Math.floor((p.y - EPS) / TOPOLOGY_CELL); y <= Math.floor((p.y + EPS) / TOPOLOGY_CELL); y++) cells.add(`${x},${y}`);
    }
  };
  for (let i = 0; i < ts.length; i++) {
    include(ts[i]);
    if (i) include((ts[i - 1] + ts[i]) / 2);
  }
  return cells;
}

function validateTopology(doc, vertices) {
  const buckets = new Map();
  let candidates = 0;
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b), cells = segmentCells(a, b), seen = new Set();
    for (const key of cells) for (const other of buckets.get(key) ?? []) {
      if (seen.has(other.id)) continue;
      seen.add(other.id);
      if (++candidates > MAX_TOPOLOGY_CANDIDATES) fail('Project geometry is too dense to validate safely.');
      const c = vertices.get(other.a), d = vertices.get(other.b);
      if (Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x) || Math.max(c.x, d.x) + EPS < Math.min(a.x, b.x)
        || Math.max(a.y, b.y) + EPS < Math.min(c.y, d.y) || Math.max(c.y, d.y) + EPS < Math.min(a.y, b.y)) continue;
      const shared = [edge.a, edge.b].find(id => id === other.a || id === other.b), hit = intersection(a, b, c, d);
      if (hit && (!shared || !same(hit.point, vertices.get(shared)))) fail('Intersecting walls must be split at a shared graph vertex.');
      if (!hit) {
        const overlap = [a, b].some(p => onSegment(c, d, p) && p.id !== shared)
          || [c, d].some(p => onSegment(a, b, p) && p.id !== shared);
        if (overlap) fail('Overlapping walls must form separate segments with shared graph vertices.');
      }
    }
    for (const key of cells) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(edge);
      else buckets.set(key, [edge]);
    }
  }
}

function mergeIntervals(intervals) {
  const merged = [];
  for (const interval of intervals.filter(i => i.end - i.start > EPS).sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end + EPS) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ start: interval.start, end: interval.end });
  }
  return merged;
}

/** All empty intervals in normalized edge coordinates (fixed doors + free cuts). */
export function edgeGapIntervals(doc, edge) {
  const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
  const half = doc.style.doorWidth / (2 * distance(a, b));
  return mergeIntervals([...(edge.gaps ?? []).map(g => ({ start: g.start, end: g.end })), ...edge.doors.map(d => ({ start: d.t - half, end: d.t + half }))]);
}

export function edgeWallIntervals(doc, edge) {
  const walls = [];
  let previous = 0;
  for (const gap of edgeGapIntervals(doc, edge)) {
    if (gap.start > previous + EPS) walls.push({ start: previous, end: gap.start });
    previous = Math.max(previous, gap.end);
  }
  if (previous < 1 - EPS) walls.push({ start: previous, end: 1 });
  return walls;
}

function setGaps(doc, edge, intervals) {
  const old = edge.gaps ?? [], merged = mergeIntervals(intervals);
  // Reserve every retained ID before allocating new ones. A new cut can sort
  // before an old cut, and must not take the ID that old cut still owns.
  edge.gaps = merged.map(gap => {
    const matching = old.find(g => Math.abs(g.start - gap.start) < EPS && Math.abs(g.end - gap.end) < EPS);
    return { id: matching?.id ?? null, ...gap };
  });
  for (const gap of edge.gaps) if (gap.id === null) gap.id = nextId(doc, 'g');
}

function subtractInterval(interval, start, end) {
  if (end <= interval.start + EPS || start >= interval.end - EPS) return [{ start: interval.start, end: interval.end }];
  const remaining = [];
  if (start > interval.start + EPS) remaining.push({ start: interval.start, end: Math.min(interval.end, start) });
  if (end < interval.end - EPS) remaining.push({ start: Math.max(interval.start, end), end: interval.end });
  return remaining;
}

function fillEdge(doc, edge, a, b, start, end) {
  const low = Math.max(0, Math.min(projection(a, b, start), projection(a, b, end)));
  const high = Math.min(1, Math.max(projection(a, b, start), projection(a, b, end)));
  if (high - low <= EPS) return;
  const half = doc.style.doorWidth / (2 * distance(a, b));
  const gaps = (edge.gaps ?? []).flatMap(gap => subtractInterval(gap, low, high)), doors = [];
  for (const door of edge.doors) {
    const interval = { start: door.t - half, end: door.t + half };
    if (low >= interval.end - EPS || high <= interval.start + EPS) doors.push(door);
    else gaps.push(...subtractInterval(interval, low, high));
  }
  edge.doors = doors;
  setGaps(doc, edge, gaps);
}

function splitEdge(doc, edge, points) {
  const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
  const half = (doc.style.doorWidth / 2 + doc.style.wallWidth / 2 + doc.style.roughness) / distance(a, b);
  const ts = [0, ...points.map(p => projection(a, b, p)).filter(t => t > EPS && t < 1 - EPS), 1]
    .sort((x, y) => x - y).filter((t, i, arr) => i === 0 || t - arr[i - 1] > EPS);
  if (ts.length === 2) return;
  for (const t of ts.slice(1, -1)) if (edge.doors.some(d => Math.abs(d.t - t) < half - EPS)) fail('This intersection would cut through a doorway.');
  const replacement = [];
  const usedGapIds = new Set();
  for (let i = 0; i < ts.length - 1; i++) {
    const low = ts[i], high = ts[i + 1];
    const va = vertexAt(doc, lerp(a, b, low)), vb = vertexAt(doc, lerp(a, b, high));
    const doors = edge.doors.filter(d => d.t >= low && d.t < high).map(d => ({ id: d.id, t: (d.t - low) / (high - low) }));
    const piece = { id: i === 0 ? edge.id : nextId(doc, 'e'), a: va.id, b: vb.id, doors, gaps: [] };
    // Add immediately so subsequently allocated IDs are unique.
    if (i > 0) doc.edges.push(piece);
    for (const gap of edge.gaps ?? []) {
      const start = Math.max(low, gap.start), end = Math.min(high, gap.end);
      if (end - start <= EPS) continue;
      const id = usedGapIds.has(gap.id) ? nextId(doc, 'g') : gap.id;
      usedGapIds.add(gap.id);
      piece.gaps.push({ id, start: Math.max(0, (start - low) / (high - low)), end: Math.min(1, (end - low) / (high - low)) });
    }
    replacement.push(piece);
  }
  const index = doc.edges.indexOf(edge);
  doc.edges[index] = replacement[0];
}

function insertWall(doc, start, end) {
  ensureCanvasContains(doc, [start, end]);
  if (!allowed(start, end)) fail('Walls must have length and follow a 45° direction.');
  const points = [clean(start), clean(end)], splits = [], covered = [];
  const vertices = new Map(doc.vertices.map(v => [v.id, v]));
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b), hit = intersection(start, end, a, b);
    const cuts = [];
    if (hit) { points.push(hit.point); cuts.push(hit.point); }
    else if (distance(lerp(a, b, projection(a, b, start)), start) < EPS && distance(lerp(a, b, projection(a, b, end)), end) < EPS) {
      fillEdge(doc, edge, a, b, start, end);
      covered.push({ edge, a, b });
      for (const p of [a, b]) if (onSegment(start, end, p)) points.push(p);
    }
    if (cuts.length) splits.push({ edge, cuts });
  }
  for (const { edge, cuts } of splits) splitEdge(doc, edge, cuts);
  const sorted = points.sort((a, b) => projection(start, end, a) - projection(start, end, b)).filter((p, i, arr) => i === 0 || !same(p, arr[i - 1]));
  const result = [];
  for (let i = 1; i < sorted.length; i++) {
    const midpoint = lerp(sorted[i - 1], sorted[i], 0.5);
    const existing = covered.find(({ a, b }) => onSegment(a, b, midpoint));
    if (existing) { if (!result.includes(existing.edge)) result.push(existing.edge); continue; }
    const a = vertexAt(doc, sorted[i - 1]), b = vertexAt(doc, sorted[i]);
    let edge = doc.edges.find(e => (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id));
    if (!edge) { edge = { id: nextId(doc, 'e'), a: a.id, b: b.id, doors: [], gaps: [] }; doc.edges.push(edge); }
    result.push(edge);
  }
  if (doc.edges.length > MAX_EDGES || doc.vertices.length > MAX_VERTICES) fail('Project exceeds the geometry limit.');
  return result;
}

function transaction(doc, operation) {
  const draft = copy(doc), result = operation(draft);
  if (draft.edges.reduce((sum, edge) => sum + edge.doors.length + (edge.gaps?.length ?? 0), 0) > MAX_EDGES) fail('Project exceeds the wall-gap limit.');
  Object.assign(doc, draft);
  return result;
}

function joinTolerance(doc, options = {}) {
  const value = options.joinTolerance ?? doc.style.wallWidth;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : doc.style.wallWidth;
}

function solidAt(doc, edge, t, clearance, vertices) {
  const length = distance(vertices.get(edge.a), vertices.get(edge.b)), margin = clearance / length;
  const halfDoor = doc.style.doorWidth / (2 * length);
  return !(edge.gaps ?? []).some(gap => t >= gap.start - margin - EPS && t <= gap.end + margin + EPS)
    && !edge.doors.some(door => Math.abs(t - door.t) <= halfDoor + margin + EPS);
}

/** Pick a visible wall centerline, without attracting drawing into erased gaps. */
export function snapWallStart(doc, point, options = {}) {
  if (!validPoint(point)) fail('Invalid wall point.');
  const tolerance = joinTolerance(doc, options), vertices = new Map(doc.vertices.map(v => [v.id, v]));
  // Reuse a nearby solid graph endpoint before projecting onto a wall face.
  // A face can be closer than its corner; splitting there leaves a tiny extra
  // arm or triangle when the new 45-degree wall crosses the adjoining side.
  let endpoint = null, endpointDistance = tolerance + EPS;
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    const aim = Math.max(0, Math.min(1, projection(a, b, point)));
    for (const [vertex, t] of [[a, 0], [b, 1]]) {
      const d = distance(vertex, point);
      // A nearby endpoint must not pull an aim out of, or across, a real cut.
      const clearance = Math.abs(aim - t) * distance(a, b);
      if (d < endpointDistance && solidAt(doc, edge, t, clearance, vertices)) {
        endpoint = vertex; endpointDistance = d;
      }
    }
  }
  if (endpoint) return clean(endpoint);
  let best = { ...point }, bestDistance = tolerance + EPS;
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    const t = Math.max(0, Math.min(1, projection(a, b, point)));
    if (!solidAt(doc, edge, t, 0, vertices)) continue;
    const candidate = clean(lerp(a, b, t)), d = distance(candidate, point);
    if (d < bestDistance) { best = candidate; bestDistance = d; }
  }
  return clean(best);
}

/** Preview the same line-preserving corner attraction used by wall insertion. */
export function resolveWallEndpoint(doc, start, point, options = {}) {
  if (!validPoint(start) || !validPoint(point)) fail('Invalid wall point.');
  if (!allowed(start, point)) return clean(point);
  const tolerance = joinTolerance(doc, options), vertices = new Map(doc.vertices.map(v => [v.id, v]));
  let best = clean(point), score = tolerance + EPS;
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b), hit = intersection(start, point, a, b, true);
    const candidates = hit ? [hit.point] : [a, b].filter(p => distance(lerp(start, point, projection(start, point, p)), p) < EPS);
    for (const candidate of candidates) {
      const d = distance(point, candidate), t = projection(a, b, candidate);
      if (d > tolerance + EPS || projection(start, point, candidate) <= EPS) continue;
      let targetDistance = 0;
      if (t < -EPS || t > 1 + EPS) {
        const terminal = t < 0 ? a : b;
        targetDistance = distance(terminal, candidate);
        if (targetDistance > tolerance + EPS || incidentEdges(doc, terminal.id).length !== 1 || atShipPort(doc, terminal)) continue;
      }
      if (!solidAt(doc, edge, Math.max(0, Math.min(1, t)), doc.style.wallWidth / 2 + doc.style.roughness, vertices)) continue;
      const candidateScore = Math.max(d, targetDistance);
      if (candidateScore < score) { best = clean(candidate); score = candidateScore; }
    }
  }
  return best;
}

export function addWall(doc, start, end, options = {}) {
  if (!allowed(start, end)) fail('Walls must have length and follow a 45° direction.');
  return transaction(doc, draft => {
    const actualStart = snapWallStart(draft, start, options);
    const actualEnd = clean({ x: end.x + actualStart.x - start.x, y: end.y + actualStart.y - start.y });
    const unsnapped = copy(draft);
    let result, committedStart = actualStart, committedEnd = actualEnd;
    try {
      // Resolve endpoints before intersection splitting, otherwise a slight
      // overshoot leaves a tiny third arm where a clean corner was intended.
      const a = vertexAt(draft, actualStart), b = vertexAt(draft, actualEnd);
      const probe = { id: nextId(draft, 'e'), a: a.id, b: b.id, doors: [], gaps: [] };
      draft.edges.push(probe);
      const joined = joinNearbyWalls(draft, [a.id, b.id], joinTolerance(draft, options));
      committedStart = clean(draft.vertices.find(v => v.id === (joined.get(a.id) ?? a.id)));
      committedEnd = clean(draft.vertices.find(v => v.id === (joined.get(b.id) ?? b.id)));
      draft.edges = draft.edges.filter(edge => edge.id !== probe.id);
      result = insertWall(draft, committedStart, committedEnd);
      const used = new Set(draft.edges.flatMap(edge => [edge.a, edge.b]));
      draft.vertices = draft.vertices.filter(v => used.has(v.id));
      validateDocument(draft);
    } catch {
      Object.assign(draft, unsnapped);
      result = insertWall(draft, actualStart, actualEnd);
      committedStart = actualStart; committedEnd = actualEnd;
      validateDocument(draft);
    }
    if (joinTolerance(draft, options) > 0) {
      const startId = draft.vertices.find(v => same(v, committedStart))?.id;
      const endId = draft.vertices.find(v => same(v, committedEnd))?.id;
      const adjusted = new Map();
      joinNearWallFaces(draft, result.map(edge => edge.id), adjusted);
      committedStart = adjusted.get(startId) ?? committedStart;
      committedEnd = adjusted.get(endId) ?? committedEnd;
    }
    // Keep the edge-array API, with actual endpoints for chained UI drawing.
    const current = result.map(edge => draft.edges.find(e => e.id === edge.id)).filter(Boolean);
    current.start = committedStart;
    current.end = committedEnd;
    return current;
  });
}

export function nearestEdge(doc, point, maxDistance = Infinity) {
  const vertices = new Map(doc.vertices.map(v => [v.id, v]));
  let best = null;
  for (const edge of doc.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    const t = Math.max(0, Math.min(1, projection(a, b, point))), projected = lerp(a, b, t), d = distance(point, projected);
    if (d <= maxDistance && (!best || d < best.distance)) best = { edge, a, b, point: projected, t, distance: d };
  }
  return best;
}

export function addDoor(doc, edgeId, point, options = {}) {
  const target = resolveDoorPlacement(doc, edgeId, point, options);
  if (!target) return false;
  if (!target.crossesSplit) {
    const edge = doc.edges.find(e => e.id === target.hostEdgeId);
    edge.doors.push({ id: nextId(doc, 'd'), t: target.hostT });
    edge.doors.sort((x, y) => x.t - y.t);
    return true;
  }
  // Incidental collinear splits must not prevent a physical door from crossing
  // their location. Consolidate only this straight, unbranched span; preserve
  // cut IDs and world positions, structural ends and fixed ship ports.
  const draft = copy(doc), span = target.span, replaced = new Set(span.edgeIds);
  const edge = { id: edgeId, a: span.a.id, b: span.b.id, doors: [], gaps: [] };
  for (const cut of span.cuts) {
    if (cut.kind === 'door') edge.doors.push({ id: cut.id, t: (cut.start + cut.end) / (2 * span.length) });
    else edge.gaps.push({ id: cut.id, start: cut.start / span.length, end: cut.end / span.length });
  }
  edge.doors.push({ id: nextId(draft, 'd'), t: target.t });
  edge.doors.sort((x, y) => x.t - y.t);
  const index = draft.edges.findIndex(e => replaced.has(e.id));
  draft.edges = draft.edges.filter(e => !replaced.has(e.id));
  draft.edges.splice(index, 0, edge);
  const used = new Set(draft.edges.flatMap(e => [e.a, e.b]));
  draft.vertices = draft.vertices.filter(v => used.has(v.id));
  try { validateDocument(draft); } catch { return false; }
  Object.assign(doc, draft);
  return true;
}

export function removeDoor(doc, edgeId, doorId) {
  const edge = doc.edges.find(e => e.id === edgeId);
  if (!edge) return false;
  const index = edge.doors.findIndex(d => d.id === doorId);
  if (index < 0) return false;
  edge.doors.splice(index, 1);
  return true;
}

export function removeEdge(doc, id) {
  const index = doc.edges.findIndex(e => e.id === id);
  if (index < 0) return false;
  doc.edges.splice(index, 1);
  const used = new Set(doc.edges.flatMap(e => [e.a, e.b]));
  doc.vertices = doc.vertices.filter(v => used.has(v.id));
  return true;
}

function circleCut(a, b, center, radius) {
  const delta = sub(b, a), offset = sub(a, center);
  const aa = delta.x ** 2 + delta.y ** 2, bb = 2 * (delta.x * offset.x + delta.y * offset.y);
  const cc = offset.x ** 2 + offset.y ** 2 - radius ** 2, discriminant = bb ** 2 - 4 * aa * cc;
  if (discriminant <= 0) return null;
  const root = Math.sqrt(discriminant), start = Math.max(0, (-bb - root) / (2 * aa)), end = Math.min(1, (-bb + root) / (2 * aa));
  return end - start > EPS ? { start, end } : null;
}

function slabRange(value, delta, low, high) {
  if (Math.abs(delta) < EPS) return value >= low && value <= high ? { start: 0, end: 1 } : null;
  const one = (low - value) / delta, two = (high - value) / delta;
  const start = Math.max(0, Math.min(one, two)), end = Math.min(1, Math.max(one, two));
  return end - start > EPS ? { start, end } : null;
}

function capsuleCuts(a, b, from, to, radius) {
  const cuts = [circleCut(a, b, from, radius), circleCut(a, b, to, radius)].filter(Boolean);
  const brush = sub(to, from), length = distance(from, to);
  if (length > EPS) {
    const dx = brush.x / length, dy = brush.y / length, offset = sub(a, from), delta = sub(b, a);
    const along = slabRange(offset.x * dx + offset.y * dy, delta.x * dx + delta.y * dy, 0, length);
    const across = slabRange(offset.x * -dy + offset.y * dx, delta.x * -dy + delta.y * dx, -radius, radius);
    if (along && across) {
      const start = Math.max(along.start, across.start), end = Math.min(along.end, across.end);
      if (end - start > EPS) cuts.push({ start, end });
    }
  }
  return mergeIntervals(cuts);
}

/** Erase wall centerline intervals covered by a circular brush swept from → to. */
export function eraseWalls(doc, from, to, radius) {
  if (!validPoint(from) || !validPoint(to) || !Number.isFinite(radius) || radius <= 0 || radius > 2048) return false;
  return transaction(doc, draft => {
    const vertices = new Map(draft.vertices.map(v => [v.id, v]));
    let changed = false;
    for (const edge of [...draft.edges]) {
      const a = vertices.get(edge.a), b = vertices.get(edge.b), cuts = capsuleCuts(a, b, from, to, radius);
      if (!cuts.length) continue;
      const before = edgeGapIntervals(draft, edge), combined = mergeIntervals([...before, ...cuts]);
      if (before.length === combined.length && before.every((gap, i) => Math.abs(gap.start - combined[i].start) < EPS && Math.abs(gap.end - combined[i].end) < EPS)) continue;
      changed = true;
      if (combined.length === 1 && combined[0].start <= EPS && combined[0].end >= 1 - EPS) {
        removeEdge(draft, edge.id);
        continue;
      }
      const half = draft.style.doorWidth / (2 * distance(a, b)), doors = [], gaps = [...(edge.gaps ?? []), ...cuts];
      for (const door of edge.doors) {
        const interval = { start: door.t - half, end: door.t + half };
        if (cuts.some(cut => cut.start <= interval.end + EPS && cut.end >= interval.start - EPS)) gaps.push(interval);
        else doors.push(door);
      }
      edge.doors = doors;
      setGaps(draft, edge, gaps);
    }
    return changed;
  });
}

export function roomSegments(start, end, rotated = false, chamfer = DEFAULTS.chamfer) {
  if (!validPoint(start) || !validPoint(end) || !Number.isFinite(chamfer) || chamfer <= 0) fail('Invalid room geometry.');
  const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x), top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  if (right - left <= 2 * chamfer || bottom - top <= 2 * chamfer) fail(`Rooms must be wider and taller than ${2 * chamfer} pixels.`);
  let points = [{ x: left + chamfer, y: top }, { x: right - chamfer, y: top }, { x: right, y: top + chamfer }, { x: right, y: bottom - chamfer },
    { x: right - chamfer, y: bottom }, { x: left + chamfer, y: bottom }, { x: left, y: bottom - chamfer }, { x: left, y: top + chamfer }];
  if (rotated) {
    const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
    points = points.map(p => clean({ x: center.x + (p.x - center.x - p.y + center.y) * Math.SQRT1_2, y: center.y + (p.x - center.x + p.y - center.y) * Math.SQRT1_2 }));
  }
  return points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
}

export function addRoom(doc, start, end, rotated = false) {
  return transaction(doc, draft => {
    const result = roomSegments(start, end, rotated, doc.style.chamfer).flatMap(({ a, b }) => insertWall(draft, a, b));
    joinNearWallFaces(draft, result.map(edge => edge.id));
    validateDocument(draft);
    return result;
  });
}

export function corridorSegments(points, width = DEFAULTS.corridorWidth) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 1000 || !Number.isFinite(width) || width <= 0) fail('A corridor needs at least two points.');
  const path = points.filter((p, i) => i === 0 || !same(p, points[i - 1])).map(p => ({ ...p }));
  if (path.length < 2) fail('A corridor needs a nonzero path.');
  for (let i = 1; i < path.length; i++) if (!validPoint(path[i - 1]) || !validPoint(path[i]) || !allowed(path[i - 1], path[i])) fail('Corridor centerlines must follow 45° directions.');
  // Remove redundant forward points before calculating mitres.
  for (let i = path.length - 2; i > 0; i--) {
    const before = sub(path[i], path[i - 1]), after = sub(path[i + 1], path[i]);
    if (Math.abs(cross(before, after)) < EPS && before.x * after.x + before.y * after.y > 0) path.splice(i, 1);
  }
  const normals = path.slice(1).map((p, i) => { const d = sub(p, path[i]), length = distance(p, path[i]); return { x: -d.y / length, y: d.x / length }; });
  for (let i = 1; i < normals.length; i++) if (normals[i].x * normals[i - 1].x + normals[i].y * normals[i - 1].y < -EPS) fail('Corridors cannot turn more than 90° at one corner.');
  const sides = [-1, 1].map(sign => {
    const offset = (p, n) => clean({ x: p.x + n.x * width / 2 * sign, y: p.y + n.y * width / 2 * sign });
    const result = [offset(path[0], normals[0])];
    for (let i = 1; i < path.length - 1; i++) {
      const hit = intersection(offset(path[i - 1], normals[i - 1]), offset(path[i], normals[i - 1]), offset(path[i], normals[i]), offset(path[i + 1], normals[i]), true);
      if (!hit) fail('Corridor has an unsupported reversal.');
      result.push(hit.point);
    }
    result.push(offset(path.at(-1), normals.at(-1)));
    for (let i = 1; i < result.length; i++) {
      const boundary = sub(result[i], result[i - 1]), center = sub(path[i], path[i - 1]);
      if (!allowed(result[i - 1], result[i]) || boundary.x * center.x + boundary.y * center.y <= EPS) fail('Corridor corners are too close together.');
    }
    return result;
  });
  const segments = sides.flatMap(side => side.slice(1).map((b, i) => ({ a: side[i], b })));
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const one = segments[i], two = segments[j], hit = intersection(one.a, one.b, two.a, two.b);
    const shared = [one.a, one.b].some(p => same(p, two.a) || same(p, two.b));
    if (hit && !shared) fail('This corridor overlaps itself.');
    if (!hit && !shared && [one.a, one.b].some(p => onSegment(two.a, two.b, p))) fail('This corridor overlaps itself.');
  }
  return segments;
}

export function addCorridor(doc, points) {
  return transaction(doc, draft => {
    const result = corridorSegments(points, doc.style.corridorWidth).flatMap(({ a, b }) => insertWall(draft, a, b));
    joinNearWallFaces(draft, result.map(edge => edge.id));
    validateDocument(draft);
    return result;
  });
}

const incidentEdges = (doc, vertexId) => doc.edges.filter(edge => edge.a === vertexId || edge.b === vertexId);
const otherEnd = (edge, id) => edge.a === id ? edge.b : edge.a;

// A receiving wall may be drawn last, so its own endpoints are not the only
// possible joins. Extend older solid free ends that nearly touch its face to
// its centerline. This is a graph edit, never a render-time patch over a cut.
function joinNearWallFaces(doc, targetIds, endpointUpdates = new Map()) {
  const targets = new Set(targetIds), vertices = new Map(doc.vertices.map(v => [v.id, v]));
  const adjacent = new Map(), buckets = new Map();
  for (const edge of doc.edges) {
    for (const id of [edge.a, edge.b]) {
      if (!adjacent.has(id)) adjacent.set(id, []);
      adjacent.get(id).push(edge);
    }
    for (const key of segmentCells(vertices.get(edge.a), vertices.get(edge.b))) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(edge);
    }
  }
  const proposals = [], clearance = doc.style.wallWidth / 2 + doc.style.roughness;
  let comparisons = 0;
  for (const vertex of doc.vertices) {
    const incident = adjacent.get(vertex.id);
    if (incident?.length !== 1 || atShipPort(doc, vertex)) continue;
    const edge = incident[0], fixed = vertices.get(otherEnd(edge, vertex.id));
    if (!solidAt(doc, edge, edge.a === vertex.id ? 0 : 1, 0, vertices)) continue;
    const seen = new Set();
    let best = null;
    for (let x = Math.floor((vertex.x - 50) / TOPOLOGY_CELL); x <= Math.floor((vertex.x + 50) / TOPOLOGY_CELL); x++) {
      for (let y = Math.floor((vertex.y - 50) / TOPOLOGY_CELL); y <= Math.floor((vertex.y + 50) / TOPOLOGY_CELL); y++) {
        for (const target of buckets.get(`${x},${y}`) ?? []) {
          if (target.id === edge.id || seen.has(target.id)) continue;
          seen.add(target.id);
          if (!targets.has(edge.id) && !targets.has(target.id)) continue;
          if (++comparisons > MAX_TOPOLOGY_CANDIDATES) return 0;
          const a = vertices.get(target.a), b = vertices.get(target.b), hit = intersection(fixed, vertex, a, b, true);
          if (!hit || hit.t <= 1 + EPS || hit.u < -EPS || hit.u > 1 + EPS) continue;
          const advance = distance(vertex, hit.point);
          const normalGap = distance(vertex, lerp(a, b, projection(a, b, vertex)));
          if (advance > 50 + EPS || normalGap > clearance + 8 + EPS
            || !solidAt(doc, target, hit.u, clearance, vertices)) continue;
          if (!best || advance < best.advance) best = { vertexId: vertex.id, targetId: target.id, point: hit.point, advance };
        }
      }
    }
    if (best) proposals.push(best);
  }
  if (!proposals.length) return 0;
  const draft = copy(doc), pieces = new Map();
  const currentVertices = new Map(draft.vertices.map(v => [v.id, v]));
  const currentEdges = new Map(draft.edges.map(e => [e.id, e]));
  const degrees = new Map([...adjacent].map(([id, edges]) => [id, edges.length]));
  for (const id of new Set(proposals.map(proposal => proposal.targetId))) pieces.set(id, [currentEdges.get(id)]);
  let joined = 0;
  const adjusted = new Map();
  try {
    for (const proposal of proposals.sort((a, b) => a.advance - b.advance)) {
      const vertex = currentVertices.get(proposal.vertexId);
      if (!vertex || degrees.get(vertex.id) !== 1) continue;
      // An earlier proposal may have split the original incident edge. Its ID
      // stays on the first child, which may no longer contain this endpoint.
      const moving = draft.edges.find(edge => edge.a === vertex.id || edge.b === vertex.id);
      const family = pieces.get(proposal.targetId);
      const target = family?.find(e => onSegment(currentVertices.get(e.a), currentVertices.get(e.b), proposal.point));
      if (!moving || !target || moving.id === target.id) continue;
      const a = currentVertices.get(target.a), b = currentVertices.get(target.b);
      if (!solidAt(draft, target, projection(a, b, proposal.point), clearance, currentVertices)) continue;
      const oldA = { ...currentVertices.get(moving.a) }, oldB = { ...currentVertices.get(moving.b) };
      const nextA = moving.a === vertex.id ? proposal.point : oldA, nextB = moving.b === vertex.id ? proposal.point : oldB;
      moving.doors = moving.doors.map(door => ({ ...door, t: projection(nextA, nextB, lerp(oldA, oldB, door.t)) }));
      moving.gaps = (moving.gaps ?? []).map(gap => ({ ...gap,
        start: projection(nextA, nextB, lerp(oldA, oldB, gap.start)), end: projection(nextA, nextB, lerp(oldA, oldB, gap.end)) }));
      Object.assign(vertex, proposal.point);
      adjusted.set(vertex.id, clean(proposal.point));
      ensureCanvasContains(draft, [vertex]);
      const endpoint = [a, b].find(p => same(p, vertex));
      if (endpoint) {
        if (moving.a === vertex.id) moving.a = endpoint.id;
        else moving.b = endpoint.id;
        draft.vertices = draft.vertices.filter(v => v.id !== vertex.id);
        currentVertices.delete(vertex.id);
        degrees.set(endpoint.id, degrees.get(endpoint.id) + 1);
      } else {
        const index = draft.edges.indexOf(target), count = draft.edges.length;
        splitEdge(draft, target, [vertex]);
        const children = [draft.edges[index], ...draft.edges.slice(count)];
        family.splice(family.indexOf(target), 1, ...children);
        for (const child of children) currentEdges.set(child.id, child);
        degrees.set(vertex.id, 3);
      }
      joined++;
    }
    validateDocument(draft);
    if (joined) {
      Object.assign(doc, draft);
      for (const [id, point] of adjusted) endpointUpdates.set(id, point);
    }
    return joined;
  } catch {
    // Optional joining must never damage an otherwise legal construction.
    return 0;
  }
}

// Only free ends may slide along their wall to make a nearby corner. Existing
// corners keep their position; another free end can extend up to that corner.
// The real graph is joined, so subsequent drags and exports share the junction.
function joinNearbyWalls(doc, activeIds, tolerance) {
  const aliases = new Map();
  for (const initialId of new Set(activeIds)) {
    const vertices = new Map(doc.vertices.map(v => [v.id, v]));
    const id = aliases.get(initialId) ?? initialId, vertex = vertices.get(id);
    if (!vertex) continue;
    const attached = incidentEdges(doc, id), free = attached.length === 1 && !atShipPort(doc, vertex);
    if (!attached.length || !attached.some(edge => solidAt(doc, edge, edge.a === id ? 0 : 1, 0, vertices))) continue;
    const fixed = free ? vertices.get(otherEnd(attached[0], id)) : null;
    const candidates = [];
    for (const edge of doc.edges) {
      if (attached.includes(edge)) continue;
      const a = vertices.get(edge.a), b = vertices.get(edge.b);
      const hit = free ? intersection(fixed, vertex, a, b, true) : null;
      let points;
      if (!free) points = distance(lerp(a, b, projection(a, b, vertex)), vertex) < EPS ? [vertex] : [];
      else if (hit) points = [hit.point];
      else {
        points = [a, b].filter(p => {
          if (distance(lerp(fixed, vertex, projection(fixed, vertex, p)), p) >= EPS) return false;
          const other = p === a ? b : a, outgoing = sub(p, other), incoming = sub(vertex, fixed);
          // Facing collinear ends can join. Coincident whole parallel walls
          // remain collisions rather than being silently deleted/overlaid.
          return outgoing.x * incoming.x + outgoing.y * incoming.y < -EPS;
        });
      }
      for (const point of points) {
        const d = distance(vertex, point);
        if (d > tolerance + EPS || (!free && d > EPS)) continue;
        if (free && projection(fixed, vertex, point) <= EPS) continue;
        const t = projection(a, b, point);
        let endpoint = t <= EPS ? a : t >= 1 - EPS ? b : null;
        if (!endpoint) {
          // A small overshoot is a corner, not a T-junction with a short spur.
          endpoint = [a, b].filter(p => distance(p, point) <= tolerance + EPS && incidentEdges(doc, p.id).length === 1 && !atShipPort(doc, p))
            .sort((one, two) => distance(one, point) - distance(two, point))[0] ?? null;
        }
        const targetDistance = endpoint ? distance(endpoint, point) : 0;
        if (targetDistance > tolerance + EPS) continue;
        if (targetDistance > EPS && (incidentEdges(doc, endpoint.id).length !== 1 || atShipPort(doc, endpoint))) continue;
        if (!solidAt(doc, edge, Math.max(0, Math.min(1, t)), doc.style.wallWidth / 2 + doc.style.roughness, vertices)) continue;
        candidates.push({ edge, point: clean(point), endpoint, score: Math.max(d, targetDistance) });
      }
    }
    candidates.sort((a, b) => a.score - b.score || Number(!a.endpoint) - Number(!b.endpoint));
    const best = candidates[0];
    if (!best) continue;
    const adjust = (moving, point) => {
      if (same(moving, point)) return;
      if (atShipPort(doc, moving)) fail('Ship ports cannot move.');
      const affected = incidentEdges(doc, moving.id);
      if (affected.length !== 1) fail('Only free wall ends may extend to a nearby corner.');
      const edge = affected[0], oldA = { ...vertices.get(edge.a) }, oldB = { ...vertices.get(edge.b) };
      const nextA = edge.a === moving.id ? point : oldA, nextB = edge.b === moving.id ? point : oldB;
      const before = sub(oldB, oldA), after = sub(nextB, nextA);
      if (!allowed(nextA, nextB) || Math.abs(cross(before, after)) > EPS * distance(oldA, oldB)
        || before.x * after.x + before.y * after.y <= EPS) fail('A join cannot reverse a wall.');
      // Attraction must not move existing openings along the stationary wall.
      edge.doors = edge.doors.map(door => ({ ...door, t: projection(nextA, nextB, lerp(oldA, oldB, door.t)) }));
      edge.gaps = (edge.gaps ?? []).map(gap => ({ ...gap,
        start: projection(nextA, nextB, lerp(oldA, oldB, gap.start)), end: projection(nextA, nextB, lerp(oldA, oldB, gap.end)) }));
      Object.assign(moving, point);
      ensureCanvasContains(doc, [point]);
    };
    adjust(vertex, best.point);
    if (best.endpoint) {
      adjust(best.endpoint, best.point);
      const keep = atShipPort(doc, best.endpoint) ? best.endpoint : vertex;
      const remove = keep === vertex ? best.endpoint : vertex;
      for (const edge of doc.edges) {
        if (edge.a === remove.id) edge.a = keep.id;
        if (edge.b === remove.id) edge.b = keep.id;
      }
      doc.vertices = doc.vertices.filter(v => v.id !== remove.id);
      aliases.set(remove.id, keep.id);
      for (const [old, current] of aliases) if (current === remove.id) aliases.set(old, keep.id);
    } else splitEdge(doc, best.edge, [best.point]);
  }
  return aliases;
}

// Every movement is atomic and retains graph topology, edge orientation and
// doorway identity. Recognized rooms can move their entire boundary; ordinary
// local dragging remains limited to joints with at most two incident walls.
function tryMove(doc, calculate, options) {
  const draft = copy(doc), original = new Map(doc.vertices.map(v => [v.id, v]));
  const vertices = new Map(draft.vertices.map(v => [v.id, v]));
  try {
    if (!calculate(draft, vertices)) return false;
    const moved = new Set(draft.vertices.filter(v => !same(v, original.get(v.id))).map(v => v.id));
    if (!moved.size) return false;
    if ([...moved].some(id => atShipPort(doc, original.get(id)))) return false;
    ensureCanvasContains(draft, [...moved].map(id => vertices.get(id)));
    const changed = new Set(draft.edges.filter(e => moved.has(e.a) || moved.has(e.b)).map(e => e.id));
    for (const edge of draft.edges) {
      if (!changed.has(edge.id)) continue;
      const before = sub(original.get(edge.b), original.get(edge.a)), after = sub(vertices.get(edge.b), vertices.get(edge.a));
      // The same ray must survive; crossing through a neighboring corner is invalid.
      if (Math.abs(cross(before, after)) > EPS * Math.max(1, Math.hypot(before.x, before.y)) || before.x * after.x + before.y * after.y <= EPS) return false;
    }
    const unsnapped = copy(draft);
    try {
      joinNearbyWalls(draft, [...moved], joinTolerance(draft, options));
      validateDocument(draft);
    } catch {
      // An unsafe optional attraction must not block an otherwise legal drag.
      validateDocument(unsnapped);
      Object.assign(draft, unsnapped);
    }
    if (joinTolerance(draft, options) > 0) joinNearWallFaces(draft, [...changed]);
    Object.assign(doc, draft);
    return true;
  } catch {
    return false;
  }
}

function slideJoint(draft, vertices, vertexId, movingEdge, lineA, lineB, freePosition) {
  const oldJoint = vertices.get(vertexId);
  // A wall may stretch while its port stays pinned, but it cannot move the port.
  if (atShipPort(draft, oldJoint)) {
    return distance(lerp(lineA, lineB, projection(lineA, lineB, oldJoint)), oldJoint) < EPS ? clean(oldJoint) : null;
  }
  const attached = incidentEdges(draft, vertexId);
  if (attached.length > 2) return null;
  const adjacent = attached.find(edge => edge.id !== movingEdge.id);
  if (!adjacent) return clean(freePosition);
  const fixed = vertices.get(otherEnd(adjacent, vertexId));
  return intersection(lineA, lineB, oldJoint, fixed, true)?.point ?? null;
}

/** Translate a selection together, without moving its unselected neighbors. */
export function moveSelection(doc, selection, delta) {
  if (!validPoint(delta) || !selection || !Array.isArray(selection.edgeIds ?? [])
    || !Array.isArray(selection.vertexIds ?? [])) return false;
  const original = new Map(doc.vertices.map(vertex => [vertex.id, vertex]));
  const edges = new Map(doc.edges.map(edge => [edge.id, edge]));
  const selected = new Set(selection.vertexIds ?? []);
  for (const id of selection.edgeIds ?? []) {
    const edge = edges.get(id);
    if (!edge) return false;
    selected.add(edge.a); selected.add(edge.b);
  }
  if (!selected.size || [...selected].some(id => !original.has(id) || atShipPort(doc, original.get(id)))) return false;

  // A connection to a stationary vertex may only stretch along its original
  // ray. Parallel boundary connections share one permitted translation;
  // different directions leave no nonzero rigid movement for this selection.
  let direction = null;
  const boundary = [];
  for (const edge of doc.edges) {
    if (selected.has(edge.a) === selected.has(edge.b)) continue;
    const before = sub(original.get(edge.b), original.get(edge.a));
    const next = { x: Math.abs(before.x) < EPS ? 0 : Math.sign(before.x), y: Math.abs(before.y) < EPS ? 0 : Math.sign(before.y) };
    if (direction && Math.abs(cross(direction, next)) > EPS) return false;
    direction = next;
    boundary.push(edge);
  }
  let shift = delta;
  if (direction) {
    const amount = (delta.x * direction.x + delta.y * direction.y) / (direction.x ** 2 + direction.y ** 2);
    shift = { x: direction.x * amount, y: direction.y * amount };
  }
  shift = clean(shift);
  if (!validPoint(shift) || Math.hypot(shift.x, shift.y) < EPS) return false;

  const draft = copy(doc), vertices = new Map(draft.vertices.map(vertex => [vertex.id, vertex]));
  try {
    for (const id of selected) {
      const vertex = vertices.get(id);
      Object.assign(vertex, clean({ x: vertex.x + shift.x, y: vertex.y + shift.y }));
    }
    for (const edge of boundary) {
      const before = sub(original.get(edge.b), original.get(edge.a)), after = sub(vertices.get(edge.b), vertices.get(edge.a));
      if (Math.abs(cross(before, after)) > EPS * Math.max(1, Math.hypot(before.x, before.y))
        || before.x * after.x + before.y * after.y <= EPS) return false;
    }
    ensureCanvasContains(draft, [...selected].map(id => vertices.get(id)));
    // Do not attract individual endpoints: doing so would shear the group or
    // move geometry outside the selection. Existing topology remains intact.
    validateDocument(draft);
    Object.assign(doc, draft);
    return true;
  } catch {
    return false;
  }
}

/** Resize a recognized room, or translate an ordinary wall and its neighbors. */
export function moveWall(doc, edgeId, delta, options = {}) {
  if (!validPoint(delta)) return false;
  return tryMove(doc, (draft, vertices) => {
    const resize = proposeRoomResize(draft, edgeId, delta);
    if (resize) {
      // A recognized room must never silently fall back to distorting a corner.
      // tryMove also validates external attachments, pins, doors and collisions.
      if (resize.blocked) return false;
      for (const [id, position] of resize.positions) Object.assign(vertices.get(id), position);
      return true;
    }
    const edge = draft.edges.find(e => e.id === edgeId);
    if (!edge) return false;
    const a = vertices.get(edge.a), b = vertices.get(edge.b), dx = b.x - a.x, dy = b.y - a.y;
    const offset = (delta.x * -dy + delta.y * dx) / (dx * dx + dy * dy);
    const shift = { x: -dy * offset, y: dx * offset };
    const lineA = clean({ x: a.x + shift.x, y: a.y + shift.y }), lineB = clean({ x: b.x + shift.x, y: b.y + shift.y });
    const nextA = slideJoint(draft, vertices, a.id, edge, lineA, lineB, lineA);
    const nextB = slideJoint(draft, vertices, b.id, edge, lineA, lineB, lineB);
    if (!nextA || !nextB) return false;
    Object.assign(a, nextA); Object.assign(b, nextB);
    return true;
  }, options);
}

/** Move a corner and slide the next joint on each of its incident wall lines. */
export function moveVertex(doc, vertexId, point, options = {}) {
  if (!validPoint(point)) return false;
  return tryMove(doc, (draft, vertices) => {
    const vertex = vertices.get(vertexId);
    if (!vertex) return false;
    const attached = incidentEdges(draft, vertexId);
    if (!attached.length || attached.length > 2) return false;
    if (attached.length === 1) {
      // A terminal handle changes its wall length along the existing direction.
      const fixed = vertices.get(otherEnd(attached[0], vertexId));
      const snapped = snapPoint(point, doc.style.grid);
      Object.assign(vertex, clean(lerp(fixed, vertex, projection(fixed, vertex, snapped))));
      return true;
    }
    const target = snapPoint(point, doc.style.grid), shift = sub(target, vertex), updates = [];
    for (const edge of attached) {
      const neighbor = vertices.get(otherEnd(edge, vertexId));
      const shiftedNeighbor = { x: neighbor.x + shift.x, y: neighbor.y + shift.y };
      const position = slideJoint(draft, vertices, neighbor.id, edge, target, shiftedNeighbor, shiftedNeighbor);
      if (!position) return false;
      updates.push({ neighbor, position });
    }
    for (const { neighbor, position } of updates) Object.assign(neighbor, position);
    Object.assign(vertex, target);
    return true;
  }, options);
}
