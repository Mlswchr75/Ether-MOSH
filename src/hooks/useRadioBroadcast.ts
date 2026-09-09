import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { useStore } from "@/store/useStore";
import { radioFromUrl, resolveStation, type RadioConfig } from "@/engine/radio";
import { startRadioSession, type RadioSession, type RadioStatus } from "@/engine/radioSession";
import { radioRequest } from "@/lib/radioLinks";
import { trackPlayer, type ShowcaseTrack } from "@/engine/trackPlayer";
import { catalogueSnapshot, loadRadioCatalogue } from "@/engine/radioCatalogue";

export type RadioBroadcast = {
  config: RadioConfig;
  queue: ShowcaseTrack[];
  history: ShowcaseTrack[];
  status: RadioStatus;
  previous: () => void;
  enqueue: (track: ShowcaseTrack, next?: boolean) => void;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
  shuffle: () => void;
  playNow: (track: ShowcaseTrack) => void;
  playQueue: (tracks: readonly ShowcaseTrack[]) => void;
  nowPlaying: ShowcaseTrack | null;
  upNext: ShowcaseTrack | null;
  /** The browser wants a gesture before it will make sound. */
  needsGesture: boolean;
  /** Deliberately paused by the listener (not stalled, not blocked). */
  paused: boolean;
  /** The visuals are running on the listener's own mic or device audio, and
   *  the rotation is held rather than stopped. */
  externalAudio: boolean;
  /** Call from a real click/tap to start (or restart) the broadcast. */
  start: () => void;
  skip: () => void;
  togglePlay: () => void;
};

/**
 * Radio, as the editor sees it.
 *
 * Deliberately a hook over the existing screen rather than a second page.
 * Everything a station needs to look at — the renderer, Forge, Journey, the
 * track analyser feeding both — is wired together inside the editor already,
 * and a standalone /radio page would be a second copy of that wiring that
 * drifts out of sync with the first one the next time either changes.
 * So /radio *is* /edit, with the chrome down and the rotation running.
 *
 * What this owns: putting the screen into the right state on arrival, keeping
 * the station on the air, and putting the screen back on the way out. Journey
 * itself stays where it is — the hook asks for it through the editor's own
 * gated toggle rather than reaching around the paywall, so a station run by
 * a non-supporter behaves exactly like Forge Journey does everywhere else
 * (five free minutes of direction, then Forge's own shuffle keeps the wall
 * moving while the music plays on).
 */
