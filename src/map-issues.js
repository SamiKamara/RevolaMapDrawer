import { objectPosition, objectDoorTargets } from './objects.js';

const defaults = { title: 'Map generation failed', ok: 'OK', marked: 'The problem is marked with a white glow on the map.', limitTitle: 'Object limit reached', details: 'Technical details' };
/** Transient editor presentation. Issues never enter the map, exports or history. */
export function createMapIssues({ doc, render, focus = () => {} }) {
  let labels = defaults, targets = [], seen = new Set();
  const popup = document.createElement('dialog'); popup.id = 'map-error-dialog';
  const heading = document.createElement('h2'), message = document.createElement('p'), ok = document.createElement('button');
  const details = document.createElement('details'), summary = document.createElement('summary'), technical = document.createElement('pre');
  details.append(summary, technical); popup.append(heading, message, details, ok); document.body.append(popup);
  ok.type = 'button'; ok.addEventListener('click', () => popup.close());
  popup.addEventListener('cancel', () => popup.close());
  const queue = [];
  function pump() {
    if (!queue.length || document.querySelector('dialog[open]')) return;
    const issue = queue.shift(); targets = positions(issue); if (targets.length) focus(targets); render();
    heading.textContent = issue.code === 'object_limit' ? labels.limitTitle : labels.title;
    const template = (issue.code === 'object_limit' ? labels.limits?.[issue.category] : null) || issue.message;
    message.textContent = template.replace(/\{([01])\}/g, (_match, index) => String([issue.limit, issue.count][Number(index)] ?? ''));
    if (targets.length) message.textContent += '\n\n' + labels.marked;
    details.hidden = !issue.detail; summary.textContent = labels.details; technical.textContent = issue.detail || '';
    ok.textContent = labels.ok; popup.showModal(); ok.focus();
  }
  document.addEventListener('close', () => queueMicrotask(pump), true);
  function positions(issue) {
    const project = doc(), result = [], doors = objectDoorTargets(project);
    for (const target of (issue.targets ?? []).slice(0, 256)) {
      const object = project.objects?.find(value => value.id === target.objectId);
      const door = doors.find(value => value.id === target.doorId);
      const edge = project.edges?.find(value => value.id === target.edgeId);
      if (object) result.push({ ...objectPosition(project, object), radius: 100 });
      if (door) result.push({ ...door.point, radius: 130 });
      if (edge) for (const id of [edge.a, edge.b]) {
        const point = project.vertices.find(value => value.id === id); if (point) result.push({ ...point, radius: 90 });
      }
      if (target.hasPoint !== false && Number.isFinite(target.x) && Number.isFinite(target.y)) result.push({ x: target.x, y: target.y, radius: Math.max(50, Math.min(500, target.radius || 100)) });
    }
    const left = project.originX ?? 0, top = project.originY ?? 0;
    return result.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x + point.radius >= left && point.x - point.radius <= left + project.width &&
      point.y + point.radius >= top && point.y - point.radius <= top + project.height);
  }
  return {
    labels(value) { labels = { ...defaults, ...value }; },
    clear() { targets = []; seen.clear(); queue.length = 0; if (popup.open) popup.close(); render(); },
    show(error) {
      const issue = error?.issue || error;
      if (!issue || typeof issue.message !== 'string') return;
      if (issue.id && seen.has(issue.id)) return;
      if (issue.id) { seen.add(issue.id); if (seen.size > 64) seen.delete(seen.values().next().value); }
      queue.push(issue); pump();
    },
    draw(ctx, camera) {
      ctx.save(); ctx.shadowColor = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 / camera.scale;
      ctx.shadowBlur = 16; ctx.setLineDash([9 / camera.scale, 5 / camera.scale]);
      for (const point of targets) {
        const radius = Math.max(point.radius, 16 / camera.scale);
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    },
  };
}
