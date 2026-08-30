import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Crosshair, Download, Film, ImagePlus, Layers3, Library, LoaderCircle, ScanLine, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useOverlayStore } from '@/store/useOverlayStore';
import { stickerEngine, type StickerScore } from '@/engine/StickerEngine';
import { segmentationEngine, type MaskResult } from '@/engine/SegmentationEngine';
import { OverlayStage } from '@/components/editor/OverlayStage';
import { MoshStickerTrigger } from '@/components/editor/MoshStickerTrigger';
import { OverlayImporter } from '@/components/editor/OverlayImporter';
import { StickerForge } from '@/components/editor/StickerForge';
import type { StickerEntry } from '@/store/types';
import { downloadBlob } from '@/engine/export';
import { notifyExportStarted } from '@/components/editor/ExportRegisteredToast';
import { saveOverlayAsset } from '@/engine/overlay/vault';
import { lottieJsonBlob } from '@/engine/overlay/stickerLottie';
import { loadImageFile } from '@/lib/sourceLoader';
import {
  analyzeOrganicFocus,
  analyzeRealAlphaBounds,
  buildEncodedFrameSequenceLottie,
  contentFrameSize,
  drawLottieStickerPreview,
  encodeTransparentStickerGif,
  encodeStickerFramesForLottie,
  isolateOrganicFocus,
  renderOrganicStickerFrame,
  renderRealAlphaFrame,
  sourceHasTransparency,
  type ContentBox,
  type LottieStickerBackground,
  type OrganicFocus,
} from '@/engine/overlay/lottieStickerMode';
import { focusFromSegmentationMasks } from '@/engine/overlay/stickerIsolation';

type Phase = 'idle' | 'capturing' | 'recording' | 'encoding';

function overlayUsesUrl(url: string): boolean {
  return useOverlayStore.getState().entities.some(entity => entity.asset.url === url);
}

