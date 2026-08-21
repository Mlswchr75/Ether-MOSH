/**
 * Live, per-touch ambient distortion — the "cursorMosh" internal effect
 * (see effects.ts) driven directly from pointer state instead of the normal
 * layer stack. Deliberately bypasses the store entirely: these points exist
 * for milliseconds to a couple of seconds, never undo, never persist, and
 * updating them at pointer-move cadence through Zustand would re-render
 * every store subscriber on every drag frame. GlCanvas.tsx reads
 * `cursorFx.getActiveLayers()` once per render tick and appends the result
 * straight onto that frame's RenderLayer[] — nothing else needs to know
 * these points exist.
 */
import type { RenderLayer } from "./Renderer";

type PointKind = "ambient" | "burst" | "chaos";

type ActivePoint = {
  kind: PointKind;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  bornAt: number;
  /** Set the instant a point stops being driven (pointerup, or immediately
   *  for one-shot burst/chaos points) — drives the fade-out/decay curve. */
  releasedAt: number | null;
  peakAmount: number;
  radius: number;
};

/** Spawn fade-in for an ambient (drag-following) point. */
const AMBIENT_RAMP_MS = 90;
/** Fade-out once an ambient point's pointer lifts. */
const AMBIENT_RELEASE_MS = 180;
/** How fast an ambient point eases toward its live target position — higher
 *  is snappier, lower drags further behind a fast swipe. */
const AMBIENT_EASE = 0.35;
/** One-shot tap burst — covers both a plain click/tap and a hot-trigger tap. */
const BURST_LIFE_MS = 420;
/** Hold-to-branch burst — longer and louder, its own "digital chaos" register. */
const CHAOS_LIFE_MS = 640;

class CursorFxManager {
  private points = new Map<string, ActivePoint>();

  /** Start (or re-target) a drag-following point for an active touch/click. */
  spawnAmbient(key: string, x: number, y: number) {
    const existing = this.points.get(key);
    if (existing && existing.kind === "ambient") {
      existing.targetX = x;
      existing.targetY = y;
      existing.releasedAt = null;
      return;
    }
    this.points.set(key, {
      kind: "ambient",
      x, y, targetX: x, targetY: y,
      bornAt: performance.now(),
      releasedAt: null,
      peakAmount: 0.5,
      radius: 0.15,
    });
  }

  /** Re-target an already-active ambient point (pointermove). No-op if the
   *  key isn't tracked or has already been released. */
  moveAmbient(key: string, x: number, y: number) {
    const p = this.points.get(key);
    if (p && p.kind === "ambient" && p.releasedAt == null) {
      p.targetX = x;
      p.targetY = y;
    }
  }

  /** Pointer lifted/cancelled — begin the ambient point's fade-out. */
  release(key: string) {
    const p = this.points.get(key);
    if (p && p.releasedAt == null) p.releasedAt = performance.now();
  }

  /** One-shot burst — any tap/click, canvas or UI, that isn't a hold-branch. */
  burst(x: number, y: number) {
    const t = performance.now();
    this.points.set(`burst-${t}-${Math.random().toString(36).slice(2, 7)}`, {
      kind: "burst",
      x, y, targetX: x, targetY: y,
      bornAt: t, releasedAt: t,
      peakAmount: 0.85,
      radius: 0.11,
    });
  }

  /** Hold-to-branch fired — its own louder, blockier "digital chaos" burst. */
  chaos(x: number, y: number) {
    const t = performance.now();
    this.points.set(`chaos-${t}-${Math.random().toString(36).slice(2, 7)}`, {
      kind: "chaos",
      x, y, targetX: x, targetY: y,
      bornAt: t, releasedAt: t,
      peakAmount: 1.0,
      radius: 0.24,
    });
  }

  /** Advance all active points by one frame and return the layers to append
   *  to this frame's RenderLayer[]. Purely a function of wall-clock time —
   *  safe to call at any cadence. */
  getActiveLayers(nowMs: number): RenderLayer[] {
    const out: RenderLayer[] = [];
    for (const [key, p] of this.points) {
      if (p.kind === "ambient") {
        p.x += (p.targetX - p.x) * AMBIENT_EASE;
        p.y += (p.targetY - p.y) * AMBIENT_EASE;
        const age = nowMs - p.bornAt;
        const rampIn = Math.min(1, age / AMBIENT_RAMP_MS);
        let rampOut = 1;
        if (p.releasedAt != null) {
          const released = nowMs - p.releasedAt;
          if (released >= AMBIENT_RELEASE_MS) { this.points.delete(key); continue; }
          rampOut = 1 - released / AMBIENT_RELEASE_MS;
        }
        const amount = p.peakAmount * rampIn * rampOut;
        if (amount <= 0.003) continue;
        out.push(cursorFxLayer(key, p.x, p.y, amount, p.radius, 0));
        continue;
      }

      // burst / chaos: fast attack, slower decay — reads as an immediate
      // impact at the touch point rather than a fade-in. A symmetric
      // sin(t*pi) curve was tried here first and is wrong for this: it's
      // zero at t=0, so the burst would be invisible for its first ~40% of
      // life before ever reaching peakAmount.
      const life = p.kind === "burst" ? BURST_LIFE_MS : CHAOS_LIFE_MS;
      const t = (nowMs - p.bornAt) / life;
      if (t >= 1) { this.points.delete(key); continue; }
      const attack = 0.08;
      const amount = t < attack
        ? p.peakAmount * (t / attack)
        : p.peakAmount * Math.pow(1 - (t - attack) / (1 - attack), 1.4);
      if (amount <= 0.003) continue;
      out.push(cursorFxLayer(key, p.x, p.y, amount, p.radius, p.kind === "chaos" ? 1 : 0.45));
    }
    return out;
  }

  hasActive() { return this.points.size > 0; }
}

function cursorFxLayer(key: string, x: number, y: number, amount: number, radius: number, chaos: number): RenderLayer {
  return {
    id: `cursorfx-${key}`,
    effectId: "cursorMosh",
    hidden: false,
    opacity: 1,
    blend: "normal",
    params: { amount, radius, x, y, chaos },
  };
}

export const cursorFx = new CursorFxManager();
