import * as model from './model.js';
import { drawMap, loadShip } from './render.js';
import { shipPorts, isShipPort } from './ship.js';
import { decodePngMetadata, MAX_PNG_BYTES, MAX_METADATA_BYTES } from './png.js';
import { renderMapPng, renderFloorPng } from './export.js';
import { renderMapSvg } from './svg.js';
import { generateFloor, drawFloor, renderFloorSvg } from './floors.js';
import { detectRoom } from './rooms.js';
import { resolveDoorPlacement } from './doors.js';
import { resolveCorridorStart, fitCorridorEnd, corridorPreservesOpenings } from './corridors.js';
import { resolveRoomStart, attachedRoomSegments, addAttachedRoom } from './room-start.js';
import { emptySelection, selectionVertices, pruneSelection, rectangleSelection, combineSelection, toggleSelection } from './selection.js';
import { copySelection, pasteSelection } from './clipboard.js';

const $ = id => document.getElementById(id);
const canvas = $('map-canvas');
const ctx = canvas.getContext('2d');
const container = $('canvas-container');
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let doc = model.createDocument();
let savedState = JSON.stringify(doc);
let history = [], future = [];
let tool = 'wall', shipImage, selected = emptySelection(), selectionMode = 'single', pointer = null, wallStart = null, gesture = null;
let spaceHeld = false, busy = false, scheduled = false;
// Map fragments stay local to this editor session, including across New/Open.
let clipboard = null, paste = null;
let shipDataUrl;
let floor = null, floorKey = '', floorPendingKey = '', starsPattern, starsRequested = false;
function loadStars() {
  if (starsRequested || starsPattern) return;
  starsRequested = true;
  const image = new Image();
  image.onload = () => { starsPattern = ctx.createPattern(image, 'repeat'); renderSoon(); };
  // The optional background may not be cached on a first offline closure.
  // Floor analysis and exports remain available; reconnecting retries it.
  image.src = new URL('../assets/editor-stars.png', import.meta.url).href;
}
function floorGeometryKey() {
  return JSON.stringify([doc.width, doc.height, doc.originX, doc.originY, doc.seed, doc.style, doc.vertices, doc.edges, doc.ship]);
}
function floorControls() {
  const ready = floorKey === floorGeometryKey() && !floorPendingKey;
  const closed = ready && floor?.closed;
  for (const id of ['floor-png-button', 'floor-svg-button']) $(id).disabled = busy || !closed || !!gesture || !!paste || !!wallStart;
}
function refreshFloor() {
  const key = floorGeometryKey();
  if (key === floorKey) floorPendingKey = '';
  else if (key !== floorPendingKey) {
    floorPendingKey = key;
    setTimeout(() => {
      if (floorPendingKey !== key) return;
      if (floorGeometryKey() !== key) { refreshFloor(); return; }
      try { floor = generateFloor(doc); }
      catch (error) { floor = { closed: null, reason: `Floor check unavailable: ${error.message}` }; }
      floorKey = key; floorPendingKey = '';
      if (floor?.closed) loadStars();
      floorControls(); renderSoon();
    }, 0);
  }
  floorControls();
}
const camera = { x: 0, y: 0, scale: .1 };
const descriptions = {
  select: ['Select tool', 'Drag an area or Ctrl-click points/walls. Ctrl+C copies their walls and openings. Ctrl+V previews a copy; move the pointer and click to place, or Escape to cancel. Drag selected items to move them. A single room side still resizes.'],
  wall: ['Wall tool', 'Click to chain walls, or drag to draw. Nearby ends join automatically. Draw along a wall to extend it or fill an opening. Escape ends the chain.'],
  door: ['Door tool', 'Click a wall to cut a 375 px opening. Aim near the middle between corners or branches to snap exactly to CENTER. Click an existing opening to restore the wall.'],
  eraser: ['Eraser tool', 'Drag to erase any length of wall. Choose Brush size in the top bar. One stroke is one undo step. The fixed ship stays protected.'],
  room: ['Room tool', 'Start at DOOR, END or CENTER to attach a room with a centered door. Drag straight outward for a square room, or diagonally to set width and depth. A sideways drag supplies a default depth. The adjoining side stays centered on the start. Free rooms use Rotate 45° or Shift + R.'],
  corridor: ['Corridor tool', 'Drag a route to draw a 580 px corridor. CENTER or DOOR aligns the start; from END, continue outward before turning. The ship’s outer airlock door also aligns. Finish near a target to align the endpoint while keeping your start and turn directions. Use broad turns.'],
  hand: ['Hand tool', 'Drag to move around the map. Scroll to zoom at your cursor, or press F to fit the whole map.'],
};

