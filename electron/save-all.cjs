const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const formats = [
  { kind: 'png', layer: 'walls', suffix: '-walls.png', max: 32 * 1024 * 1024 },
  { kind: 'svg', layer: 'walls', suffix: '-walls.svg', max: 32 * 1024 * 1024 },
  { kind: 'png', layer: 'floor', suffix: '-floors.png', max: 32 * 1024 * 1024 },
  { kind: 'svg', layer: 'floor', suffix: '-floors.svg', max: 32 * 1024 * 1024 },
  { kind: 'project', layer: 'walls', suffix: '-source.revola', max: 4 * 1024 * 1024 },
];

function validateSaveAll(options) {
  if (!options || !Array.isArray(options.files) || options.files.length !== formats.length) throw new Error('Save all requires all five formats.');
  const name = options.suggestedName;
  if (typeof name !== 'string' || !name || name.length > 80 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..') throw new Error('Invalid export filename.');
  return formats.map((format, index) => {
    const file = options.files[index];
    if (!file || file.kind !== format.kind || file.layer !== format.layer) throw new Error('Save all requires each supported format once.');
    if (!Array.isArray(file.bytes) || !file.bytes.length || file.bytes.length > format.max || file.bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('The file data is invalid or exceeds the save limit.');
    return { name: name + format.suffix, bytes: Buffer.from(file.bytes) };
  });
}

async function existingFileNames(directory, files, io = fs) {
  const existing = [];
  for (const file of files) {
    try {
      const info = await io.lstat(path.join(directory, file.name));
      if (!info.isFile()) throw new Error(`The destination ${file.name} is not a regular file.`);
      existing.push(file.name);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return existing;
}

const noHardLinks = error => ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error.code);
async function restoreOriginal(file, io) {
  try { await io.link(file.backup, file.target); }
  catch (error) {
    if (!noHardLinks(error)) throw error;
    await io.copyFile(file.backup, file.target, fs.constants.COPYFILE_EXCL);
  }
  await io.unlink(file.backup);
}

// Prepare every file before touching destinations. Keep originals beside their
// replacements until the complete set is installed so failed writes can roll back.
async function writeFileSet(directory, files, { io = fs, existing = [] } = {}) {
  const token = randomUUID(), originalNames = new Set(existing);
  const records = files.map(file => ({ ...file, target: path.join(directory, file.name),
    staged: path.join(directory, `.${file.name}.${token}.tmp`),
    backup: path.join(directory, `.${file.name}.${token}.bak`), moved: false, installed: false }));
  let completed = false;
  try {
    for (const file of records) await io.writeFile(file.staged, file.bytes, { flag: 'wx' });
    // Check again after staging. A new file must never be overwritten without
    // the confirmation that applied to the original destination set.
    const current = await existingFileNames(directory, files, io);
    if (current.some(name => !originalNames.has(name))) throw new Error('A destination file appeared while saving. Please try again.');
    for (const file of records) if (current.includes(file.name)) {
      await io.rename(file.target, file.backup); file.moved = true;
    }
    // A hard link installs the already-complete bytes exclusively: even a file
    // appearing between the recheck and installation cannot be overwritten.
    for (const file of records) {
      try { await io.link(file.staged, file.target); file.installed = true; }
      catch (error) {
        // FAT/exFAT and some network shares do not support hard links. Keep
        // exclusive creation there too; track partial writes for rollback.
        if (!noHardLinks(error)) throw error;
        const handle = await io.open(file.target, 'wx'); file.installed = true;
        try { await handle.writeFile(file.bytes); }
        finally { await handle.close(); }
      }
    }
    completed = true;
  } catch (error) {
    const failures = [];
    for (const file of [...records].reverse()) {
      try {
        if (file.installed) await io.unlink(file.target);
        // Never replace a new file written by somebody else during rollback.
        // Keep the backup and report a conflict when exclusive restore fails.
        if (file.moved) await restoreOriginal(file, io);
      } catch (failure) { failures.push(failure); }
    }
    if (failures.length) throw new Error(`${error.message} Some originals could not be restored; keep the .bak files in ${directory}.`);
    throw error;
  } finally {
    for (const file of records) {
      await io.unlink(file.staged).catch(() => {});
      // If backup cleanup fails, preserve the successfully saved set and leave
      // the recoverable original rather than undoing a completed transaction.
      if (completed && file.moved) await io.unlink(file.backup).catch(() => {});
    }
  }
  return { directory, paths: records.map(file => file.target) };
}

module.exports = { validateSaveAll, existingFileNames, writeFileSet };
