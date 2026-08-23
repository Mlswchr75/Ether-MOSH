import { DotLottie } from "@lottiefiles/dotlottie-web";
import type { OverlayEntity } from "./types";

export function selectBeforeFxEntities(entities: OverlayEntity[]): OverlayEntity[] {
  return entities.filter(entity => entity.compositing === "before-fx" && !entity.hidden);
}

type LottieEntry = { canvas: HTMLCanvasElement; player: DotLottie };

/**
 * Canvas2D source compositor used only when at least one overlay is routed
 * BEFORE FX. The resulting canvas becomes the main MoshRenderer source, so the
 * ordinary global WebGL stack processes the source and stickers together.
 */
export class BeforeFxCompositor {
  readonly canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { alpha: false });
  private images = new Map<string, HTMLImageElement>();
  private lotties = new Map<string, LottieEntry>();

  resize(width: number, height: number) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  render(base: CanvasImageSource | null, entities: OverlayEntity[]) {
    const ctx = this.ctx;
    if (!ctx || !base || this.canvas.width < 1 || this.canvas.height < 1) return;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    try { ctx.drawImage(base, 0, 0, w, h); } catch { ctx.restore(); return; }

    for (const entity of selectBeforeFxEntities(entities)) {
      const source = this.sourceFor(entity);
      if (!source) continue;
      const naturalW = entity.asset.width || 220;
      const naturalH = entity.asset.height || 220;
      const scale = Math.max(0.02, entity.transform.scale);
      const drawW = Math.min(w * 1.5, naturalW * scale);
      const drawH = Math.min(h * 1.5, naturalH * scale);
      const x = entity.transform.x * w;
      const y = entity.transform.y * h;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(entity.transform.rotation * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, Math.min(1, entity.transform.opacity));
      ctx.globalCompositeOperation = canvasBlend(entity.blend);
      try { ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH); } catch { /* asset not decoded yet */ }
      ctx.restore();
    }
    ctx.restore();
  }

  dispose() {
    for (const { player } of this.lotties.values()) {
      try { player.destroy(); } catch { /* noop */ }
    }
    this.lotties.clear();
    this.images.clear();
  }

  private sourceFor(entity: OverlayEntity): CanvasImageSource | null {
    if (entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie") {
      let entry = this.lotties.get(entity.asset.id);
      if (!entry) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(64, Math.min(512, entity.asset.width || 256));
        canvas.height = Math.max(64, Math.min(512, entity.asset.height || 256));
        const player = new DotLottie({ canvas, src: entity.asset.url, autoplay: true, loop: entity.playback.loop });
        entry = { canvas, player };
        this.lotties.set(entity.asset.id, entry);
      }
      try {
        entry.player.setSpeed(Math.abs(entity.playback.speed));
        entry.player.setLoop(entity.playback.loop);
        if (entity.playback.playing) entry.player.play(); else entry.player.pause();
      } catch { /* player may still be loading */ }
      return entry.canvas;
    }

    let image = this.images.get(entity.asset.id);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.src = entity.asset.url;
      this.images.set(entity.asset.id, image);
    }
    return image.complete ? image : null;
  }
}

function canvasBlend(mode: OverlayEntity["blend"]): GlobalCompositeOperation {
  switch (mode) {
    case "screen": return "screen";
    case "multiply": return "multiply";
    case "difference": return "difference";
    case "overlay": return "overlay";
    case "hardLight": return "hard-light";
    case "additive": return "lighter";
    default: return "source-over";
  }
}
