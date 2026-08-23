import { trackPlayer } from "./trackPlayer";
import { useStore } from "@/store/useStore";
import { toast } from "sonner";

/**
 * Runs a trackPlayer navigation action (next/prev/shuffleShowcaseTrack) and
 * syncs the store's trackTitle/trackArtist/trackEnabled from trackPlayer's
 * own internal state afterward.
 *
 * Those methods update trackPlayer directly, not the store — the store only
 * finds out via this explicit sync. Every caller needs the same two-step
 * dance (call, then sync), so it lives here once instead of being
 * duplicated between the transport-row buttons (HotTriggers.tsx) and the
 * `[`/`]`/`\` keyboard shortcuts (Editor.tsx), which would otherwise be
 * free to drift out of sync with each other.
 */
export async function runTrackAction(action: () => Promise<void>): Promise<boolean> {
  try {
    await action();
    useStore.getState().setTrackMeta(trackPlayer.title, trackPlayer.artist);
    useStore.getState().setTrackEnabled(true);
    return true;
  } catch (err) {
    console.error("[track] action failed:", err);
    toast.error("Couldn't play that track");
    return false;
  }
}
