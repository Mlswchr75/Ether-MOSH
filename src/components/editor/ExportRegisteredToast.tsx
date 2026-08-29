import { Camera, Download, Film, Grid3x3, Image as ImageIcon, Share2, Sparkles, Sticker } from "lucide-react";
import { toast } from "sonner";

/**
 * Every distinct export/download action in the app, for the one shared
 * "your export was registered" toast and the settings panel it opens into.
 * New export paths should be added here rather than inventing their own
 * one-off confirmation — that's the whole point of centralizing this.
 */
export type ExportKind =
  | "screenshot" | "share" | "gif" | "video" | "print"
  | "forge-tile" | "motif-tile" | "seamless-tile" | "sticker";

export const EXPORT_KIND_META: Record<ExportKind, { label: string; Icon: typeof Camera }> = {
  screenshot: { label: "Screenshot", Icon: Camera },
  share: { label: "Share", Icon: Share2 },
  gif: { label: "GIF", Icon: ImageIcon },
  video: { label: "Recording", Icon: Film },
  print: { label: "Print-ready still", Icon: Download },
  "forge-tile": { label: "Forge tile", Icon: Sparkles },
  "motif-tile": { label: "Motif tile", Icon: Grid3x3 },
  "seamless-tile": { label: "Seamless tile", Icon: Grid3x3 },
  sticker: { label: "Sticker", Icon: Sticker },
};

/** Opens the Export Settings popup — a plain window event so this reaches
 *  Editor.tsx from anywhere (this module, toast content, a future call
 *  site) without needing to thread a callback through every export
 *  function. Same pattern as useIdleFade's markUiActive(). */
export function openExportSettings() {
  window.dispatchEvent(new CustomEvent("mosh:open-export-settings"));
}

function ExportToastContent({ kind, id }: { kind: ExportKind; id: string | number }) {
  const { label, Icon } = EXPORT_KIND_META[kind];
  return (
    <button
      type="button"
      onClick={() => { toast.dismiss(id); openExportSettings(); }}
      aria-label={`${label} export started — open export settings`}
      title="Open export settings"
      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/80 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/70 backdrop-blur-md transition hover:border-[hsl(var(--accent))]/40 hover:text-white"
    >
      <Icon className="h-3 w-3 shrink-0 text-[hsl(var(--accent))]" strokeWidth={1.5} />
      {label} started
    </button>
  );
}

/**
 * Fires immediately when an export/download action is initiated — before
 * any async encode/capture work — so the tap or click is acknowledged right
 * away regardless of how long the actual export takes. Deliberately
 * separate from (and lighter than) the existing per-export completion
 * toasts (`showExportSuccessToast`, `toast.success("Screenshot saving…")`,
 * etc.): this is a universal, uniform "got it" for every export path, those
 * remain the export-specific "here's what you got" follow-up.
 *
 * Uses the Toaster's default top-center position (see src/App.tsx /
 * components/ui/sonner.tsx) rather than inventing a new spot — that
 * position is already where every other toast in the app safely lives,
 * clear of the radial wheel (which opens centered on wherever the user
 * long-pressed, not pinned to a screen edge) and every corner-anchored
 * panel (ForgePanel/MotifPanel top-left, the mic-nudge toast bottom-right,
 * the chrome-pin button top-right).
 */
export function notifyExportStarted(kind: ExportKind) {
  toast.custom(id => <ExportToastContent kind={kind} id={id} />, { duration: 1600 });
}
