import { useMemo, useState } from "react";
import { WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useOverlayStore } from "@/store/useOverlayStore";
import { saveOverlayAsset } from "@/engine/overlay/vault";
import { blobToPngDataUrl, buildStickerLottie, lottieJsonBlob, type StickerLottiePreset } from "@/engine/overlay/stickerLottie";
import { scoreVectorSuitability } from "@/engine/overlay/vectorSuitability";
import { traceStickerShapes } from "@/engine/overlay/vectorTrace";
import { buildVectorStickerLottie } from "@/engine/overlay/vectorLottie";
import { currentOverlayPerformanceBudget } from "@/engine/overlay/performanceBudget";
import { useStore } from "@/store/useStore";
import { segmentationEngine } from "@/engine/SegmentationEngine";
import { assetFromStickerSource, resolveStickerSource, withOptionalForgeIsolation } from "@/engine/overlay/stickerSource";

type Mode = "auto" | "universal" | "vector";
const PRESETS: StickerLottiePreset[] = ["float", "pulse", "wobble", "spin", "bounce", "flicker", "breathe", "orbit", "jitter", "glitch"];

async function blobToImageData(blob: Blob, maxDimension: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("Canvas unavailable");
    ctx.clearRect(0,0,width,height); ctx.drawImage(bitmap,0,0,width,height); return ctx.getImageData(0,0,width,height);
  } finally { bitmap.close(); }
}

