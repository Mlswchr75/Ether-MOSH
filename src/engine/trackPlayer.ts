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
 * Where a listener goes when a track makes them want more.
 *
 * A station that plays for six hours and offers no way to follow the artist is
 * a nice screensaver. This is the difference between a wall and a funnel.
 */
export const ARTIST_SOUNDCLOUD_URL = "https://soundcloud.com/dyles-mavis";

export type ShowcaseTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  /** Free-form station tags. Radio (`/radio?station=catalog`) filters the
   *  rotation on these — see docs/RADIO_MODE.md. */
  tags?: readonly string[];
  /** This track's own page, when it has one. Absent means the now-playing card
   *  links to the artist profile instead — always somewhere, never nowhere. */
  soundcloudUrl?: string;
};
export type TrackCue = {
  at: number;
  label: "drop" | "break" | "transition" | "peak" | "pulse";
};

/**
 * Hand-saved drop-in points derived from local waveform + spectral-change
 * analysis of every bundled showcase song. Keeping these in source control
 * makes random starts repeatable, reviewable, and independent of a network
 * analysis service. See scripts/analyze-track-cues.py to regenerate them.
 */
export const TRACK_CUES: Record<string, readonly TrackCue[]> = {
  "theme": [{ at: 25.0, label: "drop" }, { at: 91.5, label: "transition" }, { at: 191.5, label: "drop" }, { at: 283.5, label: "break" }, { at: 302.5, label: "transition" }],
  "blackbox-psalm": [{ at: 27.0, label: "drop" }, { at: 62.5, label: "pulse" }, { at: 88.0, label: "transition" }, { at: 117.0, label: "break" }, { at: 152.0, label: "break" }],
  "corrupted-ivory": [{ at: 11.5, label: "drop" }, { at: 59.5, label: "transition" }, { at: 63.0, label: "transition" }, { at: 98.5, label: "transition" }, { at: 130.0, label: "break" }],
  "cybernetic-metamorphosis": [{ at: 15.0, label: "drop" }, { at: 54.0, label: "drop" }, { at: 85.5, label: "drop" }, { at: 116.5, label: "drop" }, { at: 144.5, label: "break" }],
  "iron-lament": [{ at: 23.5, label: "drop" }, { at: 59.5, label: "break" }, { at: 83.5, label: "drop" }, { at: 131.5, label: "transition" }, { at: 155.5, label: "break" }],
  "iron-liturgy-reimagined": [{ at: 33.5, label: "transition" }, { at: 48.5, label: "drop" }, { at: 65.5, label: "drop" }, { at: 91.5, label: "break" }, { at: 127.0, label: "drop" }],
  "iron-lullaby": [{ at: 11.0, label: "transition" }, { at: 56.0, label: "break" }, { at: 84.0, label: "drop" }, { at: 119.0, label: "transition" }, { at: 155.5, label: "break" }],
  "iron-requiem": [{ at: 26.0, label: "drop" }, { at: 53.5, label: "transition" }, { at: 96.5, label: "drop" }, { at: 131.0, label: "transition" }, { at: 143.0, label: "break" }],
  "iron-waltz": [{ at: 8.5, label: "pulse" }, { at: 62.0, label: "transition" }, { at: 95.5, label: "drop" }, { at: 119.5, label: "transition" }, { at: 156.0, label: "break" }],
  "ivory-protocol": [{ at: 33.0, label: "drop" }, { at: 48.5, label: "drop" }, { at: 80.0, label: "transition" }, { at: 112.0, label: "transition" }, { at: 143.0, label: "transition" }],
  "jitterbug": [{ at: 27.5, label: "transition" }, { at: 50.0, label: "pulse" }, { at: 112.0, label: "drop" }, { at: 150.0, label: "pulse" }, { at: 188.5, label: "transition" }],
  "long-desired": [{ at: 9.5, label: "drop" }, { at: 59.0, label: "transition" }, { at: 99.0, label: "drop" }, { at: 138.0, label: "drop" }, { at: 177.5, label: "drop" }],
  "mechanical-requiem-guitar-cover": [{ at: 23.0, label: "break" }, { at: 37.5, label: "pulse" }, { at: 85.0, label: "drop" }, { at: 102.5, label: "transition" }],
  "mechanical-requiem": [{ at: 26.0, label: "drop" }, { at: 66.5, label: "transition" }, { at: 85.5, label: "drop" }, { at: 116.0, label: "transition" }, { at: 154.0, label: "break" }],
  "motor-spit": [{ at: 29.5, label: "drop" }, { at: 54.5, label: "transition" }, { at: 99.5, label: "transition" }, { at: 120.5, label: "transition" }, { at: 142.5, label: "pulse" }],
  "plex-on-em": [{ at: 17.5, label: "transition" }, { at: 56.5, label: "transition" }, { at: 116.5, label: "break" }, { at: 122.0, label: "drop" }, { at: 190.0, label: "break" }],
  "restitude": [{ at: 15.0, label: "transition" }, { at: 67.5, label: "transition" }, { at: 88.0, label: "break" }, { at: 137.5, label: "break" }, { at: 164.0, label: "break" }],
  "retro-clay-bouncehouse": [{ at: 26.5, label: "drop" }, { at: 55.5, label: "transition" }, { at: 87.0, label: "drop" }, { at: 120.5, label: "transition" }, { at: 148.0, label: "break" }],
  "synthetic-requiem": [{ at: 27.0, label: "drop" }, { at: 55.5, label: "drop" }, { at: 82.5, label: "transition" }, { at: 134.5, label: "break" }, { at: 161.5, label: "break" }],
  "terminal-decay": [{ at: 18.0, label: "drop" }, { at: 54.0, label: "drop" }, { at: 72.0, label: "drop" }, { at: 120.0, label: "drop" }, { at: 161.5, label: "transition" }],
  "cold-rite": [{ at: 27.0, label: "transition" }, { at: 41.0, label: "drop" }, { at: 87.0, label: "transition" }, { at: 111.0, label: "pulse" }, { at: 166.5, label: "break" }],
  "silent-steppe": [{ at: 24.0, label: "drop" }, { at: 42.0, label: "drop" }, { at: 82.5, label: "transition" }, { at: 103.5, label: "transition" }, { at: 155.0, label: "transition" }],
  "still-point": [{ at: 8.0, label: "transition" }, { at: 44.0, label: "transition" }, { at: 87.0, label: "drop" }, { at: 106.0, label: "transition" }, { at: 167.0, label: "pulse" }],
  "clockwork-berserk": [{ at: 19.5, label: "pulse" }, { at: 55.5, label: "drop" }, { at: 72.0, label: "drop" }, { at: 107.5, label: "break" }, { at: 167.5, label: "break" }],
  "ghost-in-the-ivory": [{ at: 26.0, label: "drop" }, { at: 39.0, label: "transition" }, { at: 83.0, label: "drop" }, { at: 113.0, label: "transition" }, { at: 135.5, label: "break" }],
  "half-time-dubstep-drop": [{ at: 19.0, label: "drop" }, { at: 48.0, label: "break" }, { at: 91.0, label: "drop" }, { at: 128.0, label: "drop" }, { at: 146.5, label: "drop" }],
  "hearth-and-ghost-frequency": [{ at: 22.0, label: "pulse" }, { at: 44.5, label: "drop" }, { at: 72.0, label: "break" }, { at: 115.0, label: "drop" }, { at: 146.0, label: "break" }],
  "honey-and-satellite": [{ at: 29.5, label: "transition" }, { at: 41.5, label: "transition" }, { at: 84.5, label: "drop" }, { at: 125.5, label: "transition" }, { at: 137.5, label: "transition" }],
  "instrumental-version": [{ at: 15.5, label: "drop" }, { at: 47.0, label: "drop" }, { at: 78.0, label: "transition" }, { at: 105.0, label: "drop" }, { at: 143.5, label: "drop" }],
  "forgotten-district": [{ at: 30.5, label: "drop" }, { at: 68.5, label: "drop" }, { at: 84.0, label: "pulse" }, { at: 123.5, label: "drop" }, { at: 166.0, label: "break" }],
  "puppeteers-soliloquy": [{ at: 35.0, label: "transition" }, { at: 49.0, label: "drop" }, { at: 83.5, label: "break" }, { at: 131.0, label: "break" }, { at: 167.5, label: "break" }],
  "unresolved-metamorphosis": [{ at: 24.0, label: "drop" }, { at: 66.0, label: "drop" }, { at: 86.0, label: "transition" }, { at: 109.0, label: "transition" }],
};

