import { _electron as electron, chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { populationFixture } from './population-fixture.mjs';
import { renderMapSvg } from '../src/svg.js';
import { renderFloorSvg } from '../src/floors.js';
import { validateDocument } from '../src/model.js';
import { generateFloor } from '../src/floors.js';
import { doorPreviewTypes } from '../src/door-preview.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url))), packaged = process.argv.includes('--packaged'), web = process.argv.includes('--web');
const remote = process.argv.includes('--url') ? new URL(process.argv[process.argv.indexOf('--url') + 1]).href : null;
const folder = path.join(root, 'artifacts', `population-${web ? 'web' : packaged ? 'packaged' : 'source'}`); await fs.mkdir(folder, { recursive: true });
const doc = populationFixture(); doc.objects = [{ id: 'my-crate', category: 'crates', type: '', x: 1200, y: 1400, rotation: 0 }];
const input = path.join(folder, 'input.revola'); await fs.writeFile(input, JSON.stringify(doc));
let app, browser, server, page;
try {
  if (web) {
    const webRoot = path.join(root, 'web-dist');
    if (!remote) server = http.createServer(async (request, response) => {
      try {
        const relative = new URL(request.url, 'http://localhost').pathname;
        const file = path.resolve(webRoot, '.' + (relative === '/' ? '/index.html' : decodeURIComponent(relative)));
        if (!file.startsWith(webRoot + path.sep)) { response.writeHead(403).end(); return; }
        const body = await fs.readFile(file); response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'); response.end(body);
      } catch { response.writeHead(404).end(); }
    });
    if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true }); page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(remote ?? `http://127.0.0.1:${server.address().port}`);
  } else {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ ...(packaged ? { executablePath: path.join(root, 'dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe') } : { args: [root] }), env });
    page = await app.firstWindow();
    await app.evaluate(({ dialog, BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(1440, 960); global.__population = {};
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [global.__population.open] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: global.__population.save }); dialog.showMessageBox = async () => ({ response: 1 }); });
  }
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const open = async file => {
    const dirty = (await page.title()).includes('•');
    if (web) { const chooser = page.waitForEvent('filechooser'); await page.locator('#open-button').click(); await (await chooser).setFiles(file); }
    else { await app.evaluate((_, file) => global.__population.open = file, file); await page.locator('#open-button').click(); }
    if (dirty) await page.locator('#confirm-dialog button[value="discard"]').click();
    await expect(page.locator('#status-message')).toContainText(`Opened ${path.basename(file)}`);
    await expect(page.locator('#document-title')).toHaveText(doc.name); await expect(page.locator('#generate-objects')).toBeEnabled();
  };
  const save = async name => {
    const file = path.join(folder, name);
    if (web) { const download = page.waitForEvent('download'); await page.locator('#project-button').click(); await (await download).saveAs(file); }
    else { await app.evaluate((_, file) => global.__population.save = file, file); await page.locator('#project-button').click(); await expect.poll(() => fs.stat(file).then(s => s.size).catch(() => 0)).toBeGreaterThan(100); }
    await expect(page.locator('#project-button')).toBeEnabled(); return JSON.parse(await fs.readFile(file, 'utf8'));
  };
  const generate = async () => { await page.locator('#generate-objects').click(); await expect(page.locator('#object-generation-progress')).toBeHidden({ timeout: 45000 }); await expect(page.locator('#generate-objects')).toBeEnabled(); };
  await expect(page.locator('#generate-objects')).toBeDisabled(); await open(input);
  await page.locator('#generate-objects').dblclick(); await expect(page.locator('#object-generation-progress')).toBeVisible();
  await page.locator('#object-generation-progress button').click(); await expect(page.locator('#object-generation-progress')).toBeHidden();
  const cancelled = await save('cancelled.revola'); assert.deepEqual(cancelled.objects, doc.objects); assert.equal(cancelled.objectGeneration, undefined);
  await generate(); const first = await save('first.revola');
  assert.ok(first.objects.some(o => o.category === 'npc')); assert.ok(first.objects.some(o => o.npcWeapon === 'unarmed'));
  assert.deepEqual(first.objects.filter(o => o.category === 'crates'), doc.objects);
  assert.ok(first.objectGeneration.geometry); assert.equal(renderMapSvg(first), renderMapSvg(doc)); assert.equal(renderFloorSvg(first), renderFloorSvg(doc));
  const types = doorPreviewTypes(first, generateFloor(first));
  const doors = first.objects.filter(o => o.category === 'doors');
  assert.ok(doors.some(o => types.get(o.doorId) === 'hinged')); assert.ok(doors.some(o => types.get(o.doorId) === 'sliding'));
  const pixels = await page.locator('#map-canvas').screenshot();
  const explicit = { ...first, objects: first.objects.map(o => o.category === 'doors' ? { ...o, type: types.get(o.doorId) } : o) };
  const expected = path.join(folder, 'explicit-preview.revola'); await fs.writeFile(expected, JSON.stringify(explicit));
  await open(expected);
  await expect.poll(async () => pixels.equals(await page.locator('#map-canvas').screenshot())).toBe(true);
  await open(path.join(folder, 'first.revola'));
  await page.screenshot({ path: path.join(folder, 'generated.png') });
  await page.locator('[data-tool="wall"]').click();
  const canvas = page.locator('#map-canvas');
  const click = async point => {
    const screen = await canvas.evaluate((el, p) => { const r = el.getBoundingClientRect(), t = el.getContext('2d').getTransform(); return { x: r.x + (p.x * t.a + t.e) / (el.width / r.width), y: r.y + (p.y * t.d + t.f) / (el.height / r.height) }; }, point);
    await page.mouse.click(screen.x, screen.y);
  };
  await click({ x: 500, y: 6000 }); await click({ x: 2000, y: 6000 }); await page.keyboard.press('Escape');
  await expect(page.locator('#generate-objects')).toBeEnabled(); const changed = await save('changed-walls.revola');
  assert.notDeepEqual(changed.edges, first.edges); assert.deepEqual(changed.objects, first.objects);
  await open(path.join(folder, 'changed-walls.revola')); await page.locator('#generate-objects').click();
  await expect(page.locator('#object-regenerate-dialog')).toBeVisible(); await expect(page.locator('#object-regenerate-dialog')).toContainText('including hand-placed objects');
  await page.screenshot({ path: path.join(folder, 'regenerate-confirm.png') });
  await page.locator('#object-regenerate-dialog button[value="cancel"]').click();
  assert.deepEqual(await save('kept.revola'), changed);
  await page.locator('#generate-objects').click(); await page.locator('#object-regenerate-dialog button[value="regenerate"]').click();
  await expect(page.locator('#object-regenerate-dialog')).toBeHidden(); await expect(page.locator('#object-generation-progress')).toBeHidden({ timeout: 45000 });
  const regenerated = await save('regenerated.revola'); assert.ok(!regenerated.objects.some(o => o.id === 'my-crate'));
  assert.notEqual(regenerated.objectGeneration.geometry, first.objectGeneration.geometry); assert.deepEqual(validateDocument(regenerated), regenerated);
  await page.locator('#undo-button').click(); assert.deepEqual(await save('undo.revola'), changed);
  await page.locator('#redo-button').click(); assert.deepEqual(await save('redo.revola'), regenerated);
  assert.deepEqual(errors, []); console.log(JSON.stringify({ web, packaged, objects: regenerated.objects.length, automaticDoorPixelsMatchExplicitTypes: true, regenerationAfterReopen: true, cancelPreserves: true, undoRedo: true, architectureUnchanged: true }));
} catch (error) { await page?.screenshot({ path: path.join(folder, 'failure.png'), timeout: 3000 }).catch(() => {}); console.error(error); throw error; }
finally { if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); } await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); }
