import { useEffect } from "react";
import { useStore } from "@/store/useStore";

const SEEN_KEY = "cathedral_seen_perf_mode";

export function markPerfModeSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
}

export function hasSeenPerfMode(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}

/**
 * Try the real Fullscreen API on the given element, then retry on
 * document.documentElement if that fails or the element doesn't have the
 * capability — some browsers only reliably suppress their own chrome
 * (address bar, nav bar) for the true document root, not a nested element,
 * even though both are valid fullscreen targets per spec. Falls back
 * silently to the CSS-fullscreen state (.editor-shell's `fixed inset-0`)
 * if neither request succeeds — that fallback always fills 100% of
 * whatever viewport space is actually available, so the page never looks
 * broken even when the browser won't relinquish its own chrome.
 */
export async function enterFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  if (!document.fullscreenElement) {
    let entered = false;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
        entered = true;
      }
    } catch { /* try the broader target below */ }
    if (!entered && el !== document.documentElement) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
        }
      } catch { /* fall back to CSS overlay */ }
    }
  }
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
