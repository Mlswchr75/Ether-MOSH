import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Download, ArrowLeft, Shuffle } from "lucide-react";
import { MoshRenderer } from "@/engine/Renderer";
import type { RenderLayer } from "@/engine/Renderer";
import { rngFromSeed } from "@/engine/seed";
import { drawSeamless } from "@/engine/seamlessSource";
import { composeForgeStack, type ForgeLayer } from "@/engine/forgeCompose";
import { seamScore, seamPasses } from "@/engine/tileSafety";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { toast } from "sonner";

const EASE = [0.22, 1, 0.36, 1] as const;

const PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: "acid",    colors: ["#FF1F8F", "#00FFB2", "#1A0033"] },
  { name: "chrome",  colors: ["#C0C0C0", "#4488FF", "#0A0A14"] },
  { name: "plasma",  colors: ["#FF4500", "#FF00CC", "#050510"] },
  { name: "drift",   colors: ["#00BFFF", "#7700FF", "#000A1A"] },
  { name: "void",    colors: ["#8800FF", "#00FF88", "#040008"] },
  { name: "heat",    colors: ["#FF6B00", "#FF0033", "#100400"] },
];

/**
 * Print sizes. 2048 covers most garment panels at 150 DPI; 4096 is there for
 * large-format and for anything that will be scaled up by a fulfiller.
 */
const EXPORT_SIZES = [1024, 2048, 4096] as const;

