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

type PointKind = "ambient" | "hover" | "preview" | "burst" | "chaos";

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
  /** Last time this point was actually driven by a pointer event. A live
   *  drag refreshes this every move; a point whose release event never
   *  arrived stops being refreshed, which is what STALE_MS detects. */
  lastDrivenAt: number;
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
const PREVIEW_LIFE_MS = 190;
/** Hold-to-branch burst — longer and louder, its own "digital chaos" register. */
const CHAOS_LIFE_MS = 640;
/**
 * How long a drag/hover point may go undriven before it releases itself.
 *
 * These points end on pointerup, pointercancel or pointerleave — and a browser
 * does not always send one. Alt-tabbing mid-drag, a context menu, an OS
 * gesture stealing the touch, or the component unmounting while a pointer is
 * down all strand the point with `releasedAt: null`, and nothing in the decay
 * path ever removes those: the effect stays anchored at full strength, on that
 * part of the frame, for the rest of the session. Because these layers are
 * appended after the stack rather than being part of it, no amount of moshing
 * clears one — which is exactly how it reads as "one corner is permanently
 * broken".
 *
 * Generous on purpose. A live drag refreshes lastDrivenAt on every pointermove,
 * so this only fires on a point nothing is driving any more. Six seconds is
 * far longer than a hand holds still mid-gesture, and the cost of being wrong
 * is a fade-out that the next movement immediately re-arms.
 */
const STALE_MS = 6_000;

class CursorFxManager {
  private points = new Map<string, ActivePoint>();

  /* The driving methods take the same injectable clock getActiveLayers already
   does. In the app both are performance.now() and nothing changes; keeping one
   clock across the whole module is what makes the staleness rule mean
   "undriven for six seconds" rather than "six seconds apart on two clocks
   that happen to agree". */

  /** Start (or re-target) a drag-following point for an active touch/click. */
  spawnAmbient(key: string, x: number, y: number, now = performance.now()) {
    const existing = this.points.get(key);
    if (existing && existing.kind === "ambient") {
      existing.targetX = x;
      existing.targetY = y;
      existing.releasedAt = null;
      existing.lastDrivenAt = now;
      return;
    }
    this.points.set(key, {
      kind: "ambient",
      x, y, targetX: x, targetY: y,
      bornAt: now,
      releasedAt: null,
      lastDrivenAt: now,
      peakAmount: 0.5,
      radius: 0.15,
    });
  }

  /** A much quieter always-on point for mouse and hover-capable stylus input. */
  hover(key: string, x: number, y: number, now = performance.now()) {
    const existing = this.points.get(key);
    if (existing && existing.kind === "hover") {
      existing.targetX = x;
      existing.targetY = y;
      existing.releasedAt = null;
      existing.lastDrivenAt = now;
      return;
    }
    this.points.set(key, {
      kind: "hover",
      x, y, targetX: x, targetY: y,
      bornAt: now,
      releasedAt: null,
      lastDrivenAt: now,
      peakAmount: 0.15,
      radius: 0.075,
    });
  }

  /** Re-target an already-active ambient point (pointermove). No-op if the
   *  key isn't tracked or has already been released. */
  moveAmbient(key: string, x: number, y: number, now = performance.now()) {
    const p = this.points.get(key);
    if (p && (p.kind === "ambient" || p.kind === "hover") && p.releasedAt == null) {
      p.targetX = x;
      p.targetY = y;
      p.lastDrivenAt = now;
    }
  }

  /** Pointer lifted/cancelled — begin the ambient point's fade-out. */
  release(key: string) {
    const p = this.points.get(key);
    if (p && p.releasedAt == null) p.releasedAt = performance.now();
  }

  /** Release every point that a pointer is still notionally driving.
   *
   *  For the moments a browser tells us the input is gone without sending a
   *  per-pointer end event: window blur, tab hidden, the pointer leaving the
   *  document. Fades them out properly rather than cutting, so this is safe to
   *  call speculatively. */
  releaseAll() {
    const t = performance.now();
    for (const p of this.points.values()) {
      if (p.releasedAt == null) p.releasedAt = t;
    }
  }

  /** Drop every point immediately, mid-fade included. For teardown, where
   *  there is no next frame to run the fade on. */
  clear() {
    this.points.clear();
  }

  /** One-shot burst — any tap/click, canvas or UI, that isn't a hold-branch. */
  burst(x: number, y: number) {
    const t = performance.now();
    this.points.set(`burst-${t}-${Math.random().toString(36).slice(2, 7)}`, {
      kind: "burst",
      x, y, targetX: x, targetY: y,
      bornAt: t, releasedAt: t, lastDrivenAt: t,
      peakAmount: 0.85,
      radius: 0.11,
    });
  }

  /** Quiet radial-menu acknowledgement: visible enough to confirm hover,
   * deliberately far below a real tap burst so preview never edits the look. */
  preview(x: number, y: number) {
    const t = performance.now();
    this.points.set(`preview-${t}`, {
      kind: "preview", x, y, targetX: x, targetY: y,
      bornAt: t, releasedAt: t, lastDrivenAt: t, peakAmount: 0.24, radius: 0.065,
    });
  }

  /** Hold-to-branch fired — its own louder, blockier "digital chaos" burst. */
  chaos(x: number, y: number) {
    const t = performance.now();
    this.points.set(`chaos-${t}-${Math.random().toString(36).slice(2, 7)}`, {
      kind: "chaos",
      x, y, targetX: x, targetY: y,
      bornAt: t, releasedAt: t, lastDrivenAt: t,
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
      if (p.kind === "ambient" || p.kind === "hover") {
        /* Nothing has driven this for a long time, so its end event never
           arrived — release it rather than letting it sit on the frame
           forever. See STALE_MS. */
        if (p.releasedAt == null && nowMs - p.lastDrivenAt > STALE_MS) {
          p.releasedAt = nowMs;
        }
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
      const life = p.kind === "preview" ? PREVIEW_LIFE_MS : p.kind === "burst" ? BURST_LIFE_MS : CHAOS_LIFE_MS;
      const t = (nowMs - p.bornAt) / life;
      if (t >= 1) { this.points.delete(key); continue; }
      const attack = 0.08;
      const amount = t < attack
        ? p.peakAmount * (t / attack)
        : p.peakAmount * Math.pow(1 - (t - attack) / (1 - attack), 1.4);
      if (amount <= 0.003) continue;
      out.push(cursorFxLayer(key, p.x, p.y, amount, p.radius, p.kind === "chaos" ? 1 : p.kind === "preview" ? 0.14 : 0.45));
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
