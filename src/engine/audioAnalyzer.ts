/**
 * Lightweight singleton FFT analyzer fed by the system-audio MediaStream
 * captured via `getDisplayMedia` (see systemAudio.ts). Runs alongside the
 * richer MicAnalyzer so any code path can pull a simple { bass, mid, high,
 * energy, beat } snapshot without touching the store.
 */
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array | null = null;
let rafId: number | null = null;
let monitorGain: GainNode | null = null;

let _bass = 0, _mid = 0, _high = 0, _energy = 0, _beat = 0;
let _rollingEnergy = 0, _lastBeatTime = 0;

export function startAnalyzer(stream: MediaStream): void {
  stopAnalyzer();
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  const source = audioCtx!.createMediaStreamSource(stream);
  analyser = audioCtx!.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);
  // Also route the captured audio to the speakers so it's audible in THIS
  // tab. Without this, Chrome tab-casting (Cast this tab) sends silence —
  // MOSH would only be analyzing, not playing. Default gain is read from
  // localStorage so the user can mute monitoring if they're listening
  // directly to the source.
  monitorGain = audioCtx!.createGain();
  const saved = parseFloat(localStorage.getItem("mosh.audioMonitorGain") || "1");
  monitorGain.gain.value = isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 1;
  source.connect(monitorGain);
  monitorGain.connect(audioCtx!.destination);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  tick();
}

export function setAudioMonitorGain(value: number): void {
  const v = Math.max(0, Math.min(1, value));
  localStorage.setItem("mosh.audioMonitorGain", String(v));
  if (monitorGain) monitorGain.gain.value = v;
}

export function getAudioMonitorGain(): number {
  if (monitorGain) return monitorGain.gain.value;
  const saved = parseFloat(localStorage.getItem("mosh.audioMonitorGain") || "1");
  return isFinite(saved) ? saved : 1;
}

export function stopAnalyzer(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  if (audioCtx) {
    try { audioCtx.close(); } catch {}
  }
  audioCtx = null;
  analyser = null;
  dataArray = null;
  rafId = null;
  monitorGain = null;
  _bass = _mid = _high = _energy = _beat = _rollingEnergy = 0;
}

// Indexed loops instead of Array.from(dataArray.slice(...)) — the slice+
// Array.from pair allocated three fresh arrays every animation frame for the
// life of the session, pure GC pressure for no benefit over summing in place.
function bandAverage(data: Uint8Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i];
  return sum / (to - from) / 255;
}

function tick(): void {
  if (!analyser || !dataArray) return;
  rafId = requestAnimationFrame(tick);
  analyser.getByteFrequencyData(dataArray as any);
  _bass = bandAverage(dataArray, 0, 5);
  _mid  = bandAverage(dataArray, 5, 21);
  _high = bandAverage(dataArray, 21, 64);
  _energy = _bass * 0.5 + _mid * 0.3 + _high * 0.2;
  _rollingEnergy = _rollingEnergy * 0.95 + _energy * 0.05;
  const now = performance.now();
  if (_energy > _rollingEnergy * 1.5 && now - _lastBeatTime > 180) {
    _lastBeatTime = now;
  }
  _beat = Math.max(0, 1 - (performance.now() - _lastBeatTime) / 300);
}

export function getAudioData() {
  return { bass: _bass, mid: _mid, high: _high, energy: _energy, beat: _beat };
}
