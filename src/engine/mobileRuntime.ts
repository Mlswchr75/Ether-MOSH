export type MobileSessionState = { pathname: string; visible: boolean; fullscreen: boolean };

export function isVisualRoute(pathname: string): boolean {
  return pathname === "/edit" || pathname === "/forge" || pathname.startsWith("/edit/");
}

export function shouldMaintainSession(state: MobileSessionState): boolean {
  return state.visible && (state.fullscreen || isVisualRoute(state.pathname));
}

let wakeLock: any = null;
let installed = false;

function publishConnectivity() {
  document.documentElement.dataset.network = navigator.onLine ? "online" : "offline";
  window.dispatchEvent(new CustomEvent("mosh:network", { detail: { online: navigator.onLine } }));
}

async function releaseWakeLock() {
  const lock = wakeLock;
  wakeLock = null;
  try { await lock?.release?.(); } catch {}
}

async function syncWakeLock() {
  const state: MobileSessionState = {
    pathname: window.location.pathname,
    visible: document.visibilityState === "visible",
    fullscreen: !!document.fullscreenElement,
  };
  if (!shouldMaintainSession(state)) {
    await releaseWakeLock();
    return;
  }
  if (wakeLock || !("wakeLock" in navigator)) return;
  try {
    wakeLock = await (navigator as any).wakeLock.request("screen");
    wakeLock?.addEventListener?.("release", () => { wakeLock = null; }, { once: true });
  } catch {
    // Wake Lock is optional and may be refused in battery-saver/background mode.
  }
}

/**
 * Small browser/native-shell compatibility layer. It intentionally uses only
 * standard web APIs so the same React build works as a PWA today and inside a
 * Capacitor WebView later without forking the runtime.
 */
export function installMobileRuntime() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  publishConnectivity();
  window.addEventListener("online", publishConnectivity);
  window.addEventListener("offline", publishConnectivity);

  const sync = () => { void syncWakeLock(); };
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("fullscreenchange", sync);
  window.addEventListener("popstate", sync);
  window.addEventListener("pagehide", () => { void releaseWakeLock(); });

  // Browsers generally require a user gesture before granting wake lock. The
  // first interaction in the visualizer is the natural permission boundary.
  window.addEventListener("pointerdown", sync, { passive: true });
  window.addEventListener("keydown", sync);
}