/** Selects a saved cue and avoids replaying the immediately previous cue. */
export function pickTrackCue(
  trackId: string,
  random: () => number = Math.random,
  previousAt?: number,
): TrackCue | undefined {
  const cues = TRACK_CUES[trackId] ?? [];
  const choices = cues.length > 1 && previousAt !== undefined
    ? cues.filter(cue => cue.at !== previousAt)
    : cues;
  if (!choices.length) return undefined;
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index];
}

/**
 * One audio file the visitor loaded themselves.
 *
 * `url` is always an object URL, so this is only meaningful for the lifetime
 * of the document that created it — see the store's `uploadedTracks` for why
 * that shape is deliberate rather than a shortcut.
 */
export type UploadedTrack = { id: string; url: string; title: string };

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
  { id: "theme", url: DEFAULT_TRACK_URL, title: DEFAULT_TRACK_TITLE, artist: DEFAULT_TRACK_ARTIST, tags: ["catalog"] },
  { id: "blackbox-psalm", url: "/audio/Blackbox Psalm.mp3", title: "Blackbox Psalm", artist: "MOSH" , tags: ["catalog"] },
  { id: "corrupted-ivory", url: "/audio/Corrupted Ivory.mp3", title: "Corrupted Ivory", artist: "MOSH" , tags: ["catalog"] },
  { id: "cybernetic-metamorphosis", url: "/audio/Cybernetic Metamorphosis.mp3", title: "Cybernetic Metamorphosis", artist: "MOSH" , tags: ["catalog"] },
  { id: "iron-lament", url: "/audio/Iron Lament.mp3", title: "Iron Lament", artist: "MOSH" , tags: ["catalog"] },
  { id: "iron-liturgy-reimagined", url: "/audio/Iron Liturgy (Reimagined).mp3", title: "Iron Liturgy (Reimagined)", artist: "MOSH" , tags: ["catalog"] },
  { id: "iron-lullaby", url: "/audio/Iron Lullaby.mp3", title: "Iron Lullaby", artist: "MOSH" , tags: ["catalog"] },
  { id: "iron-requiem", url: "/audio/Iron Requiem.mp3", title: "Iron Requiem", artist: "MOSH" , tags: ["catalog"] },
  { id: "iron-waltz", url: "/audio/Iron Waltz.mp3", title: "Iron Waltz", artist: "MOSH" , tags: ["catalog"] },
  { id: "ivory-protocol", url: "/audio/Ivory Protocol.mp3", title: "Ivory Protocol", artist: "MOSH" , tags: ["catalog"] },
  { id: "jitterbug", url: "/audio/Jitterbug.mp3", title: "Jitterbug", artist: "MOSH" , tags: ["catalog"] },
  { id: "long-desired", url: "/audio/Long Desired.mp3", title: "Long Desired", artist: "MOSH" , tags: ["catalog"] },
  { id: "mechanical-requiem-guitar-cover", url: "/audio/Mechanical Requiem (Guitar Cover) (Cover).mp3", title: "Mechanical Requiem — Guitar Cover", artist: "MOSH" , tags: ["catalog"] },
  { id: "mechanical-requiem", url: "/audio/Mechanical Requiem.mp3", title: "Mechanical Requiem", artist: "MOSH" , tags: ["catalog"] },
  { id: "motor-spit", url: "/audio/Motor Spit.mp3", title: "Motor Spit", artist: "MOSH" , tags: ["catalog"] },
  { id: "plex-on-em", url: "/audio/Plex On Em.mp3", title: "Plex On Em", artist: "MOSH" , tags: ["catalog"] },
  { id: "restitude", url: "/audio/Restitude.mp3", title: "Restitude", artist: "MOSH" , tags: ["catalog"] },
  { id: "retro-clay-bouncehouse", url: "/audio/Retro Clay Bouncehouse.mp3", title: "Retro Clay Bouncehouse", artist: "MOSH" , tags: ["catalog"] },
  { id: "synthetic-requiem", url: "/audio/Synthetic Requiem.mp3", title: "Synthetic Requiem", artist: "MOSH" , tags: ["catalog"] },
  { id: "terminal-decay", url: "/audio/Terminal Decay.mp3", title: "Terminal Decay", artist: "MOSH" , tags: ["catalog"] },
  { id: "cold-rite", url: "/audio/The Cold Rite.mp3", title: "The Cold Rite", artist: "MOSH" , tags: ["catalog"] },
  { id: "silent-steppe", url: "/audio/The Silent Steppe.mp3", title: "The Silent Steppe", artist: "MOSH" , tags: ["catalog"] },
  { id: "still-point", url: "/audio/The Still Point.mp3", title: "The Still Point", artist: "MOSH" , tags: ["catalog"] },
  /* Later drops. These sat unregistered in public/audio for a while — they play
     from the top rather than from a saved cue because scripts/analyze-track-cues.py
     hasn't been run over them yet, which Radio wants anyway. Tag anything that
     comes out of Google Flow with "flow" so `/radio?station=flow` finds it. */
  { id: "clockwork-berserk", url: "/audio/Clockwork Berserk (Take 2).mp3", title: "Clockwork Berserk", artist: "MOSH", tags: ["unreleased"] },
  { id: "ghost-in-the-ivory", url: "/audio/Ghost in the Ivory.mp3", title: "Ghost in the Ivory", artist: "MOSH", tags: ["unreleased"] },
  { id: "half-time-dubstep-drop", url: "/audio/Half-Time Dubstep Drop Extension.mp3", title: "Half-Time Dubstep Drop", artist: "MOSH", tags: ["unreleased"] },
  { id: "hearth-and-ghost-frequency", url: "/audio/Hearth & Ghost Frequency (Take 2).mp3", title: "Hearth & Ghost Frequency", artist: "MOSH", tags: ["unreleased"] },
  { id: "honey-and-satellite", url: "/audio/Honey & Satellite (Take 1).mp3", title: "Honey & Satellite", artist: "MOSH", tags: ["unreleased"] },
  { id: "instrumental-version", url: "/audio/Instrumental Version.mp3", title: "Instrumental Version", artist: "MOSH", tags: ["unreleased"] },
  { id: "forgotten-district", url: "/audio/The Forgotten District (Take 2).mp3", title: "The Forgotten District", artist: "MOSH", tags: ["unreleased"] },
  { id: "puppeteers-soliloquy", url: "/audio/The Puppeteer's Soliloquy (Take 1).mp3", title: "The Puppeteer's Soliloquy", artist: "MOSH", tags: ["unreleased"] },
  /* "Together Again.mp3" is deliberately absent: the file is an AAC/M4A that
     was renamed .mp3, and its stream fails to decode cleanly (ffmpeg rejects
     it outright). Chrome sniffs the container and would probably play it;
     Safari and Firefox are far less forgiving, and a station cannot afford a
     track that plays on one machine and stalls on another. Re-encode it to a
     real mp3 and add a row here to put it back. */
  { id: "unresolved-metamorphosis", url: "/audio/Unresolved Metamorphosis (Take 1).mp3", title: "Unresolved Metamorphosis", artist: "MOSH", tags: ["unreleased"] },
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

