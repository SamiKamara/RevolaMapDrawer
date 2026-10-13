// ZIP's stored method preserves the existing five export files byte for byte.
// One download also works in browsers that block automatic multiple downloads.
const crcTable = new Uint32Array(256);
for (let value = 0; value < 256; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  crcTable[value] = crc >>> 0;
}
function checksum(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

export const SAVE_ALL_FORMATS = Object.freeze([
  { kind: 'png', layer: 'walls', suffix: '-walls.png' },
  { kind: 'svg', layer: 'walls', suffix: '-walls.svg' },
  { kind: 'png', layer: 'floor', suffix: '-floors.png' },
  { kind: 'svg', layer: 'floor', suffix: '-floors.svg' },
  { kind: 'project', layer: 'walls', suffix: '-source.revola' },
]);

export function createExportZip(files) {
  if (!Array.isArray(files) || files.length !== SAVE_ALL_FORMATS.length) throw new Error('Save all requires all five formats.');
  const encoder = new TextEncoder(), names = new Set();
  let offset = 0, directorySize = 0;
  const records = files.map(file => {
    if (typeof file.name !== 'string' || !file.name || /[/\\\x00]/.test(file.name) || names.has(file.name)) throw new Error('Invalid export filename.');
    names.add(file.name);
    if (!(file.bytes instanceof Uint8Array) || !file.bytes.length) throw new Error('Invalid export data.');
    const name = encoder.encode(file.name);
    if (name.length > 65535 || file.bytes.length > 0xffffffff) throw new Error('The export is too large for a ZIP archive.');
    const record = { ...file, nameBytes: name, crc: checksum(file.bytes), offset };
    offset += 30 + name.length + file.bytes.length;
    directorySize += 46 + name.length;
    return record;
  });
  if (offset + directorySize + 22 > 0xffffffff) throw new Error('The export is too large for a ZIP archive.');
  const bytes = new Uint8Array(offset + directorySize + 22), view = new DataView(bytes.buffer);
  const word = (at, value) => view.setUint16(at, value, true);
  const dword = (at, value) => view.setUint32(at, value, true);
  for (const file of records) {
    const at = file.offset;
    dword(at, 0x04034b50); word(at + 4, 20); word(at + 6, 0x0800);
    // Fixed DOS date 1980-01-01 keeps identical exports reproducible.
    word(at + 12, 0x0021); dword(at + 14, file.crc);
    dword(at + 18, file.bytes.length); dword(at + 22, file.bytes.length); word(at + 26, file.nameBytes.length);
    bytes.set(file.nameBytes, at + 30); bytes.set(file.bytes, at + 30 + file.nameBytes.length);
  }
  let at = offset;
  for (const file of records) {
    dword(at, 0x02014b50); word(at + 4, 20); word(at + 6, 20); word(at + 8, 0x0800);
    word(at + 14, 0x0021); dword(at + 16, file.crc);
    dword(at + 20, file.bytes.length); dword(at + 24, file.bytes.length); word(at + 28, file.nameBytes.length);
    dword(at + 42, file.offset); bytes.set(file.nameBytes, at + 46);
    at += 46 + file.nameBytes.length;
  }
  dword(at, 0x06054b50); word(at + 8, records.length); word(at + 10, records.length);
  dword(at + 12, directorySize); dword(at + 16, offset);
  return bytes;
}
