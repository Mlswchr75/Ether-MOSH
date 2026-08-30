import { useCallback, useEffect, useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { listAudioInputs, type AudioInputDevice } from "@/engine/audioInput";
import { useStore } from "@/store/useStore";

type Props = {
  compact?: boolean;
};

/** Shared USB/interface controls used by every audio panel. Device enumeration
 * is event-driven and only runs while the control exists, so it has no render-
 * loop or mobile performance cost. */
export function AudioInputControls({ compact = false }: Props) {
  const micEnabled = useStore((state) => state.micEnabled);
  const selectedId = useStore((state) => state.audioInputDeviceId);
  const selectedLabel = useStore((state) => state.audioInputDeviceLabel);
  const channel = useStore((state) => state.audioInputChannel);
  const setDevice = useStore((state) => state.setAudioInputDevice);
  const setChannel = useStore((state) => state.setAudioInputChannel);
  const setMicEnabled = useStore((state) => state.setMicEnabled);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const inputId = useId();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setDevices(await listAudioInputs()); }
    catch { setDevices([]); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    refresh();
    const mediaDevices = navigator.mediaDevices;
    mediaDevices?.addEventListener?.("devicechange", refresh);
    window.addEventListener("mosh:audio-input-ready", refresh);
    return () => {
      mediaDevices?.removeEventListener?.("devicechange", refresh);
      window.removeEventListener("mosh:audio-input-ready", refresh);
    };
  }, [refresh, micEnabled]);

  const selectedIsMissing = !!selectedId && !devices.some((device) => device.deviceId === selectedId);

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50"
        >
          input / interface
        </label>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh audio interfaces"
          title="Refresh audio interfaces"
          className="rounded p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </div>
      <select
        id={inputId}
        value={selectedId ?? ""}
        onChange={(event) => {
          const id = event.target.value || null;
          const device = devices.find((candidate) => candidate.deviceId === id);
          setDevice(id, device?.label ?? null);
          if (id && !micEnabled) setMicEnabled(true);
        }}
        className="input-mono w-full text-[10px]"
        aria-label="Audio input or interface"
      >
        <option value="">System default</option>
        {selectedIsMissing && (
          <option value={selectedId}>{selectedLabel || "Saved interface"} (not connected)</option>
        )}
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Interface input channel">
        {(["auto", "left", "right"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setChannel(value)}
            data-on={channel === value || undefined}
            className="rounded-sm border border-white/10 px-1 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-white/50 transition hover:bg-white/10 hover:text-white data-[on]:border-[hsl(var(--accent))]/60 data-[on]:text-[hsl(var(--accent))]"
            title={value === "auto" ? "Use all available channels" : value === "left" ? "Listen to interface input 1" : "Listen to interface input 2"}
          >
            {value === "auto" ? "Auto" : value === "left" ? "Input 1" : "Input 2"}
          </button>
        ))}
      </div>
      <p className="text-[9px] leading-tight text-white/40">
        {devices.length
          ? "USB, Thunderbolt and aggregate inputs appear here. Pick Input 1 or 2 if only one side has signal."
          : "Allow microphone access, then refresh to reveal connected interfaces."}
      </p>
    </div>
  );
}
