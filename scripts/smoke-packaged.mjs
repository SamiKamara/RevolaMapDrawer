import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';
import { validateDocument } from '../src/model.js';
import { createExampleDocument } from './example-fixture.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifacts = path.join(root, 'artifacts');
const executablePath = path.join(root, 'dist', 'RevolaMapDrawer-win32-x64', 'RevolaMapDrawer.exe');
const archive = path.join(path.dirname(executablePath), 'resources', 'app.asar');
const sourceFiles = ['index.html',
  ...(await fs.readdir(path.join(root, 'assets'))).map(file => `assets/${file}`),
  ...(await fs.readdir(path.join(root, 'src'))).filter(file => /\.(js|css)$/.test(file)).map(file => `src/${file}`),
  ...(await fs.readdir(path.join(root, 'electron'))).filter(file => file.endsWith('.cjs')).map(file => `electron/${file}`)];
for (const file of sourceFiles) {
  assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `The packaged file must match current source: ${file}`);
}
const output = path.join(artifacts, 'packaged-example.revola.json');
const input = path.join(artifacts, 'packaged-example-fixture.revola.json');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(input, JSON.stringify(createExampleDocument(), null, 2));
await fs.rm(output, { force: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath, cwd: path.dirname(executablePath), env });
try {
  await app.evaluate(({ dialog }, { input, output }) => {
    const opens = [input, output];
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [opens.shift()] });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, { input, output });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('[data-tool="eraser"]')).toBeVisible();
  await expect(page.locator('#guide-rotate-room')).toBeVisible();
  const version = await app.evaluate(({ app }) => app.getVersion());
  assert.equal(version, JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version);
  await page.screenshot({ path: path.join(artifacts, 'packaged-start.png') });
  await page.locator('#open-button').click();
  await expect(page.locator('#map-name')).toHaveValue('Airlock sector');
  await expect(page.locator('#status-message')).not.toHaveClass(/error/);
  const location = await page.evaluate(() => window.location.href);
  assert.match(location.toLowerCase(), /\/dist\/revolamapdrawer-win32-x64\/resources\/app(?:\.asar)?\/index\.html$/);
  await page.locator('#project-button').click();
  await expect.poll(() => fs.stat(output).then(info => info.size).catch(() => 0)).toBeGreaterThan(100);
  const saved = validateDocument(JSON.parse(await fs.readFile(output, 'utf8')));
  assert.ok(saved.edges.length > 20);
  assert.equal(saved.version, 2);
  assert.equal(saved.style.roughness, 2.25);
  await page.locator('#new-button').click();
  await expect(page.locator('#graph-stats')).toHaveText('0 walls · 0 doors');
  await page.locator('#open-button').click();
  await expect(page.locator('#map-name')).toHaveValue(saved.name);
  await page.locator('[data-tool="select"]').click();
  await page.screenshot({ path: path.join(artifacts, 'packaged-example.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700));
  await expect(page.locator('#export-button')).toBeInViewport();
  await expect(page.locator('#map-canvas')).toBeInViewport();
  await page.screenshot({ path: path.join(artifacts, 'packaged-compact.png') });
  assert.deepEqual(errors, []);
  const evidence = { version, executablePath, location, matchingSourceFiles: sourceFiles, walls: saved.edges.length, doors: saved.edges.reduce((n, edge) => n + edge.doors.length, 0), nativeSaveOpen: true, minimumWindow: '1024x700', rendererErrors: errors };
  await fs.writeFile(path.join(artifacts, 'packaged-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await app.close(); }
