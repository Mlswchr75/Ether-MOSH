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

  private pickMime(): string {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return "video/webm";
  }

  start(canvas: HTMLCanvasElement, fps = 30) {
    if (this.state === "recording") return;
    if (!CanvasRecorder.isSupported()) throw new Error("Recording not supported in this browser");

    const stream = canvas.captureStream(fps);
    this.mimeType = this.pickMime();
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
