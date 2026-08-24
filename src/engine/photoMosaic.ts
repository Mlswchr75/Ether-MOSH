/**
 * Photo Mosaic — a lightweight Forge source treatment. The uploaded image
 * stays local: it is re-framed many times into a stable, crop-varied field
 * before MOSH's normal renderer touches it.
 */

export type MosaicGrid = { columns: number; rows: number; cellWidth: number; cellHeight: number };

function clamp01(value: number) { return Math.max(0, Math.min(1, value)); }

/** Map the friendly 0..1 density control to a bounded screen-aware grid. */
export function mosaicGridFor(w: number, h: number, density: number): MosaicGrid {
  const shortTiles = 3 + Math.round(clamp01(density) * 15);
  const shortSide = Math.max(1, Math.min(w, h));
  const columns = Math.max(2, Math.min(32, Math.round(shortTiles * w / shortSide)));
  const rows = Math.max(2, Math.min(32, Math.round(shortTiles * h / shortSide)));
  return { columns, rows, cellWidth: w / columns, cellHeight: h / rows };
}

function hash(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Paint the same source image into every cell with stable, varied crops. */
export function drawPhotoMosaic(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  w: number,
  h: number,
  density: number,
  seed: number,
) {
  const grid = mosaicGridFor(w, h, density);
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const x = col * grid.cellWidth;
      const y = row * grid.cellHeight;
      const key = seed + row * 131 + col * 719;
      const scale = Math.max(grid.cellWidth / imageWidth, grid.cellHeight / imageHeight) * (1.02 + hash(key) * 0.42);
      const dw = imageWidth * scale;
      const dh = imageHeight * scale;
      const dx = x + (grid.cellWidth - dw) * hash(key + 1);
      const dy = y + (grid.cellHeight - dh) * hash(key + 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, grid.cellWidth + 0.5, grid.cellHeight + 0.5);
      ctx.clip();
      ctx.drawImage(image, dx, dy, dw, dh);
      ctx.restore();
    }
  }
}
