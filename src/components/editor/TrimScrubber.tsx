/**
 * The mini timeline for trimming an uploaded clip down to a 5-7s window
 * before it becomes a mosh sticker. Only shown for videos longer than
 * MAX_CLIP_SECONDS — GIFs and already-short clips skip straight to
 * placement (see moshStickerStore's addSticker/confirmTrim).
 *
 * Pointer handling follows the same idiom as QuadrantSurface/KaossSurface
 * (pointer capture try/catch, touch-action none, normalized coordinates)
 * simplified to one dimension.
 */
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { StickerClip } from "@/store/moshStickerStore";
import { MAX_CLIP_SECONDS, MIN_CLIP_SECONDS } from "@/store/moshStickerStore";

type DragMode = "move" | "left" | "right";

type Props = {
  clip: StickerClip;
  onConfirm: (start: number, end: number) => void;
  onCancel: () => void;
};

export function TrimScrubber({ clip, onConfirm, onCancel }: Props) {
  const duration = clip.duration || MAX_CLIP_SECONDS;
  const initialLen = Math.min(MAX_CLIP_SECONDS, duration);
  const [start, setStart] = useState(() => Math.max(0, Math.min(clip.trimStart, duration - initialLen)));
  const [end, setEnd] = useState(() => Math.min(duration, start + initialLen));

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: DragMode; pointerId: number; startSec: number; endSec: number; grabSec: number } | null>(null);
  const windowRef = useRef({ start, end });
  windowRef.current = { start, end };

  const secAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    return frac * duration;
  };

  const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const sec = secAt(e.clientX);
    dragRef.current = { mode, pointerId: e.pointerId, startSec: windowRef.current.start, endSec: windowRef.current.end, grabSec: sec };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const sec = secAt(e.clientX);
    const delta = sec - d.grabSec;

    if (d.mode === "move") {
      const len = d.endSec - d.startSec;
      let ns = d.startSec + delta;
      ns = Math.max(0, Math.min(duration - len, ns));
      setStart(ns);
      setEnd(ns + len);
    } else if (d.mode === "left") {
      let ns = d.startSec + delta;
      ns = Math.max(0, Math.min(d.endSec - MIN_CLIP_SECONDS, ns));
      ns = Math.max(d.endSec - MAX_CLIP_SECONDS, ns);
      setStart(ns);
    } else {
      let ne = d.endSec + delta;
      ne = Math.min(duration, Math.max(d.startSec + MIN_CLIP_SECONDS, ne));
      ne = Math.min(d.startSec + MAX_CLIP_SECONDS, ne);
      setEnd(ne);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  // Loop the preview video within [start, end) so the picked window plays
  // instantly, same "instantly continue playing in a loop" feel the final
  // placed sticker has.
  useEffect(() => {
    if (clip.kind !== "video") return;
    const video = clip.el as HTMLVideoElement;
    video.currentTime = start;
    video.play().catch(() => undefined);
    const onTimeUpdate = () => {
      const { start: s, end: e } = windowRef.current;
      if (video.currentTime >= e || video.currentTime < s) video.currentTime = s;
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip]);

  const leftPct = (start / duration) * 100;
  const widthPct = ((end - start) / duration) * 100;

  return (
    <div className="panel-in-3d w-64 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-2.5 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--text-secondary))]">
        <span>trim clip</span>
        <span>{(end - start).toFixed(1)}s</span>
      </div>

      <div
        ref={trackRef}
        className="relative h-9 w-full touch-none rounded-sm bg-white/5"
        style={{ touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          data-no-longpress
          onPointerDown={onPointerDown("move")}
          className="absolute inset-y-0 cursor-grab rounded-sm border border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/20 active:cursor-grabbing"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          <div
            data-no-longpress
            onPointerDown={onPointerDown("left")}
            className="absolute -left-1.5 top-0 h-full w-3 cursor-ew-resize rounded-sm bg-[hsl(var(--accent))]"
          />
          <div
            data-no-longpress
            onPointerDown={onPointerDown("right")}
            className="absolute -right-1.5 top-0 h-full w-3 cursor-ew-resize rounded-sm bg-[hsl(var(--accent))]"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          data-no-longpress
          onClick={onCancel}
          className="flex items-center gap-1 rounded-sm border border-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-destructive hover:text-destructive"
        >
          <X className="h-3 w-3" /> cancel
        </button>
        <button
          type="button"
          data-no-longpress
          onClick={() => onConfirm(start, end)}
          className="flex items-center gap-1 rounded-sm border border-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--accent))] transition hover:border-[hsl(var(--accent))]"
        >
          <Check className="h-3 w-3" /> use this clip
        </button>
      </div>
    </div>
  );
}
