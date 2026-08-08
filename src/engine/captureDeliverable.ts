/**
 * Capture the live canvas as a platform-ready file.
 *
 * The awkward part is aspect. The canvas is sized to the viewport, and every
 * deliverable here is a fixed shape that almost never matches it. Rather than
 * resize the live renderer — which would visibly reflow the app mid-capture and
 * fight the resize observer — frames are drawn through an offscreen canvas at
 * the target size, centre-cropped to cover. The user keeps watching the same
 * thing they were watching; only the recording is reshaped.
 */
import { CanvasRecorder } from "./recorder";
import {
  clampDuration,
  deliverableFilename,
  isDeliverable,
  validate,
  type Deliverable,
  type ValidationIssue,
} from "./deliverables";

export type CaptureResult = {
  blob: Blob;
  filename: string;
  mimeType: string;
  seconds: number;
  width: number;
  height: number;
  issues: ValidationIssue[];
  ok: boolean;
};

export type CaptureOpts = {
  seconds?: number;
  /** 0..1 progress. */
  onProgress?: (t: number) => void;
  signal?: AbortSignal;
};

/**
 * Draw `src` into `dst` centre-cropped to cover, preserving aspect.
 *
 * Cover rather than fit: letterboxing a visual meant to fill a phone screen
 * with black bars is worse than losing the edges of it.
 */
function drawCover(src: HTMLCanvasElement, dst: CanvasRenderingContext2D, w: number, h: number) {
  const sw = src.width;
  const sh = src.height;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  dst.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export async function captureDeliverable(
  canvas: HTMLCanvasElement,
  spec: Deliverable,
  opts: CaptureOpts = {},
): Promise<CaptureResult> {
  if (!CanvasRecorder.isSupported()) {
    throw new Error("This browser can't record video — try Chrome, Edge or Safari");
  }

  const seconds = clampDuration(spec, opts.seconds ?? spec.defaultSec);

  const stage = document.createElement("canvas");
  stage.width = spec.width;
  stage.height = spec.height;
  const ctx = stage.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Couldn't create the export surface");

  // Draw the first frame before recording starts so the encoder never sees an
  // empty surface — a black opening frame is the difference between a clean
  // loop and a visible blink at the seam.
  drawCover(canvas, ctx, spec.width, spec.height);

  const rec = new CanvasRecorder();
  rec.start(stage, spec.fps, { preferMp4: spec.accepts[0] === "video/mp4" });

  const started = performance.now();
  let raf = 0;
  await new Promise<void>((resolve) => {
    const pump = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (opts.signal?.aborted || elapsed >= seconds) {
        resolve();
        return;
      }
      drawCover(canvas, ctx, spec.width, spec.height);
      opts.onProgress?.(Math.min(1, elapsed / seconds));
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);
  });
  cancelAnimationFrame(raf);

  const blob = await rec.stop();
  const actualSeconds = (performance.now() - started) / 1000;

  const issues = validate(spec, {
    mimeType: blob.type || "video/webm",
    seconds: actualSeconds,
    width: spec.width,
    height: spec.height,
    bytes: blob.size,
  });

  return {
    blob,
    filename: deliverableFilename(spec, blob.type || "video/webm"),
    mimeType: blob.type || "video/webm",
    seconds: actualSeconds,
    width: spec.width,
    height: spec.height,
    issues,
    ok: isDeliverable(issues),
  };
}
