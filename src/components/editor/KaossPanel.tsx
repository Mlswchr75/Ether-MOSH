/**
 * KaossPanel — right-edge pull panel for the embedded Kaoss instrument.
 *
 * Always renders an edge bar; when instrument is enabled, the bar pulses
 * and a swipe/click reveals the panel. Auto-hides 1.5s after last interaction.
 */
import { useEffect, useRef, useState } from "react";
import { useKaossStore, VIS_MODES } from "@/store/kaossStore";
import { PRESETS, SCALES, kaossSynth } from "@/engine/kaossSynth";
import { Power, Mic, MicOff, Compass, ChevronLeft, ChevronRight, Volume2, Activity } from "lucide-react";

const AUTOHIDE_MS = 2500;

export function KaossPanel() {
  const open = useKaossStore(s => s.panelOpen);
  const setOpen = useKaossStore(s => s.setPanelOpen);
  const enabled = useKaossStore(s => s.instrumentEnabled);
  const setEnabled = useKaossStore(s => s.setInstrumentEnabled);
  const synthEnabled = useKaossStore(s => s.synthEnabled);
  const setSynthEnabled = useKaossStore(s => s.setSynthEnabled);
  const sensorsEnabled = useKaossStore(s => s.sensorsEnabled);
  const setSensorsEnabled = useKaossStore(s => s.setSensorsEnabled);
  const preset = useKaossStore(s => s.preset);
  const scale = useKaossStore(s => s.scale);
  const octave = useKaossStore(s => s.octave);
  const setOctave = useKaossStore(s => s.setOctave);
  const visMode = useKaossStore(s => s.visMode);
  const cyclePreset = useKaossStore(s => s.cyclePreset);
  const cycleScale = useKaossStore(s => s.cycleScale);
  const cycleVisMode = useKaossStore(s => s.cycleVisMode);
  const reverbWet = useKaossStore(s => s.reverbWet);
  const setReverbWet = useKaossStore(s => s.setReverbWet);
  const masterGain = useKaossStore(s => s.masterGain);
  const setMasterGain = useKaossStore(s => s.setMasterGain);

  const [vu, setVu] = useState(0);
  const lastInteractRef = useRef(performance.now());
  const dragStartXRef = useRef<number | null>(null);

  // Auto-hide
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      if (performance.now() - lastInteractRef.current > AUTOHIDE_MS) setOpen(false);
    }, 400);
    return () => window.clearInterval(id);
  }, [open, setOpen]);

  // VU loop
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const tick = () => { setVu(kaossSynth.level()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const touch = () => { lastInteractRef.current = performance.now(); };

  const presetLabel = PRESETS.find(p => p.id === preset);
  const scaleLabel = SCALES.find(s => s.id === scale);
  const visLabel = VIS_MODES.find(v => v.id === visMode);

  return (
    <>
      {/* Edge pull bar — always visible (when on Editor) */}
      <button
        aria-label="Kaoss instrument"
        onClick={async () => {
          if (!enabled) {
            setEnabled(true);
            await kaossSynth.ensureCtx();
          }
          setOpen(true);
          touch();
        }}
        onPointerDown={(e) => { dragStartXRef.current = e.clientX; }}
        onPointerUp={(e) => {
          if (dragStartXRef.current !== null) {
            const dx = e.clientX - dragStartXRef.current;
            if (dx < -40) {
              if (!enabled) setEnabled(true);
              setOpen(true);
              touch();
            }
            dragStartXRef.current = null;
          }
        }}
        className={`fixed right-0 top-1/2 z-[60] -translate-y-1/2 flex h-24 w-3 items-center justify-center rounded-l-sm transition ${
          enabled ? "bg-[hsl(var(--accent))] shadow-[0_0_18px_hsl(var(--accent)/0.6)]" : "bg-[hsl(var(--border-default))] hover:bg-[hsl(var(--accent))]"
        }`}
        title="Kaoss instrument"
      >
        <span className="sr-only">Open Kaoss panel</span>
      </button>

      {/* Panel */}
      <aside
        onPointerMove={touch}
        onPointerDown={touch}
        onWheel={touch}
        className={`fixed right-0 top-0 bottom-0 z-[59] flex w-[280px] flex-col gap-3 border-l border-[hsl(var(--border-default))] bg-[hsl(var(--surface-1)/0.95)] p-4 backdrop-blur-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-[hsl(var(--border-default))] pb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--accent))]">KAOSS · INSTR</span>
          <button onClick={() => setOpen(false)} className="font-mono text-[10px] text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))]">×</button>
        </header>

        {/* Master toggles */}
        <div className="grid grid-cols-3 gap-2">
          <ToggleBtn label="INSTR" icon={<Power className="h-3 w-3" />} on={enabled} onClick={async () => {
            const next = !enabled;
            setEnabled(next);
            if (next) await kaossSynth.ensureCtx();
          }} />
          <ToggleBtn label="SYNTH" icon={synthEnabled ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />} on={synthEnabled} onClick={() => setSynthEnabled(!synthEnabled)} />
          <ToggleBtn label="TILT" icon={<Compass className="h-3 w-3" />} on={sensorsEnabled} onClick={() => setSensorsEnabled(!sensorsEnabled)} />
        </div>

        {/* Cyclers */}
        <Cycler
          title="PRESET"
          value={presetLabel?.label ?? preset}
          sub={presetLabel?.tag}
          onPrev={() => cyclePreset(-1)}
          onNext={() => cyclePreset(1)}
        />
        <Cycler
          title="SCALE"
          value={scaleLabel?.label ?? scale}
          onPrev={() => cycleScale(-1)}
          onNext={() => cycleScale(1)}
        />
        <Cycler
          title={`OCTAVE · ${octave}`}
          value={`C${octave}`}
          onPrev={() => setOctave(octave - 1)}
          onNext={() => setOctave(octave + 1)}
        />
        <Cycler
          title="VIS MODE"
          value={visLabel?.label ?? visMode}
          onPrev={() => cycleVisMode(-1)}
          onNext={() => cycleVisMode(1)}
        />

        {/* Reverb / Master */}
        <div className="space-y-2 rounded-sm border border-[hsl(var(--border-default))] p-2">
          <SliderRow icon={<Activity className="h-3 w-3" />} label="REVERB" value={reverbWet} onChange={setReverbWet} />
          <SliderRow icon={<Volume2 className="h-3 w-3" />} label="VOLUME" value={masterGain} onChange={setMasterGain} />
        </div>

        {/* VU */}
        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--text-tertiary))]">OUTPUT</span>
            <span className="font-mono text-[9px] text-[hsl(var(--text-secondary))]">{Math.round(vu * 100)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[hsl(var(--border-subtle))]">
            <div
              className="h-full bg-[hsl(var(--accent))] transition-[width] duration-75"
              style={{ width: `${Math.min(100, vu * 130)}%` }}
            />
          </div>
          <p className="mt-3 font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-[hsl(var(--text-tertiary))]">
            tap canvas · trigger · hold · sustain · drag · slide · 2-finger · cycle vis · swipe-right · cycle preset · 3-finger · reset
          </p>
        </div>
      </aside>
    </>
  );
}

function ToggleBtn({ label, icon, on, onClick }: { label: string; icon: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-sm border px-2 py-2 font-mono text-[9px] uppercase tracking-[0.12em] transition ${
        on
          ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
          : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Cycler({ title, value, sub, onPrev, onNext }: { title: string; value: string; sub?: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="rounded-sm border border-[hsl(var(--border-default))] p-2">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--text-tertiary))]">{title}</div>
      <div className="flex items-center justify-between gap-2">
        <button onClick={onPrev} className="rounded-sm border border-[hsl(var(--border-default))] p-1 text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--accent))]">
          <ChevronLeft className="h-3 w-3" />
        </button>
        <div className="flex-1 truncate text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--text-primary))]">{value}</div>
          {sub && <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[hsl(var(--text-tertiary))]">{sub}</div>}
        </div>
        <button onClick={onNext} className="rounded-sm border border-[hsl(var(--border-default))] p-1 text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--accent))]">
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function SliderRow({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--text-tertiary))]">
          {icon}{label}
        </span>
        <span className="font-mono text-[9px] text-[hsl(var(--text-secondary))]">{Math.round(value * 100)}</span>
      </div>
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="slider-hair w-full"
      />
    </div>
  );
}
