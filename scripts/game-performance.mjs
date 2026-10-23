// Repeatable offscreen-host measurements. Outputs stay under ignored artifacts/.
import { _electron as electron, expect } from '@playwright/test';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, addWall } from '../src/model.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const option = key => process.argv.find(value => value.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
let project = createDocument();
const points = [[3739.5,4740],[3739.5,4400],[2000,4400],[2000,1000],[6500,1000],[6500,4400],[4452.5,4400],[4452.5,4740]];
for (let i = 1; i < points.length; i++) addWall(project, {x:points[i-1][0],y:points[i-1][1]}, {x:points[i][0],y:points[i][1]}, {joinTolerance:0});
if (option('project')) project = JSON.parse(await fs.readFile(option('project'), 'utf8'));
const token = crypto.randomBytes(32).toString('hex');
let socket, frameBytes = 0, frameCount = 0;
const send = value => { const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(5); header.writeUInt32LE(body.length + 1); header[4] = 1; socket.write(Buffer.concat([header, body])); };
const server = net.createServer(connection => {
  socket = connection;
  let remaining = 0, kind = -1, headerOffset = 0, count = 0, chunks = [];
  const header = Buffer.alloc(4);
  connection.on('data', bytes => {
    let offset = 0;
    while (offset < bytes.length) {
      if (!remaining) {
        const size = Math.min(4 - headerOffset, bytes.length - offset);
        bytes.copy(header, headerOffset, offset, offset + size); headerOffset += size; offset += size;
        if (headerOffset < 4) continue;
        remaining = count = header.readUInt32LE(0); headerOffset = 0; kind = -1; chunks = [];
      }
      if (offset === bytes.length) continue;
      if (kind === -1) { kind = bytes[offset++]; remaining--; }
      const size = Math.min(remaining, bytes.length - offset);
      if (kind === 1) chunks.push(bytes.subarray(offset, offset + size));
      offset += size; remaining -= size;
      if (remaining) continue;
      if (kind === 2) { frameCount++; frameBytes += count - 9; send({ type: 'frame-ack' }); continue; }
      const message = JSON.parse(Buffer.concat(chunks));
      if (message.type === 'hello') send({ type: 'resize', width: 1920, height: 1080 });
      if (message.type === 'request') send({ type: 'response', id: message.id, payload: JSON.stringify(message.operation === 'initial' ? { project: JSON.stringify(project), name: 'benchmark.revola' } : null) });
    }
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [root, `--revola-game=${server.address().port}:${token}`], env });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await app.firstWindow();
  await expect(page.locator('#map-name')).toHaveValue(project.name);
  await expect(page.locator('#game-launch')).toBeEnabled({ timeout: 30000 });
  await delay(1000);
  const imageHash = await page.evaluate(async () => {
    const canvas = document.getElementById('map-canvas');
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  const cpu = () => app.evaluate(({ app }) => app.getAppMetrics().map(({ type, cpu }) => ({ type, seconds: cpu.cumulativeCPUUsage, percent: cpu.percentCPUUsage })));
  async function measure(name, action) {
    const before = await cpu(), frames = frameCount, bytes = frameBytes, start = performance.now();
    await cdp.send('Profiler.start');
    await action();
    const { profile } = await cdp.send('Profiler.stop'), seconds = (performance.now() - start) / 1000, after = await cpu();
    const counts = new Map(); for (const id of profile.samples || []) counts.set(id, (counts.get(id) || 0) + 1);
    return { name, seconds, frames: frameCount - frames, megabytes: (frameBytes - bytes) / 1e6,
      cpu: after.map((value, i) => ({ type: value.type, seconds: value.seconds - (before[i]?.seconds || 0), percent: value.percent })),
      hot: profile.nodes.map(({ id, callFrame }) => ({ function: callFrame.functionName, url: callFrame.url.split('/').at(-1), samples: counts.get(id) || 0 })).filter(value => value.samples).sort((a,b) => b.samples-a.samples).slice(0,12) };
  }
  const idle = await measure('idle', () => delay(2000));
  const box = await page.locator('#map-canvas').boundingBox();
  const active = await measure('pointer hover', async () => {
    for (let i = 0; i < 180; i++) {
      send({ type: 'input', event: { type: 'mouseMove', x: Math.round(box.x + box.width * (.5 + .3 * Math.sin(i / 15))), y: Math.round(box.y + box.height * (.5 + .3 * Math.cos(i / 15))) } });
      await delay(1000 / 60);
    }
    await delay(200);
  });
  const result = { walls: project.edges.length, imageHash, viewport: await page.evaluate(() => [innerWidth, innerHeight]), idle, active };
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts', `game-performance-${option('label') || 'current'}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { socket?.destroy(); await app.close(); server.close(); }
