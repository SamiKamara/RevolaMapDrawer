import { floorContainsPoint, floorRegionContainsPoint } from './floors.js';
import { shipDoorways, shipWorldPoint } from './ship.js';
import { SHIP_VECTOR_OUTLINES } from './ship-vector.js';

export function objectDoorTargets(doc) {
  const vertices = new Map(doc.vertices.map(v => [v.id, v]));
  return [...shipDoorways(doc.ship), { id: 'ship-inner-door', point: shipWorldPoint(doc.ship, { x: 14.5, y: 568 }), direction: { x: 1, y: 0 } },
    ...doc.edges.flatMap(edge => {
      const a = vertices.get(edge.a), b = vertices.get(edge.b);
      return edge.doors.map(door => ({ id: door.id, point: { x: a.x + (b.x - a.x) * door.t, y: a.y + (b.y - a.y) * door.t }, direction: { x: b.x - a.x, y: b.y - a.y } }));
    })];
}
export function nearestObjectDoor(doc, point, tolerance = 200) {
  return objectDoorTargets(doc).map(target => ({ ...target, distance: Math.hypot(point.x - target.point.x, point.y - target.point.y) }))
    .filter(target => target.distance <= tolerance).sort((a, b) => a.distance - b.distance)[0];
}
export function objectDoorSnap(doc, point, tolerance, movingId = null) {
  const target = point && nearestObjectDoor(doc, point, tolerance);
  if (!target) return null;
  return { ...target, occupied: (doc.objects ?? []).some(object => object.category === 'doors' && object.id !== movingId && object.doorId === target.id) };
}
export function objectPosition(doc, object) {
  if (object.category !== 'doors') return object;
  const target = objectDoorTargets(doc).find(target => target.id === object.doorId);
  return target ? { ...object, ...target.point, rotation: Math.atan2(target.direction.y, target.direction.x) * 180 / Math.PI } : object;
}
export function gameplayPointIsPlayable(doc, floor, point) {
  return !!floor?.closed && floorRegionContainsPoint(floor.polygons, point)
    && !(floor.wallPolygons ?? []).some(polygon => floorContainsPoint(polygon, point))
    && !SHIP_VECTOR_OUTLINES.some(ring => floorContainsPoint(ring.map(p => shipWorldPoint(doc.ship, p)), point));
}
/** Center-only rejection deliberately permits close-to-wall and close-to-object placements. */
export function filterGameplayObjects(doc, floor) {
  const accepted = [], rejected = [];
  const holes = SHIP_VECTOR_OUTLINES.slice(1).map(ring => ring.map(p => shipWorldPoint(doc.ship, p)));
  const shipWalls = SHIP_VECTOR_OUTLINES[0].map(p => shipWorldPoint(doc.ship, p));
  const doors = new Set(objectDoorTargets(doc).map(target => target.id));
  for (const source of doc.objects ?? []) {
    const object = objectPosition(doc, source);
    let reason = !floor?.closed ? 'Close the map to validate gameplay objects.'
      : object.category === 'doors' && !doors.has(object.doorId) ? 'The door opening no longer exists.'
      : !floorRegionContainsPoint(floor.polygons, object) || (floor.wallPolygons ?? []).some(polygon => floorContainsPoint(polygon, object))
        || floorContainsPoint(shipWalls, object) || holes.some(polygon => floorContainsPoint(polygon, object)) ? 'Object center is outside playable floor or inside a wall.'
      : accepted.some(other => object.category === 'doors' && other.category === 'doors' && other.doorId === object.doorId
        || Math.hypot(object.x - other.x, object.y - other.y) < 45) ? 'Object centers overlap (less than 45 px apart).' : '';
    if (reason) rejected.push({ object, reason }); else accepted.push(object);
  }
  return { accepted, rejected };
}
