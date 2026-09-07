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
    setStatus("loading");
    publish();
    try {
      if (fromStart) await trackPlayer.playTrackFromStart(track);
      else await trackPlayer.play();
      if (stopped || token !== request) return;
      failures = 0;
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
    if (stopped) return;
    failures = 0;
    if (now) void load(now, status !== "paused"); else advance();
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
  trackPlayer.setRadioTransport({ play: resume, next: advance, previous, onPause: () => { request++; setStatus("paused"); } });
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
