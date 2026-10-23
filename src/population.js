import { validateDocument } from './model.js';
import { generateFloor, floorRegionContainsPoint, floorContainsPoint } from './floors.js';
import { filterGameplayObjects, objectDoorTargets } from './objects.js';
import { shipWorldPoint } from './ship.js';
import { SHIP_VECTOR_OUTLINES } from './ship-vector.js';
import { PLACEMENT_DEFAULTS } from './placement-defaults.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const categories = ['npc', 'doors', 'weapons', 'devices', 'crates', 'barrels'];
const geometryInput = doc => [doc.width, doc.height, doc.originX, doc.originY, doc.ship, doc.seed, doc.style, doc.vertices, doc.edges];
export async function objectGenerationGeometry(doc) {
  // A new population policy also makes an earlier generated result replaceable
  // through the ordinary confirmation/undo flow, including unchanged geometry.
  const bytes = new TextEncoder().encode(JSON.stringify([2, geometryInput(doc)]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
function randomFor(doc) {
  let value = 2166136261;
  for (const byte of new TextEncoder().encode(JSON.stringify(geometryInput(doc)))) value = Math.imul(value ^ byte, 16777619) >>> 0;
  if (!value) value = 0x6d2b79f5;
  const next = () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return value >>> 0; };
  return { next, int: max => { const threshold = (0x100000000 - max) % max; let n; do { n = next(); } while (n < threshold); return n % max; }, float: () => (next() >>> 8) / 16777216 };
}
function shuffle(list, random) { for (let i = list.length - 1; i > 0; i--) { const j = random.int(i + 1); [list[i], list[j]] = [list[j], list[i]]; } return list; }
function pointSegmentSquared(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function crosses(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = side(a, b, c), abD = side(a, b, d), cdA = side(c, d, a), cdB = side(c, d, b);
  return abC * abD <= 0 && cdA * cdB <= 0 && Math.max(a.x, b.x) >= Math.min(c.x, d.x)
    && Math.max(c.x, d.x) >= Math.min(a.x, b.x) && Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y);
}
/** Bounded vector queries; no DOM, image readback, game process or network. */
export function placementGeometry(doc, floor) {
  const walls = [...floor.wallPolygons ?? [], ...SHIP_VECTOR_OUTLINES.map(ring => ring.map(p => shipWorldPoint(doc.ship, p)))];
  const segments = [...floor.polygons, ...walls].flatMap(ring => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length] })));
  const bucketSize = 300, buckets = new Map();
  for (const segment of segments) {
    for (let x = Math.floor(Math.min(segment.a.x, segment.b.x) / bucketSize); x <= Math.floor(Math.max(segment.a.x, segment.b.x) / bucketSize); x++)
    for (let y = Math.floor(Math.min(segment.a.y, segment.b.y) / bucketSize); y <= Math.floor(Math.max(segment.a.y, segment.b.y) / bucketSize); y++) {
      const key = `${x},${y}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(segment);
    }
  }
  const wallBounds = walls.map(ring => ({ ring, left: Math.min(...ring.map(p => p.x)), right: Math.max(...ring.map(p => p.x)), top: Math.min(...ring.map(p => p.y)), bottom: Math.max(...ring.map(p => p.y)) }));
  function nearby(p, radius) {
    const result = new Set();
    for (let x = Math.floor((p.x - radius) / bucketSize); x <= Math.floor((p.x + radius) / bucketSize); x++)
    for (let y = Math.floor((p.y - radius) / bucketSize); y <= Math.floor((p.y + radius) / bucketSize); y++)
      for (const segment of buckets.get(`${x},${y}`) ?? []) result.add(segment);
    return result;
  }
  const contains = p => floorRegionContainsPoint(floor.polygons, p) && !wallBounds.some(w => p.x >= w.left && p.x <= w.right && p.y >= w.top && p.y <= w.bottom && floorContainsPoint(w.ring, p));
  function fits(p, radius) { return contains(p) && [...nearby(p, radius)].every(s => pointSegmentSquared(p, s.a, s.b) >= radius * radius); }
  function line(a, b, radius = 0) {
    const checked = new Set(), count = Math.max(1, Math.ceil(distance(a, b) / (bucketSize / 2)));
    for (let i = 0; i <= count; i++) {
      const p = { x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count };
      for (const s of nearby(p, radius)) {
        if (checked.has(s)) continue; checked.add(s);
        if (crosses(a, b, s.a, s.b) || radius > 0 && Math.min(pointSegmentSquared(a, s.a, s.b), pointSegmentSquared(b, s.a, s.b), pointSegmentSquared(s.a, a, b), pointSegmentSquared(s.b, a, b)) < radius * radius) return false;
      }
    }
    return true;
  }
  return { contains, fits, line };
}
export function defaultPopulationCount(area, category, defaults = PLACEMENT_DEFAULTS, roundingRoll = .5) {
  const rule = defaults.density[category];
  if (category === 'npc' && (rule.maximum <= 0 || defaults.npcCountMultiplier <= 0 || area <= 0)) return 0;
  const totalMultiplier = category === 'npc' && rule.perWorldSquareUnit > 0 && rule.minimum !== rule.maximum ? defaults.populationPolicy.npcTotalMultiplier : 1;
  const count = clamp(area * rule.perWorldSquareUnit, rule.minimum, rule.maximum) * (category === 'npc' ? defaults.npcCountMultiplier * totalMultiplier : 1);
  const base = Math.max(0, Math.floor(count + .5));
  if (!['crates', 'barrels'].includes(category) || rule.maximum <= 0 || rule.minimum === rule.maximum) return base;
  // Stochastic rounding preserves the 20% increase even for a two-barrel cap.
  const increased = base * defaults.populationPolicy.propCountMultiplier, whole = Math.floor(increased);
  return whole + (roundingRoll < increased - whole ? 1 : 0);
}
export function defaultRoomNpcCount(area, defaults = PLACEMENT_DEFAULTS, emptyRoll = 1) {
  const rule = defaults.density.npc, multiplier = defaults.npcCountMultiplier;
  if (rule.maximum <= 0 || multiplier <= 0 || area <= 0) return 0;
  if (rule.perWorldSquareUnit <= 0 || rule.minimum === rule.maximum) return defaultPopulationCount(area, 'npc', defaults);
  const policy = defaults.populationPolicy;
  const count = Math.min(rule.maximum, clamp(Math.floor(policy.npcRoomScale * Math.max(0, area * rule.perWorldSquareUnit) + .5), policy.minimumRoomNpcs, policy.maximumRoomNpcs));
  return count < policy.maximumRoomNpcs && emptyRoll < policy.emptySmallRoomChance ? 0 : count;
}
/** Author editable objects only. Absent categories still use Map Manager's normal generation. */
export async function generateDefaultObjects(input, { floor = generateFloor(input), defaults = PLACEMENT_DEFAULTS, onProgress = () => {},
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)), signal } = {}) {
  const doc = validateDocument(input);
  if (!floor?.closed) throw new Error('Close the map before generating gameplay objects.');
  const accepted = filterGameplayObjects(doc, floor).accepted;
  const skipped = new Set(accepted.map(o => o.category)), generated = [], counts = {}, targets = {}, rooms = [];
  const result = () => ({ objects: generated, counts, targets, skipped: [...skipped], area, rooms });
  let area = 0;
  if (categories.every(c => skipped.has(c))) return result();
  const random = randomFor(doc), query = placementGeometry(doc, floor), unit = defaults.unitsPerPixel;
  const roomNpcPopulation = defaults.density.npc.perWorldSquareUnit > 0 && defaults.density.npc.minimum !== defaults.density.npc.maximum;
  const radius = item => item.radius / unit;
  const pool = group => defaults.prefabs.filter(item => item.group === group);
  const npcRadius = radius(pool('npc')[0]), characterRadius = defaults.characterRadius / unit;
  const d = doc.style.doorWidth, margin = defaults.safety;
  // Cover both the closed leaf and its possible hinge/slide travel. The game
  // still certifies the exact mechanism and sweep before instantiation.
  const doorRadius = Math.max(d, ...pool('doors').map(prefab => radius(prefab) * 2)) + d * margin.doorSweepMarginInOpeningWidths;
  const attachment = { x: doc.ship.x + (doc.ship.mirrored ? 29 : 0), y: doc.ship.y };
  const spawn = { x: attachment.x, y: attachment.y + 1060 }, entry = { ...attachment };
  // Same preferred current-ship anchors as MapShipAnchorSearch; a map that
  // requires its fallback calibration remains available to the full generator.
  if (!query.fits(spawn, characterRadius + 10) || !query.fits(entry, characterRadius + 10)) throw new Error('The ship spawn or entrance is obstructed. Clear it before generating objects.');
  const reserved = [spawn, entry, { x: spawn.x + (doc.ship.mirrored ? -4 : 4), y: spawn.y - 222 },
    { x: attachment.x + (doc.ship.mirrored ? -820 : 820), y: spawn.y }].map(p => ({ ...p, radius: characterRadius }));
  const doorZones = [];
  for (const object of accepted) {
    if (object.category === 'doors') { doorZones.push({ ...object, radius: doorRadius }); continue; }
    const prefab = pool(object.category).find(p => p.key === object.type) || pool(object.category)[0];
    reserved.push({ ...object, radius: prefab ? radius(prefab) : npcRadius });
    for (const point of object.patrolPoints ?? []) reserved.push({ ...point, radius: npcRadius });
  }
  const manualReservations = reserved.slice(4);
  const ids = new Set((doc.objects ?? []).map(o => o.id));
  function add(category, point, type, extra = {}) {
    if ((doc.objects?.length ?? 0) + generated.length >= 4096) throw new Error('Generated objects would exceed the 4096-object project limit.');
    let id = `generated-${category}-${generated.length + 1}`; while (ids.has(id)) id += '_';
    if (id.length > 64) throw new Error('Cannot allocate a generated object ID.'); ids.add(id);
    const object = { id, category, type, x: point.x, y: point.y, rotation: 0, ...extra }; generated.push(object); counts[category] = (counts[category] ?? 0) + 1; return object;
  }
  function clear(p, r, entryDistance) {
    return query.fits(p, r + 10) && distance(p, spawn) >= entryDistance && distance(p, entry) >= entryDistance
      && reserved.every(other => distance(p, other) > r + other.radius + 50) && doorZones.every(door => distance(p, door) > r + door.radius);
  }
  async function tick(stage, progress) {
    if (signal?.aborted) throw new Error('Object generation cancelled.');
    onProgress(stage, progress); await yieldControl();
  }
  await tick('Measuring reachable floor', .02);
  if (!skipped.has('doors')) for (const target of objectDoorTargets(doc)) {
    if (manualReservations.some(other => distance(other, target.point) <= other.radius + doorRadius)) continue;
    const object = { id: `candidate-${generated.length}`, category: 'doors', type: 'auto', ...target.point, rotation: 0, doorId: target.id };
    if (filterGameplayObjects({ ...doc, objects: [...accepted, ...generated, object] }, floor).accepted.some(o => o.id === object.id)) {
      add('doors', target.point, 'auto', { doorId: target.id }); doorZones.push({ ...target.point, radius: doorRadius });
    }
  }
  const points = floor.polygons.flat(), left = Math.min(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y));
  const right = Math.max(...points.map(p => p.x)), bottom = Math.max(...points.map(p => p.y));
  let step = 100;
  while (Math.ceil((right - left) / step) * Math.ceil((bottom - top) / step) > 100000) step *= 2;
  const width = Math.ceil((right - left) / step), height = Math.ceil((bottom - top) / step);
  const grid = new Uint8Array(width * height), at = index => ({ x: left + (index % width + .5) * step, y: top + (Math.floor(index / width) + .5) * step });
  let nearest = -1, nearestDistance = Infinity;
  for (let index = 0; index < grid.length; index++) {
    const point = at(index);
    if (query.fits(point, defaults.navMeshRadius / unit)) {
      grid[index] = 1; const length = distance(point, spawn);
      if (length < nearestDistance) { nearest = index; nearestDistance = length; }
    }
    if (index % 256 === 0) await tick('Measuring reachable floor', .04 + index / grid.length * .28);
  }
  if (nearest < 0) throw new Error('No walkable floor fits this map.');
  const reachable = [nearest]; grid[nearest] = 2;
  for (let read = 0; read < reachable.length; read++) {
    const index = reachable[read], point = at(index), x = index % width, y = Math.floor(index / width);
    for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
      if (next < 0 || grid[next] !== 1 || !query.line(point, at(next))) continue;
      grid[next] = 2; reachable.push(next);
    }
    if (read % 256 === 0) await tick('Checking room connections', .33);
  }
  area = reachable.length * (step * unit) ** 2;
  for (const category of categories.filter(c => c !== 'doors' && !skipped.has(c))) targets[category] = defaultPopulationCount(area, category, defaults, random.float());
  const cell = p => Math.floor((p.y - top) / step) * width + Math.floor((p.x - left) / step);
  // Cap every authored architectural doorway, regardless of its gameplay-door
  // choice. This separates rooms without changing actual floor reachability.
  const roomSeals = objectDoorTargets(doc).map(target => {
    const length = Math.hypot(target.direction.x, target.direction.y), half = d / 2 + doc.style.wallWidth;
    const dx = target.direction.x / length * half, dy = target.direction.y / length * half;
    return { a: { x: target.point.x - dx, y: target.point.y - dy }, b: { x: target.point.x + dx, y: target.point.y + dy } };
  });
  const roomByCell = new Int32Array(grid.length).fill(-1);
  if (!skipped.has('npc') && !roomNpcPopulation) {
    rooms.push({ area, target: targets.npc, count: 0 });
    for (const index of reachable) roomByCell[index] = 0;
  }
  if (!skipped.has('npc') && roomNpcPopulation) for (const first of reachable) {
    if (roomByCell[first] !== -1) continue;
    const id = rooms.length, queue = [first]; roomByCell[first] = id;
    for (let read = 0; read < queue.length; read++) {
      const index = queue[read], p = at(index), x = index % width, y = Math.floor(index / width);
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next < 0 || grid[next] !== 2 || roomByCell[next] !== -1) continue;
        const q = at(next);
        if (!query.line(p, q) || roomSeals.some(seal => crosses(p, q, seal.a, seal.b))) continue;
        roomByCell[next] = id; queue.push(next);
      }
      if (read % 256 === 0) await tick('Measuring room populations', .34);
    }
    rooms.push({ area: queue.length * (step * unit) ** 2, target: 0, count: 0 });
  }
  // Seal only the finite airlock, then identify the spawn-side component.
  // Station rooms behind the ship's plane are still valid patrol destinations.
  const airlock = shipWorldPoint(doc.ship, { x: 14.5, y: -40 });
  const sealed = p => Math.abs(p.y - airlock.y) <= npcRadius + doc.style.wallWidth / 2 + step && Math.abs(p.x - airlock.x) <= d / 2 + npcRadius + step;
  const shipSide = new Set([nearest]), shipQueue = [nearest];
  for (let read = 0; read < shipQueue.length; read++) {
    const index = shipQueue[read], p = at(index), x = index % width, y = Math.floor(index / width);
    for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
      if (next < 0 || grid[next] !== 2 || shipSide.has(next) || sealed(at(next)) || !query.line(p, at(next))) continue;
      shipSide.add(next); shipQueue.push(next);
    }
    if (read % 256 === 0) await tick('Checking patrol boundaries', .35);
  }
  const patrolAllowed = p => !sealed(p) && !shipSide.has(cell(p));
  const sight = [spawn, entry, { x: entry.x - d * .35, y: entry.y }, { x: entry.x + d * .35, y: entry.y }];
  const protectedCells = [];
  const safeCells = new Map();
  const unseen = p => sight.every(target => !query.line(target, p));
  function safeCell(index) {
    if (!safeCells.has(index)) { const p = at(index); safeCells.set(index, grid[index] === 2 && query.fits(p, npcRadius + step * .71) && unseen(p) && doorZones.every(door => distance(p, door) > npcRadius + step + door.radius)); }
    return safeCells.get(index);
  }
  const candidates = [];
  let npcStep = 50;
  while (Math.ceil((right - left) / npcStep) * Math.ceil((bottom - top) / npcStep) > 25000) npcStep *= 2;
  let scanned = 0;
  if (!skipped.has('npc')) for (let x = left + npcStep / 2; x < right; x += npcStep) for (let y = top + npcStep / 2; y < bottom; y += npcStep) {
    const p = { x, y };
    if (clear(p, npcRadius + step * .71 + npcStep * .71, margin.npcEntryDistanceInOpeningWidths * d) && safeCell(cell(p)) && unseen(p)) candidates.push(p);
    if (++scanned % 128 === 0) await tick('Finding safe enemy positions', .36 + Math.min(1, scanned / 25000) * .3);
  }
  const roomCandidates = rooms.map(() => []);
  for (const p of shuffle(candidates, random)) roomCandidates[roomByCell[cell(p)]]?.push(p);
  if (roomNpcPopulation) {
    for (let i = 0; i < rooms.length; i++) if (roomCandidates[i].length) rooms[i].target = defaultRoomNpcCount(rooms[i].area, defaults, random.float());
    // No eligible room is a capacity shortfall, distinct from eligible rooms
    // deliberately rolling empty. Keep the legacy target visible in that case.
    if (!skipped.has('npc') && roomCandidates.some(points => points.length) && rooms.every(room => room.target === 0)) targets.npc = 0;
  }
  // Give each room one turn per pass so large rooms cannot consume the global
  // budget before the smaller rooms get their own candidates.
  const npcCandidates = [], roomOrder = shuffle(rooms.map((_, i) => i), random);
  for (let pass = 0; roomOrder.some(i => roomCandidates[i].length > pass); pass++)
    for (const i of roomOrder) if (roomCandidates[i][pass]) npcCandidates.push({ p: roomCandidates[i][pass], room: rooms[i] });
  // First spread the population across rooms, then recover any unfilled area
  // budget in occupied rooms. Six is a preferred room limit: safety or an empty
  // room roll must not silently reduce a whole large map to one or two NPCs.
  for (const overflow of roomNpcPopulation ? [false, true] : [false]) for (const { p, room } of npcCandidates) {
    if ((counts.npc ?? 0) >= targets.npc) break;
    if (room.target === 0 || !overflow && room.count >= room.target) continue;
    if (!clear(p, npcRadius + step * .71 + npcStep * .71, margin.npcEntryDistanceInOpeningWidths * d)) continue;
    let state = (counts.npc ?? 0) % 3 === 0 ? 0 : (counts.npc ?? 0) % 3 === 1 ? 1 : 8;
    let route;
    if (state === 8 && patrolAllowed(p)) {
      const destination = reachable.map(at).filter(q => patrolAllowed(q) && distance(p, q) >= d * 4 && safeCell(cell(q))
        && clear(q, npcRadius, 0)).sort((a, b) => distance(p, b) - distance(p, a))[0];
      if (destination) { route = [{ ...p }, destination]; reserved.push({ ...destination, radius: npcRadius }); protectedCells.push(at(cell(destination))); }
      else state = 0;
    }
    else if (state === 8) state = 0;
    const npc = { currentGeneralState: state };
    for (const key of ['IgnoreIncomingSound', 'stayFarAndFire', 'stayFarEvenWhenPlayerUnreachable']) if (random.float() < defaults.populationPolicy.npcVariationChance) npc[key] = true;
    const item = add('npc', p, 'ranged', { rotation: random.float() * 360, npc, visualVariant: random.int(2) ? 'male' : 'female' });
    room.count++;
    if (route) item.patrolPoints = route;
    reserved.push({ ...p, radius: npcRadius + d * margin.npcSpacingInOpeningWidths * .5 }); protectedCells.push(at(cell(p)));
  }
  const npcs = generated.filter(o => o.category === 'npc'), proportions = defaults.loadoutPercentages;
  const totals = proportions.map(percent => Math.floor(npcs.length * percent / 100));
  const order = proportions.map((_, i) => i).sort((a, b) => npcs.length * proportions[b] % 100 - npcs.length * proportions[a] % 100 || b - a);
  for (const i of order.slice(0, npcs.length - totals.reduce((a, b) => a + b, 0))) totals[i]++;
  const loadouts = shuffle(totals.flatMap((count, i) => Array(count).fill(i)), random);
  let ranged = 0, melee = 0;
  for (let i = 0; i < npcs.length; i++) {
    npcs[i].npcWeapon = loadouts[i] === 0 ? defaults.rangedWeapons[ranged++ % defaults.rangedWeapons.length] : loadouts[i] === 1 ? defaults.meleeWeapons[melee++ % defaults.meleeWeapons.length] : defaults.unarmedWeapon;
    npcs[i].type = loadouts[i] === 0 ? 'ranged' : 'melee';
  }
  await tick('Placing pickups and props', .72);
  const drops = pool('drops'), propAnchors = [];
  for (const group of ['weapons', 'devices', 'crates', 'barrels']) {
    if (skipped.has(group)) continue;
    const prefabs = pool(group); if (!prefabs.length) continue;
    let attempts = 0;
    const clustered = ['crates', 'barrels'].includes(group), clusterCandidates = [];
    function queueCluster(anchor, anchorRadius, members) {
      const angle = random.float() * Math.PI * 2;
      for (let member = 0; member < members; member++) {
        const neighbor = prefabs[random.int(prefabs.length)], separation = anchorRadius + radius(neighbor) + 50 + 1, state = { placed: false };
        for (let turn = 0; turn < 8; turn++) {
          const direction = angle + (turn + member * 3) * Math.PI / 4;
          clusterCandidates.push({ point: { x: anchor.x + Math.cos(direction) * separation, y: anchor.y + Math.sin(direction) * separation }, prefab: neighbor, member: state });
        }
      }
    }
    const placementCandidates = shuffle([...reachable], random).map(at);
    // Barrels may join an existing crate pile. These candidates pass the same
    // full checks below before any scattered position is accepted.
    if (group === 'barrels' && propAnchors.length && random.float() < defaults.populationPolicy.propClusterChance)
      for (const anchor of propAnchors.slice(0, 3)) queueCluster(anchor.point, anchor.radius, 1);
    for (let read = 0; read < placementCandidates.length || clusterCandidates.length; read++) {
      if ((counts[group] ?? 0) >= targets[group]) break;
      const fromCluster = clusterCandidates.length > 0, candidate = fromCluster ? clusterCandidates.shift() : placementCandidates[read];
      if (fromCluster) read--;
      if (candidate.member?.placed) continue;
      const p = candidate.point ?? candidate, prefab = candidate.prefab ?? prefabs[random.int(prefabs.length)], r = radius(prefab);
      if (clear(p, r, d * (group === 'barrels' ? margin.barrelEntryDistanceInOpeningWidths : margin.propEntryDistanceInOpeningWidths))
        && (!prefab.blocksNavigation || query.fits(p, r + characterRadius * 2) && protectedCells.every(cell => distance(p, cell) > r + npcRadius + step))) {
        const type = group === 'crates' ? random.float() < defaults.emptyCrateChance ? '' : drops[random.int(drops.length)].key : prefab.key;
        add(group, p, type, { rotation: random.float() * 360 }); reserved.push({ ...p, radius: r });
        if (clustered) propAnchors.push({ point: p, radius: r });
        if (candidate.member) candidate.member.placed = true;
        if (clustered && !fromCluster && random.float() < defaults.populationPolicy.propClusterChance) {
          // Keep the same complete footprint and safety checks for neighbors.
          // Try several directions for each of two members, then resume the
          // distributed candidates if walls, doors or movement prevent a pile.
          queueCluster(p, r, 2);
        }
      }
      if (++attempts % 128 === 0) await tick('Placing pickups and props', .75 + ['weapons', 'devices', 'crates', 'barrels'].indexOf(group) * .05);
    }
  }
  // Use the same center-only authoring validator the editor displays. Existing
  // invalid objects are retained, but may not invalidate newly generated ones.
  const validation = filterGameplayObjects({ ...doc, objects: [...doc.objects ?? [], ...generated] }, floor);
  const validIds = new Set(validation.accepted.map(o => o.id));
  if (generated.some(o => !validIds.has(o.id))) throw new Error('A generated object failed placement validation. No objects were changed.');
  await tick('Objects ready', 1);
  return result();
}
