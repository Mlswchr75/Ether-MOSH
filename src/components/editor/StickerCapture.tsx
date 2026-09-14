import { FloatingPanelMinimize } from './FloatingPanelMinimize';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Crosshair, Download, Film, ImagePlus, Layers3, Library, LoaderCircle, ScanLine, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useProximityIdle } from '@/hooks/useProximityIdle';
import { useOverlayStore } from '@/store/useOverlayStore';
import { stickerEngine, type StickerScore } from '@/engine/StickerEngine';
import { segmentationEngine, type MaskResult, type SegmentableSource } from '@/engine/SegmentationEngine';
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

import { renderFxStack, paintFxFrame, enableFxCapture, configureFxCapture, type FxShapeOptions } from '@/engine/overlay/fxStackCapture';

import { FLOATING_EFFECTS } from '@/engine/floatingEffects';

type Phase = 'idle' | 'capturing' | 'recording' | 'encoding';

function overlayUsesUrl(url: string): boolean {
  return useOverlayStore.getState().entities.some(entity => entity.asset.url === url);
}

/** Match the preview bitmap to the visualizer's aspect, capped for a cheap
 * live redraw. The organic sticker frame is then composited inside this full
 * display-sized surface, so its only straight boundary is the screen itself. */
function previewStageFrameSize(source: HTMLCanvasElement, maxDimension: number) {
  const aspect = source.width / Math.max(1, source.height);
  return aspect >= 1
    ? { width: maxDimension, height: Math.max(1, Math.round(maxDimension / aspect)) }
    : { width: Math.max(1, Math.round(maxDimension * aspect)), height: maxDimension };
}

