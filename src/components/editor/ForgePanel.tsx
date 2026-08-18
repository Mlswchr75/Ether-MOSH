import { useCallback, useRef, useState } from "react";
import { Download, RotateCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { MoshRenderer, type RenderLayer } from "@/engine/Renderer";
import { paintForgeSource, createForgeRuntime } from "@/engine/forgeSource";
import { FORGE_PALETTES } from "@/engine/forgePalettes";
import { seamScore } from "@/engine/tileSafety";
import { healToSeamless, renderSizeFor, DEFAULT_HEAL_BAND } from "@/engine/seamlessHeal";
import { downloadBlob } from "@/engine/export";

/**
 * Print sizes. 2048 covers most garment panels at 150 DPI; 4096 is there for
 * large-format and for anything a fulfiller will scale up.
 */
const EXPORT_SIZES = [1024, 2048, 4096] as const;

/**
 * Forge-only controls — palette, base photo, seamless tiling, density, seed,
 * and print export. Everything else forge needs (mic, record, GIF, journey,
 * the effect stack itself) is already the rest of the editor; this panel is
 * only the handful of settings unique to generating the pattern in the first
 * place.
 */
export function ForgePanel() {
  const forge = useStore(s => s.forge);
  const setForgePaletteIdx = useStore(s => s.setForgePaletteIdx);
  const setForgeIntensity = useStore(s => s.setForgeIntensity);
  const setForgeSeamless = useStore(s => s.setForgeSeamless);
  const setForgeBaseImage = useStore(s => s.setForgeBaseImage);
  const setForgeOverlay = useStore(s => s.setForgeOverlay);
  const reseedForge = useStore(s => s.reseedForge);

  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [seam, setSeam] = useState<number | null>(null);

  const loadBase = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setForgeBaseImage(img, file.name);
      setSeam(null);
      toast.success("Base image loaded", { description: "Pattern now builds on top of it" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error("Couldn't read that image"); };
    img.src = url;
  }, [setForgeBaseImage]);

  /**
   * Render the pattern at print resolution, off-screen, using the *live*
   * layer stack (whatever's currently on canvas, tuned or not) — not a stale
   * copy — so the export always matches what shuffling led to.
   *
   * Ported from the standalone Pattern Forge page's exportAt(): search a
   * handful of candidate frames for the cleanest seam, heal it, then save.
   */
  const exportAt = useCallback(async (size: number) => {
    if (exporting) return;
    setExporting(true);
    const seamless = useStore.getState().forge.seamless;
    const t0 = toast.loading(seamless ? "Finding the cleanest frame…" : `Rendering ${size}x${size}…`);
    let off: HTMLCanvasElement | null = null;
    let r: MoshRenderer | null = null;
    const runtime = createForgeRuntime();
    try {
      const renderSize = seamless ? renderSizeFor(size) : size;
      off = document.createElement("canvas");
      off.width = renderSize;
      off.height = renderSize;
      r = new MoshRenderer(off);

      const src = document.createElement("canvas");
      src.width = src.height = Math.min(1024, Math.max(256, Math.floor(renderSize / 2)));
      const sctx = src.getContext("2d", { willReadFrequently: true })!;

      r.setSourceCanvas(src);
      r.setTileableSampling(seamless);
      r.setRenderScale(1);
      r.resize(renderSize, renderSize);
      r.setHdrIntensity(0);
      r.setHdr(0);

      const currentForge = useStore.getState().forge;
      const layers: RenderLayer[] = useStore.getState().layers.map(l => ({
        id: l.id,
        effectId: l.effectId,
        hidden: l.hidden,
        opacity: l.opacity,
        blend: l.blend,
        params: l.params,
        region: l.region ?? null,
      }));

      const probe = document.createElement("canvas");
      const pw = 256;
      probe.width = probe.height = pw;
      const pctx = probe.getContext("2d", { willReadFrequently: true })!;

      const paint = (time: number) => {
        paintForgeSource(sctx, src.width, src.height, time, currentForge, {}, runtime);
        r!.render(layers, 0.5);
      };

      const CANDIDATES = seamless ? 12 : 1;
      const SPACING_MS = 130;
      let bestTime = 0;
      let bestRaw = -1;

      for (let i = 0; i < CANDIDATES; i++) {
        const time = i * (SPACING_MS / 1000);
        paint(time);
        if (i === 0) paint(time); // first pass may land while a shader is still linking
        if (CANDIDATES === 1) { bestTime = time; break; }

        pctx.drawImage(off, 0, 0, pw, pw);
        const raw = seamScore(pctx.getImageData(0, 0, pw, pw).data, pw, pw).worst;
        if (raw > bestRaw) { bestRaw = raw; bestTime = time; }
        if (raw > 0.995) break;
        await new Promise(res => setTimeout(res, 8));
      }

      paint(bestTime);
      paint(bestTime);

      let finalCanvas: HTMLCanvasElement = off;
      let band = 0;
      if (seamless) {
        const healed = healToSeamless(off, size, DEFAULT_HEAL_BAND);
        finalCanvas = healed.canvas;
        band = healed.band;
      }

      let score: number | null = null;
      try {
        pctx.clearRect(0, 0, pw, pw);
        pctx.drawImage(finalCanvas, 0, 0, pw, pw);
        score = seamScore(pctx.getImageData(0, 0, pw, pw).data, pw, pw).worst;
        setSeam(score);
      } catch { /* advisory only — never block the save */ }

      const blob = await new Promise<Blob | null>(res => finalCanvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Encoding failed");
      downloadBlob(blob, `mosh-forge-${currentForge.seed.toString(16)}-${size}${seamless ? "-tile" : ""}.png`);

      const pct = score !== null ? `${(score * 100).toFixed(1)}%` : "n/a";
      if (!seamless) {
        toast.success(`${size}x${size} exported`, { id: t0 });
      } else if (score !== null && score < 0.9) {
        toast.warning(`${size}x${size} saved — edges may show`, {
          id: t0,
          description: `Edge match ${pct}. Reshuffle for a cleaner tile, or drop density.`,
          duration: 10000,
        });
      } else {
        toast.success(`${size}x${size} seamless tile saved`, {
          id: t0,
          description: `Edge match ${pct} · ${band}px blended`,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: t0 });
    } finally {
      r?.dispose();
      off?.remove();
      runtime.volumetric?.dispose();
      setExporting(false);
    }
  }, [exporting]);

  return (
    <div className="ui-chrome pointer-events-auto absolute left-3 top-14 z-20 flex max-h-[calc(100dvh-6rem)] w-44 flex-col gap-4 overflow-y-auto rounded-sm border border-[hsl(var(--border-default))] bg-black/70 p-3 backdrop-blur-md safe-top safe-left safe-bottom">
      {/* Palette */}
      <div>
        <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.35em] text-foreground/40">palette</p>
        <div className="flex flex-wrap gap-1.5">
          {FORGE_PALETTES.map((p, i) => (
            <button
              key={p.name}
              type="button"
              title={p.name}
              onClick={() => setForgePaletteIdx(i)}
              data-active={i === forge.paletteIdx || undefined}
              className="flex gap-0.5 rounded-sm border border-transparent p-1 transition data-[active]:border-[hsl(var(--accent))]"
            >
              {p.colors.map(c => (
                <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
              ))}
            </button>
          ))}
        </div>
      </div>

      {/* Base image */}
      <div>
        <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.35em] text-foreground/40">base</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-foreground/60 transition hover:text-accent"
        >
          {forge.baseImage ? "replace image" : "upload image"}
          <Upload className="h-3 w-3" />
        </button>
        {forge.baseName && (
          <>
            <p className="mt-1 truncate font-mono text-[8px] text-accent/70" title={forge.baseName}>
              {forge.baseName}
            </p>
            <button
              type="button"
              onClick={() => setForgeBaseImage(null, null)}
              className="mt-1 font-mono text-[8px] uppercase tracking-[0.15em] text-foreground/35 transition hover:text-destructive"
            >
              remove
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              value={forge.overlay}
              onChange={(e) => setForgeOverlay(parseFloat(e.target.value))}
              className="mt-2 w-full accent-[hsl(var(--accent))]"
              aria-label="Pattern strength over base image"
            />
          </>
        )}
        <input
          ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadBase(f); e.target.value = ""; }}
        />
      </div>

      {/* Seamless */}
      <div>
        <button
          type="button"
          onClick={() => setForgeSeamless(!forge.seamless)}
          className={`flex w-full items-center justify-between font-mono text-[9px] uppercase tracking-[0.15em] transition ${
            forge.seamless ? "text-accent" : "text-foreground/50 hover:text-foreground/80"
          }`}
        >
          seamless tile
          <span>{forge.seamless ? "on" : "off"}</span>
        </button>
        {seam !== null && (
          <p className={`mt-1 font-mono text-[8px] uppercase tracking-[0.15em] ${
            seam >= 0.97 ? "text-accent/80" : "text-destructive/80"
          }`}>
            edge match {(seam * 100).toFixed(1)}%
          </p>
        )}
      </div>

      {/* Density */}
      <div>
        <p className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.35em] text-foreground/40">density</p>
        <input
          type="range" min={0} max={1} step={0.05}
          value={forge.intensity}
          onChange={(e) => setForgeIntensity(parseFloat(e.target.value))}
          className="w-full accent-[hsl(var(--accent))]"
          aria-label="Pattern density"
        />
      </div>

      {/* Seed */}
      <div>
        <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.35em] text-foreground/40">seed</p>
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] text-foreground/50">#{forge.seed.toString(16).padStart(6, "0")}</p>
          <button
            type="button"
            onClick={reseedForge}
            aria-label="Re-seed"
            title="Re-seed — same effects, new field"
            className="text-foreground/35 transition hover:text-accent"
          >
            <RotateCw className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Print export */}
      <div className="border-t border-border/30 pt-3">
        <p className="mb-2 flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.35em] text-foreground/40">
          <Download className="h-2.5 w-2.5 text-primary" />
          export tile
        </p>
        <div className="flex items-center gap-1">
          {EXPORT_SIZES.map(sz => (
            <button
              key={sz}
              type="button"
              onClick={() => exportAt(sz)}
              disabled={exporting}
              title={`Export ${sz}x${sz} PNG${forge.seamless ? " (seamless tile)" : ""}`}
              className="flex-1 rounded-sm border border-primary/60 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary transition hover:bg-primary/10 disabled:opacity-40"
            >
              {sz >= 1024 ? `${sz / 1024}k` : sz}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
