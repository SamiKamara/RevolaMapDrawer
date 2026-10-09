import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildWeb } from '../scripts/build-web.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('web build contains only hashed browser runtime, notices and a bounded offline shell', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'revola-web-test-'));
  t.after(async () => {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(temporary, { recursive: true, force: true });
  });
  const outputDirectory = path.join(temporary, 'output');
  await fs.mkdir(outputDirectory); await fs.writeFile(path.join(outputDirectory, 'private-map.revola.json'), 'must not be deployed');
  await assert.rejects(buildWeb({ root, outputDirectory, metricsFile: null }), /unrelated/);
  assert.equal(await fs.readFile(path.join(outputDirectory, 'private-map.revola.json'), 'utf8'), 'must not be deployed');
  await fs.rm(path.join(outputDirectory, 'private-map.revola.json'));
  const manifest = await buildWeb({ root, outputDirectory, metricsFile: null });
  const actualFiles = (await fs.readdir(outputDirectory, { recursive: true, withFileTypes: true }))
    .filter(item => item.isFile()).map(item => path.relative(outputDirectory, path.join(item.parentPath, item.name)).replaceAll(path.sep, '/')).sort();
  assert.deepEqual(actualFiles, manifest.assets.map(item => item.path).sort());
  assert.deepEqual(actualFiles.filter(name => !name.startsWith('assets/')), ['LICENSE-RevolaMapDrawer.txt', 'index.html', 'sw.js']);
  assert.equal(actualFiles.length, 8);
  const expectedNames = ['app', 'style', 'register', 'ship', 'editor-stars'];
  for (const name of expectedNames) assert.equal(actualFiles.filter(file => file.startsWith(`assets/${name}.`)).length, 1, name);
  for (const asset of manifest.assets) {
    const bytes = await fs.readFile(path.join(outputDirectory, asset.path));
    assert.equal(sha256(bytes), asset.sha256); assert.equal(bytes.length, asset.bytes);
    if (asset.path.startsWith('assets/')) assert.match(asset.path, new RegExp(`\\.${asset.sha256.slice(0, 16)}\\.(js|css|png)$`));
  }
  for (const name of ['ship', 'editor-stars']) {
    const asset = manifest.assets.find(item => item.source === `assets/${name}.png`);
    assert.ok((await fs.readFile(path.join(outputDirectory, asset.path))).equals(await fs.readFile(path.join(root, asset.source))), `${name} artwork bytes retain exact dimensions, transparency and scale`);
  }
  assert.ok((await fs.readFile(path.join(outputDirectory, 'LICENSE-RevolaMapDrawer.txt'))).equals(await fs.readFile(path.join(root, 'LICENSE'))));
  const html = await fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8');
  const app = await fs.readFile(path.join(outputDirectory, manifest.assets.find(item => item.path.startsWith('assets/app.')).path), 'utf8');
  assert.match(html, /lang="en"/); assert.ok(!html.includes('src/app.js') && !html.includes('src/style.css'));
  for (const reference of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) assert.ok(manifest.shell.includes(reference[1]), `HTML reference ${reference[1]} is installed offline`);
  assert.ok(!/(?:from\s*["']|import\s*\()["']?\.\.?\//.test(app), 'App does not depend on uncached relative module chunks');
  assert.ok(!app.includes('../assets/ship.png') && !app.includes('../assets/editor-stars.png'));
  for (const lazy of manifest.lazyAssets) assert.ok(!manifest.shell.includes(lazy), 'Optional stars are never prefetched');
  assert.equal(manifest.lazyAssets.length, 1); assert.match(manifest.lazyAssets[0], /editor-stars\.[a-f0-9]{16}\.png$/);
  assert.ok(manifest.shell.includes('/index.html') && manifest.shell.some(name => name.includes('/ship.')));
  assert.ok(manifest.totals.firstVisit.brotliBytes < 250_000, 'Complete initial shell stays below the static transfer budget');
  const second = await buildWeb({ root, outputDirectory, metricsFile: null });
  assert.deepEqual(second, manifest, 'Identical source produces identical URLs and worker cache identity');
});

test('web builder refuses maintained source directories and checkout ancestors as output', async () => {
  for (const outputDirectory of [root, path.dirname(root), path.parse(root).root, path.join(root, 'src'), path.join(root, 'assets', 'nested'), path.join(root, '.git'), ...(process.platform === 'win32' ? [root.toUpperCase(), path.join(root, 'SRC')] : [])]) {
    await assert.rejects(buildWeb({ root, outputDirectory, metricsFile: null }), /separate generated directory/);
  }
});

test('web builder rejects a junction/symlink output without touching its destination', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'revola-web-link-'));
  t.after(async () => { assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(temporary, { recursive: true, force: true }); });
  const target = path.join(temporary, 'preserved'), link = path.join(temporary, 'redirected');
  await fs.mkdir(target); await fs.writeFile(path.join(target, 'valuable.txt'), 'preserve this file');
  await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(buildWeb({ root, outputDirectory: path.join(link, 'output'), metricsFile: null }), /only real directories/);
  assert.equal(await fs.readFile(path.join(target, 'valuable.txt'), 'utf8'), 'preserve this file');
  assert.deepEqual(await fs.readdir(target), ['valuable.txt']);
});

