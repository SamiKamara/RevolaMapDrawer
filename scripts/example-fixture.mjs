import * as model from '../src/model.js';
import { SHIP_ANCHOR } from '../src/render.js';

// Reusable native-open fixture for UI checks, independent of editor onboarding.
export function createExampleDocument() {
  const sample = model.createDocument();
  sample.name = 'Airlock sector';
  const leftPort = sample.ship.x + SHIP_ANCHOR.portOffsets[0];
  const rightPort = sample.ship.x + SHIP_ANCHOR.portOffsets[1];
  const points = [
    { x: leftPort, y: 4740 }, { x: leftPort, y: 4200 },
    { x: 2600, y: 4200 }, { x: 2380, y: 3980 },
    { x: 2380, y: 2420 }, { x: 2600, y: 2200 },
    { x: 5200, y: 2200 }, { x: 5420, y: 2420 },
    { x: 5420, y: 3980 }, { x: 5200, y: 4200 },
    { x: rightPort, y: 4200 }, { x: rightPort, y: 4740 },
  ];
  for (let i = 1; i < points.length; i++) model.addWall(sample, points[i - 1], points[i]);
  model.addRoom(sample, { x: 2600, y: 1050 }, { x: 4000, y: 2200 });
  model.addRoom(sample, { x: 4400, y: 900 }, { x: 5700, y: 1800 }, true);
  model.addCorridor(sample, [
    { x: 5420, y: 2850 }, { x: 6400, y: 2850 },
    { x: 6900, y: 2350 }, { x: 6900, y: 1700 },
  ]);
  for (const point of [{ x: 3300, y: 2200 }, { x: 5420, y: 2850 }]) {
    const hit = model.nearestEdge(sample, point, 100);
    if (hit) model.addDoor(sample, hit.edge.id, point);
  }
  return sample;
}
