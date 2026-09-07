/**
 * Radio — MOSH as a station rather than an instrument.
 *
 * Everything a 24/7 audio-reactive channel needs already existed in this
 * codebase and had simply never been pointed at each other:
 *
 *   Forge          generates its own source, so there is no photo, no camera,
 *                  and nothing to run out of. It can draw forever.
 *   Journey        directs that source against whatever audio is live, on two
 *                  clocks, with a hard ceiling on how long the frame is allowed
 *                  to sit still (journeyDirector.ts).
 *   trackPlayer    is already a drop-in MicAnalyzer — GlCanvas hands Journey
 *                  the track's own analyser the moment a track is playing, so
 *                  the direction is reacting to the *song*, not to a room mic.
 *
 * What was missing is the thing a radio station actually is: a rotation that
 * never ends. That is this file — deliberately pure so the rotation policy is
 * testable without a DOM, an AudioContext, or a running browser. The side of
 * it that touches the player lives in radioSession.ts.
 */

import { ARTIST_SOUNDCLOUD_URL, SHOWCASE_TRACKS, type ShowcaseTrack } from "./trackPlayer";

export const RADIO_PARAM = "radio";
export const RADIO_PATH = "/radio";
export const STATION_PARAM = "station";

/** The rotation every station falls back to: the whole library. */
export const ALL_STATION = "all";

export type RadioConfig = {
  active: boolean;
  /** Tag the rotation is filtered on. `all` means the whole library. */
  station: string;
  /** Whether the now-playing card is drawn. `&hud=0` for a clean capture. */
  hud: boolean;
};

const OFF: RadioConfig = { active: false, station: ALL_STATION, hud: true };

const truthy = (raw: string) => raw === "" || raw === "1" || raw === "true" || raw === "on" || raw === "yes";

/**
 * Read radio settings off a URL, the same way overlay mode does (overlayMode.ts):
 * a broadcast machine gets a bookmark, an OBS browser source gets a string, and
 * neither needs a human to click through the app to reach this mode.
 *
 *   /radio                     the whole library, now-playing card on
 *   /radio?station=flow        only tracks tagged "flow"
 *   /radio?hud=0               no card — pure output for a capture
 *   /edit?radio=1              same thing from the editor's own URL
 *
 * Never throws; anything unparseable reads as "not a radio".
 */
export function radioFromUrl(href?: string): RadioConfig {
  try {
    const h = href ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!h) return OFF;
    const url = new URL(h);
    const raw = url.searchParams.get(RADIO_PARAM);
    const onPath = url.pathname === RADIO_PATH || url.pathname === `${RADIO_PATH}/`;
    // An explicit ?radio=0 turns it off even on /radio, so a broadcast bookmark
    // can be neutered without editing the path.
    if (raw !== null && !truthy(raw.trim().toLowerCase())) return OFF;
    if (!onPath && raw === null) return OFF;

    const station = (url.searchParams.get(STATION_PARAM) ?? "").trim().toLowerCase() || ALL_STATION;
    const hudRaw = url.searchParams.get("hud");
    return {
      active: true,
      station,
      hud: hudRaw === null ? true : truthy(hudRaw.trim().toLowerCase()),
    };
  } catch {
    return OFF;
  }
}

export type ResolvedStation = {
  id: string;
  tracks: ShowcaseTrack[];
  /** True when the requested tag matched nothing and the library stood in. */
  fellBack: boolean;
};

/**
 * Turn a station tag into the tracks it plays.
 *
 * A station that matches nothing falls back to the whole library rather than
 * to silence. This is not politeness — an unattended broadcast that answers a
 * typo with an empty rotation is a black screen nobody is watching to notice,
 * and the failure mode of playing the wrong songs is enormously better than
 * the failure mode of playing none.
 */
export function resolveStation(
  station: string,
  library: readonly ShowcaseTrack[] = SHOWCASE_TRACKS,
): ResolvedStation {
  const id = (station || ALL_STATION).trim().toLowerCase();
  if (id === ALL_STATION) return { id: ALL_STATION, tracks: [...library], fellBack: false };
  const matched = library.filter(t => t.tags?.some(tag => tag.toLowerCase() === id));
  return matched.length
    ? { id, tracks: matched, fellBack: false }
    : { id: ALL_STATION, tracks: [...library], fellBack: true };
}

/** Every station tag present in the library, for a picker or a status line. */
export function availableStations(library: readonly ShowcaseTrack[] = SHOWCASE_TRACKS): string[] {
  const seen = new Set<string>();
  for (const track of library) for (const tag of track.tags ?? []) seen.add(tag.toLowerCase());
  return [ALL_STATION, ...[...seen].sort()];
}

