/**
 * Camera facing helpers.
 *
 * Deliberately dependency-free and separate from `hooks/useCamera`: the store
 * needs `facingOfTrack`, and useCamera imports the store, so putting this in
 * useCamera creates a runtime import cycle. (It was previously safe only
 * because the store's import was `import type`, which is erased at build time.)
 */

export type CameraFacing = "user" | "environment";

/**
 * What camera a live track actually ended up on.
 *
 * `getUserMedia` will happily hand back a camera that isn't the one asked for,
 * so the only trustworthy answer comes from the track itself.
 */
export function facingOfTrack(track: MediaStreamTrack | undefined | null): CameraFacing | null {
  if (!track) return null;
  const settings = track.getSettings?.() as (MediaTrackSettings & { facingMode?: string }) | undefined;
  const fm = settings?.facingMode;
  if (fm === "user" || fm === "environment") return fm;
  // Desktop webcams and some Android browsers omit facingMode entirely; the
  // device label is the usual fallback and conventionally names the side.
  const label = (track.label || "").toLowerCase();
  if (/front|user|face/.test(label)) return "user";
  if (/back|rear|environment/.test(label)) return "environment";
  return null;
}
