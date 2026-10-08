/** Fixed artwork attachment targets in native map pixels, relative to its anchor. */
const OUTER_DOOR = Object.freeze({ x: 14.5, y: -40, width: 375 });

/** Artwork coordinates are relative to the legacy, fixed graph-port anchor.
 * Reflect around the actual doorway center, preserving its world position.
 */
export function shipWorldPoint(ship, point) {
  return {
    x: ship.x + (ship.mirrored ? 2 * OUTER_DOOR.x - point.x : point.x),
    y: ship.y + point.y,
  };
}

// These are interaction targets only: the protected raster remains outside the
// editable graph, and existing ship port coordinates do not move.
export function shipDoorways(ship) {
  if (!Number.isFinite(ship?.x) || !Number.isFinite(ship?.y)) return [];
  return [{
    id: 'ship-outer-door',
    point: shipWorldPoint(ship, OUTER_DOOR),
    direction: { x: 1, y: 0 },
    width: OUTER_DOOR.width,
  }];
}
