import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, X, Star } from "lucide-react";
import { toast } from "sonner";
import {
  SCRUB_AFTER, SCRUB_BEFORE,
  bestFrameIndex, scoreTake,
  type ScrubTake,
} from "@/engine/scrubCapture";
import { exportScrubFrame, scrubExportFilename } from "@/engine/scrubExport";
import { downloadBlob } from "@/engine/export";
import { scrubSession } from "@/engine/scrubSession";

/**
 * The scrubbable moment.
 *
 * Two things about the design are deliberate and worth stating, because both
 * look like omissions otherwise.
 *
 * IT SAYS WHICH FRAMES ARE REAL. The backward half is recorded pixels; the
 * forward half is the last real frame held still while the effects keep
 * evolving. Those are genuinely different kinds of image, and a timeline that
 * presented them identically would let someone export a "photo" of a moment
 * believing it was captured when it was computed. The track is shaded either
 * side of the freeze and the readout names which half you are on.
 *
 * IT SCRUBS THE MAIN CANVAS, not a thumbnail. The point of the feature is to
 * hold the image still and move around inside it, and a 200px preview of a
 * full-screen visual is not something anyone can judge a print from.
 */

type Props = {
  take: ScrubTake;
  onClose: () => void;
};

/** Frames either side of centre; matches the take's own resolution. */
export function ScrubTimeline({ take, onClose }: Props) {
  const [index, setIndex] = useState(take.pivot);
  const [busy, setBusy] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const count = take.frames.length;
  const frame = take.frames[Math.min(count - 1, Math.max(0, index))];

  /* Score once per take, not per scrub step: each distinct source bitmap costs
     a canvas readback, and the ranking does not change as you move. */
  const scores = useMemo(() => {
    const probe = document.createElement("canvas");
    probe.width = 96;
    probe.height = 96;
    return scoreTake(take, probe);
  }, [take]);
  const best = useMemo(() => bestFrameIndex(scores), [scores]);

  // Drive the live canvas. Cleanup hands it back, so an unmount from any cause
  // — close, navigation, an error boundary — cannot strand a frozen frame.
  useEffect(() => {
    scrubSession.get()?.preview(frame ?? null);
  }, [frame]);
  useEffect(() => () => { scrubSession.get()?.preview(null); }, []);

  const clamp = useCallback((i: number) => Math.max(0, Math.min(count - 1, i)), [count]);

  const seekFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = (clientX - rect.left) / Math.max(1, rect.width);
    setIndex(clamp(Math.round(p * (count - 1))));
  }, [clamp, count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); setIndex(i => clamp(i - 1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setIndex(i => clamp(i + 1)); }
      // Home/End jump to the ends of the window, which is faster than 12 taps.
      if (e.key === "Home") { e.preventDefault(); setIndex(0); }
      if (e.key === "End") { e.preventDefault(); setIndex(count - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clamp, count, onClose]);

  // Pointer capture on the window, not the track: a drag that leaves the strip
  // should keep scrubbing rather than stopping at the edge.
  useEffect(() => {
    const move = (e: PointerEvent) => { if (draggingRef.current) seekFromClientX(e.clientX); };
    const up = () => { draggingRef.current = false; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [seekFromClientX]);

  const doExport = useCallback(async () => {
    if (busy || !frame) return;
    setBusy(true);
    const notice = toast.loading("Rendering at print resolution…");
    try {
      const ctx = scrubSession.get()?.context();
      const result = await exportScrubFrame(frame, {
        minEdge: 3000,
        dpi: 300,
        mirror: ctx?.mirror,
        tileable: ctx?.tileable,
        hdr: ctx?.hdr,
      });
      downloadBlob(
        result.blob,
        scrubExportFilename(frame.offset, result.width, result.height, result.dpi),
      );
      toast.success(`${result.width}×${result.height} saved`, {
        id: notice,
        description: `${result.dpi} DPI · re-rendered at full size, not upscaled`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: notice });
    } finally {
      setBusy(false);
    }
  }, [busy, frame]);

  if (!frame) return null;

  const pct = count > 1 ? (index / (count - 1)) * 100 : 50;
  const pivotPct = count > 1 ? (take.pivot / (count - 1)) * 100 : 50;
  const offsetLabel = `${frame.offset >= 0 ? "+" : "−"}${Math.abs(frame.offset).toFixed(2)}s`;
  const shortHistory = take.reach < SCRUB_BEFORE - 0.15;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-4"
      role="dialog"
      aria-label="Scrub the frozen moment"
    >
      <div className="w-full max-w-xl rounded-md border border-[hsl(var(--border-default))] bg-black/80 p-3 backdrop-blur-md">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[hsl(var(--accent))]">
            scrub · {offsetLabel}
          </p>
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
            {frame.reconstructed
              ? (frame.offset > 0 ? "computed ahead — source held" : "beyond what was recorded")
              : "recorded"}
          </p>
        </div>

        {/* Track. The pivot line and the shaded halves are the whole point:
            left of it is recorded, right of it is computed. */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Position in the frozen moment"
          aria-valuemin={-SCRUB_BEFORE}
          aria-valuemax={SCRUB_AFTER}
          aria-valuenow={Number(frame.offset.toFixed(2))}
          aria-valuetext={`${offsetLabel}, ${frame.reconstructed ? "computed" : "recorded"}`}
          onPointerDown={(e) => { draggingRef.current = true; seekFromClientX(e.clientX); }}
          className="relative h-12 w-full cursor-ew-resize touch-none select-none rounded-sm border border-white/10 bg-white/[0.03]"
        >
          {/* Recorded half */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-l-sm bg-[hsl(var(--accent)/0.09)]"
            style={{ width: `${pivotPct}%` }}
          />
          {/* Per-frame strength, so a good moment is visible before you land on it */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end gap-px px-px">
            {scores.map((sc, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-[1px]"
                style={{
                  height: `${Math.max(6, sc * 100)}%`,
                  background: i === index
                    ? "hsl(var(--accent))"
                    : take.frames[i].reconstructed
                      ? "hsl(0 0% 100% / 0.16)"
                      : "hsl(0 0% 100% / 0.32)",
                }}
              />
            ))}
          </div>
          {/* Freeze point */}
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-white/45"
            style={{ left: `${pivotPct}%` }}
          />
          {/* Best moment */}
          <div
            className="pointer-events-none absolute top-0.5 -translate-x-1/2 text-[hsl(var(--accent))]"
            style={{ left: `${count > 1 ? (best / (count - 1)) * 100 : 50}%` }}
            title="Strongest frame in this window"
          >
            <Star className="h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
          </div>
          {/* Playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[hsl(var(--accent))]"
            style={{ left: `${pct}%` }}
          />
        </div>

        <div className="mt-1 flex justify-between font-mono text-[8px] uppercase tracking-[0.2em] text-white/30">
          <span>−{SCRUB_BEFORE.toFixed(1)}s recorded</span>
          <span>freeze</span>
          <span>+{SCRUB_AFTER.toFixed(1)}s computed</span>
        </div>

        {shortHistory && (
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-white/35">
            Only {take.reach.toFixed(1)}s of history was captured — the rest of the
            left side is held, not recorded.
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={doExport}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-[hsl(var(--accent))] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--accent))] transition hover:bg-[hsl(var(--accent)/0.1)] disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            {busy ? "rendering…" : "export 3000px · 300 dpi"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scrub and resume"
            className="flex items-center justify-center rounded-sm border border-white/15 px-3 py-2 text-white/60 transition hover:border-white/40 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.15em] text-white/25">
          ← → to step · home/end for the edges · esc to resume
        </p>
      </div>
    </div>
  );
}
