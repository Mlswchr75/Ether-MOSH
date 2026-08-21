/**
 * Theme-track playback + analysis.
 *
 * Mirrors MicAnalyzer's full public surface (mic.ts) field-for-field —
 * bassLevel/midLevel/trebleLevel/overallLevel, the 24-band spectrum, the
 * band-mean getters (subLevel..centroidLevel), lastBeatAt, level(),
 * consumeBeat() — so every consumer that already accepts a MicAnalyzer
 * (GlCanvas's `sources` map, Pattern Forge's `JourneyMic`, audioMapping's
 * `bandsFrom`) accepts this as a drop-in substitute with no changes on
 * their side beyond choosing which instance to read from.
 *
 * The difference is the source: an HTMLAudioElement routed through
 * AnalyserNode instead of getUserMedia. Module-scoped singleton (like
 * kaossSynth / timeController elsewhere in this codebase) so the element,
 * its AudioContext and its playback position all survive route changes
 * between the title screen, the editor and Pattern Forge.
 */

/** Public default track. Ships as a static asset — see README for how to
 *  swap it (upload a new file at this path and it takes over automatically). */
export const DEFAULT_TRACK_URL = "/audio/theme.mp3";
export const DEFAULT_TRACK_TITLE = "Miyazaki Demo";
export const DEFAULT_TRACK_ARTIST = "Aesthetic Rebellion";

/**
 * `setSource`'s `url` only ever arrives as `URL.createObjectURL()` on a
 * locally-selected audio File (HotTriggers' file input) or this module's own
 * same-origin DEFAULT_TRACK_URL constant — never a remote or user-typed
 * string. CodeQL's js/xss-through-dom query flags any `File`-derived string
 * reaching a `.src` sink regardless of that guarantee, since it doesn't model
 * `createObjectURL`'s opaque blob: output; asserting the shape here is what
 * actually stands between a future refactor and a real open redirect.
 */
function assertSafeTrackUrl(url: string): string {
  if (!url.startsWith("blob:") && url !== DEFAULT_TRACK_URL) {
    throw new Error("Expected an object URL or the default track path");
  }
  return url;
}

class TrackPlayer {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private envelope = 0;
  private peak = 0.05;
  /** True once playback has actually started at least once — distinguishes
   *  the very first play() (start from the top) from every later entry into
   *  a mode (jump to a fresh point). */
  private everPlayed = false;

  enabled = false;
  volume = 0.75;
  title = DEFAULT_TRACK_TITLE;
  artist = DEFAULT_TRACK_ARTIST;
  private url = DEFAULT_TRACK_URL;

  // --- Reactive sources (smoothed 0..1) — same shape as MicAnalyzer ---
  bassLevel = 0;
  midLevel = 0;
  trebleLevel = 0;
  overallLevel = 0;
  bands = new Float32Array(24);
  lastBeatAt = 0;
  /** Detected BPM (0 if not yet confident) — same onset-median estimate as MicAnalyzer. */
  detectedBpm = 0;
  detectedBpmAt = 0;
  private startedAt = 0;

  private onsets: number[] = [];
  private prevRaw = 0;
  private lastOnsetAt = 0;
  private beatPending = false;

  private bandMean(start: number, end: number): number {
    const from = Math.max(0, Math.min(this.bands.length, start));
    const to = Math.max(from + 1, Math.min(this.bands.length, end));
    let sum = 0;
    for (let i = from; i < to; i++) sum += this.bands[i];
    return sum / Math.max(1, to - from);
  }

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

