import { useEffect } from "react";
import { useStore } from "@/store/useStore";

const SEEN_KEY = "cathedral_seen_perf_mode";

export function markPerfModeSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
}

export function hasSeenPerfMode(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}

/** Try real Fullscreen API; fall back silently to CSS-fullscreen state. */
export async function enterFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  try {
    if (el.requestFullscreen && !document.fullscreenElement) {
      await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
    }
  } catch { /* fall back to CSS overlay */ }
  try {
    const kb = (navigator as any).keyboard;
    if (kb?.lock) await kb.lock(["Escape"]);
  } catch {}
  try {
    const orient = (screen as any).orientation;
    if (orient?.lock) await orient.lock("landscape").catch(() => {});
  } catch {}
}

export async function exitFullscreen(): Promise<void> {
  try {
    const kb = (navigator as any).keyboard;
    kb?.unlock?.();
  } catch {}
  try {
    const orient = (screen as any).orientation;
    orient?.unlock?.();
  } catch {}
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {}
}

/** Sync browser fullscreen exits back into store. */
export function useFullscreenSync() {
  const setPerf = useStore(s => s.setPerformanceMode);
  const isPerf = useStore(s => s.isPerformanceMode);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && isPerf) setPerf(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [isPerf, setPerf]);
}
