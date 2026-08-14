import { useNavigate } from "react-router-dom";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Camera, Upload } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useStore } from "@/store/useStore";
import { loadImageFile, loadImageFromClipboard } from "@/lib/sourceLoader";
import { haptic } from "@/hooks/useHaptics";
import { defaultFacing, requestCameraStream } from "@/hooks/useCamera";
import { MoshingBackdrop } from "@/components/home/MoshingBackdrop";
import { AboutTrigger } from "@/components/AboutOverlay";
import { BioFlicker } from "@/components/home/BioFlicker";
import { RebellionNudge } from "@/components/home/RebellionNudge";
import { QuadrantDecor } from "@/components/home/QuadrantDecor";
import { GlitchWordField, KEEP_OUT } from "@/components/home/GlitchWordField";
import { HeroWord, HERO_ANCHOR } from "@/components/home/HeroWord";

const DemoCarousel = lazy(() => import("@/components/DemoCarousel"));

const EASE_SNAP = [0.22, 1, 0.36, 1] as const;

const Index = () => {
  const navigate = useNavigate();
  const setVideoSource = useStore(s => s.setVideoSource);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Whatever the hero is currently shouting. The word field takes it so the
  // same word is never on screen twice.
  const [heroWord, setHeroWord] = useState<string>(HERO_ANCHOR);

  const loadFile = useCallback(async (file: File) => {
    const ok = await loadImageFile(file);
    if (!ok) return;
    haptic([8, 10, 16]);
    navigate("/edit");
  }, [navigate]);

  const openPicker = useCallback(() => fileRef.current?.click(), []);

  // Called directly from a click handler (user gesture) so getUserMedia fires
  // in the right context and mobile browsers show the permission dialog.
  const handleGoLive = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const facing = defaultFacing();
    try {
      const stream = await requestCameraStream({ facing });
      setVideoSource(stream, facing === "user" ? "front camera" : "rear camera");
      navigate("/edit");
    } catch {
      // Permission denied / no camera — navigate anyway, editor handles retry
      navigate("/edit");
    }
  }, [navigate, setVideoSource]);

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
    const onPaste = async (e: ClipboardEvent) => {
      if (await loadImageFromClipboard(e)) {
        e.preventDefault();
        toast.success("Pasted image — moshing…");
        haptic([8, 10, 16]);
        navigate("/edit");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [navigate]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <Helmet>
        <title>MOSH — Audio-Reactive Visual Instrument</title>
        <meta name="description" content="Drop an image and warp it in real time. MOSH is a browser-based audio-reactive visual instrument with 105 GPU effects." />
        <link rel="canonical" href="https://ether-mosh.netlify.app/" />
        <meta property="og:title" content="MOSH — Audio-Reactive Visual Instrument" />
        <meta property="og:description" content="Drop an image and warp it in real time. 105 GPU effects, beat-synced chaos, in your browser." />
        <meta property="og:url" content="https://ether-mosh.netlify.app/" />
      </Helmet>
      <h1 className="sr-only">MOSH — Real-time audio-reactive image and video glitch instrument</h1>
      {/* Fullscreen moshing dropzone — using div so nested interactive elements are valid HTML */}
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPicker(); }}
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

        {/* Text overlay — the page's single hero. Everything else on screen is
            the word field, which places itself around this block. */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            {/* The keep-out is this inner cluster, which shrink-wraps its
                contents — marking the full-bleed parent would reserve the
                whole page and leave the field nowhere to land. */}
            <div {...KEEP_OUT} className="flex flex-col items-center gap-6">
              {/* Upload + camera — entrance via wrapper; CSS animations on the
                  inner elements are independent */}
              <motion.div
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.5 }}
                className="pointer-events-auto flex items-center gap-5"
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openPicker(); }}
                  aria-label="Upload an image"
                  className="relative flex h-24 w-24 items-center justify-center rounded-full border border-primary/70 bg-background/30 text-primary backdrop-blur-[2px] animate-pulse-soft mosh-icon transition hover:scale-105"
                  style={{
                    boxShadow: "0 0 60px hsl(var(--primary) / 0.55), inset 0 0 24px hsl(var(--accent) / 0.25)",
                  }}
                >
                  <Upload className="h-10 w-10 mosh-glitch" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleGoLive}
                  aria-label="Go live with your camera"
                  className="relative flex h-16 w-16 items-center justify-center rounded-full border border-accent/70 bg-background/30 text-accent backdrop-blur-[2px] transition hover:scale-105"
                  style={{ boxShadow: "0 0 40px hsl(var(--accent) / 0.45)" }}
                >
                  <Camera className="h-7 w-7" aria-hidden="true" />
                </button>
              </motion.div>

              {/* Headline — wrapper handles entrance; HeroWord owns the swap
                  and the RGB split beneath it */}
              <motion.div
                initial={{ y: 28, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.78, ease: EASE_SNAP }}
              >
                <HeroWord onWordChange={setHeroWord} />
              </motion.div>

              <motion.p
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.08, ease: EASE_SNAP }}
                className="max-w-xl font-mono text-xs uppercase tracking-[0.25em] text-foreground/70"
              >
                MOSH is a real-time, audio-reactive visual instrument. Load any image, stack 105 GPU effects, sync to your music, and export stills or video — all in your browser.
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
          </div>

          {/* Every other word on screen. The field owns all of them so it can
              guarantee they never overlap each other or the reserved UI. */}
          <GlitchWordField exclude={heroWord} />
        </div>

        {/* Top-left brand + install */}
        <motion.div
          {...KEEP_OUT}
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
              onClick={handleGoLive}
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
          {...KEEP_OUT}
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
      </div>

      <Suspense fallback={null}>
        <DemoCarousel onSelect={loadFromUrl} isIdle={false} />
      </Suspense>
    </main>
  );
};

export default Index;