export function StickerForge() {
  const selectedId = useOverlayStore(s => s.selectedId);
  const selected = useOverlayStore(s => s.entities.find(e => e.id === selectedId) ?? null);
  const addAsset = useOverlayStore(s => s.addAsset);
  const sourceMode = useStore(s => s.sourceMode);
  const glCanvas = useStore(s => s.glCanvas);
  const renderAvailable = !!glCanvas;
  const [open,setOpen] = useState(false), [mode,setMode] = useState<Mode>("auto"), [preset,setPreset] = useState<StickerLottiePreset>("float"), [busy,setBusy] = useState(false);
  const [score,setScore] = useState<number|null>(null), [recommended,setRecommended] = useState<"vector"|"universal"|null>(null);
  const source = resolveStickerSource({ selectedOverlay: selected, sourceMode, forgeCanvas: glCanvas });
  const sourceIsLottie = source?.kind === "overlay" && (source.asset.kind === "lottie-json" || source.asset.kind === "dotlottie");
  const disabled = (!selected && !renderAvailable) || busy || sourceIsLottie;
  const recommendationText = useMemo(() => recommended ? `Recommended: ${recommended === "vector" ? "Vector" : "Universal"}${score == null ? "" : ` · ${Math.round(score*100)}%`}` : `Auto analyzes the ${selected ? "selected sticker" : "current visual"}`, [recommended,score,selected]);

  const forge = async () => {
    if (disabled) return;
    setBusy(true);
    let revokePrepared: () => void = () => undefined;
    try {
      const liveCanvas = glCanvas ?? document.querySelector<HTMLCanvasElement>("canvas[data-mosh-canvas]");
      let resolved = resolveStickerSource({ selectedOverlay: selected, sourceMode, forgeCanvas: liveCanvas });
      if (!resolved) throw new Error("The current visual is not ready yet.");
      resolved = await withOptionalForgeIsolation(resolved, async canvas => {
        await segmentationEngine.loadTap();
        if (!segmentationEngine.isTapReady()) return [];
        const points = segmentationEngine.analyzeSaliency(canvas, 3);
        return segmentationEngine.segmentMultiPoint(canvas, points);
      }, error => console.warn("[sticker-forge] subject isolation unavailable; animating salient crop", error));
      const prepared = await assetFromStickerSource(resolved);
      revokePrepared = prepared.revoke;
      const sourceBlob: Blob = prepared.blob ?? await fetch(prepared.asset.url).then(r => { if (!r.ok) throw new Error(`Source unavailable (${r.status})`); return r.blob(); });
      const imageData = await blobToImageData(sourceBlob, currentOverlayPerformanceBudget().forgeAnalysisDimension);
      const suitability = scoreVectorSuitability(imageData); setScore(suitability.score); setRecommended(suitability.recommendation);
      let chosen: "vector"|"universal" = mode === "auto" ? suitability.recommendation : mode;
      const width = prepared.asset.width ?? imageData.width, height = prepared.asset.height ?? imageData.height, nameBase = prepared.asset.name || "MOSH Sticker";
      let json: any;
      if (chosen === "vector") {
        const traced = traceStickerShapes(imageData);
        if (!traced.ok || traced.shapes.length === 0) { toast.info("Vector trace exceeded quality limits — using Universal Lottie."); chosen = "universal"; }
        else {
          const sx = width / imageData.width, sy = height / imageData.height;
          const scaleLoop = (loop: [number,number][]) => loop.map(([x,y]) => [x*sx,y*sy] as [number,number]);
          const shapes = traced.shapes.map(shape => ({ ...shape, points: scaleLoop(shape.points), holes: shape.holes?.map(scaleLoop) }));
          json = buildVectorStickerLottie({ name:`${nameBase} · vector ${preset}`, width, height, shapes, preset });
        }
      }
      if (chosen === "universal") {
        const imageDataUrl = await blobToPngDataUrl(sourceBlob);
        json = buildStickerLottie({ name:`${nameBase} · universal ${preset}`, width, height, imageDataUrl, preset });
      }
      const blob = lottieJsonBlob(json);
      const asset = { id:crypto.randomUUID(), name:`${nameBase} · ${chosen} ${preset}`, kind:"lottie-json" as const, url:URL.createObjectURL(blob), mimeType:"application/json", width, height, animated:true, createdAt:Date.now(), objectUrl:true };
      addAsset(asset); await saveOverlayAsset(asset); toast.success(`${chosen === "vector" ? "Vector" : "Universal"} Lottie forged`);
    } catch (error) { console.error("[sticker-forge] failed", error); toast.error("Sticker Forge couldn't complete that subject."); }
    finally { revokePrepared(); setBusy(false); }
  };

  return <div className="pointer-events-auto relative">
    <button type="button" disabled={!selected && !renderAvailable} onClick={() => setOpen(v => !v)} title="Animate the selected sticker or current visual as a transparent Lottie" className="flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-black/70 px-2.5 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-violet-100 backdrop-blur-md disabled:opacity-25"><WandSparkles size={11}/> Forge Lottie</button>
    {open && <div className="absolute bottom-11 left-1/2 z-[120] w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl border border-violet-300/20 bg-black/95 p-3 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-violet-200">Sticker Forge</p><p className="mt-1 font-mono text-[7px] uppercase tracking-[0.1em] text-white/35">transparent animated Lottie output</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-white/45 hover:bg-white/10 hover:text-white"><X size={12}/></button></div>
      <div className="mt-3 grid grid-cols-3 gap-1">{(["auto","universal","vector"] as Mode[]).map(v => <button key={v} type="button" onClick={() => setMode(v)} className={`rounded-full border px-2 py-1.5 font-mono text-[7px] uppercase ${mode===v ? "border-violet-300/45 bg-violet-400/10 text-violet-100" : "border-white/10 text-white/45"}`}>{v}</button>)}</div>
      <p className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5 font-mono text-[7px] uppercase tracking-[0.1em] text-white/40">{recommendationText}</p>
      <label className="mt-2 flex items-center justify-between rounded-lg border border-white/10 px-2 py-1.5 font-mono text-[7px] uppercase text-white/45">Motion<select value={preset} onChange={e => setPreset(e.target.value as StickerLottiePreset)} className="bg-black text-violet-100 outline-none">{PRESETS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
      <button type="button" disabled={disabled} onClick={() => void forge()} className="mt-3 w-full rounded-full border border-violet-300/35 bg-violet-400/10 px-3 py-2.5 font-mono text-[8px] uppercase tracking-[0.16em] text-violet-100 disabled:opacity-30">{busy ? "Forging…" : "Forge Transparent Lottie"}</button>
      {sourceIsLottie && <p className="mt-2 text-center font-mono text-[7px] uppercase text-white/30">Selected overlay is already Lottie.</p>}
    </div>}
  </div>;
}