function status(message, error = false) {
  $('status-message').textContent = message;
  $('status-message').classList.toggle('error', error);
}
function dirty() { return JSON.stringify(doc) !== savedState; }
function refresh() {
  const changed = dirty();
  $('document-title').textContent = doc.name || 'Untitled map';
  $('canvas-title').textContent = doc.name || 'Untitled map';
  $('canvas-dimensions').textContent = `${doc.width} × ${doc.height} px`;
  document.title = `${changed ? '• ' : ''}${doc.name || 'Untitled map'} — Revola Map Drawer`;
  $('dirty-dot').classList.toggle('dirty', changed);
  if (document.activeElement !== $('map-name')) $('map-name').value = doc.name;
  $('graph-stats').textContent = `${doc.edges.length} walls · ${doc.edges.reduce((count, e) => count + e.doors.length, 0)} doors`;
  $('undo-button').disabled = !history.length;
  $('redo-button').disabled = !future.length;
  $('mirror-label').textContent = doc.ship.mirrored ? 'Ship facing left' : 'Ship facing right';
  selected = pruneSelection(doc, selected);
  const selection = gesture?.type === 'marquee' ? gesture.selection : selected;
  const pointCount = selectionVertices(doc, selection).size;
  const selectedPoints = selectionVertices(doc, selected);
  const copyable = doc.edges.some(e => selectedPoints.has(e.a) && selectedPoints.has(e.b));
  $('copy-button').disabled = !copyable || busy || !!gesture || !!paste;
  $('paste-button').disabled = !clipboard || busy || !!gesture;
  const edge = selectionMode === 'single' && selection.edgeIds.length === 1 && !selection.vertexIds.length
    ? doc.edges.find(e => e.id === selection.edgeIds[0]) : null;
  $('delete-button').disabled = !pointCount || !!paste;
  const room = edge ? detectRoom(doc, edge.id) : null;
  $('selection-badge').textContent = room ? 'ROOM SIDE' : edge ? 'WALL' : pointCount ? selectionMode === 'single' && pointCount === 1 ? 'POINT' : 'GROUP' : '—';
  $('selection-info').dataset.wallCount = String(selection.edgeIds.length);
  $('selection-info').dataset.pointCount = String(pointCount);
  $('selection-info').hidden = !pointCount;
  if (edge) {
    const a = doc.vertices.find(v => v.id === edge.a), b = doc.vertices.find(v => v.id === edge.b);
    $('selection-info').textContent = `${Math.round(distance(a, b))} px · ${edge.doors.length} door${edge.doors.length === 1 ? '' : 's'}`;
  } else if (pointCount) $('selection-info').textContent = `${selection.edgeIds.length} wall${selection.edgeIds.length === 1 ? '' : 's'} · ${pointCount} point${pointCount === 1 ? '' : 's'}`;
  else $('selection-info').textContent = '';
  window.revolaDesktop?.setDirty(changed);
  refreshFloor();
  renderSoon();
}
function commit(operation, message) {
  const before = JSON.stringify(doc);
  const previousWidth = doc.width;
  try {
    const result = operation();
    const after = JSON.stringify(doc);
    if (before !== after) {
      history.push(before);
      if (history.length > 100) history.shift();
      future = [];
      if (message) status(message + (doc.width > previousWidth ? ' Canvas expanded to 16384 × 16384 around the same center.' : ''));
    }
    refresh();
    return result;
  } catch (error) {
    doc = JSON.parse(before);
    status(error.message, true);
    refresh();
    return false;
  }
}
function cancelGesture() { gesture = null; wallStart = null; paste = null; refresh(); }
function copySelected() {
  if (busy || gesture || paste || wallStart) return;
  try {
    clipboard = copySelection(doc, selected);
    status(`Copied ${clipboard.edges.length} walls and their openings. Ctrl+V to place a copy.`);
  } catch (error) { status(error.message, true); }
  refresh();
}
function updatePaste(point) {
  if (!paste) return;
  const delta = model.snapPoint({ x: point.x - paste.fragment.anchor.x, y: point.y - paste.fragment.anchor.y }, doc.style.grid);
  if (paste.source === doc && paste.delta?.x === delta.x && paste.delta?.y === delta.y) return;
  paste.delta = delta; paste.source = doc; paste.preview = null;
  paste.ghost = { ...doc, vertices: paste.fragment.vertices.map(v => ({ ...v, x: v.x + delta.x, y: v.y + delta.y })), edges: paste.fragment.edges };
  try {
    const draft = clone(doc);
    paste.selection = pasteSelection(draft, paste.fragment, delta);
    paste.preview = draft;
    status('Click to place the copy. Escape cancels. Ctrl+V starts another copy after placement.');
  } catch (error) { status(`Cannot paste here: ${error.message} Move the pointer, or Escape to cancel.`, true); }
  renderSoon();
}
function beginPaste() {
  if (busy || gesture || wallStart) return;
  if (!clipboard) { status('Select walls or both ends of a wall, then press Ctrl+C first.', true); return; }
  setTool('select');
  paste = { fragment: clipboard };
  updatePaste(pointer || world({ x: container.clientWidth / 2, y: container.clientHeight / 2 }));
  canvas.focus(); refresh();
}
function placePaste(point) {
  updatePaste(point);
  if (!paste?.preview) return;
  const current = paste;
  commit(() => {
    // Validate again at commit; no unrelated action can make a preview stale.
    selected = pasteSelection(doc, current.fragment, current.delta);
    selectionMode = 'group'; paste = null;
  }, `Pasted ${current.fragment.edges.length} walls. The copy is selected. Ctrl+V to place another.`);
}
function setTool(next) {
  cancelGesture(); tool = next;
  for (const button of document.querySelectorAll('[data-tool]')) {
    const active = button.dataset.tool === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('active-tool-name').textContent = descriptions[next][0];
  $('tool-guide').textContent = descriptions[next][1];
  $('rotate-option').hidden = next !== 'room';
  $('eraser-option').hidden = next !== 'eraser';
  canvas.style.cursor = next === 'hand' ? 'grab' : next === 'select' ? 'default' : 'crosshair';
  status(descriptions[next][1]); renderSoon();
}
function undo() {
  if (paste) { cancelGesture(); status('Paste canceled.'); return; }
  if (!history.length) return;
  future.push(JSON.stringify(doc)); doc = JSON.parse(history.pop()); cancelGesture();
  status('Undone.'); refresh();
}
function redo() {
  if (paste) { cancelGesture(); status('Paste canceled.'); return; }
  if (!future.length) return;
  history.push(JSON.stringify(doc)); doc = JSON.parse(future.pop()); cancelGesture();
  status('Redone.'); refresh();
}
function local(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function world(point) { return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale }; }
function inside(point, source = doc) { const bounds = model.getMapBounds(source); return point.x >= bounds.left && point.y >= bounds.top && point.x <= bounds.right && point.y <= bounds.bottom; }
function drawable(point) { return point.x >= -4096 && point.y >= -4096 && point.x <= 12288 && point.y <= 12288; }
function eraserRadius() { return Number($('eraser-size').value) / 2; }
function anchors() { return shipPorts(doc.ship); }
function joinOptions() { return { joinTolerance: Math.min(100, Math.max(doc.style.wallWidth, 12 / camera.scale)) }; }
function nearestVertex(point, max = 10 / camera.scale) {
  return doc.vertices.filter(v => distance(v, point) < max).sort((a, b) => distance(a, point) - distance(b, point))[0];
}
function doorTarget(point) {
  const hit = model.nearestEdge(doc, point, doc.style.wallWidth / 2 + 12 / camera.scale);
  if (!hit) return null;
  // Removal follows the actual pointer; midpoint attraction must not move it
  // away from an existing opening or turn a placement into a removal.
  const found = hit.edge.doors.find(door => Math.abs(door.t - hit.t) * distance(hit.a, hit.b) <= doc.style.doorWidth / 2);
  const placement = found ? null : resolveDoorPlacement(doc, hit.edge.id, hit.point);
  const target = found ? { x: hit.a.x + (hit.b.x - hit.a.x) * found.t, y: hit.a.y + (hit.b.y - hit.a.y) * found.t }
    : placement?.point ?? hit.point;
  return { hit, found, placement, point: target };
}
function corridorTarget(point) {
  return resolveCorridorStart(doc, point, { wallTolerance: joinOptions().joinTolerance });
}
function roomTarget(point) {
  return resolveRoomStart(doc, point, { wallTolerance: joinOptions().joinTolerance });
}
function targetName(target) {
  return target.kind === 'door' ? 'door center' : target.kind === 'end' ? 'corridor end' : 'wall midpoint';
}
function targetLabel(target) {
  return target.kind === 'door' ? 'DOOR' : target.kind === 'end' ? 'END' : 'CENTER';
}
function snap(point, start) {
  const options = joinOptions();
  // Existing legacy attachments remain usable, without exposing obsolete
  // empty-map handles. Pick the nearest exact pin before broader attraction.
  const candidates = [...anchors(), ...doc.vertices.filter(v => isShipPort(doc.ship, v))]
    .filter(v => distance(v, point) <= options.joinTolerance);
  candidates.sort((a, b) => distance(a, point) - distance(b, point));
  for (const candidate of candidates) {
    if (!start) return { x: candidate.x, y: candidate.y };
    const dx = Math.abs(candidate.x - start.x), dy = Math.abs(candidate.y - start.y);
    if (dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-6) return { x: candidate.x, y: candidate.y };
  }
  if (start) return model.resolveWallEndpoint(doc, start, model.snapEndpoint(start, point, doc.style.grid), options);
  return model.snapWallStart(doc, model.snapPoint(point, doc.style.grid), options);
}
function fit() {
  const bounds = model.getMapBounds(doc);
  camera.scale = Math.min((container.clientWidth - 64) / doc.width, (container.clientHeight - 52) / doc.height);
  camera.x = (container.clientWidth - doc.width * camera.scale) / 2 - bounds.left * camera.scale;
  camera.y = (container.clientHeight - doc.height * camera.scale) / 2 - bounds.top * camera.scale;
  renderSoon();
}
function zoom(factor, at = { x: container.clientWidth / 2, y: container.clientHeight / 2 }) {
  const anchor = world(at);
  camera.scale = Math.max(.025, Math.min(2, camera.scale * factor));
  camera.x = at.x - anchor.x * camera.scale;
  camera.y = at.y - anchor.y * camera.scale;
  renderSoon();
}
function renderSoon() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; render(); });
}
function segment(a, b, color = '#b5e8c6', dashed = false, width = 1.4) {
  ctx.strokeStyle = color; ctx.lineWidth = width / camera.scale;
  ctx.setLineDash(dashed ? [5 / camera.scale, 5 / camera.scale] : []);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
}
function handle(point, radius = 4, color = '#b5e8c6') {
  ctx.fillStyle = '#101e15'; ctx.strokeStyle = color; ctx.lineWidth = 1.2 / camera.scale;
  ctx.beginPath(); ctx.arc(point.x, point.y, radius / camera.scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function roomPreview() {
  if (!gesture || gesture.type !== 'room') return [];
  if (gesture.target) return gesture.segments || [];
  return model.roomSegments(gesture.start, gesture.end, $('rotate-room').checked, doc.style.chamfer);
}
function updateRoom(current, aim) {
  current.end = current.target ? { ...aim } : model.snapPoint(aim, doc.style.grid);
  if (!current.target) return;
  if (distance(current.pointerStart, aim) * camera.scale <= 3) {
    current.segments = []; current.valid = false; current.previewKey = null;
    status(`Room start aligned to the ${targetName(current.target)}. Drag to size the room.`);
    return;
  }
  const key = JSON.stringify(current.end);
  if (key === current.previewKey) return;
  current.previewKey = key; current.segments = []; current.valid = false;
  try {
    current.segments = attachedRoomSegments(doc, current.target, current.end);
    addAttachedRoom(clone(doc), current.target, current.end);
    current.valid = true;
    status('Release to place the room with its centered door.');
  } catch (error) { status(error.message, true); }
}
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const start = points[0], end = points.at(-1);
  const dx = end.x - start.x, dy = end.y - start.y, length2 = dx * dx + dy * dy;
  let max = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const t = length2 ? Math.max(0, Math.min(1, ((points[i].x - start.x) * dx + (points[i].y - start.y) * dy) / length2)) : 0;
    const d = distance(points[i], { x: start.x + dx * t, y: start.y + dy * t });
    if (d > max) { max = d; index = i; }
  }
  if (max <= tolerance) return [start, end];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}
