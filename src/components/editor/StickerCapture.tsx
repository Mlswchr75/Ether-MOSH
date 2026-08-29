import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Download, X, Trash2, Film, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useOverlayStore } from '@/store/useOverlayStore';
import { stickerEngine, type StickerScore } from '@/engine/StickerEngine';
import { segmentationEngine } from '@/engine/SegmentationEngine';
import { OverlayStage } from '@/components/editor/OverlayStage';
import type { StickerEntry } from '@/store/types';
import { downloadBlob } from '@/engine/export';
import { notifyExportStarted } from '@/components/editor/ExportRegisteredToast';
import { saveOverlayAsset } from '@/engine/overlay/vault';
import { lottieJsonBlob } from '@/engine/overlay/stickerLottie';
import {
  analyzeOrganicFocus,
  buildEncodedFrameSequenceLottie,
  drawLottieStickerPreview,
  encodeTransparentStickerGif,
  encodeStickerFramesForLottie,
  renderOrganicStickerFrame,
  type LottieStickerBackground,
  type OrganicFocus,
} from '@/engine/overlay/lottieStickerMode';

type Phase = 'idle' | 'capturing' | 'recording' | 'encoding';

function overlayUsesUrl(url: string): boolean {
  return useOverlayStore.getState().entities.some(entity => entity.asset.url === url);
}