  private ensure() {
    if (!this.el) {
      const el = new Audio();
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      el.loop = true;
      el.src = this.url;
      this.el = el;
    }
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.el);
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.55;
      src.connect(this.analyser);
      src.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }
  }

  /** Swap the active track (e.g. a user-uploaded file). Keeps playing through
   *  the swap if it was already playing. */
  async setSource(url: string, title: string, artist = "") {
    this.url = url;
    this.title = title;
    this.artist = artist;
    this.ensure();
    const wasPlaying = this.enabled;
    // lgtm[js/xss-through-dom] -- always a local blob: object URL or the
    // hardcoded DEFAULT_TRACK_URL; see assertSafeTrackUrl's doc comment.
    if (this.el) this.el.src = assertSafeTrackUrl(url);
    if (wasPlaying) await this.play();
  }

  /** Restore the bundled default track. */
  async useDefaultTrack() {
    await this.setSource(DEFAULT_TRACK_URL, DEFAULT_TRACK_TITLE, DEFAULT_TRACK_ARTIST);
  }

  duration(): number {
    return this.el?.duration && isFinite(this.el.duration) ? this.el.duration : 0;
  }

  /**
   * Jump to a musically-sensible point: skip the first/last 5% (intro / tail
   * fade), split what's left into 8 segments, drop into a random one, and
   * fade the gain back in so the cut isn't audible as a pop.
   */
  seekToRandomSensiblePoint() {
    const d = this.duration();
    if (!d || !this.el) return;
    const start = d * 0.05;
    const end = d * 0.95;
    const seg = (end - start) / 8;
    const idx = Math.floor(Math.random() * 8);
    try { this.el.currentTime = start + seg * idx; } catch {}
    this.fadeTo(this.volume, 0.6, 0.0001);
  }

  /**
   * Called by each page (title screen / editor / forge) on mount. The first
   * call after a real play() just lets the track continue undisturbed; every
   * call after that (a fresh entry into a mode, with the track already
   * running) jumps to a new drop-in point so switching modes feels like the
   * song picked a new place, not a loop of the same ten seconds.
   */
  noteModeEntry() {
    if (!this.enabled) return;
    if (!this.everPlayed) { this.everPlayed = true; return; }
    this.seekToRandomSensiblePoint();
  }

  private fadeTo(target: number, seconds: number, from?: number) {
    if (!this.ctx || !this.gain) return;
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(from ?? g.value, now);
      g.linearRampToValueAtTime(target, now + Math.max(0.01, seconds));
    } catch {}
  }

  async play() {
    this.ensure();
    if (this.ctx?.state === "suspended") { try { await this.ctx.resume(); } catch {} }
    await this.el?.play();
    this.enabled = true;
    this.everPlayed = true;
    if (!this.startedAt) this.startedAt = performance.now();
    this.fadeTo(this.volume, 0.5, 0.0001);
  }

  pause() {
    this.enabled = false;
    try { this.el?.pause(); } catch {}
    this.bassLevel = this.midLevel = this.trebleLevel = this.overallLevel = 0;
    this.envelope = 0;
    this.bands.fill(0);
    this.beatPending = false;
    this.onsets = [];
    this.detectedBpm = 0;
    this.startedAt = 0;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  /** Full teardown — used by "clear all audio". A fresh play() after this
   *  rebuilds the AudioContext from scratch. */
  dispose() {
    this.pause();
    this.everPlayed = false;
    if (this.el) { try { this.el.src = ""; } catch {} }
    this.el = null;
    if (this.ctx) { try { this.ctx.close(); } catch {} }
    this.ctx = null;
    this.gain = null;
    this.analyser = null;
    this.freqData = null;
    this.url = DEFAULT_TRACK_URL;
    this.title = DEFAULT_TRACK_TITLE;
    this.artist = DEFAULT_TRACK_ARTIST;
  }

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") { try { await this.ctx.resume(); } catch {} }
  }
  isSuspended(): boolean {
    return !!this.ctx && this.ctx.state === "suspended";
  }

  /** Same bass/mid/treble/onset analysis as MicAnalyzer.level(), sourced from
   *  the track's AnalyserNode instead of a mic stream. Call once per frame. */
  level(): number {
    if (!this.enabled || !this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
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

    this.bassLevel += (bass - this.bassLevel) * 0.35;
    this.midLevel += (mid - this.midLevel) * 0.35;
    this.trebleLevel += (treble - this.trebleLevel) * 0.35;
    this.overallLevel += (overall - this.overallLevel) * 0.35;

    const bands = this.bands;
    const bucket = n / bands.length;
    for (let b = 0; b < bands.length; b++) {
      const s = Math.floor(b * bucket);
      const e = Math.floor((b + 1) * bucket);
      let sum = 0;
      for (let i = s; i < e; i++) sum += this.freqData[i];
      const v = sum / Math.max(1, e - s) / 255;
      bands[b] = bands[b] * 0.55 + Math.pow(v, 0.85) * 0.45;
    }

    const now = performance.now();
    const floor = this.peak * 0.35;
    const jump = raw - this.prevRaw;
    if (raw > floor && jump > 0.08 && now - this.lastOnsetAt > 220) {
      this.beatPending = true;
      this.lastBeatAt = now;
      this.onsets.push(now);
      this.lastOnsetAt = now;
      const cutoff = now - 12000;
      while (this.onsets.length && this.onsets[0] < cutoff) this.onsets.shift();
      if (now - this.startedAt > 9500 && this.onsets.length >= 8) {
        const bpm = this.estimateBpm();
        if (bpm > 0 && Math.abs(bpm - this.detectedBpm) >= 1) {
          this.detectedBpm = bpm;
          this.detectedBpmAt = now;
        }
      }
    }
    this.prevRaw = raw;

    this.peak = Math.max(this.peak * 0.9985, raw);
    const normalized = Math.min(1, raw / Math.max(0.05, this.peak));
    const target = Math.min(1, Math.pow(normalized, 1.4));
    const attack = target > this.envelope ? 0.6 : 0.12;
    this.envelope = this.envelope + (target - this.envelope) * attack;
    return this.envelope;
  }

  /** Median inter-onset interval -> BPM, folded into 70..180 range. Same
   *  approach as MicAnalyzer.estimateBpm(). */
  private estimateBpm(): number {
    if (this.onsets.length < 4) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < this.onsets.length; i++) intervals.push(this.onsets[i] - this.onsets[i - 1]);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (!median) return 0;
    let bpm = 60000 / median;
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    bpm = Math.round(bpm);
    return bpm >= 40 && bpm <= 240 ? bpm : 0;
  }
}

export const trackPlayer = new TrackPlayer();
