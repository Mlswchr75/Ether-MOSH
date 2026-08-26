export type CaptureRect = { x: number; y: number; width: number; height: number };

export function shouldCaptureOverlayElement(element: Element): element is HTMLCanvasElement | HTMLImageElement {
  return element instanceof HTMLCanvasElement || element instanceof HTMLImageElement;
}

export function clampCaptureRect(rect: CaptureRect, width: number, height: number): CaptureRect | null {
  const x1 = Math.max(0, rect.x);
  const y1 = Math.max(0, rect.y);
  const x2 = Math.min(width, rect.x + rect.width);
  const y2 = Math.min(height, rect.y + rect.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

const CANVAS_BLEND = new Set<GlobalCompositeOperation>([
  "source-over", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
  "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue",
  "saturation", "color", "luminosity", "lighter",
]);

export function compositeOperationForBlend(value: string): GlobalCompositeOperation {
  if (!value || value === "normal") return "source-over";
  if (value === "plus-lighter") return "lighter";
  return CANVAS_BLEND.has(value as GlobalCompositeOperation) ? value as GlobalCompositeOperation : "source-over";
}

function cumulativeOpacity(element: Element, stop: Element): number {
  let opacity = 1;
  let current: Element | null = element;
  while (current && current !== stop) {
    const computed = getComputedStyle(current);
    if (computed.display === "none" || computed.visibility === "hidden") return 0;
    const own = Number.parseFloat(computed.opacity || "1");
    if (Number.isFinite(own)) opacity *= own;
    current = current.parentElement;
  }
  return Math.max(0, Math.min(1, opacity));
}

type QuadPoint = { x: number; y: number };
type Quad = { p1: QuadPoint; p2: QuadPoint; p4: QuadPoint };

function transformedQuad(element: Element): Quad | null {
  try {
    const quads = (element as any).getBoxQuads?.();
    const quad = quads?.[0];
    if (quad?.p1 && quad?.p2 && quad?.p4) return quad as Quad;
  } catch { /* browser does not expose box quads */ }
  return null;
}

/**
 * Paint visible OverlayStage media onto an export context. Editor controls are
 * excluded because only direct entity roots (`.group.select-none`) are walked.
 * Box quads preserve rotation/scale when the browser exposes them; older Safari
 * falls back to the element's transformed bounding box rather than dropping the
 * overlay from the export entirely.
 */
export function drawOverlayStageInto(
  ctx: CanvasRenderingContext2D,
  outWidth: number,
  outHeight: number,
): void {
  const stage = document.querySelector<HTMLElement>("[data-overlay-capture-stage]");
  if (!stage || outWidth <= 0 || outHeight <= 0) return;
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) return;
  const sx = outWidth / stageRect.width;
  const sy = outHeight / stageRect.height;

  const roots = stage.querySelectorAll<HTMLElement>(":scope > .group.select-none");
  for (const root of roots) {
    const rootStyle = getComputedStyle(root);
    if (rootStyle.display === "none" || rootStyle.visibility === "hidden") continue;
    const blend = compositeOperationForBlend(rootStyle.mixBlendMode);
    const media = root.querySelectorAll("canvas, img");

    for (const node of media) {
      if (!shouldCaptureOverlayElement(node)) continue;
      const opacity = cumulativeOpacity(node, stage);
      if (opacity <= 0) continue;
      if (node instanceof HTMLImageElement && (!node.complete || node.naturalWidth <= 0)) continue;
      if (node instanceof HTMLCanvasElement && (node.width <= 0 || node.height <= 0)) continue;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = blend;
      try {
        const quad = transformedQuad(node);
        const sourceW = node instanceof HTMLCanvasElement ? node.width : node.naturalWidth;
        const sourceH = node instanceof HTMLCanvasElement ? node.height : node.naturalHeight;
        if (quad && sourceW > 0 && sourceH > 0) {
          const p1x = (quad.p1.x - stageRect.left) * sx;
          const p1y = (quad.p1.y - stageRect.top) * sy;
          const p2x = (quad.p2.x - stageRect.left) * sx;
          const p2y = (quad.p2.y - stageRect.top) * sy;
          const p4x = (quad.p4.x - stageRect.left) * sx;
          const p4y = (quad.p4.y - stageRect.top) * sy;
          ctx.setTransform(
            (p2x - p1x) / sourceW,
            (p2y - p1y) / sourceW,
            (p4x - p1x) / sourceH,
            (p4y - p1y) / sourceH,
            p1x,
            p1y,
          );
          ctx.drawImage(node, 0, 0, sourceW, sourceH);
        } else {
          const rect = node.getBoundingClientRect();
          const target = clampCaptureRect({
            x: (rect.left - stageRect.left) * sx,
            y: (rect.top - stageRect.top) * sy,
            width: rect.width * sx,
            height: rect.height * sy,
          }, outWidth, outHeight);
          if (target) ctx.drawImage(node, target.x, target.y, target.width, target.height);
        }
      } catch {
        // A not-yet-decoded or tainted overlay should never destroy the base GIF.
      } finally {
        ctx.restore();
      }
    }
  }
}
