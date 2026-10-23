import { OBJECT_CATEGORIES, OBJECT_TYPES, NPC_FIELDS, NPC_WEAPONS, MAX_PATROL_POINTS, validateObjects } from './object-schema.js';
import { filterGameplayObjects, gameplayPointIsPlayable, objectDoorSnap, objectPosition } from './objects.js';
import { chooseNpcVisual, drawObjectVisual } from './object-visuals.js';
import { NPC_DEFAULTS } from './npc-defaults.js';
import { doorPreviewTypes } from './door-preview.js';

const labels = { npc: 'NPC', doors: 'Door object', crates: 'Crate', barrels: 'Explosive barrel', weapons: 'Weapon spawn', devices: 'Device spawn' };
const colors = { npc: '#efb46e', doors: '#89c5ff', crates: '#d8bf8a', barrels: '#ee8a8a', weapons: '#badb8d', devices: '#b6a5f0' };
export function createObjectEditor(api) {
  const $ = id => document.getElementById(id);
  let category = null, selectedId = null, hoveredId = null, pending = null, drag = null, hoverPoint = null, route = null;
  const types = Object.fromEntries(OBJECT_CATEGORIES.map(key => [key, OBJECT_TYPES[key][0][0]]));
  let reportDoc, reportFloor, report;
  function analysis() {
    const doc = api.doc(), floor = api.floor();
    if (doc !== reportDoc || floor !== reportFloor || report?.key !== JSON.stringify(doc.objects)) {
      reportDoc = doc; reportFloor = floor; report = { ...filterGameplayObjects(doc, floor), key: JSON.stringify(doc.objects), doors: doorPreviewTypes(doc, floor) };
    }
    return report;
  }
  const objects = () => api.doc().objects ?? [];
  const selected = () => objects().find(object => object.id === selectedId);
  function hit(point) {
    return [...objects()].reverse().find(object => { const p = objectPosition(api.doc(), object); return Math.hypot(p.x - point.x, p.y - point.y) <= Math.max(65, 12 / api.scale()); });
  }
  function refresh() {
    if (!selected()) selectedId = null;
    const object = selected(), key = category ?? object?.category;
    $('object-option').hidden = !key;
    if (key) {
      $('object-type-label').textContent = key === 'crates' ? 'Contents' : 'Type';
      const select = $('object-type');
      const choice = category ? types[key] : object.type;
      const signature = key + ':' + choice;
      if (select.dataset.signature !== signature) {
        select.replaceChildren(...OBJECT_TYPES[key].map(([value, label]) => new Option(label, value)));
        if (!category && !OBJECT_TYPES[key].some(([value]) => value === choice)) {
          const legacy = new Option('Legacy weapon (saved placement)', choice); legacy.disabled = true; select.add(legacy);
        }
        select.value = choice; select.dataset.signature = signature;
      }
    }
    $('object-selection').hidden = !object;
    $('object-selection-name').textContent = object ? labels[object.category] : '';
    $('object-advanced').hidden = object?.category !== 'npc';
    for (const id of ['object-advanced', 'object-rotate', 'object-delete', 'object-type']) $(id).disabled = !!route;
    const result = analysis();
    $('object-summary').textContent = objects().length ? `${objects().length} objects · ${result.accepted.length} valid · ${result.rejected.length} excluded. Categories with valid objects replace automatic placement.` : 'Optional: categories without valid objects are generated automatically.';
    $('object-selection-note').textContent = result.rejected.find(entry => entry.object.id === selectedId)?.reason ?? 'Included in game generation. Drag to move; Delete removes it.';
  }
  function update() { refresh(); api.refresh(); }
  function leave() { hoverPoint = null; }
  function cancel() { pending = null; drag = null; route = null; leave(); $('npc-hover-setup').hidden = true; }
  const doorTarget = point => objectDoorSnap(api.doc(), point, Math.max(200, 14 / api.scale()), drag?.object.id);
  function tool(key) {
    cancel(); category = OBJECT_CATEGORIES.includes(key) ? key : null; selectedId = null;
    if (category && OBJECT_TYPES[category].length > 1) {
      $('object-picker-title').textContent = category === 'crates' ? 'Crate contents' : labels[category];
      $('object-picker-list').replaceChildren(...OBJECT_TYPES[category].map(([value, label]) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('click', () => { types[category] = value; $('object-picker').close(); update(); api.focus(); }); return button;
      }));
      $('object-picker').showModal();
    }
    refresh();
  }
  function remove() {
    if (!selectedId || route) return false;
    api.commit(() => { api.doc().objects = objects().filter(object => object.id !== selectedId); selectedId = null; }, 'Gameplay object removed.');
    refresh(); return true;
  }
  function openAdvanced(id) {
    const object = objects().find(value => value.id === id && value.category === 'npc'); if (!object) return;
    selectedId = object.id; $('npc-fields').replaceChildren();
    const weaponRow = document.createElement('label'); weaponRow.textContent = 'Weapon'; weaponRow.className = 'npc-wide-field';
    const weapon = document.createElement('select'); weapon.name = 'npcWeapon';
    weapon.add(new Option(`Generator default (random ${object.type} weapon)`, ''));
    for (const [value, label] of NPC_WEAPONS) weapon.add(new Option(label, value));
    weapon.value = object.npcWeapon ?? ''; weaponRow.append(weapon); $('npc-fields').append(weaponRow);
    for (const [key, label, kind, min, max] of NPC_FIELDS) {
      const row = document.createElement('label'); row.textContent = label;
      if (kind === 'state') row.className = 'npc-wide-field';
      const field = document.createElement(kind === 'number' ? 'input' : 'select'); field.name = key;
      const defaultValue = kind === 'state' ? 'Standing / Random wander / Patrol' : kind === 'bool' ? NPC_DEFAULTS[key] ? 'Yes' : 'No' : NPC_DEFAULTS[key];
      const defaultText = `Generator default (${defaultValue})`; field.title = defaultText;
      if (kind === 'number') { field.type = 'number'; field.min = min; field.max = max; field.step = 'any'; field.placeholder = defaultText; }
      else {
        field.add(new Option(defaultText, ''));
        for (const [value, text] of kind === 'bool' ? [['true', 'Yes'], ['false', 'No']] : [['0', 'Standing'], ['1', 'Random wander'], ['8', 'Patrol (automatic points)'], ['manual', 'Patrol points (manual)']]) field.add(new Option(text, value));
      }
      field.value = object.npc?.[key] === undefined ? '' : String(object.npc[key]); row.append(field); $('npc-fields').append(row);
      if (kind === 'state') {
        if (object.patrolPoints) field.value = 'manual';
        field.dataset.previous = field.value;
        field.addEventListener('change', () => {
          if (field.value === 'manual') openRouteCount();
          else field.dataset.previous = field.value;
          routeControls();
        });
      }
    }
    routeControls(); $('npc-dialog').showModal(); refresh();
  }
  const stateField = () => $('npc-form').elements.namedItem('currentGeneralState');
  function routeControls() {
    $('npc-route-controls').hidden = stateField()?.value !== 'manual';
    $('npc-route-summary').textContent = `${selected()?.patrolPoints?.length ?? 0} manual patrol points configured. Points are shown only while configuring the route.`;
  }
  function npcDraft(includeRoute = true) {
    const object = selected(); if (!object) throw new Error('Select an NPC first.');
    const npc = {};
    for (const [key, , kind] of NPC_FIELDS) {
      const value = $('npc-form').elements.namedItem(key).value;
      if (value !== '') npc[key] = value === 'manual' ? 8 : kind === 'bool' ? value === 'true' : Number(value);
    }
    const draft = { ...object, npc };
    delete draft.npcWeapon; delete draft.patrolPoints;
    const weapon = $('npc-form').elements.namedItem('npcWeapon').value;
    if (weapon) draft.npcWeapon = weapon;
    if (includeRoute && stateField().value === 'manual' && object.patrolPoints) draft.patrolPoints = object.patrolPoints;
    return validateObjects([draft])[0];
  }
  function saveNpc(draft, message) {
    api.commit(() => {
      const index = objects().findIndex(object => object.id === draft.id);
      if (index < 0) throw new Error('The NPC no longer exists.');
      objects()[index] = draft;
    }, message);
  }
  function openRouteCount() {
    $('npc-route-count').max = MAX_PATROL_POINTS;
    $('npc-route-count').value = selected()?.patrolPoints?.length ?? 2;
    $('npc-route-dialog').showModal();
  }
  function cancelRouteCount() {
    stateField().value = stateField().dataset.previous;
    routeControls();
  }
  $('npc-route-dialog').addEventListener('cancel', cancelRouteCount);
  $('npc-route-cancel').addEventListener('click', () => { cancelRouteCount(); $('npc-route-dialog').close(); });
  $('npc-route-reconfigure').addEventListener('click', openRouteCount);
  $('npc-route-form').addEventListener('submit', event => {
    event.preventDefault();
    const count = Number($('npc-route-count').value);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PATROL_POINTS) return;
    let draft;
    try { draft = npcDraft(false); } catch (error) { api.status(error.message, true); return; }
    draft.npc.currentGeneralState = 8;
    api.selectTool(); selectedId = draft.id; api.clearSelection();
    route = { draft, count, points: [] };
    $('npc-route-dialog').close(); $('npc-dialog').close();
    $('npc-hover-setup').hidden = true;
    api.status(`Place patrol point 1 of ${count}. Click playable floor; Escape keeps the previous route.`);
    update(); api.focus();
  });
  $('npc-form').addEventListener('submit', event => {
    event.preventDefault();
    if (stateField().value === 'manual' && !selected()?.patrolPoints) { openRouteCount(); return; }
    let draft;
    try { draft = npcDraft(); } catch (error) { api.status(error.message, true); return; }
    saveNpc(draft, 'NPC overrides saved. Unset fields inherit generator defaults.'); $('npc-dialog').close(); refresh();
  });
  $('npc-reset').addEventListener('click', () => { for (const field of $('npc-fields').querySelectorAll('input,select')) field.value = ''; stateField().dataset.previous = ''; routeControls(); });
  $('npc-cancel').addEventListener('click', () => $('npc-dialog').close());
  $('object-picker-close').addEventListener('click', () => $('object-picker').close());
  $('object-advanced').addEventListener('click', () => openAdvanced(selectedId));
  $('npc-hover-setup').addEventListener('click', () => openAdvanced(hoveredId));
  $('object-delete').addEventListener('click', remove);
  $('object-rotate').addEventListener('click', () => { if (selected()?.category === 'doors') return; pending = structuredClone(selected()); update(); api.focus(); });
  $('object-type').addEventListener('change', () => {
    const object = category ? null : selected(), value = $('object-type').value;
    if (object) types[object.category] = value;
    if (object) api.commit(() => { object.type = value; }, 'Gameplay object type changed.');
    else if (category) types[category] = value;
    pending = null; update();
  });
  function down(point, selectTool) {
    if (route) {
      if (!gameplayPointIsPlayable(api.doc(), api.floor(), point)) { api.status('Place patrol points on playable floor, outside walls.', true); return true; }
      route.points.push({ x: point.x, y: point.y });
      if (route.points.length === route.count) {
        const draft = validateObjects([{ ...route.draft, patrolPoints: route.points }])[0];
        route = null;
        saveNpc(draft, 'Manual patrol route saved. Route markers are hidden.'); update();
      } else { api.status(`Place patrol point ${route.points.length + 1} of ${route.count}. Escape keeps the previous route.`); api.render(); }
      return true;
    }
    if (pending) {
      pending.rotation = Math.atan2(point.y - pending.y, point.x - pending.x) * 180 / Math.PI;
      const value = structuredClone(pending); pending = null;
      api.commit(() => {
        const list = api.doc().objects ??= [], index = list.findIndex(object => object.id === value.id);
        if (list.length >= 4096 && index < 0) throw new Error('The maximum is 4096 gameplay objects.');
        if (index < 0) list.push(value); else list[index] = value;
        selectedId = value.id;
      }, 'Gameplay object placed.'); update(); return true;
    }
    if (selectTool) {
      const object = hit(point); selectedId = object?.id ?? null; refresh();
      if (object) { api.clearSelection(); drag = { object: structuredClone(object), start: point, point }; update(); return true; }
      return false;
    }
    if (!category) return false;
    const value = { id: 'obj_' + crypto.randomUUID().replaceAll('-', ''), category, type: types[category], x: point.x, y: point.y, rotation: 0 };
    if (category === 'npc') value.visualVariant = chooseNpcVisual();
    if (category === 'doors') {
      const target = doorTarget(point);
      if (!target) { api.status('Aim at an existing door opening. Door objects snap to openings.', true); return true; }
      if (target.occupied) { api.status('This opening already has a door object.', true); return true; }
      Object.assign(value, target.point, { doorId: target.id, rotation: Math.atan2(target.direction.y, target.direction.x) * 180 / Math.PI });
      api.commit(() => { (api.doc().objects ??= []).push(value); selectedId = value.id; }, 'Door object snapped to opening.'); update();
    } else { selectedId = null; pending = value; api.status('Position set. Aim the facing direction and click again. Escape cancels.'); update(); }
    return true;
  }
  function move(point, at) {
    hoverPoint = point;
    if (pending) pending.rotation = Math.atan2(point.y - pending.y, point.x - pending.x) * 180 / Math.PI;
    if (drag) drag.point = point;
    const object = !pending && !drag && !route ? hit(point) : null;
    hoveredId = object?.category === 'npc' ? object.id : null;
    $('npc-hover-setup').hidden = !hoveredId;
    if (hoveredId) { $('npc-hover-setup').style.left = `${Math.max(0, at.x - 48)}px`; $('npc-hover-setup').style.top = `${Math.max(0, at.y - 42)}px`; }
    api.render();
  }
  function up() {
    if (!drag) return;
    const current = drag; drag = null;
    if (Math.hypot(current.point.x - current.start.x, current.point.y - current.start.y) * api.scale() < 3) { update(); return; }
    api.commit(() => {
      const object = selected(); if (!object) return;
      if (object.category === 'doors') {
        const target = objectDoorSnap(api.doc(), current.point, Math.max(200, 14 / api.scale()), object.id);
        if (!target || target.occupied) throw new Error('Move the door onto an unoccupied opening.');
        Object.assign(object, target.point, { doorId: target.id });
      } else { object.x = current.object.x + current.point.x - current.start.x; object.y = current.object.y + current.point.y - current.start.y; }
    }, 'Gameplay object moved.'); update();
  }
  function draw(ctx) {
    const excluded = new Set(analysis().rejected.map(entry => entry.object.id));
    const list = objects().filter(object => object.id !== pending?.id).map(object => objectPosition(api.doc(), object));
    if (pending) list.push(pending);
    const snapping = (category === 'doors' || drag?.object.category === 'doors') && hoverPoint ? doorTarget(hoverPoint) : null;
    const snapType = drag?.object.type ?? types.doors;
    for (let object of list) {
      if (drag?.object.id === object.id && object.category === 'doors' && snapping && !snapping.occupied) continue;
      if (drag?.object.id === object.id && object.category !== 'doors') object = { ...object, x: object.x + drag.point.x - drag.start.x, y: object.y + drag.point.y - drag.start.y };
      const color = excluded.has(object.id) ? '#ff7777' : colors[object.category];
      ctx.save(); ctx.translate(object.x, object.y); ctx.rotate(object.rotation * Math.PI / 180);
      const radius = drawObjectVisual(ctx, object.category === 'doors' ? { ...object, previewDoorType: analysis().doors.get(object.doorId) } : object, 24 / api.scale());
      ctx.strokeStyle = object.id === selectedId ? '#fff' : color; ctx.lineWidth = 1.5 / api.scale();
      if (object.id === selectedId || excluded.has(object.id) || object.id === pending?.id) {
        ctx.beginPath(); ctx.arc(0, 0, radius + 3 / api.scale(), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(radius + 11 / api.scale(), 0); ctx.lineTo(radius + 3 / api.scale(), -3 / api.scale()); ctx.lineTo(radius + 3 / api.scale(), 3 / api.scale()); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      ctx.restore();
    }
    if (snapping) {
      const doc = api.doc(), color = snapping.occupied ? '#ff7777' : '#b5e8c6';
      const angle = Math.atan2(snapping.direction.y, snapping.direction.x);
      ctx.save(); ctx.translate(snapping.point.x, snapping.point.y); ctx.rotate(angle);
      ctx.fillStyle = color + '33'; ctx.fillRect(-doc.style.doorWidth / 2, -doc.style.wallWidth, doc.style.doorWidth, doc.style.wallWidth * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 1 / api.scale();
      ctx.strokeRect(-doc.style.doorWidth / 2, -doc.style.wallWidth, doc.style.doorWidth, doc.style.wallWidth * 2);
      if (!snapping.occupied) { ctx.globalAlpha = .65; drawObjectVisual(ctx, { category: 'doors', type: snapType, previewDoorType: analysis().doors.get(snapping.id) }, 24 / api.scale()); ctx.globalAlpha = 1; }
      ctx.restore();
      const extentY = Math.abs(Math.sin(angle)) * doc.style.doorWidth / 2 + Math.abs(Math.cos(angle)) * doc.style.wallWidth;
      ctx.save(); ctx.translate(snapping.point.x, snapping.point.y - extentY); ctx.scale(1 / api.scale(), 1 / api.scale());
      ctx.fillStyle = '#13271be6'; ctx.fillRect(-46, -23, 92, 17);
      ctx.fillStyle = color; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(snapping.occupied ? 'OCCUPIED' : 'DOOR SNAP', 0, -14); ctx.restore();
    }
    if (route) {
      const points = route.points.map((point, index) => ({ ...point, number: index + 1 }));
      for (const point of points) {
        ctx.save(); ctx.translate(point.x, point.y); ctx.scale(1 / api.scale(), 1 / api.scale());
        ctx.fillStyle = '#63e6e2'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#102324'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(point.number), 0, 0);
        ctx.restore();
      }
    }
  }
  return { tool, down, move, up, draw, refresh, remove, cancel, leave, clear() { selectedId = null; cancel(); }, get active() { return !!pending || !!drag || !!route; }, get hasSelection() { return !!selected(); } };
}
