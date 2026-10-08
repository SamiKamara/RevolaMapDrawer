import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { encodePngMetadata, decodePngMetadata, MAX_METADATA_BYTES, MAX_PNG_BYTES } from '../src/png.js';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const document = {
  format: 'revola-map', version: 1, name: 'Ilmalukko — 船 🚀', width: 8192, height: 8192,
  vertices: [{ id: 'v1', x: 100, y: 100 }, { id: 'v2', x: 500, y: 100 }],
  edges: [{ id: 'e1', a: 'v1', b: 'v2', doors: [{ id: 'd1', t: 0.5 }] }],
  ship: { x: 4096, y: 7300, mirrored: true }, textureSeed: 719,
};

// Independent, bit-by-bit CRC implementation keeps test fixtures separate from production code.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 'ascii');
  result.set(data, 8);
  result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4);
  return result;
}

function header(width = 1, height = 1) {
  const bytes = Buffer.alloc(13);
  bytes.writeUInt32BE(width, 0);
  bytes.writeUInt32BE(height, 4);
  bytes.set([8, 6, 0, 0, 0], 8);
  return chunk('IHDR', bytes);
}
const idat = chunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255, 0])));
const iend = chunk('IEND');
function fixture(extra = [], imageHeader = header()) { return Buffer.concat([signature, imageHeader, idat, ...extra, iend]); }
function textChunk(text, keyword = 'RevolaMap') { return chunk('iTXt', Buffer.concat([Buffer.from(`${keyword}\0\0\0\0\0`), Buffer.from(text)])); }
function rawChunks(png) {
  const bytes = Buffer.from(png);
  const out = [];
  for (let offset = 8; offset < bytes.length;) {
    const end = offset + bytes.readUInt32BE(offset) + 12;
    out.push(bytes.subarray(offset, end));
    offset = end;
  }
  return out;
}

test('editable PNG round trip preserves Unicode, graph, doors, ship and style data', () => {
  const encoded = encodePngMetadata(fixture(), document);
  assert.ok(encoded instanceof Uint8Array);
  assert.deepEqual(decodePngMetadata(encoded), document);
  assert.deepEqual(decodePngMetadata(encoded.buffer), document);
  assert.equal(encoded.length - fixture().length, Buffer.byteLength(JSON.stringify(document)) + 26);
});

test('all existing raster and unrelated metadata chunks stay byte-for-byte intact', () => {
  const source = fixture([chunk('tEXt', Buffer.from('Software\0Test')), textChunk('unrelated', 'Author')]);
  const original = rawChunks(source);
  const result = rawChunks(encodePngMetadata(source, document));
  assert.deepEqual(result.slice(0, -2), original.slice(0, -1));
  assert.deepEqual(result.at(-1), original.at(-1));
  assert.equal(result.at(-2).subarray(4, 8).toString(), 'iTXt');
});

test('saving again replaces metadata instead of accumulating it', () => {
  const first = encodePngMetadata(fixture(), document);
  const changed = { ...document, name: 'Revised', edges: [] };
  const second = encodePngMetadata(first, changed);
  assert.deepEqual(decodePngMetadata(second), changed);
  assert.equal(rawChunks(second).filter((c) => c.subarray(4, 8).toString() === 'iTXt').length, 1);
  assert.deepEqual(encodePngMetadata(second, changed), second);
});

test('typed array subviews use their own byte offsets', () => {
  const encoded = encodePngMetadata(fixture(), document);
  const padded = new Uint8Array(encoded.length + 11);
  padded.set(encoded, 7);
  const view = padded.subarray(7, 7 + encoded.length);
  assert.deepEqual(decodePngMetadata(view), document);
  assert.deepEqual(decodePngMetadata(new DataView(view.buffer, view.byteOffset, view.byteLength)), document);
});

test('plain PNG explains why topology cannot be recovered', () => {
  assert.throws(() => decodePngMetadata(fixture()), /no Revola Map metadata.*cannot be edited/);
});

