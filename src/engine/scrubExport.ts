/**
 * Print-resolution export of a single scrubbed frame.
 *
 * WHY THIS RE-RENDERS INSTEAD OF UPSCALING
 *
 * The obvious implementation is to grab the on-screen canvas and resample it up
 * to 3000px, which is what `printExport.ts` does for the live view and is the
 * right call there — the frame on screen is the only frame that exists. Here it
 * is the wrong call, because the scrub take carries the *inputs*, so the frame
 * can be produced again from scratch at whatever size is asked for. Effects are
 * resolution-dependent — displacement distances, grain, block sizes and blur
 * radii are all in pixels — so a stack re-rendered at 3000px has detail that
 * was never in the 1080px version and cannot be interpolated back into it.
 *
 * A second renderer is built for this rather than resizing the live one. The
 * live context is driving the screen at 60fps, and resizing it to 5000x3000
 * mid-session would stall the visible canvas and force every render target to
 * reallocate — on a phone, often into a context loss.
 */

import { MoshRenderer } from "./Renderer";
import { blobWithDpi } from "./pngDpi";
import { exportSize, type ScrubTakeFrame } from "./scrubCapture";

export type ScrubExportResult = {
  blob: Blob;
  width: number;
  height: number;
  dpi: number;
};

export type ScrubExportOpts = {
  /** Both edges land at or above this. */
  minEdge?: number;
  dpi?: number;
  /** Mirror the source, matching a front-facing camera preview. */
  mirror?: boolean;
  /** Tiled sampling, for Forge's seamless output. */
  tileable?: boolean;
  /** Grade strength, mirroring what the live finisher was applying. */
  hdr?: number;
};

/**
 * Render one scrub frame at print size and hand back a stamped PNG.
 *
 * Throws only if the frame has no source or WebGL is unavailable; everything
 * else is cleaned up on the way out, including on failure — a leaked WebGL
 * context is permanent for the life of the tab, and browsers allow very few.
 */
export async function exportScrubFrame(
  frame: ScrubTakeFrame,
  opts: ScrubExportOpts = {},
): Promise<ScrubExportResult> {
  const source = frame.source;
  if (!source) throw new Error("That moment has no captured frame to export");

  const dpi = opts.dpi ?? 300;
  const { width, height } = exportSize(source.width, source.height, opts.minEdge ?? 3000);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  let renderer: MoshRenderer | null = null;
  try {
    renderer = new MoshRenderer(canvas);

    // The source goes through a canvas because the renderer takes elements, not
    // bitmaps. Kept at the bitmap's own size: scaling it here would throw away
    // detail before the effects ever see it, which is the whole thing this
    // function exists to avoid.
    const src = document.createElement("canvas");
    src.width = source.width;
    src.height = source.height;
    const sctx = src.getContext("2d");
    if (!sctx) throw new Error("Export canvas unavailable");
    sctx.drawImage(source, 0, 0);

    renderer.setSourceCanvas(src);
    renderer.setSourceMirror(!!opts.mirror);
    renderer.setTileableSampling(!!opts.tileable);
    // Full scale, no adaptive downscaling: this is a still, so there is no
    // frame budget to protect and every pixel asked for should be drawn.
    renderer.setRenderScale(1);
    renderer.resize(width, height);
    const hdr = opts.hdr ?? 0;
    renderer.setHdrIntensity(hdr);
    renderer.setHdr(hdr);

    // Pin the clock so the frame comes back as it was, not as it would be now.
    renderer.setTimeOverride(frame.t);

    /* Rendered twice on purpose. The first pass through a fresh context can
       land while shaders are still linking, and several effects read the
       previous frame's target — both leave the first frame short of what the
       stack actually produces. */
    renderer.render(frame.layers, frame.pulse);
    renderer.render(frame.layers, frame.pulse);

    const encoded = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error("Export encoding failed")),
        "image/png",
      );
    });

    // canvas.toBlob writes no resolution metadata at all, so without this the
    // file opens at whatever the receiving app assumes — usually 72.
    const blob = await blobWithDpi(encoded, dpi);
    return { blob, width, height, dpi };
  } finally {
    renderer?.dispose();
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Filename that states what the file actually is, for a print shop reading it. */
export function scrubExportFilename(
  offset: number,
  width: number,
  height: number,
  dpi: number,
): string {
  const sign = offset < 0 ? "-" : "+";
  const secs = Math.abs(offset).toFixed(2);
  return `ether-mosh_scrub${sign}${secs}s_${width}x${height}_${dpi}dpi.png`;
}
