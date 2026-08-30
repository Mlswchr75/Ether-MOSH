export function isMetaQuestUserAgent(userAgent: string): boolean {
  return /OculusBrowser|Meta Quest|Quest(?: 2| 3| Pro)?|Oculus/i.test(userAgent);
}

/** VR chrome is intentionally opt-in outside an actual Quest/Oculus browser.
 * Some ordinary Android/desktop browsers expose partial WebXR support; probing
 * and rendering immersive controls there adds work to the hot render path and
 * makes Forge look like it has VR bolted on even when nobody asked for it. */
export const XR_UI_OVERRIDE_KEY = "cathedral_xr_ui_override_v1";
export const XR_UI_OVERRIDE_EVENT = "mosh:xr-ui-override";
export type XrUiOverride = "auto" | "on" | "off";

export function readXrUiOverride(storage?: Pick<Storage, "getItem"> | null): XrUiOverride {
  try {
    const value = storage?.getItem(XR_UI_OVERRIDE_KEY);
    return value === "on" || value === "off" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function shouldOfferXrUi(userAgent: string, override: XrUiOverride = "auto"): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return isMetaQuestUserAgent(userAgent);
}

export type XrExperienceMode = "visualizer" | "room";

export function sessionModeForExperience(mode: XrExperienceMode): XRSessionMode {
  return mode === "room" ? "immersive-ar" : "immersive-vr";
}

/** Quest's browser can expose the avatar selfie camera as the only ordinary
 * getUserMedia device. Never treat that virtual camera as a room-facing feed. */
export function isQuestAvatarCamera(label: string): boolean {
  return /avatar|selfie/i.test(label);
}

/** Quest Touch controllers commonly expose the thumbstick as axes 2/3, while
 * some WebXR runtimes expose it as 0/1. Accept either layout. */
export function hasHorizontalThumbstickFlick(axes: readonly number[], threshold = 0.85): boolean {
  for (let i = 0; i < axes.length; i += 2) {
    if (Math.abs(axes[i] ?? 0) >= threshold) return true;
  }
  return false;
}

export function isThumbstickCentered(axes: readonly number[], deadzone = 0.35): boolean {
  for (let i = 0; i < axes.length; i += 2) {
    if (Math.abs(axes[i] ?? 0) > deadzone || Math.abs(axes[i + 1] ?? 0) > deadzone) return false;
  }
  return true;
}

/** Three's WebXRManager must be disabled while MOSH runs its orthographic
 * post-processing passes, then restored before the headset scene is drawn. */
export function runFlatRenderPass(xr: { enabled: boolean }, render: () => void): void {
  const wasEnabled = xr.enabled;
  xr.enabled = false;
  try {
    render();
  } finally {
    xr.enabled = wasEnabled;
  }
}

export function resolveXrTextureSize(hardwareConcurrency: number, maxTextureSize: number): { width: number; height: number } {
  const targetWidth = hardwareConcurrency <= 4 ? 1536 : 2048;
  const width = Math.max(1, Math.min(targetWidth, maxTextureSize));
  return { width, height: Math.round(width / 2) };
}
