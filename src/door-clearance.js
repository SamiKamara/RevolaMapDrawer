import { objectDoorTargets } from './objects.js';
import { PLACEMENT_DEFAULTS } from './placement-defaults.js';

const finite = Number.isFinite;
const positive = value => finite(value) && value > 0;
const blocked = Object.freeze({ overlaps: () => true });
const validQuery = (point, radius) => finite(point?.x) && finite(point?.y) && finite(radius) && radius >= 0;
const epsilon = 1e-7;
function circle(center, radius) {
  return (point, other) => Math.hypot(point.x - center.x, point.y - center.y) <= radius + other + epsilon;
}
function rectangle(center, tangent, halfLength, halfThickness, margin) {
  return (point, radius) => {
    const x = point.x - center.x, y = point.y - center.y;
    const along = Math.max(0, Math.abs(x * tangent.x + y * tangent.y) - halfLength);
    const across = Math.max(0, Math.abs(-x * tangent.y + y * tangent.x) - halfThickness);
    return Math.hypot(along, across) <= radius + margin + epsilon;
  };
}

/** Union both slide directions and both full-360-degree hinge disks; no preview choice can reduce the continuous native-motion bounds. */
export function createDoorClearance(doc, defaults = PLACEMENT_DEFAULTS) {
  const unit = defaults?.unitsPerPixel, openingWidth = doc?.style?.doorWidth;
  const factor = defaults?.safety?.doorSweepMarginInOpeningWidths;
  const calibrated = positive(unit) && positive(openingWidth) && finite(factor) && factor >= 0;
  const margin = openingWidth * factor;
  let targets;
  try { targets = new Map(objectDoorTargets(doc).map(target => [target.id, target])); }
  catch { targets = new Map(); }
  const cache = new Map();
  return source => {
    const target = targets.get(source?.doorId ?? source?.id);
    if (!calibrated || !finite(margin) || !target || !finite(target.point?.x) || !finite(target.point?.y)) return blocked;
    const width = target.width ?? openingWidth, length = Math.hypot(target.direction?.x, target.direction?.y);
    if (!positive(width) || !positive(length)) return blocked;
    const kind = source.type === 'sliding' || source.type === 'hinged' ? source.type : 'auto';
    const key = `${target.id}:${kind}`;
    if (cache.has(key)) return cache.get(key);
    const tangent = { x: target.direction.x / length, y: target.direction.y / length };
    function fallback() {
      if (!Array.isArray(defaults.prefabs)) return blocked;
      const radii = defaults.prefabs.filter(prefab => prefab.group === 'doors').map(prefab => prefab.radius / unit);
      if (radii.some(value => !finite(value) || value < 0)) return blocked;
      const radius = Math.max(width, openingWidth, ...radii.map(value => value * 2)) + margin;
      return finite(radius) ? { overlaps: (point, other) => !validQuery(point, other) || circle(target.point, radius)(point, other) } : blocked;
    }
    const shapes = [];
    let audited = true;
    for (const mechanism of kind === 'auto' ? ['sliding', 'hinged'] : [kind]) {
      const sourceFootprint = defaults.doorFootprints?.[mechanism];
      if (!sourceFootprint?.audited) { audited = false; break; }
      const leafWidth = sourceFootprint.width / unit, thickness = sourceFootprint.thickness / unit;
      if (!positive(leafWidth) || !positive(thickness) || leafWidth < width) { audited = false; break; }
      if (mechanism === 'sliding') {
        const travel = sourceFootprint.openDistance / unit;
        // Native sliding may choose either direction; their union is one
        // aperture-aligned swept rectangle, without a room-sized radial halo.
        if (!positive(travel) || travel < (leafWidth + width) / 2 + margin || !finite(leafWidth / 2 + travel)) { audited = false; break; }
        shapes.push(rectangle(target.point, tangent, leafWidth / 2 + travel, thickness / 2, margin));
      } else {
        const overhang = sourceFootprint.hingeOverhang / unit;
        const angle = sourceFootprint.maximumTotalAngle, offset = sourceFootprint.angleCenterOffset;
        if (!finite(overhang) || overhang < 0 || overhang >= leafWidth || !positive(angle) || angle > 360 || !finite(offset)) { audited = false; break; }
        const reach = Math.hypot(Math.max(overhang, leafWidth - overhang), thickness / 2) + margin;
        if (!finite(reach)) { audited = false; break; }
        // Full disks contain continuous rotation at every native angle/offset,
        // for both hinge sides. No guessed preferred hinge or door kind leaks
        // into the safety reservation.
        for (const side of [-1, 1]) {
          const hinge = { x: target.point.x + tangent.x * side * (width / 2 - overhang), y: target.point.y + tangent.y * side * (width / 2 - overhang) };
          if (!finite(hinge.x) || !finite(hinge.y)) { audited = false; break; }
          shapes.push(circle(hinge, reach));
        }
      }
    }
    const zone = audited ? { overlaps: (point, radius) => !validQuery(point, radius) || shapes.some(shape => shape(point, radius)) } : fallback();
    cache.set(key, zone);
    return zone;
  };
}
