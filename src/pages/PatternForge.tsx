import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Download, ArrowLeft, Shuffle } from "lucide-react";
import { MoshRenderer } from "@/engine/Renderer";
import type { RenderLayer } from "@/engine/Renderer";
import { rngFromSeed } from "@/engine/seed";

const EASE = [0.22, 1, 0.36, 1] as const;

const PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: "acid",    colors: ["#FF1F8F", "#00FFB2", "#1A0033"] },
  { name: "chrome",  colors: ["#C0C0C0", "#4488FF", "#0A0A14"] },
  { name: "plasma",  colors: ["#FF4500", "#FF00CC", "#050510"] },
  { name: "drift",   colors: ["#00BFFF", "#7700FF", "#000A1A"] },
  { name: "void",    colors: ["#8800FF", "#00FF88", "#040008"] },
  { name: "heat",    colors: ["#FF6B00", "#FF0033", "#100400"] },
];

const EFFECT_STACKS: Array<{ effectId: string; params: Record<string, number>; opacity: number }[]> = [
  [
    { effectId: "plasmaField", params: { amount: 0.7, speed: 0.5, scale: 4 }, opacity: 1 },
    { effectId: "rgbShift",   params: { amount: 0.4, angle: 0.5 },            opacity: 0.85 },
  ],
  [
    { effectId: "liquidWarp", params: { amount: 0.6, speed: 0.4, scale: 5 }, opacity: 1 },
    { effectId: "vhsBleed",   params: { amount: 0.5, speed: 0.6 },            opacity: 0.8 },
  ],
  [
    { effectId: "pixelSort",  params: { threshold: 0.4, amount: 0.7 },        opacity: 1 },
    { effectId: "scanBreak",  params: { amount: 0.5, speed: 0.8 },             opacity: 0.75 },
  ],
  [
    { effectId: "plasmaField", params: { amount: 0.55, speed: 0.9, scale: 6 }, opacity: 0.9 },
    { effectId: "liquidWarp",  params: { amount: 0.5, speed: 0.7, scale: 3 },  opacity: 0.85 },
    { effectId: "rgbShift",    params: { amount: 0.3, angle: 1.2 },             opacity: 0.7 },
  ],
];

function drawSource(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: [string, string, string],
  seed: number,
  t: number,
) {
  const rng = rngFromSeed(seed.toString(36));
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.5, colors[1]);
  g.addColorStop(1, colors[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    const x = (rng() + Math.sin(t * 0.3 + i * 1.1) * 0.2) * w;
    const y = (rng() + Math.cos(t * 0.25 + i * 0.9) * 0.2) * h;
    const r = 20 + rng() * 60;
    const b = ctx.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, colors[Math.floor(i % 3)] + "CC");
    b.addColorStop(1, "transparent");
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function PatternForge() {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MoshRenderer | null>(null);

  const [paletteIdx, setPaletteIdx] = useState(0);
  const [stackIdx, setStackIdx] = useState(0);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xFFFFFF));
  const [exporting, setExporting] = useState(false);

  const palette = PALETTES[paletteIdx];
  const stack = EFFECT_STACKS[stackIdx];

  const randomise = useCallback(() => {
    setSeed(Math.floor(Math.random() * 0xFFFFFF));
    setStackIdx(Math.floor(Math.random() * EFFECT_STACKS.length));
    setPaletteIdx(Math.floor(Math.random() * PALETTES.length));
  }, []);

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
      drawSource(sctx, src.width, src.height, palette.colors, seed, t);
      const layers: RenderLayer[] = stack.map((l, i) => ({
        id: `forge${i}`,
        effectId: l.effectId,
        hidden: false,
        opacity: l.opacity,
        blend: i === 0 ? "normal" : "screen",
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, stack, seed]);

  const handleExport = useCallback(async () => {
    const canvas = exportCanvasRef.current;
    if (!canvas || exporting) return;
    setExporting(true);
    try {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mosh-forge-${seed.toString(16)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [seed, exporting]);

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
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 border border-primary/60 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-primary transition hover:bg-primary/10 disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            {exporting ? "saving…" : "export png"}
          </button>
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

          {/* Effect stack */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              effect
            </p>
            <div className="space-y-1.5">
              {EFFECT_STACKS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStackIdx(i)}
                  className={`w-full px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                    i === stackIdx ? "text-accent" : "text-foreground/50 hover:text-foreground/80"
                  }`}
                >
                  {s.map(l => l.effectId).join(" + ")}
                </button>
              ))}
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
              Export the pattern and drop it into MOSH to use it as a source image.
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
