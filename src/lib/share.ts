import { markUiActive } from "@/hooks/useIdleFade";
import { openShareSheet } from "@/components/ShareSheet";

const APP_TITLE = "MOSH";
const APP_TAGLINE = "brutalist webgl visualizer — mosh your camera & sound in real time";

function canShareData(data?: ShareData): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (data && (navigator as any).canShare && !(navigator as any).canShare(data)) return false;
  return true;
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
  try {
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
  } finally {
    // Whichever path this took — a completed/cancelled/failed native share
    // sheet, or a plain download click — the user is definitely back and
    // present the moment this resolves. See markUiActive's doc comment:
    // the share sheet doesn't reliably fire focus/visibilitychange on every
    // platform, so this is the one place that's guaranteed to run.
    markUiActive();
  }
}

/**
 * Share a URL: the device's own sheet where that exists, the app's share panel
 * where it doesn't.
 *
 * The fallback used to be a clipboard copy and a toast saying so. That is every
 * desktop Firefox, every desktop Chrome on Linux and Windows, and any browser
 * that declines — on all of them "share" meant "a link is on your clipboard,
 * work out the rest yourself", which is not sharing, it is refusing to.
 */
export async function shareUrl(
  url: string,
  title = APP_TITLE,
  text = "Real-time audio-reactive visual instrument — try it free",
): Promise<ShareResult> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title, text });
        return "shared";
      } catch (err: unknown) {
        // A deliberate cancel is an answer — reopening as a panel would argue
        // with someone who just said no.
        if ((err as { name?: string })?.name === "AbortError") return "cancelled";
      }
    }
    openShareSheet({ url, title, text });
    return "shared";
  } finally {
    markUiActive();
  }
}

/** Share the app URL. Same two-tier behaviour as `shareUrl`. */
export async function shareApp(url: string = typeof window !== "undefined" ? window.location.origin : ""): Promise<void> {
  try {
    const data: ShareData = { title: APP_TITLE, text: APP_TAGLINE, url };
    if (canShareData(data)) {
      try {
        await navigator.share(data);
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    openShareSheet({ url, title: APP_TITLE, text: APP_TAGLINE });
  } finally {
    markUiActive();
  }
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
  } finally {
    markUiActive();
  }
  return false;
}
