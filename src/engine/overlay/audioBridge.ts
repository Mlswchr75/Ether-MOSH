import { getAudioData } from "@/engine/audioAnalyzer";
import { MicAnalyzer } from "@/engine/mic";
import { trackPlayer } from "@/engine/trackPlayer";
import type { OverlayAudioSnapshot } from "./reactions";

let installed = false;
let micAt = 0;
let micSnapshot: OverlayAudioSnapshot = { bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 };

/**
 * Captures the levels GlCanvas already computes from its private MicAnalyzer.
 * This is intentionally a one-time prototype wrapper: it does not create an
 * AudioContext, request permissions, or run another FFT. Removing Sticker Mode
 * leaves the ordinary MicAnalyzer behavior unchanged apart from a few scalar
 * assignments after each existing `level()` call.
 */
export function installOverlayMicBridge(): void {
  if (installed) return;
  installed = true;
  const original = MicAnalyzer.prototype.level;
  MicAnalyzer.prototype.level = function overlayAwareLevel(this: MicAnalyzer): number {
    const overall = original.call(this);
    const now = performance.now();
    const beatAge = Math.max(0, now - this.lastBeatAt);
    micSnapshot = {
      bass: this.bassLevel,
      mid: this.midLevel,
      treble: this.trebleLevel,
      overall: Math.max(this.overallLevel, overall),
      beat: Math.max(0, 1 - beatAge / 300),
    };
    micAt = now;
    return overall;
  };
}

export function getOverlayAudioData(): OverlayAudioSnapshot {
  const system = getAudioData();
  const now = performance.now();
  const micFresh = now - micAt < 650;
  const mic = micFresh ? micSnapshot : { bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 };
  const trackBeat = Math.max(0, 1 - Math.max(0, now - trackPlayer.lastBeatAt) / 300);
  const track = trackPlayer.enabled ? {
    bass: trackPlayer.bassLevel,
    mid: trackPlayer.midLevel,
    treble: trackPlayer.trebleLevel,
    overall: trackPlayer.overallLevel,
    beat: trackBeat,
  } : { bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 };

  return {
    bass: Math.max(system.bass, mic.bass, track.bass),
    mid: Math.max(system.mid, mic.mid, track.mid),
    treble: Math.max(system.high, mic.treble, track.treble),
    overall: Math.max(system.energy, mic.overall, track.overall),
    beat: Math.max(system.beat, mic.beat, track.beat),
  };
}

installOverlayMicBridge();
