import type { RadioBroadcast } from "@/hooks/useRadioBroadcast";
import type { RadioStatus } from "@/engine/radioSession";
import type { ShowcaseTrack, trackPlayer } from "@/engine/trackPlayer";

/**
 * RadioHud's props.
 *
 * The module was already imported from `@/types/radio`, but the file had
 * never landed, so `npm run typecheck` — and with it the security gate that
 * runs it — has been failing on every branch. The shape here is read straight
 * off RadioHud's own destructuring and its call site in Editor.tsx, so this
 * describes what the component already does rather than changing it.
 */
export type RadioHudProps = {
  radio: RadioBroadcast;
  /** The shared player singleton; the HUD only reads its volume. */
  trackPlayer?: typeof trackPlayer;
  status?: RadioStatus;
  nowPlaying?: ShowcaseTrack | null;
  upNext?: ShowcaseTrack | null;
  onOpenControls?: () => void;
};