test('Vercel serves immutable hashed assets and revalidates shell/worker with self-only resources', async () => {
  const config = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.framework, null); assert.equal(config.outputDirectory, 'web-dist'); assert.equal(config.buildCommand, 'npm run build:web');
  assert.match(config.installCommand, /ELECTRON_SKIP_BINARY_DOWNLOAD=1/);
  const headers = pathname => Object.fromEntries(config.headers.filter(rule => new RegExp(`^${rule.source.replaceAll(':path*', '.*')}$`).test(pathname)).flatMap(rule => rule.headers.map(({ key, value }) => [key, value])));
  for (const pathname of ['/', '/index.html', '/sw.js']) assert.match(headers(pathname)['Cache-Control'], /max-age=0.*must-revalidate/);
  assert.match(headers('/assets/app.1234567890abcdef.js')['Cache-Control'], /max-age=31536000.*immutable/);
  assert.equal(headers('/sw.js')['Service-Worker-Allowed'], '/');
  const policy = headers('/')['Content-Security-Policy'];
  for (const directive of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "worker-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) assert.ok(policy.includes(directive));
  assert.ok(!policy.includes('https:') && !policy.includes('unsafe-inline'));
  assert.ok(!config.rewrites && !config.redirects && !config.functions, 'Deployment serves static files without API traffic or blanket HTML fallback');
});

