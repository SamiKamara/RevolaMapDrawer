/** Editable PNG persistence. No DOM, Node, image decoding, or executable imports. */
export const MAX_PNG_BYTES = 32 * 1024 * 1024;
export const MAX_METADATA_BYTES = 4 * 1024 * 1024;
export const METADATA_KEYWORD = 'RevolaMap';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const keyword = encoder.encode(METADATA_KEYWORD);
const MAX_DIMENSION = 16384;
const MAX_PIXELS = MAX_DIMENSION * MAX_DIMENSION;
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('PNG data must be a byte array.');
}

function readPng(input) {
  const bytes = asBytes(input);
  if (bytes.length > MAX_PNG_BYTES) throw new Error('PNG exceeds the 32 MiB import limit.');
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((value, i) => bytes[i] !== value)) {
    throw new Error('This file is not a PNG image.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = SIGNATURE.length;
  let seenImage = false;
  let imageEnded = false;
  let seenEnd = false;
  while (offset < bytes.length) {
    if (chunks.length >= 100_000) throw new Error('PNG contains too many chunks.');
    if (bytes.length - offset < 12) throw new Error('PNG is truncated: incomplete chunk header.');
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error('PNG is truncated: invalid chunk length.');
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    if (typeBytes.some((c) => !((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) || (typeBytes[2] & 32)) {
      throw new Error('PNG contains an invalid chunk type.');
    }
    const type = String.fromCharCode(...typeBytes);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (view.getUint32(dataEnd) !== crc32(bytes, offset + 4, dataEnd)) {
      throw new Error(`PNG is damaged: ${type} checksum does not match.`);
    }
    if (chunks.length === 0 && type !== 'IHDR') throw new Error('PNG must begin with an IHDR chunk.');
    if (type === 'IHDR') {
      if (chunks.length || length !== 13) throw new Error('PNG has an invalid image header.');
      const width = view.getUint32(dataStart);
      const height = view.getUint32(dataStart + 4);
      if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
        throw new Error('PNG dimensions exceed the supported image limit.');
      }
      const depth = bytes[dataStart + 8];
      const color = bytes[dataStart + 9];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] > 1) {
        throw new Error('PNG has an unsupported image header.');
      }
    }
    if (type === 'IDAT') {
      if (imageEnded) throw new Error('PNG image data chunks must be consecutive.');
      seenImage = true;
    } else if (seenImage) {
      imageEnded = true;
    }
    if (type === 'IEND') {
      if (length !== 0 || !seenImage) throw new Error('PNG has an invalid image end.');
      if (dataEnd + 4 !== bytes.length) throw new Error('PNG contains unexpected data after its end.');
      seenEnd = true;
    }
    chunks.push({ type, start: offset, end: dataEnd + 4, data: bytes.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
  }
  if (!seenEnd) throw new Error('PNG is truncated: missing image end.');
  return { bytes, chunks };
}

function isRevolaMetadata(chunk) {
  return chunk.type === 'iTXt' && chunk.data.length > keyword.length &&
    chunk.data[keyword.length] === 0 && keyword.every((value, i) => chunk.data[i] === value);
}

/** Build a bounded PNG chunk, including its CRC. Shared by the streaming exporter. */
export function createPngChunk(type, payload = new Uint8Array(0)) {
  const data = asBytes(payload);
  if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type) || data.length > MAX_PNG_BYTES - 12) {
    throw new Error('Invalid PNG chunk type or size.');
  }
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(encoder.encode(type), 4);
  result.set(data, 8);
  view.setUint32(result.length - 4, crc32(result, 4, result.length - 4));
  return result;
}

function metadataChunk(jsonBytes) {
  // keyword NUL, compression flag/method, empty language NUL, empty translated keyword NUL.
  const payloadLength = keyword.length + 5 + jsonBytes.length;
  const payload = new Uint8Array(payloadLength);
  payload.set(keyword);
  payload.set(jsonBytes, keyword.length + 5);
  return createPngChunk('iTXt', payload);
}

/** Serialize bounded editable JSON before expensive image rendering begins. */
export function createPngMetadataChunk(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Editable map metadata must be a JSON object.');
  }
  let json;
  try { json = JSON.stringify(document); } catch { throw new Error('Editable map metadata cannot be serialized.'); }
  if (typeof json !== 'string' || !json.startsWith('{')) throw new Error('Editable map metadata must serialize to a JSON object.');
  if (typeof json !== 'string' || json.length > MAX_METADATA_BYTES) {
    throw new Error('Editable map metadata exceeds the 4 MiB limit.');
  }
  const jsonBytes = encoder.encode(json);
  if (jsonBytes.length > MAX_METADATA_BYTES) throw new Error('Editable map metadata exceeds the 4 MiB limit.');
  return metadataChunk(jsonBytes);
}

/** Return a PNG with one uncompressed UTF-8 RevolaMap iTXt chunk. */
export function encodePngMetadata(pngBytes, document) {
  const { bytes, chunks } = readPng(pngBytes);
  const metadataChunk = createPngMetadataChunk(document);
  const retainedChunks = chunks.filter((chunk) => !isRevolaMetadata(chunk));
  const size = SIGNATURE.length + metadataChunk.length + retainedChunks.reduce((sum, chunk) => sum + chunk.end - chunk.start, 0);
  if (size > MAX_PNG_BYTES) throw new Error('PNG with editable metadata exceeds the 32 MiB limit.');
  const output = new Uint8Array(size);
  output.set(SIGNATURE);
  let offset = SIGNATURE.length;
  for (const chunk of retainedChunks) {
    if (chunk.type === 'IEND') {
      output.set(metadataChunk, offset);
      offset += metadataChunk.length;
    }
    output.set(bytes.subarray(chunk.start, chunk.end), offset);
    offset += chunk.end - chunk.start;
  }
  return output;
}

/** Return editable JSON; the caller must validate the document schema before using it. */
export function decodePngMetadata(pngBytes) {
  const { chunks } = readPng(pngBytes);
  const matching = chunks.filter(isRevolaMetadata);
  if (!matching.length) {
    throw new Error('This PNG has no Revola Map metadata and cannot be edited. Open a PNG saved by Revola Map Drawer or a .revola.json project.');
  }
  if (matching.length !== 1) throw new Error('PNG contains conflicting editable map metadata.');
  const data = matching[0].data;
  let offset = keyword.length + 1;
  if (data.length < offset + 4) throw new Error('PNG editable metadata is truncated.');
  if (data[offset] !== 0 || data[offset + 1] !== 0) {
    throw new Error('Compressed PNG map metadata is not supported. Open the .revola.json project instead.');
  }
  offset += 2;
  const languageEnd = data.indexOf(0, offset);
  const translatedEnd = languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
  if (languageEnd < 0 || translatedEnd < 0) throw new Error('PNG editable metadata has invalid text fields.');
  const jsonBytes = data.subarray(translatedEnd + 1);
  if (data.length > MAX_METADATA_BYTES + keyword.length + 5 || jsonBytes.length > MAX_METADATA_BYTES) {
    throw new Error('Editable map metadata exceeds the 4 MiB limit.');
  }
  let document;
  try { document = JSON.parse(decoder.decode(jsonBytes)); } catch { throw new Error('PNG editable metadata is not valid UTF-8 JSON.'); }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('PNG editable metadata must contain a map object.');
  return document;
}
