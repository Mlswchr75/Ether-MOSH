import { createRadioRotation } from "./radio";
import { trackPlayer, type ShowcaseTrack } from "./trackPlayer";

export const WATCHDOG_INTERVAL_MS = 4_000;
export const WATCHDOG_STRIKES = 3;
export type RadioStatus = "loading" | "playing" | "paused" | "blocked" | "offline";
export type RadioSessionOptions = {
  tracks: readonly ShowcaseTrack[];
  startWith?: string;
  initialQueue?: readonly ShowcaseTrack[];
  onTrack?: (now: ShowcaseTrack, next: ShowcaseTrack) => void;
  onQueue?: (now: ShowcaseTrack, queue: ShowcaseTrack[], history: ShowcaseTrack[]) => void;
  onStatus?: (status: RadioStatus) => void;
  onBlocked?: () => void;
  rand?: () => number;
  /** Start held — see setHeld. For arriving at a station with a mic already on. */
  held?: boolean;
};
export type RadioSession = {
  current: () => ShowcaseTrack | null;
  skip: () => void;
  previous: () => void;
  resume: () => void;
  pause: () => void;
  playNow: (track: ShowcaseTrack) => void;
  enqueue: (track: ShowcaseTrack, next?: boolean) => void;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
  shuffle: () => void;
  playQueue: (tracks: readonly ShowcaseTrack[]) => void;
  /**
   * Hold (or release) the rotation without tearing it down.
   *
   * A listener pointing the visuals at their own mic or device audio is
   * muting us, not leaving: the queue, the history and the deck position are
   * still theirs. While held the rotation keeps *selecting* — skip, previous
   * and the queue all still move, and the now-playing card still follows —
   * but nothing is ever handed to the audio element, so the station can never
   * end up playing underneath the sound it is supposed to be reacting to.
   */
  setHeld: (held: boolean) => void;
  stop: () => void;
};

export function startRadioSession(options: RadioSessionOptions): RadioSession {
  const rotation = createRadioRotation(options.tracks, { rand: options.rand, startWith: options.startWith });
  if (options.initialQueue?.length) rotation.replace(options.initialQueue);
  let stopped = false;
  let request = 0;
  let now: ShowcaseTrack | null = null;
  const history: ShowcaseTrack[] = [];
  let lastPosition = -1;
  let strikes = 0;
  let failures = 0;
  let retryAt = 0;
  let status: RadioStatus = "loading";
  let held = options.held ?? false;
  /** The last track actually handed to the audio element. While the station is
   *  held the rotation moves without ever reaching the player, so `now` and
   *  this diverge — and releasing the hold has to load, not just un-pause. */
  let sounded: ShowcaseTrack | null = null;
  const setStatus = (value: RadioStatus) => {
    status = value;
    if (!stopped) options.onStatus?.(value);
  };
  const publish = () => {
    if (now && !stopped) options.onQueue?.(now, rotation.snapshot(), [...history]);
  };
  const blocked = (err: unknown) => (err as Error)?.name === "NotAllowedError";

  const load = async (track: ShowcaseTrack, fromStart = true) => {
    if (stopped) return;
    const token = ++request;
    now = track;
    strikes = 0;
    lastPosition = -1;
    publish();
    // Held: the selection is real and the card should follow it, but this is
    // as far as it goes. Deliberately checked after `now`/`publish` so the
    // rotation stays usable while the listener's own audio is driving.
    // onTrack before setStatus, so the "paused" the listener ends up seeing is
    // this hold and not the momentary "playing" onTrack would otherwise imply.
    if (held) { options.onTrack?.(track, rotation.peek()); setStatus("paused"); return; }
    setStatus("loading");
    try {
      if (fromStart) await trackPlayer.playTrackFromStart(track);
      else await trackPlayer.play();
      if (stopped || token !== request) return;
      failures = 0;
      sounded = track;
      setStatus("playing");
      options.onTrack?.(track, rotation.peek());
    } catch (err) {
      if (stopped || token !== request) return;
      if (blocked(err)) {
        setStatus("blocked");
        options.onBlocked?.();
      } else if ((err as Error)?.name === "AbortError") {
        // A superseding editor load is not a broken file. Retry this selection
        // on the watchdog cadence, never recurse on an interrupted promise.
        retryAt = Date.now() + WATCHDOG_INTERVAL_MS;
        setStatus("offline");
      } else {
        failures++;
        if (failures < options.tracks.length) advance();
        else {
          retryAt = Date.now() + 15_000;
          setStatus("offline");
        }
      }
    }
  };
  const advance = () => {
    if (stopped) return;
    if (now) { history.push(now); if (history.length > 100) history.shift(); }
    void load(rotation.next());
  };
  const resume = () => {
    if (stopped || held) return;
    failures = 0;
    if (!now) { advance(); return; }
    void load(now, sounded !== now || status !== "paused");
  };
  const pause = () => {
    request++;
    trackPlayer.pause();
    setStatus("paused");
  };
  const previous = () => {
    const track = history.pop();
    if (!track) return;
    if (now) rotation.enqueue(now, true);
    void load(track);
  };
  const tick = () => {
    if (stopped || status === "loading" || status === "blocked" || status === "paused") return;
    if (status === "offline") {
      if (Date.now() >= retryAt) { failures = 0; advance(); }
      return;
    }
    if (trackPlayer.hasPlaybackError()) { advance(); return; }
    if (!trackPlayer.enabled || !trackPlayer.isRolling()) return;
    const position = trackPlayer.position();
    if (position > lastPosition + 0.05) { lastPosition = position; strikes = 0; return; }
    if (++strikes >= WATCHDOG_STRIKES) advance();
  };
  trackPlayer.setAutoAdvance(advance);
  const shuffleAndAdvance = () => { rotation.shuffle(); advance(); };
  trackPlayer.setRadioTransport({
    play: resume, next: advance, previous, shuffle: shuffleAndAdvance,
    onPause: () => { request++; setStatus("paused"); },
  });
  const watchdog = window.setInterval(tick, WATCHDOG_INTERVAL_MS);
  advance();

  return {
    current: () => now,
    skip: advance, previous, resume, pause,
    playNow(track) { rotation.enqueue(track, true); advance(); },
    enqueue(track, next) { rotation.enqueue(track, next); publish(); },
    move(from, to) { rotation.move(from, to); publish(); },
    remove(index) { rotation.remove(index); publish(); },
    shuffle() { rotation.shuffle(); publish(); },
    playQueue(tracks) { if (tracks.length) { rotation.replace(tracks); advance(); } },
    setHeld(value) {
      if (stopped || held === value) return;
      held = value;
      if (held) pause(); else resume();
    },
    stop() {
      stopped = true;
      request++;
      window.clearInterval(watchdog);
      trackPlayer.setRadioTransport(null);
      trackPlayer.pause();
      trackPlayer.setAutoAdvance(null);
    },
  };
}
