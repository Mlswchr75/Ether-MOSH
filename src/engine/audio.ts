/**
 * Audio analysis singleton. Feeds the modulator system with smoothed
 * bass / mid / treble / overall levels plus a beat envelope, from either the
 * microphone or tab/system audio (getDisplayMedia). Everything is polled from
 * the render loop — no React state, no per-frame allocations.
 */
export type AudioLevels = {
  bass: number;
  mid: number;
  treble: number;
  overall: number;
  /** 1 on a detected onset, decaying to 0 */
  beat: number;
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private bins: Uint8Array = new Uint8Array(0);
  private prevBass = 0;
  private beatEnv = 0;
  private lastBeatAt = 0;

  readonly levels: AudioLevels = { bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 };
  sensitivity = 1;

  get active() { return this.analyser != null; }

  async startMic(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.attach(stream);
  }

  /** Tab / system audio via screen share (audio-only use; video track is dropped). */
  async startSystemAudio(): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stream.getVideoTracks().forEach(t => t.stop());
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error("no audio track shared");
    }
    this.attach(stream);
  }

  private attach(stream: MediaStream) {
    this.stop();
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.sourceNode = this.ctx.createMediaStreamSource(stream);
    this.sourceNode.connect(this.analyser);
    this.stream = stream;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    void this.ctx.resume();
  }

  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.sourceNode?.disconnect();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.stream = null;
    this.levels.bass = this.levels.mid = this.levels.treble = this.levels.overall = this.levels.beat = 0;
  }

  /** Call once per frame from the render loop. */
  update(now: number) {
    if (!this.analyser || !this.ctx) return;
    this.analyser.getByteFrequencyData(this.bins as Uint8Array<ArrayBuffer>);
    const nyquist = this.ctx.sampleRate / 2;
    const hzPerBin = nyquist / this.bins.length;
    const avg = (loHz: number, hiHz: number) => {
      const lo = Math.max(0, Math.floor(loHz / hzPerBin));
      const hi = Math.min(this.bins.length - 1, Math.ceil(hiHz / hzPerBin));
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += this.bins[i];
      return sum / ((hi - lo + 1) * 255);
    };

    const k = Math.max(0.2, Math.min(3, this.sensitivity));
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    this.levels.bass = clamp01(avg(20, 140) * k);
    this.levels.mid = clamp01(avg(140, 2200) * k);
    this.levels.treble = clamp01(avg(2200, 9000) * k * 1.4);
    this.levels.overall = clamp01(avg(20, 9000) * k);

    // Onset detection: bass energy jump with a refractory window.
    const flux = this.levels.bass - this.prevBass;
    this.prevBass = this.levels.bass;
    if (flux > 0.12 && this.levels.bass > 0.3 && now - this.lastBeatAt > 180) {
      this.beatEnv = 1;
      this.lastBeatAt = now;
    }
    this.beatEnv *= 0.92;
    this.levels.beat = this.beatEnv;
  }
}

export const audioEngine = new AudioEngine();