test('bad signatures, chunk CRCs, truncation and trailing content are rejected', () => {
  const valid = encodePngMetadata(fixture(), document);
  assert.throws(() => decodePngMetadata(new Uint8Array(8)), /not a PNG/);
  const corrupted = valid.slice();
  corrupted[44] ^= 1;
  assert.throws(() => decodePngMetadata(corrupted), /checksum/);
  assert.throws(() => decodePngMetadata(valid.subarray(0, valid.length - 2)), /truncated/);
  assert.throws(() => decodePngMetadata(valid.subarray(0, valid.length - 12)), /missing image end/);
  assert.throws(() => decodePngMetadata(Buffer.concat([valid, Buffer.from([0])])), /after its end/);
  const badLength = valid.slice();
  new DataView(badLength.buffer).setUint32(8, 0xffffffff);
  assert.throws(() => decodePngMetadata(badLength), /invalid chunk length/);
});

test('essential PNG structure and bounded dimensions are checked before import', () => {
  assert.throws(() => decodePngMetadata(Buffer.concat([signature, idat, header(), iend])), /begin with an IHDR/);
  assert.throws(() => decodePngMetadata(fixture([header()])), /invalid image header/);
  assert.throws(() => decodePngMetadata(Buffer.concat([signature, header(), iend])), /invalid image end/);
  assert.throws(() => decodePngMetadata(fixture([chunk('tEXt'), idat])), /must be consecutive/);
  assert.throws(() => decodePngMetadata(fixture([], header(0, 1))), /dimensions/);
  assert.throws(() => decodePngMetadata(fixture([], header(20000, 1))), /dimensions/);
  assert.deepEqual(decodePngMetadata(fixture([textChunk(JSON.stringify(document))], header(16384, 16384))), document);
  assert.throws(() => decodePngMetadata(fixture([], header(16385, 16384))), /dimensions/);
  const badHeader = Buffer.alloc(13);
  badHeader.writeUInt32BE(1, 0); badHeader.writeUInt32BE(1, 4); badHeader.set([3, 6], 8);
  assert.throws(() => decodePngMetadata(fixture([], chunk('IHDR', badHeader))), /unsupported image header/);
});

test('ambiguous, malformed, compressed and invalid UTF-8 metadata are rejected', () => {
  assert.throws(() => decodePngMetadata(fixture([textChunk('{}'), textChunk('{}')])), /conflicting/);
  assert.throws(() => decodePngMetadata(fixture([textChunk('{broken')])), /valid UTF-8 JSON/);
  assert.throws(() => decodePngMetadata(fixture([textChunk('[]')])), /map object/);
  assert.throws(() => decodePngMetadata(fixture([textChunk('null')])), /map object/);
  assert.throws(() => decodePngMetadata(fixture([textChunk(Buffer.from([0xc3, 0x28]))])), /valid UTF-8 JSON/);
  assert.throws(() => decodePngMetadata(fixture([chunk('iTXt', Buffer.from('RevolaMap\0\x01\0\0\0abc'))])), /Compressed/);
  assert.throws(() => decodePngMetadata(fixture([chunk('iTXt', Buffer.from('RevolaMap\0\0\0xx'))])), /invalid text fields/);
  assert.throws(() => decodePngMetadata(fixture([chunk('iTXt', Buffer.from('RevolaMap\0'))])), /truncated/);
});

test('metadata limits count UTF-8 bytes and total PNG imports are capped', () => {
  assert.throws(() => encodePngMetadata(fixture(), { text: 'x'.repeat(MAX_METADATA_BYTES) }), /4 MiB/);
  assert.throws(() => encodePngMetadata(fixture(), { text: '船'.repeat(Math.floor(MAX_METADATA_BYTES / 3)) }), /4 MiB/);
  const tooLarge = new Uint8Array(MAX_PNG_BYTES + 1);
  tooLarge.set(signature);
  assert.throws(() => decodePngMetadata(tooLarge), /32 MiB/);
  const oversizedMetadata = textChunk(`{"text":"${'x'.repeat(MAX_METADATA_BYTES)}"}`);
  assert.throws(() => decodePngMetadata(fixture([oversizedMetadata])), /4 MiB/);
});

test('invalid input and circular documents produce useful errors', () => {
  assert.throws(() => encodePngMetadata([], document), /byte array/);
  assert.throws(() => encodePngMetadata(fixture(), []), /JSON object/);
  assert.throws(() => encodePngMetadata(fixture(), { toJSON: () => null }), /JSON object/);
  const circular = {}; circular.self = circular;
  assert.throws(() => encodePngMetadata(fixture(), circular), /cannot be serialized/);
});
