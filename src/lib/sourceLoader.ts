import { toast } from "sonner";
import { useStore } from "@/store/useStore";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/avif"]);

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_TYPES.has(file.type);
}

export async function loadImageFile(file: File): Promise<boolean> {
  if (!isImageFile(file)) {
    toast.error("That file isn't an image");
    return false;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = url;
    });
    if (img.decode) {
      await img.decode().catch(() => undefined);
    }
    useStore.getState().setImage(url, img);
    useStore.getState().setSourceName(file.name || "pasted image");
    return true;
  } catch (error) {
    URL.revokeObjectURL(url);
    toast.error("Couldn't load that image", {
      description: error instanceof Error ? error.message : "Try a different image file.",
    });
    return false;
  }
}

export async function loadImageFromClipboard(event: ClipboardEvent): Promise<boolean> {
  const items = event.clipboardData?.items;
  if (!items) return false;

  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      return loadImageFile(file);
    }
  }
  return false;
}
