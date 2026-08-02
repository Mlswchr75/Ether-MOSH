/**
 * Standalone state for the embedded Kaoss instrument.
 * Kept separate from the main visualizer store so nothing in the existing
 * editor ever needs to change behaviorally.
 */
import { create } from "zustand";
import type { PresetId, ScaleId } from "@/engine/kaossSynth";

export type VisMode =
  | "plasma"
  | "pixelDrift"
  | "voidBloom"
  | "fracture"
  | "flux"
  | "noiseStorm"
  | "prism";

export const VIS_MODES: { id: VisMode; label: string; xParam: string; yParam: string }[] = [
  { id: "plasma",     label: "PLASMA",      xParam: "hue",      yParam: "intensity" },
  { id: "pixelDrift", label: "PIXEL DRIFT", xParam: "shift",    yParam: "amount"    },
  { id: "voidBloom",  label: "VOID BLOOM",  xParam: "radius",   yParam: "glow"      },
  { id: "fracture",   label: "FRACTURE",    xParam: "shatter",  yParam: "spread"    },
  { id: "flux",       label: "FLUX",        xParam: "warp",     yParam: "speed"     },
  { id: "noiseStorm", label: "NOISE STORM", xParam: "density",  yParam: "violence"  },
  { id: "prism",      label: "PRISM",       xParam: "split",    yParam: "refract"   },
];

type State = {
  /** Master toggle — when off the surface is invisible & passive. */
  instrumentEnabled: boolean;
  panelOpen: boolean;
  /** Audio engine on/off (separate from instrumentEnabled to allow silent visual mode). */
  synthEnabled: boolean;
  micEnabled: boolean;
  sensorsEnabled: boolean;
  preset: PresetId;
  scale: ScaleId;
  /** Root note octave — root midi = 36 + octave*12. */
  octave: number;
  visMode: VisMode;
  showHud: boolean;
  /** XY mini-orb position 0..1 (last-touched). */
  orb: { x: number; y: number; active: boolean };
  /** Current note label for note bubble. */
  noteLabel: string;
  reverbWet: number;
  masterGain: number;
};

type Actions = {
  setInstrumentEnabled: (b: boolean) => void;
  setPanelOpen: (b: boolean) => void;
  setSynthEnabled: (b: boolean) => void;
  setMicEnabled: (b: boolean) => void;
  setSensorsEnabled: (b: boolean) => void;
  setPreset: (p: PresetId) => void;
  setScale: (s: ScaleId) => void;
  setOctave: (o: number) => void;
  setVisMode: (m: VisMode) => void;
  cyclePreset: (dir?: 1 | -1) => void;
  cycleScale: (dir?: 1 | -1) => void;
  cycleVisMode: (dir?: 1 | -1) => void;
  setOrb: (x: number, y: number, active: boolean) => void;
  setNoteLabel: (s: string) => void;
  setReverbWet: (v: number) => void;
  setMasterGain: (v: number) => void;
  setShowHud: (b: boolean) => void;
};

import { PRESETS, SCALES } from "@/engine/kaossSynth";

export const useKaossStore = create<State & Actions>((set, get) => ({
  instrumentEnabled: false,
  panelOpen: false,
  synthEnabled: true,
  micEnabled: false,
  sensorsEnabled: false,
  preset: "kaossLead",
  scale: "pentatonic",
  octave: 3,
  visMode: "plasma",
  showHud: true,
  orb: { x: 0.5, y: 0.5, active: false },
  noteLabel: "—",
  reverbWet: 0.25,
  masterGain: 0.55,

  setInstrumentEnabled: (b) => set({ instrumentEnabled: b }),
  setPanelOpen: (b) => set({ panelOpen: b }),
  setSynthEnabled: (b) => set({ synthEnabled: b }),
  setMicEnabled: (b) => set({ micEnabled: b }),
  setSensorsEnabled: (b) => set({ sensorsEnabled: b }),
  setPreset: (p) => set({ preset: p }),
  setScale: (s) => set({ scale: s }),
  setOctave: (o) => set({ octave: Math.max(1, Math.min(6, o)) }),
  setVisMode: (m) => set({ visMode: m }),
  cyclePreset: (dir = 1) => {
    const cur = get().preset;
    const idx = PRESETS.findIndex(p => p.id === cur);
    const next = PRESETS[(idx + dir + PRESETS.length) % PRESETS.length].id;
    set({ preset: next });
  },
  cycleScale: (dir = 1) => {
    const cur = get().scale;
    const idx = SCALES.findIndex(s => s.id === cur);
    const next = SCALES[(idx + dir + SCALES.length) % SCALES.length].id;
    set({ scale: next });
  },
  cycleVisMode: (dir = 1) => {
    const cur = get().visMode;
    const idx = VIS_MODES.findIndex(v => v.id === cur);
    const next = VIS_MODES[(idx + dir + VIS_MODES.length) % VIS_MODES.length].id;
    set({ visMode: next });
  },
  setOrb: (x, y, active) => set({ orb: { x, y, active } }),
  setNoteLabel: (s) => set({ noteLabel: s }),
  setReverbWet: (v) => set({ reverbWet: v }),
  setMasterGain: (v) => set({ masterGain: v }),
  setShowHud: (b) => set({ showHud: b }),
}));
