import { useEffect, useState } from "react";

/**
 * Tracks how long the instrument has been left alone, in two stages: the
 * chrome first sinks to near-invisible, then goes entirely.
 *
 * Two stages rather than one because a single hard cut is startling and
 * gives no warning that the controls are about to go; the dim step reads as
 * the UI receding rather than breaking.
 */
export type IdleStage = "active" | "dim" | "hidden";

/** Anything that counts as "still here". Scroll included via `wheel`. */
const ACTIVITY = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;

export function useIdleFade(dimMs = 2_500, hideMs = 5_000): IdleStage {
  const [stage, setStage] = useState<IdleStage>("active");

  useEffect(() => {
    let toDim: number | undefined;
    let toHidden: number | undefined;

    const arm = () => {
      toDim = window.setTimeout(() => setStage("dim"), dimMs);
      toHidden = window.setTimeout(() => setStage("hidden"), hideMs);
    };
    const disarm = () => {
      window.clearTimeout(toDim);
      window.clearTimeout(toHidden);
    };
    const reset = () => {
      disarm();
      // Cheaper than an unconditional set: pointermove fires constantly, and
      // re-rendering the whole editor on every mouse pixel is not free.
      setStage(current => (current === "active" ? current : "active"));
      arm();
    };

    ACTIVITY.forEach(e => window.addEventListener(e, reset, { passive: true, capture: true }));
    arm();

    return () => {
      disarm();
      ACTIVITY.forEach(e => window.removeEventListener(e, reset, { capture: true }));
    };
  }, [dimMs, hideMs]);

  return stage;
}