async function workerHarness({ wrongHtml = false } = {}) {
  const origin = 'https://revola.example', listeners = new Map(), storage = new Map(), network = [];
  const shell = ['/index.html', '/assets/app.aaa.js', '/assets/ship.bbb.png'], lazy = ['/assets/editor-stars.ccc.png'];
  let offline = false, failurePath;
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).pathname;
  const response = (body, ok = true, type = 'basic') => ({ body, ok, type, async arrayBuffer() { return new TextEncoder().encode(body).buffer; }, clone() { return response(body, ok, type); } });
  const fetch = async request => {
    const pathname = key(request); network.push(pathname);
    if (offline || pathname === failurePath) throw new Error('Network unavailable');
    return response(`downloaded:${pathname}`);
  };
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const contents = storage.get(name);
      return {
        async match(request) { return contents.get(key(request)); },
        async put(request, value) { contents.set(key(request), value); },
        async addAll(requests) {
          const values = await Promise.all(requests.map(fetch));
          requests.forEach((request, index) => contents.set(key(request), values[index]));
        },
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
  };
  class Request {
    constructor(url, options = {}) { this.url = new URL(url, origin).href; this.method = options.method ?? 'GET'; this.mode = options.mode ?? 'cors'; this.cache = options.cache ?? 'default'; }
  }
  const forced = { skipWaiting: 0, claim: 0 };
  const self = { location: { origin }, addEventListener(name, handler) { listeners.set(name, handler); }, skipWaiting() { forced.skipWaiting++; }, clients: { claim() { forced.claim++; } } };
  const source = (await fs.readFile(path.join(root, 'web', 'service-worker.js'), 'utf8'))
    .replace('__BUILD_ID__', 'test').replace('__SHELL_URLS__', JSON.stringify(shell)).replace('__LAZY_URLS__', JSON.stringify(lazy))
    .replace('__HTML_SHA256__', JSON.stringify(sha256(Buffer.from(wrongHtml ? 'another deployment' : 'downloaded:/index.html'))));
  vm.runInNewContext(source, { self, caches, Request, URL, fetch, crypto: webcrypto, Uint8Array });
  return { network, storage, shell, lazy, forced, setOffline(value) { offline = value; }, fail(pathname) { failurePath = pathname; },
    async dispatch(name, request) {
      let pending, result;
      listeners.get(name)({ request, waitUntil(promise) { pending = promise; }, respondWith(promise) { result = promise; } });
      await pending; return result === undefined ? undefined : await result;
    }, request: (url, options) => new Request(url, options) };
}

test('worker installs core files only, caches optional stars once and stays usable offline', async () => {
  const worker = await workerHarness();
  await worker.dispatch('install'); assert.deepEqual(worker.network, worker.shell);
  const visits = worker.network.length;
  assert.match((await worker.dispatch('fetch', worker.request('/', { mode: 'navigate' }))).body, /index.html/);
  assert.match((await worker.dispatch('fetch', worker.request(worker.shell[1]))).body, /app.aaa.js/);
  assert.equal(worker.network.length, visits, 'Navigation and immutable runtime read local storage');
  await worker.dispatch('fetch', worker.request(worker.lazy[0]));
  await worker.dispatch('fetch', worker.request(worker.lazy[0]));
  assert.equal(worker.network.filter(name => name === worker.lazy[0]).length, 1);
  worker.setOffline(true);
  assert.ok(await worker.dispatch('fetch', worker.request('/index.html', { mode: 'navigate' })));
  assert.ok(await worker.dispatch('fetch', worker.request(worker.lazy[0])));
  assert.equal(worker.network.length, visits + 1);
  for (const request of [worker.request('/private-map.json'), worker.request('/unrelated', { mode: 'navigate' }), worker.request(worker.shell[1] + '?changed=1'), worker.request('https://third-party.example/assets/app.aaa.js'), worker.request(worker.shell[1], { method: 'POST' })]) {
    assert.equal(await worker.dispatch('fetch', request), undefined, 'Unrelated, query, third-party and write requests are not cached/intercepted');
  }
});

test('worker installation failure removes incomplete shell and activation preserves other applications', async () => {
  const worker = await workerHarness(); worker.fail(worker.shell[1]);
  await assert.rejects(worker.dispatch('install'), /Network unavailable/);
  assert.equal(worker.storage.has('revola-map-drawer-test'), false);
  worker.fail(undefined); await worker.dispatch('install');
  worker.storage.set('revola-map-drawer-old', new Map()); worker.storage.set('another-app', new Map());
  await worker.dispatch('activate');
  assert.deepEqual([...worker.storage.keys()].sort(), ['another-app', 'revola-map-drawer-test']);
  assert.deepEqual(worker.forced, { skipWaiting: 0, claim: 0 }, 'An update does not force replacement of open editors with unsaved maps');
  const mismatched = await workerHarness({ wrongHtml: true });
  await assert.rejects(mismatched.dispatch('install'), /Deployment changed/);
  assert.equal(mismatched.storage.has('revola-map-drawer-test'), false, 'A worker never installs HTML from a different deployment');
});
