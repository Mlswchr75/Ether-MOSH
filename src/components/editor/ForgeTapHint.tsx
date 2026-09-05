import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { isHintDismissed, dismissHint } from "./HintPulse";

const KEY = "mosh_forge_tap_hint";

/**
 * Forge mode's only affordance is "tap the canvas" — GlCanvas binds the
 * click-to-shuffle directly to the canvas element, not here. This just tells
 * the user that's the interaction, and gets out of the way for good once
 * they've done it once (tracked by a seed change, the real signal that a
 * shuffle happened, rather than by the click event itself).
 */
export function ForgeTapHint() {
  const [dismissed, setDismissed] = useState(() => isHintDismissed(KEY));

  useEffect(() => {
    if (dismissed) return;
    let seenSeed: number | null = null;
    return useStore.subscribe((state) => {
      if (seenSeed === null) { seenSeed = state.forge.seed; return; }
      if (state.forge.seed !== seenSeed) {
        dismissHint(KEY);
        setDismissed(true);
      }
    });
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <p className="ui-chrome pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/30 safe-bottom">
      tap anywhere to shuffle
    </p>
  );
}
