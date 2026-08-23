import { useEffect } from "react";
import { OverlayEntityView } from "./OverlayEntityView";
import { OverlayImporter } from "./OverlayImporter";
import { OverlayVault } from "./OverlayVault";
import { useOverlayStore } from "@/store/useOverlayStore";

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
      className="pointer-events-auto absolute inset-0 z-30 overflow-hidden"
      onPointerDown={event => {
        if (event.target === event.currentTarget) selectEntity(null);
      }}
    >
      {entities.map((entity, index) => (
        <OverlayEntityView
          key={entity.id}
          entity={entity}
          selected={selectedId === entity.id}
          index={index}
          count={entities.length}
        />
      ))}

      <div className="absolute bottom-28 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2">
        <OverlayImporter />
        <OverlayVault />
      </div>
    </div>
  );
}
