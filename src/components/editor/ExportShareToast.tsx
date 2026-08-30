import { toast } from "sonner";

/** Drop-in replacement for `toast.success(...)` on any export success path. */
export function showExportSuccessToast(opts: {
  message: string;
  description?: string;
  blob: Blob;
  filename: string;
  duration?: number;
  id?: string | number;
}) {
  toast.success(opts.message, { description: opts.description, duration: Math.min(opts.duration ?? 2200, 3000), id: opts.id });
}