export function StickerCapture() {
  const stickerMode          = useStore(s => s.stickerMode);
  const isolationMode        = useStore(s => s.isolationMode);
  const setIsolationMode     = useStore(s => s.setIsolationMode);
  const glCanvas             = useStore(s => s.glCanvas);
  const video                = useStore(s => s.videoElement);
  const sourceMode           = useStore(s => s.sourceMode);
  // Only changes on a genuine mosh-stack reshuffle (mosh()/reroll-seed/
  // favorite/preset-load) — never on an audio-reactive param wiggle within
  // the same stack. Used purely to reset the organic mask's own temporal
  // history below, so the sticker frame snaps to the new stack immediately
  // instead of lagging in behind it the way heavy history-smoothing would.
  const moshSeed              = useStore(s => s.seed);
  const gallery              = useStore(s => s.stickerGallery);
  const addSticker           = useStore(s => s.addStickerToGallery);
  const removeSticker        = useStore(s => s.removeStickerFromGallery);

  const [score, setScore]       = useState<StickerScore>({ value: 0, saturation: 0, complexity: 0 });
  const [flash, setFlash]       = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lottieMode, setLottieMode] = useState(false);
  const [lottieBackground, setLottieBackground] = useState<LottieStickerBackground>('black');
  const [includeGif, setIncludeGif] = useState(false);
  const [loopSeconds, setLoopSeconds] = useState(2);
  const [outputLongEdge, setOutputLongEdge] = useState<720 | 1080>(720);
  const [lottieProgress, setLottieProgress] = useState(0);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [tapArmed, setTapArmed] = useState(false);
  const [isolationState, setIsolationState] = useState<'idle' | 'analyzing' | 'model' | 'organic' | 'tap'>('idle');
  // True once the user has dropped/picked a transparent PNG through the
  // dropzone below. While active, both the live preview and the export
  // capture path switch from the synthesized organic-mask cutout to reading
  // the source's own genuine alpha channel straight through — see
  // analyzeRealAlphaBounds/renderRealAlphaFrame in lottieStickerMode.ts.
  const [transparentActive, setTransparentActive] = useState(false);
  const [transparentBusy, setTransparentBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
  const alphaBoxRef  = useRef<ContentBox | undefined>(undefined);
  const isolationFocusRef = useRef<OrganicFocus | undefined>(undefined);
  const isolationRequestRef = useRef(0);
  // The crop window the live preview actually renders through — committed
  // once per mosh stack (or per genuinely large content shift within one),
  // then held fixed. `focusRef` above keeps re-analyzing every 8th frame so
  // the mask's own alpha stays alive and audio-reactive, but bouncing THAT
  // fresh box straight into the crop every time is what was making the
  // preview's whole frame jump between different regions of the source
  // every few seconds — this decouples "what shape is inside the frame"
  // (kept live) from "where the frame itself is" (locked).
  const lockedBoxRef = useRef<ContentBox | undefined>(undefined);
  const lastLockTimeRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, _setPhase] = useState<Phase>('idle');

  useEffect(() => { glRef.current = glCanvas; }, [glCanvas]);
  useEffect(() => { vidRef.current = video; }, [video]);
  // A genuine-alpha capture only makes sense while the uploaded transparent
  // PNG is still the actual MOSH source — if the user switches to camera,
  // video, forge or any other source, the real-alpha path would otherwise
  // silently keep reading the new (unrelated) canvas as if it still carried
  // the upload's transparency.
  useEffect(() => {
    if (transparentActive && sourceMode !== 'upload') { setTransparentActive(false); alphaBoxRef.current = undefined; }
  }, [sourceMode, transparentActive]);
  // The organic mask's temporal smoothing (see analyzeOrganicFocus) leans
  // heavily on its own history now, on purpose — that's what keeps the
  // sticker frame's shape gliding smoothly instead of jittering while the
  // same mosh stack keeps running. But that same smoothing would make it
  // LAG behind a genuine stack change, so drop the history the instant one
  // actually happens: analyzeOrganicFocus treats an undefined `previous` as
  // its "just changed" signal and snaps to the new stack's shape immediately.
  useEffect(() => {
    focusRef.current = undefined;
    lockedBoxRef.current = undefined;
    isolationFocusRef.current = undefined;
    setTapPoint(null);
    if (useStore.getState().isolationMode === 'tap') setTapArmed(true);
  }, [moshSeed]);

  const prepareIsolationFocus = useCallback(async (point = tapPoint): Promise<OrganicFocus | undefined> => {
    const source = glRef.current;
    const mode = useStore.getState().isolationMode;
    if (!source || source.width < 2 || source.height < 2 || mode === 'off' || transparentActive) {
      isolationFocusRef.current = undefined;
      setIsolationState('idle');
      return undefined;
    }
    if (mode === 'tap' && !point) {
      isolationFocusRef.current = undefined;
      setIsolationState('tap');
      return undefined;
    }
    const request = ++isolationRequestRef.current;
    setIsolationState('analyzing');
    const organic = isolateOrganicFocus(analyzeOrganicFocus(source), mode, point);
    try {
      await segmentationEngine.loadTap();
      if (request !== isolationRequestRef.current) return isolationFocusRef.current;
      if (!segmentationEngine.isTapReady()) throw new Error('interactive segmenter unavailable');
      let masks: MaskResult[];
      if (mode === 'tap' && point) {
        const selected = await segmentationEngine.segmentFromPoint(source, point.x, point.y);
        masks = selected ? [selected] : [];
      } else {
        masks = await segmentationEngine.segmentMultiPoint(source, segmentationEngine.analyzeSaliency(source, mode === 'layers' ? 5 : 3));
      }
      const semantic = focusFromSegmentationMasks(masks, mode, point);
      if (request !== isolationRequestRef.current) return isolationFocusRef.current;
      isolationFocusRef.current = semantic ?? organic;
      setIsolationState(semantic ? 'model' : 'organic');
      return isolationFocusRef.current;
    } catch (error) {
      console.warn('[sticker-studio] semantic isolation unavailable; using organic structure', error);
      if (request !== isolationRequestRef.current) return isolationFocusRef.current;
      isolationFocusRef.current = organic;
      setIsolationState('organic');
      return organic;
    }
  }, [tapPoint, transparentActive]);

  useEffect(() => {
    if (!stickerMode || transparentActive) return;
    isolationFocusRef.current = undefined;
    lockedBoxRef.current = undefined;
    if (isolationMode === 'tap' && !tapPoint) { setIsolationState('tap'); return; }
    const frame = requestAnimationFrame(() => { void prepareIsolationFocus(); });
    return () => cancelAnimationFrame(frame);
  }, [isolationMode, moshSeed, prepareIsolationFocus, stickerMode, tapPoint, transparentActive]);

  useEffect(() => {
    if (stickerMode && isolationMode === 'off' && !transparentActive) setIsolationMode('auto');
  }, [isolationMode, setIsolationMode, stickerMode, transparentActive]);

  useEffect(() => {
    if (!stickerMode || !lottieMode) return;
    let raf = 0, frame = 0;
    const maxDimension = window.matchMedia('(max-width: 700px)').matches ? 480 : 720;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const source = glRef.current, preview = previewRef.current;
      if (!source || !preview || source.width < 2 || source.height < 2) return;
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      if (transparentActive) {
        // Genuine alpha, not a synthesized cutout — the preview should show
        // exactly what export will capture, including a fully opaque
        // upload reading as fully opaque (nothing invents shape here).
        if (!alphaBoxRef.current || frame++ % 8 === 0) alphaBoxRef.current = analyzeRealAlphaBounds(source, alphaBoxRef.current);
        const box = alphaBoxRef.current;
        const { width, height } = contentFrameSize(box, maxDimension);
        if (preview.width !== width || preview.height !== height) { preview.width = width; preview.height = height; }
        drawLottieStickerPreview(ctx, renderRealAlphaFrame(source, box, width, height), lottieBackground, now / 1000);
        return;
      }
      if (!focusRef.current || frame++ % 8 === 0) {
        const analyzed = analyzeOrganicFocus(source, focusRef.current);
        focusRef.current = isolationMode === 'off' ? analyzed : isolateOrganicFocus(analyzed, isolationMode, tapPoint);
      }
      const focus = isolationFocusRef.current ?? focusRef.current;
      if (!focus) return;
      // Commit the crop window once, then hold it — relock only when the
      // content has drifted FAR from the locked box (a real compositional
      // change, not audio-reactive jitter within the same stack) and only
      // after a minimum dwell time, so a borderline reading right at the
      // threshold can't flip-flop the lock back and forth every few frames.
      const freshBox: ContentBox = { left: focus.left, right: focus.right, top: focus.top, bottom: focus.bottom };
      const locked = lockedBoxRef.current;
      if (!locked) {
        lockedBoxRef.current = freshBox;
        lastLockTimeRef.current = now;
      } else {
        const drift = Math.abs(freshBox.left - locked.left) + Math.abs(freshBox.right - locked.right)
          + Math.abs(freshBox.top - locked.top) + Math.abs(freshBox.bottom - locked.bottom);
        if (drift > 0.35 && now - lastLockTimeRef.current > 2200) {
          lockedBoxRef.current = freshBox;
          lastLockTimeRef.current = now;
        }
      }
      const lockedBox = lockedBoxRef.current ?? freshBox;
      if (!lockedBox) {
        raf = requestAnimationFrame(draw);
        return;
      }
      // The frame itself is content-shaped now — size the preview canvas
      // from the LOCKED box's own aspect (computed after analysis, not
      // assumed from the source's landscape aspect beforehand) so a tall,
      // thin or asymmetric shape actually previews as tall and thin, and
      // stays that size until the lock itself moves.
      const { width, height } = contentFrameSize(lockedBox, maxDimension);
      if (preview.width !== width || preview.height !== height) { preview.width = width; preview.height = height; }
      // The mask's alpha still tracks the freshest analysis (kept alive,
      // audio-reactive) — only the crop window (left/right/top/bottom) is
      // pinned to the lock, exactly the "committed box + live field" split
      // exportLottieSticker's own capture loop already relies on below.
      const renderFocus: OrganicFocus = { ...focus, ...lockedBox };
      drawLottieStickerPreview(ctx, renderOrganicStickerFrame(source, renderFocus, width, height, now / 1000), lottieBackground, now / 1000);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isolationMode, lottieBackground, lottieMode, stickerMode, tapPoint, transparentActive]);

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
    setPhase('recording');
    try { (navigator as any).vibrate?.(12); } catch {}
  }, []);

  // Dropzone handler: a transparent PNG dropped/picked here becomes the
  // real, normal MOSH image source (via the same loadImageFile the app's
  // main upload path uses — full validation, upscale, palette extraction,
  // the works), so every FX stack applies to it exactly as it would any
  // other uploaded image. transparentActive then flips the Lottie/GIF
  // export over to the genuine-alpha capture path instead of the
  // synthesized organic-mask one.
  const handleTransparentUpload = useCallback(async (file: File) => {
    if (transparentBusy) return;
    setTransparentBusy(true);
    try {
      const ok = await loadImageFile(file);
      if (!ok) return;
      const img = useStore.getState().imageElement;
      const transparent = img ? sourceHasTransparency(img) : false;
      if (!transparent) {
        toast.warning("That PNG reads as fully opaque — FX will still apply, but there's no transparency for export to preserve.");
      } else {
        toast.success('Transparent source loaded — mosh it, then export as usual.');
      }
      alphaBoxRef.current = undefined;
      setTransparentActive(true);
    } finally {
      setTransparentBusy(false);
    }
  }, [transparentBusy]);

  const onTransparentDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = Array.from(event.dataTransfer.files).find(f => f.type.startsWith('image/'));
    if (file) void handleTransparentUpload(file);
    else toast.error("Drop an image file — ideally a transparent PNG");
  }, [handleTransparentUpload]);

  const exportLottieSticker = useCallback(async () => {
    const source = glRef.current;
    if (!source || phaseRef.current !== 'idle') return;
    setPhase('encoding'); setLottieProgress(0);
    notifyExportStarted('sticker');
    const toastId = toast.loading(transparentActive ? 'Capturing transparent-source loop…' : 'Capturing transparent Lottie loop…', { duration: 30_000 });
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
      // The export contract is unchanged (embedded transparent WebP frames in
      // Lottie, plus the optional transparent GIF), but the master frame is
      // now genuinely useful beyond a tiny preview. 720 is the balanced
      // default; 1080 is available when the source and device warrant it.
      const maxDimension = outputLongEdge;
      const frames: ImageData[] = [];
      let width = 0, height = 0;
      if (transparentActive) {
        // Genuine-alpha path: no energy field, no invented cutout — the
        // uploaded PNG's own alpha channel, now carried and reshaped by
        // every FX shader in the live MOSH pipeline, is captured straight
        // through. A single reading twice before committing (same as the
        // organic path) gives the crop window a fairer read of where real
        // content actually sits before it locks for the whole capture.
        let box = analyzeRealAlphaBounds(source, alphaBoxRef.current);
        box = analyzeRealAlphaBounds(source, box);
        const committedBox: ContentBox = { ...box };
        ({ width, height } = contentFrameSize(committedBox, maxDimension));
        for (let index = 0; index < count; index++) {
          frames.push(renderRealAlphaFrame(source, committedBox, width, height));
          setLottieProgress((index + 1) / count * .72);
          if (index < count - 1) await new Promise(resolve => setTimeout(resolve, 1000 / fps));
        }
      } else {
        const preparedFocus = await prepareIsolationFocus();
        // A single analysis can land on a mid-motion frame — reading twice
        // before committing gives the frame that's about to be locked for
        // this whole capture a fairer read of where the content actually
        // sits.
        let focus = preparedFocus ?? analyzeOrganicFocus(source, focusRef.current);
        if (!preparedFocus) {
          focus = analyzeOrganicFocus(source, focus);
          if (isolationMode !== 'off') focus = isolateOrganicFocus(focus, isolationMode, tapPoint);
        }
        // The output canvas's dimensions — and the source region it's
        // cropped from — are committed once here rather than re-derived
        // every frame: an animated Lottie/GIF needs a single fixed canvas
        // size across all its frames, so the *frame* (crop window + aspect)
        // has to stay put for the capture even though the *alpha shape*
        // inside it keeps analyzing and evolving in real time below.
        const committedBox = { left: focus.left, right: focus.right, top: focus.top, bottom: focus.bottom };
        ({ width, height } = contentFrameSize(focus, maxDimension));
        for (let index = 0; index < count; index++) {
          if (!preparedFocus && index % 3 === 0) {
            focus = analyzeOrganicFocus(source, focus);
            if (isolationMode !== 'off') focus = isolateOrganicFocus(focus, isolationMode, tapPoint);
          }
          const renderFocus = { ...focus, ...committedBox };
          frames.push(renderOrganicStickerFrame(source, renderFocus, width, height, index / fps));
          setLottieProgress((index + 1) / count * .72);
          if (index < count - 1) await new Promise(resolve => setTimeout(resolve, 1000 / fps));
        }
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
  }, [includeGif, isolationMode, loopSeconds, outputLongEdge, prepareIsolationFocus, tapPoint, transparentActive]);

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
  const isolationLabel = isolationState === 'analyzing'
    ? 'Analyzing structure…'
    : isolationState === 'model'
      ? isolationMode === 'layers' ? 'Distinct layer ensemble locked' : 'Semantic subject locked'
      : isolationState === 'organic'
        ? 'Organic structure lock'
        : isolationState === 'tap' ? 'Tap the element you want' : 'Ready';

  const captureButton = (
    <button
      type="button"
      aria-label={isRecording ? 'Finish animated sticker capture' : 'Capture sticker — tap for still, hold for animated'}
      title={isRecording ? 'Release to finish animated sticker' : 'Capture sticker — tap for still, hold for animated'}
      data-active={isCapturing || isRecording || undefined}
      data-tint=""
      data-no-longpress
      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-200/55 disabled:opacity-40"
      style={{ ['--ht-tint' as string]: glow > 0.5 ? `${260 + glow * 60} 100% 70%` : '0 0% 60%' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { isPointerDown.current = false; if (holdTimer.current) clearTimeout(holdTimer.current); }}
      onContextMenu={e => e.preventDefault()}
      disabled={isCapturing}
    >
      <Sparkles className={isCapturing ? 'h-4 w-4 animate-spin' : isRecording ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} strokeWidth={1.5} />
      {isRecording ? 'Release to save loop' : 'Tap still · hold loop'}
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

      {isolationMode === 'tap' && tapArmed && !transparentActive && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Tap a visual element to isolate it for the sticker"
          data-sticker-isolation-target
          className="absolute inset-0 z-[56] cursor-crosshair bg-cyan-300/[0.02]"
          onPointerDown={event => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const point = {
              x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
              y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
            };
            setTapPoint(point);
            setTapArmed(false);
            void prepareIsolationFocus(point);
          }}
        >
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-cyan-200/25 bg-black/65 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-cyan-100 backdrop-blur-md">
            <Crosshair size={12} /> tap an element to cut
          </div>
        </div>
      )}

      <section className="pointer-events-auto absolute right-3 top-14 z-[60] max-h-[calc(100dvh-5rem)] w-[min(92vw,21rem)] overflow-y-auto rounded-2xl border border-white/15 bg-black/90 p-3 shadow-2xl backdrop-blur-xl" aria-label="Sticker Studio">
        <div className="flex items-center justify-between gap-2">
          <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100">Sticker Studio</p><p className="mt-0.5 font-mono text-[6px] uppercase tracking-[0.1em] text-white/35">isolate · cut · animate · reuse</p></div>
          <button type="button" onClick={() => useStore.getState().setStickerMode(false)} aria-label="Close Sticker panel" className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white"><X size={11} /></button>
        </div>

        <div className="mt-3 rounded-xl border border-cyan-200/15 bg-cyan-300/[0.035] p-2">
          <div className="mb-1.5 flex items-center justify-between"><span className="font-mono text-[7px] uppercase tracking-[0.14em] text-cyan-100/75">Cut intelligence</span><span className="font-mono text-[6px] uppercase tracking-[0.1em] text-white/35">{isolationLabel}</span></div>
          <div className="grid grid-cols-3 gap-1">
            {([
              ['auto', ScanLine, 'Auto subject'],
              ['layers', Layers3, 'Scene layers'],
              ['tap', Crosshair, 'Tap select'],
            ] as const).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTapPoint(null); setTapArmed(value === 'tap'); setIsolationMode(value); }}
                data-active={isolationMode === value || undefined}
                className="flex flex-col items-center gap-1 rounded-lg border border-white/10 px-1 py-2 font-mono text-[6px] uppercase tracking-[0.08em] text-white/40 transition hover:border-cyan-200/30 hover:text-cyan-100 data-[active]:border-cyan-200/45 data-[active]:bg-cyan-300/10 data-[active]:text-cyan-100"
              >
                <Icon size={12} />{label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[6px] leading-relaxed tracking-[0.06em] text-white/30">
            {isolationMode === 'layers' ? 'Keeps up to three distinct, related elements with transparent space between them.' : isolationMode === 'tap' ? 'Choose the exact subject or visual layer directly on the canvas.' : 'Ranks semantic subjects, composition, edge integrity and saliency automatically.'}
          </p>
        </div>

        <div className="mt-2 flex gap-1.5">
          {captureButton}
          <button type="button" onClick={() => window.dispatchEvent(new Event('mosh:toggle-sticker-vault'))} className="flex items-center justify-center rounded-full border border-white/15 px-3 text-white/50 transition hover:border-cyan-200/30 hover:text-cyan-100" aria-label="Open Sticker Vault"><Library size={12} /></button>
        </div>

        <label className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-white/75">
          <input type="checkbox" checked={lottieMode} onChange={event => setLottieMode(event.target.checked)} className="accent-violet-400" />
          Animated Lottie {includeGif ? '+ GIF' : ''}
        </label>
        {lottieMode && <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/*"
            className="hidden"
            onChange={event => { const file = event.target.files?.[0]; if (file) void handleTransparentUpload(file); event.target.value = ''; }}
          />
          {transparentActive ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2 py-1.5">
              <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-emerald-200">Transparent PNG source active</span>
              <button type="button" onClick={() => { setTransparentActive(false); alphaBoxRef.current = undefined; }} aria-label="Stop using transparent PNG source" className="rounded-full p-0.5 text-emerald-200/60 hover:bg-white/10 hover:text-emerald-100"><X size={10} /></button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a transparent PNG as the MOSH source"
              data-drag-over={dragOver || undefined}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={event => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onTransparentDrop}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/20 px-2 py-2.5 text-center font-mono text-[7px] uppercase tracking-[0.1em] text-white/45 transition-colors hover:border-violet-300/40 hover:text-violet-100 data-[drag-over]:border-violet-300/60 data-[drag-over]:bg-violet-400/10 data-[drag-over]:text-violet-100"
            >
              {transparentBusy ? <LoaderCircle size={11} className="animate-spin" /> : <ImagePlus size={11} />}
              {transparentBusy ? 'Loading…' : 'Drop or pick a transparent PNG source'}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 font-mono text-[7px] uppercase tracking-[0.1em] text-white/45">
            <span>Living background</span>
            <div className="flex overflow-hidden rounded-full border border-white/15">
              {(['black', 'white'] as LottieStickerBackground[]).map(value => <button type="button" key={value} onClick={() => setLottieBackground(value)} data-active={lottieBackground === value || undefined} className={`px-2 py-1 ${lottieBackground === value ? 'bg-violet-400/20 text-violet-100' : 'text-white/40'}`}>{value}</button>)}
            </div>
          </div>
          <label className="flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-white/45">Loop<select value={loopSeconds} onChange={event => setLoopSeconds(Number(event.target.value))} className="rounded border border-white/15 bg-black px-2 py-1 text-violet-100"><option value={1.5}>1.5 sec</option><option value={2}>2 sec</option><option value={3}>3 sec</option></select></label>
          <label className="flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-white/45">Master size<select value={outputLongEdge} onChange={event => setOutputLongEdge(Number(event.target.value) as 720 | 1080)} className="rounded border border-white/15 bg-black px-2 py-1 text-violet-100"><option value={720}>HD · 720px</option><option value={1080}>Master · 1080px</option></select></label>
          <label className="flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-white/45"><span>Also export transparent GIF</span><input type="checkbox" checked={includeGif} onChange={event => setIncludeGif(event.target.checked)} className="accent-violet-400" /></label>
          <button type="button" disabled={phase === 'encoding'} onClick={() => void exportLottieSticker()} className="flex w-full items-center justify-center gap-1.5 rounded-full border border-violet-300/35 bg-violet-400/10 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-violet-100 disabled:opacity-40">{phase === 'encoding' ? <LoaderCircle size={11} className="animate-spin" /> : <Film size={11} />} {phase === 'encoding' ? `Capturing ${Math.round(lottieProgress * 100)}%` : 'Export Transparent Lottie'}</button>
          <p className="font-mono text-[6px] uppercase leading-relaxed tracking-[0.08em] text-white/25">
            {transparentActive
              ? "Living background is preview-only. Export preserves the source's real transparency straight through — every FX shape it."
              : 'Preview fill is removed on export. JSON auto-saves to Sticker Vault.'}
          </p>
        </div>}

        <details className="mt-3 border-t border-white/10 pt-2">
          <summary className="cursor-pointer font-mono text-[7px] uppercase tracking-[0.14em] text-white/40 hover:text-white/70">More sticker sources & motion</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <OverlayImporter />
            <StickerForge />
            <MoshStickerTrigger delay={0} variant="panel" />
          </div>
          <p className="mt-1.5 font-mono text-[6px] leading-relaxed tracking-[0.06em] text-white/25">Import PNG, WebP, GIF, SVG or Lottie; forge Universal/Vector Lottie; or place a short looping video/GIF clip.</p>
        </details>
      </section>

      {flash && <div className="pointer-events-none fixed inset-0 z-[200] bg-white/15 animate-pulse" style={{ animationDuration: '0.1s' }} />}

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
