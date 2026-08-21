/**
 * The canvas overlay for live mosh stickers — short looping clips placed,
 * transformed and independently mosh'd on top of whatever the main canvas is
 * doing. Mounted unconditionally alongside KaossSurface/RippleLayer so it's
 * present in every SourceMode (upload/camera/forge).
 *
 * Each sticker gets its own small MoshRenderer instance via StickerRenderer's
 * pool, composited here as a CSS-transformed DOM element — cheaper and far
 * less risky than teaching the main full-frame compositor about positioned
 * rectangles.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Lock, Trash2, Unlock } from "lucide-react";
import { PUBLIC_EFFECTS, EFFECTS_BY_ID } from "@/engine/effects";
import { stickerRendererPool } from "@/engine/StickerRenderer";
import { useMoshStickerStore, type MoshSticker } from "@/store/moshStickerStore";

const PINCH_RATIO_EPS = 0.02;

function angleDeg(ax: number, ay: number, bx: number, by: number): number {
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

export function MoshStickerLayer() {
  const stickers = useMoshStickerStore(s => s.stickers);
  const enabled = useMoshStickerStore(s => s.enabled);
  const selectedId = useMoshStickerStore(s => s.selectedId);
  const selectSticker = useMoshStickerStore(s => s.selectSticker);

  const containerRef = useRef<HTMLDivElement>(null);
  const hasStickers = stickers.length > 0;

  // Drive the shared render loop for as long as any stickers exist; the
  // per-tick source always reads live store state, so param/effect/hidden
  // changes apply without restarting the loop.
  useEffect(() => {
    if (!hasStickers) return;
    stickerRendererPool.start(() =>
      useMoshStickerStore.getState().stickers.map(s => ({
        id: s.id, effectId: s.effectId, params: s.params, hidden: s.hidden || !enabled,
      }))
    );
    return () => stickerRendererPool.stop();
  }, [hasStickers, enabled]);

  // Pause/resume each clip's own decode loop with the light-switch, so it's
  // instant and battery-cheap rather than tearing anything down.
  useEffect(() => {
    for (const s of stickers) {
      const el = s.clip.el;
      if (el instanceof HTMLVideoElement) {
        if (enabled && !s.hidden) el.play().catch(() => undefined);
        else el.pause();
      }
    }
  }, [enabled, stickers]);

  if (stickers.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      // Above StartCameraOverlay's centered "GO LIVE" CTA (z-30) and
      // HotTriggers (z-30) — a sticker placed before any main source is
      // loaded, or one that happens to sit under the always-visible control
      // rail, must stay interactable rather than getting silently shadowed
      // by chrome that only covers a small centered/corner region anyway.
      style={{ display: enabled ? undefined : "none", zIndex: 32 }}
      onPointerDown={(e) => { if (e.target === containerRef.current) selectSticker(null); }}
    >
      {stickers.map(s => (
        <StickerNode
          key={s.id}
          sticker={s}
          containerRef={containerRef}
          selected={selectedId === s.id}
          onSelect={() => selectSticker(s.id)}
        />
      ))}
    </div>
  );
}

type NodeProps = {
  sticker: MoshSticker;
  containerRef: RefObject<HTMLDivElement>;
  selected: boolean;
  onSelect: () => void;
};

function StickerNode({ sticker, containerRef, selected, onSelect }: NodeProps) {
  const { id, x, y, w, h, rotation, opacity, locked, hidden, effectId } = sticker;
  const setTransform = useMoshStickerStore(s => s.setTransform);
  const setOpacity = useMoshStickerStore(s => s.setOpacity);
  const setEffect = useMoshStickerStore(s => s.setEffect);
  const setParam = useMoshStickerStore(s => s.setParam);
  const removeSticker = useMoshStickerStore(s => s.removeSticker);
  const toggleLocked = useMoshStickerStore(s => s.toggleLocked);

  const mountRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchBaseRef = useRef<{ dist: number; angle: number; w: number; h: number; rotation: number } | null>(null);
  const dragBaseRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

  // Mount/unmount the pooled renderer canvas.
  useEffect(() => {
    const canvas = stickerRendererPool.ensure(id, effectId);
    mountRef.current?.appendChild(canvas);
    stickerRendererPool.setSource(id, sticker.clip);
    return () => stickerRendererPool.remove(id);
    // Only on mount/unmount — the clip never changes after a sticker is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { stickerRendererPool.setEffect(id, effectId); }, [id, effectId]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) stickerRendererPool.setSize(id, box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id]);

  const containerRect = () => containerRef.current?.getBoundingClientRect() ?? null;
  const normalize = (clientX: number, clientY: number, r: DOMRect) => ({
    x: (clientX - r.left) / Math.max(1, r.width),
    y: (clientY - r.top) / Math.max(1, r.height),
  });

  const onBodyPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    if (locked) return;
    const r = containerRect();
    if (!r) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    pointersRef.current.set(e.pointerId, normalize(e.clientX, e.clientY, r));

    if (pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot((pts[0].x - pts[1].x) * r.width, (pts[0].y - pts[1].y) * r.height);
      const angle = angleDeg(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      pinchBaseRef.current = { dist: Math.max(1, dist), angle, w: sticker.w, h: sticker.h, rotation: sticker.rotation };
      dragBaseRef.current = null;
    } else {
      const p = normalize(e.clientX, e.clientY, r);
      dragBaseRef.current = { x: sticker.x, y: sticker.y, sx: p.x, sy: p.y };
      pinchBaseRef.current = null;
    }
  };

  const onBodyPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const r = containerRect();
    if (!r) return;
    pointersRef.current.set(e.pointerId, normalize(e.clientX, e.clientY, r));

    if (pointersRef.current.size >= 2 && pinchBaseRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot((pts[0].x - pts[1].x) * r.width, (pts[0].y - pts[1].y) * r.height);
      const angle = angleDeg(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const base = pinchBaseRef.current;
      const ratio = Math.max(0.1, dist) / base.dist;
      if (Math.abs(ratio - 1) > PINCH_RATIO_EPS) {
        setTransform(id, { w: base.w * ratio, h: base.h * ratio });
      }
      setTransform(id, { rotation: base.rotation + (angle - base.angle) });
      return;
    }

    const base = dragBaseRef.current;
    if (!base) return;
    const p = normalize(e.clientX, e.clientY, r);
    setTransform(id, { x: base.x + (p.x - base.sx), y: base.y + (p.y - base.sy) });
  };

  const onBodyPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    // Simplest safe behavior across a pinch->drag transition: require a fresh
    // pointerdown to continue, rather than reconciling stale baselines.
    pinchBaseRef.current = null;
    dragBaseRef.current = null;
  };

  // Corner resize handle — single pointer, mouse-friendly.
  const resizeBaseRef = useRef<{ w: number; h: number; sx: number; sy: number } | null>(null);
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    const r = containerRect();
    if (!r || locked) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const p = normalize(e.clientX, e.clientY, r);
    resizeBaseRef.current = { w: sticker.w, h: sticker.h, sx: p.x, sy: p.y };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const base = resizeBaseRef.current;
    const r = containerRect();
    if (!base || !r) return;
    const p = normalize(e.clientX, e.clientY, r);
    const dw = (p.x - base.sx) * 2;
    const dh = (p.y - base.sy) * 2;
    setTransform(id, { w: base.w + dw, h: base.h + dh });
  };
  const onResizeUp = () => { resizeBaseRef.current = null; };

  // Rotate handle — single pointer, mouse-friendly.
  const rotateBaseRef = useRef<{ rotation: number; startAngle: number } | null>(null);
  const onRotateDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    const r = containerRect();
    if (!r || locked) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const cx = sticker.x * r.width + r.left;
    const cy = sticker.y * r.height + r.top;
    rotateBaseRef.current = { rotation: sticker.rotation, startAngle: angleDeg(cx, cy, e.clientX, e.clientY) };
  };
  const onRotateMove = (e: React.PointerEvent) => {
    const base = rotateBaseRef.current;
    const r = containerRect();
    if (!base || !r) return;
    const cx = sticker.x * r.width + r.left;
    const cy = sticker.y * r.height + r.top;
    const cur = angleDeg(cx, cy, e.clientX, e.clientY);
    setTransform(id, { rotation: base.rotation + (cur - base.startAngle) });
  };
  const onRotateUp = () => { rotateBaseRef.current = null; };

  const catalog = useMemo(() => PUBLIC_EFFECTS.filter(e => e.category !== "dimension"), []);
  const def = EFFECTS_BY_ID[effectId];

  return (
    <div
      ref={wrapRef}
      className="absolute"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        opacity,
        display: hidden ? "none" : undefined,
        pointerEvents: "auto",
      }}
    >
      <div
        ref={mountRef}
        data-no-longpress
        data-mosh-sticker-body={id}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerUp}
        className={`h-full w-full touch-none overflow-hidden rounded-sm ${selected ? "ring-2 ring-[hsl(var(--accent))]" : "ring-1 ring-white/15"}`}
        style={{ touchAction: "none", cursor: locked ? "default" : "grab" }}
      />

      {selected && !locked && (
        <>
          <div
            data-no-longpress
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            title="Resize"
            className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border border-black/40 bg-[hsl(var(--accent))]"
            style={{ touchAction: "none" }}
          />
          <div
            data-no-longpress
            onPointerDown={onRotateDown}
            onPointerMove={onRotateMove}
            onPointerUp={onRotateUp}
            onPointerCancel={onRotateUp}
            title="Rotate"
            className="absolute -top-6 left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-alias rounded-full border border-black/40 bg-[hsl(var(--accent))]"
            style={{ touchAction: "none" }}
          />
        </>
      )}

      {selected && (
        <div
          data-no-longpress
          onPointerDown={(e) => e.stopPropagation()}
          className="panel-in-3d absolute left-1/2 top-[calc(100%+10px)] z-10 w-52 -translate-x-1/2 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-2 backdrop-blur-md"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <select
              value={effectId}
              onChange={(e) => setEffect(id, e.target.value)}
              className="w-full rounded-sm border border-white/10 bg-black/60 px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-white/85 outline-none"
            >
              {catalog.map(eff => (
                <option key={eff.id} value={eff.id}>{eff.name}</option>
              ))}
            </select>
          </div>

          {def?.params.slice(0, 3).map(p => (
            <div key={p.key} className="mb-1.5">
              <div className="mb-0.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-white/50">
                <span>{p.label}</span>
                <span>{(sticker.params[p.key] ?? p.default).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step ?? (p.max - p.min) / 100}
                value={sticker.params[p.key] ?? p.default}
                onChange={(e) => setParam(id, p.key, parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--accent))]"
              />
            </div>
          ))}

          <div className="mb-1.5">
            <div className="mb-0.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-white/50">
              <span>Opacity</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={opacity}
              onChange={(e) => setOpacity(id, parseFloat(e.target.value))}
              className="w-full accent-[hsl(var(--accent))]"
            />
          </div>

          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => toggleLocked(id)}
              aria-label={locked ? "Unlock" : "Lock"}
              title={locked ? "Unlock" : "Lock"}
              className="rounded-sm border border-transparent p-1 text-white/60 transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
            >
              {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => removeSticker(id)}
              aria-label="Delete sticker"
              title="Delete sticker"
              className="rounded-sm border border-transparent p-1 text-white/60 transition hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
