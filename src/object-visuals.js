import { OBJECT_VECTORS } from './object-vectors.js';

export const chooseNpcVisual = (random = Math.random) => random() < 0.5 ? 'female' : 'male';
export function objectVisualKey(object) {
  if (object.category === 'npc') return `npc-${object.visualVariant ?? 'male'}`;
  if (object.category === 'doors') return object.type === 'hinged' ? 'door-hinged' : 'door';
  if (object.category === 'crates') return 'crate';
  if (object.category === 'barrels') return 'barrel';
  // Retired weapon placements from older saves retain a monochrome weapon visual.
  return OBJECT_VECTORS[object.type] ? object.type : 'UniLaserPistolGob';
}
const paths = new Map();
export function drawObjectVisual(ctx, object, minSize) {
  const key = objectVisualKey(object), vector = OBJECT_VECTORS[key];
  if (!paths.has(key)) paths.set(key, vector.paths.map(path => ({ fill: path.fill, path: new Path2D(path.d) })));
  const extent = Math.max(vector.extent, minSize / vector.inkFraction);
  ctx.save(); ctx.scale(extent / vector.resolution, extent / vector.resolution); ctx.translate(-vector.resolution / 2, -vector.resolution / 2);
  for (const entry of paths.get(key)) { ctx.fillStyle = entry.fill; ctx.fill(entry.path, 'evenodd'); }
  ctx.restore();
  return extent * vector.inkFraction / 2;
}
