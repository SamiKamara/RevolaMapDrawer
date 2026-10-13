import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { SAVE_ALL_FORMATS, createExportZip } from '../src/save-all.js';

const { validateSaveAll, existingFileNames, writeFileSet } = createRequire(import.meta.url)('../electron/save-all.cjs');
const options = () => ({ suggestedName: 'Station — 船', files: SAVE_ALL_FORMATS.map((format, index) => ({ kind: format.kind, layer: format.layer, bytes: [index, 42, 255] })) });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function unpack(zip) {
  const bytes = Buffer.from(zip), end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 8), 5); assert.equal(bytes.readUInt16LE(end + 10), 5);
  const files = [], centralStart = bytes.readUInt32LE(end + 16);
  let at = centralStart;
  for (let index = 0; index < 5; index++) {
    assert.equal(bytes.readUInt32LE(at), 0x02014b50); assert.equal(bytes.readUInt16LE(at + 8), 0x0800);
    assert.equal(bytes.readUInt16LE(at + 10), 0); assert.equal(bytes.readUInt16LE(at + 14), 0x0021);
    const size = bytes.readUInt32LE(at + 20), length = bytes.readUInt16LE(at + 28), local = bytes.readUInt32LE(at + 42);
    const name = bytes.toString('utf8', at + 46, at + 46 + length);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50); assert.equal(bytes.readUInt16LE(local + 6), 0x0800);
    assert.equal(bytes.readUInt16LE(local + 8), 0); assert.equal(bytes.readUInt16LE(local + 12), 0x0021);
    assert.equal(bytes.toString('utf8', local + 30, local + 30 + length), name);
    assert.equal(bytes.readUInt32LE(local + 18), size); assert.equal(bytes.readUInt32LE(local + 22), size);
    const data = bytes.subarray(local + 30 + length, local + 30 + length + size);
    assert.equal(crc32(data), bytes.readUInt32LE(at + 16)); assert.equal(crc32(data), bytes.readUInt32LE(local + 14));
    files.push({ name, bytes: data }); at += 46 + length;
  }
  assert.equal(at, end); assert.equal(end - centralStart, bytes.readUInt32LE(end + 12));
  return files;
}
async function directory(t) {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'revola-save-all-'));
  t.after(() => fs.rm(target, { recursive: true, force: true })); return target;
}
async function originals(target, files) {
  for (const [index, file] of files.entries()) await fs.writeFile(path.join(target, file.name), `original ${index}`);
}
async function assertOriginals(target, files) {
  for (const [index, file] of files.entries()) assert.equal(await fs.readFile(path.join(target, file.name), 'utf8'), `original ${index}`);
  assert.deepEqual((await fs.readdir(target)).sort(), files.map(file => file.name).sort());
}

