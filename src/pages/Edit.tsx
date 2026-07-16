import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useHotkeys } from "react-hotkeys-hook";
import { ArrowLeft, Undo2, Redo2, Dices, Download, Layers, SlidersHorizontal, CircleDot, Square, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import type { Intensity } from "@/store/types";
import type { MoshRenderer } from "@/engine/Renderer";
import { haptic } from "@/hooks/useHaptics";
import { exportPNG, CanvasRecorder } from "@/lib/exportMedia";
import { CanvasStage } from "@/components/edit/CanvasStage";
import { EffectLibrary } from "@/components/edit/EffectLibrary";
import { LayerStack } from "@/components/edit/LayerStack";
import { AudioPanel } from "@/components/edit/AudioPanel";
import { CameraMenu } from "@/components/edit/CameraMenu";

const INTENSITIES: Intensity[] = ["mild", "savage", "nuclear", "interdimensional"];

type Sheet = "fx" | "stack" | null;

/**
 * The instrument. Full-viewport canvas; desktop gets a persistent right rail,
 * mobile gets two thumb-reachable bottom sheets (FX library / layer stack)
 * around a central MOSH trigger.
 */
const Edit = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wantsCamera = params.get("source") === "camera";

  const imageElement = useStore(s => s.imageElement);
  const videoElement = useStore(s => s.videoElement);
  const sourceName = useStore(s => s.sourceName);
  const intensity = useStore(s => s.intensity);
  const setIntensity = useStore(s => s.setIntensity);
  const mosh = useStore(s => s.mosh);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [recording, setRecording] = useState(false);
  const rendererRef = useRef<MoshRenderer | null>(null);
  const recorderRef = useRef(new CanvasRecorder());

  // No source and no camera request → nothing to mosh, back to the dropzone.
  useEffect(() => {
    if (!imageElement && !videoElement && !wantsCamera) navigate("/", { replace: true });
  }, [imageElement, videoElement, wantsCamera, navigate]);

  useEffect(() => {
    document.title = sourceName ? `MOSH — ${sourceName}` : "MOSH";
  }, [sourceName]);

  const doMosh = () => { haptic([8, 12, 20]); mosh(); };

  const doExport = async () => {
    const canvas = rendererRef.current?.canvas;
    if (!canvas) return;
    const ok = await exportPNG(canvas, "mosh");
    ok ? toast.success("PNG saved") : toast.error("Export failed");
  };

  const toggleRecord = async () => {
    const canvas = rendererRef.current?.canvas;
    if (!canvas) return;
    if (recorderRef.current.recording) {
      const ok = await recorderRef.current.stop("mosh");
      setRecording(false);
      ok ? toast.success("WebM saved") : toast.error("Recording failed");
    } else {
      recorderRef.current.start(canvas);
      setRecording(true);
      toast("Recording… tap again to stop");
    }
  };

  useHotkeys("space", (e) => { e.preventDefault(); doMosh(); }, [mosh]);
  useHotkeys("mod+z", (e) => { e.preventDefault(); undo(); }, [undo]);
  useHotkeys("shift+mod+z, mod+y", (e) => { e.preventDefault(); redo(); }, [redo]);
  useHotkeys("e", () => { void doExport(); }, []);

  const chrome = "pointer-events-auto";
  const iconBtn = "flex min-h-[44px] min-w-[44px] items-center justify-center border border-border bg-background/60 text-foreground/70 backdrop-blur-sm transition hover:border-accent hover:text-accent";

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      <Helmet>
        <title>MOSH — Editor</title>
        <meta name="description" content="Stack GPU glitch effects on images or your live camera and perform in real time." />
      </Helmet>

      <CanvasStage onRenderer={(r) => { rendererRef.current = r; }} />

      {/* ── Top chrome ─────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-safe">
        <div className={`${chrome} flex items-center gap-1.5`}>
          <Link to="/" className={iconBtn} aria-label="Back to source picker"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="hidden max-w-[200px] truncate font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 md:block">
            {sourceName ?? "untitled"}
          </span>
        </div>

        <div className={`${chrome} flex items-center gap-1.5`}>
          <CameraMenu autoStart={wantsCamera && !imageElement && !videoElement} />
          <button type="button" onClick={undo} className={iconBtn} aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} className={iconBtn} aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
          <button
            type="button"
            onClick={toggleRecord}
            className={`${iconBtn} ${recording ? "border-primary text-primary" : ""}`}
            aria-label={recording ? "Stop recording" : "Record WebM"}
          >
            {recording ? <Square className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => void doExport()} className={iconBtn} aria-label="Export PNG">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Desktop right rail ─────────────────────────────────────── */}
      <aside className="pointer-events-auto absolute bottom-0 right-0 top-16 z-30 hidden w-[340px] flex-col gap-3 overflow-hidden border-l border-border/60 bg-background/85 p-3 backdrop-blur-md lg:flex">
        <div className="h-[42%] min-h-[200px]">
          <EffectLibrary />
        </div>
        <div className="border-t border-border/60 pt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">stack</div>
        <div className="min-h-0 flex-1">
          <LayerStack />
        </div>
        <div className="border-t border-border/60 pt-1">
          <AudioPanel />
        </div>
      </aside>

      {/* ── Bottom transport ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-2 px-4 pb-safe lg:right-[356px]">
        <button
          type="button"
          onClick={() => setSheet("fx")}
          className={`${chrome} ${iconBtn} lg:hidden`}
          aria-label="Open effect library"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>

        <div className={`${chrome} flex flex-col items-center gap-2`}>
          <div className="flex items-center gap-1">
            {INTENSITIES.map(i => (
              <button
                key={i}
                type="button"
                onClick={() => setIntensity(i)}
                className={`min-h-[32px] border px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition ${
                  intensity === i ? "border-primary text-primary" : "border-border/60 text-foreground/40 hover:text-foreground/70"
                }`}
              >
                {i === "interdimensional" ? "interdim" : i}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={doMosh}
            className="min-h-[56px] min-w-[180px] border-2 border-primary bg-primary/15 px-8 font-sans text-xl font-bold tracking-[0.3em] text-primary shadow-[0_0_40px_hsl(var(--primary)/0.35)] transition hover:bg-primary/25 active:scale-95"
            aria-label="Randomize the effect stack"
          >
            MOSH
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSheet("stack")}
          className={`${chrome} ${iconBtn} lg:hidden`}
          aria-label="Open layer stack"
        >
          <Layers className="h-5 w-5" />
        </button>
      </div>

      {/* ── Mobile bottom sheets ───────────────────────────────────── */}
      {sheet && (
        <div className="absolute inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setSheet(null)}
            className="absolute inset-0 bg-background/60 backdrop-blur-[2px]"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[72dvh] flex-col border-t border-border bg-card pb-safe">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/50">
                {sheet === "fx" ? "effect library" : "layer stack"}
              </span>
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="flex h-11 w-11 items-center justify-center text-foreground/60"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {sheet === "fx" ? <EffectLibrary onAdd={() => setSheet(null)} /> : (
                <div className="space-y-4">
                  <LayerStack />
                  <div className="border-t border-border/60 pt-3">
                    <AudioPanel />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Edit;
