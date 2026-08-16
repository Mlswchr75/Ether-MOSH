import { useEffect, useState } from "react";

/**
 * Tracks idle time: UI chrome stays visible and semi-transparent at rest,
 * then fades to completely invisible after the timeout.
 *
 * This is intentional: the editor is a visual instrument, so its own controls
 * should step back and let the artwork be the focus. The 2s timeout gives the
 * user time to interact, but after that, it's pure visualization.
 */
export type IdleStage = "active" | "hidden";

/** Anything that counts as "still here". Scroll included via `wheel`. */
const ACTIVITY = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;

export function useIdleFade(hideMs = 2_000): IdleStage {
  const [stage, setStage] = useState<IdleStage>("active");

  useEffect(() => {
    let toHidden: number | undefined;

    const arm = () => {
      toHidden = window.setTimeout(() => setStage("hidden"), hideMs);
    };
    const disarm = () => {
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
  }, [hideMs]);

  return stage;
}
