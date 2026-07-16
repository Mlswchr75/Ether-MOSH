/** PNG still + WebM clip export straight off the render canvas. */

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportPNG(canvas: HTMLCanvasElement, name = "mosh"): Promise<boolean> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;
  download(blob, `${name}-${Date.now().toString(36)}.png`);
  return true;
}

export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  get recording() { return this.recorder?.state === "recording"; }

  start(canvas: HTMLCanvasElement) {
    const stream = canvas.captureStream(30);
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find(m => MediaRecorder.isTypeSupported(m)) ?? "";
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(250);
  }

  stop(name = "mosh"): Promise<boolean> {
    return new Promise((resolve) => {
      const rec = this.recorder;
      if (!rec || rec.state === "inactive") return resolve(false);
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || "video/webm" });
        this.chunks = [];
        if (!blob.size) return resolve(false);
        download(blob, `${name}-${Date.now().toString(36)}.webm`);
        resolve(true);
      };
      rec.stop();
      rec.stream.getTracks().forEach(t => t.stop());
      this.recorder = null;
    });
  }
}