export function StickerCapture() {
  const stickerMode          = useStore(s => s.stickerMode);
  const glCanvas             = useStore(s => s.glCanvas);
  const video                = useStore(s => s.videoElement);
  const gallery              = useStore(s => s.stickerGallery);
  const addSticker           = useStore(s => s.addStickerToGallery);
  const removeSticker        = useStore(s => s.removeStickerFromGallery);

  const [score, setScore]       = useState<StickerScore>({ value: 0, saturation: 0, complexity: 0 });
  const [flash, setFlash]       = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [recProg, setRecProg]   = useState(0);
  const [lottieMode, setLottieMode] = useState(false);
  const [lottieBackground, setLottieBackground] = useState<LottieStickerBackground>('black');
  const [includeGif, setIncludeGif] = useState(false);
  const [loopSeconds, setLoopSeconds] = useState(2);
  const [lottieProgress, setLottieProgress] = useState(0);

  const phaseRef     = useRef<Phase>('idle');
  const frameRef     = useRef(0);
  const rafRef       = useRef(0);
  const recFrames    = useRef<ImageData[]>([]);
  const holdTimer    = useRef<number | null>(null);
  const isPointerDown= useRef(false);
  const glRef        = useRef<HTMLCanvasElement | null>(null);
  const vidRef       = useRef<HTMLVideoElement | null>(null);
  const previewRef   = useRef<HTMLCanvasElement | null>(null);
  const focusRef     = useRef<OrganicFocus | undefined>(undefined);
  const [phase, _setPhase] = useState<Phase>('idle');

  useEffect(() => { glRef.current = glCanvas; }, [glCanvas]);
  useEffect(() => { vidRef.current = video; }, [video]);

  useEffect(() => {
    if (!stickerMode || !lottieMode) return;
    let raf = 0, frame = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const source = glRef.current, preview = previewRef.current;
      if (!source || !preview || source.width < 2 || source.height < 2) return;
      const maxWidth = window.matchMedia('(max-width: 700px)').matches ? 480 : 720;
      const scale = Math.min(1, maxWidth / source.width);
      const width = Math.max(2, Math.round(source.width * scale));
      const height = Math.max(2, Math.round(source.height * scale));
      if (preview.width !== width || preview.height !== height) { preview.width = width; preview.height = height; }
      if (!focusRef.current || frame++ % 8 === 0) focusRef.current = analyzeOrganicFocus(source, focusRef.current);
      const ctx = preview.getContext('2d');
      if (ctx && focusRef.current) drawLottieStickerPreview(ctx, source, focusRef.current, lottieBackground, now / 1000);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [lottieBackground, lottieMode, stickerMode]);

  const setPhase = (p: Phase) => { phaseRef.current = p; _setPhase(p); };
  const doFlash = () => { setFlash(true); setTimeout(() => setFlash(false), 150); };

  const publishSticker = useCallback((entry: StickerEntry) => {
    addSticker(entry);
    // StickerCapture remains a creation source, but its output now lands in
    // the universal overlay scene immediately so the user can move, animate,
    // react or mosh the result instead of only downloading it.
    useOverlayStore.getState().importStickerEntry(entry);
    setGalleryOpen(true);
  }, [addSticker]);

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
      publishSticker({ id: crypto.randomUUID(), url, animated: true, w: first.width, h: first.height, ts: Date.now() });
    } catch (err) {
      console.error('[sticker] recording capture failed:', err);
      toast.error("Couldn't save that capture — try again");
    } finally {
      setPhase('idle');
      setRecProg(0);
    }
  }, [publishSticker]);

  useEffect(() => {
    if (!stickerMode) return;
    segmentationEngine.loadTap();

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      frameRef.current++;
      const gl = glRef.current, vid = vidRef.current;
      if (!gl) return;

      if (frameRef.current % 6 === 0) setScore(stickerEngine.scoreFrame(gl));
      if (vid && frameRef.current % 90 === 0) stickerEngine.refreshBestMask(vid);
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
    const gl = glRef.current;
    if (!gl || phaseRef.current !== 'idle') return;
    setPhase('capturing');
    try {
      doFlash();
      window.dispatchEvent(new CustomEvent('mosh:make-sticker'));
    } catch (err) {
      console.error('[sticker] static capture failed:', err);
      toast.error("Couldn't save that capture — try again");
    } finally {
      setPhase('idle');
    }
  }, []);

  const startRecording = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    recFrames.current = [];
    setRecProg(0);
    setPhase('recording');
    try { (navigator as any).vibrate?.(12); } catch {}
  }, []);

  const exportLottieSticker = useCallback(async () => {
    const source = glRef.current;
    if (!source || phaseRef.current !== 'idle') return;
    setPhase('encoding'); setLottieProgress(0);
    notifyExportStarted('sticker');
    const toastId = toast.loading('Capturing transparent Lottie loop…', { duration: 30_000 });
    try {
      // The canvas can be mid-resize for a moment right after switching
      // source modes — reachable more easily now that Shift+K can jump
      // straight into a fresh capture without the mode having settled
      // first. Give it a brief window rather than failing on a zero-size
      // read (drawImage throws on a 0×0 source).
      let ready = source.width > 1 && source.height > 1;
      for (let attempt = 0; !ready && attempt < 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        ready = source.width > 1 && source.height > 1;
      }
      if (!ready) throw new Error('Nothing to capture yet — try again in a moment');
      const fps = 8;
      const count = Math.max(8, Math.round(loopSeconds * fps));
      const maxDimension = window.matchMedia('(max-width: 700px)').matches ? 288 : 360;
      const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
      const width = Math.max(2, Math.round(source.width * scale));
      const height = Math.max(2, Math.round(source.height * scale));
      const frames: ImageData[] = [];
      let focus = analyzeOrganicFocus(source, focusRef.current);
      for (let index = 0; index < count; index++) {
        if (index % 3 === 0) focus = analyzeOrganicFocus(source, focus);
        frames.push(renderOrganicStickerFrame(source, width, height, focus, index / fps));
        setLottieProgress((index + 1) / count * .72);
        if (index < count - 1) await new Promise(resolve => setTimeout(resolve, 1000 / fps));
      }
      const id = crypto.randomUUID();
      const name = `Lottie Sticker ${id.slice(0, 8)}`;
      const encodedFrames = await encodeStickerFramesForLottie(frames);
      const json = buildEncodedFrameSequenceLottie(name, encodedFrames, fps);
      const lottieBlob = lottieJsonBlob(json);
      const url = URL.createObjectURL(lottieBlob);
      const asset = { id: `lottie-sticker-${id}`, name, kind: 'lottie-json' as const, url, mimeType: 'application/json', width, height, animated: true, createdAt: Date.now(), objectUrl: true };
      setLottieProgress(.86);
      downloadBlob(lottieBlob, `lottie-sticker-${id.slice(0, 8)}.json`);
      if (includeGif) {
        const gif = await encodeTransparentStickerGif(frames, fps);
        downloadBlob(gif, `lottie-sticker-${id.slice(0, 8)}.gif`);
      }
      setLottieProgress(1);
      toast.success(`Transparent Lottie exported${includeGif ? ' with GIF' : ''}`, { id: toastId });
      void saveOverlayAsset(asset, lottieBlob).then(() => {
        toast.success('Lottie saved to Sticker Vault');
      }).catch(error => {
        console.warn('[lottie-sticker] Vault save failed', error);
        toast.error('Export finished, but Vault save failed');
      });
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      console.error('[lottie-sticker] export failed', error);
      toast.error(error instanceof Error ? `Lottie export failed: ${error.message}` : 'Lottie export failed', { id: toastId });
    } finally {
      setPhase('idle');
      window.setTimeout(() => setLottieProgress(0), 800);
    }
  }, [includeGif, loopSeconds]);

  // Shift+K, handled globally in Editor.tsx (this component is always
  // mounted, same "always-listening" setup as "mosh:make-sticker" above) —
  // reveals the Lottie checkbox as on and captures immediately, without
  // needing scissors mode opened or the checkbox already ticked first.
  useEffect(() => {
    const onShortcut = () => { setLottieMode(true); void exportLottieSticker(); };
    window.addEventListener('mosh:capture-lottie-sticker', onShortcut);
    return () => window.removeEventListener('mosh:capture-lottie-sticker', onShortcut);
  }, [exportLottieSticker]);

  const onPointerDown = () => {
    isPointerDown.current = true;
    // Animated capture needs temporal video frames. Uploads and generated
    // patterns still get the same reliable static Make Sticker action.
    if (!vidRef.current) return;
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
    notifyExportStarted('sticker');
    const a = document.createElement('a');
    a.href = item.url;
    a.download = `mosh-sticker-${item.id.slice(0,8)}.${item.animated ? 'apng' : 'webp'}`;
    a.click();
  };

  const deleteSticker = (id: string) => {
    const item = gallery.find(s => s.id === id);
    // OverlayEntity may share the gallery's blob URL. Never revoke it while a
    // placed overlay still references it.
    if (item && !overlayUsesUrl(item.url)) URL.revokeObjectURL(item.url);
    removeSticker(id);
  };

  useEffect(() => () => {
    gallery?.forEach(s => {
      if (!overlayUsesUrl(s.url)) URL.revokeObjectURL(s.url);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep OverlayStage mounted in every source mode. This makes Vault, selected
  // overlays and the global Make Sticker shortcut available before the user
  // opens the scissors capture controls.
  if (!stickerMode) return <OverlayStage />;

  const glow = score.value;
  const isRecording = phase === 'recording';
  const isCapturing = phase === 'capturing' || phase === 'encoding';
  const isPeaking   = glow > 0.75;
  const glowColor   = `hsl(${260 + glow * 60} 100% ${55 + glow * 12}%)`;
  // The slot is rendered by HotTriggers only while capture mode is active.
  // Query during render so a hide/reveal of the rail picks up its fresh DOM
  // node without keeping a stale portal target around.
  const railSlot = typeof document === 'undefined'
    ? null
    : document.getElementById('mosh-sticker-capture-slot');

  const captureButton = (
    <button
      type="button"
      aria-label={isRecording ? 'Finish animated sticker capture' : 'Capture sticker — tap for still, hold for animated'}
      title={isRecording ? 'Release to finish animated sticker' : 'Capture sticker — tap for still, hold for animated'}
      data-active={isCapturing || isRecording || undefined}
      data-tint=""
      data-no-longpress
      className="hot-trigger relative"
      style={{ ['--ht-tint' as string]: glow > 0.5 ? `${260 + glow * 60} 100% 70%` : '0 0% 60%' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { isPointerDown.current = false; if (holdTimer.current) clearTimeout(holdTimer.current); }}
      onContextMenu={e => e.preventDefault()}
      disabled={isCapturing}
    >
      <span className="hot-trigger__glitch" aria-hidden><Sparkles className="h-4 w-4" strokeWidth={1.5} /></span>
      <span className="hot-trigger__ico"><Sparkles className={isCapturing ? 'h-4 w-4 animate-spin' : isRecording ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} strokeWidth={1.5} /></span>
      {isPeaking && !isRecording && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full animate-ping" style={{ background: glowColor }} />
      )}
    </button>
  );

  return (
    <>
      {/* Universal overlay interaction surface: imports + placed entities. */}
      <OverlayStage />

      {lottieMode && <canvas ref={previewRef} aria-label="Lottie Sticker live preview" className="pointer-events-none absolute inset-0 z-[24] h-full w-full" />}

      <section className="pointer-events-auto absolute right-3 top-14 z-[55] w-[min(88vw,17rem)] rounded-xl border border-white/15 bg-black/88 p-2.5 shadow-2xl backdrop-blur-xl" aria-label="Sticker panel">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-white/75">
            <input type="checkbox" checked={lottieMode} onChange={event => setLottieMode(event.target.checked)} className="accent-violet-400" />
            Lottie Sticker Mode
          </label>
          <button type="button" onClick={() => useStore.getState().setStickerMode(false)} aria-label="Close Sticker panel" className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white"><X size={11} /></button>
        </div>
        {lottieMode && <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          <div className="flex items-center justify-between gap-2 font-mono text-[7px] uppercase tracking-[0.1em] text-white/45">
            <span>Living background</span>
            <div className="flex overflow-hidden rounded-full border border-white/15">
              {(['black', 'white'] as LottieStickerBackground[]).map(value => <button type="button" key={value} onClick={() => setLottieBackground(value)} data-active={lottieBackground === value || undefined} className={`px-2 py-1 ${lottieBackground === value ? 'bg-violet-400/20 text-violet-100' : 'text-white/40'}`}>{value}</button>)}
            </div>
          </div>
          <label className="flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-white/45">Loop<select value={loopSeconds} onChange={event => setLoopSeconds(Number(event.target.value))} className="rounded border border-white/15 bg-black px-2 py-1 text-violet-100"><option value={1.5}>1.5 sec</option><option value={2}>2 sec</option><option value={3}>3 sec</option></select></label>
          <label className="flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-white/45"><span>Also export transparent GIF</span><input type="checkbox" checked={includeGif} onChange={event => setIncludeGif(event.target.checked)} className="accent-violet-400" /></label>
          <button type="button" disabled={phase === 'encoding'} onClick={() => void exportLottieSticker()} className="flex w-full items-center justify-center gap-1.5 rounded-full border border-violet-300/35 bg-violet-400/10 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-violet-100 disabled:opacity-40">{phase === 'encoding' ? <LoaderCircle size={11} className="animate-spin" /> : <Film size={11} />} {phase === 'encoding' ? `Capturing ${Math.round(lottieProgress * 100)}%` : 'Export Transparent Lottie'}</button>
          <p className="font-mono text-[6px] uppercase leading-relaxed tracking-[0.08em] text-white/25">Preview fill is removed on export. JSON auto-saves to Sticker Vault.</p>
        </div>}
      </section>

      {flash && <div className="pointer-events-none fixed inset-0 z-[200] bg-white/15 animate-pulse" style={{ animationDuration: '0.1s' }} />}

      {railSlot
        ? createPortal(captureButton, railSlot)
        : <div className="pointer-events-auto absolute right-3 top-14 z-30">{captureButton}</div>}

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
