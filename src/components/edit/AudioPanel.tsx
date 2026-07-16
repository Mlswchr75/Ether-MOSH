import { Mic, MicOff, MonitorSpeaker, Activity } from "lucide-react";
import { toast } from "sonner";
import { audioEngine } from "@/engine/audio";
import { useStore } from "@/store/useStore";

/** Beat clock + audio-input controls. Levels feed the modulator system. */
export const AudioPanel = () => {
  const bpm = useStore(s => s.bpm);
  const setBpm = useStore(s => s.setBpm);
  const beatEnabled = useStore(s => s.beatEnabled);
  const setBeatEnabled = useStore(s => s.setBeatEnabled);
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const setSystemAudioEnabled = useStore(s => s.setSystemAudioEnabled);
  const micSensitivity = useStore(s => s.micSensitivity);
  const setMicSensitivity = useStore(s => s.setMicSensitivity);

  const toggleMic = async () => {
    if (micEnabled) {
      audioEngine.stop();
      setMicEnabled(false);
      return;
    }
    try {
      await audioEngine.startMic();
      setMicEnabled(true);
      toast.success("Mic reactive — map params to BASS/MID/HIGH");
    } catch {
      toast.error("Mic permission denied");
    }
  };

  const toggleSystem = async () => {
    if (systemAudioEnabled) {
      audioEngine.stop();
      setSystemAudioEnabled(false);
      return;
    }
    try {
      await audioEngine.startSystemAudio();
      setSystemAudioEnabled(true);
      toast.success("System audio hooked");
    } catch {
      toast.error("No audio track shared — pick a tab and enable 'share audio'");
    }
  };

  const row = "flex items-center gap-3";
  const toggle = (on: boolean) =>
    `flex min-h-[44px] flex-1 items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-[0.2em] transition ${
      on ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground/60 hover:border-foreground/40"
    }`;

  return (
    <div className="space-y-3 p-1">
      <div className={row}>
        <button type="button" onClick={() => setBeatEnabled(!beatEnabled)} className={toggle(beatEnabled)}>
          <Activity className="h-4 w-4" /> beat clock
        </button>
        <button type="button" onClick={toggleMic} className={toggle(micEnabled)}>
          {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} mic
        </button>
        <button type="button" onClick={toggleSystem} className={`${toggle(systemAudioEnabled)} hidden sm:flex`}>
          <MonitorSpeaker className="h-4 w-4" /> system
        </button>
      </div>
      {beatEnabled && (
        <div className={row}>
          <label className="w-14 font-mono text-[10px] uppercase tracking-widest text-foreground/50">bpm</label>
          <input
            type="range" min={60} max={200} step={1} value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="mosh-range flex-1"
          />
          <span className="w-8 text-right font-mono text-[10px] text-foreground/60">{bpm}</span>
        </div>
      )}
      {(micEnabled || systemAudioEnabled) && (
        <div className={row}>
          <label className="w-14 font-mono text-[10px] uppercase tracking-widest text-foreground/50">gain</label>
          <input
            type="range" min={0.2} max={3} step={0.05} value={micSensitivity}
            onChange={(e) => setMicSensitivity(Number(e.target.value))}
            className="mosh-range flex-1"
          />
          <span className="w-8 text-right font-mono text-[10px] text-foreground/60">{micSensitivity.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
};
