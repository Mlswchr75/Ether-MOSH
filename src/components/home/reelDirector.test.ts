import { describe, expect, it } from "vitest";
import { planReel } from "./useReelDirector";
import type { DemoFrame } from "@/data/demoReel";

const pool: DemoFrame[] = Array.from({ length: 60 }, (_, i) => ({
  label: `frame ${i}`,
  src: `https://cdn.shopify.com/f/${i}.png?v=1`,
  productUrl: `https://aestheticrebellion.store/products/p-${i}`,
}));

/** Walks a fixed sequence so a plan can be asserted exactly. */
function seeded(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("planReel", () => {
  it("keeps every reel inside the panel and moving at a visible rate", () => {
    for (let i = 0; i < 200; i++) {
      const plan = planReel(pool, i);
      expect(plan.cx).toBeGreaterThanOrEqual(5);
      expect(plan.cx).toBeLessThanOrEqual(95);
      expect(plan.cy).toBeGreaterThanOrEqual(5);
      expect(plan.cy).toBeLessThanOrEqual(95);
      expect(plan.speed).toBeGreaterThan(0);
      expect(Math.abs(plan.sign)).toBe(1);
    }
  });

  it("holds a reel for between thirty seconds and a minute and a half", () => {
    for (let i = 0; i < 200; i++) {
      const { lifetimeMs } = planReel(pool, i);
      expect(lifetimeMs).toBeGreaterThanOrEqual(30_000);
      expect(lifetimeMs).toBeLessThanOrEqual(90_000);
    }
  });

  it("reaches all twenty headings across enough spawns", () => {
    const headings = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const plan = planReel(pool, i);
      headings.add(`${plan.angle}/${plan.sign}`);
    }
    expect(headings.size).toBe(20);
  });

  it("draws a distinct handful of frames rather than the whole catalogue", () => {
    const plan = planReel(pool, 0);
    expect(plan.frames.length).toBeGreaterThanOrEqual(14);
    expect(plan.frames.length).toBeLessThanOrEqual(20);
    expect(new Set(plan.frames.map(f => f.src)).size).toBe(plan.frames.length);
  });

  it("never asks for more frames than the pool holds", () => {
    const plan = planReel(pool.slice(0, 3), 0);
    expect(plan.frames).toHaveLength(3);
  });

  it("takes its angle, heading and position from the supplied randomness", () => {
    // count, shuffle draws…, angle, sign, cx, cy, speed, lifetime — only the
    // leading value matters per field, so a flat 0 pins every choice low.
    const plan = planReel(pool, 7, seeded([0]));
    expect(plan.id).toBe(7);
    expect(plan.angle).toBe(0);
    expect(plan.sign).toBe(-1);
    expect(plan.cx).toBe(5);
    expect(plan.cy).toBe(5);
  });
});
