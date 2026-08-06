import { describe, expect, it } from "vitest";
import { DEFAULT_HEAL_BAND, healPixels, renderSizeFor } from "./seamlessHeal";
import { SEAM_PASS, seamScore } from "./tileSafety";

/**
 * The heal has one job: whatever went in, the result must tile.
 *
 * Inputs here are deliberately un-tileable — a linear gradient is the worst
 * case, since its seam spans the entire dynamic range. Everything runs against
 * the pure pixel function rather than a mocked canvas: an earlier version of
 * these tests stubbed a 2D context and failed while the algorithm underneath
 * was already correct, which is a test measuring its own scaffolding.
 */

function field(w: number, h: number, f: (x: number, y: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y);
    const i = (y * w + x) * 4;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  return d;
}

const bandFor = (size: number) => renderSizeFor(size) - size;

function heal(size: number, f: (x: number, y: number) => number) {
  const over = renderSizeFor(size);
  return healPixels(field(over, over, f), over, size, bandFor(size));
}

describe("seamless heal", () => {
  it("closes a horizontal gradient — the worst case there is", () => {
    const size = 128;
    const over = renderSizeFor(size);
    const out = heal(size, x => (x / over) * 255);
    const s = seamScore(out, size, size);
    expect(s.horizontal, `horizontal=${s.horizontal.toFixed(3)}`).toBeGreaterThan(SEAM_PASS);
  });

  it("closes a vertical gradient", () => {
    const size = 128;
    const over = renderSizeFor(size);
    const out = heal(size, (_x, y) => (y / over) * 255);
    const s = seamScore(out, size, size);
    expect(s.vertical, `vertical=${s.vertical.toFixed(3)}`).toBeGreaterThan(SEAM_PASS);
  });

  it("closes both axes at once", () => {
    const size = 128;
    const over = renderSizeFor(size);
    const out = heal(size, (x, y) => ((x + y) / (over * 2)) * 255);
    const s = seamScore(out, size, size);
    expect(s.worst, `worst=${s.worst.toFixed(3)}`).toBeGreaterThan(SEAM_PASS);
  });

  it("closes high-frequency content, not just smooth ramps", () => {
    const size = 128;
    const over = renderSizeFor(size);
    // Non-integer frequency, so it does not accidentally already tile.
    const out = heal(size, (x, y) =>
      128 + 100 * Math.sin((x / over) * 7.3) * Math.cos((y / over) * 5.1));
    const s = seamScore(out, size, size);
    expect(s.worst, `worst=${s.worst.toFixed(3)}`).toBeGreaterThan(SEAM_PASS);
  });

  it("leaves the interior untouched", () => {
    // Only the band should be blended; the middle of the design must survive
    // exactly, or healing would quietly soften the whole pattern.
    const size = 128;
    const over = renderSizeFor(size);
    const f = (x: number, y: number) => (x * 7 + y * 3) % 256;
    const out = heal(size, f);
    const band = bandFor(size);
    for (const [x, y] of [[64, 64], [band + 5, band + 5], [size - 1, size - 1]]) {
      const got = out[(y * size + x) * 4];
      expect(Math.abs(got - f(x, y)), `(${x},${y})`).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a flat field flat", () => {
    const size = 64;
    const out = heal(size, () => 77);
    for (let i = 0; i < out.length; i += 4) expect(out[i]).toBe(77);
  });

  it("writes a fully opaque tile", () => {
    const size = 64;
    const out = heal(size, x => x % 255);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  it("passes the source through when there is no band to blend with", () => {
    // Claiming a heal with zero overlap would be a lie the UI then reports.
    const size = 32;
    const src = field(size, size, x => (x / size) * 255);
    const out = healPixels(src, size, size, 0);
    expect(Array.from(out.slice(0, 16))).toEqual(Array.from(src.slice(0, 16)));
  });

  it("reserves real overlap at every export size", () => {
    for (const s of [256, 1024, 2048, 4096]) {
      expect(renderSizeFor(s)).toBeGreaterThan(s);
      expect(renderSizeFor(s) - s).toBeGreaterThanOrEqual(Math.floor(s * DEFAULT_HEAL_BAND));
    }
  });
});
