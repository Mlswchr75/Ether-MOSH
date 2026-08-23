import { getAudioData } from "@/engine/audioAnalyzer";
import type { OverlayAudioSnapshot } from "./reactions";

type AegisAudioSources = Partial<Record<"bass" | "mid" | "treble" | "overall" | "beat", number>>;

/**
 * GlCanvas already samples whichever reactive source is active (microphone,
 * shared system/tab audio, or the theme track) and publishes the normalized
 * values once per render frame. Overlay REACT reads that bus instead of
 * starting another analyser or calling MicAnalyzer.level() a second time.
 *
 * System/tab audio also has its lightweight singleton analyser; taking the
 * maximum keeps overlays useful during the brief handoff before GlCanvas has
 * published its first active-source frame.
 */
export function getOverlayAudioData(): OverlayAudioSnapshot {
  const live = ((window as unknown as { __aegisAudioSources?: AegisAudioSources }).__aegisAudioSources ?? {});
  const system = getAudioData();
  return {
    bass: Math.max(live.bass ?? 0, system.bass),
    mid: Math.max(live.mid ?? 0, system.mid),
    treble: Math.max(live.treble ?? 0, system.high),
    overall: Math.max(live.overall ?? 0, system.energy),
    beat: Math.max(live.beat ?? 0, system.beat),
  };
}
