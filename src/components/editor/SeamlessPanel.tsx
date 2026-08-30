import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { TILE_MODE_LABELS, type TileMode } from "@/engine/tile";
import { exportCanvas, downloadBlob, remasterCanvas } from "@/engine/export";
import { blobWithDpi } from "@/engine/pngDpi";
import { captureBestFrame } from "@/engine/bestFrame";
import { notifyExportStarted } from "./ExportRegisteredToast";
import { Download } from "lucide-react";
import { toast } from "sonner";

const MODES: TileMode[] = ["none", "seamless", "mirror"];

export function SeamlessPanel() {
  const tileMode = useStore(s => s.tileMode);
  const tileUniforms = useStore(s => s.tileUniforms);
  const setTileMode = useStore(s => s.setTileMode);
  const updateTileUniforms = useStore(s => s.updateTileUniforms);
  const active = tileMode !== "none";
  const [exporting, setExporting] = useState(0);

  const exportTile = async () => {
    const c = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!c) return;
    try {
      notifyExportStarted("seamless-tile");
      setExporting(0.01);
      const best = await captureBestFrame(c, {
        durationMs: 3600,
        intervalMs: 80,
        sampleSize: 128,
        preferSeamless: true,
        onProgress: (p) => setExporting(p),
      });
      setExporting(0);
      const remastered = await remasterCanvas(best, 2);
      const encoded = await exportCanvas(remastered, { format: "png", scale: 1, aspect: null });
      const dpi = useStore.getState().exportSettings.printDpi;
      const blob = await blobWithDpi(encoded, dpi);
      downloadBlob(blob, `mosh-${Date.now()}_tileable_${dpi}dpi.png`);
      toast.success("Tile saved");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(0);
    }
  };

  return (
    <div
      className={`glass-2 mb-2 px-3 py-2.5 ${active ? "border-t border-t-[hsl(var(--accent))]" : ""}`}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <div className="font-mono text-[12px] uppercase tracking-[0.04em] text-[hsl(var(--text-primary))]">
          seamless
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">
          tile post-process
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {MODES.map(m => {
          const on = tileMode === m;
          return (
            <button
              key={m}
              onClick={() => setTileMode(m)}
              className={`rounded-sm border px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.04em] transition ${
                on
                  ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                  : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"
              }`}
            >
              {TILE_MODE_LABELS[m]}
            </button>
          );
        })}
      </div>

      <div
        className="overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-out"
        style={{
          maxHeight: active ? 1200 : 0,
          opacity: active ? 1 : 0,
          marginTop: active ? 10 : 0,
        }}
      >
        <TileSlider
          label="Scale"
          value={tileUniforms.scale}
          min={1}
          max={4}
          step={0.5}
          fmt={(v) => `${v.toFixed(1)}×`}
          onChange={(v) => updateTileUniforms({ scale: v })}
        />
        <TileSlider
          label="Rotation"
          value={(tileUniforms.angle * 180) / Math.PI}
          min={0}
          max={360}
          step={1}
          fmt={(v) => `${Math.round(v)}°`}
          onChange={(deg) => updateTileUniforms({ angle: (deg * Math.PI) / 180 })}
        />
        <TileSlider
          label="Phase X"
          value={tileUniforms.phaseX}
          min={0}
          max={1}
          step={0.001}
          fmt={(v) => v.toFixed(2)}
          onChange={(v) => updateTileUniforms({ phaseX: v })}
        />
        <TileSlider
          label="Phase Y"
          value={tileUniforms.phaseY}
          min={0}
          max={1}
          step={0.001}
          fmt={(v) => v.toFixed(2)}
          onChange={(v) => updateTileUniforms({ phaseY: v })}
        />
        <TileSlider
          label="Blend Zone"
          value={tileUniforms.blend}
          min={0.05}
          max={0.4}
          step={0.005}
          fmt={(v) => v.toFixed(2)}
          onChange={(v) => updateTileUniforms({ blend: v })}
        />
        {tileMode === "mirror" && (
          <TileSlider
            label="Frequency Blur"
            value={tileUniforms.blur}
            min={0.1}
            max={1}
            step={0.01}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => updateTileUniforms({ blur: v })}
          />
        )}

        <TilePreview active={active} />

        <button
          onClick={exportTile}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-sm border border-[hsl(var(--border-default))] py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
        >
          <Download className="h-3 w-3" strokeWidth={1.5} />
          {exporting > 0 ? `Finding best frame… ${Math.round(exporting * 100)}%` : "Export Tile"}
        </button>
      </div>
    </div>
  );
}

function TileSlider({
  label, value, min, max, step, fmt, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--text-secondary))]">{label}</span>
        <span className="font-mono text-[10px] text-[hsl(var(--text-secondary))]">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="slider-hair w-full"
      />
    </div>
  );
}

function TilePreview({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const dst = ref.current;
      const src = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (dst && src && src.width > 0 && src.height > 0) {
        const dstW = dst.width;
        const dstH = dst.height;
        const ctx = dst.getContext("2d");
        if (ctx) {
          const tileW = dstW / 3;
          const tileH = dstH / 3;
          ctx.imageSmoothingEnabled = true;
          ctx.clearRect(0, 0, dstW, dstH);
          for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
              ctx.drawImage(src, x * tileW, y * tileH, tileW, tileH);
            }
          }
          if (!hasFrame) setHasFrame(true);
        }
      }
      id = window.setTimeout(tick, 200);
    };
    id = window.setTimeout(tick, 50);
    return () => window.clearTimeout(id);
  }, [active, hasFrame]);

  return (
    <div className="mt-2">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">
        3×3 tile preview
      </div>
      <div className="relative w-full overflow-hidden rounded-sm border border-[hsl(var(--border-subtle))] bg-black">
        <canvas
          ref={ref}
          width={240}
          height={240}
          className="block h-auto w-full"
          style={{ aspectRatio: "1 / 1", imageRendering: "pixelated" }}
        />
        {/* Subtle 3x3 grid overlay */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/3 top-0 h-full w-px bg-white/5" />
          <div className="absolute left-2/3 top-0 h-full w-px bg-white/5" />
          <div className="absolute top-1/3 left-0 w-full h-px bg-white/5" />
          <div className="absolute top-2/3 left-0 w-full h-px bg-white/5" />
        </div>
      </div>
    </div>
  );
}
