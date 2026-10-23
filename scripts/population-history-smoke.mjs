import { _electron as electron, chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { populationFixture } from './population-fixture.mjs';
import { generateFloor } from '../src/floors.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url))), packaged = process.argv.includes('--packaged'), web = process.argv.includes('--web');
const folder = path.join(root, 'artifacts', `population-history-${web ? 'web' : packaged ? 'packaged' : 'source'}`);
await fs.mkdir(folder, { recursive: true });
const doc = populationFixture();
doc.objects = [{ id: 'legacy-npc', category: 'npc', type: 'ranged', x: 1200, y: 1400, rotation: 0 }];
const input = path.join(folder, 'legacy.revola'); await fs.writeFile(input, JSON.stringify(doc));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let app, browser, server, page;
const errors = [];
try {
  if (web) {
    const webRoot = path.join(root, 'web-dist');
    server = http.createServer(async (request, response) => {
      try {
        const relative = new URL(request.url, 'http://localhost').pathname;
        const file = path.resolve(webRoot, '.' + (relative === '/' ? '/index.html' : decodeURIComponent(relative)));
        if (!file.startsWith(webRoot + path.sep)) { response.writeHead(403).end(); return; }
        const body = await fs.readFile(file); response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'); response.end(body);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
  } else {
    app = await electron.launch({ ...(packaged ? { executablePath: path.join(root, 'dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe') } : { args: [root] }), env });
    page = await app.firstWindow();
    await app.evaluate(({ dialog, BrowserWindow }, file) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 960); global.__populationHistory = { open: file };
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [global.__populationHistory.open] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: global.__populationHistory.save });
    dialog.showMessageBox = async () => ({ response: 1 });
    }, input);
  }
  page.on('pageerror', error => errors.push(error.message));
  const save = async name => {
    const file = path.join(folder, name);
    if (web) { const download = page.waitForEvent('download'); await page.locator('#project-button').click(); await (await download).saveAs(file); }
    else {
      await app.evaluate((_, file) => global.__populationHistory.save = file, file);
      await page.locator('#project-button').click(); await expect.poll(() => fs.stat(file).then(s => s.size).catch(() => 0)).toBeGreaterThan(100);
    }
    await expect(page.locator('#project-button')).toBeEnabled(); return JSON.parse(await fs.readFile(file, 'utf8'));
  };
  if (web) { const chooser = page.waitForEvent('filechooser'); await page.locator('#open-button').click(); await (await chooser).setFiles(input); }
  else await page.locator('#open-button').click();
  await expect(page.locator('#generate-objects')).toBeEnabled();
  await page.locator('[data-tool="select"]').click(); await page.locator('#zoom-out').click();
  const canvas = page.locator('#map-canvas');
  const screen = point => canvas.evaluate((el, p) => {
    const r = el.getBoundingClientRect(), t = el.getContext('2d').getTransform();
    return { x: r.x + (p.x * t.a + t.e) / (el.width / r.width), y: r.y + (p.y * t.d + t.f) / (el.height / r.height) };
  }, point);
  const start = await screen({ x: 7500, y: 1800 }), end = await screen({ x: 8500, y: 1800 });
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('#generate-objects')).toBeEnabled();
  const expanded = await save('expanded.revola');
  const area = source => Math.abs(generateFloor(source).polygons.reduce((sum, ring) => sum + ring.reduce((total, p, i) => {
    const q = ring[(i + 1) % ring.length]; return total + p.x * q.y - q.x * p.y;
  }, 0), 0) / 2);
  assert.ok(Math.max(...expanded.vertices.map(v => v.x)) > 8000); assert.ok(area(expanded) > area(doc));
  assert.deepEqual(expanded.objects, doc.objects); assert.equal(expanded.objectGeneration, undefined);
  await page.locator('#generate-objects').click(); await expect(page.locator('#object-regenerate-dialog')).toBeVisible();
  await page.locator('#object-regenerate-dialog button[value="cancel"]').click(); assert.deepEqual(await save('cancelled.revola'), expanded);
  await page.locator('#generate-objects').click(); await page.locator('#object-regenerate-dialog button[value="regenerate"]').click();
  await expect(page.locator('#object-generation-progress')).toBeHidden({ timeout: 45000 }); await expect(page.locator('#generate-objects')).toBeEnabled();
  const regenerated = await save('regenerated.revola');
  assert.ok(!regenerated.objects.some(o => o.id === 'legacy-npc')); assert.ok(regenerated.objects.some(o => o.category === 'npc')); assert.ok(regenerated.objectGeneration);
  await page.locator('#undo-button').click(); assert.deepEqual(await save('undo.revola'), expanded);
  await page.locator('#redo-button').click(); assert.deepEqual(await save('redo.revola'), regenerated);
  await page.screenshot({ path: path.join(folder, 'regenerated.png') }); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ web, packaged, legacyExpansionReplacement: true, cancellation: true, undoRedo: true, objects: regenerated.objects.length }));
} catch (error) { await page?.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {}); throw error; }
finally {
  if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); }
  await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve());
}
