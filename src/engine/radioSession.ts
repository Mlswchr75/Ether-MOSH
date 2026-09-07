/**
 * The part of Radio that touches the transport.
 *
 * Kept apart from radio.ts (which is pure rotation policy) because everything
 * here is about the ways a browser fails during hour nine of an unattended
 * broadcast, and none of that is testable in the same breath as "does shuffle
 * repeat itself".
 *
 * Three failures actually happen, and a station that ignores any of them is a
 * station that is silently dead by morning:
 *
 *   AUTOPLAY   The first play() is refused outright until someone has gestured
 *              at the page. Not an error — a state. `onBlocked` surfaces it so
 *              the UI can ask for one tap, and `resume()` picks straight back up.
 *   A BAD FILE A 404, a half-uploaded mp3, a codec the browser dislikes. One
 *              track must never take the station off the air, so a failed start
 *              skips to the next one instead of unwinding.
 *   A STALL    The playhead stops moving while nothing reports an error —
 *              a decoder wedge, a dropped connection mid-buffer, a suspended
 *              context after a laptop lid closes. `ended` never fires, so
 *              nothing advances and the wall goes still with the page still
 *              looking perfectly healthy. The watchdog below is the only thing
 *              that catches this class, which is exactly why it exists.
 */

import { createRadioRotation, type RadioRotation } from "./radio";
import { trackPlayer, type ShowcaseTrack } from "./trackPlayer";

/** How often the watchdog compares the playhead against its last reading. */
export const WATCHDOG_INTERVAL_MS = 4_000;
/** Consecutive frozen readings before the station gives up on a track. */
export const WATCHDOG_STRIKES = 3;

export type RadioSessionOptions = {
  tracks: readonly ShowcaseTrack[];
  /** Fired whenever the station lands on a new track (and on the first one). */
  onTrack?: (now: ShowcaseTrack, next: ShowcaseTrack) => void;
  /** Fired when the browser refuses to start audio without a user gesture. */
  onBlocked?: () => void;
  rand?: () => number;
};

export type RadioSession = {
  /** Current track, or null before the first one has started. */
  current: () => ShowcaseTrack | null;
  /** Jump to the next track now (the skip button, a media key). */
  skip: () => void;
  /** Retry after an autoplay block, from inside the user's gesture. */
  resume: () => void;
  /** Stop the station and give the player its ordinary looping behaviour back. */
  stop: () => void;
};

/**
 * Start a station. Returns immediately — the first track is kicked off in the
 * background so a caller inside a click handler is never left awaiting the
 * network.
 */
export function startRadioSession(options: RadioSessionOptions): RadioSession {
  const rotation: RadioRotation = createRadioRotation(options.tracks, { rand: options.rand });

  let stopped = false;
  let advancing = false;
  let now: ShowcaseTrack | null = null;
  let lastPosition = -1;
  let strikes = 0;
  let consecutiveFailures = 0;
  let watchdog: number | null = null;

  const isAutoplayBlock = (err: unknown) => {
    const e = err as { name?: string; message?: string } | null;
    return e?.name === "NotAllowedError" || /gesture|interact|not allowed/i.test(e?.message || "");
  };

  /**
   * "The play() request was interrupted by a new load request."
   *
   * Not a broken track — the opposite. It means a *newer* load already
   * superseded this one, so the station is fine and something else is
   * driving. Counting it as a failure is actively harmful: it burns a song
   * out of the rotation and, in the worst case, chains one skip into the
   * next. Swallow it and let whichever load won finish its job.
   */
  const isSupersededLoad = (err: unknown) => {
    const e = err as { name?: string; message?: string } | null;
    return e?.name === "AbortError" || /interrupted by a new load|interrupted by a call to pause/i.test(e?.message || "");
  };

  const advance = async () => {
    if (stopped || advancing) return;
    advancing = true;
    try {
      const track = rotation.next();
      now = track;
      strikes = 0;
      lastPosition = -1;
      try {
        await trackPlayer.playTrackFromStart(track);
        consecutiveFailures = 0;
        if (!stopped) options.onTrack?.(track, rotation.peek());
      } catch (err) {
        if (isAutoplayBlock(err)) {
          // Not a broken track — a page that hasn't been touched yet. Hold
          // this one as `now` so resume() replays it rather than burning it.
          options.onBlocked?.();
          return;
        }
        if (isSupersededLoad(err)) return;
        console.error("[radio] track failed to start:", track.id, err);
        consecutiveFailures++;
        // A whole library that won't play (offline, storage gone) must not
        // become a tight retry loop chewing the CPU of an unattended machine.
        // Back off and let the watchdog try again on its own cadence.
        if (consecutiveFailures < options.tracks.length) {
          advancing = false;
          await advance();
        }
      }
    } finally {
      advancing = false;
    }
  };

  const tick = () => {
    if (stopped || advancing) return;
    // Nothing has successfully started yet (autoplay block, or a library-wide
    // failure that backed off) — retrying here is the recovery path.
    if (!now || !trackPlayer.enabled) return;
    const position = trackPlayer.position();
    if (position > lastPosition + 0.05) {
      lastPosition = position;
      strikes = 0;
      return;
    }
    // A paused element is a deliberate pause (the transport, a media key), not
    // a stall. Leave it alone; the station resumes when the user says so.
    if (!trackPlayer.isRolling()) return;
    strikes++;
    if (strikes >= WATCHDOG_STRIKES) {
      console.warn("[radio] playhead frozen — skipping", now?.id);
      strikes = 0;
      void advance();
    }
  };

  trackPlayer.setAutoAdvance(() => { void advance(); });
  watchdog = window.setInterval(tick, WATCHDOG_INTERVAL_MS);
  void advance();

  return {
    current: () => now,
    skip: () => { void advance(); },
    resume: () => {
      // Replay whatever the autoplay block interrupted; if nothing was ever
      // chosen, deal a fresh one.
      const pending = now;
      if (!pending) { void advance(); return; }
      trackPlayer.playTrackFromStart(pending)
        .then(() => { if (!stopped) options.onTrack?.(pending, rotation.peek()); })
        .catch(err => {
          if (isAutoplayBlock(err)) options.onBlocked?.();
          else void advance();
        });
    },
    stop: () => {
      stopped = true;
      if (watchdog !== null) { window.clearInterval(watchdog); watchdog = null; }
      trackPlayer.setAutoAdvance(null);
    },
  };
}
