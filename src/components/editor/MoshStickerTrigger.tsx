/**
 * The clip hot trigger: opens the upload/capture menu that seeds a new mosh
 * sticker, plus a caret "branch" that instantly shows/hides the whole placed
 * stack like a light switch — independent of the menu, and present in every
 * SourceMode since it lives in HotTriggers' always-mounted rail.
 */
import { useEffect, useRef, useState } from "react";
import { Power, Sticker, Square, Upload, Video, X } from "lucide-react";
import { requestCameraStream } from "@/hooks/useCamera";
import { clipFromBlob, ClipRecorder, loadClipFile } from "@/lib/clipLoader";
import { MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, useMoshStickerStore } from "@/store/moshStickerStore";
import { TrimScrubber } from "./TrimScrubber";

type Mode = "closed" | "menu" | "recording";

export function MoshStickerTrigger({ delay, variant = "trigger" }: { delay: number; variant?: "trigger" | "panel" }) {
  const enabled = useMoshStickerStore(s => s.enabled);
  const setEnabled = useMoshStickerStore(s => s.setEnabled);
  const stickers = useMoshStickerStore(s => s.stickers);
  const pendingTrim = useMoshStickerStore(s => s.pendingTrim);
  const setPendingTrim = useMoshStickerStore(s => s.setPendingTrim);
  const confirmTrim = useMoshStickerStore(s => s.confirmTrim);
  const cancelPendingClip = useMoshStickerStore(s => s.cancelPendingClip);
  const addSticker = useMoshStickerStore(s => s.addSticker);

  const [mode, setMode] = useState<Mode>("closed");
  const [elapsed, setElapsed] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<ClipRecorder | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);

  const open = mode !== "closed" || !!pendingTrim;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        if (mode === "recording") stopRecording();
        setMode("closed");
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const clearTimers = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (autoStopRef.current) { window.clearTimeout(autoStopRef.current); autoStopRef.current = null; }
  };

  const stopRecording = async () => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      const blob = await recorder.stop();
      stopStream();
      setMode("closed");
      const clip = await clipFromBlob(blob);
      addSticker(clip);
    } else {
      stopStream();
      setMode("closed");
    }
  };

  const cancelRecording = () => {
    clearTimers();
    stopStream();
    setMode("closed");
  };

  const startRecording = async () => {
    try {
      const stream = await requestCameraStream();
      streamRef.current = stream;
      setMode("recording");
      setElapsed(0);
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
      const recorder = new ClipRecorder();
      recorder.start(stream);
      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      tickRef.current = window.setInterval(() => {
        setElapsed((performance.now() - startedAtRef.current) / 1000);
      }, 100);
      autoStopRef.current = window.setTimeout(() => { stopRecording(); }, MAX_CLIP_SECONDS * 1000);
    } catch {
      setMode("closed");
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const clip = await loadClipFile(file);
    if (!clip) return;
    setMode("closed");
    if (clip.kind === "video" && clip.duration > MAX_CLIP_SECONDS) {
      setPendingTrim({ clip });
    } else {
      addSticker(clip);
    }
  };

  return (
    <div ref={wrapRef} className={variant === "panel" ? "relative flex-1" : "relative"} data-shuffle-picker>
      <button
        type="button"
        aria-label="Add mosh sticker — upload or capture a short clip"
        aria-pressed={open || undefined}
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        title="Add mosh sticker — a short looping clip you can place, resize, rotate and mosh"
        data-active={open || undefined}
        data-no-longpress
        className={variant === "panel"
          ? "flex w-full items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-white/65 transition hover:border-white/30 hover:text-white"
          : "hot-trigger"}
        style={{ animationDelay: `${delay}ms` }}
        onClick={() => setMode(m => (m === "closed" ? "menu" : "closed"))}
      >
        {variant === "trigger" && <span className="hot-trigger__glitch" aria-hidden><Sticker className="h-4 w-4" strokeWidth={1.5} /></span>}
        <span className={variant === "trigger" ? "hot-trigger__ico" : "flex items-center gap-1.5"}><Sticker className="h-4 w-4" strokeWidth={1.5} />{variant === "panel" && "Video / GIF clip"}</span>
        {stickers.length > 0 && (
          <span className="absolute -bottom-1 -right-1 rounded-sm bg-[hsl(var(--accent))] px-1 font-mono text-[8px] leading-[10px] text-black">
            {stickers.length}
          </span>
        )}
      </button>

      {stickers.length > 0 && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setEnabled(!enabled)}
          aria-label={enabled ? "Hide all mosh stickers" : "Show all mosh stickers"}
          aria-pressed={enabled}
          data-no-longpress
          className={`absolute -top-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-black/70 transition ${enabled ? "text-[hsl(var(--accent))]" : "text-white/40"}`}
          title={enabled ? "Mosh stickers ON — tap to hide" : "Mosh stickers OFF — tap to show"}
        >
          <Power className="h-2 w-2" strokeWidth={3} />
        </button>
      )}

      {mode === "menu" && (
        <div
          className={`panel-in-3d absolute z-[80] w-48 rounded-sm border border-[hsl(var(--border-default))] bg-black/95 p-2 backdrop-blur-md ${variant === "panel" ? "right-0 top-full mt-2" : "right-full top-0 mr-2"}`}
          role="menu"
          aria-label="Add mosh sticker"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            data-no-longpress
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
          >
            <Upload className="h-3 w-3" /> upload clip
          </button>
          <button
            type="button"
            role="menuitem"
            data-no-longpress
            onClick={startRecording}
            className="mt-1 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
          >
            <Video className="h-3 w-3" /> record clip
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/gif"
            hidden
            onChange={onFileChange}
          />
        </div>
      )}

      {mode === "recording" && (
        <div
          className={`panel-in-3d absolute z-[80] w-56 rounded-sm border border-[hsl(var(--border-default))] bg-black/95 p-2 backdrop-blur-md ${variant === "panel" ? "right-0 top-full mt-2" : "right-full top-0 mr-2"}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full rounded-sm bg-black" />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-red-400">
              ● {elapsed.toFixed(1)}s / {MAX_CLIP_SECONDS}s
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-no-longpress
                onClick={cancelRecording}
                aria-label="Cancel"
                className="rounded-sm border border-transparent p-1 text-white/60 hover:border-destructive hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-no-longpress
                disabled={elapsed < MIN_CLIP_SECONDS}
                onClick={stopRecording}
                aria-label="Stop recording"
                title={elapsed < MIN_CLIP_SECONDS ? `Hold for ${MIN_CLIP_SECONDS}s minimum` : "Stop recording"}
                className="rounded-sm border border-transparent p-1 text-[hsl(var(--accent))] disabled:opacity-30"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingTrim && (
        <div
          className={variant === "panel" ? "absolute right-0 top-full z-[80] mt-2" : "absolute right-full top-0 z-50 mr-2"}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <TrimScrubber
            clip={pendingTrim.clip}
            onConfirm={confirmTrim}
            onCancel={cancelPendingClip}
          />
        </div>
      )}
    </div>
  );
}
