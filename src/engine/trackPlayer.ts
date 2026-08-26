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

export type ShowcaseTrack = { id: string; url: string; title: string; artist: string };

/**
 * The showcase library — every track offered from the theme-track panel's
 * showcase list, not just the one bundled default.
 *
 * Deliberately a hardcoded array literal, not a manifest fetched at runtime:
 * assertSafeTrackUrl below only accepts a URL that's either a local blob: or
 * a member of this exact list, and that guarantee only holds if the list
 * itself is compile-time-known — a JSON file loaded over the network would
 * put arbitrary-at-runtime strings back into a `.src` sink, exactly what
 * assertSafeTrackUrl exists to rule out. See its own doc comment.
 *
 * To add a showcase track: drop the mp3 in public/audio/ and add a row here
 * with a matching url. Nothing else needs to change — the panel in
 * HotTriggers.tsx renders this list directly.
 */
export const SHOWCASE_TRACKS: ShowcaseTrack[] = [
  { id: "theme", url: DEFAULT_TRACK_URL, title: DEFAULT_TRACK_TITLE, artist: DEFAULT_TRACK_ARTIST },
  { id: "blackbox-psalm", url: "/audio/Blackbox Psalm.mp3", title: "Blackbox Psalm", artist: "MOSH" },
  { id: "corrupted-ivory", url: "/audio/Corrupted Ivory.mp3", title: "Corrupted Ivory", artist: "MOSH" },
  { id: "cybernetic-metamorphosis", url: "/audio/Cybernetic Metamorphosis.mp3", title: "Cybernetic Metamorphosis", artist: "MOSH" },
  { id: "iron-lament", url: "/audio/Iron Lament.mp3", title: "Iron Lament", artist: "MOSH" },
  { id: "iron-liturgy-reimagined", url: "/audio/Iron Liturgy (Reimagined).mp3", title: "Iron Liturgy (Reimagined)", artist: "MOSH" },
  { id: "iron-lullaby", url: "/audio/Iron Lullaby.mp3", title: "Iron Lullaby", artist: "MOSH" },
  { id: "iron-requiem", url: "/audio/Iron Requiem.mp3", title: "Iron Requiem", artist: "MOSH" },
  { id: "iron-waltz", url: "/audio/Iron Waltz.mp3", title: "Iron Waltz", artist: "MOSH" },
  { id: "ivory-protocol", url: "/audio/Ivory Protocol.mp3", title: "Ivory Protocol", artist: "MOSH" },
  { id: "jitterbug", url: "/audio/Jitterbug.mp3", title: "Jitterbug", artist: "MOSH" },
  { id: "long-desired", url: "/audio/Long Desired.mp3", title: "Long Desired", artist: "MOSH" },
  { id: "mechanical-requiem-guitar-cover", url: "/audio/Mechanical Requiem (Guitar Cover) (Cover).mp3", title: "Mechanical Requiem — Guitar Cover", artist: "MOSH" },
  { id: "mechanical-requiem", url: "/audio/Mechanical Requiem.mp3", title: "Mechanical Requiem", artist: "MOSH" },
  { id: "motor-spit", url: "/audio/Motor Spit.mp3", title: "Motor Spit", artist: "MOSH" },
  { id: "plex-on-em", url: "/audio/Plex On Em.mp3", title: "Plex On Em", artist: "MOSH" },
  { id: "restitude", url: "/audio/Restitude.mp3", title: "Restitude", artist: "MOSH" },
  { id: "retro-clay-bouncehouse", url: "/audio/Retro Clay Bouncehouse.mp3", title: "Retro Clay Bouncehouse", artist: "MOSH" },
  { id: "synthetic-requiem", url: "/audio/Synthetic Requiem.mp3", title: "Synthetic Requiem", artist: "MOSH" },
  { id: "terminal-decay", url: "/audio/Terminal Decay.mp3", title: "Terminal Decay", artist: "MOSH" },
  { id: "cold-rite", url: "/audio/The Cold Rite.mp3", title: "The Cold Rite", artist: "MOSH" },
  { id: "silent-steppe", url: "/audio/The Silent Steppe.mp3", title: "The Silent Steppe", artist: "MOSH" },
  { id: "still-point", url: "/audio/The Still Point.mp3", title: "The Still Point", artist: "MOSH" },
];

/**
 * `setSource`'s `url` only ever arrives as `URL.createObjectURL()` on a
 * locally-selected audio File (HotTriggers' file input) or one of this
 * module's own same-origin SHOWCASE_TRACKS paths — never a remote or
 * user-typed string. CodeQL's js/xss-through-dom query flags any
 * `File`-derived string reaching a `.src` sink regardless of that guarantee,
 * since it doesn't model `createObjectURL`'s opaque blob: output; asserting
 * the shape here is what actually stands between a future refactor and a
 * real open redirect.
 */
