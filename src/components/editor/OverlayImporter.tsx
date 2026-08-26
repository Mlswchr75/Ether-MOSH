import { useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { importOverlayFile, OverlayImportError } from "@/engine/overlay/importOverlay";
import { useOverlayStore } from "@/store/useOverlayStore";

const ACCEPT = ".png,.webp,.gif,.svg,.json,.lottie,image/png,image/webp,image/gif,image/svg+xml,application/json,application/zip";

export function OverlayImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addAsset = useOverlayStore(s => s.addAsset);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        addAsset(await importOverlayFile(file));
      } catch (error) {
        const message = error instanceof OverlayImportError
          ? error.message
          : `Couldn't import ${file.name}.`;
        toast.error(message);
      }
    }
  }, [addAsset]);

  return (
    <div
      className="pointer-events-auto"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
      }}
      onPaste={event => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) void importFiles(files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPT}
        multiple
        onChange={event => {
          if (event.currentTarget.files) void importFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/75 backdrop-blur-md transition hover:border-white/30 hover:text-white active:scale-95"
        title="Add PNG, WebP, GIF, SVG or Lottie"
      >
        <Plus size={12} />
        Add sticker
      </button>
    </div>
  );
}