function corridorPath(points, startTarget = null) {
  const reduced = simplify(points, doc.style.corridorWidth * .22);
  // Pointerdown already resolved this start. Keep fractional wall/door centers
  // exactly; subsequent 45-degree steps use this same origin in preview/save.
  const result = [{ ...reduced[0] }];
  for (const point of reduced.slice(1)) {
    let next;
    if (result.length === 1 && startTarget?.kind === 'end') {
      const direction = startTarget.outwardDirection;
      const along = (point.x - result[0].x) * direction.x + (point.y - result[0].y) * direction.y;
      const run = Math.round(along / doc.style.grid) * doc.style.grid;
      if (run <= 0) continue;
      next = { x: result[0].x + direction.x * run, y: result[0].y + direction.y * run };
    } else next = model.snapEndpoint(result.at(-1), point, doc.style.grid);
    if (distance(next, result.at(-1)) >= doc.style.corridorWidth * .6) result.push(next);
  }
  return result;
}
function placeCorridor(path, startTarget, endTarget = null) {
  return commit(() => model.addCorridor(doc, path), endTarget
    ? `Corridor endpoint aligned to the ${targetName(endTarget)}.`
    : startTarget?.kind === 'end' ? 'Corridor placed from the corridor end.'
    : startTarget?.kind === 'door' ? 'Corridor placed from the door center.'
    : startTarget ? 'Corridor placed from the wall midpoint. Use the Door tool to open the wall.'
    : 'Corridor placed. Use the Door tool to connect through existing walls.');
}
function corridorRoute(current, release) {
  // The release is the user's actual aim, including a final movement smaller
  // than the sampling threshold. Attraction must precede route quantization.
  const points = [...current.points];
  if (distance(points.at(-1), release) > 1e-6) points.push(release);
  const path = corridorPath(points, current.target), target = corridorTarget(release);
  // Pointer sampling and grid quantization often produce the same route over
  // several frames. Reuse its insertion check while the document is unchanged.
  const key = target && JSON.stringify([path, target.edgeId, target.kind, target.point]);
  if (key && current.routeCache?.source === doc && current.routeCache.key === key) return current.routeCache.route;
  const remember = route => {
    if (key) current.routeCache = { source: doc, key, route };
    return route;
  };
  const host = target && doc.edges.find(edge => edge.id === target.edgeId);
  const hostA = host && doc.vertices.find(vertex => vertex.id === host.a);
  const hostB = host && doc.vertices.find(vertex => vertex.id === host.b);
  const hostDirection = target?.direction ?? (hostA && hostB && { x: hostB.x - hostA.x, y: hostB.y - hostA.y });
  const last = path.at(-1), previous = path.at(-2);
  const crossesHost = previous && hostDirection && Math.abs((last.x - previous.x) * hostDirection.y
    - (last.y - previous.y) * hostDirection.x) > 1e-6 && (target.kind !== 'end'
    || (Math.abs((last.x - previous.x) * target.outwardDirection.y - (last.y - previous.y) * target.outwardDirection.x) < 1e-6
      && (last.x - previous.x) * target.outwardDirection.x + (last.y - previous.y) * target.outwardDirection.y < 0));
  const fit = crossesHost && fitCorridorEnd(path, target.point, { width: doc.style.corridorWidth, maxDeviation: 300 });
  if (fit && corridorPreservesOpenings(doc, fit.path)) {
    try {
      // A valid centerline alone does not guarantee legal graph connections.
      // Previewing cannot change history, openings, bounds or ship ports.
      model.addCorridor(clone(doc), fit.path);
      return remember({ path: fit.path, endTarget: target });
    } catch { /* Keep the ordinary drawing flow when no safe fit is available. */ }
  }
  return remember({ path, endTarget: null });
}
function render() {
  const ratio = window.devicePixelRatio || 1;
  const width = container.clientWidth, height = container.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#101612'; ctx.fillRect(0, 0, width, height);
  ctx.translate(camera.x, camera.y); ctx.scale(camera.scale, camera.scale);
  const viewDoc = gesture?.preview || doc;
  const boundsDoc = paste?.preview || viewDoc;
  const bounds = model.getMapBounds(boundsDoc);
  ctx.fillStyle = '#000000'; ctx.fillRect(bounds.left, bounds.top, boundsDoc.width, boundsDoc.height);
  ctx.strokeStyle = '#35463b'; ctx.lineWidth = 1 / camera.scale; ctx.strokeRect(bounds.left, bounds.top, boundsDoc.width, boundsDoc.height);
  ctx.save(); ctx.beginPath(); ctx.rect(bounds.left, bounds.top, boundsDoc.width, boundsDoc.height); ctx.clip();
  const floorCurrent = floorKey === floorGeometryKey() && !floorPendingKey && floor?.closed;
  if (floorCurrent && starsPattern) {
    ctx.save(); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = starsPattern; ctx.fillRect(0, 0, width, height); ctx.restore();
  }
  if ($('grid-toggle').checked) {
    const step = camera.scale > .25 ? 100 : 500;
    ctx.strokeStyle = '#101b13'; ctx.lineWidth = .6 / camera.scale;
    ctx.beginPath();
    for (let x = Math.ceil(bounds.left / step) * step; x < bounds.right; x += step) { ctx.moveTo(x, bounds.top); ctx.lineTo(x, bounds.bottom); }
    for (let y = Math.ceil(bounds.top / step) * step; y < bounds.bottom; y += step) { ctx.moveTo(bounds.left, y); ctx.lineTo(bounds.right, y); }
    ctx.stroke();
  }
  if (floorCurrent) drawFloor(ctx, floor);
  drawMap(ctx, viewDoc, { shipImage });
  ctx.restore();
  // Drawing previews may cross the current boundary; commit expands the map
  // without moving the camera, content or original center.
  if (pointer && drawable(pointer) && !inside(pointer) && ['wall', 'room', 'corridor'].includes(tool)) {
    ctx.strokeStyle = '#51725c'; ctx.lineWidth = 1 / camera.scale; ctx.setLineDash([5 / camera.scale, 5 / camera.scale]);
    ctx.strokeRect(-4096, -4096, 16384, 16384); ctx.setLineDash([]);
  }
  if (tool === 'wall' && (wallStart || !doc.edges.length)) {
    for (const port of anchors()) handle(port, 3, '#698c75');
  }
  if (tool === 'select' && !paste) {
    const selection = gesture?.type === 'marquee' ? gesture.selection : selected;
    const edgeIds = new Set(selection.edgeIds), vertices = new Map(viewDoc.vertices.map(v => [v.id, v]));
    const color = gesture?.moved && gesture.valid === false ? '#eeaa91' : '#acdaba';
    for (const edge of viewDoc.edges) if (edgeIds.has(edge.id)) {
      const a = vertices.get(edge.a), b = vertices.get(edge.b);
      segment(a, b, color); handle({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 3, color);
    }
    for (const id of selectionVertices(viewDoc, selection)) {
      const point = vertices.get(id); if (point) handle(point, 4, color);
    }
    if (gesture?.type === 'marquee') {
      const { start, end } = gesture;
      ctx.fillStyle = '#b5e8c61a'; ctx.strokeStyle = '#b5e8c6'; ctx.lineWidth = 1 / camera.scale;
      ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    }
  }
  if (paste?.ghost) {
    const color = paste.preview ? '#acdaba' : '#eeaa91';
    ctx.save(); ctx.globalAlpha = .6; drawMap(ctx, paste.ghost, { drawShip: false }); ctx.restore();
    for (const point of paste.ghost.vertices) handle(point, 4, color);
    const xs = paste.ghost.vertices.map(v => v.x), ys = paste.ghost.vertices.map(v => v.y);
    const left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, height = Math.max(...ys) - top;
    ctx.strokeStyle = color; ctx.lineWidth = 1 / camera.scale; ctx.setLineDash([5 / camera.scale, 5 / camera.scale]);
    ctx.strokeRect(left - 35, top - 35, width + 70, height + 70); ctx.setLineDash([]);
    ctx.save(); ctx.translate(left, top - 35); ctx.scale(1 / camera.scale, 1 / camera.scale);
    ctx.fillStyle = '#13271bee'; ctx.fillRect(0, -24, 160, 20);
    ctx.fillStyle = color; ctx.font = '10px system-ui'; ctx.textBaseline = 'middle';
    ctx.fillText(paste.preview ? 'PASTE · click to place' : 'BLOCKED · move to clear space', 6, -14); ctx.restore();
  }
  if (pointer && drawable(pointer) && tool === 'wall') {
    const target = snap(pointer, wallStart);
    if (wallStart) { segment(wallStart, target, '#b5e8c6', true); handle(wallStart); }
    handle(target, 3);
  }
  if (gesture?.type === 'room') {
    const color = gesture.target && !gesture.valid ? '#be8c6f' : '#b5e8c6';
    try { for (const { a, b } of roomPreview()) segment(a, b, color, true, 2); }
    catch { segment(gesture.start, gesture.end, '#be8c6f', true); }
  }
  if (gesture?.type === 'corridor') {
    const { path, endTarget } = gesture.route || { path: corridorPath(gesture.points, gesture.target) };
    try { for (const { a, b } of model.corridorSegments(path, doc.style.corridorWidth)) segment(a, b, '#b5e8c6', true, 2); }
    catch { for (let i = 1; i < path.length; i++) segment(path[i - 1], path[i], '#be8c6f', true); }
    if (endTarget) {
      handle(endTarget.point, 5);
      ctx.save(); ctx.translate(endTarget.point.x, endTarget.point.y); ctx.scale(1 / camera.scale, 1 / camera.scale);
      ctx.fillStyle = '#13271be6'; ctx.fillRect(-37, -29, 74, 17);
      ctx.fillStyle = '#b5e8c6'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`END · ${targetLabel(endTarget)}`, 0, -20); ctx.restore();
    }
  }
  if (['corridor', 'room'].includes(tool) && (gesture?.type === tool || (!gesture && pointer && drawable(pointer)))) {
    const target = gesture?.type === tool ? gesture.target : tool === 'room' ? roomTarget(pointer) : corridorTarget(pointer);
    const start = gesture?.type === 'corridor' ? gesture.points[0] : gesture?.type === 'room' ? gesture.start : target?.point ?? model.snapPoint(pointer, doc.style.grid);
    handle(start, target ? 5 : 3);
    if (target) {
      const label = targetLabel(target);
      ctx.save(); ctx.translate(start.x, start.y); ctx.scale(1 / camera.scale, 1 / camera.scale);
      ctx.fillStyle = '#13271be6'; ctx.fillRect(-27, -29, 54, 17);
      ctx.fillStyle = '#b5e8c6'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, -20); ctx.restore();
    }
  }
  if (tool === 'door' && pointer) {
    const target = doorTarget(pointer);
    if (target) {
      const { hit, found, placement, point } = target;
      const angle = Math.atan2(hit.b.y - hit.a.y, hit.b.x - hit.a.x);
      const color = found || placement ? '#b5e8c6' : '#be8c6f';
      ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(angle);
      ctx.fillStyle = `${color}33`; ctx.fillRect(-doc.style.doorWidth / 2, -doc.style.wallWidth, doc.style.doorWidth, doc.style.wallWidth * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 1 / camera.scale;
      ctx.strokeRect(-doc.style.doorWidth / 2, -doc.style.wallWidth, doc.style.doorWidth, doc.style.wallWidth * 2); ctx.restore();
      if (placement?.centered) {
        const extentY = Math.abs(Math.sin(angle)) * doc.style.doorWidth / 2 + Math.abs(Math.cos(angle)) * doc.style.wallWidth;
        ctx.save(); ctx.translate(point.x, point.y - extentY); ctx.scale(1 / camera.scale, 1 / camera.scale);
        ctx.fillStyle = '#13271be6'; ctx.fillRect(-27, -23, 54, 17);
        ctx.fillStyle = color; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('CENTER', 0, -14); ctx.restore();
      }
    }
  }
  if (tool === 'eraser' && pointer) {
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, eraserRadius(), 0, Math.PI * 2);
    ctx.fillStyle = '#e5bca515'; ctx.fill(); ctx.strokeStyle = '#e5bca5'; ctx.lineWidth = 1.2 / camera.scale; ctx.stroke();
  }
  $('zoom-value').textContent = `${Math.round(camera.scale * 100)}%`;
}

