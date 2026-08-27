import { Mic, MonitorSpeaker } from "lucide-react";
import { useStore } from "@/store/useStore";
import { toggleSystemAudio } from "@/engine/systemAudio";
import { AudioInputControls } from "./AudioInputControls";

type Props = {
  onClose: () => void;
  className?: string;
};

/**
 * Lets the user choose between the device microphone and device/tab audio
 * before Listen Mode grabs anything. Physical mic capture forces the OS
 * audio route into "voice" mode, which interrupts or ducks Bluetooth/other
 * playback — Device Audio (tab capture) doesn't touch the mic, so whatever's
 * already playing keeps playing.
 */
export function AudioSourcePicker({ onClose, className = "" }: Props) {
  const setMicEnabled = useStore(s => s.setMicEnabled);
  return (
    <div
      data-audio-source-picker
      className={`flex w-56 flex-col gap-1 rounded-md border border-white/10 bg-black/80 p-2 backdrop-blur-md panel-in-3d ${className}`}
      role="menu"
      aria-label="Choose audio source"
    >
      <button
        type="button"
        onClick={() => { setMicEnabled(true); onClose(); }}
        className="w-full rounded px-2 py-1.5 text-left hover:bg-white/10"
      >
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white">
          <Mic className="h-3 w-3" strokeWidth={1.5} /> Microphone
        </div>
        <div className="mt-0.5 text-[9px] leading-tight text-white/50">
          Uses your device mic — will interrupt Bluetooth or other playback while it's on.
        </div>
      </button>
      <button
        type="button"
        onClick={() => { onClose(); toggleSystemAudio(); }}
        className="w-full rounded px-2 py-1.5 text-left hover:bg-white/10"
      >
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white">
          <MonitorSpeaker className="h-3 w-3" strokeWidth={1.5} /> Device Audio
        </div>
        <div className="mt-0.5 text-[9px] leading-tight text-white/50">
          Shares a browser tab's sound — keeps your music playing.
        </div>
      </button>
      <div className="my-1 h-px bg-white/10" />
      <AudioInputControls compact />
    </div>
  );
}
