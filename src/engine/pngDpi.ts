/**
 * Stamp a real DPI into a PNG.
 *
 * `canvas.toBlob` writes no resolution metadata at all, so every export opens
 * at the file's pixel dimensions and whatever default the receiving app assumes
 * — usually 72. A print shop or a POD fulfiller reading that will scale the
 * artwork wrong, or reject it for being "low resolution" despite the pixels
 * being there.
 *
 * PNG stores physical size in a `pHYs` chunk: pixels per metre, on both axes,
 * plus a unit byte. Inserting one before `IDAT` is enough to make the file
 * declare 300 DPI everywhere it is opened. Nothing about the image data changes
 * — this is metadata only, so it is lossless and costs 21 bytes.
 */

/** PNG's magic number. A file not starting with this is not a PNG. */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Inches per metre — the conversion PNG's metre-based unit requires. */
const INCHES_PER_METRE = 39.3701;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const isSignature = (b: Uint8Array) =>
  b.length > 8 && SIGNATURE.every((v, i) => b[i] === v);

/** Build a complete pHYs chunk: length, type, data, CRC. */
function physChunk(dpi: number): Uint8Array {
  const ppm = Math.round(dpi * INCHES_PER_METRE);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, 9);                       // data length
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);     // "pHYs"
  view.setUint32(8, ppm);                     // pixels per metre, x
  view.setUint32(12, ppm);                    // pixels per metre, y
  chunk[16] = 1;                              // unit: metres

  // CRC covers the type and the data, but not the length field.
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/**
 * Return a copy of `png` carrying the given DPI.
 *
 * Any existing pHYs is replaced rather than duplicated — a PNG with two is
 * malformed, and some readers take the first while others take the last.
 * Anything that is not a PNG is passed through untouched: silently corrupting
 * an unexpected format would be worse than not stamping it.
 */
export function withDpi(png: Uint8Array, dpi = 300): Uint8Array {
  if (!isSignature(png)) return png;

  // Walk the chunk list. Every chunk is [4 length][4 type][data][4 crc].
  let pos = 8;
  let insertAt = -1;
  let dropStart = -1;
  let dropEnd = -1;

  while (pos + 8 <= png.length) {
    const len = new DataView(png.buffer, png.byteOffset + pos, 4).getUint32(0);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const next = pos + 12 + len;
    if (next > png.length) break; // truncated file — leave it alone

    if (type === "pHYs") { dropStart = pos; dropEnd = next; }
    // pHYs must precede IDAT, so the first IDAT is the insertion point.
    if (type === "IDAT") { insertAt = pos; break; }
    if (type === "IEND") break;
    pos = next;
  }
  if (insertAt < 0) return png;

  const chunk = physChunk(dpi);
  const dropping = dropStart >= 0 && dropEnd > dropStart;
  const out = new Uint8Array(png.length + chunk.length - (dropping ? dropEnd - dropStart : 0));

  let o = 0;
  const copy = (from: number, to: number) => {
    out.set(png.subarray(from, to), o);
    o += to - from;
  };

  if (dropping && dropEnd <= insertAt) {
    copy(0, dropStart);
    copy(dropEnd, insertAt);
  } else {
    copy(0, insertAt);
  }
  out.set(chunk, o);
  o += chunk.length;
  if (dropping && dropStart > insertAt) {
    copy(insertAt, dropStart);
    copy(dropEnd, png.length);
  } else {
    copy(insertAt, png.length);
  }
  return out.subarray(0, o);
}

/** Read back the DPI a PNG declares, or null when it declares none. */
export function readDpi(png: Uint8Array): number | null {
  if (!isSignature(png)) return null;
  let pos = 8;
  while (pos + 8 <= png.length) {
    const len = new DataView(png.buffer, png.byteOffset + pos, 4).getUint32(0);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === "pHYs") {
      const ppm = new DataView(png.buffer, png.byteOffset + pos + 8, 4).getUint32(0);
      const unit = png[pos + 16];
      if (unit !== 1) return null; // aspect-ratio only, no physical scale
      return Math.round(ppm / INCHES_PER_METRE);
    }
    if (type === "IEND") break;
    pos += 12 + len;
  }
  return null;
}

/** Convenience: stamp a Blob and hand back a new Blob. */
export async function blobWithDpi(blob: Blob, dpi = 300): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const stamped = withDpi(bytes, dpi);
  return new Blob([stamped as unknown as BlobPart], { type: "image/png" });
}
