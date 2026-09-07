import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { radioFromUrl, resolveStation, type RadioConfig } from "@/engine/radio";
import { startRadioSession, type RadioSession } from "@/engine/radioSession";
import { trackPlayer, type ShowcaseTrack } from "@/engine/trackPlayer";

export type RadioBroadcast = {
  config: RadioConfig;
  nowPlaying: ShowcaseTrack | null;
  upNext: ShowcaseTrack | null;
  /** The browser wants a gesture before it will make sound. */
  needsGesture: boolean;
  /** Deliberately paused by the listener (not stalled, not blocked). */
  paused: boolean;
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
  const config = useRef(radioFromUrl()).current;
  const active = config.active;

  const [nowPlaying, setNowPlaying] = useState<ShowcaseTrack | null>(null);
  const [upNext, setUpNext] = useState<ShowcaseTrack | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [paused, setPaused] = useState(false);
  const sessionRef = useRef<RadioSession | null>(null);

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
    const station = resolveStation(config.station);
    if (station.fellBack && config.station !== station.id) {
      toast.message(`No tracks tagged "${config.station}" — playing everything`, { duration: 6_000 });
    }
    const session = startRadioSession({
      tracks: station.tracks,
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
        useStore.setState({ trackEnabled: true, micEnabled: false, systemAudioEnabled: false });
      },
      onBlocked: () => setNeedsGesture(true),
    });
    sessionRef.current = session;
    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [active, config.station]);

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

  const start = useCallback(() => {
    setNeedsGesture(false);
    sessionRef.current?.resume();
  }, []);

  const skip = useCallback(() => {
    setPaused(false);
    sessionRef.current?.skip();
  }, []);

  /** The station's own play/pause — the HUD button and the space bar. */
  const togglePlay = useCallback(() => {
    if (trackPlayer.isRolling()) {
      trackPlayer.pause();
      useStore.setState({ trackEnabled: false });
      setPaused(true);
      return;
    }
    setPaused(false);
    trackPlayer.play()
      .then(() => useStore.setState({ trackEnabled: true }))
      .catch(() => setNeedsGesture(true));
  }, []);

  return { config, nowPlaying, upNext, needsGesture, paused, start, skip, togglePlay };
}
