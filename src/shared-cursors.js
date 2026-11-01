// Receiver-local presentation only. These positions never enter an edit,
// cursor packet, saved source or the document's conflict/history logic.
export class SharedCursors {
  constructor() { this.cursors = new Map(); }
  clear() { this.cursors.clear(); }
  position(cursor, now) {
    const remaining = Math.exp(-Math.max(0, now - cursor.at) / 55);
    const x = cursor.x + (cursor.fromX - cursor.x) * remaining;
    const y = cursor.y + (cursor.fromY - cursor.y) * remaining;
    return Math.hypot(x - cursor.x, y - cursor.y) < .01 ? { x: cursor.x, y: cursor.y } : { x, y };
  }
  update(value, now) {
    if (!value || typeof value.author !== 'string' || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
    const previous = this.cursors.get(value.author);
    const from = previous?.visible && value.visible ? this.position(previous, now) : value;
    this.cursors.set(value.author, { ...value, fromX: from.x, fromY: from.y, at: now, received: now });
  }
  expire(now) {
    let removed = false;
    for (const [id, cursor] of this.cursors) if (now - cursor.received > 3000) { this.cursors.delete(id); removed = true; }
    return removed;
  }
  moving(now) {
    for (const cursor of this.cursors.values()) {
      const point = this.position(cursor, now);
      if (cursor.visible && (point.x !== cursor.x || point.y !== cursor.y)) return true;
    }
    return false;
  }
  *values(now) {
    for (const cursor of this.cursors.values()) yield { ...cursor, ...this.position(cursor, now) };
  }
}
