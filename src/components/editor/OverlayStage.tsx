import { useEffect } from "react";
import { OverlayEntityView } from "./OverlayEntityView";
import { OverlayVault } from "./OverlayVault";
import { OverlayTrackingSampler } from "./OverlayTrackingSampler";
import { OverlayInspector } from "./OverlayInspector";
import { useOverlayStore } from "@/store/useOverlayStore";
import { installBeforeFxBridge } from "@/engine/overlay/beforeFxBridge";

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
      // Stays mounted in every source mode (see StickerCapture.tsx) so Vault
      // and the Make Sticker shortcut are always reachable — but with zero
      // entities placed, this div has nothing to select or drag. Left at a
      // blanket pointer-events-auto it silently sat over the ENTIRE canvas
      // at z-30, above QuadrantSurface's z-20 tap-to-mosh surface, and ate
      // every tap/click on the visualizer before it could reach anything
      // underneath — mosh-on-tap simply never fired. Only claim the surface
      // once there's actually an entity to select/deselect/drag.
      className={`absolute inset-0 z-30 overflow-hidden ${entities.length > 0 ? "pointer-events-auto" : "pointer-events-none"}`}
      onPointerDown={event => {
        if (event.target === event.currentTarget) selectEntity(null);
      }}
    >
      <OverlayTrackingSampler />
      <OverlayInspector />
      {entities.map((entity, index) => (
        <OverlayEntityView key={entity.id} entity={entity} selected={selectedId === entity.id} index={index} count={entities.length} />
      ))}
      <OverlayVault showCaptureButton={false} />
    </div>
  );
}
