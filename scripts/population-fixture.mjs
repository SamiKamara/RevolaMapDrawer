import { createDocument, addWall, addDoor } from '../src/model.js';
export function populationFixture() {
  const doc = createDocument(); doc.name = 'Default placement fixture';
  doc.vertices = [{ id: 'a', x: 500, y: 500 }, { id: 'b', x: 7500, y: 500 }, { id: 'c', x: 7500, y: 7500 }, { id: 'd', x: 500, y: 7500 }];
  doc.edges = ['ab', 'bc', 'cd', 'da'].map(([a, b]) => ({ id: a + b, a, b, doors: [], gaps: [] }));
  addWall(doc, { x: 500, y: 3000 }, { x: 6500, y: 3000 }, { joinTolerance: 0 });
  const edge = doc.edges.find(e => { const a = doc.vertices.find(v => v.id === e.a), b = doc.vertices.find(v => v.id === e.b); return a.y === 3000 && b.y === 3000; });
  addDoor(doc, edge.id, { x: 3500, y: 3000 }); return doc;
}
