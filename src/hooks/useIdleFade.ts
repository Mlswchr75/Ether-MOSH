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

/**
 * Programmatic activity signal, for code paths the browser's own DOM events
 * and focus/visibility signals can't be trusted to cover.
 *
 * Every native-dialog-steals-focus scenario (file picker, camera/mic
 * permission prompt) is handled generically below via `focus`/
 * `visibilitychange` — but the Web Share API's native share sheet
 * (screenshot, GIF, recording, and favorite-link sharing all go through it,
 * see src/lib/share.ts) doesn't reliably fire either of those on every
 * platform when it closes. Rather than keep chasing each new dialog flavor
 * that leaks through, this is the escape hatch: any async user-initiated
 * action that might span an untrackable gap can call markUiActive() itself
 * once it's done, and the chrome is guaranteed to be visible again
 * regardless of what happened for however long in between. share.ts's
 * helpers already call this on every path (success, fallback, cancelled,
 * failed) — new code that awaits something focus-stealing should too.
 */
const ACTIVITY_EVENT = "mosh:ui-activity";
export function markUiActive() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVITY_EVENT));
}

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
    // The activity list above only covers events that fire *on this page*.
    // A native file/camera/color picker steals focus for as long as the user
    // takes to use it — no pointermove or keydown reaches the window while
    // it's open — so a slow pick (very normal) can let the idle timer fire
    // while the dialog is up. The chrome then comes back hidden the moment
    // the picker closes and stays that way until some later, unrelated
    // mouse move, which reads as "the hot triggers vanished after I
    // uploaded an image." Regaining focus/visibility is itself a clear
    // sign the user is back, so it counts as activity too.
    const onVisible = () => { if (document.visibilityState === "visible") reset(); };
    window.addEventListener("focus", reset);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ACTIVITY_EVENT, reset);
    arm();

    return () => {
      disarm();
      ACTIVITY.forEach(e => window.removeEventListener(e, reset, { capture: true }));
      window.removeEventListener("focus", reset);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ACTIVITY_EVENT, reset);
    };
  }, [hideMs]);

  return stage;
}