test('Save all ZIP keeps all five suffixes and UTF-8 names with exact bytes and independent CRCs', () => {
  const files = validateSaveAll(options()), zip = createExportZip(files);
  const decoded = unpack(zip);
  assert.deepEqual(decoded, files); assert.deepEqual(createExportZip(files), zip, 'Identical export sets produce deterministic archives');
  assert.deepEqual(files.map(file => file.name), SAVE_ALL_FORMATS.map(format => 'Station — 船' + format.suffix));
});
test('Save all ZIP rejects incomplete sets, unsafe/duplicate names and empty data', () => {
  const files = validateSaveAll(options());
  assert.throws(() => createExportZip(files.slice(1)), /five formats/);
  for (const name of ['bad/name', 'bad\\name', 'bad\0name', '']) assert.throws(() => createExportZip(files.map((file, index) => index ? file : { ...file, name })), /filename/);
  assert.throws(() => createExportZip(files.map((file, index) => index ? file : { ...file, name: files[1].name })), /filename/);
  assert.throws(() => createExportZip(files.map((file, index) => index ? file : { ...file, bytes: new Uint8Array() })), /data/);
});
test('Native Save all validates supported kinds, layers, names and bounded bytes before file access', () => {
  assert.equal(validateSaveAll(options()).length, 5);
  for (const suggestedName of ['../map', 'map/name', 'map.', 'map ', '', 'x'.repeat(81)]) assert.throws(() => validateSaveAll({ ...options(), suggestedName }), /filename/);
  assert.throws(() => validateSaveAll({ ...options(), files: options().files.slice(1) }), /five formats/);
  const wrong = options(); wrong.files[0].layer = 'floor'; assert.throws(() => validateSaveAll(wrong), /each supported format/);
  for (const bytes of [[-1], [256], [1.5], [], ['1'], new Uint8Array([1])]) {
    const malformed = options(); malformed.files[4].bytes = bytes; assert.throws(() => validateSaveAll(malformed), /invalid/);
  }
});
test('Native Save all installs the complete new set and leaves no temporary files', async t => {
  const target = await directory(t), files = validateSaveAll(options());
  assert.deepEqual(await existingFileNames(target, files), []);
  const result = await writeFileSet(target, files);
  assert.equal(result.directory, target); assert.equal(result.paths.length, 5);
  for (const file of files) assert.deepEqual(await fs.readFile(path.join(target, file.name)), file.bytes);
  assert.deepEqual((await fs.readdir(target)).sort(), files.map(file => file.name).sort());
});
test('Native Save all replaces only confirmed existing files and cleans recoverable backups', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await originals(target, files);
  const existing = await existingFileNames(target, files); assert.equal(existing.length, 5);
  await writeFileSet(target, files, { existing });
  for (const file of files) assert.deepEqual(await fs.readFile(path.join(target, file.name)), file.bytes);
  assert.deepEqual((await fs.readdir(target)).sort(), files.map(file => file.name).sort());
});
test('Filesystems without hard links use exclusive writes and keep the same five files', async t => {
  const target = await directory(t), files = validateSaveAll(options());
  const io = { ...fs, link: async () => { throw Object.assign(new Error('hard links unsupported'), { code: 'EPERM' }); } };
  await writeFileSet(target, files, { io });
  for (const file of files) assert.deepEqual(await fs.readFile(path.join(target, file.name)), file.bytes);
  assert.deepEqual((await fs.readdir(target)).sort(), files.map(file => file.name).sort());
});
test('Failed fallback writes roll back partial files on filesystems without hard links', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await originals(target, files); let count = 0;
  const io = { ...fs, link: async () => { throw Object.assign(new Error('hard links unsupported'), { code: 'ENOTSUP' }); },
    open: async (...args) => { const handle = await fs.open(...args); return {
      writeFile: async bytes => { await handle.writeFile(bytes.subarray(0, 1)); if (++count === 3) throw new Error('fallback disk full'); await handle.writeFile(bytes.subarray(1)); },
      close: () => handle.close(),
    }; } };
  await assert.rejects(writeFileSet(target, files, { existing: files.map(file => file.name), io }), /fallback disk full/);
  await assertOriginals(target, files);
});
test('Native Save all rejects destination directories and symlinks instead of replacing them', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await fs.mkdir(path.join(target, files[0].name));
  await assert.rejects(existingFileNames(target, files), /not a regular file/);
  const fake = { lstat: async () => ({ isFile: () => false }) }; await assert.rejects(existingFileNames(target, files, fake), /not a regular file/);
});
test('A staged write failure preserves every existing original', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await originals(target, files); let count = 0;
  const io = { ...fs, writeFile: async (...args) => { if (++count === 3) throw new Error('injected disk full'); return fs.writeFile(...args); } };
  await assert.rejects(writeFileSet(target, files, { existing: files.map(file => file.name), io }), /disk full/);
  await assertOriginals(target, files);
});
test('A failed backup rename restores every earlier original', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await originals(target, files); let count = 0;
  const io = { ...fs, rename: async (...args) => { if (++count === 3) throw new Error('injected access denied'); return fs.rename(...args); } };
  await assert.rejects(writeFileSet(target, files, { existing: files.map(file => file.name), io }), /access denied/);
  await assertOriginals(target, files);
});
test('A failed installation rolls back both partial new output and all originals', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await originals(target, files); let count = 0;
  const io = { ...fs, link: async (...args) => { if (++count === 3) throw new Error('injected install failure'); return fs.link(...args); } };
  await assert.rejects(writeFileSet(target, files, { existing: files.map(file => file.name), io }), /install failure/);
  await assertOriginals(target, files);
});
test('An unconfirmed file appearing during staging remains untouched', async t => {
  const target = await directory(t), files = validateSaveAll(options()); let count = 0;
  const io = { ...fs, writeFile: async (...args) => { await fs.writeFile(...args); if (++count === 3) await fs.writeFile(path.join(target, files[0].name), 'appeared'); } };
  await assert.rejects(writeFileSet(target, files, { io }), /appeared while saving/);
  assert.deepEqual(await fs.readdir(target), [files[0].name]); assert.equal(await fs.readFile(path.join(target, files[0].name), 'utf8'), 'appeared');
});
test('Exclusive installation never overwrites a file appearing after the final recheck', async t => {
  const target = await directory(t), files = validateSaveAll(options()); let count = 0;
  const io = { ...fs, link: async (...args) => { if (++count === 2) await fs.writeFile(args[1], 'racing writer'); return fs.link(...args); } };
  await assert.rejects(writeFileSet(target, files, { io }), { code: 'EEXIST' });
  assert.deepEqual(await fs.readdir(target), [files[1].name]); assert.equal(await fs.readFile(path.join(target, files[1].name), 'utf8'), 'racing writer');
});
test('Unrestorable backups are preserved and identified by the error', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await originals(target, files); let count = 0;
  const io = { ...fs, link: async (...args) => {
    if (args[0].endsWith('.bak') && args[1].endsWith(files[0].name)) throw new Error('injected restore failure');
    if (++count === 2) throw new Error('injected install failure'); return fs.link(...args);
  } };
  await assert.rejects(writeFileSet(target, files, { existing: files.map(file => file.name), io }), /Some originals could not be restored; keep the .bak files/);
  const backups = (await fs.readdir(target)).filter(file => file.endsWith('.bak')); assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(target, backups[0]), 'utf8'), 'original 0');
});
test('Rollback preserves a racing replacement and the confirmed original backup', async t => {
  const target = await directory(t), files = validateSaveAll(options()); await originals(target, files); let installed = 0;
  const io = { ...fs, link: async (...args) => {
    if (args[0].endsWith('.tmp') && ++installed === 2) await fs.writeFile(args[1], 'racing replacement');
    return fs.link(...args);
  } };
  await assert.rejects(writeFileSet(target, files, { existing: files.map(file => file.name), io }), /Some originals could not be restored/);
  assert.equal(await fs.readFile(path.join(target, files[1].name), 'utf8'), 'racing replacement');
  const backups = (await fs.readdir(target)).filter(file => file.endsWith('.bak')); assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(target, backups[0]), 'utf8'), 'original 1');
  for (const [index, file] of files.entries()) if (index !== 1) assert.equal(await fs.readFile(path.join(target, file.name), 'utf8'), `original ${index}`);
});
