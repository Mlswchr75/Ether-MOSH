import { useState } from "react";
import { Cast, Maximize2, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { usePaywall } from "@/hooks/usePaywall";

/**
 * Chrome intentionally does not expose an API for a webpage to begin tab
 * mirroring itself. MOSH is a live WebGL instrument rather than a hosted
 * media file, so tab casting is the only zero-latency route that carries the
 * exact canvas through every source mode (upload, camera, and Forge).
 *
 * This control is deliberately an honest hand-off to Chrome's Cast UI, not a
 * non-functional media-cast button. A native receiver/streaming relay can be
 * added later without changing this stage-oriented entry point.
 */
export function CastStageButton() {
  const [open, setOpen] = useState(false);
  const sourceMode = useStore(s => s.sourceMode);
  const paywall = usePaywall();

  const openCastingHelp = () => {
    if (sourceMode === "forge" && !paywall.require("Forge stage output")) return;
    setOpen(true);
  };

  return (
    <span className="relative">
      <button
        type="button"
        onClick={openCastingHelp}
        className="btn-icon h-7 w-7"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Project MOSH to a display"
        title="Project to a display — Chrome Cast help"
      >
        <Cast className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
      </button>

      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="cast-stage-title"
          className="absolute right-0 top-full z-[10020] mt-2 w-[min(25rem,calc(100vw-1.5rem))] border border-[hsl(var(--accent)/0.38)] bg-[hsl(var(--surface-1)/0.97)] p-5 shadow-[0_0_42px_hsl(var(--accent)/0.18)] backdrop-blur-xl"
        >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-[hsl(var(--accent)/0.55)] bg-black/30">
                  <Cast className="h-4 w-4 text-[hsl(var(--accent))]" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[hsl(var(--accent))]">Live output</p>
                  <h2 id="cast-stage-title" className="mt-1 font-mono text-sm uppercase tracking-[0.12em] text-white">Project MOSH</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-icon h-8 w-8"
                aria-label="Close casting instructions"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Mirror this browser tab to put the exact live MOSH canvas on your TV or projector. Your session stays live behind this panel and works with Upload, Camera, and Forge.
            </p>

            <ol className="mt-5 space-y-3 font-mono text-[11px] leading-relaxed text-white/75">
              <li className="flex gap-3">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[hsl(var(--accent)/0.55)] text-[9px] text-[hsl(var(--accent))]">1</span>
                <span>In Chrome, open the <strong className="font-medium text-white">⋮ menu</strong> and choose <strong className="font-medium text-white">Cast</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[hsl(var(--accent)/0.55)] text-[9px] text-[hsl(var(--accent))]">2</span>
                <span>Open <strong className="font-medium text-white">Sources</strong>, choose <strong className="font-medium text-white">Cast tab</strong>, then select your display.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[hsl(var(--accent)/0.55)] text-[9px] text-[hsl(var(--accent))]">3</span>
                <span>For a clean wall, enter <strong className="font-medium text-white">Performance Mode</strong> after connecting.</span>
              </li>
            </ol>

            <div className="mt-5 flex items-start gap-2 border-t border-[hsl(var(--border-subtle))] pt-4 text-[11px] leading-relaxed text-white/50">
              <Maximize2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--accent))]" aria-hidden="true" />
              <p>Tab casting mirrors the live visual output. MOSH’s microphone is used to animate the image; it does not send microphone sound to the display.</p>
            </div>
        </section>
      )}
    </span>
  );
}
