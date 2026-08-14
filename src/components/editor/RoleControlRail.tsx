import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { ROLE_COPY, ROLE_ORDER, groupLayersByRole } from "@/engine/effectRoles";
import type { Role } from "@/engine/artDirector";
import { useStore } from "@/store/useStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const FIRST_USE_KEY = "cathedral_role_rail_seen_v1";
const TOUCH_DESCRIPTION_MS = 450;

export type RoleControlRailProps = {
  onTune: (layerId: string) => void;
};

export function RoleControlRail({ onTune }: RoleControlRailProps) {
  const layers = useStore(s => s.layers);
  const selectedRole = useStore(s => s.selectedRole);
  const selectedLayerId = useStore(s => s.selectedLayerId);
  const rememberedLayers = useStore(s => s.selectedRoleLayers);
  const roleCursor = useStore(s => s.roleCursor);
  const imageElement = useStore(s => s.imageElement);
  const videoElement = useStore(s => s.videoElement);
  const selectRole = useStore(s => s.selectRole);
  const selectRoleLayer = useStore(s => s.selectRoleLayer);
  const rerollRole = useStore(s => s.rerollRole);
  const addRole = useStore(s => s.addRole);
  const toggleLocked = useStore(s => s.toggleLocked);
  const [touchDescription, setTouchDescription] = useState<Role | null>(null);
  const [showHint, setShowHint] = useState(() => readFirstUseHint());
  const touchTimer = useRef<number | null>(null);
  const groups = groupLayersByRole(layers);
  const activeRole = selectedRole ?? roleCursor;
  const activeLayers = groups[activeRole];
  const activeLayer = activeLayers.find(layer => layer.id === selectedLayerId)
    ?? activeLayers.find(layer => layer.id === rememberedLayers[activeRole])
    ?? activeLayers[0]
    ?? null;
  const hasSource = Boolean(imageElement || videoElement);

  const clearTouchDescription = () => {
    if (touchTimer.current !== null) window.clearTimeout(touchTimer.current);
    touchTimer.current = null;
    setTouchDescription(null);
  };

  useEffect(() => () => {
    if (touchTimer.current !== null) window.clearTimeout(touchTimer.current);
  }, []);

  const beginTouchDescription = (role: Role) => {
    clearTouchDescription();
    touchTimer.current = window.setTimeout(() => {
      touchTimer.current = null;
      setTouchDescription(role);
    }, TOUCH_DESCRIPTION_MS);
  };

  const select = (role: Role) => {
    selectRole(role);
  };

  const reroll = () => {
    if (!activeLayer) return;
    const result = rerollRole(activeRole, activeLayer.id);
    if (!result) toast(activeLayer.locked ? "Role locked" : "No alternate effect available");
  };

  const add = () => {
    const result = addRole(activeRole);
    if (!result) toast("No alternate effect available");
  };

  const dismissHint = () => {
    try { window.localStorage.setItem(FIRST_USE_KEY, "1"); } catch {}
    setShowHint(false);
  };

  return (
    <TooltipProvider>
      <div
        className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2"
        onPointerDown={event => event.stopPropagation()}
        onPointerMove={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()}
        onPointerCancel={event => event.stopPropagation()}
      >
        <div className="pointer-events-auto grid w-[min(96vw,34rem)] grid-cols-4 gap-1">
          {ROLE_ORDER.map(role => {
            const roleLayers = groups[role];
            const copy = ROLE_COPY[role];
            const selected = role === activeRole;
            const isNext = role === roleCursor;
            const allLocked = roleLayers.length > 0 && roleLayers.every(layer => layer.locked);
            const stateText = roleLayers.length === 0
              ? "empty"
              : allLocked
                ? "locked"
                : isNext
                  ? "next"
                  : "ready";
            const label = [
              `${copy.label} ${copy.technical}${roleLayers.length > 1 ? ` x${roleLayers.length}` : ""}`,
              stateText !== "next" ? stateText : null,
              isNext ? "next" : null,
              selected ? "selected" : null,
            ].filter(Boolean).join(", ");

            return (
              <Tooltip key={role} open={touchDescription === role ? true : undefined}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    aria-expanded={selected}
                    data-next={isNext || undefined}
                    data-state={stateText}
                    onClick={event => {
                      event.stopPropagation();
                      select(role);
                    }}
                    onPointerDown={event => {
                      event.stopPropagation();
                      if (event.pointerType === "touch") beginTouchDescription(role);
                    }}
                    onPointerMove={event => {
                      event.stopPropagation();
                      if (event.pointerType === "touch") clearTouchDescription();
                    }}
                    onPointerUp={event => {
                      event.stopPropagation();
                      if (event.pointerType === "touch") clearTouchDescription();
                    }}
                    onPointerCancel={event => {
                      event.stopPropagation();
                      clearTouchDescription();
                    }}
                    className={`relative min-h-10 rounded-sm border px-1 py-1 text-left font-mono text-[9px] uppercase tracking-[0.12em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] ${
                      selected ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.14)] text-white" : "border-white/15 bg-black/50 text-white/65"
                    } ${allLocked ? "line-through text-white/35" : ""} ${roleLayers.length === 0 ? "opacity-50" : ""}`}
                  >
                    <span className="block text-[10px] font-bold tracking-[0.14em]">{copy.label}</span>
                    <span className="block text-[8px] normal-case tracking-normal text-white/55">{copy.technical}</span>
                    <span className="sr-only"> {stateText}</span>
                    {roleLayers.length > 1 && <span className="absolute right-1 top-1 rounded bg-white/10 px-1 text-[8px]">x{roleLayers.length}</span>}
                    {roleLayers.length === 0 && <span className="absolute right-1 top-1 text-[8px] normal-case">empty</span>}
                    {allLocked && <LockKeyhole aria-hidden className="absolute bottom-1 right-1 size-3" />}
                    {isNext && <span aria-hidden className="absolute bottom-1 left-1 size-1.5 animate-pulse rounded-full bg-[hsl(var(--accent))]" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-48 font-mono text-xs">
                  {copy.description}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <RoleControlStrip
          role={activeRole}
          layers={activeLayers}
          activeLayer={activeLayer}
          hasSource={hasSource}
          onSelectLayer={layerId => selectRoleLayer(activeRole, layerId)}
          onReroll={reroll}
          onAdd={add}
          onToggleLock={() => activeLayer && toggleLocked(activeLayer.id)}
          onTune={() => activeLayer && onTune(activeLayer.id)}
        />

        {showHint && (
          <div className="pointer-events-none flex items-center gap-2 rounded-sm border border-white/15 bg-black/65 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/75">
            <span>Select a role - tap to evolve - drag to tune</span>
            <button
              type="button"
              aria-label="Dismiss role controls hint"
              className="pointer-events-auto rounded p-0.5 text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-white"
              onClick={dismissHint}
            >
              <X aria-hidden className="size-3" />
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function RoleControlStrip({
  role, layers, activeLayer, hasSource, onSelectLayer, onReroll, onAdd, onToggleLock, onTune,
}: {
  role: Role;
  layers: ReturnType<typeof useStore.getState>["layers"];
  activeLayer: ReturnType<typeof useStore.getState>["layers"][number] | null;
  hasSource: boolean;
  onSelectLayer: (layerId: string) => void;
  onReroll: () => void;
  onAdd: () => void;
  onToggleLock: () => void;
  onTune: () => void;
}) {
  const copy = ROLE_COPY[role];
  return (
    <section aria-label={`${copy.label} ${copy.technical} controls`} className="pointer-events-auto w-[min(96vw,34rem)] rounded-sm border border-white/15 bg-black/70 p-2 backdrop-blur-sm">
      <p className="font-mono text-[10px] text-white/75">{copy.description}</p>
      {layers.length > 0 && (
        <div className="mt-2 flex max-w-full gap-1 overflow-x-auto pb-0.5" aria-label="Effect layers">
          {layers.map(layer => (
            <button
              key={layer.id}
              type="button"
              aria-pressed={activeLayer?.id === layer.id}
              onPointerDown={event => event.stopPropagation()}
              onClick={() => onSelectLayer(layer.id)}
              className={`shrink-0 rounded-sm border px-2 py-1 font-mono text-[9px] ${activeLayer?.id === layer.id ? "border-[hsl(var(--accent))] text-white" : "border-white/15 text-white/60"}`}
            >
              {EFFECTS_BY_ID[layer.effectId]?.name ?? layer.effectId}
              {layer.locked && " (locked)"}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {layers.length === 0 ? (
          <button type="button" disabled={!hasSource} onPointerDown={event => event.stopPropagation()} onClick={onAdd} className="min-h-8 rounded-sm border border-white/20 px-2 font-mono text-[9px] uppercase disabled:cursor-not-allowed disabled:opacity-40">
            <Plus aria-hidden className="mr-1 inline size-3" />Add
          </button>
        ) : (
          <>
            <button type="button" disabled={!hasSource} onPointerDown={event => event.stopPropagation()} onClick={onReroll} className="min-h-8 rounded-sm border border-white/20 px-2 font-mono text-[9px] uppercase disabled:cursor-not-allowed disabled:opacity-40">Reroll</button>
            <button type="button" disabled={!hasSource} onPointerDown={event => event.stopPropagation()} onClick={onToggleLock} className="min-h-8 rounded-sm border border-white/20 px-2 font-mono text-[9px] uppercase disabled:cursor-not-allowed disabled:opacity-40">{activeLayer?.locked ? "Unlock" : "Lock"}</button>
            <button type="button" disabled={!hasSource} onPointerDown={event => event.stopPropagation()} onClick={onTune} className="min-h-8 rounded-sm border border-white/20 px-2 font-mono text-[9px] uppercase disabled:cursor-not-allowed disabled:opacity-40">Tune</button>
          </>
        )}
      </div>
    </section>
  );
}

function readFirstUseHint(): boolean {
  try { return window.localStorage.getItem(FIRST_USE_KEY) !== "1"; } catch { return false; }
}
