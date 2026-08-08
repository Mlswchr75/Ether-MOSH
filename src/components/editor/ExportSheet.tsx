import { useEffect, useState } from "react";
import { Download, X, Copy, Check } from "lucide-react";
import { useStore } from "@/store/useStore";
import { exportCanvas, downloadBlob, copyBlobToClipboard, ASPECT_PRESETS, remasterCanvas } from "@/engine/export";
import { captureBestFrame } from "@/engine/bestFrame";
import { haptic } from "@/hooks/useHaptics";
import { toast } from "sonner";

type Format = "png" | "jpg" | "webp";

export function ExportSheet({ onClose, getCanvas }: { onClose: () => void; getCanvas: () => HTMLCanvasElement | null }) {
  const seed = useStore(s => s.seed);
  const tileMode = useStore(s => s.tileMode);
  const [analyzing, setAnalyzing] = useState(0);
  const [format, setFormat] = useState<Format>("png");
  const [scale, setScale] = useState<number>(2);
  const [aspectIdx, setAspectIdx] = useState(0);
  const [quality, setQuality] = useState<number>(0.94);
  const [transparent, setTransparent] = useState(false);
  const [filename, setFilename] = useState(`mosh_${seed}`);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const build = async () => {
    const canvas = getCanvas();
    if (!canvas) throw new Error("no canvas");
    let src: HTMLCanvasElement = canvas;
    if (tileMode !== "none") {
      setAnalyzing(0.01);
      src = await captureBestFrame(canvas, {
        durationMs: 3600,
        intervalMs: 80,
        sampleSize: 128,
        preferSeamless: true,
        onProgress: (p) => setAnalyzing(p),
      });
      setAnalyzing(0);
    }
    src = await remasterCanvas(src, tileMode === "none" ? 1 : 1.5);
    return exportCanvas(src, {
      format, scale, aspect: ASPECT_PRESETS[aspectIdx].aspect,
      quality: format === "png" ? undefined : quality,
      transparent,
    });
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const blob = await build();
      const aspect = ASPECT_PRESETS[aspectIdx].label.toLowerCase().replace(/\s|:|\//g, "-");
      downloadBlob(blob, `${filename || `mosh_${seed}`}_${aspect}.${format}`);
      haptic([10, 30, 60]);
      toast.success("Exported");
      onClose();
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async () => {
    setBusy(true);
    try {
      const blob = await build();
      const ok = await copyBlobToClipboard(blob);
      if (ok) { setCopied(true); toast.success("Copied to clipboard"); setTimeout(() => setCopied(false), 1500); }
      else toast.error("Clipboard not available");
    } catch {
      toast.error("Copy failed");
    } finally {
      setBusy(false);
    }
  };

  const canvas = getCanvas();
  const w = canvas ? Math.round(canvas.width * scale) : 0;
  const h = canvas ? Math.round(canvas.height * scale) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-modal w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 animate-ui-rise">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <div className="font-mono text-[14px] font-bold uppercase tracking-[0.22em] text-[hsl(var(--text-primary))]">Export</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--text-tertiary))]">
              seed · {seed} · {w}×{h}
            </div>
          </div>
          <button onClick={onClose} className="btn-icon h-8 w-8" aria-label="close">
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4">
          <Group label="Format">
            {(["png", "jpg", "webp"] as Format[]).map(f => (
              <Pill key={f} active={format === f} onClick={() => setFormat(f)}>{f.toUpperCase()}</Pill>
            ))}
          </Group>

          <Group label="Scale">
            {[1, 2, 3, 4].map(s => (
              <Pill key={s} active={scale === s} onClick={() => setScale(s)}>{s}×</Pill>
            ))}
          </Group>

          <Group label="Aspect">
            {ASPECT_PRESETS.map((a, i) => (
              <Pill key={a.label} active={aspectIdx === i} onClick={() => setAspectIdx(i)}>{a.label}</Pill>
            ))}
          </Group>

          {format !== "png" && (
            <div>
              <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--text-tertiary))]">
                <span>Quality</span><span className="text-[hsl(var(--text-secondary))]">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range" min={0.4} max={1} step={0.01} value={quality}
                onChange={(e) => setQuality(+e.target.value)}
                className="slider-hair w-full"
              />
            </div>
          )}

          {format === "png" && (
            <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--text-secondary))]">
              <input
                type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(195_100%_65%)]"
              />
              Transparent background
            </label>
          )}

          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--text-tertiary))]">Filename</div>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="input-mono w-full text-[12px]"
              placeholder={`mosh_${seed}`}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={doCopy}
            disabled={busy}
            className="btn-ghost h-10 justify-center"
          >
            {copied ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={doExport}
            disabled={busy}
            className="btn-accent h-10 justify-center"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            {analyzing > 0 ? `Finding best frame… ${Math.round(analyzing * 100)}%` : busy ? "Rendering…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--text-tertiary))]">{label}</div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    data-active={active}
    className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] transition ${
      active
        ? "border-[hsl(195_100%_65%)] text-[hsl(195_100%_70%)] shadow-[0_0_12px_hsl(195_100%_65%/0.35)]"
        : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--border-strong))] hover:text-[hsl(var(--text-primary))]"
    }`}
  >
    {children}
  </button>
);
