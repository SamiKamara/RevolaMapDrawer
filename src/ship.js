/** Fixed artwork attachment targets in native map pixels, relative to its anchor. */
const OUTER_DOOR = Object.freeze({ x: 14.5, y: -40, width: 375 });
// Measured upright centers at the upper wall plane. The legacy anchor is
// 14.5 pixels left of the doorway's center, so the offsets are asymmetric.
const WALL_PORTS = Object.freeze([
  Object.freeze({ x: -356.5, y: -40 }),
  Object.freeze({ x: 385.5, y: -40 }),
]);

/** Artwork coordinates are relative to the legacy, fixed graph-port anchor.
 * Reflect around the actual doorway center, preserving its world position.
 */
export function shipWorldPoint(ship, point) {
  return {
    x: ship.x + (ship.mirrored ? 2 * OUTER_DOOR.x - point.x : point.x),
    y: ship.y + point.y,
  };
}

/** Visible wall-start handles, ordered left to right in either facing. */
export function shipPorts(ship) {
  if (!Number.isFinite(ship?.x) || !Number.isFinite(ship?.y)) return [];
  return WALL_PORTS.map(point => shipWorldPoint(ship, point)).sort((a, b) => a.x - b.x);
}

/** Old saved attachments remain pinned at their exact original coordinates. */
export function legacyShipPorts(ship) {
  if (!Number.isFinite(ship?.x) || !Number.isFinite(ship?.y)) return [];
  return [-356.5, 356.5].map(x => ({ x: ship.x + x, y: ship.y }));
}

export function isShipPort(ship, point, tolerance = 1e-6) {
  return !!point && [...shipPorts(ship), ...legacyShipPorts(ship)].some(port =>
    Math.abs(point.x - port.x) < tolerance && Math.abs(point.y - port.y) < tolerance);
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
