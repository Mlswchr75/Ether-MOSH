/**
 * TrackpadGestures — minimal, reliable trackpad/mouse gestures.
 *
 * Only:
 *   • Double-click            → MOSH
 *   • Pinch OUT (zoom in)     → enter fullscreen
 *   • Pinch IN  (zoom out)    → exit fullscreen
 *
 * Horizontal two-finger swipe → undo / redo-or-new-Mosh.
 */
import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { useKaossStore } from "@/store/kaossStore";
import { crossfadeLayers, MOSH_FADE_MS } from "@/engine/layerCrossfade";

const PINCH_THRESHOLD = 0.22;
const COOLDOWN_MS = 600;

type Props = {
  targetRef: React.RefObject<HTMLElement>;
  onTogglePerf: () => void;
  onMicFlash?: (on: boolean) => void;
};

export function TrackpadGestures({ targetRef, onTogglePerf }: Props) {
  const mosh = useStore(s => s.mosh);
  const kaossOn = useKaossStore(s => s.instrumentEnabled);
  const isFineRef = useRef(true);
  useEffect(() => {
    isFineRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(hover: none)").matches;
  }, []);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let pinchAccum = 1;
    let horizontalAccum = 0;
    let lastFire = 0;

    const tryFire = (wantFs: boolean) => {
      const now = performance.now();
      if (now - lastFire < COOLDOWN_MS) return;
      const isFs = useStore.getState().isPerformanceMode;
      if (wantFs === isFs) return;
      lastFire = now;
      pinchAccum = 1;
      onTogglePerf();
    };

    const onWheel = (e: WheelEvent) => {
      if (!isFineRef.current) return;
      if (e.ctrlKey) {
        e.preventDefault();
        pinchAccum *= Math.exp(-e.deltaY * 0.01);
        if (pinchAccum > 1 + PINCH_THRESHOLD) tryFire(true);
        else if (pinchAccum < 1 - PINCH_THRESHOLD) tryFire(false);
        return;
      }
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.35 || Math.abs(e.deltaX) < 2) return;
      e.preventDefault();
      horizontalAccum += e.deltaX;
      const now = performance.now();
      if (Math.abs(horizontalAccum) < 72 || now - lastFire < COOLDOWN_MS) return;
      const state = useStore.getState();
      if (horizontalAccum > 0) {
        crossfadeLayers(() => state.future.length ? useStore.getState().redo() : useStore.getState().mosh(), MOSH_FADE_MS);
      } else if (state.past.length) {
        crossfadeLayers(() => useStore.getState().undo(), MOSH_FADE_MS);
      }
      horizontalAccum = 0;
      lastFire = now;
    };

    const onDblClick = (e: MouseEvent) => {
      if (!isFineRef.current) return;
      if (kaossOn) return;
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      crossfadeLayers(mosh, MOSH_FADE_MS);
    };

    // Safari pinch
    const onGestureChange = (e: any) => {
      if (!isFineRef.current) return;
      e.preventDefault();
      const scale = e.scale ?? 1;
      if (scale > 1 + PINCH_THRESHOLD) tryFire(true);
      else if (scale < 1 - PINCH_THRESHOLD) tryFire(false);
    };
    const onGestureStart = (e: any) => { if (isFineRef.current) e.preventDefault(); };

    target.addEventListener("wheel", onWheel, { passive: false });
    target.addEventListener("dblclick", onDblClick);
    target.addEventListener("gesturestart", onGestureStart as any, { passive: false });
    target.addEventListener("gesturechange", onGestureChange as any, { passive: false });
    return () => {
      target.removeEventListener("wheel", onWheel as any);
      target.removeEventListener("dblclick", onDblClick as any);
      target.removeEventListener("gesturestart", onGestureStart as any);
      target.removeEventListener("gesturechange", onGestureChange as any);
    };
  }, [targetRef, mosh, onTogglePerf, kaossOn]);

  return null;
}
