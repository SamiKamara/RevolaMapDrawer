import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The renderer already runs without Electron. Publish only its runtime files.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist', 'web');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'src', 'assets', 'LICENSE']) {
  await cp(path.join(root, name), path.join(destination, name), { recursive: true });
}
console.log('Static browser build: dist/web/ (serve via HTTP or HTTPS; not file://)');
