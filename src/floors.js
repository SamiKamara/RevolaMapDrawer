/** Derived, transparent black floors for maps whose ship cannot reach space. */
import { validateDocument } from './model.js';
import { drawMap, segmentVisibleParts, SHIP_ANCHOR } from './render.js';
import { shipWorldPoint } from './ship.js';
import { SHIP_FLOOR_OUTLINE, SHIP_FLOOR_BARRIER, SHIP_FLOOR_SEED } from '../assets/ship-floor-contour.js';

export const FLOOR_RIM = 12;
const EPSILON = 1e-9;
const BUCKET_SIZE = 512;

function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
function area(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function worldShipPoint(document, point) {
  return shipWorldPoint(document.ship, point);
}

function worldShipBarrierPoint(document, point) {
  // The contour bridges to legacy graph ports through two synthetic runs.
  // Keep those pins fixed while the physical hull mirrors around its doorway.
  if (document.ship.mirrored && (point.y === 0 || point.y === -40)
      && SHIP_ANCHOR.portOffsets.includes(point.x)) {
    return { x: document.ship.x - point.x, y: document.ship.y + point.y };
  }
  return worldShipPoint(document, point);
}

function collectWalls(document) {
  const polygons = [];
  let current;
  drawMap({ save() {}, restore() {}, beginPath() {}, fill() {},
    moveTo(x, y) { current = [{ x, y }]; },
    lineTo(x, y) { current.push({ x, y }); },
    closePath() { if (current?.length >= 3) polygons.push(current); current = undefined; },
  }, document, { drawShip: false });
  return polygons;
}

function barrierSegments(document, { solid = false } = {}) {
  const vertices = new Map(document.vertices.map(vertex => [vertex.id, vertex]));
  const segments = [];
  const append = (a, b, edge) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) > EPSILON) segments.push({ a, b, edge, splits: [0, 1] });
  };
  // Door and eraser intervals really remove barriers. Even a tiny interval must
  // connect the two neighboring faces, independent of any raster resolution.
  for (const edge of document.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (solid) append(a, b, edge);
    else for (const part of segmentVisibleParts(a, b, edge.doors, document.style.doorWidth, edge.gaps)) append(part.a, part.b);
  }
  const ship = SHIP_FLOOR_BARRIER.map(point => worldShipBarrierPoint(document, point));
  for (let index = 1; index < ship.length; index++) append(ship[index - 1], ship[index]);
  return segments;
}

function segmentIntersection(first, second) {
  const rx = first.b.x - first.a.x, ry = first.b.y - first.a.y;
  const sx = second.b.x - second.a.x, sy = second.b.y - second.a.y;
  const qx = second.a.x - first.a.x, qy = second.a.y - first.a.y;
  const denominator = cross(rx, ry, sx, sy);
  if (Math.abs(denominator) > EPSILON) {
    const t = cross(qx, qy, sx, sy) / denominator;
    const u = cross(qx, qy, rx, ry) / denominator;
    if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
      first.splits.push(Math.max(0, Math.min(1, t)));
      second.splits.push(Math.max(0, Math.min(1, u)));
    }
    return;
  }
  if (Math.abs(cross(qx, qy, rx, ry)) > EPSILON * Math.hypot(rx, ry)) return;
  const project = (point, segment, dx, dy) =>
    ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / (dx * dx + dy * dy);
  for (const point of [second.a, second.b]) {
    const t = project(point, first, rx, ry);
    if (t >= -EPSILON && t <= 1 + EPSILON) first.splits.push(Math.max(0, Math.min(1, t)));
  }
  for (const point of [first.a, first.b]) {
    const u = project(point, second, sx, sy);
    if (u >= -EPSILON && u <= 1 + EPSILON) second.splits.push(Math.max(0, Math.min(1, u)));
  }
}

function splitIntersections(segments) {
  const buckets = new Map();
  let comparisonCount = 0;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index], candidates = new Set();
    const left = Math.floor(Math.min(segment.a.x, segment.b.x) / BUCKET_SIZE);
    const right = Math.floor(Math.max(segment.a.x, segment.b.x) / BUCKET_SIZE);
    const top = Math.floor(Math.min(segment.a.y, segment.b.y) / BUCKET_SIZE);
    const bottom = Math.floor(Math.max(segment.a.y, segment.b.y) / BUCKET_SIZE);
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      const key = `${x}:${y}`, bucket = buckets.get(key) ?? [];
      for (const other of bucket) candidates.add(other);
      bucket.push(index); buckets.set(key, bucket);
    }
    comparisonCount += candidates.size;
    if (comparisonCount > 2_000_000) throw new Error('Floor closure analysis exceeds the supported 2,000,000 nearby intersection checks.');
    for (const other of candidates) segmentIntersection(segment, segments[other]);
  }
}

