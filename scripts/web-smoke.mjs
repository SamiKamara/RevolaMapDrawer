// Test the deployable static directory in a real browser with a fresh profile.
// File choices and downloads use browser UI; no renderer model is exposed.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { brotliCompressSync, createInflate } from 'node:zlib';
import { once } from 'node:events';
import { createDocument, addWall, validateDocument } from '../src/model.js';
import { generateFloor } from '../src/floors.js';
import { decodePngMetadata, MAX_METADATA_BYTES, MAX_PNG_BYTES } from '../src/png.js';
import { createExampleDocument } from './example-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'web-dist'), artifacts = path.join(root, 'artifacts');
const destination = name => path.join(artifacts, `web-${name}`);
await fs.access(path.join(output, 'index.html'));
await fs.mkdir(artifacts, { recursive: true });

// Exercise the current browser bundle through real mouse/keyboard events and
// downloaded projects. This shared check also runs against the published site
// while offline, so release behavior adds no resource requests or map uploads.
async function verifyDrawingModifiers(page, snapshot, open, prefix = '') {
  const canvas = page.locator('#map-canvas');
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const calibrate = async () => {
    await settle();
    const view = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect(), transform = element.getContext('2d').getTransform();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, ratioX: element.width / rect.width, ratioY: element.height / rect.height,
        a: transform.a, d: transform.d, e: transform.e, f: transform.f };
    });
    return { view, point: point => ({ x: view.x + (point.x * view.a + view.e) / view.ratioX, y: view.y + (point.y * view.d + view.f) / view.ratioY }) };
  };
  const resetPreview = () => page.evaluate(() => { window.__revolaWebPreview.length = 0; });
  await page.evaluate(() => {
    window.__revolaWebPreview = [];
    const prototype = CanvasRenderingContext2D.prototype;
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke']) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        if (this.canvas.id === 'map-canvas') {
          if (method === 'beginPath') this.__revolaWebPath = [];
          if (method === 'moveTo' || method === 'lineTo') this.__revolaWebPath?.push({ x: args[0], y: args[1] });
          if (method === 'stroke' && this.strokeStyle === '#b5e8c6' && this.getLineDash().length) window.__revolaWebPreview.push(this.__revolaWebPath?.map(point => ({ ...point })));
        }
        return original.apply(this, args);
      };
    }
  });
  const preview = async (name, expectedPoints) => {
    await settle();
    const paths = await page.evaluate(() => window.__revolaWebPreview);
    for (const point of expectedPoints) assert.ok(paths.some(points => points?.some(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-6)),
      `${name}: actual browser Canvas preview includes (${point.x},${point.y})`);
    await expect(page.locator('#status-message')).not.toHaveClass(/error/);
    await page.screenshot({ path: destination(`${prefix}${name}.png`) });
  };
  const loadBlank = async name => {
    const fixture = createDocument(); fixture.name = name;
    const file = destination(`${prefix}${name}-fixture.revola.json`); await fs.writeFile(file, JSON.stringify(fixture));
    await open(file, name); await page.locator('#fit-button').click();
    await expect(page.locator('#undo-button')).toBeDisabled(); await expect(page.locator('#dirty-dot')).not.toHaveClass(/dirty/);
    return fixture;
  };
  const history = async (name, before, after) => {
    await page.locator('#undo-button').click(); assert.deepEqual(await snapshot(`${name}-undone`), before, 'Browser undo restores the complete previous project');
    await expect(page.locator('#undo-button')).toBeDisabled();
    await page.locator('#redo-button').click(); assert.deepEqual(await snapshot(`${name}-redone`), after, 'Browser redo restores the exact modifier geometry');
  };

  const squareBase = await loadBlank('shift-square-web');
  await page.locator('[data-tool="room"]').click(); await page.locator('#rotate-room').uncheck();
  let camera = await calibrate();
  const start = camera.point({ x: 2000, y: 1200 }), end = camera.point({ x: 3100, y: 1800 });
  await page.mouse.move(start.x, start.y); await page.keyboard.down('Shift'); await page.mouse.down();
  await resetPreview(); await page.mouse.move(end.x, end.y);
  await preview('shift-square-held-before-press', [{ x: 2000, y: 1420 }, { x: 3100, y: 2080 }, { x: 2220, y: 2300 }, { x: 2880, y: 2300 }]);
  await resetPreview(); await page.keyboard.up('Shift');
  await preview('shift-square-key-released', [{ x: 2000, y: 1420 }, { x: 3100, y: 1580 }, { x: 2220, y: 1800 }, { x: 2880, y: 1800 }]);
  await resetPreview(); await page.keyboard.down('Shift');
  await preview('shift-square-key-pressed', [{ x: 2000, y: 1420 }, { x: 3100, y: 2080 }, { x: 2220, y: 2300 }, { x: 2880, y: 2300 }]);
  await page.mouse.up(); await page.keyboard.up('Shift'); await expect(page.locator('#status-message')).toContainText('Room placed');
  const square = await snapshot('shift-square-placed');
  assert.equal(square.vertices.length, 8); assert.equal(square.edges.length, 8);
  assert.equal(Math.min(...square.vertices.map(vertex => vertex.x)), 2000); assert.equal(Math.max(...square.vertices.map(vertex => vertex.x)), 3100);
  assert.equal(Math.min(...square.vertices.map(vertex => vertex.y)), 1200); assert.equal(Math.max(...square.vertices.map(vertex => vertex.y)), 2300);
  assert.deepEqual(square.ship, squareBase.ship); await history('shift-square', squareBase, square);

  const corridorBase = await loadBlank('short-offset-airlock-web');
  await page.locator('[data-tool="corridor"]').click(); camera = await calibrate();
  const pivot = camera.point({ x: 4110.5, y: 4700 }), scale = camera.view.a / camera.view.ratioX;
  await page.mouse.move(pivot.x, pivot.y); await page.mouse.wheel(0, -Math.log(.15 / scale) / .0015); camera = await calibrate();
  const aim = camera.point({ x: 4210.5, y: 4700 }), release = camera.point({ x: 4210.5, y: 4650 });
  assert.ok(Math.hypot(release.x - aim.x, release.y - aim.y) > 3, 'The short browser drag exceeds the real placement threshold');
  await page.mouse.move(aim.x, aim.y); await page.mouse.down();
  await expect(page.locator('#status-message')).toContainText('Corridor start aligned to the door center');
  await resetPreview(); await page.mouse.move(release.x, release.y);
  await preview('short-offset-airlock-preview', [{ x: 3820.5, y: 4700 }, { x: 3820.5, y: 4650 }, { x: 4400.5, y: 4700 }, { x: 4400.5, y: 4650 }]);
  await page.mouse.up(); await expect(page.locator('#status-message')).toContainText('Corridor placed');
  const corridor = await snapshot('short-offset-airlock-placed'), vertices = new Map(corridor.vertices.map(vertex => [vertex.id, vertex]));
  assert.equal(corridor.edges.length, 2); assert.equal(corridor.vertices.length, 4);
  for (const x of [3820.5, 4400.5]) assert.equal(corridor.edges.filter(edge => {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    return a.x === x && b.x === x && Math.min(a.y, b.y) === 4650 && Math.max(a.y, b.y) === 4700 && !edge.doors.length && !edge.gaps.length;
  }).length, 1, 'Offset press preserves the exact 50 px vertical rail from the 580 px centered airlock start');
  assert.deepEqual(corridor.ship, corridorBase.ship); await history('short-offset-airlock', corridorBase, corridor);
  return { offline: true, shiftSquare: { side: 1100, keyTransitionsAtStationaryPointer: true, heldBeforePressAndAtRelease: true, exactDownloadAndHistory: true },
    shortCorridor: { length: 50, width: 580, rawPressOffset: 100, exactDoorCenter: { x: 4110.5, y: 4700 }, positivePreview: true, exactDownloadAndHistory: true } };
}

