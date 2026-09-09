import { ShareButton, type ShareDetails } from "@/components/ShareSheet";

/**
 * The radio's share affordance.
 *
 * The panel behind this used to live here, and it was the best sharing surface
 * in the app while being reachable from exactly one screen. It now lives in
 * `components/ShareSheet.tsx` and sits behind every share in the app; this is
 * the same button with the station's own wording.
 */
export function RadioShareTag({ className = "", ...details }: Omit<ShareDetails, "text" | "linkLabel"> & { className?: string }) {
  return <ShareButton {...details} text="Listen on MOSH Radio" linkLabel="Shareable radio link" className={className} />;
}
