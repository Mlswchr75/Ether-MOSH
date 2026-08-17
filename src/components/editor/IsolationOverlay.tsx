import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { segmentationEngine, MaskResult } from "@/engine/SegmentationEngine";

function drawCoverFit(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, cw: number, ch: number) {
  const vw = video.videoWidth || video.width || 1, vh = video.videoHeight || video.height || 1;
  const vA = vw / vh, cA = cw / ch;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (vA > cA) { sw = vh * cA; sx = (vw - sw) / 2; }
  else          { sh = vw / cA; sy = (vh - sh) / 2; }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
}

function overlayToVideoCoords(nx: number, ny: number, video: HTMLVideoElement, cw: number, ch: number) {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const vA = vw / vh, cA = cw / ch;
  if (vA > cA) { const sw = vh * cA, sx = (vw - sw) / 2; return { x: (sx + nx * sw) / vw, y: ny }; }
  else          { const sh = vw / cA, sy = (vh - sh) / 2; return { x: nx, y: (sy + ny * sh) / vh }; }
}

function centroid(mask: Float32Array, w: number, h: number, fallback: { x: number; y: number }) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x] > 0.5) { sx += x / w; sy += y / h; n++; }
  }
  return n > 50 ? { x: sx / n, y: sy / n } : fallback;
}

function blend(prev: Float32Array | null, next: Float32Array, alpha: number): Float32Array {
  if (!prev || prev.length !== next.length) return next;
  const out = new Float32Array(next.length);
  for (let i = 0; i < next.length; i++) out[i] = prev[i] * (1 - alpha) + next[i] * alpha;
  return out;
}

function unionMasks(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.max(a[i], b[i]);
  return out;
}

function combineSaliencyMasks(regions: MaskResult[], phase: number): Float32Array | null {
  if (!regions.length) return null;
  if (regions.length === 1) return regions[0].data;
  const len = regions[0].data.length;
  const n = regions.length;
  const out = new Float32Array(len);
  const PI2 = Math.PI * 2;
  for (let r = 0; r < n; r++) {
    const rdata = regions[r].data;
    if (rdata.length !== len) continue;
    const raw = 0.5 + 0.5 * Math.cos(PI2 * (phase + r / n));
    const w = Math.pow(Math.max(raw, 0), 1.8);
    for (let i = 0; i < len; i++) out[i] = Math.max(out[i], rdata[i] * w);
  }
  return out;
}

