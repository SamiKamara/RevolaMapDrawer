// Verify the delivered application folder after extracting a release ZIP.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocument } from '../src/model.js';
import { createExampleDocument } from './example-fixture.mjs';
import { verifyPackagedSource } from './release-utils.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const argumentsList = process.argv.slice(2);
assert.equal(argumentsList.length, 2, 'Usage: npm run test:portable -- --directory <extracted application folder>');
assert.equal(argumentsList[0], '--directory', 'Provide --directory and the extracted application folder.');
const directory = path.resolve(argumentsList[1]);
const parity = await verifyPackagedSource(root, directory);
const executablePath = path.join(directory, 'RevolaMapDrawer.exe');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const fixture = validateDocument(createExampleDocument());
const input = path.join(artifacts, 'portable-fixture.revola.json');
const output = path.join(artifacts, 'portable-saved.revola.json');
await fs.writeFile(input, JSON.stringify(fixture));
await fs.rm(output, { force: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath, cwd: directory, env });
try {
  await app.evaluate(({ dialog }, { input, output }) => {
    const opens = [input, output];
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [opens.shift()] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, { input, output });
  const page = await app.firstWindow();
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await expect(page.locator('#status-message')).not.toHaveText('Preparing workspace…');
  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('#graph-stats')).toHaveText('0 walls · 0 doors');
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), parity.version);
  const entry = new URL(page.url());
  assert.equal(entry.protocol, 'file:');
  assert.ok(fileURLToPath(entry).toLowerCase().startsWith(`${directory}${path.sep}`.toLowerCase()), 'The editor must load from the extracted application folder.');
  await page.locator('#open-button').click();
  await expect(page.locator('#map-name')).toHaveValue(fixture.name);
  await page.locator('#project-button').click();
  await expect.poll(() => fs.stat(output).then(stat => stat.size).catch(() => 0)).toBeGreaterThan(100);
  assert.deepEqual(validateDocument(JSON.parse(await fs.readFile(output, 'utf8'))), fixture);
  await page.locator('#new-button').click();
  await expect(page.locator('#graph-stats')).toHaveText('0 walls · 0 doors');
  await page.locator('#open-button').click();
  await expect(page.locator('#map-name')).toHaveValue(fixture.name);
  await expect(page.locator('#status-message')).not.toHaveClass(/error/);
  await page.screenshot({ path: path.join(artifacts, 'portable-editor.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter(url => /^https?:/i.test(url)), [], 'Portable map editing must not request a network server.');
  const evidence = { ...parity, executablePath, location: page.url(), nativeSaveReopen: true, exactGraphRoundTrip: true, walls: fixture.edges.length, rendererErrors: errors, networkRequests: 0 };
  await fs.writeFile(path.join(artifacts, 'portable-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await app.close();
}