/**
 * Which showcase track this browser landed on last time, so a repeat visit
 * doesn't open on the same song. Device-scoped (localStorage) rather than
 * account-scoped — the entitlements/profiles schema has no spare column to
 * carry this cross-device for a signed-in user, and adding one is more
 * machinery than a "don't repeat the last song" preference is worth. Signed
 * in on two different devices will each keep their own independent history.
 */
const LAST_VISIT_TRACK_KEY = "mosh-last-visit-track-id";

function readLastVisitTrackId(): string | null {
  try { return window.localStorage.getItem(LAST_VISIT_TRACK_KEY); } catch { return null; }
}

function writeLastVisitTrackId(id: string) {
  try { window.localStorage.setItem(LAST_VISIT_TRACK_KEY, id); } catch {}
}

class TrackPlayer {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private envelope = 0;
  private peak = 0.05;
  private cueRequest = 0;
  private lastCueByTrack = new Map<string, number>();
  /** True once playback has actually started at least once — distinguishes
   *  the very first play() (start from the top) from every later entry into
   *  a mode (jump to a fresh point). */
  private everPlayed = false;
  /** Registered by setAutoAdvance (radio mode); null the rest of the time. */
  private endedHandler: (() => void) | null = null;
  private radioTransport: { play: () => void; next: () => void; previous: () => void; onPause: () => void } | null = null;

