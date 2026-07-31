/**
 * MobileGestures — minimal, reliable touch gestures.
 *
 * Only two gestures, no toasts, no animations:
 *   • 1-finger tap        → MOSH
 *   • 2-finger pinch OUT  → enter fullscreen (Performance Mode)
 *   • 2-finger pinch IN   → exit fullscreen
 *
 * Disabled when Kaoss is on or before/after split is active so it never
 * fights other surfaces.
 */
import { useRef } from "react";
import { useStore } from "@/store/useStore";
import { useKaossStore } from "@/store/kaossStore";

const TAP_MS = 250;
const TAP_MOVE_PX = 12;
const PINCH_RATIO = 1.25;       // 25% larger → enter fullscreen
const PINCH_RATIO_INV = 1 / 1.25; // 20% smaller → exit fullscreen

type P = { id: number; x: number; y: number };

type Props = {
  onTogglePerf: () => void;
  onScreenshot?: () => void;
  onMicFlash?: (on: boolean) => void;
};

export function MobileGestures({ onTogglePerf }: Props) {
  const kaossOn = useKaossStore(s => s.instrumentEnabled);
  const showBeforeAfter = useStore(s => s.showBeforeAfter);
  const isolationMode = useStore(s => s.isolationMode);
  const mosh = useStore(s => s.mosh);

  const pointers = useRef<Map<number, P>>(new Map());
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const pinchBaseDist = useRef<number | null>(null);
  const pinchFired = useRef(false);

  const active = !kaossOn && !showBeforeAfter && isolationMode !== 'tap';

  const dist = () => {
    const pts = Array.from(pointers.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    pointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (pointers.current.size === 1) {
      tapStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    } else {
      // multi-touch cancels tap intent
      tapStart.current = null;
    }
    if (pointers.current.size === 2) {
      pinchBaseDist.current = dist();
      pinchFired.current = false;
    }
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;

    if (tapStart.current) {
      const ts = tapStart.current;
      if (Math.abs(p.x - ts.x) > TAP_MOVE_PX || Math.abs(p.y - ts.y) > TAP_MOVE_PX) {
        tapStart.current = null;
      }
    }

    if (pointers.current.size === 2 && pinchBaseDist.current && !pinchFired.current) {
      const d = dist();
      const ratio = d / pinchBaseDist.current;
      if (ratio >= PINCH_RATIO || ratio <= PINCH_RATIO_INV) {
        pinchFired.current = true;
        const wantFs = ratio >= PINCH_RATIO;
        const isFs = useStore.getState().isPerformanceMode;
        if (wantFs !== isFs) onTogglePerf();
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    pointers.current.delete(e.pointerId);

    // Reset pinch baseline when fingers change
    pinchBaseDist.current = pointers.current.size === 2 ? dist() : null;

    if (pointers.current.size === 0) {
      const ts = tapStart.current;
      tapStart.current = null;
      const wasPinch = pinchFired.current;
      pinchFired.current = false;
      if (wasPinch) return;
      if (ts) {
        const dt = performance.now() - ts.t;
        if (dt < TAP_MS) mosh();
      }
    }
  };

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 z-20 touch-none select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