export default function PatternForge() {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MoshRenderer | null>(null);

  const [paletteIdx, setPaletteIdx] = useState(0);
  const [seamless, setSeamless] = useState(true);
  const [intensity, setIntensity] = useState(0.6);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xFFFFFF));
  const [currentStack, setCurrentStack] = useState<ForgeLayer[]>(
    () => composeForgeStack({ rand: Math.random, seamless: true, intensity: 0.6 }),
  );
  const [exporting, setExporting] = useState(false);
  const [seam, setSeam] = useState<number | null>(null);

  const palette = PALETTES[paletteIdx];

  const randomise = useCallback(() => {
    setSeed(Math.floor(Math.random() * 0xFFFFFF));
    setCurrentStack(composeForgeStack({ rand: Math.random, seamless, intensity }));
    setPaletteIdx(Math.floor(Math.random() * PALETTES.length));
    setSeam(null);
  }, [seamless, intensity]);

  // Re-roll when the pool changes: a stack built without the tile constraint
  // will contain effects that cannot survive it.
  useEffect(() => {
    setCurrentStack(composeForgeStack({ rand: Math.random, seamless, intensity }));
    setSeam(null);
  }, [seamless]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    host.appendChild(canvas);
    exportCanvasRef.current = canvas;

    const src = document.createElement("canvas");
    src.width = 256; src.height = 256;
    const sctx = src.getContext("2d")!;

    let renderer: MoshRenderer | null = null;
    try {
      renderer = new MoshRenderer(canvas);
      rendererRef.current = renderer;
    } catch {
      host.removeChild(canvas);
      return;
    }

    renderer.setSourceCanvas(src);
    // Wrapped sampling is what lets ordinary displacement effects continue
    // across the join instead of smearing the edge pixel.
    renderer.setTileableSampling(seamless);

    const resize = () => {
      renderer!.resize(host.clientWidth, host.clientHeight);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const start = performance.now();

    const loop = () => {
      const t = (performance.now() - start) / 1000;

      // Guard against zero-dimension canvas initialization frames
      if (host.clientWidth === 0 || host.clientHeight === 0) {
        raf = requestAnimationFrame(loop);
        return;
      }

      drawSeamless(sctx, src.width, src.height, {
        colors: palette.colors,
        seed: seed.toString(36),
        t,
        complexity: 2 + Math.round(intensity * 4),
      });

      const layers: RenderLayer[] = currentStack.map((l, i) => ({
        id: `forge${i}`,
        effectId: l.effectId,
        hidden: false,
        opacity: l.opacity,
        blend: l.blend,
        params: l.params,
      }));

      renderer!.render(layers, 0.4 + 0.3 * Math.sin(t * 1.5));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer?.dispose();
      canvas.remove();
      rendererRef.current = null;
    };
  }, [palette, currentStack, seed, seamless, intensity]);

  /**
   * Render the pattern at print resolution, off-screen.
   *
   * The preview canvas is viewport-sized — nowhere near enough pixels for a
   * garment panel. This spins up a second renderer at the requested square
   * size, renders one frame, measures the seam, and only then hands over the
   * file. Measuring rather than assuming matters because the effect stack is
   * random: the classifier keeps obviously-unsafe effects out of the pool, but
   * the output is the only thing that actually proves a tile.
   */
  const exportAt = useCallback(async (size: number) => {
    if (exporting) return;
    setExporting(true);
    const t = toast.loading(`Rendering ${size}x${size}…`);
    let off: HTMLCanvasElement | null = null;
    let r: MoshRenderer | null = null;
    try {
      off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      r = new MoshRenderer(off);

      const src = document.createElement("canvas");
      // Source resolution scales with output so the field keeps its detail
      // instead of being magnified into mush at 4K.
      src.width = src.height = Math.min(1024, Math.max(256, size / 2));
      const sctx = src.getContext("2d")!;
      drawSeamless(sctx, src.width, src.height, {
        colors: palette.colors,
        seed: seed.toString(36),
        t: 0,
        complexity: 2 + Math.round(intensity * 4),
      });

      r.setSourceCanvas(src);
      r.setTileableSampling(seamless);
      r.setRenderScale(1);          // no internal downscale for a print asset
      r.resize(size, size);
      r.setHdrIntensity(0);
      r.setHdr(0);

      const layers: RenderLayer[] = currentStack.map((l, i) => ({
        id: `forge${i}`,
        effectId: l.effectId,
        hidden: false,
        opacity: l.opacity,
        blend: l.blend,
        params: l.params,
      }));
      // Two passes: the first compiles shaders, the second renders with them
      // warm. A single pass can capture a frame where a shader is still linking.
      r.render(layers, 0.5);
      r.render(layers, 0.5);

      // Verify the tile actually closes before calling it a print asset.
      let score: number | null = null;
      try {
        const probe = document.createElement("canvas");
        const pw = 256;
        probe.width = probe.height = pw;
        const pctx = probe.getContext("2d", { willReadFrequently: true })!;
        pctx.drawImage(off, 0, 0, pw, pw);
        const s = seamScore(pctx.getImageData(0, 0, pw, pw).data, pw, pw);
        score = s.worst;
        setSeam(score);
        if (seamless && !seamPasses(s)) {
          toast.warning("Seam detected", {
            id: t,
            description: `Edge match ${(score * 100).toFixed(1)}% — reshuffle for a cleaner tile.`,
            duration: 9000,
          });
        }
      } catch {
        /* measurement is advisory; never block the export on it */
      }

      const blob = await new Promise<Blob | null>(res => off!.toBlob(res, "image/png"));
      if (!blob) throw new Error("Encoding failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mosh-forge-${seed.toString(16)}-${size}${seamless ? "-tile" : ""}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      if (!seamless || score === null || score >= 0.97) {
        toast.success(`${size}x${size} exported`, {
          id: t,
          description: seamless && score !== null ? `Seamless · edge match ${(score * 100).toFixed(1)}%` : undefined,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: t });
    } finally {
      r?.dispose();
      off?.remove();
      setExporting(false);
    }
  }, [exporting, palette, seed, currentStack, seamless, intensity]);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <Helmet>
        <title>Pattern Forge — MOSH</title>
        <meta name="description" content="Generate procedural glitch patterns to use as MOSH source images." />
      </Helmet>

      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-5 py-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 transition hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back
        </button>
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-foreground/40">
          pattern forge
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={randomise}
            className="flex items-center gap-1.5 border border-border/60 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 transition hover:border-accent hover:text-accent"
          >
            <Shuffle className="h-3 w-3" />
            shuffle
          </button>
          <div className="flex items-center gap-1 border border-primary/60">
            <Download className="ml-2 h-3 w-3 text-primary" />
            {EXPORT_SIZES.map(sz => (
              <button
                key={sz}
                type="button"
                onClick={() => exportAt(sz)}
                disabled={exporting}
                title={`Export ${sz}x${sz} PNG${seamless ? " (seamless tile)" : ""}`}
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-[0.15em] text-primary transition hover:bg-primary/10 disabled:opacity-40"
              >
                {sz >= 1024 ? `${sz / 1024}k` : sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div ref={hostRef} className="relative flex-1 bg-black" />

        {/* Sidebar */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="flex w-52 shrink-0 flex-col gap-6 overflow-y-auto border-l border-border/30 p-5"
        >
          {/* Palette */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              palette
            </p>
            <div className="space-y-1.5">
              {PALETTES.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setPaletteIdx(i)}
                  className={`flex w-full items-center gap-3 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] transition ${
                    i === paletteIdx ? "text-accent" : "text-foreground/50 hover:text-foreground/80"
                  }`}
                >
                  <span className="flex gap-1">
                    {p.colors.map(c => (
                      <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Seamless */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              output
            </p>
            <button
              type="button"
              onClick={() => setSeamless(v => !v)}
              className={`flex w-full items-center justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                seamless ? "text-accent" : "text-foreground/50 hover:text-foreground/80"
              }`}
            >
              seamless tile
              <span>{seamless ? "on" : "off"}</span>
            </button>
            {seamless && (
              <p className="mt-1 px-2 font-mono text-[8px] leading-relaxed uppercase tracking-[0.15em] text-foreground/30">
                pool limited to effects that survive tiling
              </p>
            )}
            {seam !== null && (
              <p className={`mt-2 px-2 font-mono text-[9px] uppercase tracking-[0.2em] ${
                seam >= 0.97 ? "text-accent/80" : "text-destructive/80"
              }`}>
                edge match {(seam * 100).toFixed(1)}%
              </p>
            )}
          </div>

          {/* Intensity */}
          <div>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              density
            </p>
            <input
              type="range" min={0} max={1} step={0.05}
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="w-full accent-[hsl(var(--accent))]"
              aria-label="Pattern density"
            />
          </div>

          {/* Current Effect Stack Summary */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              active effects
            </p>
            <div className="space-y-1 overflow-hidden">
              <AnimatePresence mode="popLayout">
                {currentStack.map((l, i) => (
                  <motion.div
                    key={`${EFFECTS_BY_ID[l.effectId]?.name ?? l.effectId}-${i}`}
                    initial={{ opacity: 0, x: -12, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: 12, filter: "blur(4px)" }}
                    transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80"
                  >
                    {l.effectId}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Seed */}
          <div>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              seed
            </p>
            <p className="font-mono text-[11px] text-foreground/50">
              #{seed.toString(16).padStart(6, "0")}
            </p>
            <button
              type="button"
              onClick={() => setSeed(Math.floor(Math.random() * 0xFFFFFF))}
              className="mt-2 font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/35 transition hover:text-accent"
            >
              re-seed
            </button>
          </div>

          <div className="mt-auto border-t border-border/30 pt-4">
            <p className="font-mono text-[9px] leading-relaxed text-foreground/30 uppercase tracking-[0.2em]">
              Seamless tiles repeat edge-to-edge for all-over print. 2k suits most
              garment panels at 150 DPI; 4k for large format.
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
