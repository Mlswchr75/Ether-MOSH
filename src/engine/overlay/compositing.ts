import type { BlendMode } from "@/engine/blend";

export function overlayCssBlend(mode: BlendMode): React.CSSProperties["mixBlendMode"] {
  switch (mode) {
    case "hardLight": return "hard-light";
    case "additive": return "screen";
    default: return mode;
  }
}

/**
 * The current OverlayStage is physically mounted after GlCanvas, so it is an
 * AFTER-FX surface. These labels are still part of the entity contract now;
 * BEFORE/OWN are enabled only once their renderer bridges exist rather than
 * pretending a CSS overlay is equivalent to pre-compositor pixels.
 */
export const OVERLAY_COMPOSITING_LABELS = {
  "after-fx": "After FX",
  "before-fx": "Before FX",
  "own-fx": "Own FX",
} as const;