function assertSafeTrackUrl(url: string): string {
  const known = url.startsWith("blob:") || SHOWCASE_TRACKS.some(t => t.url === url);
  if (!known) {
    throw new Error("Expected an object URL or a known showcase track path");
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
      this.setupMediaSession();
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

  /**
   * Hooks the Media Session API — real OS/hardware media keys (dedicated
   * keyboard media keys, Bluetooth headphone/earbud controls, the OS media
   * overlay and lock-screen controls on mobile) — up to the same actions the
   * in-app controls use. Guarded: not every browser implements this (older
   * Safari desktop notably didn't), so this is additive, never required for
   * play/pause/next/prev to work — the on-screen buttons and `[`/`]`/`\`
   * keyboard shortcuts work regardless of MediaSession support.
   */
  private setupMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("play", () => { this.play(); });
      navigator.mediaSession.setActionHandler("pause", () => { this.pause(); });
      navigator.mediaSession.setActionHandler("previoustrack", () => { this.prevShowcaseTrack(); });
      navigator.mediaSession.setActionHandler("nexttrack", () => { this.nextShowcaseTrack(); });
    } catch {
      // Some browsers implement the interface but throw on unsupported
      // actions (e.g. previoustrack/nexttrack) — play/pause still get set.
    }
  }

  private updateMediaSessionMetadata() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: this.title, artist: this.artist });
    } catch {}
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
    this.updateMediaSessionMetadata();
    if (wasPlaying) await this.play();
  }

  /** Restore the bundled default track. */
  async useDefaultTrack() {
    await this.setSource(DEFAULT_TRACK_URL, DEFAULT_TRACK_TITLE, DEFAULT_TRACK_ARTIST);
  }

  /** Load one of the bundled showcase tracks (see SHOWCASE_TRACKS) by id. */
  async useShowcaseTrack(id: string) {
    const t = SHOWCASE_TRACKS.find(x => x.id === id);
    if (!t) return;
    await this.setSource(t.url, t.title, t.artist);
  }

  /** Index of the current track within SHOWCASE_TRACKS, or -1 if the active
   *  track isn't one of them (e.g. a user-uploaded file via "browse file"). */
  private showcaseIndex(): number {
    return SHOWCASE_TRACKS.findIndex(t => t.url === this.url);
  }

  /** Advances to the next showcase track, wrapping around. From a
   *  non-showcase track (an uploaded file), starts at the first one. Always
   *  ends up playing, matching ordinary media-player "next" semantics. */
  async nextShowcaseTrack() {
    if (!SHOWCASE_TRACKS.length) return;
    const i = this.showcaseIndex();
    const t = SHOWCASE_TRACKS[i === -1 ? 0 : (i + 1) % SHOWCASE_TRACKS.length];
    await this.setSource(t.url, t.title, t.artist);
    await this.play();
  }

  /** Same as nextShowcaseTrack, backwards. From a non-showcase track, starts
   *  at the last one. */
  async prevShowcaseTrack() {
    if (!SHOWCASE_TRACKS.length) return;
    const i = this.showcaseIndex();
    const t = SHOWCASE_TRACKS[i === -1 ? SHOWCASE_TRACKS.length - 1 : (i - 1 + SHOWCASE_TRACKS.length) % SHOWCASE_TRACKS.length];
    await this.setSource(t.url, t.title, t.artist);
    await this.play();
  }

  /** Jumps to a random *different* showcase track (never repeats the one
   *  already playing, unless it's the only one available). */
  async shuffleShowcaseTrack() {
    if (!SHOWCASE_TRACKS.length) return;
    if (SHOWCASE_TRACKS.length === 1) {
      const only = SHOWCASE_TRACKS[0];
      await this.setSource(only.url, only.title, only.artist);
      await this.play();
      return;
    }
    const i = this.showcaseIndex();
    let idx = i;
    while (idx === i) idx = Math.floor(Math.random() * SHOWCASE_TRACKS.length);
    const t = SHOWCASE_TRACKS[idx];
    await this.setSource(t.url, t.title, t.artist);
    await this.play();
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

  private playInFlight: Promise<void> | null = null;

  /**
   * Coalesces concurrent callers onto the same attempt instead of firing a
   * second el.play() while one is still in flight.
   *
   * This matters because HTMLMediaElement aborts an in-progress play() with
   * "interrupted by a new load request" (or by a second play()) when
   * another one lands on top of it — and setSource() calling play()
   * internally to keep a track switch playing through, followed by a
   * caller *also* calling play() right after (every current call site does
   * this — the Play button's store action, "browse file", each showcase
   * track), is exactly that pattern. On some browser/OS combinations that
   * interruption doesn't reject cleanly, it leaves the returned promise
   * hanging — wedging whatever awaited it with no error and no recovery
   * short of a page reload. This is the reported "freezes, have to
   * force-quit."
   */
  async play(): Promise<void> {
    if (this.playInFlight) return this.playInFlight;
    this.playInFlight = this.doPlay().finally(() => { this.playInFlight = null; });
    return this.playInFlight;
  }

  private async doPlay(): Promise<void> {
    this.ensure();
    if (this.ctx?.state === "suspended") { try { await this.ctx.resume(); } catch {} }
    // Belt-and-suspenders for the same hang: even a *single*, uncontested
    // el.play() call can fail to ever settle on some platforms. 6s is
    // generous for a local same-origin file — past that the browser isn't
    // going to resolve it on its own, so time out and let the caller's
    // existing error handling (toast + state reset) recover instead of
    // hanging forever.
    await Promise.race([
      this.el!.play(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("track play() timed out")), 6_000);
      }),
    ]);
    this.enabled = true;
    this.everPlayed = true;
    if (!this.startedAt) this.startedAt = performance.now();
    this.fadeTo(this.volume, 0.5, 0.0001);
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = "playing"; } catch {}
    }
  }

  pause() {
    this.enabled = false;
    try { this.el?.pause(); } catch {}
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = "paused"; } catch {}
    }
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
