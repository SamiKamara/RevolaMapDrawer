import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/model.js';
import { objectDoorTargets } from '../src/objects.js';
import { createDoorClearance } from '../src/door-clearance.js';
import { PLACEMENT_DEFAULTS } from '../src/placement-defaults.js';

function fixture(degrees = 0) {
  const doc = createDocument(), angle = degrees * Math.PI / 180, center = { x: 4000, y: 3000 };
  const tangent = { x: Math.cos(angle), y: Math.sin(angle) }, normal = { x: -tangent.y, y: tangent.x };
  const at = (x, y) => ({ x: center.x + tangent.x * x + normal.x * y, y: center.y + tangent.y * x + normal.y * y });
  doc.vertices = [{ id: 'a', ...at(-1000, 0) }, { id: 'b', ...at(1000, 0) }];
  doc.edges = [{ id: 'wall', a: 'a', b: 'b', doors: [{ id: 'door', t: .5 }], gaps: [] }];
  const target = objectDoorTargets(doc).find(target => target.id === 'door');
  const unit = PLACEMENT_DEFAULTS.unitsPerPixel, margin = doc.style.doorWidth * PLACEMENT_DEFAULTS.safety.doorSweepMarginInOpeningWidths;
  return { doc, target, at, unit, margin };
}

test('sliding bounds contain continuous native leaf corners in both directions at arbitrary opening rotations', () => {
  const f = PLACEMENT_DEFAULTS.doorFootprints.sliding;
  for (const degrees of [0, 45, 123, 271]) {
    const { doc, target, at, unit } = fixture(degrees), make = createDoorClearance(doc);
    const explicit = make({ doorId: target.id, type: 'sliding' }), automatic = make(target);
    for (const direction of [-1, 1]) for (let sample = 0; sample <= 100; sample++)
      for (const x of [-f.width / 2 / unit, f.width / 2 / unit]) for (const y of [-f.thickness / 2 / unit, f.thickness / 2 / unit]) {
        const point = at(x + direction * f.openDistance / unit * sample / 100, y);
        assert.ok(explicit.overlaps(point, 0)); assert.ok(automatic.overlaps(point, 0));
      }
  }
});

test('both full hinge disks contain every leaf corner through arbitrary native angles and both hinge sides', () => {
  const f = PLACEMENT_DEFAULTS.doorFootprints.hinged;
  for (const degrees of [0, 45, 123, 271]) {
    const { doc, target, at, unit } = fixture(degrees), make = createDoorClearance(doc);
    const explicit = make({ doorId: target.id, type: 'hinged' }), automatic = make(target);
    for (const side of [-1, 1]) for (let angle = -180; angle <= 180; angle += 2.5) {
      const radians = angle * Math.PI / 180, dx = -side * Math.cos(radians), dy = -side * Math.sin(radians);
      const hinge = side * (doc.style.doorWidth / 2 - f.hingeOverhang / unit);
      for (const along of [-f.hingeOverhang / unit, (f.width - f.hingeOverhang) / unit])
        for (const across of [-f.thickness / 2 / unit, f.thickness / 2 / unit]) {
          const point = at(hinge + dx * along - dy * across, dy * along + dx * across);
          assert.ok(explicit.overlaps(point, 0)); assert.ok(automatic.overlaps(point, 0));
        }
    }
  }
});

test('automatic bounds union both mechanisms while explicit choices restrict the reserved mechanism', () => {
  const { doc, target, at } = fixture(37), make = createDoorClearance(doc);
  const automatic = make(target), sliding = make({ doorId: 'door', type: 'sliding' }), hinged = make({ doorId: 'door', type: 'hinged' });
  for (const sign of [-1, 1]) {
    assert.equal(sliding.overlaps(at(sign * 650, 0), 0), true); assert.equal(hinged.overlaps(at(sign * 650, 0), 0), false);
    assert.equal(automatic.overlaps(at(sign * 650, 0), 0), true);
  }
  assert.equal(hinged.overlaps(at(0, 330), 0), true); assert.equal(sliding.overlaps(at(0, 330), 0), false);
  assert.equal(automatic.overlaps(at(0, 330), 0), true);
  assert.equal(make({ doorId: 'door', type: 'auto', x: -9999, y: -9999 }), automatic, 'canonical doorId position and kind are cached');
});

