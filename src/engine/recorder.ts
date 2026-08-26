/** Canvas video recorder using MediaRecorder + canvas.captureStream(). */

import { drawOverlayStageInto } from "./overlayCapture";

export type RecorderState = "idle" | "recording";

export class CanvasRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  private compositeRaf: number | null = null;
  private compositeCanvas: HTMLCanvasElement | null = null;
  private captureStream: MediaStream | null = null;
  state: RecorderState = "idle";

  static isSupported(): boolean {
    return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
  }

  /**
   * WebM first for general recording — better quality per bit and universally
   * supported by MediaRecorder.
   *
   * `preferMp4` flips the order for platform deliverables. Spotify Canvas
   * refuses WebM outright, so a technically-better file that gets rejected at
   * the upload form is the wrong trade. Not every browser can encode MP4, which
   * is why this is a preference rather than a guarantee — callers validate what
   * actually came back rather than assuming they got what they asked for.
   */
  private pickMime(preferMp4 = false): string {
    const webm = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const mp4 = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
    ];
    const candidates = preferMp4 ? [...mp4, ...webm] : [...webm, ...mp4];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return "video/webm";
  }

  /** What this browser would actually record for a given preference. */
  static resolveMime(preferMp4 = false): string {
    return new CanvasRecorder().pickMime(preferMp4);
  }

  private stopCompositeLoop() {
    if (this.compositeRaf !== null) cancelAnimationFrame(this.compositeRaf);
    this.compositeRaf = null;
    this.compositeCanvas = null;
  }

  private captureCanvasFor(source: HTMLCanvasElement): HTMLCanvasElement {
    // Only pay the extra canvas-copy cost while the Overlay scene is actually
    // mounted. That keeps ordinary camera/Forge recording on the original fast
    // path, while Sticker Mode records the exact layered visual the user sees.
    const stage = document.querySelector<HTMLElement>("[data-overlay-capture-stage]");
    if (!stage) return source;

    const composed = document.createElement("canvas");
    composed.width = Math.max(1, source.width);
    composed.height = Math.max(1, source.height);
    const ctx = composed.getContext("2d");
    if (!ctx) return source;
    this.compositeCanvas = composed;

    const paint = () => {
      if (!this.compositeCanvas) return;
      if (source.width <= 0 || source.height <= 0) {
        // Source was torn down mid-recording (context loss / effect switch).
        // Keep polling rather than drawing a stale/invalid frame — drawImage
        // on a zero-size source would otherwise fail silently in the catch
        // below and produce a black recording.
        this.compositeRaf = requestAnimationFrame(paint);
        return;
      }
      if (composed.width !== source.width || composed.height !== source.height) {
        composed.width = Math.max(1, source.width);
        composed.height = Math.max(1, source.height);
      }
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, composed.width, composed.height);
        ctx.drawImage(source, 0, 0, composed.width, composed.height);
        drawOverlayStageInto(ctx, composed.width, composed.height);
      } catch (error) {
        console.warn("[recorder] composite frame failed", error);
      }
      this.compositeRaf = requestAnimationFrame(paint);
    };
    paint();
    return composed;
  }

  /**
   * `audioStream` — an already-live MediaStream to pull audio tracks from
   * (e.g. a getDisplayMedia() capture of device/tab audio). canvas.captureStream()
   * is video-only; canvases have no audio of their own, so without this the
   * recording is always silent regardless of what's playing. Passing a
   * stream with no audio tracks is a harmless no-op — the recording is just
   * video, same as calling this without the option at all.
   */
  start(canvas: HTMLCanvasElement, fps = 30, opts: { preferMp4?: boolean; audioStream?: MediaStream | null } = {}) {
    if (this.state === "recording") return;
    if (!CanvasRecorder.isSupported()) throw new Error("Recording not supported in this browser");
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) throw new Error("Recording source is not ready yet");

    this.stopCompositeLoop();
    const captureCanvas = this.captureCanvasFor(canvas);
    const videoStream = captureCanvas.captureStream(Math.max(1, Math.min(60, fps)));
    this.captureStream = videoStream;
    const audioTracks = opts.audioStream?.getAudioTracks() ?? [];
    const stream = audioTracks.length > 0
      ? new MediaStream([...videoStream.getVideoTracks(), ...audioTracks])
      : videoStream;
    this.mimeType = this.pickMime(opts.preferMp4);
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 8_000_000,
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(250);
    this.state = "recording";
  }

  async stop(): Promise<Blob> {
    if (!this.mediaRecorder || this.state !== "recording") {
      throw new Error("Not recording");
    }
    const mr = this.mediaRecorder;
    const blob = await new Promise<Blob>((resolve, reject) => {
      mr.onerror = () => reject(new Error("Recording failed"));
      mr.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType }));
      mr.stop();
    });
    this.stopCompositeLoop();
    // canvas.captureStream() keeps its video track live until explicitly
    // stopped — without this, every recorded clip leaves a live capture
    // track running for the rest of the session.
    this.captureStream?.getTracks().forEach((t) => t.stop());
    this.captureStream = null;
    this.state = "idle";
    this.mediaRecorder = null;
    if (blob.size <= 0) throw new Error("Recording produced an empty file");
    return blob;
  }

  extension(): string {
    return this.mimeType.includes("mp4") ? "mp4" : "webm";
  }
}
