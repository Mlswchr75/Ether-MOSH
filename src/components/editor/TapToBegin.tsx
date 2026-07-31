/**
 * TapToBegin — first-touch onboarding overlay.
 */
import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { useStore } from "@/store/useStore";

import { toast } from "sonner";
import demoPortrait from "/demo/demo-portrait.jpg?url";
import demoCathedral from "/demo/demo-cathedral.jpg?url";
import demoBust from "/demo/demo-bust.jpg?url";

const STORAGE_KEY = "cathedral_first_touched";

function alreadyTouched(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
function markTouched() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
}

type Stage = "hidden" | "intro" | "options" | "done";

export function TapToBegin() {
  const setImage = useStore(s => s.setImage);
  const setSourceName = useStore(s => s.setSourceName);
  const imageElement = useStore(s => s.imageElement);
  const profile = useStore(s => s.paletteProfile);

  const videoElement = useStore(s => s.videoElement);

  const [stage, setStage] = useState<Stage>(() => {
    if (alreadyTouched()) return "done";
    const s = useStore.getState();
    if (s.imageElement || s.videoElement) { markTouched(); return "done"; }
    return "intro";
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "done") return;
    if (imageElement || videoElement) {
      markTouched();
      setStage("done");
    }
  }, [imageElement, videoElement, stage]);

  useEffect(() => {
    const parent = document.querySelector("[data-tap-fade-target]");
    if (!parent) return;
    if (stage === "options" || stage === "intro") {
      parent.classList.toggle("opacity-30", stage === "options");
      parent.classList.toggle("opacity-100", stage !== "options");
      (parent as HTMLElement).style.transition = "opacity 700ms ease-out";
    } else {
      parent.classList.remove("opacity-30");
      (parent as HTMLElement).style.transition = "";
    }
  }, [stage]);

  const onTap = async () => {
    setStage("options");
  };

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(url, img);
      setSourceName(file.name);
    };
    img.src = url;
  };

  const loadDemo = (src: string, label: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(src, img);
      setSourceName(label);
    };
    img.onerror = () => toast.error("Couldn't load demo");
    img.src = src;
  };

  const dismiss = () => { markTouched(); setStage("done"); };

  if (stage === "done") return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
      {stage === "intro" && (
        <button
          onClick={onTap}
          className="pointer-events-auto group relative flex items-center gap-3 rounded-sm border-2 border-[hsl(var(--accent))] bg-black/60 px-7 py-4 font-mono text-[14px] uppercase tracking-[0.3em] text-[hsl(var(--accent))] backdrop-blur-md shadow-[0_0_40px_hsl(var(--accent)/0.4)] transition hover:bg-[hsl(var(--accent)/0.1)] hover:shadow-[0_0_60px_hsl(var(--accent)/0.6)] active:scale-95"
          style={{ animation: "tapPulse 1.8s ease-in-out infinite" }}
        >
          <span aria-hidden>▶</span>
          <span>Tap to Begin</span>
        </button>
      )}
      {stage === "options" && (
        <div className="pointer-events-auto flex flex-col items-center gap-5 rounded-sm border border-[hsl(var(--border-default))] bg-black/70 px-6 py-5 backdrop-blur-md">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--text-tertiary))]">
            choose a source
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-sm border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-2))] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] transition"
            >
              <Upload className="h-5 w-5" strokeWidth={1.5} />
              Drop / Upload
            </button>
            <DemoMenu onPick={loadDemo} />
          </div>
          <button
            onClick={dismiss}
            className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))] transition"
          >
            <X className="h-3 w-3" strokeWidth={1.5} /> skip — start with procedural
          </button>
          <input
            ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
          />
        </div>
      )}
      <style>{`
        @keyframes tapPulse {
          0%,100% { box-shadow: 0 0 30px hsl(var(--accent) / 0.35); }
          50%     { box-shadow: 0 0 65px hsl(var(--accent) / 0.7); }
        }
      `}</style>
    </div>
  );
}

function DemoMenu({ onPick }: { onPick: (src: string, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const demos = [
    { src: demoPortrait,   label: "Chrome",     alt: "Chrome demo portrait — reflective metallic face" },
    { src: demoCathedral,  label: "Cathedral",  alt: "Cathedral demo — gothic interior architecture" },
    { src: demoBust,       label: "Vapor",      alt: "Vapor demo — classical sculpture bust in pink haze" },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex flex-col items-center gap-2 rounded-sm border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-2))] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] transition"
      >
        <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
        Demo
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-2 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-2 backdrop-blur-md">
          {demos.map(d => (
            <button
              key={d.label}
              onClick={() => { setOpen(false); onPick(d.src, d.label); }}
              className="h-14 w-14 overflow-hidden rounded-sm border border-[hsl(var(--border-default))] hover:border-[hsl(var(--accent))] transition"
              title={d.label}
            >
              <img src={d.src} alt={d.alt} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
