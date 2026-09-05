import { useEffect, useRef } from "react";
import { Check, Mic, X } from "lucide-react";

/**
 * Nudges toward turning the mic on the first time there's actually something
 * on screen this session. Rendered as a standalone overlay, sibling to the
 * hot-trigger rail rather than nested inside it (not inside the radial
 * wheel, `.ui-chrome`, or any other idle-fade-governed wrapper) — the rail
 * it used to anchor next to now lives inside a press-and-hold radial wheel
 * that's hidden by default, which buried this prompt along with it and made
 * it show up unreliably. This has to be reachable and answerable regardless
 * of whether that wheel is open, idle-faded, or on a touch device that never
 * opens it. No auto-expire: it stays up until the visitor answers it.
 *
 * `absolute`, not `fixed`, and deliberately rendered as a sibling inside the
 * same `relative h-[100dvh]` canvas wrapper the chrome-pin button uses —
 * `.editor-shell` has `contain: layout paint`, which makes IT (not the
 * viewport) the containing block for any `fixed` descendant, and the shell
 * is much taller than one screen (canvas plus a long scrollable panel below
 * it), so `fixed bottom-4` anchored to the shell's real bottom, thousands of
 * pixels below the fold. `absolute` scoped to the one-viewport-tall wrapper
 * sidesteps that entirely, the same way the existing pin button does.
 *
 * Auto-expires. It used to stay up until it was explicitly answered, which is
 * what made it read as a box demanding attention rather than an offer: a
 * visitor who simply wasn't interested had to dismiss the same card every
 * time it reappeared. Ignoring it is now a valid answer — Editor only raises
 * it while the radial menu is open, and re-offers occasionally while it
 * stays open, so nothing is lost by letting one go by.
 */
const AUTO_DISMISS_MS = 9_000;

export function MicNudgeToast({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  /* Held in a ref, and the timer armed once on mount. The caller passes an
     inline arrow, so `onNo` is a new function on every render — depending on
     it directly would clear and re-arm this timeout each time the parent
     re-rendered, and the card would never actually expire. */
  const onNoRef = useRef(onNo);
  onNoRef.current = onNo;
  useEffect(() => {
    const t = window.setTimeout(() => onNoRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="absolute bottom-4 right-4 z-[80] safe-right safe-bottom">
      <div
        role="status"
        className="w-64 rounded-md border border-[hsl(var(--accent))]/40 bg-black/90 p-3 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md panel-in-3d"
        style={{ animation: "panel-in 180ms ease-out both" }}
      >
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--accent))]">
          <Mic className="h-3 w-3" strokeWidth={1.5} /> react to sound?
        </div>
        <p className="mt-1 text-[10px] leading-tight text-white/60">
          Turn on the mic (or route a tab's audio) and the effects move with it.
        </p>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onNo}
            aria-label="No, don't turn on the mic"
            title="No"
            className="grid h-7 w-7 place-items-center rounded-full border border-[hsl(var(--destructive))]/50 text-[hsl(var(--destructive))] transition hover:bg-[hsl(var(--destructive))]/15"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onYes}
            aria-label="Yes, turn on the mic"
            title="Yes"
            className="grid h-7 w-7 place-items-center rounded-full border border-[hsl(var(--signal-good))]/60 text-[hsl(var(--signal-good))] transition hover:bg-[hsl(var(--signal-good))]/15"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
