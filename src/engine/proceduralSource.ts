/**
 * Procedural ambient source — animated radial gradients on a Canvas2D buffer.
 * Used as the source texture when no image/video/camera is loaded so the
 * editor never shows an empty state. Slow movement, ~30fps.
 */
export class ProceduralSource {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private lastDraw = 0;
  private startedAt = performance.now();
  private running = false;

  constructor(size = 1024) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = size;
    this.canvas.height = size;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas2D unavailable");
    this.ctx = ctx;
    // Paint an initial frame so the first read returns something nice.
    this.draw(0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = (t: number) => {
      if (!this.running) return;
      // ~30fps
      if (t - this.lastDraw >= 33) {
        this.draw((t - this.startedAt) / 1000);
        this.lastDraw = t;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private draw(t: number) {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Base
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "#0a080e";
    c.fillRect(0, 0, w, h);

    // Additive blobs
    c.globalCompositeOperation = "lighter";
    const blobs = [
      { color: "rgba(255, 45, 146, 0.55)", sx: 0.13, sy: 0.09, fx: 0.20, fy: 0.50 },
      { color: "rgba(0, 229, 255, 0.42)",  sx: 0.10, sy: 0.14, fx: 0.55, fy: 0.10 },
      { color: "rgba(107, 45, 159, 0.55)", sx: 0.08, sy: 0.16, fx: 0.85, fy: 0.65 },
      { color: "rgba(255, 100, 200, 0.32)",sx: 0.17, sy: 0.07, fx: 0.40, fy: 0.85 },
    ];
    const TWO_PI = Math.PI * 2;
    for (const b of blobs) {
      const x = (0.5 + 0.34 * Math.sin(t * b.sx + b.fx * TWO_PI)) * w;
      const y = (0.5 + 0.34 * Math.cos(t * b.sy + b.fy * TWO_PI)) * h;
      const r = (0.42 + 0.10 * Math.sin(t * 0.07 + b.fx * 3.14)) * w;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, b.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }

    // Subtle film grain / noise tint
    c.globalCompositeOperation = "overlay";
    c.fillStyle = "rgba(255,255,255,0.02)";
    c.fillRect(0, 0, w, h);
  }

  dispose() {
    this.stop();
  }
}
