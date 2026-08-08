import { useEffect, useState } from "react";

/** Returns true after `ms` of no user interaction. Resets to false on any
 *  pointer / key / touch / wheel activity. Used to auto-fade overlay UI. */
export function useIdleHide(ms = 5000): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer: number | null = null;
    const arm = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    const reset = () => { setIdle(false); arm(); };
    const events = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true, capture: true }));
    arm();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset, { capture: true } as any));
    };
  }, [ms]);
  return idle;
}