canvas.addEventListener('pointerdown', event => {
  if (busy || (event.button !== 0 && event.button !== 1)) return;
  canvas.focus(); event.preventDefault();
  const at = local(event), point = world(at); pointer = point;
  if (event.button === 1 || spaceHeld || tool === 'hand') {
    gesture = { type: 'pan', start: at, x: camera.x, y: camera.y };
    canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing'; return;
  }
  if (paste) { placePaste(point); return; }
  if (!drawable(point)) { status('The largest supported canvas is 16384 × 16384 around the original center.', true); return; }
  if (tool === 'wall') {
    const target = snap(point, wallStart);
    if (!wallStart) {
      wallStart = target; gesture = { type: 'wall-draw', start: target, moved: false };
      canvas.setPointerCapture(event.pointerId); status('Click the next corner, or drag to draw a wall. Escape ends the chain.');
    }
    else if (distance(wallStart, target) > .01) {
      const result = commit(() => model.addWall(doc, wallStart, target, joinOptions()), 'Wall placed. Continue drawing or press Escape.');
      if (result) wallStart = result.end || target;
    }
    refresh();
  } else if (tool === 'door') {
    const target = doorTarget(point);
    if (!target) { status('Aim at a wall to place a door.', true); return; }
    const { hit, found, placement } = target;
    if (found) commit(() => model.removeDoor(doc, hit.edge.id, found.id), 'Door removed; wall restored.');
    else {
      const placed = placement && commit(() => model.addDoor(doc, hit.edge.id, hit.point),
        placement.centered ? 'Door centered between wall junctions.' : '375 px door opening placed.');
      if (!placed) status('There is not enough room for a door here. Keep clear of corners and other doors.', true);
    }
  } else if (tool === 'eraser') {
    selected = emptySelection();
    gesture = { type: 'erase', preview: clone(doc), previous: point, radius: eraserRadius() };
    try { model.eraseWalls(gesture.preview, point, point, gesture.radius); }
    catch (error) { gesture = null; status(error.message, true); return; }
    canvas.setPointerCapture(event.pointerId); refresh();
  } else if (tool === 'room') {
    const target = roomTarget(point);
    const start = target?.point ?? model.snapPoint(point, doc.style.grid);
    gesture = { type: 'room', target, start, pointerStart: { ...point }, end: { ...start }, valid: false, segments: [] };
    status(target ? `Room start aligned to the ${targetName(target)}. Drag toward clear space to size the room.` : 'Drag to size a room.');
    canvas.setPointerCapture(event.pointerId); refresh();
  } else if (tool === 'corridor') {
    const target = corridorTarget(point);
    gesture = { type: 'corridor', target, points: [target?.point ?? model.snapPoint(point, doc.style.grid)] };
    status(target ? `Corridor start aligned to the ${targetName(target)}. Drag the route.` : 'Drag a route to draw a 580 px corridor.');
    canvas.setPointerCapture(event.pointerId); refresh();
  } else if (tool === 'select') {
    const vertex = nearestVertex(point, 8 / camera.scale);
    const hit = model.nearestEdge(doc, point, 12 / camera.scale);
    const additive = event.ctrlKey || event.metaKey;
    if (vertex || hit) {
      const kind = vertex ? 'vertex' : 'edge', id = vertex?.id ?? hit.edge.id;
      if (additive) {
        selected = toggleSelection(doc, selected, kind, id); selectionMode = 'group';
        status('Selection updated. Drag a selected item to move the group.'); refresh(); return;
      }
      const effective = selectionVertices(doc, selected);
      const belongs = vertex ? effective.has(id) : selected.edgeIds.includes(id) || (effective.has(hit.edge.a) && effective.has(hit.edge.b));
      if (!belongs) {
        selected = kind === 'vertex' ? { edgeIds: [], vertexIds: [id] } : { edgeIds: [id], vertexIds: [] };
        selectionMode = 'single';
      }
      const type = selectionMode === 'group' ? 'selection' : vertex ? 'vertex' : 'wall';
      gesture = { type, id, selection: clone(selected), start: point, original: clone(doc), preview: null, moved: false, valid: false };
    } else {
      const base = additive ? clone(selected) : emptySelection();
      gesture = { type: 'marquee', start: point, end: point, base, selection: base, moved: false };
    }
    canvas.setPointerCapture(event.pointerId);
    refresh();
  }
});
canvas.addEventListener('pointermove', event => {
  const at = local(event); pointer = world(at);
  $('pointer-position').textContent = `X ${Math.round(pointer.x)}  Y ${Math.round(pointer.y)}`;
  if (gesture?.type === 'pan') {
    camera.x = gesture.x + at.x - gesture.start.x; camera.y = gesture.y + at.y - gesture.start.y;
  } else if (gesture?.type === 'wall-draw') {
    if (distance(gesture.start, pointer) * camera.scale > 3) gesture.moved = true;
  } else if (gesture?.type === 'erase') {
    try { model.eraseWalls(gesture.preview, gesture.previous, pointer, gesture.radius); gesture.previous = { ...pointer }; }
    catch (error) { status(error.message, true); }
  } else if (gesture?.type === 'room') updateRoom(gesture, pointer);
  else if (gesture?.type === 'corridor') {
    if (distance(gesture.points.at(-1), pointer) > 35 && gesture.points.length < 2000) gesture.points.push(pointer);
    gesture.route = corridorRoute(gesture, pointer);
    status(gesture.route.endTarget ? `Corridor endpoint aligned to the ${targetName(gesture.route.endTarget)}. Release to place.`
      : 'Drag the route. Finish near CENTER, DOOR or END to align the endpoint automatically.');
  } else if (gesture?.type === 'marquee') {
    gesture.end = pointer;
    gesture.moved = distance(gesture.start, pointer) * camera.scale > 3;
    gesture.selection = gesture.moved ? combineSelection(doc, gesture.base, rectangleSelection(doc, gesture.start, pointer)) : gesture.base;
    refresh();
  } else if (gesture?.type === 'wall' || gesture?.type === 'vertex' || gesture?.type === 'selection') {
    const dragDistance = distance(gesture.start, pointer) * camera.scale;
    if (gesture.moved || dragDistance > 3) {
      gesture.moved = true;
      // Returning to the press location cancels a previous preview instead of
      // committing the last offset outside the drag threshold.
      if (dragDistance <= 3) {
        gesture.valid = false; gesture.preview = null;
        status('Release to keep the original position.'); renderSoon(); return;
      }
      const draft = clone(gesture.original);
      try {
        gesture.valid = gesture.type === 'selection'
          ? model.moveSelection(draft, gesture.selection, model.snapPoint({ x: pointer.x - gesture.start.x, y: pointer.y - gesture.start.y }, doc.style.grid))
          : gesture.type === 'wall'
          ? model.moveWall(draft, gesture.id, { x: pointer.x - gesture.start.x, y: pointer.y - gesture.start.y }, joinOptions())
          : model.moveVertex(draft, gesture.id, pointer, joinOptions());
      } catch { gesture.valid = false; }
      gesture.preview = gesture.valid ? draft : null;
      status(gesture.valid ? 'Release to apply. Connected walls keep their directions.' : 'This move is blocked by a connection, ship port, doorway or map boundary. Include adjoining points to move the group.', !gesture.valid);
    }
  }
  if (paste && gesture?.type !== 'pan') updatePaste(pointer);
  renderSoon();
});
function finishPointer(event) {
  const current = gesture;
  if (!current) return;
  gesture = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  canvas.style.cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  if (current.type === 'wall-draw' && current.moved) {
    const end = snap(world(local(event)), current.start);
    commit(() => model.addWall(doc, current.start, end, joinOptions()), 'Wall drawn. Nearby ends joined; covered openings filled.'); wallStart = null;
  } else if (current.type === 'erase') commit(() => { doc = current.preview; }, 'Wall erased. Draw over the gap to restore it.');
  else if (current.type === 'room') {
    updateRoom(current, world(local(event)));
    if (distance(current.pointerStart, world(local(event))) * camera.scale > 3 && distance(current.start, current.end) > 5) commit(() => current.target
      ? addAttachedRoom(doc, current.target, current.end)
      : model.addRoom(doc, current.start, current.end, $('rotate-room').checked),
    current.target ? `Room placed with its door at the ${targetName(current.target)}.` : 'Room placed. Drag a side to resize it while keeping its chamfers.');
  }
  else if (current.type === 'corridor' && distance(current.points[0], world(local(event))) > 5) {
    const route = corridorRoute(current, world(local(event)));
    placeCorridor(route.path, current.target, route.endTarget);
  }
  else if (current.type === 'marquee') {
    selected = current.selection; selectionMode = 'group';
    status(selectionVertices(doc, selected).size ? 'Area selected. Ctrl-click to adjust; drag a selected item to move.' : 'Selection cleared.');
  }
  else if (['wall', 'vertex', 'selection'].includes(current.type) && current.moved && current.valid && current.preview) commit(() => { doc = current.preview; }, current.type === 'selection' ? 'Selected group moved.' : 'Connected walls moved.');
  refresh();
}
canvas.addEventListener('pointerup', finishPointer);
canvas.addEventListener('pointercancel', () => { gesture = null; refresh(); });
canvas.addEventListener('pointerleave', () => { if (!gesture) { pointer = null; renderSoon(); } });
canvas.addEventListener('contextmenu', event => { event.preventDefault(); cancelGesture(); status('Gesture canceled.'); });
canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(Math.exp(-event.deltaY * .0015), local(event)); pointer = world(local(event)); if (paste) updatePaste(pointer); }, { passive: false });