export function useRadioBroadcast(opts: {
  journeyOn: boolean;
  requestJourney: () => void;
}): RadioBroadcast {
  const { journeyOn, requestJourney } = opts;
  const location = useLocation();
  const href = new URL(location.pathname + location.search, window.location.origin).href;
  const config = useMemo(() => radioFromUrl(href), [href]);
  const active = config.active;

  const [nowPlaying, setNowPlaying] = useState<ShowcaseTrack | null>(null);
  const [upNext, setUpNext] = useState<ShowcaseTrack | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [queue, setQueue] = useState<ShowcaseTrack[]>([]);
  const [history, setHistory] = useState<ShowcaseTrack[]>([]);
  const [status, setStatus] = useState<RadioStatus>("loading");
  const [paused, setPaused] = useState(false);
  const sessionRef = useRef<RadioSession | null>(null);

  /**
   * The library, which now lives in storage rather than in the bundle.
   *
   * Starts as whatever is already known (the bundled tracks, plus anything a
   * previous load resolved) so the very first render has a rotation, and is
   * replaced once the hosted list arrives. `loadRadioCatalogue` is memoized
   * per session and never rejects, so this settles to a stable array exactly
   * once and a station that cannot reach the table simply plays the songs it
   * shipped with.
   */
  const [library, setLibrary] = useState<ShowcaseTrack[]>(catalogueSnapshot);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadRadioCatalogue().then(tracks => { if (alive) setLibrary(tracks); });
    return () => { alive = false; };
  }, [active]);

  /**
   * The listener has pointed the visuals at their own sound instead of ours.
   *
   * A station is two things bolted together — a rotation and a director — and
   * only the rotation is opinionated about what you listen to. Someone who
   * wants the visuals but not the soundtrack (their own set, a film, a room)
   * should get to keep the half that is doing the work, so choosing the mic or
   * device audio holds the music rather than ending the broadcast: turn it off
   * again and the rotation picks up where it was.
   */
  const micEnabled = useStore(s => s.micEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const external = micEnabled || systemAudioEnabled;
  const externalAudio = useRef(external);
  externalAudio.current = external;

  // One-time arrival: Forge is the only source that can draw indefinitely
  // without a photo, a camera, or a human, so a station always runs on it.
  useEffect(() => {
    if (!active) return;
    const store = useStore.getState();
    if (store.sourceMode !== "forge") store.setSourceMode("forge");
    if (!store.forge.stack.length) store.randomiseForge();
    // Auto-shuffle is Forge's own fallback motion and Journey suspends it
    // while directing — leaving it armed means the wall still evolves for a
    // viewer whose Journey preview has run out.
    if (store.shuffleSec == null) store.setShuffleSec(12);
    store.setPerformanceMode(true);
    return () => {
      useStore.getState().setPerformanceMode(false);
    };
  }, [active]);

  // The station itself.
  useEffect(() => {
    if (!active) return;
    const station = resolveStation(config.station, library);
    if (station.fellBack && config.station !== station.id) {
      toast.message(`No tracks tagged "${config.station}" — playing everything`, { duration: 6_000 });
    }
    const request = radioRequest(href);
    const initialQueue = request.tracks.length
      ? (request.track ? [request.track, ...request.tracks.filter(t => t.id !== request.track!.id)] : request.tracks)
      : undefined;
    const tracks = request.track && !station.tracks.some(t => t.id === request.track!.id)
      ? [request.track, ...station.tracks] : station.tracks;
    const session = startRadioSession({
      tracks,
      // Arriving with a mic already on (a returning listener, a shared link
      // opened mid-set) must not put the station on the air underneath it.
      held: externalAudio.current,
      startWith: request.track?.id,
      initialQueue,
      onQueue: (track, upcoming, recent) => {
        setNowPlaying(track);
        setQueue(upcoming);
        setUpNext(upcoming[0] ?? null);
        setHistory(recent);
      },
      onStatus: value => {
        setStatus(value);
        setPaused(value === "paused");
        setNeedsGesture(value === "blocked");
        useStore.setState({ trackEnabled: value === "playing" });
      },
      onTrack: (track, next) => {
        setNowPlaying(track);
        setUpNext(next);
        setNeedsGesture(false);
        setPaused(false);
        useStore.getState().setTrackMeta(track.title, track.artist);
        // Write the flags directly rather than through setTrackEnabled: that
        // action calls trackPlayer.play() itself, on whatever source happens
        // to be loaded. Racing our own setSource is what made the very first
        // song abort with "play() interrupted by a new load request" — and
        // the store answers that with an error toast, so the station opened
        // on a skipped track and a red box. The audio is already rolling by
        // the time this fires; the store only needs to agree.
        //
        // Clearing the two listening flags is how the station claims the
        // analyser back from a mic — but it must not overrule a listener who
        // has just deliberately chosen one. Without the guard the mic dies at
        // the next track change, which reads as the button not working rather
        // than as the station disagreeing with it.
        useStore.setState(externalAudio.current
          ? { trackEnabled: true }
          : { trackEnabled: true, micEnabled: false, systemAudioEnabled: false });
      },
      onBlocked: () => setNeedsGesture(true),
    });
    sessionRef.current = session;
    return () => {
      session.stop();
      sessionRef.current = null;
      useStore.setState({ trackEnabled: false });
    };
  }, [active, config.station, href, library]);

  /* Hold the music while an external source is feeding the visuals, and let it
     go again when the listener switches back.

     Deliberately a hold on the session rather than a `pause()` here: pausing
     only answers the moment the mic goes on, and every control still on screen
     — play, skip, previous, a row in the queue — puts the station straight
     back on the air underneath the listener's own audio, because none of them
     changes `external` and so none of them re-runs this effect. `setHeld` is
     a state the session keeps, so those controls keep moving the rotation and
     none of them can make a sound until the hold lifts.

     Also not `stop()`: the queue, the history and the deck position are the
     listener's, and rebuilding the session would throw all three away to
     answer what is really a mute. */
  useEffect(() => {
    sessionRef.current?.setHeld(external);
  }, [active, external, library]);

  // Journey is what makes the visuals a performance rather than a screensaver.
  // Requested once, through the editor's own gate.
  useEffect(() => {
    if (!active || journeyOn) return;
    const id = window.setTimeout(requestJourney, 400);
    return () => window.clearTimeout(id);
    // Intentionally only on arrival: if the operator turns Journey off mid
    // broadcast, that decision stands rather than being re-applied every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /* Pressing play on the station means "play the station" — so when the
     listener's own audio is what is holding it, that is the thing to turn
     off. Doing nothing here is the reading that makes the button look broken. */
  const releaseExternal = useCallback(() => {
    if (!externalAudio.current) return false;
    useStore.setState({ micEnabled: false, systemAudioEnabled: false });
    return true;
  }, []);

  const start = useCallback(() => {
    setNeedsGesture(false);
    if (releaseExternal()) return;
    sessionRef.current?.resume();
  }, [releaseExternal]);

  const skip = useCallback(() => {
    setPaused(false);
    sessionRef.current?.skip();
  }, []);

  const togglePlay = useCallback(() => {
    if (releaseExternal()) return;
    if (trackPlayer.isRolling()) sessionRef.current?.pause();
    else sessionRef.current?.resume();
  }, [releaseExternal]);

  const previous = useCallback(() => sessionRef.current?.previous(), []);
  const enqueue = useCallback((track: ShowcaseTrack, next?: boolean) => sessionRef.current?.enqueue(track, next), []);
  const move = useCallback((from: number, to: number) => sessionRef.current?.move(from, to), []);
  const remove = useCallback((index: number) => sessionRef.current?.remove(index), []);
  const shuffle = useCallback(() => sessionRef.current?.shuffle(), []);
  const playNow = useCallback((track: ShowcaseTrack) => sessionRef.current?.playNow(track), []);
  const playQueue = useCallback((tracks: readonly ShowcaseTrack[]) => sessionRef.current?.playQueue(tracks), []);
  return { config, nowPlaying, upNext, needsGesture, paused, externalAudio: external, status, queue, history,
    start, skip, togglePlay, previous, enqueue, move, remove, shuffle, playNow, playQueue };
}
