import { toast } from "sonner";
import type { StickerClip } from "@/store/moshStickerStore";
import { MAX_CLIP_SECONDS } from "@/store/moshStickerStore";

function isGifFile(file: File): boolean {
  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

async function loadVideoClip(file: File): Promise<StickerClip> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Video decode failed"));
    video.src = url;
  });

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const trimEnd = Math.min(duration || MAX_CLIP_SECONDS, MAX_CLIP_SECONDS);

  try { await video.play(); } catch { /* autoplay can fail silently pre-gesture; loop still primed */ }

  return {
    kind: "video",
    el: video,
    objectUrl: url,
    naturalW: video.videoWidth || 1,
    naturalH: video.videoHeight || 1,
    duration,
    trimStart: 0,
    trimEnd,
  };
}

async function loadGifClip(file: File): Promise<StickerClip> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("GIF decode failed"));
    img.src = url;
  });
  if (img.decode) await img.decode().catch(() => undefined);

  return {
    kind: "gif",
    el: img,
    objectUrl: url,
    naturalW: img.naturalWidth || 1,
    naturalH: img.naturalHeight || 1,
    duration: 0,
    trimStart: 0,
    trimEnd: 0,
  };
}

/** Loads an uploaded video or GIF file into a StickerClip. Videos longer than
 *  MAX_CLIP_SECONDS come back with trimStart/trimEnd set to the first 7s —
 *  the caller decides whether that needs user confirmation via TrimScrubber. */
export async function loadClipFile(file: File): Promise<StickerClip | null> {
  try {
    if (isGifFile(file)) return await loadGifClip(file);
    if (isVideoFile(file)) return await loadVideoClip(file);
    toast.error("That file isn't a video or GIF");
    return null;
  } catch (error) {
    toast.error("Couldn't load that clip", {
      description: error instanceof Error ? error.message : "Try a different file.",
    });
    return null;
  }
}

/** Wraps a captured camera Blob into a StickerClip, same shape as an upload. */
export async function clipFromBlob(blob: Blob): Promise<StickerClip> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Recorded clip decode failed"));
    video.src = url;
  });
  try { await video.play(); } catch { /* noop */ }

  const duration = Number.isFinite(video.duration) ? video.duration : MAX_CLIP_SECONDS;
  return {
    kind: "video",
    el: video,
    objectUrl: url,
    naturalW: video.videoWidth || 1,
    naturalH: video.videoHeight || 1,
    duration,
    trimStart: 0,
    trimEnd: Math.min(duration, MAX_CLIP_SECONDS),
  };
}

export type RecorderState = "idle" | "recording";

/**
 * Records a raw camera MediaStream (not canvas output) into a short clip Blob.
 * Sibling of engine/recorder.ts's CanvasRecorder — same mimeType/bitrate/chunking
 * logic, but built straight from a MediaStream since there's no canvas to
 * captureStream() from when capturing an *input* clip rather than exporting output.
 */
export class ClipRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  state: RecorderState = "idle";

  static isSupported(): boolean {
    return typeof MediaRecorder !== "undefined";
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

  start(stream: MediaStream) {
    if (this.state === "recording") return;
    if (!ClipRecorder.isSupported()) throw new Error("Recording not supported in this browser");

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
}