  setRadioTransport(controls: typeof this.radioTransport) { this.radioTransport = controls; }

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
      navigator.mediaSession.setActionHandler("play", () => { if (this.radioTransport) this.radioTransport.play(); else void this.play().catch(() => {}); });
      navigator.mediaSession.setActionHandler("pause", () => { this.pause(); });
      navigator.mediaSession.setActionHandler("previoustrack", () => { if (this.radioTransport) this.radioTransport.previous(); else void this.prevShowcaseTrack().catch(() => {}); });
      navigator.mediaSession.setActionHandler("nexttrack", () => { if (this.radioTransport) this.radioTransport.next(); else void this.nextShowcaseTrack().catch(() => {}); });
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
  async setSource(url: string, title: string, artist = "", cueAt?: number) {
    const cueRequest = ++this.cueRequest;
    this.playRequest++;
    this.playInFlight = null;
    this.url = url;
    this.title = title;
    this.artist = artist;
    this.ensure();
    const wasPlaying = this.enabled;
    // lgtm[js/xss-through-dom] -- always a local blob: object URL or the
    // hardcoded DEFAULT_TRACK_URL; see assertSafeTrackUrl's doc comment.
    if (this.el) {
      this.el.src = assertSafeTrackUrl(url);
      if (cueAt !== undefined) this.applyCueWhenReady(cueAt, cueRequest);
    }
    this.updateMediaSessionMetadata();
    if (wasPlaying) await this.play();
  }

