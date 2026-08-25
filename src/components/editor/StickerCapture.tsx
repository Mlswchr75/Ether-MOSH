import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Download, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { stickerEngine, type StickerScore } from '@/engine/StickerEngine';
import { segmentationEngine, type SegSource } from '@/engine/SegmentationEngine';

type Phase = 'idle' | 'capturing' | 'recording' | 'encoding';

export function StickerCapture() {
  const stickerMode          = useStore(s => s.stickerMode);
  const glCanvas             = useStore(s => s.glCanvas);
  const video                = useStore(s => s.videoElement);
  const image                = useStore(s => s.imageElement);
  const gallery              = useStore(s => s.stickerGallery);
  const addSticker           = useStore(s => s.addStickerToGallery);
  const removeSticker        = useStore(s => s.removeStickerFromGallery);

  const [score, setScore]       = useState<StickerScore>({ value: 0, saturation: 0, complexity: 0 });
  const [flash, setFlash]       = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [recProg, setRecProg]   = useState(0);

  const phaseRef     = useRef<Phase>('idle');
  const frameRef     = useRef(0);
  const rafRef       = useRef(0);
  const recFrames    = useRef<ImageData[]>([]);
  const holdTimer    = useRef<number | null>(null);
  const isPointerDown= useRef(false);
  const glRef        = useRef<HTMLCanvasElement | null>(null);
  const vidRef       = useRef<HTMLVideoElement | null>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);
  const [phase, _setPhase] = useState<Phase>('idle');

  useEffect(() => { glRef.current = glCanvas; }, [glCanvas]);
  useEffect(() => { vidRef.current = video; }, [video]);
  useEffect(() => { imgRef.current = image; }, [image]);

  const setPhase = (p: Phase) => { phaseRef.current = p; _setPhase(p); };

  /**
   * Whatever the current source mode actually has: the live camera feed
   * where there is one, the uploaded still where there isn't, and — in forge
   * mode, which has neither — the rendered canvas itself, since the forge
   * output *is* the picture there rather than a distinct clean layer under
   * an FX stack. Keeps sticker capture working identically across every
   * source mode instead of only camera.
   */
  const captureSource = (): SegSource | null => vidRef.current ?? imgRef.current ?? glRef.current;

  const doFlash = () => { setFlash(true); setTimeout(() => setFlash(false), 150); };

  const finishRecording = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    const frames = [...recFrames.current];
    recFrames.current = [];
    setPhase('encoding');
    try {
      if (frames.length < 3) return;
      const first = stickerEngine.cropToBounds(frames[0]);
      if (!first) return;
      const enhanced = frames.map(f => {
        const c = stickerEngine.cropToBounds(f) ?? f;
        return stickerEngine.enhanceHDR(c);
      });
      doFlash();
      const blob = await stickerEngine.exportAPNG(enhanced, 28);
      const url = URL.createObjectURL(blob);
      addSticker({ id: crypto.randomUUID(), url, animated: true, w: first.width, h: first.height, ts: Date.now() });
      setGalleryOpen(true);
    } catch (err) {
      console.error('[sticker] recording capture failed:', err);
      toast.error("Couldn't save that capture — try again");
    } finally {
      setPhase('idle');
      setRecProg(0);
    }
  }, [addSticker]);

  useEffect(() => {
    if (!stickerMode) return;
    segmentationEngine.loadTap();

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      frameRef.current++;
      const gl = glRef.current, src = captureSource();
      if (!gl || !src) return;

      if (frameRef.current % 6 === 0) {
        setScore(stickerEngine.scoreFrame(gl));
      }
      if (frameRef.current % 90 === 0) {
        stickerEngine.refreshBestMask(src);
      }
      if (phaseRef.current === 'recording') {
        const mask = stickerEngine.getBestMask();
        if (mask && recFrames.current.length < 30) {
          const raw = stickerEngine.compositeFrame(gl, mask.data, mask.width, mask.height);
          if (raw) recFrames.current.push(raw);
          setRecProg(recFrames.current.length / 30);
          if (recFrames.current.length >= 30) finishRecording();
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stickerMode, finishRecording]);

  const captureStatic = useCallback(async () => {
    const gl = glRef.current, src = captureSource();
    if (!gl || !src || phaseRef.current !== 'idle') return;
    setPhase('capturing');
    try {
      await stickerEngine.refreshBestMask(src);
      const mask = stickerEngine.getBestMask();
      if (!mask) return;
      const raw = stickerEngine.compositeFrame(gl, mask.data, mask.width, mask.height);
      if (!raw) return;
      const cropped = stickerEngine.cropToBounds(raw);
      if (!cropped) return;
      const enhanced = stickerEngine.enhanceHDR(cropped);
      setPhase('encoding');
      const blob = await stickerEngine.exportWebP(enhanced, 2);
      doFlash();
      const url = URL.createObjectURL(blob);
      addSticker({ id: crypto.randomUUID(), url, animated: false, w: enhanced.width * 2, h: enhanced.height * 2, ts: Date.now() });
      setGalleryOpen(true);
    } catch (err) {
      console.error('[sticker] static capture failed:', err);
      toast.error("Couldn't save that capture — try again");
    } finally {
      setPhase('idle');
    }
  }, [addSticker]);

  const startRecording = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    recFrames.current = [];
    setRecProg(0);
    setPhase('recording');
    try { (navigator as any).vibrate?.(12); } catch {}
  }, []);

  const onPointerDown = () => {
    isPointerDown.current = true;
    holdTimer.current = window.setTimeout(() => {
      if (isPointerDown.current) startRecording();
    }, 500);
  };
  const onPointerUp = () => {
    isPointerDown.current = false;
    if (holdTimer.current !== null) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (phaseRef.current === 'recording') { finishRecording(); return; }
    if (phaseRef.current === 'idle') captureStatic();
  };

  const downloadSticker = (item: { id: string; url: string; animated: boolean }) => {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = `mosh-sticker-${item.id.slice(0,8)}.${item.animated ? 'apng' : 'webp'}`;
    a.click();
  };

  const deleteSticker = (id: string) => {
    const item = gallery.find(s => s.id === id);
    if (item) URL.revokeObjectURL(item.url);
    removeSticker(id);
  };

  useEffect(() => () => { gallery?.forEach(s => URL.revokeObjectURL(s.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stickerMode) return null;

  const glow = score.value;
  const isRecording = phase === 'recording';
  const isCapturing = phase === 'capturing' || phase === 'encoding';
  const isPeaking   = glow > 0.75;
  const glowColor   = `hsl(${260 + glow * 60} 100% ${55 + glow * 12}%)`;

  return (
    <>
      {flash && <div className="pointer-events-none fixed inset-0 z-[200] bg-white/15 animate-pulse" style={{ animationDuration: '0.1s' }} />}

      <div className="pointer-events-auto absolute right-4 z-50 flex flex-col items-end gap-2" style={{ bottom: '7rem' }}>
        {isRecording && (
          <div className="relative h-14 w-14 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke={glowColor} strokeWidth="2.5" strokeOpacity="0.2" />
              <circle cx="28" cy="28" r="24" fill="none" stroke={glowColor} strokeWidth="2.5"
                strokeDasharray={`${150.8 * recProg} 150.8`}
                style={{ transition: 'stroke-dasharray 0.08s' }} />
            </svg>
            <span className="font-mono text-[7px] uppercase text-white/60">rec</span>
          </div>
        )}

        <button
          className="relative flex items-center justify-center rounded-full bg-black/75 backdrop-blur-sm ring-1 ring-white/15 transition-transform active:scale-90 disabled:opacity-50"
          style={{
            width: 52, height: 52,
            boxShadow: glow > 0.35 ? `0 0 ${Math.round(glow * 28)}px ${Math.round(glow * 8)}px ${glowColor}40` : undefined,
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={() => { isPointerDown.current = false; if (holdTimer.current) clearTimeout(holdTimer.current); }}
          onContextMenu={e => e.preventDefault()}
          disabled={isCapturing}
        >
          <Sparkles
            size={20}
            style={{ color: glow > 0.5 ? glowColor : 'hsl(0 0% 60%)' }}
            className={isCapturing ? 'animate-spin' : isRecording ? 'animate-pulse' : undefined}
          />
          {isPeaking && !isRecording && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full animate-ping"
              style={{ background: glowColor }} />
          )}
        </button>

        {glow > 0.25 && (
          <div className="text-right" style={{ opacity: Math.min(glow * 1.5, 1), transition: 'opacity 0.4s' }}>
            <div className="font-mono text-[7px] uppercase tracking-[0.15em]" style={{ color: glowColor }}>
              {isRecording ? 'recording…' : isCapturing ? 'processing…' : isPeaking ? '✦ peak' : 'scanning'}
            </div>
            <div className="font-mono text-[6px] text-white/30 mt-0.5">
              sat {Math.round(score.saturation * 100)} · fx {Math.round(score.complexity * 100)}
            </div>
          </div>
        )}
      </div>

      {galleryOpen && gallery.length > 0 && (
        <div className="pointer-events-auto absolute bottom-4 left-0 right-0 z-50 flex items-center gap-1 px-3">
          <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {gallery.map(item => (
              <div key={item.id} className="relative flex-shrink-0 group">
                <img
                  src={item.url}
                  alt="sticker"
                  className="h-16 w-16 rounded-xl object-contain ring-1 ring-white/10"
                  style={{ background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #0d0d0d 0% 50%) 0 0/10px 10px' }}
                />
                {item.animated && (
                  <span className="absolute top-0.5 left-0.5 rounded bg-purple-500/80 px-1 font-mono text-[5px] uppercase tracking-wider text-white">anim</span>
                )}
                <div className="absolute inset-0 flex items-end justify-between p-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <button onClick={() => downloadSticker(item)} className="p-1 rounded-md bg-black/70 backdrop-blur-sm">
                    <Download size={9} className="text-white" />
                  </button>
                  <button onClick={() => deleteSticker(item.id)} className="p-1 rounded-md bg-black/70 backdrop-blur-sm">
                    <Trash2 size={9} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setGalleryOpen(false)} className="p-1.5 rounded-full bg-black/50 ring-1 ring-white/10 flex-shrink-0">
            <X size={10} className="text-white/50" />
          </button>
        </div>
      )}

      {phase === 'idle' && glow < 0.25 && (
        <div className="pointer-events-none absolute right-20 z-50" style={{ bottom: '7.5rem' }}>
          <p className="font-mono text-[7px] uppercase tracking-[0.15em] text-white/20 text-right">tap · hold=animate</p>
        </div>
      )}
    </>
  );
}
