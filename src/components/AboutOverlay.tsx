import { useEffect, useState } from "react";
import { PUBLIC_EFFECTS } from "@/engine/effects";

/**
 * "?" trigger + full-screen about overlay. Kept dependency-free (no dialog
 * lib) so it works identically inside the home dropzone button.
 */
type AboutTriggerProps = {
  hidden?: boolean;
};

export const AboutTrigger = ({ hidden = false }: AboutTriggerProps) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        aria-label="About Ether-MOSH"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="pointer-events-auto absolute bottom-6 right-5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border/70 font-mono text-sm text-foreground/60 transition hover:border-accent hover:text-accent"
      >
        ?
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="About Ether-MOSH"
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-background/90 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg border border-border bg-card p-8 text-left shadow-[0_0_80px_hsl(var(--primary)/0.15)]"
          >
            <h2 className="mosh-text font-sans text-3xl font-bold tracking-tight" data-text="Ether-MOSH">Ether-MOSH</h2>
            <p className="mt-4 font-mono text-xs leading-relaxed text-foreground/75">
              A real-time, audio-reactive visual instrument. Load an image — or go
              live with your camera — then stack GPU glitch effects, modulate them
              with LFOs or sound, and perform. Everything runs locally in your
              browser; nothing is uploaded anywhere.
            </p>
            <ul className="mt-4 space-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/55">
              <li>· {PUBLIC_EFFECTS.length} shader effects, stackable + blendable</li>
              <li>· live camera: front / rear / any webcam</li>
              <li>· beat sync, mic + system-audio reactivity</li>
              <li>· PNG stills + WebM video export</li>
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-foreground/70 transition hover:border-primary hover:text-primary"
            >
              close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
