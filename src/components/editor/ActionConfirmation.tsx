import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";

type Props = {
  title: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Milliseconds before auto-confirming. null = no auto-confirm. */
  autoConfirmMs?: number | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Quick confirmation bubble for actions like screenshot, GIF, record.
 * A zero-delay action is intentionally invisible and confirms on the next
 * microtask; rendering a modal for a 0ms confirmation creates an unnecessary
 * pointer/focus handoff between a timing choice and the capture it requested.
 */
export function ActionConfirmation({
  title,
  subtitle,
  autoConfirmMs = 0,
  onConfirm,
  onCancel,
}: Props) {
  const timerRef = useRef<number | null>(null);
  const confirmRef = useRef(onConfirm);
  const firedRef = useRef(false);
  confirmRef.current = onConfirm;

  useEffect(() => {
    if (autoConfirmMs === null || firedRef.current) return;
    if (autoConfirmMs <= 0) {
      firedRef.current = true;
      queueMicrotask(() => confirmRef.current());
      return;
    }
    timerRef.current = window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      confirmRef.current();
    }, autoConfirmMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [autoConfirmMs]);

  const handleConfirm = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    onConfirm();
  };

  const handleCancel = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    onCancel();
  };

  if (autoConfirmMs !== null && autoConfirmMs <= 0) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in">
      <div className="animate-in scale-in zoom-in-95 duration-200 flex flex-col gap-3 rounded-md border border-[hsl(var(--border-default))] bg-[hsl(var(--bg-panel))] px-6 py-4 shadow-lg">
        <div>
          <p className="font-mono text-sm font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-body))]">
            {title}
          </p>
          {subtitle && <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{subtitle}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleCancel} className="flex items-center gap-1.5 rounded-sm border border-[hsl(var(--border-default))] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-[hsl(var(--text-muted))] transition hover:bg-red-900/20 hover:text-red-400 hover:border-red-500/30">
            <X className="h-3 w-3" /> no
          </button>
          <button type="button" onClick={handleConfirm} className="flex items-center gap-1.5 rounded-sm bg-[hsl(var(--mag))] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-black transition hover:bg-[hsl(var(--mag))] hover:brightness-110">
            <Check className="h-3 w-3" /> yes
          </button>
        </div>
      </div>
    </div>
  );
}
