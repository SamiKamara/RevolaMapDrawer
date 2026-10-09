import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const copyrightNotice = '/*! Revola Map Drawer | Copyright (c) 2026 SamiKamara | MIT | /LICENSE-RevolaMapDrawer.txt */';
export const webContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const versionedName = (name, extension, bytes) => `assets/${name}.${digest(bytes).slice(0, 16)}.${extension}`;

async function verifyOutputDirectory(root, outputDirectory) {
  const normalized = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const target = normalized(outputDirectory), checkout = normalized(root);
  const protectedDirectories = ['src', 'assets', 'web', 'scripts', 'tests', 'docs', 'electron', '.git', 'node_modules'].map(name => normalized(path.join(root, name)));
  if (target === checkout || checkout.startsWith(target + path.sep) || target === normalized(path.parse(outputDirectory).root) || protectedDirectories.some(directory => target === directory || target.startsWith(directory + path.sep))) {
    throw new Error('Web output must be a separate generated directory, never source or its ancestor.');
  }
  // Check every existing path component before the recursive removal. A Windows
  // junction is a symbolic link for lstat and must not redirect build cleanup.
  let component = path.parse(outputDirectory).root;
  for (const part of path.relative(component, outputDirectory).split(path.sep).filter(Boolean)) {
    component = path.join(component, part);
    try {
      const metadata = await fs.lstat(component);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('Web output path must contain only real directories.');
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  let entries;
  try { entries = await fs.readdir(outputDirectory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!entries.length) return;
  const expectedFiles = new Set(['index.html', 'sw.js', 'LICENSE-RevolaMapDrawer.txt']);
  for (const entry of entries) {
    if (entry.isSymbolicLink() || (entry.name === 'assets' ? !entry.isDirectory() : !entry.isFile() || !expectedFiles.has(entry.name))) throw new Error('Refusing to replace an unrelated web output directory.');
  }
  if (!entries.some(entry => entry.name === 'sw.js') || !(await fs.readFile(path.join(outputDirectory, 'sw.js'), 'utf8')).includes('revola-map-drawer-')) throw new Error('Existing web output is not owned by this builder.');
  for (const entry of await fs.readdir(path.join(outputDirectory, 'assets'), { withFileTypes: true })) {
    const match = entry.name.match(/^(?:app|style|register|ship|editor-stars)\.([a-f0-9]{16})\.(?:js|css|png)$/);
    if (!entry.isFile() || !match || digest(await fs.readFile(path.join(outputDirectory, 'assets', entry.name))).slice(0, 16) !== match[1]) throw new Error('Existing web assets contain unrelated or altered files.');
  }
}

/** Build only the browser runtime. PNGs retain their original bytes and geometry. */
export async function buildWeb({ root = repositoryRoot, outputDirectory = path.join(root, 'web-dist'), metricsFile = path.join(root, 'artifacts', 'web-build.json') } = {}) {
  root = path.resolve(root);
  outputDirectory = path.resolve(outputDirectory);
  await verifyOutputDirectory(root, outputDirectory);
  const packageManifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const outputFiles = new Map();
  const sourceNames = new Map();
  const pngUrls = new Map();
  const addFile = (file, bytes, source) => {
    outputFiles.set(file, Buffer.from(bytes));
    if (source) sourceNames.set(file, source);
    return file;
  };
  for (const name of ['ship', 'editor-stars']) {
    const source = `assets/${name}.png`;
    const bytes = await fs.readFile(path.join(root, source));
    const file = addFile(versionedName(name, 'png', bytes), bytes, source);
    pngUrls.set(`../${source}`, `./${path.posix.basename(file)}`);
  }

  const app = await esbuild.build({
    absWorkingDir: root, entryPoints: ['src/app.js'], bundle: true, write: false,
    format: 'esm', platform: 'browser', target: ['chrome120', 'firefox121', 'safari17'],
    minify: true, legalComments: 'none', banner: { js: copyrightNotice },
    plugins: [{
      name: 'versioned-png-urls',
      setup(build) {
        build.onLoad({ filter: /\.js$/ }, async ({ path: filename }) => {
          let source = await fs.readFile(filename, 'utf8');
          source = source.replace(/new URL\(\s*(['"])(\.\.\/assets\/[^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g, (expression, quote, asset) => {
            const hashedUrl = pngUrls.get(asset);
            if (!hashedUrl) throw new Error(`Unrecognized browser image asset: ${asset}`);
            return `new URL(${JSON.stringify(hashedUrl)}, import.meta.url)`;
          });
          return { contents: source, loader: 'js', resolveDir: path.dirname(filename) };
        });
      },
    }],
  });
  if (app.outputFiles.length !== 1) throw new Error('Web app must emit one self-contained module; review offline caching before introducing chunks.');
  const appFile = addFile(versionedName('app', 'js', app.outputFiles[0].contents), app.outputFiles[0].contents, 'src/app.js (bundled)');
  const css = await esbuild.transform(await fs.readFile(path.join(root, 'src', 'style.css'), 'utf8'), { loader: 'css', minify: true, legalComments: 'none', banner: copyrightNotice, target: ['chrome120', 'firefox121', 'safari17'] });
  const cssFile = addFile(versionedName('style', 'css', css.code), css.code, 'src/style.css');
  const register = await esbuild.transform(await fs.readFile(path.join(root, 'web', 'register.js'), 'utf8'), { loader: 'js', minify: true, legalComments: 'none', target: 'es2022' });
  const registerFile = addFile(versionedName('register', 'js', register.code), register.code, 'web/register.js');
  addFile('LICENSE-RevolaMapDrawer.txt', await fs.readFile(path.join(root, 'LICENSE')), 'LICENSE');

  let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  if (!html.includes('href="src/style.css"') || !html.includes('src="src/app.js"')) throw new Error('Browser entry markup changed; update the static builder.');
  html = html.replace('href="src/style.css"', `href="/${cssFile}"`)
    .replace('src="src/app.js"', `src="/${appFile}"`)
    .replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/, `$1${webContentSecurityPolicy}$2`)
    .replace('</head>', '<link rel="icon" href="data:,"></head>')
    .replace('</body>', `<script type="module" src="/${registerFile}"></script></body>`)
    .replace(/>\s+</g, '><').trim() + '\n';
  addFile('index.html', html, 'index.html (web entry)');

  // Cache every module needed by open tabs before installation succeeds. Stars
  // are deliberately omitted: their larger image is fetched only on closure.
  const shell = ['/index.html', `/${appFile}`, `/${cssFile}`, `/${registerFile}`, `/${[...outputFiles.keys()].find(file => sourceNames.get(file) === 'assets/ship.png')}`, '/LICENSE-RevolaMapDrawer.txt'];
  const lazyAssets = [`/${[...outputFiles.keys()].find(file => sourceNames.get(file) === 'assets/editor-stars.png')}`];
  const serviceWorkerTemplate = await fs.readFile(path.join(root, 'web', 'service-worker.js'), 'utf8');
  const buildId = digest([...outputFiles].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([file, bytes]) => `${file}:${digest(bytes)}`).join('\n') + `\nworker:${digest(serviceWorkerTemplate)}\nesbuild:${esbuild.version}`).slice(0, 16);
  const serviceWorkerSource = serviceWorkerTemplate
    .replace('__BUILD_ID__', buildId)
    .replace('__SHELL_URLS__', JSON.stringify(shell))
    .replace('__LAZY_URLS__', JSON.stringify(lazyAssets))
    .replace('__HTML_SHA256__', JSON.stringify(digest(outputFiles.get('index.html'))));
  const serviceWorker = await esbuild.transform(serviceWorkerSource, { loader: 'js', minify: true, legalComments: 'none', target: 'es2022' });
  addFile('sw.js', serviceWorker.code, 'web/service-worker.js (generated)');

  await verifyOutputDirectory(root, outputDirectory);
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDirectory, 'assets'), { recursive: true });
  for (const [file, bytes] of outputFiles) await fs.writeFile(path.join(outputDirectory, file), bytes);
  const assets = [...outputFiles].map(([file, bytes]) => ({
    path: file, source: sourceNames.get(file), sha256: digest(bytes), bytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
  })).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  // Hosting platforms normally compress text, while serving PNGs unchanged.
  // Keep analytical per-file compression above; estimates use actual PNG size.
  const sum = paths => paths.reduce((total, url) => {
    const asset = assets.find(candidate => '/' + candidate.path === url);
    const image = asset.path.endsWith('.png');
    return { bytes: total.bytes + asset.bytes, gzipBytes: total.gzipBytes + (image ? asset.bytes : asset.gzipBytes), brotliBytes: total.brotliBytes + (image ? asset.bytes : asset.brotliBytes) };
  }, { bytes: 0, gzipBytes: 0, brotliBytes: 0 });
  const metrics = {
    version: packageManifest.version, buildId, assets, shell, lazyAssets,
    transferEstimateAssumptions: ['Text responses use the stated compression; PNG responses use their preserved raw bytes.', 'First root visit includes the installer fetching index.html once more. Headers and worker update checks are excluded.'],
    totals: { firstVisit: sum([...shell, '/sw.js', '/index.html']), uniqueShell: sum([...shell, '/sw.js']), allAssets: sum(assets.map(asset => '/' + asset.path)), lazyAssets: sum(lazyAssets) },
  };
  if (metricsFile) {
    await fs.mkdir(path.dirname(metricsFile), { recursive: true });
    await fs.writeFile(metricsFile, JSON.stringify(metrics, null, 2) + '\n');
  }
  return metrics;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arguments_ = process.argv.slice(2);
  const outIndex = arguments_.indexOf('--out-dir');
  if (arguments_.length && (outIndex !== 0 || arguments_.length !== 2 || !arguments_[1])) throw new Error('Usage: node scripts/build-web.mjs [--out-dir DIRECTORY]');
  console.log(JSON.stringify(await buildWeb(outIndex === 0 ? { outputDirectory: arguments_[1] } : undefined), null, 2));
}
