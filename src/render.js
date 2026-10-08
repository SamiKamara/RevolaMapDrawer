/** Shared world-space renderer for the editing canvas and transparent exports. */
import { shipWorldPoint } from './ship.js';

export const SHIP_BOUNDS = Object.freeze({ width: 2459, height: 1931 });
export const SHIP_ANCHOR = Object.freeze({
  x: 1269,
  y: 70,
  portOffsets: Object.freeze([-356.5, 356.5]),
});

let shipPromise;
export function loadShip() {
  if (!shipPromise) {
    shipPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The bundled ship image could not be loaded.'));
      image.src = new URL('../assets/ship.png', import.meta.url).href;
    });
  }
  return shipPromise;
}

/** Actual image bounds, taking mirroring about the upper airlock entrance into account. */
export function shipBounds(ship) {
  const origin = shipWorldPoint(ship, { x: 0, y: 0 });
  const left = ship.mirrored
    ? origin.x - (SHIP_BOUNDS.width - SHIP_ANCHOR.x)
    : origin.x - SHIP_ANCHOR.x;
  const top = origin.y - SHIP_ANCHOR.y;
  return { left, top, right: left + SHIP_BOUNDS.width, bottom: top + SHIP_BOUNDS.height };
}

/** Keep the original edge in the graph; derive physical, butt-ended wall pieces for painting. */
export function segmentVisibleParts(a, b, doors = [], doorWidth = 375, gaps = []) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-9) return [];
  const halfGap = doorWidth / (2 * length);
  const cuts = [...doors.map(({ t }) => [t - halfGap, t + halfGap]), ...gaps.map(({ start, end }) => [start, end])]
    .map(([start, end]) => [Math.max(0, start), Math.min(1, end)])
    .filter(([start, end]) => Number.isFinite(start) && end > start)
    .sort((left, right) => left[0] - right[0]);
  const intervals = [];
  let cursor = 0;
  for (const [start, end] of cuts) {
    if (start > cursor) intervals.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1) intervals.push([cursor, 1]);
  const pointAt = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return intervals.map(([start, end]) => ({ start, end, a: pointAt(start), b: pointAt(end) }));
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function noise(seed, index, side) {
  let result = seed ^ Math.imul(index + 1, 374761393) ^ Math.imul(side + 1, 668265263);
  result = Math.imul(result ^ (result >>> 13), 1274126177);
  return ((result ^ (result >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}

// Evaluate a fixed world-space polyline, including between sample positions. Cutting
// or extending a run cannot change the existing silhouette between those samples.
function edgeOffset(seed, distance, side, roughness) {
  const sample = (position) => {
    const index = Math.floor(position / 36);
    const fraction = position / 36 - index;
    const blend = fraction * fraction * (3 - 2 * fraction);
    return noise(seed, index, side) * (1 - blend) + noise(seed, index + 1, side) * blend;
  };
  const index = Math.floor(distance / 18);
  const fraction = distance / 18 - index;
  return (sample(index * 18) * (1 - fraction) + sample((index + 1) * 18) * fraction) * roughness;
}

// A canonical direction and intercept give every split/reversed edge on one
// world line the same texture, without using graph IDs or the edge's start point.
function worldLine(a, b, textureSeed) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const direction = Math.abs(dy) < 1e-6 ? 0 : Math.abs(dx) < 1e-6 ? 2 : dx * dy > 0 ? 1 : 3;
  const ux = direction === 2 ? 0 : direction === 0 ? 1 : Math.SQRT1_2;
  const uy = direction === 0 ? 0 : direction === 2 ? 1 : direction === 1 ? Math.SQRT1_2 : -Math.SQRT1_2;
  const intercept = direction === 2 ? a.x : direction === 0 ? a.y : direction === 1 ? a.y - a.x : a.y + a.x;
  const offset = Math.round(intercept * 1e6) / 1e6;
  const key = `${direction}:${offset}`;
  return { key, ux, uy, nx: -uy, ny: ux, x: direction === 2 ? offset : 0, y: direction === 2 ? 0 : offset,
    seed: hash(`${textureSeed ?? 1}:${key}`), intervals: [] };
}

function along(line, point) {
  return line.ux === 0 ? point.y : point.x / line.ux;
}

function outlinePoint(line, distance, side, style) {
  const sign = side === 0 ? 1 : -1;
  const roughness = Math.min(style.roughness, style.wallWidth / 8);
  const width = style.wallWidth / 2 + edgeOffset(line.seed, distance, side, roughness);
  return { x: line.x + line.ux * distance + line.nx * sign * width,
    y: line.y + line.uy * distance + line.ny * sign * width };
}

function addPolygon(ctx, points) {
  // One winding for every subpath makes Canvas fill their union in one pass.
  // Separate fill calls would leave antialias seams through otherwise solid walls.
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const outline = area > 0 ? [...points].reverse() : points;
  outline.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function addRun(ctx, line, first, last, style) {
  const distances = [first];
  for (let distance = Math.ceil((first + 1e-7) / 18) * 18; distance < last - 1e-7; distance += 18) distances.push(distance);
  distances.push(last);
  addPolygon(ctx, [...distances.map(distance => outlinePoint(line, distance, 0, style)),
    ...distances.reverse().map(distance => outlinePoint(line, distance, 1, style))]);
}

function hasJointClearance(ray, margin) {
  // A very short graph edge can be part of a long continuous wall. Test the
  // merged visible run, not that edge's length, before suppressing a join.
  let low = 0, high = ray.line.runs.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ray.line.runs[middle][0] <= ray.distance + 1e-7) low = middle + 1;
    else high = middle;
  }
  const run = ray.line.runs[low - 1];
  return run && run[1] >= ray.distance - 1e-7 &&
    (ray.forward ? run[1] - ray.distance : ray.distance - run[0]) >= margin - 1e-7;
}

function addJoint(ctx, joint, style) {
  if (joint.blocked || joint.rays.length < 2 ||
      joint.rays.some(ray => !hasJointClearance(ray, style.wallWidth / 2 + style.roughness))) return;
  const rays = joint.rays.sort((left, right) => left.angle - right.angle);
  for (let index = 0; index < rays.length; index++) {
    const first = rays[index], second = rays[(index + 1) % rays.length];
    const angle = (second.angle - first.angle + Math.PI * 2) % (Math.PI * 2);
    // Concave sectors are already covered by the wall polygons. The remaining
    // exterior sector receives a pointed, bounded miter instead of a round cap.
    if (angle <= Math.PI + 1e-8) continue;
    const cross = first.ux * second.uy - first.uy * second.ux;
    if (Math.abs(cross) < 1e-9) continue;
    const p = first.left, q = second.right;
    const t = ((q.x - p.x) * second.uy - (q.y - p.y) * second.ux) / cross;
    const tip = { x: p.x + first.ux * t, y: p.y + first.uy * t };
    // Merely touching the run's butt edge can leave a faint antialias seam in
    // Canvas, even when every subpath shares the same fill. Overlap each cap
    // inside its already-solid run, keeping all exterior outline points exact.
    // The clearance check above bounds these hidden quarter-pixel extensions well
    // before any real door or erased interval.
    const insideCap = (point, ray) => ({
      x: (joint.vertex.x + point.x) / 2 + ray.ux * 0.25,
      y: (joint.vertex.y + point.y) / 2 + ray.uy * 0.25,
    });
    const insideCorner = {
      x: joint.vertex.x + (first.ux + second.ux) * 0.25,
      y: joint.vertex.y + (first.uy + second.uy) * 0.25,
    };
    const points = [insideCorner, insideCap(p, first), p];
    if (Math.hypot(tip.x - joint.vertex.x, tip.y - joint.vertex.y) <= style.wallWidth * 1.5) points.push(tip);
    points.push(q, insideCap(q, second));
    addPolygon(ctx, points);
  }
}

/** Does not clear or paint a background. The caller controls pan/zoom and export dimensions. */
export function drawMap(ctx, document, { shipImage, drawShip = true } = {}) {
  const vertices = new Map(document.vertices.map((vertex) => [vertex.id, vertex]));
  const style = { wallWidth: 50, doorWidth: 375, roughness: 2.25, ...document.style };
  const lines = new Map(), joints = new Map();
  for (const edge of document.edges) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    const candidate = worldLine(a, b, document.textureSeed ?? document.seed);
    const line = lines.get(candidate.key) || candidate;
    lines.set(line.key, line);
    const parts = segmentVisibleParts(a, b, edge.doors, style.doorWidth, edge.gaps);
    for (const part of parts) {
      const start = along(line, part.a), end = along(line, part.b);
      line.intervals.push([Math.min(start, end), Math.max(start, end)]);
    }
    for (const [vertex, other, visible] of [
      [a, b, parts[0]?.start === 0],
      [b, a, parts.at(-1)?.end === 1],
    ]) {
      const joint = joints.get(vertex.id) || { vertex, rays: [], blocked: false };
      joint.blocked ||= !visible;
      if (visible) {
        const forward = along(line, other) > along(line, vertex);
        const ux = line.ux * (forward ? 1 : -1), uy = line.uy * (forward ? 1 : -1);
        joint.rays.push({ line, distance: along(line, vertex), forward, ux, uy, angle: Math.atan2(uy, ux),
          left: outlinePoint(line, along(line, vertex), forward ? 0 : 1, style),
          right: outlinePoint(line, along(line, vertex), forward ? 1 : 0, style) });
      }
      joints.set(vertex.id, joint);
    }
  }
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  // Merge even graph-split runs before tracing their outline, so a collinear
  // continuation has no artificial cap, texture reset or vertical raster seam.
  for (const line of [...lines.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    line.intervals.sort((left, right) => left[0] - right[0]);
    line.runs = [];
    let run;
    for (const interval of line.intervals) {
      if (run && interval[0] <= run[1] + 1e-7) run[1] = Math.max(run[1], interval[1]);
      else {
        if (run) line.runs.push(run);
        run = [...interval];
      }
    }
    if (run) line.runs.push(run);
    for (const [first, last] of line.runs) addRun(ctx, line, first, last, style);
  }
  for (const joint of joints.values()) addJoint(ctx, joint, style);
  ctx.fill();
  if (drawShip && shipImage && document.ship) {
    ctx.save();
    const origin = shipWorldPoint(document.ship, { x: 0, y: 0 });
    ctx.translate(origin.x, origin.y);
    if (document.ship.mirrored) ctx.scale(-1, 1);
    ctx.drawImage(shipImage, -SHIP_ANCHOR.x, -SHIP_ANCHOR.y, SHIP_BOUNDS.width, SHIP_BOUNDS.height);
    ctx.restore();
  }
  ctx.restore();
}