// Optional production check uses a separate fresh browser and evidence files.
// It performs only downloads, local imports and cached reloads on the given site.
if (process.argv.length > 2) {
  assert.equal(process.argv[2], '--url', 'Usage: node scripts/web-smoke.mjs [--url https://deployed-site]');
  assert.equal(process.argv.length, 4);
  const deployed = new URL(process.argv[3]);
  assert.equal(deployed.protocol, 'https:');
  assert.equal(deployed.pathname, '/'); assert.equal(deployed.search, ''); assert.equal(deployed.hash, '');
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 960 }, serviceWorkers: 'allow' });
  const requests = [], finished = [], errors = [], tracking = [];
  context.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  context.on('requestfinished', request => tracking.push((async () => {
    const response = await request.response();
    finished.push({ url: request.url(), fromServiceWorker: response.fromServiceWorker(), status: response.status(), cacheControl: response.headers()['cache-control'], ...(await request.sizes()) });
  })().catch(error => errors.push(`Network accounting: ${error.message}`))));
  const page = await context.newPage(); page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  const result = { url: deployed.origin, rendererErrors: errors, interactions: [] };
  const settle = async () => { await page.waitForLoadState('networkidle'); await Promise.all(tracking); };
  const write = async (selector, name) => {
    const pending = page.waitForEvent('download', { timeout: 120_000 }); await page.locator(selector).click();
    const download = await pending, file = destination(`production-${name}`); await download.saveAs(file);
    assert.equal(await download.failure(), null); await expect(page.locator(selector)).toBeEnabled();
    return fs.readFile(file);
  };
  try {
    const initial = await page.goto(deployed.href, { waitUntil: 'networkidle' });
    assert.equal(initial.status(), 200); assert.match(initial.headers()['content-security-policy'], /connect-src 'self'/);
    await expect(page.locator('#map-canvas')).toBeVisible();
    await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
    await page.evaluate(() => navigator.serviceWorker.ready); await settle();
    assert.equal(await page.evaluate(() => typeof window.revolaDesktop), 'undefined');
    assert.ok(!requests.some(item => item.url.includes('editor-stars')));
    for (const response of finished.filter(item => new URL(item.url).pathname.startsWith('/assets/'))) assert.match(response.cacheControl, /max-age=31536000.*immutable/);
    result.firstLoad = finished.slice();
    await page.reload({ waitUntil: 'networkidle' }); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); await settle();
    const warmStart = finished.length;
    await page.reload({ waitUntil: 'networkidle' }); await settle();
    result.controlledReload = finished.slice(warmStart);
    assert.ok(result.controlledReload.filter(item => !item.fromServiceWorker).every(item => new URL(item.url).pathname === '/sw.js'), 'Production repeat visit makes no host resource requests');
    const fixture = createExampleDocument(), fixturePath = destination('production-fixture.revola.json');
    await fs.writeFile(fixturePath, JSON.stringify(fixture));
    const localStart = finished.length;
    const chooser = page.waitForEvent('filechooser'); await page.locator('#open-button').click(); await (await chooser).setFiles(fixturePath);
    await expect(page.locator('#document-title')).toHaveText(fixture.name);
    assert.deepEqual(validateDocument(JSON.parse((await write('#project-button', 'project.revola.json')).toString('utf8'))), fixture);
    const png = await write('#export-button', 'editable.png'); assert.deepEqual(validateDocument(decodePngMetadata(png)), fixture);
    const svg = (await write('#svg-button', 'walls.svg')).toString('utf8');
    const embedded = svg.match(/(?:href|xlink:href)="data:image\/png;base64,([^"]+)"/);
    assert.ok(embedded); assert.ok(Buffer.from(embedded[1], 'base64').equals(await fs.readFile(path.join(root, 'assets', 'ship.png'))));
    await settle();
    result.localActions = finished.slice(localStart);
    assert.ok(result.localActions.filter(item => !item.fromServiceWorker).every(item => new URL(item.url).pathname === '/sw.js'), 'Production imports and exports make no resource requests to the host');
    await page.screenshot({ path: destination('production-editor.png') });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'networkidle' }); await expect(page.locator('#map-canvas')).toBeVisible();
    await page.locator('#file-input').setInputFiles(destination('production-editable.png'));
    await expect(page.locator('#document-title')).toHaveText(fixture.name);
    assert.deepEqual(validateDocument(JSON.parse((await write('#project-button', 'offline-project.revola.json')).toString('utf8'))), fixture);
    assert.equal((await write('#svg-button', 'offline-walls.svg')).toString('utf8'), svg);
    await page.screenshot({ path: destination('production-offline.png') });
    const snapshot = async name => validateDocument(JSON.parse((await write('#project-button', `${name}.revola.json`)).toString('utf8')));
    const open = async (file, expectedName) => {
      const dirty = await page.locator('#dirty-dot').evaluate(element => element.classList.contains('dirty'));
      const chooser = page.waitForEvent('filechooser'); await page.locator('#open-button').click(); await (await chooser).setFiles(file);
      if (dirty) { await expect(page.locator('#confirm-dialog')).toBeVisible(); await page.locator('#confirm-dialog button[value="discard"]').click(); }
      await expect(page.locator('#document-title')).toHaveText(expectedName);
      await expect(page.locator('#status-message')).toContainText('All walls and doors are editable');
    };
    const drawingStart = finished.length;
    result.drawingModifiers = await verifyDrawingModifiers(page, snapshot, open, 'production-'); await settle();
    result.drawingActions = finished.slice(drawingStart);
    assert.ok(result.drawingActions.filter(item => !item.fromServiceWorker).every(item => new URL(item.url).pathname === '/sw.js'), 'Production Shift and short corridor drawing use no host resources while offline');
    assert.ok(requests.every(item => ['GET', 'HEAD'].includes(item.method) && (!/^https?:/.test(item.url) || new URL(item.url).origin === deployed.origin)), 'Production editor sends no uploads and contacts no other domain');
    assert.deepEqual(errors, []);
    result.interactions.push('Published cache/security headers match the static deployment', 'Warm controlled reload uses cached resources', 'Local browser JSON/PNG/SVG downloads preserve exact fixture topology and embed ship bytes without resource traffic', 'Installed production app reloads offline and reopens editable PNG with exact JSON/SVG downloads', 'Shift square and short offset airlock corridor previews, downloads and undo/redo work offline', 'No map uploads or third-party requests');
    result.files = { projectBytes: Buffer.byteLength(JSON.stringify(fixture)), pngBytes: png.length, svgBytes: Buffer.byteLength(svg) };
    await fs.writeFile(destination('production-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, evidenceFile: destination('production-results.json') }, null, 2));
  } catch (error) {
    await page.screenshot({ path: destination('production-failure.png') }).catch(() => {});
    await fs.writeFile(destination('production-failure.json'), JSON.stringify({ message: error.message, requests, finished, errors }, null, 2));
    throw error;
  } finally { await browser.close(); }
  process.exit(0);
}

