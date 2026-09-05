import { useEffect, useRef, useState } from "react";

/**
 * Hide a corner panel while nobody is reaching for it, and bring it back only
 * when someone actually reaches for it.
 *
 * Different from useIdleFade on the one point that matters here: that hook
 * treats *any* activity as "show the chrome again", keystrokes included. For
 * an instrument being driven from the keyboard while a camera feed fills the
 * screen, that is backwards — every shortcut you press pops a panel back over
 * the artwork you are watching. This hook only ever reveals for a pointer that
 * has come near the panel itself, so the keyboard drives the app without ever
 * putting UI back on screen.
 *
 * The panel is hidden visually rather than unmounted, so its geometry stays
 * measurable (the reveal zone is derived from its own rect) and any scroll
 * position or in-progress input inside it survives.
 */

/** How far outside the panel counts as "reaching for it". Generous: the point
 *  is to catch someone heading that way, not to make them land on it. */
const REVEAL_MARGIN_PX = 140;

export function useProximityIdle(
  ref: React.RefObject<HTMLElement>,
  {
    hideAfterMs = 2_500,
    enabled = true,
  }: { hideAfterMs?: number; enabled?: boolean } = {},
): boolean {
  const [hidden, setHidden] = useState(false);
  // Read inside listeners without re-subscribing them on every toggle.
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    if (!enabled) { setHidden(false); return; }

    let timer: number | undefined;

    const nearPanel = (x: number, y: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width < 1) return false;
      return (
        x >= rect.left - REVEAL_MARGIN_PX && x <= rect.right + REVEAL_MARGIN_PX &&
        y >= rect.top - REVEAL_MARGIN_PX && y <= rect.bottom + REVEAL_MARGIN_PX
      );
    };

    /* Never hide out from under someone typing into the panel. The keyboard
       deliberately cannot *reveal* it, but a field that vanishes mid-word
       would be a bug, not restraint. */
    const holdsFocus = () => {
      const active = document.activeElement;
      return !!active && !!ref.current?.contains(active);
    };

    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (holdsFocus()) { arm(); return; }
        setHidden(true);
      }, hideAfterMs);
    };

    const onPointer = (event: PointerEvent) => {
      const near = nearPanel(event.clientX, event.clientY);
      if (hiddenRef.current) {
        // Only a pointer that has come to the panel brings it back.
        if (near) { setHidden(false); arm(); }
        return;
      }
      // Visible: any pointer activity anywhere keeps it up, and hovering it
      // holds it open indefinitely rather than counting down under the cursor.
      if (near) window.clearTimeout(timer); else arm();
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    arm();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [ref, hideAfterMs, enabled]);

  return hidden;
}
