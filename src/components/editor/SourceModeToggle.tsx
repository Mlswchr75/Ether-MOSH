import { useEffect, useRef, useState } from "react";
import { Upload, Video, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import type { SourceMode } from "@/store/types";
import { requestCameraStream, defaultFacing, type CameraError } from "@/hooks/useCamera";
import { loadImageFile } from "@/lib/sourceLoader";

const MODE_META: Record<SourceMode, { label: string; icon: typeof Upload }> = {
  upload: { label: "Upload", icon: Upload },
  camera: { label: "Camera", icon: Video },
  forge: { label: "Forge", icon: Wand2 },
};

const CAMERA_ERR: Record<CameraError, string> = {
  permission: "Camera blocked — allow it in your browser and try again",
  busy: "Camera is in use by another app — close it and try again",
  notfound: "No camera found on this device",
  aborted: "Camera start was interrupted — tap again",
  unsupported: "This browser can't access the camera",
  unknown: "Couldn't access camera — try again",
};

/**
 * Which source feeds the renderer — upload, camera, or forge. Idle-fades
 * with the rest of the chrome (`.ui-chrome`), same as everything else in the
 * editor — U/L/Y keyboard shortcuts (see Editor.tsx's onKey) reach the same
 * three modes without needing this visible, so idle-fade no longer needs an
 * exemption here.
 */
export function SourceModeToggle() {
  const sourceMode = useStore(s => s.sourceMode);
  const setSourceMode = useStore(s => s.setSourceMode);
  const setVideoSource = useStore(s => s.setVideoSource);
  const randomiseForge = useStore(s => s.randomiseForge);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = async (mode: SourceMode) => {
    setOpen(false);
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

  const Icon = MODE_META[sourceMode].icon;

  return (
    <div ref={wrapRef} className="ui-chrome pointer-events-auto absolute top-3 left-3 z-40 safe-top safe-left">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Source: ${MODE_META[sourceMode].label} — tap to switch`}
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        title="Switch source — upload, camera, or forge"
        disabled={starting}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 backdrop-blur-md transition hover:border-[hsl(var(--accent))]/60 disabled:opacity-60"
      >
        <Icon className="h-4 w-4 text-[hsl(var(--accent))]" strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/85">
          {starting ? "starting…" : MODE_META[sourceMode].label}
        </span>
      </button>

      {open && (
        <div
          className="panel-in-3d absolute left-0 top-full z-40 mt-2 flex items-center gap-1 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-1 backdrop-blur-md"
          role="menu"
          aria-label="Source mode"
        >
          {(Object.keys(MODE_META) as SourceMode[]).map((m) => {
            const MIcon = MODE_META[m].icon;
            return (
              <button
                key={m}
                type="button"
                role="menuitem"
                onClick={() => pick(m)}
                data-active={sourceMode === m || undefined}
                className="flex min-w-[56px] flex-col items-center gap-1 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] data-[active]:border-[hsl(var(--accent))] data-[active]:text-[hsl(var(--accent))]"
              >
                <MIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                {MODE_META[m].label}
              </button>
            );
          })}
        </div>
      )}

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