  /** Restore the bundled default track. */
  async useDefaultTrack() {
    await this.setSource(DEFAULT_TRACK_URL, DEFAULT_TRACK_TITLE, DEFAULT_TRACK_ARTIST);
  }

  /**
   * Radio's hand on the transport.
   *
   * The element loops by design everywhere else in MOSH — one theme track
   * under a session that has no idea how long it will last. A radio station
   * is the opposite: the whole point is that the song *ends* and another one
   * starts, forever. Handing over a handler swaps looping for an `ended`
   * callback; handing over null puts the loop back exactly as it was, so the
   * editor's ordinary theme-track behaviour survives leaving radio mode.
   */
  setAutoAdvance(handler: (() => void) | null) {
    this.ensure();
    const el = this.el;
    if (!el) return;
    if (this.endedHandler) {
      el.removeEventListener("ended", this.endedHandler);
      this.endedHandler = null;
    }
    el.loop = !handler;
    if (!handler) return;
    const fn = () => handler();
    this.endedHandler = fn;
    el.addEventListener("ended", fn);
  }

  /**
   * Play a track from its first second rather than from a saved drop-in cue.
   *
   * Every other entry point deliberately drops into the middle of a song —
   * a visualiser wants the interesting part immediately. Radio is the one
   * place that wants the whole arrangement, intro included, because the
   * listener is going to be there for the next four minutes either way.
   */
  async playTrackFromStart(track: ShowcaseTrack) {
    const source = this.setSource(track.url, track.title, track.artist, 0);
    // Call play synchronously in the tap, before yielding user activation.
    const playback = this.play();
    await Promise.all([source, playback]);
  }

  /** Playhead in seconds — Radio's stall watchdog compares this across ticks. */
  position(): number {
    const t = this.el?.currentTime;
    return typeof t === "number" && Number.isFinite(t) ? t : 0;
  }

  /** True while the element is genuinely rolling (not paused, not ended). */
  isRolling(): boolean {
    const el = this.el;
    return !!el && !el.paused && !el.ended;
  }

  hasPlaybackError(): boolean { return !!this.el?.error; }

  /** Load one of the bundled showcase tracks (see SHOWCASE_TRACKS) by id. */
  async useShowcaseTrack(id: string) {
    const t = SHOWCASE_TRACKS.find(x => x.id === id);
    if (!t) return;
    await this.setShowcaseSourceAtCue(t);
    await this.play();
  }

  private async setShowcaseSourceAtCue(track: ShowcaseTrack) {
    const cue = pickTrackCue(track.id, Math.random, this.lastCueByTrack.get(track.id));
    if (cue) this.lastCueByTrack.set(track.id, cue.at);
    await this.setSource(track.url, track.title, track.artist, cue?.at);
  }