/**
 * Where the now-playing card points.
 *
 * Falls back to the artist profile rather than rendering nothing when a track
 * has no page of its own. A dead-end card is the failure mode worth avoiding:
 * the listener's interest is at its peak exactly while the song is playing,
 * and "no link on this one" spends that moment on nothing. The profile is
 * always a useful destination even when the specific track isn't there.
 */
export function trackLink(track: Pick<ShowcaseTrack, "soundcloudUrl">): string {
  const own = track.soundcloudUrl?.trim();
  return own || ARTIST_SOUNDCLOUD_URL;
}

/** True when the link goes to this exact track rather than the profile. */
export function hasOwnLink(track: Pick<ShowcaseTrack, "soundcloudUrl">): boolean {
  return !!track.soundcloudUrl?.trim();
}

export type RadioRotation = {
  /** Advance and return the track that should play now. */
  next: () => ShowcaseTrack;
  /** What `next()` will return, without consuming it — the "up next" line. */
  peek: () => ShowcaseTrack;
  /** How many tracks are left before the deck reshuffles. */
  remaining: () => number;
  snapshot: () => ShowcaseTrack[];
  enqueue: (track: ShowcaseTrack, next?: boolean) => void;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
  shuffle: () => void;
  replace: (tracks: readonly ShowcaseTrack[]) => void;
};

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A shuffled deck, not a dice roll.
 *
 * Independent random picks are what most "shuffle" buttons do and they are
 * wrong for a station: over an eight-hour stream a 23-track library will
 * play some songs five times and others never, and a listener notices the
 * repeat long before they notice the absence. Dealing from a shuffled deck
 * and only reshuffling once it is empty gives every track exactly one play
 * per cycle, which is what a rotation means.
 *
 * The one seam is the shuffle boundary: the last card of one deck and the
 * first of the next can be the same song back-to-back. Re-cutting the deck
 * when that happens costs one extra shuffle per cycle and removes the only
 * audible artefact of the whole scheme.
 */
export function createRadioRotation(
  tracks: readonly ShowcaseTrack[],
  options: { rand?: () => number; startWith?: string } = {},
): RadioRotation {
  const rand = options.rand ?? Math.random;
  let pool = [...tracks];
  if (!pool.length) throw new Error("createRadioRotation needs at least one track");

  let deck: ShowcaseTrack[] = [];
  let last: ShowcaseTrack | null = null;

  const cut = () => {
    if (pool.length === 1) { deck = [pool[0]]; return; }
    let fresh = shuffled(pool, rand);
    // Bounded: with 2+ distinct tracks a reshuffle that moves the repeat off
    // the front is overwhelmingly likely, and the cap keeps a pathological
    // rand() from spinning here forever.
    for (let attempt = 0; attempt < 8 && last && fresh[0].id === last.id; attempt++) {
      fresh = shuffled(pool, rand);
    }
    if (last && fresh[0].id === last.id) {
      const other = fresh.findIndex(t => t.id !== last!.id);
      if (other > 0) [fresh[0], fresh[other]] = [fresh[other], fresh[0]];
    }
    deck = fresh;
  };

  // An explicit opener (a resumed broadcast, a "play this next" link) is dealt
  // first and then removed from the current deck so it doesn't come round twice.
  const opener = options.startWith ? pool.find(t => t.id === options.startWith) : undefined;
  cut();
  if (opener) deck = [opener, ...deck.filter(t => t.id !== opener.id)];

  const ensure = () => { if (!deck.length) cut(); };

  return {
    next() {
      ensure();
      const track = deck.shift()!;
      last = track;
      return track;
    },
    peek() {
      ensure();
      return deck[0];
    },
    remaining() {
      return deck.length;
    },
    snapshot() { ensure(); return [...deck]; },
    enqueue(track, next = false) {
      // Moving an existing request keeps the visible queue unambiguous.
      deck = deck.filter(t => t.id !== track.id);
      if (next) deck.unshift(track); else deck.push(track);
    },
    move(from, to) {
      if (from < 0 || to < 0 || from >= deck.length || to >= deck.length) return;
      const [track] = deck.splice(from, 1);
      deck.splice(to, 0, track);
    },
    remove(index) { if (index >= 0 && index < deck.length) deck.splice(index, 1); },
    shuffle() { ensure(); deck = shuffled(deck, rand); },
    replace(items) {
      if (!items.length) return;
      pool = [...items];
      deck = [...items];
    },
  };
}