async function confirmReplacement() {
  if (!dirty()) return true;
  const dialog = $('confirm-dialog');
  if (dialog.open) return false;
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'discard'), { once: true }); dialog.showModal(); });
}
function replaceDocument(next) {
  doc = next; savedState = JSON.stringify(doc); history = []; future = []; selected = emptySelection(); selectionMode = 'single';
  cancelGesture(); fit(); refresh();
}
async function newDocument() {
  if (busy || !(await confirmReplacement())) return;
  replaceDocument(model.createDocument()); status('New map ready. Start drawing above the airlock.');
}
async function importBytes(name, bytes) {
  try {
    if (bytes.length > MAX_PNG_BYTES) throw new Error('This file exceeds the 32 MiB import limit.');
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    if (!png && bytes.length > MAX_METADATA_BYTES) throw new Error('This project exceeds the 4 MiB limit.');
    const next = model.validateDocument(png ? decodePngMetadata(bytes) : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (!(await confirmReplacement())) return;
    replaceDocument(next); status(`Opened ${name}. All walls and doors are editable.`);
  } catch (error) { status(`Could not open: ${error.message}`, true); }
}
async function openDocument() {
  if (busy) return;
  if (window.revolaDesktop) {
    try { const file = await window.revolaDesktop.openFile(); if (file) await importBytes(file.name, new Uint8Array(file.bytes)); }
    catch (error) { status(`Could not open: ${error.message}`, true); }
  } else { $('file-input').value = ''; $('file-input').click(); }
}
function safeName(name) { return (name || 'Untitled map').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Untitled map'; }
async function embeddedShip() {
  if (shipDataUrl) return shipDataUrl;
  if (window.revolaDesktop) shipDataUrl = await window.revolaDesktop.shipPngDataUrl();
  else {
    const response = await fetch(new URL('../assets/ship.png', import.meta.url));
    if (!response.ok) throw new Error('The bundled ship image could not be loaded.');
    const blob = new Blob([await response.arrayBuffer()], { type: 'image/png' });
    shipDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The bundled ship image could not be embedded.'));
      reader.readAsDataURL(blob);
    });
  }
  return shipDataUrl;
}
async function saveDocument(kind = 'png') {
  if (busy) return;
  const floorExport = kind === 'floor-png' || kind === 'floor-svg';
  if (floorExport && (!floor?.closed || floorKey !== floorGeometryKey() || floorPendingKey)) return;
  const fileKind = floorExport ? kind.slice(6) : kind;
  busy = true; $('export-button').disabled = true; $('svg-button').disabled = true; $('project-button').disabled = true; canvas.classList.add('loading');
  floorControls();
  const snapshot = clone(doc);
  const exportFloor = floor;
  const name = `${safeName(snapshot.name)}${floorExport ? '-floors' : ''}${fileKind === 'png' ? '.png' : fileKind === 'svg' ? '.svg' : '.revola.json'}`;
  try {
    model.validateDocument(snapshot);
    let bytes;
    if (kind === 'floor-png') {
      bytes = await renderFloorPng(snapshot, { floor: exportFloor,
        onProgress: fraction => status(`Rendering ${snapshot.width} × ${snapshot.height} black floor PNG… ${Math.round(fraction * 100)}%`),
      });
    } else if (kind === 'floor-svg') {
      status('Preparing transparent floor SVG…');
      bytes = new TextEncoder().encode(renderFloorSvg(snapshot, { floor: exportFloor }));
    } else if (kind === 'png') {
      bytes = await renderMapPng(snapshot, { shipImage: shipImage || await loadShip(),
        onProgress: fraction => status(`Rendering ${snapshot.width} × ${snapshot.height} transparent PNG… ${Math.round(fraction * 100)}%`),
      });
    } else if (kind === 'svg') {
      status('Preparing transparent SVG…');
      bytes = new TextEncoder().encode(renderMapSvg(snapshot, { shipDataUrl: await embeddedShip() }));
    } else bytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    let success;
    if (window.revolaDesktop) success = await window.revolaDesktop.saveFile({ suggestedName: name, bytes: Array.from(bytes), kind: fileKind, layer: floorExport ? 'floor' : 'walls' });
    else {
      const url = URL.createObjectURL(new Blob([bytes], { type: fileKind === 'png' ? 'image/png' : fileKind === 'svg' ? 'image/svg+xml' : 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000); success = { downloaded: true };
    }
    if (success) {
      // Native saves are confirmed writes; browser downloads cannot confirm destination or completion.
      if (window.revolaDesktop && !floorExport && kind !== 'svg') savedState = JSON.stringify(snapshot);
      status(`${window.revolaDesktop ? 'Saved' : 'Downloaded'} ${name} · ${(bytes.length / 1024).toFixed(0)} KB${floorExport ? ' · black floor only; transparent background' : kind === 'png' ? ' · editable metadata included' : kind === 'svg' ? ' · SVG exported; save wall PNG or project to keep editing' : ''}`);
    } else status('Save canceled.');
  } catch (error) { status(`Could not save: ${error.message}`, true); }
  finally { busy = false; $('export-button').disabled = false; $('svg-button').disabled = false; $('project-button').disabled = false; canvas.classList.remove('loading'); refresh(); }
}
function deleteSelected() {
  if (busy || gesture || paste) return;
  const explicitPoints = new Set(selected.vertexIds), walls = new Set(selected.edgeIds);
  for (const edge of doc.edges) if (explicitPoints.has(edge.a) || explicitPoints.has(edge.b)) walls.add(edge.id);
  if (walls.size) commit(() => {
    doc.edges = doc.edges.filter(edge => !walls.has(edge.id));
    const used = new Set(doc.edges.flatMap(edge => [edge.a, edge.b]));
    doc.vertices = doc.vertices.filter(vertex => used.has(vertex.id));
    selected = emptySelection();
  }, 'Selected walls and points removed.');
}
for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => setTool(button.dataset.tool));
$('new-button').addEventListener('click', newDocument);
$('open-button').addEventListener('click', openDocument);
$('export-button').addEventListener('click', () => saveDocument('png'));
$('svg-button').addEventListener('click', () => saveDocument('svg'));
$('project-button').addEventListener('click', () => saveDocument('project'));
$('floor-png-button').addEventListener('click', () => saveDocument('floor-png'));
$('floor-svg-button').addEventListener('click', () => saveDocument('floor-svg'));
$('file-input').addEventListener('change', async () => {
  const file = $('file-input').files[0];
  if (!file) return;
  if (file.size > MAX_PNG_BYTES) { status('This file exceeds the 32 MiB import limit.', true); return; }
  await importBytes(file.name, new Uint8Array(await file.arrayBuffer()));
});
$('undo-button').addEventListener('click', undo); $('redo-button').addEventListener('click', redo);
$('delete-button').addEventListener('click', deleteSelected);
$('copy-button').addEventListener('click', copySelected);
$('paste-button').addEventListener('click', beginPaste);
$('mirror-button').addEventListener('click', () => commit(() => { doc.ship.mirrored = !doc.ship.mirrored; }, 'Ship mirrored. Airlock connection stays in place.'));
$('map-name').addEventListener('change', () => commit(() => { doc.name = $('map-name').value.trim() || 'Untitled map'; }, 'Map renamed.'));
$('grid-toggle').addEventListener('change', renderSoon);
function refreshRotation() {
  $('guide-rotate-room').textContent = $('rotate-room').checked ? '45° rotation on — turn off' : 'Draw a 45° room';
  $('guide-rotate-room').setAttribute('aria-pressed', String($('rotate-room').checked)); renderSoon();
}
$('rotate-room').addEventListener('change', refreshRotation);
$('eraser-size').addEventListener('change', renderSoon);
$('guide-rotate-room').addEventListener('click', () => {
  const rotated = $('rotate-room').checked; if (tool !== 'room') setTool('room');
  $('rotate-room').checked = !rotated; refreshRotation(); status($('rotate-room').checked ? 'Room rotation set to 45°. Drag on the canvas to place it.' : 'Room rotation set to 0°.');
});
$('fit-button').addEventListener('click', fit);
$('zoom-in').addEventListener('click', () => zoom(1.25)); $('zoom-out').addEventListener('click', () => zoom(.8));
$('zoom-value').addEventListener('click', () => zoom(1 / camera.scale));
window.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (event.key === 'Escape') {
    if (!$('confirm-dialog').open) {
      const active = gesture !== null || wallStart !== null || paste !== null;
      if (!active && tool === 'select' && !typing) selected = emptySelection();
      cancelGesture(); status(active ? 'Gesture canceled.' : 'Selection cleared.');
    }
    return;
  }
  if ($('confirm-dialog').open) return;
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); document.activeElement?.blur(); saveDocument(event.shiftKey ? 'project' : 'png'); }
    else if (key === 'o') { event.preventDefault(); openDocument(); }
    else if (!typing && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (!typing && key === 'y') { event.preventDefault(); redo(); }
    else if (!typing && key === 'c') { event.preventDefault(); if (!event.repeat) copySelected(); }
    else if (!typing && key === 'v') { event.preventDefault(); if (!event.repeat) beginPaste(); }
    return;
  }
  if (typing || busy) return;
  if (event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault(); if (tool !== 'room') setTool('room');
    $('rotate-room').checked = !$('rotate-room').checked; refreshRotation(); return;
  }
  if (event.code === 'Space') { event.preventDefault(); spaceHeld = true; canvas.style.cursor = 'grab'; }
  const tools = { v: 'select', w: 'wall', d: 'door', e: 'eraser', r: 'room', c: 'corridor', h: 'hand' };
  if (tools[event.key.toLowerCase()]) setTool(tools[event.key.toLowerCase()]);
  else if (event.key.toLowerCase() === 'f') fit();
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
});
window.addEventListener('keyup', event => { if (event.code === 'Space') { spaceHeld = false; canvas.style.cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'; } });
window.addEventListener('blur', () => { spaceHeld = false; gesture = null; refresh(); });
window.addEventListener('beforeunload', event => { if (!window.revolaDesktop && dirty()) { event.preventDefault(); event.returnValue = ''; } });
new ResizeObserver(renderSoon).observe(container);
try { shipImage = await loadShip(); status('Ready.'); }
catch (error) { status(error.message, true); }
window.addEventListener('online', () => {
  if (!starsPattern && floor?.closed) { starsRequested = false; loadStars(); }
});
fit(); refresh(); setTool('wall');
