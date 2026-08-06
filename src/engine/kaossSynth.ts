/**
 * KaossSynth — DISABLED.
 *
 * The Kaossilator-style audio engine has been removed. This module now
 * exports inert no-op stubs that preserve the public surface so that the
 * gesture/visualizer code paths (KaossSurface, sensors, MobileGestures)
 * continue to compile and run silently.
 *
 * If you want to bring the synth back, restore the previous implementation
 * from version control.
 */

export type PresetId =
  | "kaossLead"
  | "moogBass"
  | "acid303"
  | "supersaw"
  | "m1Pad"
  | "junoString"
  | "pluck";

export const PRESETS: { id: PresetId; label: string; tag: string }[] = [
  { id: "kaossLead",  label: "KAOSS LEAD",  tag: "—" },
  { id: "moogBass",   label: "MOOG BASS",   tag: "—" },
  { id: "acid303",    label: "303 ACID",    tag: "—" },
  { id: "supersaw",   label: "SUPERSAW",    tag: "—" },
  { id: "m1Pad",      label: "M1 PAD",      tag: "—" },
  { id: "junoString", label: "JUNO STRING", tag: "—" },
  { id: "pluck",      label: "PLUCK",       tag: "—" },
];

export type ScaleId = "pentatonic" | "major" | "minor" | "blues" | "chromatic";

export const SCALES: { id: ScaleId; label: string; intervals: number[] }[] = [
  { id: "pentatonic", label: "PENTATONIC", intervals: [0, 2, 4, 7, 9] },
  { id: "major",      label: "MAJOR",      intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "minor",      label: "MINOR",      intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "blues",      label: "BLUES",      intervals: [0, 3, 5, 6, 7, 10] },
  { id: "chromatic",  label: "CHROMATIC",  intervals: [0,1,2,3,4,5,6,7,8,9,10,11] },
];

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export function noteName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${n}${oct}`;
}

export function quantize(x: number, scale: ScaleId, rootMidi: number, octaves = 3): number {
  const intervals = SCALES.find(s => s.id === scale)!.intervals;
  const total = intervals.length * octaves;
  const idx = Math.min(total - 1, Math.max(0, Math.floor(x * total)));
  const oct = Math.floor(idx / intervals.length);
  const step = intervals[idx % intervals.length];
  return rootMidi + oct * 12 + step;
}

/** Inert voice handle — kept so callers that hold a reference still type-check. */
export type Voice = { nodes: AudioNode[]; stop: (when?: number) => void };

class KaossSynthStub {
  ctx: AudioContext | null = null;
  enabled = false;
  preset: PresetId = "kaossLead";

  async ensureCtx(): Promise<AudioContext | null> { return null; }
  setEnabled(_b: boolean) {}
  setPreset(_p: PresetId) {}
  setReverb(_w: number) {}
  setBendCents(_c: number) {}
  setMasterGain(_g: number) {}
  level(): number { return 0; }
  trigger(_midi: number, _cutoff01 = 0.6, _vel = 0.85, _sustain = false): Voice | null { return null; }
  updateVoice(_v: Voice | null, _midi: number, _cutoff01: number) {}
  release(_v: Voice | null) {}
  allOff() {}
}

export const kaossSynth = new KaossSynthStub();
