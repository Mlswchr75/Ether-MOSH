import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Minus } from "lucide-react";

/**
 * Minimize — one behaviour for every menu in the instrument.
 *
 * MOSH's whole point is the picture, and every panel, popup and wheel menu is
 * something sitting on top of it. Closing them is already possible everywhere;
 * what was missing is the middle state — get this out of my way *without*
 * making me find it again. That is a different intent from "close", and it is
 * the one you want mid-performance, when re-opening a menu costs you the exact
 * moment you were reaching for.
 *
 * Deliberately one shared hook and one shared button rather than a collapse
 * implemented fifteen times: fifteen implementations become fifteen slightly
 * different behaviours, and the one thing a control surface cannot afford is
 * for the same affordance to mean different things in different corners.
 *
 * State is persisted per key. A minimized panel that reappears on every reload
 * has not really been minimized — the point is that the rig remembers how you
 * like it set up.
 */

const STORAGE_PREFIX = "mosh_minimized_";

function read(key: string): boolean {
  try { return localStorage.getItem(STORAGE_PREFIX + key) === "1"; } catch { return false; }
}

function write(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(STORAGE_PREFIX + key, "1");
    else localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Private browsing can deny storage; the in-memory state still works.
  }
}

/**
 * Remembered collapse state for one panel.
 *
 * `persist: false` for transient popups — a menu anchored to a trigger you
 * just tapped should open ready to use, not still folded from last week.
 */
export function useMinimized(key: string, options: { persist?: boolean } = {}) {
  const persist = options.persist !== false;
  const [minimized, setMinimized] = useState(() => (persist ? read(key) : false));

  useEffect(() => {
    if (persist) write(key, minimized);
  }, [key, minimized, persist]);

  const toggle = useCallback(() => setMinimized(v => !v), []);
  const restore = useCallback(() => setMinimized(false), []);
  return { minimized, setMinimized, toggle, restore };
}

/**
 * The affordance itself.
 *
 * `variant="chevron"` for panels that collapse in place under their own
 * header; `variant="minus"` for floating popups, where a minus reads as
 * "shrink this" and a chevron would be mistaken for a disclosure arrow on the
 * content underneath.
 */
export function MinimizeButton({
  minimized,
  onToggle,
  label,
  variant = "chevron",
  className = "",
}: {
  minimized: boolean;
  onToggle: () => void;
  /** What is being minimized, for the tooltip and screen readers. */
  label: string;
  variant?: "chevron" | "minus";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-expanded={!minimized}
      aria-label={minimized ? `Expand ${label}` : `Minimize ${label}`}
      title={minimized ? `Expand ${label}` : `Minimize ${label}`}
      data-minimize
      className={`mosh-minimize ${minimized ? "is-minimized" : ""} ${className}`}
    >
      {variant === "minus" && !minimized
        ? <Minus className="h-3 w-3" strokeWidth={2.5} />
        : <ChevronDown className="h-3 w-3" strokeWidth={2.5} />}
    </button>
  );
}
