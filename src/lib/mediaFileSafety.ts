// Lossless 8K print assets can be large even when completely legitimate.
export const MAX_IMAGE_FILE_BYTES = 80 * 1024 * 1024;
export const MAX_VIDEO_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_AUDIO_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_LOTTIE_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_DOTLOTTIE_BYTES = 15 * 1024 * 1024;
export const MAX_DECODED_IMAGE_PIXELS = 80 * 1024 * 1024;
export const MAX_MEDIA_DIMENSION = 16_384;

const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "ogv", "webm"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "wav", "webm"]);

function hasExtension(file: Pick<File, "name">, accepted: Set<string>): boolean {
  return accepted.has(file.name.split(".").pop()?.toLowerCase() ?? "");
}

function sizeIssue(file: Pick<File, "size">, maxBytes: number, label: string): string | null {
  if (file.size <= 0) return `${label} is empty.`;
  if (file.size > maxBytes) return `${label} is too large (${Math.floor(maxBytes / 1024 / 1024)} MB maximum).`;
  return null;
}

export function validateImageUpload(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!file.type.startsWith("image/") && !hasExtension(file, IMAGE_EXTENSIONS)) return "That file isn't an image.";
  return sizeIssue(file, MAX_IMAGE_FILE_BYTES, "Image");
}

export function validateVideoUpload(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!file.type.startsWith("video/") && !hasExtension(file, VIDEO_EXTENSIONS)) return "That file isn't a video.";
  return sizeIssue(file, MAX_VIDEO_FILE_BYTES, "Video");
}

export function validateAudioUpload(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!file.type.startsWith("audio/") && !hasExtension(file, AUDIO_EXTENSIONS)) return "That file isn't audio.";
  return sizeIssue(file, MAX_AUDIO_FILE_BYTES, "Audio");
}

export function validateDecodedDimensions(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return "Media dimensions are invalid.";
  }
  if (width > MAX_MEDIA_DIMENSION || height > MAX_MEDIA_DIMENSION || width * height > MAX_DECODED_IMAGE_PIXELS) {
    return "Media dimensions are too large to process safely.";
  }
  return null;
}

export function validateOverlaySize(file: Pick<File, "size">, kind: "lottie-json" | "dotlottie" | "image"): string | null {
  const max = kind === "lottie-json"
    ? MAX_LOTTIE_JSON_BYTES
    : kind === "dotlottie"
      ? MAX_DOTLOTTIE_BYTES
      : MAX_IMAGE_FILE_BYTES;
  return sizeIssue(file, max, "Sticker");
}
