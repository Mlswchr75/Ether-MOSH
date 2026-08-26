import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Upload, Video, Flame, FolderOpen, ChevronUp, ChevronDown, Play, Pause, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import type { SourceMode } from "@/store/types";
import { requestCameraStream, defaultFacing, type CameraError } from "@/hooks/useCamera";
import { loadImageFile } from "@/lib/sourceLoader";
import { sanitizeImageDeck } from "@/lib/photoDeck";

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
  const [deck, setDeck] = useState<File[]>([]);
  const [deckIndex, setDeckIndex] = useState(0);
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckPlaying, setDeckPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [seconds, setSeconds] = useState(5);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const uploadHeldRef = useRef(false);
  const uploadHoldTimerRef = useRef<number | null>(null);

  const showDeckImage = useCallback(async (index: number, files = deck) => {
    const file = files[index];
    if (!file) return false;
    const ok = await loadImageFile(file);
    if (ok) setDeckIndex(index);
    return ok;
  }, [deck]);

  const importDeck = useCallback(async (files: File[]) => {
    const sorted = [...files].sort((a, b) =>
      ((a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name)
        .localeCompare((b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name, undefined, { numeric: true }),
    );
    const { accepted, omitted } = sanitizeImageDeck(sorted);
    if (!accepted.length) {
      toast.error("No usable images found");
      return;
    }
    setDeck(accepted);
    setDeckIndex(0);
    setDeckPlaying(accepted.length > 1);
    setDeckOpen(accepted.length > 1);
    const ok = await showDeckImage(0, accepted);
    if (ok) toast.success(`${accepted.length} photo${accepted.length === 1 ? "" : "s"} loaded${omitted ? ` — ${omitted} skipped for safety` : ""}`);
  }, [showDeckImage]);

  const pick = async (mode: SourceMode) => {
    if (mode === "upload") {
      setSourceMode("upload");
      fileRef.current?.click();
      return;
    }
    if (mode === sourceMode) return;
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

  useEffect(() => {
    const openDeck = () => setDeckOpen(true);
    window.addEventListener("mosh:open-upload-settings", openDeck);
    return () => window.removeEventListener("mosh:open-upload-settings", openDeck);
  }, []);

  useEffect(() => {
    if (!deckPlaying || deck.length < 2) return;
    const timer = window.setTimeout(() => {
      const next = shuffle
        ? (deckIndex + 1 + Math.floor(Math.random() * (deck.length - 1))) % deck.length
        : (deckIndex + 1) % deck.length;
      void showDeckImage(next);
    }, seconds * 1_000);
    return () => window.clearTimeout(timer);
  }, [deckPlaying, deck, deckIndex, seconds, shuffle, showDeckImage]);

  const move = (from: number, delta: -1 | 1) => {
    const to = from + delta;
    if (to < 0 || to >= deck.length) return;
    const next = [...deck];
    [next[from], next[to]] = [next[to], next[from]];
    setDeck(next);
    if (deckIndex === from) setDeckIndex(to);
    else if (deckIndex === to) setDeckIndex(from);
  };

  const startUploadHold = () => {
    uploadHeldRef.current = false;
    if (uploadHoldTimerRef.current) window.clearTimeout(uploadHoldTimerRef.current);
    uploadHoldTimerRef.current = window.setTimeout(() => {
      uploadHeldRef.current = true;
      setDeckOpen(true);
      try { (navigator as Navigator & { vibrate?: (pattern: number) => boolean }).vibrate?.(15); } catch {}
    }, 450);
  };
  const endUploadHold = () => {
    if (uploadHoldTimerRef.current) window.clearTimeout(uploadHoldTimerRef.current);
    uploadHoldTimerRef.current = null;
  };

  return (
    <>
    {!hidden && <div className="ui-chrome pointer-events-auto absolute top-3 left-3 z-40 flex items-center gap-2.5 safe-top safe-left">
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
            onClick={() => { if (m === "upload" && uploadHeldRef.current) return; void pick(m); }}
            onPointerDown={m === "upload" ? startUploadHold : undefined}
            onPointerUp={m === "upload" ? endUploadHold : undefined}
            onPointerLeave={m === "upload" ? endUploadHold : undefined}
            onPointerCancel={m === "upload" ? endUploadHold : undefined}
            aria-label={`${meta.label}${active ? " (active)" : ""}`}
            aria-pressed={active}
            title={m === "upload" ? "Upload — hold for photo deck" : meta.label}
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
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void importDeck(files);
        }}
      />
    </div>}

    {deckOpen && (
      <div className="pointer-events-auto fixed inset-0 z-[90] flex items-end justify-center bg-black/25 p-3 backdrop-blur-[1px] sm:items-center" onPointerDown={(e) => { if (e.target === e.currentTarget) setDeckOpen(false); }}>
        <section aria-label="Photo deck settings" className="max-h-[78dvh] w-full max-w-sm overflow-hidden rounded-lg border border-white/20 bg-black/90 text-white shadow-2xl backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.18em]">Photo deck</h2>
              <p className="mt-0.5 text-[10px] text-white/50">{deck.length ? `${deck.length} loaded · ${deckIndex + 1} active` : "Choose photos or a folder"}</p>
            </div>
            <button type="button" onClick={() => setDeckOpen(false)} aria-label="Close photo deck" className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </header>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 rounded border border-white/15 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wider hover:bg-white/10"><Upload className="h-3.5 w-3.5" /> photos</button>
              <button type="button" onClick={() => folderRef.current?.click()} className="flex items-center justify-center gap-2 rounded border border-white/15 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wider hover:bg-white/10"><FolderOpen className="h-3.5 w-3.5" /> folder</button>
            </div>

            {deck.length > 1 && <>
              <div className="flex items-center gap-2">
                <button type="button" aria-pressed={deckPlaying} onClick={() => setDeckPlaying(v => !v)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--primary))]/50 text-[hsl(var(--primary))]">{deckPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                <button type="button" aria-pressed={shuffle} onClick={() => setShuffle(v => !v)} className={`flex flex-1 items-center justify-center gap-2 rounded border px-3 py-2 font-mono text-[10px] uppercase tracking-wider ${shuffle ? "border-[hsl(var(--accent))]/70 bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]" : "border-white/15 text-white/60"}`}><Shuffle className="h-3.5 w-3.5" /> {shuffle ? "shuffle" : "in order"}</button>
              </div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-white/60">
                change every <span className="text-white">{seconds.toFixed(1)}s</span>
                <input type="range" min="1" max="20" step="0.5" value={seconds} onChange={e => setSeconds(Number(e.target.value))} className="mt-2 w-full accent-[hsl(var(--primary))]" />
              </label>
              <ol className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {deck.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${index === deckIndex ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-white/10"}`}>
                    <button type="button" onClick={() => void showDeckImage(index)} className="min-w-0 flex-1 truncate text-left text-[11px] text-white/75"><span className="mr-2 font-mono text-white/35">{index + 1}</span>{file.name}</button>
                    <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${file.name} up`} className="p-1 text-white/45 disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={index === deck.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${file.name} down`} className="p-1 text-white/45 disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ol>
            </>}
            <p className="text-[9px] leading-relaxed text-white/35">Up to 60 images, 40 MB each, 250 MB total. Photos stay on this device.</p>
          </div>
        </section>
      </div>
    )}

    <input
      ref={folderRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
      onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void importDeck(files); }}
    />
    </>
  );
}
