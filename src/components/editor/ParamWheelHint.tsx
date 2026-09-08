import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { dismissHint, isHintDismissed } from "./HintPulse";

const KEY = "mosh_param_wheel_hint";

/**
 * A two-finger tap-and-hold is not a gesture anyone guesses. The Parameters
 * Wheel is where every control from the old below-the-fold menu rack now
 * lives, so a user who never finds the gesture loses the whole surface —
 * which is a worse outcome than one line of text.
 *
 * Shown only when it can actually be acted on: a touch device, with at least
 * one layer worth tuning, before the wheel has ever been opened. It retires
 * itself permanently the first time the wheel opens, by any route — the
 * gesture, the T key, or the hot-trigger wheel's own params slot — because
 * any of those means the user has found it.
 */
export function ParamWheelHint() {
  const [dismissed, setDismissed] = useState(() => isHintDismissed(KEY));
  const [touch, setTouch] = useState(false);
  const hasLayers = useStore(s => s.layers.length > 0);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse), (max-width: 900px)");
    const update = () => setTouch(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const retire = () => { dismissHint(KEY); setDismissed(true); };
    window.addEventListener("mosh:open-param-wheel", retire);
    window.addEventListener("mosh:toggle-param-wheel", retire);
    return () => {
      window.removeEventListener("mosh:open-param-wheel", retire);
      window.removeEventListener("mosh:toggle-param-wheel", retire);
    };
  }, [dismissed]);

  if (dismissed || !touch || !hasLayers) return null;

  return (
    <p className="ui-chrome pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/35 safe-bottom">
      hold two fingers · all controls
    </p>
  );
}
