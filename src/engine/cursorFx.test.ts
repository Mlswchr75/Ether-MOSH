import { beforeEach, describe, expect, it } from "vitest";
import { cursorFx } from "./cursorFx";

const AFTER_FADE = 400;

describe("cursorFx point lifetime", () => {
  beforeEach(() => cursorFx.clear());

  /* The bug this guards: these layers are appended after the effect stack
     rather than being part of it, so a point that never releases cannot be
     cleared by moshing, by clearing FX, or by anything else the user can
     reach. It just sits on that part of the frame forever. */
  it("releases a drag whose pointerup never arrives", () => {
    const t0 = performance.now();
    cursorFx.spawnAmbient("ptr-1", 0.15, 0.5, t0);
    expect(cursorFx.getActiveLayers(t0 + 200)).toHaveLength(1);

    // No move, no up — the pointer is simply gone.
    cursorFx.getActiveLayers(t0 + 60_000);
    expect(cursorFx.getActiveLayers(t0 + 60_000 + AFTER_FADE)).toEqual([]);
    expect(cursorFx.hasActive()).toBe(false);
  });

  it("releases a hover whose pointerleave never arrives", () => {
    const t0 = performance.now();
    cursorFx.hover("hover-1", 0.12, 0.4, t0);
    cursorFx.getActiveLayers(t0 + 60_000);
    expect(cursorFx.getActiveLayers(t0 + 60_000 + AFTER_FADE)).toEqual([]);
    expect(cursorFx.hasActive()).toBe(false);
  });

  /* The staleness backstop must not cut a drag someone is still making —
     holding still mid-gesture sends no pointermove, but the drag is live. */
  it("keeps a drag alive for as long as it is actually being driven", () => {
    const t0 = performance.now();
    cursorFx.spawnAmbient("ptr-1", 0.5, 0.5, t0);
    // From 2s on, so the check starts past the spawn ramp-in (a point is
    // legitimately at zero amplitude on its very first frame).
    for (let t = 2_000; t <= 60_000; t += 2_000) {
      cursorFx.moveAmbient("ptr-1", 0.5 + Math.sin(t) * 0.01, 0.5, t0 + t);
      expect(cursorFx.getActiveLayers(t0 + t), `driven drag died at ${t}ms`).toHaveLength(1);
    }
  });

  it("releaseAll fades every live point without cutting it", () => {
    const t0 = performance.now();
    cursorFx.spawnAmbient("ptr-1", 0.2, 0.2);
    cursorFx.hover("hover-1", 0.8, 0.8);
    cursorFx.releaseAll();
    // Still fading, not snapped away.
    expect(cursorFx.getActiveLayers(t0 + 1).length).toBeGreaterThan(0);
    expect(cursorFx.getActiveLayers(t0 + AFTER_FADE)).toEqual([]);
  });

  it("clear drops everything at once, mid-fade included", () => {
    cursorFx.spawnAmbient("ptr-1", 0.2, 0.2);
    cursorFx.burst(0.5, 0.5);
    expect(cursorFx.hasActive()).toBe(true);
    cursorFx.clear();
    expect(cursorFx.hasActive()).toBe(false);
    expect(cursorFx.getActiveLayers(performance.now())).toEqual([]);
  });

  it("expires one-shot bursts on their own schedule", () => {
    const t0 = performance.now();
    cursorFx.burst(0.5, 0.5);
    expect(cursorFx.getActiveLayers(t0 + 50)).toHaveLength(1);
    expect(cursorFx.getActiveLayers(t0 + 5_000)).toEqual([]);
  });
});
