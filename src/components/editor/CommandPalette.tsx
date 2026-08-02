import { Command } from "cmdk";
import { useEffect, useMemo } from "react";
import { useStore } from "@/store/useStore";
import { EFFECTS } from "@/engine/effects";
import type { AudioSource } from "@/store/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onTogglePerf: () => void;
  onToggleUI: () => void;
  onShowShortcuts: () => void;
  onExport: () => void;
  onSavePreset: () => void;
  onLoadPreset: () => void;
  onLoadImage: () => void;
};

export function CommandPalette(props: Props) {
  const { open, onClose } = props;
  const addLayer = useStore(s => s.addLayer);
  const removeTopLayer = useStore(s => s.removeTopLayer);
  const clearLayers = useStore(s => s.clearLayers);
  const mosh = useStore(s => s.mosh);
  const rerollSeed = useStore(s => s.rerollSeed);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const setAudioMap = useStore(s => s.setAudioMap);
  const lastTouched = useStore(s => s.lastTouchedParam);
  const clearImage = useStore(s => s.clearImage);

  // Esc handled by Command itself. Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const run = (fn: () => void) => () => { fn(); onClose(); };

  const mapTo = (src: AudioSource) => () => {
    if (!lastTouched) return;
    setAudioMap(lastTouched.layerId, lastTouched.key, { source: src, amount: 0.6, smoothing: 0.3 });
    onClose();
  };

  const sortedEffects = useMemo(() => [...EFFECTS].sort((a, b) => a.name.localeCompare(b.name)), []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-start justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", animation: "cmdkFade 120ms ease-out both" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-modal mt-[25vh] w-[600px] max-w-[92vw]"
        style={{ animation: "cmdkRise 140ms ease-out both" }}
      >
        <Command label="Command Palette" loop className="flex max-h-[480px] flex-col">
          <Command.Input
            autoFocus
            placeholder="Type a command…"
            className="h-12 w-full bg-transparent px-4 font-mono text-[13px] text-[hsl(var(--text-primary))] placeholder:text-[hsl(var(--text-tertiary))] caret-[hsl(var(--accent))] outline-none border-0"
          />
          <div className="border-t border-[hsl(var(--border-subtle))]" />
          <Command.List className="flex-1 overflow-y-auto p-1">
            <Command.Empty className="px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--text-tertiary))]">
              No matches
            </Command.Empty>

            <CmdGroup heading="Source">
              <CmdItem onSelect={run(props.onLoadImage)} shortcut="">Load image…</CmdItem>
              <CmdItem onSelect={run(clearImage)}>Clear source</CmdItem>
            </CmdGroup>

            <CmdGroup heading="Effects">
              {sortedEffects.map(e => (
                <CmdItem key={e.id} onSelect={run(() => addLayer(e.id))}>Add effect: {e.name}</CmdItem>
              ))}
              <CmdItem onSelect={run(removeTopLayer)}>Remove top effect</CmdItem>
              <CmdItem onSelect={run(clearLayers)}>Clear effect stack</CmdItem>
              <CmdItem onSelect={run(() => mosh())}>Randomize effect stack</CmdItem>
              <CmdItem onSelect={run(rerollSeed)} shortcut="Space">Reroll seed</CmdItem>
            </CmdGroup>

            <CmdGroup heading="Audio">
              <CmdItem onSelect={run(() => setMicEnabled(true))} shortcut="M">Enable mic</CmdItem>
              <CmdItem onSelect={run(() => setMicEnabled(false))}>Disable mic</CmdItem>
              {(["bass", "mid", "treble", "beat"] as AudioSource[]).map(src => (
                <CmdItem
                  key={src}
                  disabled={!lastTouched}
                  onSelect={mapTo(src)}
                >
                  Map {lastTouched ? `"${lastTouched.key}"` : "last-touched param"} to {src}
                </CmdItem>
              ))}
            </CmdGroup>

            <CmdGroup heading="View">
              <CmdItem onSelect={run(props.onTogglePerf)} shortcut="P">Toggle Performance Mode</CmdItem>
              <CmdItem onSelect={run(props.onToggleUI)} shortcut="H">Toggle UI visibility</CmdItem>
              <CmdItem onSelect={run(() => useStore.getState().setShowFps(!useStore.getState().showFps))}>
                {useStore.getState().showFps ? "Hide FPS" : "Show FPS"}
              </CmdItem>
              <CmdItem onSelect={run(props.onShowShortcuts)} shortcut="?">Show keyboard shortcuts</CmdItem>
            </CmdGroup>

            <CmdGroup heading="Session">
              <CmdItem onSelect={run(props.onSavePreset)} shortcut="⌘S">Save preset…</CmdItem>
              <CmdItem onSelect={run(props.onLoadPreset)}>Load preset…</CmdItem>
              <CmdItem onSelect={run(props.onExport)} shortcut="⌘E">Export image / video</CmdItem>
              <CmdItem onSelect={run(clearLayers)}>Reset session</CmdItem>
            </CmdGroup>
          </Command.List>
        </Command>
      </div>
      <style>{`
        @keyframes cmdkFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cmdkRise { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        [cmdk-group-heading] {
          padding: 10px 12px 4px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: hsl(var(--text-tertiary));
        }
        [cmdk-item] {
          display: flex; align-items: center; justify-content: space-between;
          height: 36px; padding: 0 12px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          color: hsl(var(--text-secondary));
          border-radius: 2px;
          cursor: pointer;
          gap: 8px;
        }
        [cmdk-item][data-selected="true"] {
          background: hsl(var(--surface-active) / var(--surface-active-a));
          color: hsl(var(--text-primary));
        }
        [cmdk-item][data-disabled="true"] {
          opacity: 0.4; pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function CmdGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return <Command.Group heading={heading}>{children}</Command.Group>;
}

function CmdItem({ children, onSelect, shortcut, disabled }: {
  children: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <Command.Item onSelect={onSelect} disabled={disabled}>
      <span className="truncate">{children}</span>
      {shortcut && (
        <kbd className="font-mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-tertiary))]">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
