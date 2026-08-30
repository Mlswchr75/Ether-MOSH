import {
  requestMicrophoneStream,
  type AudioInputChannel,
  type AudioInputPreference,
} from "@/engine/audioInput";

/**
 * Microphone audio reactivity. Analyses the device mic and produces
 * a 0..1 envelope focused on bass / kick energy, with auto-gain so it
 * works in quiet rooms and at concert volumes alike.
 *
 * Also performs lightweight onset detection on the bass envelope to
 * estimate the BPM of whatever is playing.
 */
export class MicAnalyzer {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private routingNodes: AudioNode[] = [];
  private freqData: Uint8Array | null = null;
  private inputChannel: AudioInputChannel = "auto";
  private startGeneration = 0;
  private envelope = 0;
  private peak = 0.05; // running max for auto-gain
  enabled = false;
  sensitivity = 1; // user multiplier 0..2
  /** Active capture source: "mic" or "system" (tab/display audio). */
  source: "mic" | "system" = "mic";

  // --- BPM detection state ---
  private onsets: number[] = []; // timestamps (ms) of detected kicks
  private prevRaw = 0;
  private lastOnsetAt = 0;
  private startedAt = 0;
  /** Detected BPM (0 if not yet confident). */
  detectedBpm = 0;
  /** ms timestamp when detectedBpm last changed (for consumers). */
  detectedBpmAt = 0;

  // --- Reactive sources (smoothed 0..1) ---
  bassLevel = 0;
  midLevel = 0;
  trebleLevel = 0;
  overallLevel = 0;
  /** 24-bucket FFT band averages, 0..1 each. */
  bands = new Float32Array(24);
  /** Set true when an onset (beat) was detected this frame; cleared by consumeBeat(). */
  private beatPending = false;
  lastBeatAt = 0;

  private bandMean(start: number, end: number): number {
    const from = Math.max(0, Math.min(this.bands.length, start));
    const to = Math.max(from + 1, Math.min(this.bands.length, end));
    let sum = 0;
    for (let i = from; i < to; i++) sum += this.bands[i];
    return sum / Math.max(1, to - from);
  }

  /** Named spectrum regions consumed by the smart director. */
  get subLevel() { return this.bandMean(0, 2); }
  get kickLevel() { return this.bandMean(1, 4); }
  get lowMidLevel() { return this.bandMean(4, 8); }
  get highMidLevel() { return this.bandMean(8, 12); }
  get presenceLevel() { return this.bandMean(12, 18); }
  get energyLevel() { return this.overallLevel; }
  get centroidLevel() {
    let weighted = 0;
    let energy = 0;
    const maxIndex = Math.max(1, this.bands.length - 1);
    for (let i = 0; i < this.bands.length; i++) {
      weighted += this.bands[i] * (i / maxIndex);
      energy += this.bands[i];
    }
    return energy > 0 ? weighted / energy : 0.4;
  }

  consumeBeat(): boolean {
    if (this.beatPending) { this.beatPending = false; return true; }
    return false;
  }

  isSupported() {
    const mediaDevices = navigator.mediaDevices;
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    return typeof mediaDevices?.getUserMedia === "function" && typeof AudioContextCtor === "function";
  }

  isSystemAudioSupported() {
    return !!(navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia && (window.AudioContext || (window as any).webkitAudioContext));
  }

