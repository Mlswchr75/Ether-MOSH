/**
 * Overlay mode — MOSH as a layer in someone else's scene.
 *
 * Driven entirely by the URL so it can be pasted straight into an OBS browser
 * source, an iframe, or a projection machine's kiosk shortcut. There is no UI
 * for it on purpose: the whole point is a window with no chrome that a
 * compositor can sit on top of something else.
 *
 *   ?overlay=luma      keep the light, drop the black   (default for `?overlay=1`)
 *   ?overlay=subject   keep the person, drop the room
 *   ?overlay=off       normal app
 *
 * Optional tuning: &gate=0..1 (where the cut falls) and &soft=0..1 (how hard
 * the edge is).
 */

export type OverlayMode = "off" | "subject" | "luma";

export type OverlayConfig = {
  mode: OverlayMode;
  gate?: number;
  soft?: number;
};

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : NaN);

/** Parse overlay settings out of a URL. Never throws; unknown values are off. */
export function overlayFromUrl(href?: string): OverlayConfig {
  try {
    const h = href ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!h) return { mode: "off" };
    const q = new URL(h).searchParams;
    const raw = (q.get("overlay") ?? "").trim().toLowerCase();

    let mode: OverlayMode = "off";
    // "1"/"true"/"on" are accepted because they are what people type; luma is
    // the safer default of the two since it depends on nothing being tracked.
    if (raw === "1" || raw === "true" || raw === "on" || raw === "luma") mode = "luma";
    else if (raw === "subject" || raw === "person" || raw === "depth") mode = "subject";

    if (mode === "off") return { mode };

    const gate = clamp01(parseFloat(q.get("gate") ?? ""));
    const soft = clamp01(parseFloat(q.get("soft") ?? ""));
    return {
      mode,
      ...(Number.isFinite(gate) ? { gate } : {}),
      ...(Number.isFinite(soft) ? { soft } : {}),
    };
  } catch {
    return { mode: "off" };
  }
}

/** Class the document carries while overlaying, so CSS can strip the backdrop. */
export const OVERLAY_CLASS = "mosh-overlay";

export function applyOverlayClass(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(OVERLAY_CLASS, active);
}