export function IsolationOverlay() {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const mode    = useStore(s => s.isolationMode);
  const feather = useStore(s => s.isolationFeather);
  const invert  = useStore(s => s.isolationInvert);
  const video   = useStore(s => s.videoElement);

  const maskRef     = useRef<Float32Array | null>(null);
  const maskWRef    = useRef(0);
  const maskHRef    = useRef(0);
  const tapPtRef    = useRef<{ x: number; y: number } | null>(null);
  const tapBusyRef  = useRef(false);
  const frameRef    = useRef(0);

  // Smart-auto fallback
  const selfieFailRef      = useRef(0);
  const saliencyRegionsRef = useRef<MaskResult[]>([]);
  const saliencyBusyRef    = useRef(false);
  const saliencyPhaseRef   = useRef(0);

  // Refine mode (hold 800ms then drag to expand selection)
  const refineModeRef   = useRef(false);
  const refineHoldTimer = useRef<number | null>(null);
  const refinePtRef     = useRef<{ nx: number; ny: number } | null>(null);
  const refineBusyRef   = useRef(false);

  // Lock-in tracking
  const lockedRef       = useRef(false);

  const [loading, setLoading]   = useState(false);
  const [tapHint, setTapHint]   = useState(false);
  const [locked, setLocked]     = useState(false);
  const [refining, setRefining] = useState(false);

  const featherRef = useRef(feather);
  const invertRef  = useRef(invert);
  const videoRef   = useRef(video);
  useEffect(() => { featherRef.current = feather; }, [feather]);
  useEffect(() => { invertRef.current  = invert;  }, [invert]);
  useEffect(() => { videoRef.current   = video;   }, [video]);

  useEffect(() => {
    if (mode === 'off') {
      maskRef.current = null; selfieFailRef.current = 0; saliencyRegionsRef.current = [];
      refineModeRef.current = false; lockedRef.current = false;
      setRefining(false); setLocked(false);
      return;
    }
    if (mode === 'auto') {
      setLoading(true);
      Promise.all([segmentationEngine.loadAuto(), segmentationEngine.loadTap()]).then(() => {
        setLoading(false);
        // loadAuto/loadTap never reject (they catch and console.warn
        // internally) — readiness after the fact is the only signal that a
        // CDN/model fetch actually failed, so check it explicitly rather
        // than let isolate silently do nothing.
        if (!segmentationEngine.isAutoReady() && !segmentationEngine.isTapReady()) {
          toast.error("Isolate subject unavailable — couldn't load the segmentation model");
        }
      });
    }
    if (mode === 'tap') {
      setTapHint(true); setLoading(true);
      segmentationEngine.loadTap().then(() => {
        setLoading(false);
        if (!segmentationEngine.isTapReady()) {
          toast.error("Isolate subject unavailable — couldn't load the segmentation model");
        }
      });
      maskRef.current = null; lockedRef.current = false; setLocked(false);
    }
  }, [mode]);

  const cancelRefine = () => {
    if (refineHoldTimer.current !== null) { window.clearTimeout(refineHoldTimer.current); refineHoldTimer.current = null; }
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (mode !== 'tap') return;
    const canvas = overlayRef.current, vid = videoRef.current;
    if (!canvas || !vid) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;

    cancelRefine();
    tapPtRef.current = { x: nx, y: ny };
    refinePtRef.current = { nx, ny };
    setTapHint(false);

    if (!tapBusyRef.current) {
      tapBusyRef.current = true;
      const vc = overlayToVideoCoords(nx, ny, vid, canvas.offsetWidth, canvas.offsetHeight);
      segmentationEngine.segmentFromPoint(vid, vc.x, vc.y).then(res => {
        tapBusyRef.current = false;
        if (res) {
          maskRef.current  = blend(maskRef.current, res.data, 0.85);
          maskWRef.current = res.width;
          maskHRef.current = res.height;
        }
      });
    }

    refineHoldTimer.current = window.setTimeout(() => {
      refineModeRef.current = true;
      setRefining(true);
      try { (navigator as any).vibrate?.(8); } catch {}
    }, 800);
  }, [mode]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (mode !== 'tap') return;
    const canvas = overlayRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    refinePtRef.current = { nx, ny };

    if (!refineModeRef.current && tapPtRef.current) {
      const dx = nx - tapPtRef.current.x, dy = ny - tapPtRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 0.04) cancelRefine();
    }
  }, [mode]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    cancelRefine();
    if (refineModeRef.current) { refineModeRef.current = false; setRefining(false); }
  }, []);

  useEffect(() => {
    if (mode === 'off') return;
    let raf = 0;
    const rawCanvas = document.createElement('canvas');
    const blurCanvas = document.createElement('canvas');
    const rawCtx  = rawCanvas.getContext('2d')!;
    const blurCtx = blurCanvas.getContext('2d')!;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      frameRef.current++;
      const canvas = overlayRef.current, vid = videoRef.current;
      if (!canvas || !vid) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const cw  = Math.floor(canvas.offsetWidth  * dpr);
      const ch  = Math.floor(canvas.offsetHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }

      if (mode === 'auto' && segmentationEngine.isAutoReady()) {
        if (frameRef.current % 2 === 0) {
          const res = segmentationEngine.segmentAuto(vid, performance.now());
          if (res) {
            const conf = segmentationEngine.maskConfidence(res.data);
            if (conf > 0.12) {
              maskRef.current  = blend(maskRef.current, res.data, 0.3);
              maskWRef.current = res.width; maskHRef.current = res.height;
              selfieFailRef.current = Math.max(0, selfieFailRef.current - 2);
              if (selfieFailRef.current === 0) saliencyRegionsRef.current = [];
            } else {
              selfieFailRef.current = Math.min(selfieFailRef.current + 1, 200);
            }
          }
        }
        if (selfieFailRef.current > 20 && segmentationEngine.isTapReady() && !saliencyBusyRef.current) {
          const shouldScan = saliencyRegionsRef.current.length === 0 || frameRef.current % 180 === 0;
          if (shouldScan) {
            saliencyBusyRef.current = true;
            const pts = segmentationEngine.analyzeSaliency(vid, 3);
            segmentationEngine.segmentMultiPoint(vid, pts).then(regions => {
              saliencyBusyRef.current = false;
              if (regions.length) saliencyRegionsRef.current = regions;
            });
          }
        }
        if (saliencyRegionsRef.current.length > 0) {
          saliencyPhaseRef.current += 1 / 180;
          const combined = combineSaliencyMasks(saliencyRegionsRef.current, saliencyPhaseRef.current);
          if (combined) {
            maskRef.current  = blend(maskRef.current, combined, 0.18);
            maskWRef.current = saliencyRegionsRef.current[0].width;
            maskHRef.current = saliencyRegionsRef.current[0].height;
          }
        }
      }

      if (mode === 'tap') {
        if (tapPtRef.current && segmentationEngine.isTapReady() && !tapBusyRef.current && !refineModeRef.current) {
          if (frameRef.current % 4 === 0) {
            const pt = maskRef.current
              ? centroid(maskRef.current, maskWRef.current, maskHRef.current, tapPtRef.current)
              : tapPtRef.current;
            const vc = overlayToVideoCoords(pt.x, pt.y, vid, canvas.offsetWidth, canvas.offsetHeight);
            tapBusyRef.current = true;
            segmentationEngine.segmentFromPoint(vid, vc.x, vc.y).then(res => {
              tapBusyRef.current = false;
              if (res) {
                maskRef.current  = blend(maskRef.current, res.data, 0.35);
                maskWRef.current = res.width; maskHRef.current = res.height;
              }
            });
          }
        }
        if (refineModeRef.current && refinePtRef.current && segmentationEngine.isTapReady() && !refineBusyRef.current) {
          if (frameRef.current % 3 === 0) {
            const rp = refinePtRef.current;
            const vc = overlayToVideoCoords(rp.nx, rp.ny, vid, canvas.offsetWidth, canvas.offsetHeight);
            refineBusyRef.current = true;
            segmentationEngine.segmentFromPoint(vid, vc.x, vc.y).then(res => {
              refineBusyRef.current = false;
              if (res) {
                if (maskRef.current && maskRef.current.length === res.data.length) {
                  maskRef.current = unionMasks(maskRef.current, res.data);
                } else {
                  maskRef.current = res.data; maskWRef.current = res.width; maskHRef.current = res.height;
                }
              }
            });
          }
        }
      }

      ctx.clearRect(0, 0, cw, ch);
      const curMask = maskRef.current, mw = maskWRef.current, mh = maskHRef.current;

      if (!curMask || mw === 0) {
        if (lockedRef.current) { lockedRef.current = false; setLocked(false); }
        return;
      }

      if (frameRef.current % 15 === 0) {
        let count = 0;
        for (let i = 0; i < curMask.length; i++) if (curMask[i] > 0.35) count++;
        const isLocked = count > 300;
        if (isLocked !== lockedRef.current) { lockedRef.current = isLocked; setLocked(isLocked); }
      }

      if (rawCanvas.width !== mw || rawCanvas.height !== mh) {
        rawCanvas.width = mw; rawCanvas.height = mh;
        blurCanvas.width = mw; blurCanvas.height = mh;
      }

      const alphaImg = rawCtx.createImageData(mw, mh);
      const inv = invertRef.current;
      for (let i = 0; i < curMask.length; i++) {
        alphaImg.data[i * 4 + 3] = Math.round((inv ? curMask[i] : 1 - curMask[i]) * 255);
      }
      rawCtx.clearRect(0, 0, mw, mh);
      rawCtx.putImageData(alphaImg, 0, 0);

      blurCtx.clearRect(0, 0, mw, mh);
      const f = featherRef.current;
      if (f > 0) blurCtx.filter = `blur(${f}px)`;
      blurCtx.drawImage(rawCanvas, 0, 0);
      blurCtx.filter = 'none';

      drawCoverFit(ctx, vid, cw, ch);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(blurCanvas, 0, 0, cw, ch);
      ctx.globalCompositeOperation = 'source-over';

      if (!inv) {
        const t = frameRef.current;
        const isRefining = refineModeRef.current;
        const isLocked   = lockedRef.current;
        const [er, eg, eb] = isRefining ? [80, 255, 130] : isLocked ? [80, 200, 255] : [160, 80, 255];
        const pulse = isRefining
          ? (0.55 + 0.45 * Math.abs(Math.sin(t * 0.18)))
          : isLocked
          ? (0.65 + 0.35 * Math.sin(t * 0.07))
          : 0.55;
        const edgeImg = rawCtx.createImageData(mw, mh);
        for (let i = 0; i < curMask.length; i++) {
          const v = curMask[i];
          const edge = 4 * v * (1 - v);
          edgeImg.data[i * 4]     = er;
          edgeImg.data[i * 4 + 1] = eg;
          edgeImg.data[i * 4 + 2] = eb;
          edgeImg.data[i * 4 + 3] = Math.round(edge * 170 * pulse);
        }
        rawCtx.clearRect(0, 0, mw, mh);
        rawCtx.putImageData(edgeImg, 0, 0);
        ctx.globalAlpha = 0.8;
        ctx.drawImage(rawCanvas, 0, 0, cw, ch);
        ctx.globalAlpha = 1;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); };
  }, [mode]);

  if (mode === 'off') return null;

  return (
    <>
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full"
        style={{
          zIndex: 15,
          pointerEvents: mode === 'tap' ? 'auto' : 'none',
          cursor: mode === 'tap' ? (refining ? 'cell' : 'crosshair') : 'default',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {locked && !refining && !loading && (
        <div
          className="pointer-events-none absolute z-40"
          style={{ bottom: '5rem', left: '50%', animation: 'lockInBadge 200ms ease-out both' }}
        >
          <div className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-sm ring-1 ring-white/8">
            <span className="h-1 w-1 rounded-full" style={{ background: 'hsl(195 100% 68%)', boxShadow: '0 0 5px hsl(195 100% 68%)' }} />
            <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-white/55">⌖ locked</span>
          </div>
        </div>
      )}

      {refining && (
        <div
          className="pointer-events-none absolute z-40"
          style={{ bottom: '5rem', left: '50%', animation: 'lockInBadge 120ms ease-out both' }}
        >
          <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 backdrop-blur-sm ring-1 ring-[hsl(140_100%_65%/0.3)]">
            <span className="h-1.5 w-1.5 rounded-full animate-ping" style={{ background: 'hsl(140 100% 65%)' }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/80">✦ drag to expand</span>
          </div>
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[hsl(var(--accent))]" />
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/70">loading model…</span>
        </div>
      )}

      {mode === 'tap' && tapHint && !loading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="rounded-xl bg-black/65 px-5 py-3 text-center backdrop-blur-sm ring-1 ring-white/10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">⌖ tap an object</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/50">effects isolate only to that region</p>
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-white/30">hold to drag-expand selection</p>
          </div>
        </div>
      )}
    </>
  );
}
