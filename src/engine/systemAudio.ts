/**
 * Helper for the device-audio toggle.
 *
 * `getDisplayMedia` MUST be called synchronously inside a user gesture or
 * Safari/Chrome will reject it ("invalid capture"). This helper is invoked
 * directly from the click handler, acquires the stream, stashes it on
 * `window.__aegisPendingSystemStream`, and only then flips the store flag —
 * which lets `GlCanvas` pick the stream up and wire it into the analyzer.
 */
import { useStore } from "@/store/useStore";
import { toast } from "sonner";

export async function toggleSystemAudio(): Promise<void> {
  const enabled = useStore.getState().systemAudioEnabled;
  if (enabled) {
    useStore.getState().setSystemAudioEnabled(false);
    return;
  }
  const md = navigator.mediaDevices as any;
  if (!md?.getDisplayMedia) {
    toast.error("System audio capture not supported on this device");
    return;
  }
  try {
    // SYNCHRONOUS — must stay inside the original click handler's microtask.
    // NOTE: Some browsers (Safari, older Chrome) reject advanced audio
    // constraints with "Invalid capture constraints". Use the minimal,
    // universally-accepted shape: { video: true, audio: true }. video:true
    // is required because most browsers refuse audio-only display capture.
    let stream: MediaStream;
    try {
      stream = await md.getDisplayMedia({ video: true, audio: true });
    } catch (e: any) {
      // Retry once with the bare minimum in case the first call tripped on
      // an unknown advanced constraint shape.
      if (e?.name === "TypeError" || /constraint/i.test(e?.message || "")) {
        stream = await md.getDisplayMedia({ video: true, audio: true });
      } else {
        throw e;
      }
    }
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach(t => t.stop());
      toast.error("No audio shared — re-share and tick 'Share audio'");
      return;
    }
    // Detect self-capture: if the user picked THIS tab, Chrome paints a
    // persistent "Sharing this tab" banner that overlays even fullscreen.
    // We can't hide browser chrome, but we can warn the user to re-share
    // a different tab / window so MOSH stays clean.
    try {
      const vt = stream.getVideoTracks()[0];
      const settings: any = vt?.getSettings?.() ?? {};
      const labelMatch = /this tab|current tab/i.test(vt?.label || "");
      if (settings.displaySurface === "browser" && labelMatch) {
        toast("Tip: share the music tab (not this one) to hide Chrome's sharing banner", { duration: 6000 });
      }
    } catch {}
    (window as any).__aegisPendingSystemStream = stream;
    useStore.getState().setSystemAudioEnabled(true);
  } catch (err: any) {
    console.error("[device-audio] getDisplayMedia failed:", err);
    if (err?.name === "NotAllowedError") {
      toast.error("Screen share permission denied");
    } else {
      toast.error(err?.message || "Couldn't capture system audio");
    }
  }
}