export function StickerCapture() {
  const stickerMode          = useStore(s => s.stickerMode);
  const isolationMode        = useStore(s => s.isolationMode);
  const setIsolationMode     = useStore(s => s.setIsolationMode);
  const glCanvas             = useStore(s => s.glCanvas);
  const video                = useStore(s => s.videoElement);
  const image                = useStore(s => s.imageElement);
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
  /* The Sticker Studio panel sits over the top-right of a full-screen
     visualiser. It steps out of the way when nobody is reaching for it, and
     comes back only for a pointer that approaches it — never for a keystroke,
     so the whole app stays drivable from the keyboard without ever putting
     chrome back over the artwork. See useProximityIdle. */
  const studioRef = useRef<HTMLElement>(null);
  const studioHidden = useProximityIdle(studioRef);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [captureStyle, setCaptureStyle] = useState<'subject' | 'fx'>('subject');
  const fxMode = captureStyle === 'fx';
  const [fxCutoff, setFxCutoff] = useState(.02);
  const [stayInside, setStayInside] = useState(true);
  const [organic, setOrganic] = useState(true);
  const [organicSeed, setOrganicSeed] = useState(0);
  const [organicRoughness, setOrganicRoughness] = useState(0.7);
  const [shapeCombine, setShapeCombine] = useState<FxShapeOptions['combine']>('join');
  const stackLayers = useStore(s => s.layers);
  const selectedLayerId = useStore(s => s.selectedLayerId);
  const shapeLayers = stackLayers.filter(layer => FLOATING_EFFECTS.some(fx => fx.id === layer.effectId));
  const hasActiveShape = shapeLayers.some(layer => !layer.hidden && layer.opacity > 0 && (layer.params.amount ?? 0.65) > 0);
  const selectedShape = shapeLayers.find(layer => layer.id === selectedLayerId) ?? shapeLayers.at(-1);
  const selectedShapeDef = FLOATING_EFFECTS.find(fx => fx.id === selectedShape?.effectId);
  useEffect(() => {
    if (glCanvas) configureFxCapture(glCanvas, { stayInside, combine: shapeCombine, organic, organicSeed, organicRoughness });
  }, [glCanvas, stayInside, shapeCombine, organic, organicSeed, organicRoughness]);
  useEffect(() => {
    if(stickerMode && fxMode && glCanvas) return enableFxCapture(glCanvas);
  },[stickerMode,fxMode,glCanvas]);
  const [lottieMode, setLottieMode] = useState(false);
  const [lottieBackground, setLottieBackground] = useState<LottieStickerBackground>('black');
  const [includeGif, setIncludeGif] = useState(true);
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
  const imgRef       = useRef<HTMLImageElement | null>(null);
  const previewRef   = useRef<HTMLCanvasElement | null>(null);
  const focusRef     = useRef<OrganicFocus | undefined>(undefined);
  const alphaBoxRef  = useRef<ContentBox | undefined>(undefined);
  const isolationFocusRef = useRef<OrganicFocus | undefined>(undefined);
  const isolationRequestRef = useRef(0);
  // The crop window the live preview actually renders through — committed
  // once per mosh stack, then held fixed. `focusRef` above keeps
  // re-analyzing every 8th frame so
  // the mask's own alpha stays alive and audio-reactive, but bouncing THAT
  // fresh box straight into the crop every time is what was making the
  // preview's whole frame jump between different regions of the source
  // every few seconds — this decouples "what shape is inside the frame"
  // (kept live) from "where the frame itself is" (locked).
  const lockedBoxRef = useRef<ContentBox | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, _setPhase] = useState<Phase>('idle');

  useEffect(() => { glRef.current = glCanvas; }, [glCanvas]);
  useEffect(() => { vidRef.current = video; }, [video]);
  useEffect(() => { imgRef.current = image; }, [image]);
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
    if (!source || source.width < 2 || source.height < 2 || mode === 'off' || transparentActive || fxMode) {
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
  }, [tapPoint, transparentActive, fxMode]);

  useEffect(() => {
    if (!stickerMode || transparentActive || fxMode) return;
    isolationFocusRef.current = undefined;
    lockedBoxRef.current = undefined;
    if (isolationMode === 'tap' && !tapPoint) { setIsolationState('tap'); return; }
    const frame = requestAnimationFrame(() => { void prepareIsolationFocus(); });
    return () => cancelAnimationFrame(frame);
  }, [isolationMode, moshSeed, prepareIsolationFocus, stickerMode, tapPoint, transparentActive, fxMode]);

  useEffect(() => {
    if (stickerMode && isolationMode === 'off' && !transparentActive && !fxMode) setIsolationMode('auto');
  }, [isolationMode, setIsolationMode, stickerMode, transparentActive, fxMode]);

  useEffect(() => {
    if (!stickerMode || (!lottieMode && !fxMode)) return;
    let raf = 0, frame = 0, lastFxFrame = 0;
    const maxDimension = window.matchMedia('(max-width: 700px)').matches ? 480 : 720;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const source = glRef.current, preview = previewRef.current;
      if (!source || !preview || source.width < 2 || source.height < 2) return;
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      if (fxMode) {
        if (now - lastFxFrame < 1000 / 24) return;
        lastFxFrame = now;
        const stage = previewStageFrameSize(source, maxDimension);
        if (preview.width !== stage.width || preview.height !== stage.height) { preview.width = stage.width; preview.height = stage.height; }
        paintFxFrame(ctx, renderFxStack(source, stage.width, stage.height, fxCutoff), lottieBackground);
        return;
      }
      if (transparentActive) {
        // Genuine alpha, not a synthesized cutout — the preview should show
        // exactly what export will capture, including a fully opaque
        // upload reading as fully opaque (nothing invents shape here).
        if (!alphaBoxRef.current || frame++ % 8 === 0) alphaBoxRef.current = analyzeRealAlphaBounds(source, alphaBoxRef.current);
        const box = alphaBoxRef.current;
        const { width, height } = contentFrameSize(box, maxDimension);
        const stage = previewStageFrameSize(source, maxDimension);
        if (preview.width !== stage.width || preview.height !== stage.height) { preview.width = stage.width; preview.height = stage.height; }
        drawLottieStickerPreview(ctx, renderRealAlphaFrame(source, box, width, height), lottieBackground, now / 1000);
        return;
      }
      if (!focusRef.current || frame++ % 8 === 0) {
        const analyzed = analyzeOrganicFocus(source, focusRef.current);
        focusRef.current = isolationMode === 'off' ? analyzed : isolateOrganicFocus(analyzed, isolationMode, tapPoint);
      }
      const focus = isolationFocusRef.current ?? focusRef.current;
      if (!focus) return;
      // Commit the crop window once, then hold it until the user explicitly
      // reshapes the sticker or a genuine moshSeed arrives. The alpha field
      // keeps evolving inside that stable frame, but UI taps, audio motion,
      // and threshold drift can no longer make the whole sticker jump.
      const freshBox: ContentBox = { left: focus.left, right: focus.right, top: focus.top, bottom: focus.bottom };
      if (!lockedBoxRef.current) lockedBoxRef.current = freshBox;
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
      const stage = previewStageFrameSize(source, maxDimension);
      if (preview.width !== stage.width || preview.height !== stage.height) { preview.width = stage.width; preview.height = stage.height; }
      // The mask's alpha still tracks the freshest analysis (kept alive,
      // audio-reactive) — only the crop window (left/right/top/bottom) is
      // pinned to the lock, exactly the "committed box + live field" split
      // exportLottieSticker's own capture loop already relies on below.
      const renderFocus: OrganicFocus = { ...focus, ...lockedBox };
      drawLottieStickerPreview(ctx, renderOrganicStickerFrame(source, renderFocus, width, height, now / 1000), lottieBackground, now / 1000);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isolationMode, lottieBackground, lottieMode, stickerMode, tapPoint, transparentActive, fxMode, fxCutoff]);

  const setPhase = (p: Phase) => { phaseRef.current = p; _setPhase(p); };

  /**
   * Whatever the current source mode actually has: the live camera feed
   * where there is one, the uploaded still where there isn't, and — in forge
   * mode, which has neither — the rendered canvas itself, since the forge
   * output *is* the picture there rather than a distinct clean layer under
   * an FX stack. Keeps sticker capture working identically across every
   * source mode instead of only camera.
   */
  const captureSource = (): SegmentableSource | null => vidRef.current ?? imgRef.current ?? glRef.current;

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
    if (!stickerMode || fxMode) return;
    segmentationEngine.loadTap();

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      frameRef.current++;
      const gl = glRef.current, src = captureSource();
      if (!gl || !src) return;

      if (frameRef.current % 6 === 0) setScore(stickerEngine.scoreFrame(gl));
      if (frameRef.current % 90 === 0) stickerEngine.refreshBestMask(src);
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
  }, [stickerMode, finishRecording, fxMode]);

  // The actual capture — segmenting/cropping/compositing off the live
  // render — now happens in OverlayVault's own "mosh:make-sticker" listener
  // (resolveStickerSource reads glCanvas directly, which is already
  // source-mode-agnostic since it's the final rendered frame regardless of
  // upload/camera/forge/motif). This just supplies the tap feedback and
  // fires the event; captureSource()/refreshBestMask below are still used
  // by the hold-to-record animated path.
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

  const exportLottieSticker = useCallback(async (options?: { includeGif?: boolean }) => {
    const source = glRef.current;
    if (!source || phaseRef.current !== 'idle') return;
    const exportGif = options?.includeGif ?? includeGif;
    setPhase('encoding'); setLottieProgress(0);
    notifyExportStarted('sticker');
    const toastId = toast.loading(transparentActive ? 'Capturing transparent-source loop…' : 'Capturing transparent Lottie loop…', { duration: 30_000 });
    // Held for the whole capture (frames + encoding), not just the frame
    // loop below — mosh/forgeMosh/etc. all no-op while this is true (see
    // captureLocked's own doc in useStore.ts), so nothing can change the FX
    // stack out from under a capture already in progress, regardless of
    // what triggers it: a stray click, Auto-Mosh's timer, anything.
    useStore.getState().setCaptureLocked(true);
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
      if (fxMode) {
        ({ width, height } = previewStageFrameSize(source, maxDimension));
        for (let index = 0; index < count; index++) {
          frames.push(renderFxStack(source, width, height, fxCutoff));
          setLottieProgress((index + 1) / count * .72);
          if (index < count - 1) await new Promise(resolve => setTimeout(resolve, 1000 / fps));
        }
      } else if (transparentActive) {
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
        // Use exactly what the live preview has already been showing —
        // no fresh analysis, no re-running prepareIsolationFocus's semantic
        // segmentation pass. That earlier version re-derived the crop box
        // AND called prepareIsolationFocus() fresh here, and the latter's
        // whole job is to overwrite isolationFocusRef.current with a newly
        // computed mask — which the live preview reads from on every frame.
        // So the instant export started, it was silently mutating the very
        // thing on screen out from under the user, even after the crop box
        // itself got locked down. Reusing the refs the preview already
        // populated is what actually makes "what you're looking at" equal
        // "what gets captured."
        let focus: OrganicFocus = isolationFocusRef.current ?? focusRef.current ?? analyzeOrganicFocus(source);
        // The output canvas's dimensions — and the source region it's
        // cropped from — are committed once here rather than re-derived
        // every frame: an animated Lottie/GIF needs a single fixed canvas
        // size across all its frames, so the *frame* (crop window + aspect)
        // has to stay put for the capture even though the *alpha shape*
        // inside it keeps analyzing and evolving in real time below. Reuses
        // the live preview's already-locked crop window when one exists,
        // same reasoning as above — falls back to focus's own bounds only
        // when there isn't a lock yet (first capture of a session).
        const committedBox: ContentBox = lockedBoxRef.current
          ?? { left: focus.left, right: focus.right, top: focus.top, bottom: focus.bottom };
        ({ width, height } = contentFrameSize(committedBox, maxDimension));
        for (let index = 0; index < count; index++) {
          // Keep the alpha/mask field alive during capture, same as the
          // live preview's own every-8th-frame refresh (every 3rd here
          // since capture already runs at a fixed, slower cadence) — this
          // is what lets tendrils/edges keep moving during the loop instead
          // of freezing the first frame's mask for the whole capture. The
          // crop WINDOW (committedBox) never moves regardless.
          if (index % 3 === 0) {
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
      if (exportGif) {
        const gif = await encodeTransparentStickerGif(frames, fps);
        downloadBlob(gif, `lottie-sticker-${id.slice(0, 8)}.gif`);
      }
      setLottieProgress(1);
      toast.success(`Transparent Lottie exported${exportGif ? ' with GIF' : ''}`, { id: toastId });
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
      useStore.getState().setCaptureLocked(false);
      setPhase('idle');
      window.setTimeout(() => setLottieProgress(0), 800);
    }
  }, [includeGif, isolationMode, loopSeconds, outputLongEdge, tapPoint, transparentActive, fxMode, fxCutoff]);

  const exportFxMedia = useCallback(async (format: 'png' | 'gif' | 'transparent-gif' | 'video') => {
    const source = glRef.current;
    if (!source || phaseRef.current !== 'idle') return;
    setPhase('encoding');
    useStore.getState().setCaptureLocked(true);
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    try {
      const { width, height } = previewStageFrameSize(source, outputLongEdge);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');
      const draw = () => paintFxFrame(ctx, renderFxStack(source, width, height, fxCutoff), undefined);
      draw();
      let blob: Blob;
      if (format === 'png') {
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed')), 'image/png'));
      } else if (format === 'video') {
        if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) throw new Error('Video recording unavailable in this browser');
        const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'].find(t => MediaRecorder.isTypeSupported(t));
        if (!mimeType) throw new Error('No supported video encoder');
        stream = canvas.captureStream(30);
        recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        const finished = new Promise<Blob>((resolve, reject) => {
          recorder!.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          recorder!.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
          recorder!.onerror = () => reject(new Error('Video encoding failed'));
        });
        // Attach rejection handling immediately while capture is still running.
        void finished.catch(() => {});
        recorder.start();
        const start = performance.now();
        while (performance.now() - start < loopSeconds * 1000) {
          draw(); setLottieProgress((performance.now() - start) / (loopSeconds * 1000));
          await new Promise(resolve => setTimeout(resolve, 1000 / 30));
        }
        recorder.stop(); blob = await finished;
      } else {
        const frames: ImageData[] = [];
        const count = Math.round(loopSeconds * 8);
        for (let i = 0; i < count; i++) {
          draw(); frames.push(ctx.getImageData(0, 0, width, height));
          setLottieProgress((i + 1) / count);
          if (i < count - 1) await new Promise(resolve => setTimeout(resolve, 125));
        }
        blob = await encodeTransparentStickerGif(frames, 8);
      }
      const extension = format === 'video' ? blob.type.includes('mp4') ? 'mp4' : 'webm' : format === 'png' ? 'png' : 'gif';
      downloadBlob(blob, `mosh-fx-stack-${Date.now()}.${extension}`);
      toast.success('FX Stack capture exported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'FX capture failed');
    } finally {
      if (recorder?.state === 'recording') recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      useStore.getState().setCaptureLocked(false); setPhase('idle'); setLottieProgress(0);
    }
  }, [fxCutoff, lottieMode, lottieBackground, loopSeconds, outputLongEdge]);

  // Cmd/Ctrl+Shift+K, handled globally in Editor.tsx (this component is always
  // mounted, same "always-listening" setup as "mosh:make-sticker" above) —
  // reveals the Lottie checkbox as on and captures immediately, without
  // needing scissors mode opened or the checkbox already ticked first.
  useEffect(() => {
    const onShortcut = () => {
      const enteringLottieMode = !lottieMode;
      setLottieMode(true);
      if (enteringLottieMode) setIncludeGif(true);
      void exportLottieSticker({ includeGif: enteringLottieMode ? true : includeGif });
    };
    window.addEventListener('mosh:capture-lottie-sticker', onShortcut);
    return () => window.removeEventListener('mosh:capture-lottie-sticker', onShortcut);
  }, [exportLottieSticker, includeGif, lottieMode]);

  // Cmd/Ctrl+Shift+Space while in Sticker Mode, handled globally in Editor.tsx (same
  // always-listening event-bridge pattern as the shortcuts above). Instead
  // of moshing the FX stack, this throws out the live preview's current
  // crop lock and re-reads the source fresh — a new proposed framing/
  // border/structural shape for the sticker, with no history smoothing
  // holding it back. Repeatable indefinitely: each press is an independent
  // fresh read, not a walk through a fixed sequence, so it never "runs out"
  // of new shapes to propose.
  const rerollStickerShape = useCallback(() => {
    const source = glRef.current;
    if (!source || phaseRef.current !== 'idle' || source.width < 2 || source.height < 2) return;
    if (fxMode) return;
    if (transparentActive) {
      // Genuine-alpha path: there's no synthesized mask to regenerate, but
      // the crop window around the actual alpha content is still worth a
      // fresh read — every FX shader in the live pipeline reshapes that
      // source's real transparency, so where its visible content currently
      // sits can genuinely differ from wherever the box last settled.
      // Called with no `previous` (unlike the live preview's own periodic
      // read) so this is a cold read, not blended toward the old box.
      alphaBoxRef.current = analyzeRealAlphaBounds(source);
      doFlash();
      return;
    }
    const organic = analyzeOrganicFocus(source);
    const isolated = isolationMode === 'off' ? organic : isolateOrganicFocus(organic, isolationMode, tapPoint);
    // Both refs, not just one: the preview's own render loop prefers
    // isolationFocusRef over focusRef whenever a semantic/tap isolation is
    // active, so leaving isolationFocusRef pointed at a stale lock would
    // make the reroll invisible under those isolation modes.
    focusRef.current = isolated;
    isolationFocusRef.current = isolated;
    const freshBox: ContentBox = { left: isolated.left, right: isolated.right, top: isolated.top, bottom: isolated.bottom };
    lockedBoxRef.current = freshBox;
    doFlash();
  }, [isolationMode, tapPoint, transparentActive, fxMode]);

  useEffect(() => {
    window.addEventListener('mosh:reroll-sticker-shape', rerollStickerShape);
    return () => window.removeEventListener('mosh:reroll-sticker-shape', rerollStickerShape);
  }, [rerollStickerShape]);

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

      {(lottieMode || fxMode) && <canvas ref={previewRef} aria-label="Lottie Sticker live preview" className="pointer-events-none absolute inset-0 z-[24] h-full w-full" />}

      {!fxMode && isolationMode === 'tap' && tapArmed && !transparentActive && (
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

      <section
        ref={studioRef}
        /* Hidden visually rather than unmounted: the reveal zone is derived
           from this element's own rect, and scroll position plus any
           in-progress input inside it survive the round trip. */
        data-idle-hidden={studioHidden || undefined}
        data-sticker-controls
        aria-hidden={studioHidden || undefined}
        className={`absolute right-3 top-14 z-[60] max-h-[calc(100dvh-5rem)] w-[min(92vw,21rem)] overflow-y-auto rounded-2xl border border-white/15 bg-black/90 p-3 shadow-2xl backdrop-blur-xl transition-opacity duration-300 ${studioHidden ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"}`}
        aria-label="Sticker Studio"
      ><FloatingPanelMinimize label="Sticker Studio" />
        <div className="flex items-center justify-between gap-2">
          <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100">Sticker Studio</p><p className="mt-0.5 font-mono text-[6px] uppercase tracking-[0.1em] text-white/35">isolate · cut · animate · reuse</p></div>
          <button type="button" onClick={() => useStore.getState().setStickerMode(false)} aria-label="Close Sticker panel" className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white"><X size={11} /></button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Sticker capture process">
          {(['subject', 'fx'] as const).map(value => <button key={value} type="button" disabled={phase !== 'idle'} aria-pressed={captureStyle === value} onClick={() => { setCaptureStyle(value); isolationRequestRef.current++; setTapArmed(false); }} className={`rounded-lg border p-2 text-xs ${captureStyle === value ? 'border-violet-300 text-violet-100 bg-violet-400/20' : 'border-white/20 text-white/50'}`}>{value === 'subject' ? 'Subject · Original' : 'FX Stack'}</button>)}
        </div>
        {fxMode && <div className="mt-3 space-y-2 text-xs text-white/70">
          <p>{stayInside && hasActiveShape ? 'Floating shapes carry your source imagery. Color effects stay inside; warps move the cutout.' : 'Keep source content only where the FX stack visibly changes it. Unchanged pixels become transparent.'}</p>
          <div className="grid grid-cols-3 gap-1" aria-label="Add floating effect">
            {FLOATING_EFFECTS.map(fx => <button key={fx.id} type="button" disabled={phase !== 'idle'} title={fx.blurb} onClick={() => useStore.getState().addLayer(fx.id)} className="rounded border border-cyan-200/25 px-1 py-2 text-[10px] text-cyan-100 disabled:opacity-40">+ {fx.name}</button>)}
          </div>
          <div className="rounded border border-cyan-200/20 p-2 space-y-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={organic} disabled={phase !== 'idle'} onChange={e => setOrganic(e.target.checked)} />Organic cut</label>
            {organic && <>
              <p className="text-[10px] text-white/60">Curved fragments and a source-responsive, asymmetric outline. Keeps canvas edges out of your sticker.</p>
              <label className="block text-[10px]">Irregularity<input aria-label="Organic irregularity" className="block w-full" type="range" min="0" max="1" step="0.01" value={organicRoughness} disabled={phase !== 'idle'} onChange={e=>setOrganicRoughness(Number(e.target.value))} /></label>
              <button type="button" disabled={phase !== 'idle'} onClick={()=>setOrganicSeed(seed=>seed+2.39996)} className="rounded border border-white/25 px-2 py-1 text-[10px]">New silhouette</button>
            </>}
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={stayInside} disabled={phase !== 'idle'} onChange={e => setStayInside(e.target.checked)} />Stay inside sticker</label>
          {stayInside && <label className="flex items-center justify-between">Combine shapes<select aria-label="Combine sticker shapes" value={shapeCombine} disabled={phase !== 'idle'} onChange={e => setShapeCombine(e.target.value as FxShapeOptions['combine'])} className="rounded bg-black text-white"><option value="join">Join</option><option value="overlap">Overlap</option><option value="cut">Cut out</option></select></label>}
          {selectedShape && selectedShapeDef && <details className="rounded border border-white/10 p-2">
            <summary className="cursor-pointer">Tune {selectedShapeDef.name}</summary>
            <p className="my-2 text-[10px] text-white/50">{selectedShapeDef.blurb}</p>
            {selectedShapeDef.params.map(param => <label key={param.key} className="mt-1 block text-[10px]">{param.label}<input aria-label={`${selectedShapeDef.name} ${param.label}`} type="range" min={param.min} max={param.max} step={param.step ?? 0.005} value={selectedShape.params[param.key] ?? param.default} disabled={phase !== 'idle'} onChange={e => useStore.getState().setParam(selectedShape.id, param.key, Number(e.target.value))} className="block w-full" /></label>)}
          </details>}
          {!(stayInside && hasActiveShape) && <label className="block">Change threshold · {Math.round(fxCutoff * 100)}%<input aria-label="FX change threshold" disabled={phase !== 'idle'} type="range" min="0" max="0.5" step="0.005" value={fxCutoff} onChange={e => setFxCutoff(Number(e.target.value))} className="w-full" /></label>}
          <p className="text-[10px] text-white/40">Black and white are preview backgrounds only. All sticker exports keep transparency. Add a floating shape to keep full-frame color treatments confined. Layer order changes the result.</p>
        </div>}
        {!fxMode && <div className="mt-3 rounded-xl border border-cyan-200/15 bg-cyan-300/[0.035] p-2">
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
        </div>}

        <div className="mt-2 flex gap-1.5">
          {!fxMode && captureButton}
          {fxMode && <div className="grid flex-1 grid-cols-2 gap-1">
            {(['png', 'transparent-gif'] as const).map(format => <button type="button" key={format} disabled={phase !== 'idle'} onClick={() => void exportFxMedia(format)} className="rounded border border-white/20 p-2 text-[10px] text-white/80 disabled:opacity-40">{format === 'png' ? 'Transparent PNG' : 'Transparent GIF'}</button>)}
          </div>}
          <button type="button" onClick={() => window.dispatchEvent(new Event('mosh:toggle-sticker-vault'))} className="flex items-center justify-center rounded-full border border-white/15 px-3 text-white/50 transition hover:border-cyan-200/30 hover:text-cyan-100" aria-label="Open Sticker Vault"><Library size={12} /></button>
        </div>

        <label className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-white/75">
          <input
            type="checkbox"
            checked={lottieMode}
            onChange={event => {
              const enabled = event.target.checked;
              setLottieMode(enabled);
              if (enabled) setIncludeGif(true);
            }}
            className="accent-violet-400"
          />
          Animated Lottie
        </label>
        {lottieMode && <label className="mt-2 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-white/75">
          <input type="checkbox" checked={includeGif} onChange={event => setIncludeGif(event.target.checked)} className="accent-violet-400" />
          Transparent GIF
        </label>}
        {(lottieMode || fxMode) && <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
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
            <span>Preview / capture background</span>
            <div className="flex overflow-hidden rounded-full border border-white/15">
              {(['black', 'white'] as LottieStickerBackground[]).map(value => <button type="button" key={value} onClick={() => setLottieBackground(value)} data-active={lottieBackground === value || undefined} className={`px-2 py-1 ${lottieBackground === value ? 'bg-violet-400/20 text-violet-100' : 'text-white/40'}`}>{value}</button>)}
            </div>
          </div>
          <label className="flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-white/45">Loop<select value={loopSeconds} onChange={event => setLoopSeconds(Number(event.target.value))} className="rounded border border-white/15 bg-black px-2 py-1 text-violet-100"><option value={1.5}>1.5 sec</option><option value={2}>2 sec</option><option value={3}>3 sec</option></select></label>
          <label className="flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-white/45">Master size<select value={outputLongEdge} onChange={event => setOutputLongEdge(Number(event.target.value) as 720 | 1080)} className="rounded border border-white/15 bg-black px-2 py-1 text-violet-100"><option value={720}>HD · 720px</option><option value={1080}>Master · 1080px</option></select></label>
          <button
            type="button"
            disabled={phase === 'encoding'}
            // Belt-and-suspenders against this click reaching anything
            // beneath the panel (the canvas's own onClick moshes in Forge/
            // Motif mode) — captureLocked already makes a stray mosh
            // harmless to the capture itself, but there's no reason this
            // tap should ever reach past the button it landed on either.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); void exportLottieSticker(); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-violet-300/35 bg-violet-400/10 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-violet-100 disabled:opacity-40"
          >{phase === 'encoding' ? <LoaderCircle size={11} className="animate-spin" /> : <Film size={11} />} {phase === 'encoding' ? `Capturing ${Math.round(lottieProgress * 100)}%` : includeGif ? 'Export Lottie + GIF' : 'Export Transparent Lottie'}</button>
          <p className="font-mono text-[6px] uppercase leading-relaxed tracking-[0.08em] text-white/25">
            {fxMode ? 'FX-only capture. Unchanged source pixels are transparent. JSON saves to Sticker Vault; preview backgrounds are never exported.' : transparentActive
              ? "Background is preview-only. Export preserves the source's real transparency straight through — every FX shape it."
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
