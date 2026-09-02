const SOI = 0xd8;
const APP0 = 0xe0;

/** Stamp a JPEG's JFIF density fields without recompressing the pixels. */
export function withJpegDpi(jpeg: Uint8Array, dpi = 300): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== SOI) return jpeg;
  const density = Math.max(1, Math.min(0xffff, Math.round(dpi)));
  let pos = 2;
  while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff) {
    const marker = jpeg[pos + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (jpeg[pos + 2] << 8) | jpeg[pos + 3];
    if (length < 2 || pos + 2 + length > jpeg.length) return jpeg;
    if (
      marker === APP0 && length >= 16 &&
      jpeg[pos + 4] === 0x4a && jpeg[pos + 5] === 0x46 &&
      jpeg[pos + 6] === 0x49 && jpeg[pos + 7] === 0x46 && jpeg[pos + 8] === 0
    ) {
      const out = jpeg.slice();
      out[pos + 11] = 1; // dots per inch
      out[pos + 12] = density >>> 8;
      out[pos + 13] = density & 0xff;
      out[pos + 14] = density >>> 8;
      out[pos + 15] = density & 0xff;
      return out;
    }
    pos += 2 + length;
  }

  // Minimal JFIF APP0 segment, inserted immediately after SOI.
  const app0 = new Uint8Array([
    0xff, APP0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x01, density >>> 8, density & 0xff,
    density >>> 8, density & 0xff, 0x00, 0x00,
  ]);
  const out = new Uint8Array(jpeg.length + app0.length);
  out.set(jpeg.subarray(0, 2));
  out.set(app0, 2);
  out.set(jpeg.subarray(2), 2 + app0.length);
  return out;
}

export async function jpegBlobWithDpi(blob: Blob, dpi = 300): Promise<Blob> {
  const stamped = withJpegDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new Blob([stamped as unknown as BlobPart], { type: "image/jpeg" });
}
