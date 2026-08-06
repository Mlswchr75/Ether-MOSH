/** Canvas video recorder using MediaRecorder + canvas.captureStream(). */

export type RecorderState = "idle" | "recording";

export class CanvasRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
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

  start(canvas: HTMLCanvasElement, fps = 30, opts: { preferMp4?: boolean } = {}) {
    if (this.state === "recording") return;
    if (!CanvasRecorder.isSupported()) throw new Error("Recording not supported in this browser");

    const stream = canvas.captureStream(fps);
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
    const blob = await new Promise<Blob>((resolve) => {
      mr.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType }));
      mr.stop();
    });
    this.state = "idle";
    this.mediaRecorder = null;
    return blob;
  }

  extension(): string {
    return this.mimeType.includes("mp4") ? "mp4" : "webm";
  }
}