function planarFaces(segments) {
  splitIntersections(segments);
  const nodes = [], lookup = new Map(), edges = new Set(), halfEdges = [];
  const getNode = point => {
    // Intersection arithmetic can differ by a few ulps on its two incident
    // segments. A nanometer-scale map tolerance joins those copies without
    // using a pixel grid or rounding any exported coordinates.
    const key = `${Math.round(point.x / EPSILON)}:${Math.round(point.y / EPSILON)}`;
    if (lookup.has(key)) return lookup.get(key);
    const node = { ...point, index: nodes.length, outgoing: [] };
    nodes.push(node); lookup.set(key, node); return node;
  };
  for (const segment of segments) {
    segment.splits.sort((a, b) => a - b);
    const pointAt = t => ({ x: segment.a.x + (segment.b.x - segment.a.x) * t,
      y: segment.a.y + (segment.b.y - segment.a.y) * t });
    let previous = getNode(segment.a);
    for (const t of segment.splits.slice(1)) {
      const next = getNode(pointAt(t));
      if (previous === next) continue;
      const key = previous.index < next.index ? `${previous.index}:${next.index}` : `${next.index}:${previous.index}`;
      if (!edges.has(key)) {
        const forward = { from: previous, to: next, visited: false };
        const reverse = { from: next, to: previous, visited: false };
        forward.reverse = reverse; reverse.reverse = forward;
        previous.outgoing.push(forward); next.outgoing.push(reverse);
        halfEdges.push(forward, reverse); edges.add(key);
      }
      previous = next;
    }
  }
  for (const node of nodes) node.outgoing.sort((a, b) =>
    Math.atan2(a.to.y - node.y, a.to.x - node.x) - Math.atan2(b.to.y - node.y, b.to.x - node.x));
  for (const node of nodes) node.outgoing.forEach((edge, index) => { edge.position = index; });
  const faces = [];
  for (const start of halfEdges) {
    if (start.visited) continue;
    const points = [];
    let edge = start;
    do {
      if (edge.visited) throw new Error('The floor boundary could not be resolved.');
      edge.visited = true; points.push({ x: edge.from.x, y: edge.from.y });
      const outgoing = edge.to.outgoing;
      edge = outgoing[(edge.reverse.position + outgoing.length - 1) % outgoing.length];
    } while (edge !== start);
    // A disconnected inner cycle contributes a negative boundary to the face
    // surrounding it. Retaining both orientations preserves courtyard holes.
    if (points.length >= 3 && Math.abs(area(points)) > EPSILON) faces.push(points);
  }
  return faces;
}

/** Test a point against a face without rasterizing its door or eraser cuts. */
export function floorContainsPoint(polygon, point) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Oriented region boundaries include a positive exterior and negative holes. */
export function floorRegionContainsPoint(polygons, point) {
  return polygons.reduce((winding, polygon) => winding +
    (floorContainsPoint(polygon, point) ? Math.sign(area(polygon)) : 0), 0) !== 0;
}

function polygonBounds(polygon) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const point of polygon) {
    left = Math.min(left, point.x); right = Math.max(right, point.x);
    top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
  }
  return { left, right, top, bottom };
}

function boundedRegions(cycles) {
  const regions = cycles.filter(polygon => area(polygon) > EPSILON)
    .map(boundary => ({ boundary, holes: [], area: area(boundary), ...polygonBounds(boundary) }));
  // A face of a disconnected planar graph can have several boundary cycles.
  // Probe the left side of each clockwise hole cycle to find the surrounding
  // face, rather than assuming that every positive cycle is reachable floor.
  const buckets = new Map();
  for (const region of regions) {
    for (let x = Math.floor(region.left / BUCKET_SIZE); x <= Math.floor(region.right / BUCKET_SIZE); x++) {
      for (let y = Math.floor(region.top / BUCKET_SIZE); y <= Math.floor(region.bottom / BUCKET_SIZE); y++) {
        const key = `${x}:${y}`, bucket = buckets.get(key) ?? [];
        bucket.push(region); buckets.set(key, bucket);
      }
    }
  }
  let pointChecks = 0;
  for (const polygon of cycles) {
    if (area(polygon) >= -EPSILON) continue;
    const a = polygon[0], b = polygon[1], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    // Model topology reserves a 1e-6 tolerance; this smaller offset only chooses
    // which side of an exact boundary owns the face and never changes geometry.
    const point = { x: (a.x + b.x) / 2 - dy / length * 1e-7,
      y: (a.y + b.y) / 2 + dx / length * 1e-7 };
    const candidates = buckets.get(`${Math.floor(point.x / BUCKET_SIZE)}:${Math.floor(point.y / BUCKET_SIZE)}`) ?? [];
    let owner;
    for (const region of candidates) {
      if (point.x < region.left || point.x > region.right || point.y < region.top || point.y > region.bottom) continue;
      pointChecks += region.boundary.length;
      if (pointChecks > 2_000_000) throw new Error('Floor courtyard analysis exceeds the supported 2,000,000 boundary-point checks.');
      if ((!owner || region.area < owner.area) && floorContainsPoint(region.boundary, point)) owner = region;
    }
    if (owner) owner.holes.push(polygon);
  }
  return regions;
}

