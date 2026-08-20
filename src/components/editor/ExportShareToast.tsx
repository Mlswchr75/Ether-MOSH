import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { shareApp, shareBlob } from "@/lib/share";

/**
 * The success toast every export (still/screenshot/GIF/recording) shows.
 * Stays out of the way — same size and tone as a normal sonner toast — but
 * carries its own share icon so exporting isn't a dead end: one tap opens
 * two obvious ways to put the result (or the app itself) in front of someone
 * else, right from the confirmation that it worked.
 */
function ExportShareToast({
  message, description, blob, filename,
}: {
  message: string;
  description?: string;
  blob: Blob;
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative flex min-w-[260px] max-w-[340px] items-start gap-2 rounded-md border border-white/10 bg-black/90 px-3 py-2.5 pr-9 shadow-lg backdrop-blur-md"
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/90">{message}</div>
        {description && <div className="mt-0.5 font-mono text-[10px] text-white/50">{description}</div>}
      </div>

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Share this creation"
        aria-expanded={open || undefined}
        title="Share"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-sm text-white/50 transition hover:text-[hsl(var(--accent))]"
      >
        <Share2 className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>

      {open && (
        <div className="panel-in-3d absolute right-2 top-9 z-10 w-44 rounded-sm border border-white/10 bg-black/95 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              const shared = await shareBlob(blob, filename, {
                title: "MOSH",
                text: "made with MOSH — brutalist webgl visualizer",
              });
              if (!shared) await shareApp();
            }}
            className="w-full rounded-sm px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-white/80 hover:bg-white/5 hover:text-[hsl(var(--accent))]"
          >
            Share this →
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); shareApp(); }}
            className="w-full rounded-sm px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-white/80 hover:bg-white/5 hover:text-[hsl(var(--accent))]"
          >
            Invite a friend →
          </button>
        </div>
      )}
    </div>
  );
}

/** Drop-in replacement for `toast.success(...)` on any export success path. */
export function showExportSuccessToast(opts: {
  message: string;
  description?: string;
  blob: Blob;
  filename: string;
  duration?: number;
  id?: string | number;
}) {
  toast.custom(
    () => (
      <ExportShareToast
        message={opts.message}
        description={opts.description}
        blob={opts.blob}
        filename={opts.filename}
      />
    ),
    { duration: opts.duration ?? 6000, id: opts.id },
  );
}