test('bounds retain exact margin and circle contact while clearing adjacent room space rejected by the old halo', () => {
  const { doc, target, at, unit, margin } = fixture(21), make = createDoorClearance(doc);
  const automatic = make(target), sliding = make({ doorId: 'door', type: 'sliding' });
  const radius = 100, boundary = PLACEMENT_DEFAULTS.doorFootprints.sliding.thickness / unit / 2 + margin + radius;
  assert.equal(sliding.overlaps(at(0, boundary), radius), true);
  assert.equal(sliding.overlaps(at(0, boundary + .001), radius), false);
  const adjacent = at(0, 600), oldRadius = Math.max(doc.style.doorWidth, ...PLACEMENT_DEFAULTS.prefabs.filter(p => p.group === 'doors').map(p => p.radius / unit * 2)) + margin;
  assert.ok(600 < oldRadius + radius); assert.equal(automatic.overlaps(adjacent, radius), false);
  for (const query of [{ point: adjacent, radius: -1 }, { point: { x: NaN, y: 0 }, radius: 0 }, { point: adjacent, radius: Infinity }])
    assert.equal(automatic.overlaps(query.point, query.radius), true);
});

test('missing or invalid relevant audits use the old conservative circle while valid explicit audits remain usable', () => {
  const { doc, target, at } = fixture();
  const cases = [defaults => { delete defaults.doorFootprints; }, defaults => { defaults.doorFootprints.sliding.audited = false; },
    defaults => { defaults.doorFootprints.sliding.openDistance = .1; }, defaults => { defaults.doorFootprints.sliding.width = .1; },
    defaults => { defaults.doorFootprints.hinged.hingeOverhang = -1; }, defaults => { defaults.doorFootprints.hinged.maximumTotalAngle = 361; },
    defaults => { defaults.doorFootprints.hinged.angleCenterOffset = NaN; }, defaults => { defaults.doorFootprints.hinged.thickness = Infinity; }];
  for (const mutate of cases) {
    const defaults = structuredClone(PLACEMENT_DEFAULTS); mutate(defaults);
    const zone = createDoorClearance(doc, defaults)(target);
    assert.equal(zone.overlaps(at(0, 700), 0), true); assert.equal(zone.overlaps(at(0, 900), 0), false);
  }
  const defaults = structuredClone(PLACEMENT_DEFAULTS); defaults.doorFootprints.hinged.audited = false;
  assert.equal(createDoorClearance(doc, defaults)({ doorId: 'door', type: 'sliding' }).overlaps(at(0, 700), 0), false);
});

test('uncalibrated units, margins, fallback footprints and unknown apertures reject placement conservatively', () => {
  const { doc, target, at } = fixture();
  for (const mutate of [d => { d.unitsPerPixel = 0; }, d => { d.unitsPerPixel = Infinity; },
    d => { d.safety.doorSweepMarginInOpeningWidths = -1; }, d => { d.safety.doorSweepMarginInOpeningWidths = NaN; },
    d => { d.doorFootprints = {}; d.prefabs.find(p => p.group === 'doors').radius = NaN; }]) {
    const defaults = structuredClone(PLACEMENT_DEFAULTS); mutate(defaults);
    assert.equal(createDoorClearance(doc, defaults)(target).overlaps(at(0, 100000), 0), true);
  }
  assert.equal(createDoorClearance(doc)({ doorId: 'unknown', x: 0, y: 0 }).overlaps(at(0, 100000), 0), true);
});