function exteriorOpening(document) {
  if (!document.edges.some(edge => edge.doors.length || edge.gaps.length)) return null;
  const segments = barrierSegments(document, { solid: true });
  // Here all bounded faces count as enclosed, including unreachable rooms and
  // courtyard interiors: the rule forbids openings on the outer map envelope.
  const faces = planarFaces(segments).filter(polygon => area(polygon) > EPSILON);
  const buckets = new Map();
  for (const face of faces) {
    const { left, right, top, bottom } = polygonBounds(face);
    for (let x = Math.floor(left / BUCKET_SIZE); x <= Math.floor(right / BUCKET_SIZE); x++) {
      for (let y = Math.floor(top / BUCKET_SIZE); y <= Math.floor(bottom / BUCKET_SIZE); y++) {
        const key = `${x}:${y}`, bucket = buckets.get(key) ?? [];
        bucket.push({ face, left, right, top, bottom }); buckets.set(key, bucket);
      }
    }
  }
  let pointChecks = 0;
  const enclosed = point => {
    const candidates = buckets.get(`${Math.floor(point.x / BUCKET_SIZE)}:${Math.floor(point.y / BUCKET_SIZE)}`) ?? [];
    return candidates.some(({ face, left, right, top, bottom }) => {
      if (point.x < left || point.x > right || point.y < top || point.y > bottom) return false;
      pointChecks += face.length;
      if (pointChecks > 2_000_000) throw new Error('Floor exterior-opening analysis exceeds the supported 2,000,000 boundary-point checks.');
      return floorContainsPoint(face, point);
    });
  };
  for (const segment of segments) {
    if (!segment.edge) continue;
    const edge = segment.edge, dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dy), halfDoor = document.style.doorWidth / (length * 2);
    const cuts = [
      ...edge.doors.map(door => ({ start: door.t - halfDoor, end: door.t + halfDoor, type: 'doorway' })),
      ...edge.gaps.map(gap => ({ start: gap.start, end: gap.end, type: 'erased gap' })),
    ];
    // The full arrangement has already split intersections with the fixed hull.
    // Probe each overlap, so even a short exposed part of a doorway is found.
    for (let index = 1; index < segment.splits.length; index++) for (const cut of cuts) {
      const start = Math.max(segment.splits[index - 1], cut.start);
      const end = Math.min(segment.splits[index], cut.end);
      if ((end - start) * length <= EPSILON) continue;
      const t = (start + end) / 2, x = segment.a.x + dx * t, y = segment.a.y + dy * t;
      const nx = -dy / length * 0.00001, ny = dx / length * 0.00001;
      if (enclosed({ x: x + nx, y: y + ny }) !== enclosed({ x: x - nx, y: y - ny })) return cut.type;
    }
  }
  return null;
}

/**
 * Analyze exact graph openings together with the fixed, open-door ship hull.
 * Only the face reachable from the ship is floor. Internal doors merge faces;
 * sealed courtyards and disconnected rooms remain transparent. Negative cycles
 * describe courtyard holes in otherwise connected or nested boundary graphs.
 * An external doorway or slit removes the enclosing face containing the ship.
 * A second, uncut arrangement also rejects exterior openings in compartments
 * that a solid internal partition makes unreachable from the ship.
 * This is derived state and never changes or adds project metadata.
 */
