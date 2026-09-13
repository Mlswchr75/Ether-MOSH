export type FxBackdrop = 'black' | 'white';

/** Key the final rendered stack, without segmentation, recropping or hole filling.
 * Existing alpha survives. Unmatting preserves soft light trails over either backdrop.
 */
export function keyFxStack(frame: ImageData, background: FxBackdrop, cutoff: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const gate = Math.max(0, Math.min(.95, cutoff));
  for (let i = 0; i < out.data.length; i += 4) {
    const d = out.data;
    const signal = background === 'black'
      ? Math.max(d[i], d[i + 1], d[i + 2]) / 255
      : 1 - Math.min(d[i], d[i + 1], d[i + 2]) / 255;
    const alpha = Math.max(0, Math.min(1, (signal - gate) / Math.max(.001, 1 - gate)));
    d[i + 3] = Math.round(d[i + 3] * alpha);
    for (let c = 0; c < 3; c++) {
      d[i + c] = alpha === 0 ? 0 : background === 'black'
        ? Math.min(255, d[i + c] / alpha)
        : Math.max(0, 255 - (255 - d[i + c]) / alpha);
    }
  }
  return out;
}

export function renderFxStack(source: HTMLCanvasElement, width: number, height: number, key: FxBackdrop, cutoff: number): ImageData {
  if (source.width < 1 || source.height < 1) throw new Error('Visualizer is resizing; retry capture');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  return keyFxStack(ctx.getImageData(0, 0, width, height), key, cutoff);
}

export function paintFxFrame(ctx: CanvasRenderingContext2D, frame: ImageData, background?: FxBackdrop) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width; canvas.height = frame.height;
  canvas.getContext('2d')!.putImageData(frame, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
  ctx.drawImage(canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
}
