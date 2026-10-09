import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { decodePngMetadata } from '../src/png.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'dist', 'web');
const prefix = '/RevolaMapDrawer';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Test the built site under GitHub Pages' repository subpath, not the source preview.
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === prefix || pathname === prefix + '/' ? 'index.html'
      : pathname.startsWith(prefix + '/') ? pathname.slice(prefix.length + 1) : null;
    if (!relative) { res.writeHead(404).end('Not found'); return; }
    const filename = path.resolve(site, relative);
    if (!filename.startsWith(site + path.sep)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store' }).end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const errors = [], failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  const base = `http://127.0.0.1:${server.address().port}${prefix}/`;
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('#status-message')).not.toHaveClass(/error/);
  assert.equal(await page.evaluate(() => typeof window.revolaDesktop), 'undefined');
  assert.ok(await page.evaluate(() => document.querySelector('#map-canvas').width > 0));

  // Browser save must provide a real downloaded, editable project.
  await page.locator('#map-name').fill('Browser smoke');
  await page.locator('#map-name').press('Tab');
  const [projectDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#project-button').click()]);
  assert.match(projectDownload.suggestedFilename(), /\.revola\.json$/);
  const project = JSON.parse(await readFile(await projectDownload.path(), 'utf8'));
  assert.equal(project.name, 'Browser smoke');
  const reopened = { ...project, name: 'Browser reopened' };

  // Browser open must work without the Electron file-dialog bridge.
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#open-button').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'reopen.revola.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(reopened)) });
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-dialog button[value="discard"]').click();
  await expect(page.locator('#document-title')).toHaveText('Browser reopened');

  const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#svg-button').click()]);
  assert.match(svgDownload.suggestedFilename(), /\.svg$/);
  const svg = await readFile(await svgDownload.path(), 'utf8');
  assert.match(svg, /data:image\/png;base64,/);

  const [pngDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }),
    page.locator('#export-button').click()]);
  assert.match(pngDownload.suggestedFilename(), /\.png$/);
  const png = new Uint8Array(await readFile(await pngDownload.path()));
  assert.deepEqual(decodePngMetadata(png), reopened, 'Downloaded wall PNG retains editable project metadata');
  assert.deepEqual(errors, [], 'No uncaught renderer errors');
  assert.deepEqual(failed, [], 'All static assets load from the repository subpath');
  await context.close();
  console.log('Web smoke: browser editor, project download/open, SVG and editable PNG download passed.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
