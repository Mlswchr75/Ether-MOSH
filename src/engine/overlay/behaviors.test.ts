import { describe, expect, it } from "vitest";
import { sampleBehavior } from "./behaviors";
import type { OverlayBehavior } from "./types";

const behavior = (kind: OverlayBehavior["kind"], overrides: Partial<OverlayBehavior> = {}): OverlayBehavior => ({
  kind,
  amount: 1,
  speed: 1,
  seed: 12345,
  ...overrides,
});

describe("sampleBehavior", () => {
  it("returns identity for none", () => {
    expect(sampleBehavior(behavior("none"), 1000)).toEqual({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  });

  it("is deterministic for the same seed and timestamp", () => {
    const a = sampleBehavior(behavior("random-walk"), 2345);
    const b = sampleBehavior(behavior("random-walk"), 2345);
    expect(a).toEqual(b);
  });

  it("changes over time for animated behaviors", () => {
    expect(sampleBehavior(behavior("float"), 0)).not.toEqual(sampleBehavior(behavior("float"), 500));
    expect(sampleBehavior(behavior("jitter"), 0)).not.toEqual(sampleBehavior(behavior("jitter"), 100));
  });

  it("clamps zero amount to identity", () => {
    expect(sampleBehavior(behavior("orbit", { amount: 0 }), 1000)).toEqual({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  });

  it("keeps flicker opacity in a safe visible range", () => {
    for (let t = 0; t < 1000; t += 25) {
      const value = sampleBehavior(behavior("flicker"), t).opacity;
      expect(value).toBeGreaterThanOrEqual(0.08);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
