import { describe, expect, it } from "vitest";
import { readDpi, withDpi } from "./pngDpi";

/**
 * A wrong DPI is invisible locally and expensive downstream: the print shop
 * scales the artwork wrong, or rejects a perfectly good file as "low
 * resolution". These check the chunk is written where the spec requires and
 * that nothing else in the file moves.
 */

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

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

function chunk(type: string, data: number[] = []): number[] {
  const body = [...type.split("").map(c => c.charCodeAt(0)), ...data];
  const len = data.length;
  const crc = crc32(new Uint8Array(body));
  return [
    (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255,
    ...body,
    (crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255,
  ];
}

/** Minimal but structurally valid PNG. */
function png(opts: { withPhys?: boolean } = {}): Uint8Array {
  const parts = [
    ...SIG,
    ...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  ];
  if (opts.withPhys) parts.push(...chunk("pHYs", [0, 0, 11, 18, 0, 0, 11, 18, 1]));
  parts.push(...chunk("IDAT", [1, 2, 3, 4]), ...chunk("IEND"));
  return new Uint8Array(parts);
}

/** Walk chunk types in order, so placement can be asserted. */
function types(b: Uint8Array): string[] {
  const out: string[] = [];
  let pos = 8;
  while (pos + 8 <= b.length) {
    const len = new DataView(b.buffer, b.byteOffset + pos, 4).getUint32(0);
    const t = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    out.push(t);
    if (t === "IEND") break;
    pos += 12 + len;
  }
  return out;
}

describe("png dpi stamping", () => {
  it("writes a DPI that reads back", () => {
    expect(readDpi(withDpi(png(), 300))).toBe(300);
  });

  it("declares nothing before stamping", () => {
    expect(readDpi(png())).toBeNull();
  });

  it("supports other densities", () => {
    for (const dpi of [72, 150, 300, 600]) {
      expect(readDpi(withDpi(png(), dpi)), `${dpi}`).toBe(dpi);
    }
  });

  it("puts pHYs before IDAT, as the spec requires", () => {
    // After IDAT a decoder may never look at it, so placement is correctness,
    // not tidiness.
    const t = types(withDpi(png(), 300));
    expect(t.indexOf("pHYs")).toBeGreaterThan(-1);
    expect(t.indexOf("pHYs")).toBeLessThan(t.indexOf("IDAT"));
  });

  it("replaces an existing pHYs rather than adding a second", () => {
    // Two pHYs chunks is malformed, and readers disagree on which wins.
    const out = withDpi(png({ withPhys: true }), 600);
    expect(types(out).filter(t => t === "pHYs")).toHaveLength(1);
    expect(readDpi(out)).toBe(600);
  });

  it("keeps every other chunk intact and in order", () => {
    expect(types(withDpi(png(), 300))).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
  });

  it("preserves the image data byte for byte", () => {
    const before = png();
    const after = withDpi(before, 300);
    // IDAT payload must survive untouched — this is metadata only.
    expect(Array.from(after.subarray(after.length - 24))).toEqual(
      Array.from(before.subarray(before.length - 24)),
    );
  });

  it("adds only the 21 bytes a pHYs chunk costs", () => {
    expect(withDpi(png(), 300).length - png().length).toBe(21);
  });

  it("passes through anything that is not a PNG", () => {
    // Silently corrupting an unexpected format is worse than not stamping it.
    const jpegish = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
    expect(Array.from(withDpi(jpegish, 300))).toEqual(Array.from(jpegish));
    expect(readDpi(jpegish)).toBeNull();
  });

  it("never throws on a truncated or empty file", () => {
    for (const bad of [new Uint8Array(0), new Uint8Array(SIG), png().subarray(0, 20)]) {
      expect(() => withDpi(bad, 300)).not.toThrow();
      expect(() => readDpi(bad)).not.toThrow();
    }
  });

  it("writes a CRC a decoder will accept", () => {
    const out = withDpi(png(), 300);
    let pos = 8;
    while (pos + 8 <= out.length) {
      const len = new DataView(out.buffer, out.byteOffset + pos, 4).getUint32(0);
      const t = String.fromCharCode(out[pos + 4], out[pos + 5], out[pos + 6], out[pos + 7]);
      if (t === "pHYs") {
        const stored = new DataView(out.buffer, out.byteOffset + pos + 8 + len, 4).getUint32(0);
        expect(crc32(out.subarray(pos + 4, pos + 8 + len))).toBe(stored);
        return;
      }
      pos += 12 + len;
    }
    throw new Error("pHYs not found");
  });
});
