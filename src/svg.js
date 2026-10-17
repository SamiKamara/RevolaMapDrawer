/** Compact, self-contained SVG export of the shared world-space renderer. */
import { validateDocument } from './model.js';
import { drawMap } from './render.js';
import { shipWorldPoint } from './ship.js';
import { SHIP_VECTOR_OUTLINES } from './ship-vector.js';

// Leave room for the maximum 0.000708 px displacement from decimal rounding.
// Caps and miter polygons are never rounded or approximately simplified.
const SIDE_TOLERANCE = 0.249;

function distanceToSegmentSquared(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}

/** Iterative Douglas–Peucker, applied only to one monotone wall side at a time. */
function simplifySide(points, direction) {
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1, maximum = SIDE_TOLERANCE ** 2;
    for (let index = first + 1; index < last; index++) {
      const distance = distanceToSegmentSquared(points[index], points[first], points[last]);
      if (distance > maximum) { maximum = distance; farthest = index; }
    }
    if (farthest !== -1) {
      keep.add(farthest);
      stack.push([first, farthest], [farthest, last]);
    }
  }
  const along = point => point.x * direction.x + point.y * direction.y;
  const firstAlong = along(points[0]), lastAlong = along(points.at(-1));
  const minimum = Math.min(firstAlong, lastAlong), maximum = Math.max(firstAlong, lastAlong);
  return [...keep].sort((a, b) => a - b).map(index => {
    const point = points[index];
    const roundedAlong = along({ x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)) });
    return { ...point, exact: index === 0 || index === points.length - 1 ||
      // An interior texture sample can be arbitrarily close to a genuine cut.
      // Keep full precision if rounding would cross either butt-cap plane.
      roundedAlong <= minimum || roundedAlong >= maximum };
  });
}

function samePoint(a, b) { return a.x === b.x && a.y === b.y; }

/** Small outlines include joins: remove only mathematically redundant points. */
function removeExactRedundancy(points) {
  const result = points.filter((point, index) => !samePoint(point, points[(index + 1) % points.length]));
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length; index++) {
      const previous = result[(index + result.length - 1) % result.length];
      const point = result[index], next = result[(index + 1) % result.length];
      const dx = next.x - previous.x, dy = next.y - previous.y;
      const px = point.x - previous.x, py = point.y - previous.y;
      if (px * dy === py * dx && px * dx + py * dy >= 0 && px * dx + py * dy <= dx * dx + dy * dy) {
        result.splice(index, 1); changed = true; break;
      }
    }
  }
  return result.map(point => ({ ...point, exact: true }));
}

function simplifyPolygon(points) {
  // drawMap emits each run as its forward side followed by its backward side.
  // A run has an even point count, with its two real caps between these chains.
  // Join polygons have at most six points and must retain every sharp corner.
  if (points.length <= 6) return removeExactRedundancy(points);
  if (points.length % 2) throw new Error('Unsupported wall outline in SVG export.');
  const middle = points.length / 2;
  const capX = points.at(-1).x - points[0].x, capY = points.at(-1).y - points[0].y;
  const capLength = Math.hypot(capX, capY);
  const direction = { x: -capY / capLength, y: capX / capLength };
  return [...simplifySide(points.slice(0, middle), direction), ...simplifySide(points.slice(middle), direction)];
}

function collectPolygons(document) {
  const polygons = [];
  let current;
  const context = {
    save() {}, restore() {}, beginPath() {}, fill() {},
    moveTo(x, y) { current = [{ x, y }]; },
    lineTo(x, y) { current.push({ x, y }); },
    closePath() { if (current?.length >= 3) polygons.push(current); current = undefined; },
  };
  drawMap(context, document, { drawShip: false });
  return polygons;
}

function number(value, exact = true) {
  // Full precision for the four caps prevents tiny legitimate erased intervals
  // from disappearing. Only retained interior texture samples use 3 decimals.
  return String(exact ? value : Number(value.toFixed(3)));
}

function polygonPath(points) {
  const first = points[0];
  let previousX = number(first.x, first.exact), previousY = number(first.y, first.exact);
  let path = `M${previousX} ${previousY}`, command = 'L';
  for (const point of points.slice(1)) {
    const x = number(point.x, point.exact), y = number(point.y, point.exact);
    if (x === previousX && y === previousY) continue;
    if (y === previousY) { path += `H${x}`; command = 'H'; }
    else if (x === previousX) { path += `V${y}`; command = 'V'; }
    else { path += `${command === 'L' ? ' ' : 'L'}${x} ${y}`; command = 'L'; }
    previousX = x; previousY = y;
  }
  return `${path}Z`;
}

function xmlText(value) {
  return value.toWellFormed().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '\ufffd')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Export a validated Revola document with a transparent background. Walls share
 * one nonzero-fill path, and the fixed ship uses a compact true vector path.
 * Wall-side approximation plus coordinate rounding stays below 0.25 map px.
 * This visual interchange format deliberately omits editable project metadata.
 */
export function renderMapSvg(document) {
  const map = validateDocument(document);
  const path = collectPolygons(map).map(points => polygonPath(simplifyPolygon(points))).join('');
  const viewBox = `${number(map.originX)} ${number(map.originY)} ${map.width} ${map.height}`;
  const mirror = map.ship.mirrored ? ' scale(-1 1)' : '';
  const origin = shipWorldPoint(map.ship, { x: 0, y: 0 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${map.width}" height="${map.height}" viewBox="${viewBox}">` +
    `<title>${xmlText(map.name)}</title>` +
    (path ? `<path fill="#fff" fill-rule="nonzero" d="${path}"/>` : '') +
    `<path data-ship="true" fill="#fff" fill-rule="nonzero"` +
    ` transform="translate(${number(origin.x)} ${number(origin.y)})${mirror}"` +
    ` d="${SHIP_VECTOR_OUTLINES.map(points => polygonPath(points)).join('')}"/></svg>`;
}
