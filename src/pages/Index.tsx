import { useNavigate } from "react-router-dom";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useStore } from "@/store/useStore";
import { haptic } from "@/hooks/useHaptics";
import { MoshingBackdrop } from "@/components/home/MoshingBackdrop";
import { AboutTrigger } from "@/components/AboutOverlay";
import { BioFlicker } from "@/components/home/BioFlicker";
import { RebellionNudge } from "@/components/home/RebellionNudge";
import { QuadrantDecor } from "@/components/home/QuadrantDecor";

const DemoCarousel = lazy(() => import("@/components/DemoCarousel"));

const EASE_SNAP = [0.22, 1, 0.36, 1] as const;

const Index = () => {
  const navigate = useNavigate();
  const setImage = useStore(s => s.setImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(url, img);
      useStore.getState().setSourceName(file.name);
      haptic([8, 10, 16]);
      navigate("/edit");
    };
    img.src = url;
  }, [navigate, setImage]);

  const openPicker = useCallback(() => fileRef.current?.click(), []);

  const loadFromUrl = useCallback(async (src: string, productUrl: string) => {
    try {
      const res = await fetch(src, { mode: "cors" });
      const blob = await res.blob();
      const name = src.split("/").pop() || "demo.jpg";
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });
      toast.success("Loading demo — moshing…");
      await loadFile(file);
      window.open(productUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Couldn't load that demo image");
    }
  }, [loadFile]);

  // Clipboard paste — paste an image anywhere on the home page to start moshing
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            toast.success("Pasted image — moshing…");
            loadFile(f);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <Helmet>
        <title>MOSH — Audio-Reactive Visual Instrument</title>
        <meta name="description" content="Drop an image and warp it in real time. MOSH is a browser-based audio-reactive visual instrument with 59 GPU effects." />
        <link rel="canonical" href="https://ether-mosh.lovable.app/" />
        <meta property="og:title" content="MOSH — Audio-Reactive Visual Instrument" />
        <meta property="og:description" content="Drop an image and warp it in real time. 59 GPU effects, beat-synced chaos, in your browser." />
        <meta property="og:url" content="https://ether-mosh.lovable.app/" />
      </Helmet>
      <h1 className="sr-only">MOSH — Real-time audio-reactive image and video glitch instrument</h1>
      {/* Fullscreen moshing dropzone */}
      <button
        type="button"
        onClick={openPicker}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) loadFile(f);
        }}
        aria-label="Drop, paste, or click to upload an image"
        className={`group absolute inset-0 block h-full w-full cursor-pointer overflow-hidden border-2 border-dashed transition-colors duration-300 ${
          dragOver ? "border-primary" : "border-border/40 hover:border-primary/60"
        }`}
      >
        {/* Real-time moshing backdrop (canvas) */}
        <div className="pointer-events-none absolute inset-0">
          <MoshingBackdrop />
          <div className="absolute inset-0 scanline opacity-60" />
          <div className="absolute inset-0 bg-gradient-radial-darken" />
          <div className="absolute inset-0 bg-background/25" />
        </div>

        {/* Collage-inspired decor in the three non-rebellion quadrants */}
        <QuadrantDecor />

        {/* Bio fragments flickering across the visualizer */}
        <BioFlicker />

        {/* Text overlay — moshed headline + scattered subtle hints */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
            {/* Upload icon — entrance via wrapper; CSS animations on inner div are independent */}
            <motion.div
              initial={{ scale: 0.55, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.5 }}
            >
              <div
                className="relative flex h-24 w-24 items-center justify-center rounded-full border border-primary/70 bg-background/30 text-primary backdrop-blur-[2px] animate-pulse-soft mosh-icon"
                style={{
                  boxShadow: "0 0 60px hsl(var(--primary) / 0.55), inset 0 0 24px hsl(var(--accent) / 0.25)",
                  mixBlendMode: "screen",
                }}
              >
                <Upload className="h-10 w-10 mosh-glitch" aria-hidden="true" />
              </div>
            </motion.div>

            {/* Headline — wrapper handles entrance; inner mosh-text keeps its CSS glitch */}
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.78, ease: EASE_SNAP }}
            >
              <div
                aria-hidden="true"
                className="mosh-text font-sans text-[9vw] leading-[0.9] font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl"
                data-text="DROP AN IMAGE"
              >
                DROP AN IMAGE
              </div>
            </motion.div>

            <motion.p
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.08, ease: EASE_SNAP }}
              className="max-w-xl font-mono text-xs uppercase tracking-[0.25em] text-foreground/70"
            >
              MOSH is a real-time, audio-reactive visual instrument. Load any image, stack 59 GPU effects, sync to your music, and export stills or video — all in your browser.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.32 }}
              className="font-mono text-xs uppercase tracking-[0.35em] text-foreground/80"
            >
              click anywhere · drag · paste · jpg · png · svg
            </motion.div>
          </div>

          {/* Scattered subtle hints — staggered fade-in; rotation handled by Tailwind (no transform conflict) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.46 }}
            className="absolute top-[10%] left-[6%] font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40 rotate-[-6deg]"
          >
            paste
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.54 }}
            className="absolute top-[14%] right-[8%] font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40 rotate-[4deg]"
          >
            upload
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.62 }}
            className="absolute bottom-[18%] left-[10%] font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/45 rotate-[-3deg]"
          >
            drag · in · your · design
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.7 }}
            className="absolute bottom-[14%] right-[6%] font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/45 rotate-[2deg]"
          >
            mosh your own
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.78 }}
            className="absolute top-[42%] left-[3%] hidden font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/35 md:block [writing-mode:vertical-rl] rotate-180"
          >
            browse
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.86 }}
            className="absolute top-[42%] right-[3%] hidden font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/35 md:block [writing-mode:vertical-rl]"
          >
            warp · anything
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.94 }}
            className="absolute top-[28%] left-[22%] hidden font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/30 rotate-[-2deg] md:block"
          >
            jpg / png / svg
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 2.02 }}
            className="absolute bottom-[32%] right-[20%] hidden font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/30 rotate-[3deg] md:block"
          >
            tap to begin
          </motion.div>
        </div>

        {/* Top-left brand + install */}
        <motion.div
          initial={{ y: -32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.2, ease: EASE_SNAP }}
          className="pointer-events-none absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 pt-6"
        >
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-foreground/70">
            <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent))]" />
            mosh / v0.1
          </div>
          <div className="pointer-events-auto flex items-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); navigate("/edit?source=camera"); }}
              className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/70 hover:text-accent transition"
            >
              go live →
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigate("/forge"); }}
              className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/70 hover:text-primary transition"
            >
              forge →
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigate("/install"); }}
              className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/70 hover:text-accent transition"
            >
              install →
            </button>
          </div>
        </motion.div>

        {/* Bottom credit */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.3, ease: EASE_SNAP }}
          className="pointer-events-auto absolute bottom-6 left-0 right-0 z-20 flex flex-col items-center gap-3"
        >
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60">
            <button type="button" onClick={(e) => { e.stopPropagation(); navigate("/pricing"); }} className="hover:text-accent transition">pricing</button>
            <span aria-hidden className="text-foreground/30">·</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); navigate("/refund"); }} className="hover:text-accent transition">refunds</button>
            <span aria-hidden className="text-foreground/30">·</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); navigate("/terms"); }} className="hover:text-accent transition">terms</button>
            <span aria-hidden className="text-foreground/30">·</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); navigate("/privacy"); }} className="hover:text-accent transition">privacy</button>
          </nav>
        </motion.div>
        <RebellionNudge />
        <AboutTrigger />


        <input
          ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
        />
      </button>

      <Suspense fallback={null}>
        <DemoCarousel onSelect={loadFromUrl} isIdle={false} />
      </Suspense>
    </main>
  );
};

export default Index;