export function generateFloor(document) {
  const map = validateDocument(document);
  const regions = boundedRegions(planarFaces(barrierSegments(map)));
  const seed = worldShipPoint(map, SHIP_FLOOR_SEED);
  const region = regions.find(candidate => floorRegionContainsPoint([candidate.boundary, ...candidate.holes], seed));
  const shipEnclosed = Boolean(region);
  const exteriorCut = shipEnclosed ? exteriorOpening(map) : null;
  const closed = shipEnclosed && !exteriorCut;
  return {
    closed,
    reason: closed ? 'Closed map: the ship cannot reach the exterior.' : exteriorCut ?
      `Open map: an exterior wall has ${exteriorCut === 'doorway' ? 'a doorway' : 'an erased gap'}. Close it before generating the floor.` :
      'Open map: the ship can reach the exterior through a doorway, erased gap or unfinished wall.',
    width: map.width, height: map.height, originX: map.originX, originY: map.originY,
    polygons: closed ? [region.boundary, ...region.holes] : [],
    wallPolygons: closed ? collectWalls(map) : [],
    shipPolygons: closed ? [SHIP_FLOOR_OUTLINE.map(point => worldShipPoint(map,
      { x: point.x - SHIP_ANCHOR.x, y: point.y - SHIP_ANCHOR.y }))] : [],
    outlineWidth: FLOOR_RIM * 2,
  };
}

function assertFloor(floor) {
  if (!floor?.closed) throw new Error(floor?.reason || 'Floor generation requires a closed map.');
  if (![floor.width, floor.height].every(value => Number.isInteger(value) && value > 0 && value <= 16384) ||
      ![floor.originX, floor.originY, floor.outlineWidth].every(Number.isFinite) || floor.outlineWidth < 0 || floor.outlineWidth > 200) {
    throw new Error('Invalid generated floor dimensions.');
  }
  for (const polygons of [floor.polygons, floor.wallPolygons ?? [], floor.shipPolygons ?? []]) {
    if (!Array.isArray(polygons) || polygons.some(polygon => !Array.isArray(polygon) || polygon.length < 3 ||
      polygon.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y)))) throw new Error('Invalid generated floor outline.');
  }
}

function addPolygons(context, polygons, { preserveWinding = false } = {}) {
  for (const polygon of polygons) {
    const points = !preserveWinding && area(polygon) < 0 ? [...polygon].reverse() : polygon;
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
  }
}

/** Black floor only. The caller chooses the view transform and transparent surface. */
export function drawFloor(context, floor) {
  assertFloor(floor);
  const outlines = [...floor.wallPolygons ?? [], ...floor.shipPolygons ?? []];
  context.save();
  context.fillStyle = '#000000'; context.strokeStyle = '#000000';
  context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
  context.beginPath(); addPolygons(context, floor.polygons, { preserveWinding: true }); context.fill();
  if (outlines.length) {
    // Fill physical wall/hull silhouettes independently so overlapping walls
    // inside a negative courtyard boundary cannot cancel their own floor rim.
    context.beginPath(); addPolygons(context, outlines); context.fill();
  }
  if (outlines.length && floor.outlineWidth > 0) {
    context.lineWidth = floor.outlineWidth; context.lineJoin = 'miter'; context.miterLimit = 3;
    context.beginPath(); addPolygons(context, outlines); context.stroke();
  }
  context.restore();
}

function xmlText(value) {
  return value.toWellFormed().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '\ufffd')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function path(polygons, { preserveWinding = false } = {}) {
  return polygons.map(polygon => {
    const points = !preserveWinding && area(polygon) < 0 ? [...polygon].reverse() : polygon;
    return `M${points.map(point => `${point.x} ${point.y}`).join('L')}Z`;
  }).join('');
}

/** Self-contained vector floor with the same world origin, scale and rim as PNG. */
export function renderFloorSvg(document, { floor = generateFloor(document) } = {}) {
  const map = validateDocument(document);
  assertFloor(floor);
  if (floor.width !== map.width || floor.height !== map.height || floor.originX !== map.originX || floor.originY !== map.originY) {
    throw new Error('The generated floor no longer matches the map bounds. Generate it again.');
  }
  const outlines = [...floor.wallPolygons ?? [], ...floor.shipPolygons ?? []];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${map.width}" height="${map.height}" viewBox="${map.originX} ${map.originY} ${map.width} ${map.height}">` +
    `<title>${xmlText(map.name)} — floor</title>` +
    `<path fill="#000" fill-rule="nonzero" d="${path(floor.polygons, { preserveWinding: true })}"/>` +
    (outlines.length ? `<path fill="#000" fill-rule="nonzero" d="${path(outlines)}"/>` : '') +
    (outlines.length && floor.outlineWidth > 0 ? `<path fill="none" stroke="#000" stroke-width="${floor.outlineWidth}" stroke-linejoin="miter" stroke-miterlimit="3" d="${path(outlines)}"/>` : '') + '</svg>';
}
