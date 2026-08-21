import { useEffect, useRef, useState } from "react";
import { Upload, Video, Flame } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import type { SourceMode } from "@/store/types";
import { requestCameraStream, defaultFacing, type CameraError } from "@/hooks/useCamera";
import { loadImageFile } from "@/lib/sourceLoader";

/** Matches the title screen's Upload / Video / Flame trio — same icons, same
 *  primary-vs-accent coloring — so this reads as the same instrument
 *  reappearing in the editor's corner rather than a different control. */
const MODE_META: Record<SourceMode, { label: string; icon: typeof Upload; tint: "primary" | "accent" }> = {
  upload: { label: "Upload", icon: Upload, tint: "primary" },
  camera: { label: "Camera", icon: Video, tint: "accent" },
  forge: { label: "Forge", icon: Flame, tint: "accent" },
};

const CAMERA_ERR: Record<CameraError, string> = {
  permission: "Camera blocked — allow it in your browser and try again",
  busy: "Camera is in use by another app — close it and try again",
  notfound: "No camera found on this device",
  aborted: "Camera start was interrupted — tap again",
  unsupported: "This browser can't access the camera",
  unknown: "Couldn't access camera — try again",
};

type Props = {
  /** Pro Mode / the manual full-hide (hideUI) drives this from Editor.tsx —
   *  same "persistent chrome that still disappears on demand" contract as
   *  AboutTrigger. */
  hidden?: boolean;
};

/**
 * Which source feeds the renderer — upload, camera, or forge. Always three
 * separate buttons (not a collapsed dropdown) so it reads as the title
 * screen's own trio persisting into the editor, not a settings menu.
 * Idle-fades with the rest of the chrome (`.ui-chrome`) and hides fully
 * whenever the rest of the menu does (`hidden`) — U/L/Y keyboard shortcuts
 * (see Editor.tsx's onKey) reach the same three modes without needing this
 * visible at all.
 */
export function SourceModeToggle({ hidden = false }: Props) {
  const sourceMode = useStore(s => s.sourceMode);
  const setSourceMode = useStore(s => s.setSourceMode);
  const setVideoSource = useStore(s => s.setVideoSource);
  const randomiseForge = useStore(s => s.randomiseForge);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (mode: SourceMode) => {
    if (mode === sourceMode) return;

    if (mode === "upload") {
      setSourceMode("upload");
      fileRef.current?.click();
      return;
    }
    if (mode === "camera") {
      setStarting(true);
      try {
        const facing = defaultFacing();
        const stream = await requestCameraStream({ facing });
        setVideoSource(stream, facing === "user" ? "front camera" : "rear camera");
      } catch (err) {
        const tag = (err as { cameraError?: CameraError }).cameraError ?? "unknown";
        toast.error(CAMERA_ERR[tag]);
      } finally {
        setStarting(false);
      }
      return;
    }
    setSourceMode("forge");
    if (!useStore.getState().forge.stack.length) randomiseForge();
  };

  // U / L / Y keyboard shortcuts (Editor.tsx onKey) dispatch this instead of
  // calling pick() directly — it's the one function that already handles
  // camera permission errors and the forge auto-randomize, so both paths
  // (click and keyboard) go through the exact same logic.
  useEffect(() => {
    const onSwitch = (e: Event) => {
      const mode = (e as CustomEvent<SourceMode>).detail;
      if (mode) pick(mode);
    };
    window.addEventListener("mosh:switch-mode", onSwitch);
    return () => window.removeEventListener("mosh:switch-mode", onSwitch);
  }, [sourceMode]);

  if (hidden) return null;

  return (
    <div className="ui-chrome pointer-events-auto absolute top-3 left-3 z-40 flex items-center gap-2.5 safe-top safe-left">
      {(Object.keys(MODE_META) as SourceMode[]).map((m) => {
        const meta = MODE_META[m];
        const Icon = meta.icon;
        const active = sourceMode === m;
        const isPrimary = meta.tint === "primary";
        const busy = m === "camera" && starting;
        return (
          <button
            key={m}
            type="button"
            onClick={() => pick(m)}
            aria-label={`${meta.label}${active ? " (active)" : ""}`}
            aria-pressed={active}
            title={meta.label}
            disabled={busy}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border bg-background/30 backdrop-blur-[2px] transition hover:scale-105 disabled:opacity-60 disabled:hover:scale-100"
            style={{
              borderColor: isPrimary
                ? `hsl(var(--primary) / ${active ? 0.9 : 0.5})`
                : `hsl(var(--accent) / ${active ? 0.9 : 0.5})`,
              color: isPrimary ? "hsl(var(--primary))" : "hsl(var(--accent))",
              boxShadow: active
                ? `0 0 22px hsl(var(${isPrimary ? "--primary" : "--accent"}) / 0.55)`
                : `0 0 10px hsl(var(${isPrimary ? "--primary" : "--accent"}) / 0.25)`,
            }}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            {active && (
              <span
                className="pointer-events-none absolute inset-0 rounded-full ring-1 animate-pulse-soft"
                style={{ boxShadow: `inset 0 0 12px hsl(var(${isPrimary ? "--primary" : "--accent"}) / 0.3)` }}
              />
            )}
          </button>
        );
      })}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const ok = await loadImageFile(f);
          if (ok) toast.success("Image loaded — moshing…");
        }}
      />
    </div>
  );
}
