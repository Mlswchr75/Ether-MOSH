import { beforeEach, describe, expect, it } from "vitest";
import { isFrameDead, liveFrames, markFrameDead, resetDeadFrames, sizedSrc, type DemoFrame } from "./demoReel";

const frame = (n: number): DemoFrame => ({
  label: `frame ${n}`,
  src: `https://cdn.shopify.com/f/${n}.png?v=1`,
  productUrl: `https://aestheticrebellion.store/products/p-${n}`,
});

beforeEach(resetDeadFrames);

describe("sizedSrc", () => {
  it("asks the cdn for the painted size rather than the original", () => {
    expect(sizedSrc("https://cdn.shopify.com/f/a.png?v=1", 416)).toBe(
      "https://cdn.shopify.com/f/a.png?v=1&width=416",
    );
    expect(sizedSrc("https://cdn.shopify.com/f/a.png", 416)).toBe(
      "https://cdn.shopify.com/f/a.png?width=416",
    );
  });

  it("leaves vector frames alone — the cdn has no raster transform to apply", () => {
    const svg = "https://cdn.shopify.com/f/pattern.svg?v=1778519834";
    expect(sizedSrc(svg, 416)).toBe(svg);
    expect(sizedSrc("https://cdn.shopify.com/f/pattern.SVG", 320)).toBe(
      "https://cdn.shopify.com/f/pattern.SVG",
    );
  });

  it("does not mistake an svg in the query string for an svg frame", () => {
    const png = "https://cdn.shopify.com/f/a.png?ref=hero.svg";
    expect(sizedSrc(png, 416)).toBe(`${png}&width=416`);
  });
});

describe("dead frames", () => {
  it("starts with nothing marked", () => {
    expect(isFrameDead(frame(1).src)).toBe(false);
    expect(liveFrames([frame(1), frame(2)])).toHaveLength(2);
  });

  it("drops a frame that failed to load, and only that frame", () => {
    const pool = [frame(1), frame(2), frame(3)];
    markFrameDead(pool[1].src);

    expect(isFrameDead(pool[1].src)).toBe(true);
    expect(liveFrames(pool).map((f) => f.src)).toEqual([pool[0].src, pool[2].src]);
  });

  it("is idempotent — the same failure reported twice removes one frame", () => {
    const pool = [frame(1), frame(2)];
    markFrameDead(pool[0].src);
    markFrameDead(pool[0].src);

    expect(liveFrames(pool)).toHaveLength(1);
  });

  it("hands back a copy, so a caller shuffling the cast cannot reorder the pool", () => {
    const pool = [frame(1), frame(2), frame(3)];
    const cast = liveFrames(pool);
    cast.reverse();

    expect(pool.map((f) => f.src)).toEqual([frame(1).src, frame(2).src, frame(3).src]);
  });

  it("can empty the pool entirely when every url is broken", () => {
    const pool = [frame(1), frame(2)];
    pool.forEach((f) => markFrameDead(f.src));

    expect(liveFrames(pool)).toEqual([]);
  });
});
