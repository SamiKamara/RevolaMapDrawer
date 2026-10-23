import { floorContainsPoint, floorRegionContainsPoint } from './floors.js';
import { objectDoorTargets } from './objects.js';
import { shipWorldPoint } from './ship.js';
import { SHIP_VECTOR_OUTLINES } from './ship-vector.js';
import { PLACEMENT_DEFAULTS } from './placement-defaults.js';

const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const at = (p, t, n) => ({ x: p.x + t.x * n, y: p.y + t.y * n });
function rectangle(center, tangent, length, thickness) {
  const normal = { x: -tangent.y, y: tangent.x };
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => at(at(center, tangent, x * length / 2), normal, y * thickness / 2));
}
const edges = ring => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length] }));
/** Test every arrangement cell, rather than sampling a narrow pocket at fixed steps. */
function covered(region, rings, inside) {
  const left = Math.min(...region.map(p => p.x)), right = Math.max(...region.map(p => p.x));
  const top = Math.min(...region.map(p => p.y)), bottom = Math.max(...region.map(p => p.y));
  const segments = [region, ...rings].flatMap(edges).filter(({ a, b }) => Math.max(a.x, b.x) >= left && Math.min(a.x, b.x) <= right
    && Math.max(a.y, b.y) >= top && Math.min(a.y, b.y) <= bottom);
  const xs = new Set([left, right]);
  for (const { a, b } of segments) for (const p of [a, b]) if (p.x > left && p.x < right) xs.add(p.x);
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j], u = sub(a.b, a.a), v = sub(b.b, b.a), denominator = cross(u, v);
    if (Math.abs(denominator) < 1e-10) continue;
    const delta = sub(b.a, a.a), t = cross(delta, v) / denominator, s = cross(delta, u) / denominator;
    if (t < 0 || t > 1 || s < 0 || s > 1) continue;
    const p = at(a.a, u, t); if (p.x > left && p.x < right && p.y >= top && p.y <= bottom) xs.add(p.x);
  }
  const cuts = [...xs].sort((a, b) => a - b);
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] - cuts[i - 1] < 1e-6) continue;
    const x = (cuts[i] + cuts[i - 1]) / 2, ys = new Set([top, bottom]);
    for (const { a, b } of segments) if (x > Math.min(a.x, b.x) && x < Math.max(a.x, b.x)) {
      const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); if (y > top && y < bottom) ys.add(y);
    }
    const rows = [...ys].sort((a, b) => a - b);
    for (let j = 1; j < rows.length; j++) {
      if (rows[j] - rows[j - 1] < 1e-6) continue;
      const point = { x, y: (rows[j] + rows[j - 1]) / 2 };
      if (floorContainsPoint(region, point) && !inside(point)) return false;
    }
  }
  return true;
}

/** Derived preview only: retain type:auto so Unity still certifies the actual mechanism. */
export function doorPreviewTypes(doc, floor, defaults = PLACEMENT_DEFAULTS) {
  const output = new Map(), source = defaults.doorFootprints?.sliding;
  if (!floor?.closed || !source?.audited) return output;
  const unit = defaults.unitsPerPixel, f = { width: source.width / unit, thickness: source.thickness / unit, openDistance: source.openDistance / unit };
  const margin = doc.style.doorWidth * defaults.safety.doorSweepMarginInOpeningWidths;
  const walls = [...floor.wallPolygons, ...SHIP_VECTOR_OUTLINES.map(ring => ring.map(p => shipWorldPoint(doc.ship, p)))];
  const wallContains = p => walls.some(ring => floorContainsPoint(ring, p));
  const supported = polygon => covered(polygon, walls, wallContains);
  for (const target of objectDoorTargets(doc)) {
    const length = Math.hypot(target.direction.x, target.direction.y), tangent = { x: target.direction.x / length, y: target.direction.y / length };
    const width = target.width ?? doc.style.doorWidth, track = Math.min(doc.style.wallWidth, f.thickness) / 2;
    const pocket = (direction, distance, thickness) => rectangle(at(target.point, tangent, direction * (width + distance) / 2), tangent, distance, thickness);
    const support = Math.max(f.thickness, (f.width - width) / 2 + margin);
    let sliding = f.width >= width && f.openDistance >= (f.width + width) / 2 + margin
      && supported(pocket(-1, support, track)) && supported(pocket(1, support, track));
    if (sliding) sliding = [-1, 1].some(direction => {
      const required = f.openDistance + (f.width - width) / 2 + margin;
      if (!supported(pocket(direction, required, track))) return false;
      const sweep = rectangle(at(target.point, tangent, direction * f.openDistance / 2), tangent, f.width + f.openDistance + 2 * margin, f.thickness + 2 * margin);
      const allowed = [pocket(direction, required, f.thickness + 2 * margin), pocket(-direction, (f.width - width) / 2 + margin, f.thickness + 2 * margin)];
      const allowedContains = p => allowed.some(ring => floorContainsPoint(ring, p));
      return covered(sweep, [...floor.polygons, ...walls, ...allowed], p => allowedContains(p)
        || floorRegionContainsPoint(floor.polygons, p) && !wallContains(p));
    });
    output.set(target.id, sliding ? 'sliding' : 'hinged');
  }
  return output;
}