  async start(
    source: "mic" | "system" = "mic",
    presetStream?: MediaStream,
    options: {
      input?: Pick<AudioInputPreference, "deviceId" | "label" | "channel">;
      onInputEnded?: () => void;
    } = {},
  ): Promise<{ requestedDeviceFound: boolean; recoveredByLabel: boolean; label: string }> {
    if (this.stream) {
      return {
        requestedDeviceFound: true,
        recoveredByLabel: false,
        label: this.stream.getAudioTracks()[0]?.label || (source === "system" ? "Shared audio" : "Microphone"),
      };
    }
    const generation = ++this.startGeneration;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.source = source;
    let requestedDeviceFound = true;
    let recoveredByLabel = false;
    let stream: MediaStream;
    if (source === "system") {
      // getDisplayMedia MUST be invoked synchronously from a user gesture; the
      // caller passes the already-acquired stream in here.
      if (!presetStream) {
        throw new Error("System audio capture requires a stream from a user gesture");
      }
      stream = presetStream;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error("No audio shared — pick a tab/window and tick 'Share audio'");
      }
      // Drop video tracks — we only need audio.
      stream.getVideoTracks().forEach(t => t.stop());
      // If user stops sharing from the browser bar, auto-disable.
      audioTracks[0].addEventListener("ended", () => {
        try { (window as any).__aegisSystemAudioEnded?.(); } catch {}
      });
    } else {
      const result = await requestMicrophoneStream({
        deviceId: options.input?.deviceId ?? null,
        label: options.input?.label ?? null,
      });
      stream = result.stream;
      requestedDeviceFound = result.requestedDeviceFound;
      recoveredByLabel = result.recoveredByLabel;
    }
    // A device change or quick toggle can supersede getUserMedia while its
    // permission prompt is still resolving. Never let that stale stream seize
    // the interface after the newer request has won.
    if (generation !== this.startGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      ctx.close().catch(() => {});
      throw Object.assign(new Error("Audio start superseded"), { name: "AbortError" });
    }
    this.stream = stream;
    this.inputChannel = options.input?.channel ?? "auto";
    const audioTrack = stream.getAudioTracks()[0];
    if (source === "mic" && audioTrack && options.onInputEnded) {
      audioTrack.addEventListener("ended", () => {
        if (generation === this.startGeneration) options.onInputEnded?.();
      }, { once: true });
    }
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.connectInputChannel();
    this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.enabled = true;
    this.startedAt = performance.now();
    this.onsets = [];
    this.detectedBpm = 0;
    this.detectedBpmAt = 0;
    if (ctx.state === "suspended") await ctx.resume();
    return {
      requestedDeviceFound,
      recoveredByLabel,
      label: audioTrack?.label || (source === "system" ? "Shared audio" : "Microphone"),
    };
  }

  /** Change which side of a stereo interface drives the analyzer without
   * reopening the hardware or interrupting a live performance. */
  setInputChannel(channel: AudioInputChannel): void {
    this.inputChannel = channel;
    if (this.sourceNode && this.analyser) this.connectInputChannel();
  }

  private connectInputChannel(): void {
    const source = this.sourceNode;
    const analyser = this.analyser;
    const ctx = this.ctx;
    if (!source || !analyser || !ctx) return;
    try { source.disconnect(); } catch {}
    for (const node of this.routingNodes) {
      try { node.disconnect(); } catch {}
    }
    this.routingNodes = [];
    if (this.inputChannel === "auto") {
      source.connect(analyser);
      return;
    }
    // Two outputs are requested even for mono streams: Web Audio supplies
    // silence on a missing second channel, which is the least surprising
    // behavior when a user explicitly chooses Input 2.
    const splitter = ctx.createChannelSplitter(2);
    source.connect(splitter);
    splitter.connect(analyser, this.inputChannel === "right" ? 1 : 0);
    this.routingNodes = [splitter];
  }

  /** Resume the underlying AudioContext (after browser tab regains focus). */
  async resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch {}
    }
  }
  isSuspended(): boolean {
    return !!this.ctx && this.ctx.state === "suspended";
  }

  stop() {
    this.startGeneration++;
    this.enabled = false;
    this.envelope = 0;
    this.peak = 0.05;
    this.onsets = [];
    this.prevRaw = 0;
    this.detectedBpm = 0;
    this.bassLevel = this.midLevel = this.trebleLevel = this.overallLevel = 0;
    this.bands.fill(0);
    this.beatPending = false;
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
    }
    for (const node of this.routingNodes) {
      try { node.disconnect(); } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.analyser = null;
    this.sourceNode = null;
    this.routingNodes = [];
    this.freqData = null;
  }

  /** Returns 0..1 audio envelope. Call once per frame. */
  level(): number {
    if (!this.enabled || !this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    // Bass-weighted: take the lower ~12% of bins (kick/bass), plus a touch of mids
    const n = this.freqData.length;
    const bassEnd = Math.max(4, Math.floor(n * 0.12));
    const midEnd = Math.floor(n * 0.35);
    let bass = 0;
    for (let i = 1; i < bassEnd; i++) bass += this.freqData[i];
    bass /= (bassEnd - 1) * 255;
    let mid = 0;
    for (let i = bassEnd; i < midEnd; i++) mid += this.freqData[i];
    mid /= Math.max(1, midEnd - bassEnd) * 255;
    let treble = 0;
    for (let i = midEnd; i < n; i++) treble += this.freqData[i];
    treble /= Math.max(1, n - midEnd) * 255;
    const raw = Math.min(1, bass * 0.85 + mid * 0.25);
    const overall = Math.min(1, (bass + mid + treble) / 3);

    // Smoothed sources for audio mappings
    this.bassLevel    = this.bassLevel    + (bass    - this.bassLevel)    * 0.35;
    this.midLevel     = this.midLevel     + (mid     - this.midLevel)     * 0.35;
    this.trebleLevel  = this.trebleLevel  + (treble  - this.trebleLevel)  * 0.35;
    this.overallLevel = this.overallLevel + (overall - this.overallLevel) * 0.35;

    // 24-band averages for visualizer strip
    const bands = this.bands;
    const bucket = n / bands.length;
    for (let b = 0; b < bands.length; b++) {
      const s = Math.floor(b * bucket);
      const e = Math.floor((b + 1) * bucket);
      let sum = 0;
      for (let i = s; i < e; i++) sum += this.freqData[i];
      const v = sum / Math.max(1, e - s) / 255;
      // a bit of perceptual curve
      bands[b] = bands[b] * 0.55 + Math.pow(v, 0.85) * 0.45;
    }

    // --- Onset detection on the (pre-envelope) bass-weighted signal ---
    const now = performance.now();
    // Spectral-flux-ish: positive jump above adaptive floor
    const floor = this.peak * 0.35;
    const jump = raw - this.prevRaw;
    if (
      raw > floor &&
      jump > 0.08 &&
      now - this.lastOnsetAt > 220 // refractory: caps tempo at ~270 BPM
    ) {
      this.beatPending = true;
      this.lastBeatAt = now;
      this.onsets.push(now);
      this.lastOnsetAt = now;
      // keep last ~12s worth
      const cutoff = now - 12000;
      while (this.onsets.length && this.onsets[0] < cutoff) this.onsets.shift();
      // Re-estimate after we have ~10s of audio AND enough onsets
      if (now - this.startedAt > 9500 && this.onsets.length >= 8) {
        const bpm = this.estimateBpm();
        if (bpm > 0 && Math.abs(bpm - this.detectedBpm) >= 1) {
          this.detectedBpm = bpm;
          this.detectedBpmAt = now;
        }
      }
    }
    this.prevRaw = raw;

    // Auto-gain: track running peak so quiet rooms still produce 0..1
    this.peak = Math.max(this.peak * 0.9985, raw);
    const normalized = Math.min(1, raw / Math.max(0.05, this.peak));

    // Sensitivity curve + envelope smoothing (fast attack, slow release)
    const target = Math.min(1, Math.pow(normalized, 1.4) * this.sensitivity);
    const attack = target > this.envelope ? 0.6 : 0.12;
    this.envelope = this.envelope + (target - this.envelope) * attack;
    return this.envelope;
  }

  /** Median inter-onset interval -> BPM, folded into 70..180 range. */
  private estimateBpm(): number {
    if (this.onsets.length < 4) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < this.onsets.length; i++) {
      intervals.push(this.onsets[i] - this.onsets[i - 1]);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (!median) return 0;
    let bpm = 60000 / median;
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    // Snap to integer
    bpm = Math.round(bpm);
    if (bpm < 40 || bpm > 240) return 0;
    return bpm;
  }
}
