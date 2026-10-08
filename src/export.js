import { drawMap } from './render.js';
import { drawFloor, generateFloor } from './floors.js';
import { createPngChunk, createPngMetadataChunk, MAX_PNG_BYTES } from './png.js';

/** At 16k width, the canvas and RGBA readback each use at most 16 MiB. */
export const EXPORT_STRIPE_HEIGHT = 256;
// Canvas clips and quantizes polygon edges at its bounds. Overlap the rendered
// stripes so that clipping cannot alter the antialiasing of exported seam rows.
const RASTER_GUARD_ROWS = 32;
const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_DIMENSION = 16384;

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error('PNG dimensions must be between 1 and 16384 pixels.');
  }
}

/**
 * Encode sequential RGBA stripes as constant grayscale+alpha PNG (color type 4).
 * The iterable yields { data: Uint8Array | Uint8ClampedArray, height: number }.
 * Native deflate consumes one bounded stripe at a time; a concurrent reader
 * drains compressed bytes, so neither stream buffers the full raw image.
 */
export async function encodePngStripes({ width, height, stripes, metadata, grayscale = 255, onProgress }) {
  dimensions(width, height);
  if (!Number.isInteger(grayscale) || grayscale < 0 || grayscale > 255) {
    throw new Error('PNG grayscale must be an integer between 0 and 255.');
  }
  if (typeof CompressionStream !== 'function') throw new Error('This browser does not support streaming PNG export. Use the desktop app.');
  const metadataChunk = metadata == null ? null : createPngMetadataChunk(metadata);
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([8, 4, 0, 0, 0], 8); // 8-bit grayscale + alpha; no interlacing.
  const chunks = [SIGNATURE, createPngChunk('IHDR', header)];
  const endChunk = createPngChunk('IEND');
  let size = chunks.reduce((sum, chunk) => sum + chunk.length, 0) + (metadataChunk?.length ?? 0) + endChunk.length;
  const stream = new CompressionStream('deflate'); // PNG requires a zlib-wrapped deflate stream.
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  let readError;
  const drain = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value.byteLength) continue;
        if (size + value.byteLength + 12 > MAX_PNG_BYTES) throw new Error('PNG export exceeds the 32 MiB limit.');
        const chunk = createPngChunk('IDAT', value);
        chunks.push(chunk);
        size += chunk.length;
      }
    } catch (error) {
      readError = error;
      await reader.cancel(error).catch(() => {});
      throw error;
    }
  })();
  // Observe failures immediately while the producer may still be rendering a stripe.
  drain.catch(() => {});
  let rows = 0;
  try {
    onProgress?.(0);
    for await (const stripe of stripes) {
      if (readError) throw readError;
      const count = stripe?.height, data = stripe?.data;
      if (!Number.isInteger(count) || count < 1 || count > EXPORT_STRIPE_HEIGHT || rows + count > height ||
          !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== width * count * 4) {
        throw new Error('PNG export received an invalid raster stripe.');
      }
      const scanlineLength = width * 2 + 1;
      const scanlines = new Uint8Array(scanlineLength * count);
      for (let y = 0; y < count; y++) {
        const line = y * scanlineLength;
        scanlines[line] = 1; // Sub filter: repeated grayscale and constant alpha become zeros.
        scanlines[line + 1] = grayscale;
        let previousAlpha = 0;
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          scanlines[line + x * 2 + 2] = (alpha - previousAlpha) & 255;
          previousAlpha = alpha;
        }
      }
      await writer.write(scanlines);
      rows += count;
      onProgress?.(rows / height * 0.95);
    }
    if (rows !== height) throw new Error('PNG export did not render every image row.');
    await writer.close();
    await drain;
    if (metadataChunk) chunks.push(metadataChunk);
    chunks.push(endChunk);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    onProgress?.(1);
    return output;
  } catch (error) {
    await Promise.allSettled([writer.abort(error), reader.cancel(error)]);
    await drain.catch(() => {});
    throw readError || error;
  } finally {
    writer.releaseLock();
    reader.releaseLock();
  }
}

/** Render transparent content through the same bounded, overlapping stripes. */
async function renderContentPng(document, { paint, metadata, grayscale, onProgress }) {
  const { width, height } = document;
  dimensions(width, height);
  const originX = document.originX ?? 0, originY = document.originY ?? 0;
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) throw new Error('Map export origin must be finite.');
  const stripeHeight = Math.min(EXPORT_STRIPE_HEIGHT - RASTER_GUARD_ROWS * 2, height);
  const canvasHeight = stripeHeight + RASTER_GUARD_ROWS * 2;
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(width, canvasHeight)
    : globalThis.document?.createElement('canvas');
  if (!canvas) throw new Error('Map export requires a browser canvas.');
  canvas.width = width;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) { canvas.width = canvas.height = 0; throw new Error('The map export canvas could not be created.'); }
  async function* stripes() {
    for (let top = 0; top < height; top += stripeHeight) {
      const count = Math.min(stripeHeight, height - top);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, canvasHeight);
      context.translate(-originX, -originY - top + RASTER_GUARD_ROWS);
      paint(context);
      yield { data: context.getImageData(0, RASTER_GUARD_ROWS, width, count).data, height: count };
      // Give input and progress painting a turn between expensive raster stripes.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  try {
    return await encodePngStripes({ width, height, stripes: stripes(), metadata, grayscale, onProgress });
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Return a complete editable wall PNG without allocating a full-map canvas. */
export async function renderMapPng(document, { shipImage, onProgress } = {}) {
  if (!shipImage) throw new Error('The ship image must be loaded before exporting the map.');
  return renderContentPng(document, { paint: context => drawMap(context, document, { shipImage }), metadata: document, grayscale: 255, onProgress });
}

/** Return black floor coverage only: no walls, ship image, background or metadata. */
export async function renderFloorPng(document, { floor, onProgress } = {}) {
  const generated = floor ?? generateFloor(document);
  if (!generated.closed) throw new Error(generated.reason || 'Close the map before generating a floor.');
  if (generated.width !== document.width || generated.height !== document.height ||
      generated.originX !== (document.originX ?? 0) || generated.originY !== (document.originY ?? 0)) {
    throw new Error('Regenerate the floor after changing the map bounds.');
  }
  return renderContentPng(document, { paint: context => drawFloor(context, generated), grayscale: 0, onProgress });
}