const configuration = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8'));
const sourceMatches = (source, pathname) => new RegExp(`^${source.replaceAll(':path*', '.*')}$`).test(pathname);
const headersFor = pathname => Object.fromEntries((configuration.headers ?? [])
  .filter(rule => sourceMatches(rule.source, pathname)).flatMap(rule => rule.headers.map(({ key, value }) => [key, value])));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const hostRequests = [];
let workerOverride;
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const record = { path: pathname, method: request.method, status: 0, bodyBytes: 0, rawBytes: 0 };
  hostRequests.push(record);
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { record.status = 405; response.writeHead(405).end(); return; }
    const file = path.resolve(output, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(output + path.sep)) { record.status = 403; response.writeHead(403).end(); return; }
    const bytes = pathname === '/sw.js' && workerOverride ? workerOverride : await fs.readFile(file), extension = path.extname(file);
    const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
    const headers = { ...headersFor(pathname), 'Content-Type': types[extension] ?? 'application/octet-stream', ETag: etag };
    if (request.headers['if-none-match'] === etag) { record.status = 304; response.writeHead(304, headers).end(); return; }
    let body = bytes;
    if (/\bbr\b/.test(request.headers['accept-encoding'] ?? '') && ['.html', '.js', '.css', '.txt'].includes(extension)) {
      body = brotliCompressSync(bytes); headers['Content-Encoding'] = 'br'; headers.Vary = 'Accept-Encoding';
    }
    record.status = 200; record.rawBytes = bytes.length;
    record.bodyBytes = request.method === 'HEAD' ? 0 : body.length;
    response.writeHead(200, { ...headers, 'Content-Length': body.length }).end(request.method === 'HEAD' ? undefined : body);
  } catch { record.status = 404; response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const summarize = records => ({ requests: records.length, bodyBytes: records.reduce((sum, item) => sum + item.bodyBytes, 0), records });
const errors = [], browserRequests = [], evidence = { interactions: [], rendererErrors: errors, transfers: {} };
let browser, page;

async function inspectPng(png, document) {
  assert.deepEqual(validateDocument(decodePngMetadata(png)), document);
  const records = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    records.push({ type: png.toString('ascii', offset + 4, offset + 8), data: png.subarray(offset + 8, offset + 8 + size) });
    offset += size + 12;
  }
  const header = records[0].data, width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.equal(width, document.width); assert.equal(height, document.height);
  assert.deepEqual([...header.subarray(8)], [8, 4, 0, 0, 0]);
  const edge = document.edges.find(item => item.doors.length), a = document.vertices.find(item => item.id === edge.a), b = document.vertices.find(item => item.id === edge.b);
  const doorX = Math.round(a.x + (b.x - a.x) * edge.doors[0].t), doorY = Math.round(a.y);
  const row = new Uint8Array(width), stride = width * 2 + 1, inflater = createInflate();
  let position = 0, previousAlpha = 0, visible = 0, transparent = 0;
  const consuming = (async () => {
    for await (const bytes of inflater) for (const byte of bytes) {
      const column = position % stride;
      if (!column) { assert.equal(byte, 1); previousAlpha = 0; }
      else if (column % 2 === 1) assert.equal(byte, column === 1 ? 255 : 0, 'Every decoded grayscale pixel is white');
      else {
        previousAlpha = (previousAlpha + byte) & 255;
        if (previousAlpha) visible++; else transparent++;
        if (Math.floor(position / stride) === doorY) row[column / 2 - 1] = previousAlpha;
      }
      position++;
    }
  })();
  consuming.catch(() => {});
  for (const { data } of records.filter(item => item.type === 'IDAT')) if (!inflater.write(data)) await once(inflater, 'drain');
  inflater.end(); await consuming;
  assert.equal(position, stride * height); assert.ok(visible > 100_000); assert.ok(transparent > 50_000_000);
  let left = doorX, right = doorX;
  while (left > 0 && row[left - 1] === 0) left--;
  while (right < width && row[right] === 0) right++;
  assert.ok(Math.abs(right - left - document.style.doorWidth) <= 2, 'Transparent raster doorway retains the measured 375 px opening');
  return { width, height, visibleWhitePixels: visible, transparentPixels: transparent, doorClearPixels: right - left, bytes: png.length };
}

