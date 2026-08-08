import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { Heart, Mic, MicOff, MonitorSpeaker } from "lucide-react";
import { toggleSystemAudio } from "@/engine/systemAudio";

export function BeatPanel() {
  const bpm = useStore(s => s.bpm);
  const setBpm = useStore(s => s.setBpm);
  const enabled = useStore(s => s.beatEnabled);
  const setEnabled = useStore(s => s.setBeatEnabled);
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const setSystemAudioEnabled = useStore(s => s.setSystemAudioEnabled);
  const micSensitivity = useStore(s => s.micSensitivity);
  const setMicSensitivity = useStore(s => s.setMicSensitivity);
  const [taps, setTaps] = useState<number[]>([]);
  const [meter, setMeter] = useState(0);
  const meterRaf = useRef(0);

  useEffect(() => {
    if (!micEnabled && !systemAudioEnabled) { setMeter(0); return; }
    const tick = () => {
      const w = window as any;
      setMeter(typeof w.__aegisMicLevel === "number" ? w.__aegisMicLevel : 0);
      meterRaf.current = requestAnimationFrame(tick);
    };
    meterRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(meterRaf.current);
  }, [micEnabled, systemAudioEnabled]);

  const tap = () => {
    const now = performance.now();
    const fresh = [...taps, now].filter(t => now - t < 2500);
    setTaps(fresh);
    if (fresh.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < fresh.length; i++) intervals.push(fresh[i] - fresh[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.max(20, Math.min(300, Math.round(60000 / avg))));
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Beat sync */}
      <Section
        title="Beat Sync"
        right={
          <button
            onClick={() => setEnabled(!enabled)}
            data-on={enabled}
            className="switch-square"
            aria-label="toggle beat sync"
          />
        }
      >
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="beat-bpm">BPM</Label>
            <input
              id="beat-bpm"
              type="number" min={20} max={300} value={bpm}
              onChange={(e) => setBpm(+e.target.value)}
              className="input-mono w-full text-[16px]"
            />
          </div>
          <button onClick={tap} className="btn-ghost h-9 px-4">
            <Heart className="h-3 w-3" strokeWidth={1.5} /> Tap
          </button>
        </div>

        <input
          type="range" min={40} max={240} value={bpm}
          onChange={(e) => setBpm(+e.target.value)}
          aria-label="BPM slider"
          className="slider-hair w-full"
        />

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setBpm(Math.max(20, Math.round(bpm / 2)))} className="btn-ghost justify-center">½×</button>
          <button onClick={() => setBpm(Math.min(300, Math.round(bpm * 2)))} className="btn-ghost justify-center">2×</button>
        </div>
      </Section>

      {/* Listen mode */}
      <Section
        title="Listen Mode"
        subtitle={systemAudioEnabled ? "device audio" : "mic reactive"}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMicEnabled(!micEnabled)}
            data-on={micEnabled}
            className="btn-ghost flex items-center justify-center gap-1.5 py-1.5"
            aria-label="toggle microphone"
          >
            {micEnabled ? <Mic className="h-3 w-3" strokeWidth={1.5} /> : <MicOff className="h-3 w-3" strokeWidth={1.5} />}
            <span className="font-mono text-[10px] uppercase tracking-[0.06em]">Mic</span>
          </button>
          <button
            onClick={() => toggleSystemAudio()}
            data-on={systemAudioEnabled}
            className="btn-ghost flex items-center justify-center gap-1.5 py-1.5"
            aria-label="toggle device audio"
            title="Route system / tab audio (e.g. YouTube, Apple Music)"
          >
            <MonitorSpeaker className="h-3 w-3" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.06em]">Device</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(micEnabled || systemAudioEnabled)
            ? <Mic className="h-3 w-3 text-[hsl(var(--accent))]" strokeWidth={1.5} />
            : <MicOff className="h-3 w-3 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />}
          <div className="h-[2px] flex-1 overflow-hidden bg-[hsl(var(--border-default))]">
            <div
              className="h-full bg-[hsl(var(--accent))]"
              style={{ width: `${Math.round(meter * 100)}%`, transition: "width 75ms linear" }}
            />
          </div>
          <span className="w-8 text-right font-mono text-[10px] text-[hsl(var(--text-tertiary))]">
            {Math.round(meter * 100)}
          </span>
        </div>

        <div>
          <Label htmlFor="beat-sensitivity">Sensitivity · {micSensitivity.toFixed(2)}×</Label>
          <input
            id="beat-sensitivity"
            type="range" min={0.2} max={2.5} step={0.05} value={micSensitivity}
            onChange={(e) => setMicSensitivity(+e.target.value)}
            className="slider-hair w-full"
            disabled={!micEnabled && !systemAudioEnabled}
          />
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">
          {systemAudioEnabled
            ? <>Sharing a tab? Tick <span className="text-[hsl(var(--text-secondary))]">"Share audio"</span> when prompted.</>
            : <>Set any modulator to <span className="text-[hsl(var(--text-secondary))]">Beat</span> to react.</>}
        </p>
      </Section>
    </div>
  );
}

const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">{children}</label>
);

const Section = ({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <div className="glass-2 space-y-3 p-3">
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <div className="font-mono text-[12px] uppercase tracking-[0.04em] text-[hsl(var(--text-primary))]">{title}</div>
        {subtitle && <div className="font-mono text-[9px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">{subtitle}</div>}
      </div>
      {right}
    </div>
    {children}
  </div>
);
