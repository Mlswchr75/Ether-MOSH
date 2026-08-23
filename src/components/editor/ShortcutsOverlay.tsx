import { Keyboard, X } from "lucide-react";

type Row = { keys: string[]; label: string };
type Section = { name: string; rows: Row[] };

const SECTIONS: Section[] = [
  {
    name: "Palette",
    rows: [
      { keys: ["⌘/Ctrl", "K"], label: "Open command palette" },
      { keys: ["?"], label: "This panel" },
      { keys: ["Esc"], label: "Close overlays" },
    ],
  },
  {
    name: "View",
    rows: [
      { keys: ["P"], label: "Performance mode" },
      { keys: ["F"], label: "Performance · alias" },
      { keys: ["Shift", "P"], label: "Fullscreen · plain browser" },
      { keys: ["H"], label: "Toggle UI / peek" },
    ],
  },
  {
    name: "Source mode",
    rows: [
      { keys: ["U"], label: "Upload" },
      { keys: ["L"], label: "Live camera" },
      { keys: ["Y"], label: "Forge" },
    ],
  },
  {
    name: "Hot triggers",
    rows: [
      { keys: ["R"], label: "Record · toggle" },
      { keys: ["M"], label: "Mic · toggle" },
      { keys: ["A"], label: "Auto-shuffle · toggle" },
      { keys: ["Shift", "A"], label: "Cycle shuffle timing" },
      { keys: ["X"], label: "Mosh · randomize" },
      { keys: ["Shift", "X"], label: "Clear FX" },
      { keys: ["S"], label: "★ Save favorite" },
      { keys: ["Shift", "S"], label: "★ Open favorites list" },
      { keys: ["Z"], label: "Freeze · slow-mo" },
      { keys: ["C"], label: "Capture screenshot" },
      { keys: ["3-finger tap"], label: "Capture screenshot · visualizer" },
      { keys: ["G"], label: "GIF · 7s seamless loop" },
      { keys: ["Alt", "G"], label: "GIF · 5s" },
      { keys: ["Shift", "G"], label: "GIF · 3s" },
      { keys: ["V"], label: "Share current frame" },
    ],
  },
  {
    name: "Live · time fx",
    rows: [
      { keys: ["Space"], label: "Reroll seed" },
      { keys: ["Shift", "R"], label: "Reverse motion" },
      { keys: ["Shift", "L"], label: "Seamless 8s loop" },
      { keys: ["Shift", "F"], label: "Freeze · alias" },
      { keys: ["Shift", "M"], label: "Mosh · alias" },
    ],
  },
  {
    name: "Slots",
    rows: [
      { keys: ["1 – 9"], label: "Recall stack from slot" },
      { keys: ["Shift", "1 – 9"], label: "Save stack to slot" },
    ],
  },
  {
    name: "Session",
    rows: [
      { keys: ["⌘/Ctrl", "Z"], label: "Undo" },
      { keys: ["⌘/Ctrl", "Y"], label: "Redo" },
      { keys: ["⌘/Ctrl", "⇧", "Z"], label: "Redo · alt" },
      { keys: ["⌘/Ctrl", "S"], label: "★ Save favorite · alias" },
      { keys: ["⌘/Ctrl", "E"], label: "Export" },
    ],
  },
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center bg-black/60 backdrop-blur-sm"
      style={{ animation: "shFade 200ms ease-out both" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-modal w-[min(92vw,720px)] max-h-[88vh] overflow-y-auto p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
            <h2 className="font-mono text-[13px] uppercase tracking-[0.18em] text-[hsl(var(--text-primary))]">Keyboard</h2>
          </div>
          <button onClick={onClose} className="btn-icon h-8 w-8" aria-label="close">
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {SECTIONS.map(sec => (
            <section key={sec.name}>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--text-tertiary))]">{sec.name}</h3>
              <div>
                {sec.rows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] py-1.5 last:border-b-0">
                    <span className="font-mono text-[11px] text-[hsl(var(--text-secondary))]">{row.label}</span>
                    <div className="flex items-center gap-1">
                      {row.keys.map((k, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <span className="font-mono text-[9px] text-[hsl(var(--text-tertiary))]">+</span>}
                          <kbd className="rounded-sm border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-2))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--text-primary))]">{k}</kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <style>{`@keyframes shFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}