try {
  browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 960 }, serviceWorkers: 'allow' });
  context.on('request', request => browserRequests.push({ url: request.url(), method: request.method() }));
  page = await context.newPage(); page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(origin, { waitUntil: 'networkidle' });
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  await expect(page.locator('#map-canvas')).toBeVisible();
  assert.equal(await page.evaluate(() => typeof window.revolaDesktop), 'undefined');
  await page.evaluate(() => navigator.serviceWorker.ready);
  assert.ok(!hostRequests.some(item => item.path.includes('editor-stars')), 'An open/new map never fetches the optional background');
  evidence.transfers.firstLoad = summarize(hostRequests.slice());
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const warmStart = hostRequests.length;
  await page.reload({ waitUntil: 'networkidle' });
  const warm = hostRequests.slice(warmStart);
  assert.ok(warm.every(item => item.path === '/sw.js'), 'A controlled repeat visit transfers no editor resources');
  assert.ok(warm.reduce((sum, item) => sum + item.bodyBytes, 0) < 16_384, 'Only the small worker update check may reach the host');
  evidence.transfers.controlledReload = summarize(warm);
  evidence.interactions.push('Fresh browser opens the built static shell; repeated controlled reload uses local cached resources');

  const write = async (selector, name) => {
    const pending = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator(selector).click();
    const download = await pending, file = destination(name);
    await download.saveAs(file);
    assert.equal(await download.failure(), null);
    await expect(page.locator(selector)).toBeEnabled();
    await expect(page.locator('#status-message')).toContainText('Downloaded');
    return fs.readFile(file);
  };
  const snapshot = async name => validateDocument(JSON.parse((await write('#project-button', `${name}.revola.json`)).toString('utf8')));
  const open = async (file, expectedName) => {
    const dirty = await page.locator('#dirty-dot').evaluate(element => element.classList.contains('dirty'));
    const chooser = page.waitForEvent('filechooser'); await page.locator('#open-button').click();
    await (await chooser).setFiles(file);
    if (dirty) { await expect(page.locator('#confirm-dialog')).toBeVisible(); await page.locator('#confirm-dialog button[value="discard"]').click(); }
    await expect(page.locator('#document-title')).toHaveText(expectedName);
    await expect(page.locator('#status-message')).toContainText('All walls and doors are editable');
  };
  await page.locator('#fit-button').click();
  const rect = await page.locator('#map-canvas').boundingBox(); assert.ok(rect?.width > 500);
  const pointerAt = async (x, y) => {
    await page.mouse.move(x, y);
    const values = (await page.locator('#pointer-position').textContent()).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    assert.equal(values?.length, 2); return { x: values[0], y: values[1] };
  };
  const p1 = { x: rect.x + rect.width * .35, y: rect.y + rect.height * .35 };
  const w1 = await pointerAt(p1.x, p1.y), w2 = await pointerAt(p1.x + 120, p1.y + 120);
  const clickMap = async (x, y) => page.mouse.click(p1.x + (x - w1.x) * 120 / (w2.x - w1.x), p1.y + (y - w1.y) * 120 / (w2.y - w1.y));
  const localStart = hostRequests.length;
  await page.locator('[data-tool="wall"]').click();
  await clickMap(1800, 1400); await clickMap(4300, 1400); await clickMap(4300, 3300); await page.keyboard.press('Escape');
  await expect(page.locator('#graph-stats')).toHaveText('2 walls · 0 doors');
  await page.locator('[data-tool="door"]').click(); await clickMap(3000, 1400);
  await expect(page.locator('#graph-stats')).toHaveText('2 walls · 1 doors');
  await page.locator('#map-name').fill('Browser smoke — Revola'); await page.locator('#map-name').blur();
  const project = await snapshot('project');
  assert.equal(project.vertices.length, 3); assert.equal(project.edges.length, 2);
  assert.equal(project.style.wallWidth, 50); assert.equal(project.style.doorWidth, 375); assert.equal(project.style.corridorWidth, 580);
  assert.ok(project.edges[0].a === project.edges[1].a || project.edges[0].a === project.edges[1].b || project.edges[0].b === project.edges[1].a || project.edges[0].b === project.edges[1].b, 'Walls share a graph vertex');
  await page.locator('#undo-button').click(); await page.locator('#undo-button').click();
  await expect(page.locator('#graph-stats')).toHaveText('2 walls · 0 doors');
  await page.locator('#redo-button').click(); await page.locator('#redo-button').click();
  assert.deepEqual(await snapshot('after-history'), project, 'Undo/redo restores exact saved topology and openings');
  const png = await write('#export-button', 'editable.png'); evidence.png = await inspectPng(png, project);
  const svg = (await write('#svg-button', 'walls.svg')).toString('utf8');
  const embedded = svg.match(/(?:href|xlink:href)="data:image\/png;base64,([^"]+)"/);
  assert.ok(embedded, 'SVG embeds ship artwork for standalone offline use');
  assert.ok(Buffer.from(embedded[1], 'base64').equals(await fs.readFile(path.join(root, 'assets', 'ship.png'))));
  assert.ok(!/(?:href|src)="https?:\/\//.test(svg), 'SVG has no remote dependencies');
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  await open(destination('project.revola.json'), project.name);
  assert.deepEqual(await snapshot('json-reopened'), project);
  await open(destination('editable.png'), project.name);
  assert.deepEqual(await snapshot('png-reopened'), project);
  for (const invalid of [
    { name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') },
    { name: 'too-large.revola.json', mimeType: 'application/json', buffer: Buffer.alloc(MAX_METADATA_BYTES + 1, 32) },
    { name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(MAX_PNG_BYTES + 1) },
  ]) {
    await page.locator('#file-input').setInputFiles(invalid);
    await expect(page.locator('#status-message')).toHaveClass(/error/);
    assert.deepEqual(await snapshot('invalid-preserved'), project, `${invalid.name} does not replace the current map`);
  }
  const localRequests = hostRequests.slice(localStart);
  assert.ok(localRequests.every(item => item.path === '/sw.js' && item.bodyBytes === 0), 'Editing, history, local file imports and all wall exports make zero resource requests to the host; automatic worker revalidation carries no body');
  evidence.transfers.editImportExport = summarize(localRequests);
  evidence.interactions.push('UI draws connected walls and a 375 px door; history and JSON/editable PNG reopen preserve exact topology; transparent white raster and embedded SVG verified; invalid and oversized imports preserve the map; all actions stay local');
  await page.screenshot({ path: destination('editor.png') });

  const example = createExampleDocument(), examplePath = destination('example-fixture.revola.json');
  await fs.writeFile(examplePath, JSON.stringify(example)); await open(examplePath, example.name);
  assert.deepEqual(await snapshot('example-reopened'), example);
  const closed = createDocument(); closed.name = 'Closed browser floor';
  const points = [[3739.5, 4740], [3739.5, 4400], [2000, 4400], [2000, 1000], [6500, 1000], [6500, 4400], [4452.5, 4400], [4452.5, 4740]];
  for (let i = 1; i < points.length; i++) addWall(closed, { x: points[i - 1][0], y: points[i - 1][1] }, { x: points[i][0], y: points[i][1] }, { joinTolerance: 0 });
  assert.equal(generateFloor(closed).closed, true);
  const closedPath = destination('closed-fixture.revola.json'); await fs.writeFile(closedPath, JSON.stringify(closed));
  assert.ok(!hostRequests.some(item => item.path.includes('editor-stars')));
  const closureStart = hostRequests.length;
  await context.setOffline(true);
  await open(closedPath, closed.name); await expect(page.locator('#floor-svg-button')).toBeEnabled();
  const firstOfflineFloor = (await write('#floor-svg-button', 'first-offline-floor.svg')).toString('utf8');
  assert.match(firstOfflineFloor, /<path/);
  assert.equal(hostRequests.length, closureStart, 'The first offline closure remains exportable without fetching the uncached background');
  await page.screenshot({ path: destination('first-offline-closure.png') });
  evidence.interactions.push('First-ever closure while offline keeps the floor SVG export available with the optional stars uncached');
  await context.setOffline(false);
  await expect.poll(() => hostRequests.filter(item => item.path.includes('editor-stars') && item.status === 200).length).toBe(1);
  evidence.transfers.firstClosure = summarize(hostRequests.slice(closureStart));
  await page.screenshot({ path: destination('closed-editor.png') });
  await context.setOffline(true);
  const offlineStart = hostRequests.length;
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#map-canvas')).toBeVisible(); await expect(page.locator('#graph-stats')).toHaveText('0 walls · 0 doors');
  await open(destination('editable.png'), project.name);
  assert.deepEqual(await snapshot('offline-project'), project);
  assert.deepEqual(validateDocument(decodePngMetadata(await write('#export-button', 'offline-editable.png'))), project);
  assert.equal((await write('#svg-button', 'offline-walls.svg')).toString('utf8'), svg);
  await open(closedPath, closed.name); await expect(page.locator('#floor-svg-button')).toBeEnabled();
  const floorSvg = (await write('#floor-svg-button', 'offline-floor.svg')).toString('utf8');
  assert.match(floorSvg, /<path/); assert.ok(!floorSvg.includes('data:image'));
  assert.deepEqual(await snapshot('offline-closed'), closed);
  const offlineRequests = hostRequests.slice(offlineStart);
  assert.ok(offlineRequests.every(item => item.path === '/sw.js' && item.bodyBytes === 0), 'Offline reload and save/reopen use only local resources; Chromium may independently revalidate its worker outside page offline emulation');
  evidence.transfers.offline = summarize(offlineRequests);
  evidence.interactions.push('Stars load once on first closure; installed editor reloads offline and saves/reopens local PNG, JSON, wall SVG and closed-map floor SVG');

  const drawingStart = hostRequests.length;
  evidence.drawingModifiers = await verifyDrawingModifiers(page, snapshot, open);
  const drawingRequests = hostRequests.slice(drawingStart);
  assert.ok(drawingRequests.every(item => item.path === '/sw.js' && item.bodyBytes === 0), 'Shift square and short corridor drawing operate offline with no host resource traffic');
  evidence.transfers.drawingModifiers = summarize(drawingRequests);
  evidence.interactions.push('Browser Shift square modifier updates previews immediately at a stationary pointer; held-release square and short offset airlock corridor download exact geometry with one-step history, all offline');

  await page.setViewportSize({ width: 1024, height: 700 }); await page.locator('#fit-button').click();
  const compact = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
    controls: ['open-button', 'project-button', 'export-button', 'svg-button', 'floor-png-button', 'floor-svg-button', 'map-canvas'].map(id => {
      const box = document.getElementById(id).getBoundingClientRect(); return { id, left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    }) }));
  assert.equal(compact.overflow, false);
  for (const control of compact.controls) assert.ok(control.left >= 0 && control.top >= 0 && control.right <= compact.width + 1 && control.bottom <= compact.height + 1 && control.width > 20 && control.height > 20, `${control.id} is usable in compact browser`);
  evidence.compact = compact; await page.screenshot({ path: destination('compact.png') });

  // Serve a second worker version without changing the deployment directory.
  // Its shell is identical; actual browser lifecycle must protect both open tabs.
  await context.setOffline(false);
  const oldCache = await page.evaluate(async () => (await caches.keys()).find(name => name.startsWith('revola-map-drawer-')));
  const oldBuildId = oldCache.slice('revola-map-drawer-'.length), updatedId = createHash('sha256').update(oldBuildId + '-update-test').digest('hex').slice(0, 16);
  workerOverride = Buffer.from((await fs.readFile(path.join(output, 'sw.js'), 'utf8')).replace(oldBuildId, updatedId));
  await page.locator('#map-name').fill('Unsaved across browser update'); await page.locator('#map-name').blur();
  await expect(page.locator('#dirty-dot')).toHaveClass(/dirty/);
  const secondTab = await context.newPage(); await secondTab.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state)).toBe('installed');
  await expect(page.locator('#map-name')).toHaveValue('Unsaved across browser update');
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.state), 'activated');
  assert.ok((await page.evaluate(() => caches.keys())).includes(oldCache), 'Old shell remains available while existing editor tabs are open');
  await context.setOffline(true);
  await secondTab.reload({ waitUntil: 'networkidle' }); await expect(secondTab.locator('#map-canvas')).toBeVisible();
  await secondTab.close();
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting.state), 'installed', 'Closing one of two tabs cannot replace the remaining unsaved editor');
  const waitingWorker = context.serviceWorkers().at(-1);
  await page.close(); page = undefined;
  await expect.poll(() => waitingWorker.evaluate(async () => ({ waiting: self.registration.waiting?.state ?? null, active: self.registration.active?.state, keys: await caches.keys() }))).toEqual({ waiting: null, active: 'activated', keys: ['revola-map-drawer-' + updatedId] });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' }); await expect(page.locator('#map-canvas')).toBeVisible();
  evidence.workerUpdate = { waitedForBothTabs: true, unsavedEditorPreserved: true, activatedAfterLastTabClosed: true, nextVisitOffline: true };
  evidence.interactions.push('Updated worker waits while two editor tabs remain open, retains the unsaved map and old offline shell, then activates after the last tab closes; its next visit opens offline');
  assert.deepEqual(errors, []);
  const remote = browserRequests.filter(item => /^https?:/.test(item.url) && !item.url.startsWith(origin + '/'));
  const uploads = browserRequests.filter(item => !['GET', 'HEAD'].includes(item.method));
  assert.deepEqual(remote, [], 'Browser contacts no third-party services'); assert.deepEqual(uploads, [], 'No map or export is uploaded');
  evidence.networkPolicy = { thirdPartyRequests: remote.length, uploadRequests: uploads.length };
  await fs.writeFile(destination('results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ...evidence, evidenceFile: destination('results.json') }, null, 2));
} catch (error) {
  await page?.screenshot({ path: destination('failure.png') }).catch(() => {});
  await fs.writeFile(destination('failure.json'), JSON.stringify({ message: error.message, errors, hostRequests }, null, 2));
  throw error;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
