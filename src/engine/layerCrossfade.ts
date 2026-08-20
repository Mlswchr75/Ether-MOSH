import { useStore } from "@/store/useStore";

/** Every direct/manual mosh trigger (hot trigger, palette, trackpad
 *  double-click, quadrant tap, Auto-Mosh's interval) uses this — short
 *  enough to still feel immediate and responsive to a deliberate tap, long
 *  enough that it's a soft cut instead of a hard one. Journey's own
 *  autonomous compositions use a fuller, more deliberate fade (see
 *  journeyDirector.ts's own pacing) — DIRECTED_FADE_MS below. */
export const MOSH_FADE_MS = 200;
/** Journey composition changes — its own dedicated, slower pacing. */
export const DIRECTED_FADE_MS = 550;

/**
 * Crossfades the visible layer stack instead of hard-cutting it.
 *
 * Runs `commit` — any store action that replaces the unlocked layer stack
 * (mosh, moshDirected, ...) — exactly once, for its real and correct side
 * effects (undo history, seed, per-action bookkeeping like Mosh's
 * recentLooks/currentBrief). This never re-invokes or duplicates that
 * action's construction logic, so there's no risk of it re-rolling
 * something different the second time — it only visually interpolates
 * between the before and after snapshots it already has in hand.
 *
 * A single module-level animation slot means one crossfade cleanly
 * supersedes another regardless of what triggered either — Journey firing
 * mid-tap, or two rapid manual taps, both just restart the fade from
 * wherever it currently is rather than fighting or stacking.
 */
let fadeRaf: number | null = null;

export function crossfadeLayers(commit: () => void, durationMs: number) {
  if (fadeRaf != null) { cancelAnimationFrame(fadeRaf); fadeRaf = null; }

  const before = useStore.getState().layers.filter(l => !l.locked);
  const beforeOpacity = before.map(l => l.opacity);

  commit();

  const after = useStore.getState().layers;
  const lockedAfter = after.filter(l => l.locked);
  const incoming = after.filter(l => !l.locked);
  const incomingTo = incoming.map(l => l.opacity);

  const start = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const eased = t * t * (3 - 2 * t); // smoothstep
    const fadingOut = before.map((l, i) => ({ ...l, opacity: beforeOpacity[i] * (1 - eased) }));
    const fadingIn = incoming.map((l, i) => ({ ...l, opacity: incomingTo[i] * eased }));
    useStore.getState().setLayersRaw([...lockedAfter, ...fadingOut, ...fadingIn]);
    if (t < 1) {
      fadeRaf = requestAnimationFrame(tick);
    } else {
      fadeRaf = null;
      // Restore the exact post-commit array (drops the now-invisible
      // outgoing layers instead of leaving them sitting at opacity 0).
      useStore.getState().setLayersRaw(after);
    }
  };
  // Synchronous first call, not the first rAF frame — so the very first
  // thing GlCanvas's own render loop can observe after `commit()` is the
  // t≈0 blend, never one frame of the final, un-faded result.
  tick();
}

export function cancelLayerCrossfade() {
  if (fadeRaf != null) { cancelAnimationFrame(fadeRaf); fadeRaf = null; }
}
