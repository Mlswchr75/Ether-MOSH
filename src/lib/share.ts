import { toast } from "sonner";

const APP_TITLE = "MOSH";
const APP_TAGLINE = "brutalist webgl visualizer — mosh your camera & sound in real time";

function canShareData(data?: ShareData): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (data && (navigator as any).canShare && !(navigator as any).canShare(data)) return false;
  return true;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

export const canNativeShare = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.share === "function" &&
  typeof (navigator as any).canShare === "function";

/** Share a captured blob via the Web Share API. Falls back to direct download. */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  title = APP_TITLE,
  text = "Made with MOSH — real-time audio-reactive visual instrument",
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type });

  if (canNativeShare() && (navigator as any).canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text } as ShareData);
      return "shared";
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "AbortError") return "cancelled";
      // share failed — fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "downloaded";
}

/** Share a URL via Web Share API, falling back to clipboard copy. */
export async function shareUrl(
  url: string,
  title = APP_TITLE,
  text = "Real-time audio-reactive visual instrument — try it free",
): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title, text });
      return "shared";
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "AbortError") return "cancelled";
    }
  }
  const ok = await copyToClipboard(url);
  toast[ok ? "success" : "error"](ok ? "link copied to clipboard" : "share not supported", { position: "top-right" });
  return "downloaded";
}

/** Legacy: share the app URL. */
export async function shareApp(url: string = typeof window !== "undefined" ? window.location.origin : ""): Promise<void> {
  const data: ShareData = { title: APP_TITLE, text: APP_TAGLINE, url };
  if (canShareData(data)) {
    try {
      await navigator.share(data);
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    }
  }
  const ok = await copyToClipboard(url);
  toast[ok ? "success" : "error"](ok ? "link copied to clipboard" : "share not supported", { position: "top-right" });
}

/** Legacy: share a captured blob via Web Share API level 2. Returns true if shared. */
export async function shareBlob(blob: Blob, filename: string, opts?: { title?: string; text?: string; url?: string }): Promise<boolean> {
  try {
    const file = new File([blob], filename, { type: blob.type });
    const data: ShareData = {
      title: opts?.title ?? APP_TITLE,
      text: opts?.text ?? "made with MOSH",
      url: opts?.url ?? (typeof window !== "undefined" ? window.location.origin : undefined),
      files: [file],
    } as ShareData;
    if (canShareData(data)) {
      await navigator.share(data);
      return true;
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return true;
  }
  return false;
}
