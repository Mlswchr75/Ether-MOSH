import { useCallback, useEffect, useRef, useState } from "react";
import { OverlayEntityView } from "./OverlayEntityView";
import { OverlayImporter } from "./OverlayImporter";
import { OverlayVault } from "./OverlayVault";
import { StickerForge } from "./StickerForge";
import { OverlayTrackingSampler } from "./OverlayTrackingSampler";
import { OverlayInspector } from "./OverlayInspector";
import { useOverlayStore } from "@/store/useOverlayStore";
import { installBeforeFxBridge } from "@/engine/overlay/beforeFxBridge";
import { useStore } from "@/store/useStore";

installBeforeFxBridge();

/**
 * Transparent interaction surface intended to sit over GlCanvas.
 * Entity animation/gesture state stays local; the store only receives durable
 * transform changes, keeping the global MOSH render loop independent.
 */
export function OverlayStage() {
  const entities = useOverlayStore(s => s.entities);
  const selectedId = useOverlayStore(s => s.selectedId);
  const selectEntity = useOverlayStore(s => s.selectEntity);
  const duplicateEntity = useOverlayStore(s => s.duplicateEntity);
  const removeEntity = useOverlayStore(s => s.removeEntity);
  const sourceMode = useStore(s => s.sourceMode);
  const [toolsOpen, setToolsOpen] = useState(false);
  const idleTimer = useRef<number | null>(null);

  const armIdleClose = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setToolsOpen(false), 5500);
  }, []);

  useEffect(() => {
    const toggle = () => setToolsOpen(open => {
      const next = !open;
      if (next) armIdleClose();
      return next;
    });
    window.addEventListener("mosh:toggle-sticker-tools", toggle);
    return () => window.removeEventListener("mosh:toggle-sticker-tools", toggle);
  }, [armIdleClose]);
  useEffect(() => { setToolsOpen(false); }, [sourceMode]);
  useEffect(() => () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (!selectedId) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeEntity(selectedId);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateEntity(selectedId);
      }
      if (event.key === "Escape") selectEntity(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duplicateEntity, removeEntity, selectEntity, selectedId]);

  return (
    <div
      data-overlay-capture-stage
      // Background stays pointer-events-none so an empty stretch of canvas
      // still reaches QuadrantSurface's tap-to-mosh underneath instead of
      // this always-mounted layer silently absorbing it everywhere. Every
      // actually-interactive piece (entities, Vault, importer, etc.) opts
      // back in with its own pointer-events-auto, same pattern the rest of
      // this surface already uses. Deselecting now goes through Escape
      // (below) rather than a click on empty space, since this div can no
      // longer be the hit target there.
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
    >
      <OverlayTrackingSampler />
      <OverlayInspector />
      {entities.map((entity, index) => (
        <OverlayEntityView key={entity.id} entity={entity} selected={selectedId === entity.id} index={index} count={entities.length} />
      ))}
      <div data-sticker-tools={toolsOpen || undefined} className={toolsOpen ? "absolute bottom-28 left-1/2 z-[80] flex -translate-x-1/2 flex-wrap items-center justify-center gap-2" : "contents"} onPointerDown={toolsOpen ? armIdleClose : undefined} onPointerEnter={toolsOpen ? armIdleClose : undefined} onFocus={toolsOpen ? armIdleClose : undefined}>
        {toolsOpen && <OverlayImporter />}
        {toolsOpen && <StickerForge />}
        <OverlayVault showCaptureButton={toolsOpen} />
      </div>
    </div>
  );
}