  /** Seek as soon as metadata permits without delaying the user-gesture-bound
   * play() call. A request token prevents a slow previous source from seeking
   * a newly-selected song when its loadedmetadata event eventually arrives. */
  private applyCueWhenReady(at: number, request: number) {
    const el = this.el;
    if (!el) return;
    const apply = () => {
      if (request !== this.cueRequest || el !== this.el) return;
      const end = Number.isFinite(el.duration) ? Math.max(0, el.duration - 1) : at;
      try { el.currentTime = Math.min(at, end); } catch {}
      this.fadeTo(this.volume, 0.6, 0.0001);
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener("loadedmetadata", apply, { once: true });
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
    await this.setShowcaseSourceAtCue(t);
    await this.play();
  }

  /** Same as nextShowcaseTrack, backwards. From a non-showcase track, starts
   *  at the last one. */
  async prevShowcaseTrack() {
    if (!SHOWCASE_TRACKS.length) return;
    const i = this.showcaseIndex();
    const t = SHOWCASE_TRACKS[i === -1 ? SHOWCASE_TRACKS.length - 1 : (i - 1 + SHOWCASE_TRACKS.length) % SHOWCASE_TRACKS.length];
    await this.setShowcaseSourceAtCue(t);
    await this.play();
  }

  /** Jumps to a random *different* showcase track (never repeats the one
   *  already playing, unless it's the only one available). */
  async shuffleShowcaseTrack() {
    if (!SHOWCASE_TRACKS.length) return;
    if (SHOWCASE_TRACKS.length === 1) {
      const only = SHOWCASE_TRACKS[0];
      await this.setShowcaseSourceAtCue(only);
      await this.play();
      return;
    }
    const i = this.showcaseIndex();
    let idx = i;
    while (idx === i) idx = Math.floor(Math.random() * SHOWCASE_TRACKS.length);
    const t = SHOWCASE_TRACKS[idx];
    await this.setShowcaseSourceAtCue(t);
    await this.play();
  }

  /**
   * Auto-play entry point for a fresh visit: picks a random showcase track,
   * excluding whichever one this browser landed on last visit (see
   * readLastVisitTrackId), and starts playing it. Always writes the newly
   * chosen id back immediately — before playback even starts — so the
   * "different every time" guarantee holds even if the tab closes before
   * the track finishes loading.
   *
   * Distinct from shuffleShowcaseTrack: that one only avoids repeating
   * whatever's *currently* playing in this same runtime (in-memory,
   * resets every reload) — this one avoids repeating across visits
   * entirely, via localStorage.
   */
  async playRandomOnVisit(): Promise<void> {
    if (!SHOWCASE_TRACKS.length) return;
    const lastId = readLastVisitTrackId();
    const pool = SHOWCASE_TRACKS.length > 1
      ? SHOWCASE_TRACKS.filter(t => t.id !== lastId)
      : SHOWCASE_TRACKS;
    const t = pool[Math.floor(Math.random() * pool.length)];
    writeLastVisitTrackId(t.id);
    await this.setShowcaseSourceAtCue(t);
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
    const current = SHOWCASE_TRACKS[this.showcaseIndex()];
    if (current && this.el) {
      const cue = pickTrackCue(current.id, Math.random, this.lastCueByTrack.get(current.id));
      if (!cue) return;
      this.lastCueByTrack.set(current.id, cue.at);
      this.applyCueWhenReady(cue.at, this.cueRequest);
      return;
    }
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
  private playRequest = 0;

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
    const request = ++this.playRequest;
    this.playInFlight = this.doPlay(request).finally(() => {
      if (request === this.playRequest) this.playInFlight = null;
    });
    return this.playInFlight;
  }

  private async doPlay(request: number): Promise<void> {
    this.ensure();
    // resume() may stay pending until a gesture. Start BOTH APIs inside the
    // gesture and bound the whole attempt, including the AudioContext.
    const context = this.ctx?.state === "suspended" ? this.ctx.resume() : Promise.resolve();
    // Belt-and-suspenders for the same hang: even a *single*, uncontested
    // el.play() call can fail to ever settle on some platforms. 6s is
    // generous for a local same-origin file — past that the browser isn't
    // going to resolve it on its own, so time out and let the caller's
    // existing error handling (toast + state reset) recover instead of
    // hanging forever.
    let timeout: number | undefined;
    try {
      await Promise.race([
        Promise.all([context, this.el!.play()]),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => {
            reject(this.ctx?.state === "suspended"
              ? new DOMException("Tap to enable audio", "NotAllowedError")
              : new Error("track play() timed out"));
          }, 6_000);
        }),
      ]);
    } finally { window.clearTimeout(timeout); }
    if (request !== this.playRequest) throw new DOMException("Playback superseded", "AbortError");
    this.enabled = true;
    this.everPlayed = true;
    if (!this.startedAt) this.startedAt = performance.now();
    this.fadeTo(this.volume, 0.5, 0.0001);
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = "playing"; } catch {}
    }
  }

  pause() {
    this.playRequest++;
    this.playInFlight = null;
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
    this.radioTransport?.onPause();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  /** Full teardown — used by "clear all audio". A fresh play() after this
   *  rebuilds the AudioContext from scratch. */
  dispose() {
    this.pause();
    this.cueRequest++;
    this.lastCueByTrack.clear();
    this.everPlayed = false;
    if (this.el) {
      if (this.endedHandler) { this.el.removeEventListener("ended", this.endedHandler); }
      try { this.el.src = ""; } catch {}
    }
    this.endedHandler = null;
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
