/**
 * Manages one small, independent MoshRenderer instance per placed mosh
 * sticker — same pattern already proven twice in this codebase
 * (ForgePanel.tsx's one-shot export renderer, MoshingBackdrop.tsx's
 * continuous throttled decorative renderer), just fanned out to up to
 * MAX_STICKERS concurrent instances instead of one.
 *
 * A single shared rAF loop drives every sticker, round-robining which ones
 * actually re-render each tick (rather than all N every frame) — the one
 * genuinely new performance mechanism this needs, since no existing call
 * site runs more than one live instance at a time.
 */
import { MoshRenderer, type RenderLayer } from "./Renderer";
import type { StickerClip } from "@/store/moshStickerStore";

type GifSource = {
  img: HTMLImageElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

type Entry = {
  canvas: HTMLCanvasElement;
  renderer: MoshRenderer;
  gif: GifSource | null;
};

export type ActiveSticker = {
  id: string;
  effectId: string;
  params: Record<string, number>;
  hidden: boolean;
};

const TARGET_FPS = 20;
const FRAME_TIME = 1000 / TARGET_FPS;
const MAX_PER_TICK_BUDGET = 2;

class StickerRendererPool {
  private entries = new Map<string, Entry>();
  private hiddenHost: HTMLDivElement | null = null;
  private raf = 0;
  private lastTick = 0;
  private rrIndex = 0;
  private running = false;
  private getActive: (() => ActiveSticker[]) | null = null;
  private slowStreak = 0;
  private perTickBudget = MAX_PER_TICK_BUDGET;

  private ensureHiddenHost(): HTMLDivElement {
    if (this.hiddenHost) return this.hiddenHost;
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.top = "0";
    host.style.width = "1px";
    host.style.height = "1px";
    host.style.overflow = "hidden";
    host.style.pointerEvents = "none";
    document.body.appendChild(host);
    this.hiddenHost = host;
    return host;
  }

  /** Keeps a clip's source element attached off-screen so the browser keeps
   *  decoding/looping it (video autoplay and native GIF animation both
   *  behave more reliably attached than detached, per useCamera.ts's own
   *  warmUpCameraVideo precedent). */
  mountClipElement(clip: StickerClip) {
    if (clip.el.isConnected) return;
    this.ensureHiddenHost().appendChild(clip.el);
  }

  ensure(id: string, effectId: string): HTMLCanvasElement {
    const existing = this.entries.get(id);
    if (existing) return existing.canvas;
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    const renderer = new MoshRenderer(canvas);
    renderer.setWarmupEffects([effectId]);
    this.entries.set(id, { canvas, renderer, gif: null });
    return canvas;
  }

  setSize(id: string, cssW: number, cssH: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    try { entry.renderer.resize(Math.max(1, cssW), Math.max(1, cssH)); } catch { /* noop */ }
  }

  setSource(id: string, clip: StickerClip) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.mountClipElement(clip);
    if (clip.kind === "video") {
      entry.gif = null;
      try { entry.renderer.setSourceVideo(clip.el as HTMLVideoElement); } catch { /* noop */ }
    } else {
      const img = clip.el as HTMLImageElement;
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = img.naturalWidth || 1;
      srcCanvas.height = img.naturalHeight || 1;
      const ctx = srcCanvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);
      entry.gif = { img, canvas: srcCanvas, ctx };
      try { entry.renderer.setSourceCanvas(srcCanvas); } catch { /* noop */ }
    }
  }

  setEffect(id: string, effectId: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.renderer.setWarmupEffects([effectId]);
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    try { entry.renderer.dispose(); } catch { /* noop */ }
    entry.canvas.remove();
    this.entries.delete(id);
  }

  disposeAll() {
    for (const id of Array.from(this.entries.keys())) this.remove(id);
    if (this.hiddenHost) { this.hiddenHost.remove(); this.hiddenHost = null; }
    this.stop();
  }

  private renderOne(s: ActiveSticker) {
    const entry = this.entries.get(s.id);
    if (!entry) return;
    if (entry.gif) {
      // Native GIF animation advances entry.gif.img on its own; resample its
      // current frame into the 2D canvas MoshRenderer treats as a live source.
      const { img, canvas, ctx } = entry.gif;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    const layers: RenderLayer[] = [{
      id: "s0", effectId: s.effectId, hidden: false, opacity: 1, blend: "normal", params: s.params,
    }];
    try { entry.renderer.render(layers, 0); } catch (err) {
      console.error("MOSH sticker render error:", err);
    }
  }

  /** `source` is read fresh every tick (straight from the store's getState()),
   *  so transform/param/effect changes take effect without restarting the loop. */
  start(source: () => ActiveSticker[]) {
    this.getActive = source;
    if (this.running) return;
    this.running = true;
    const tick = (now: number) => {
      if (!this.running) return;
      const elapsed = now - this.lastTick;
      if (elapsed < FRAME_TIME) { this.raf = requestAnimationFrame(tick); return; }
      const frameStart = performance.now();

      const visible = (this.getActive?.() ?? []).filter(s => !s.hidden);
      let budget = this.perTickBudget;
      for (let i = 0; i < visible.length && budget > 0; i++) {
        const idx = (this.rrIndex + i) % visible.length;
        this.renderOne(visible[idx]);
        budget--;
      }
      if (visible.length > 0) this.rrIndex = (this.rrIndex + 1) % visible.length;

      const cost = performance.now() - frameStart;
      if (cost > FRAME_TIME * 1.5) {
        this.slowStreak++;
        if (this.slowStreak >= 6) this.perTickBudget = 1;
      } else {
        this.slowStreak = 0;
      }

      this.lastTick = now;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.slowStreak = 0;
    this.perTickBudget = MAX_PER_TICK_BUDGET;
  }
}

export const stickerRendererPool = new StickerRendererPool();
