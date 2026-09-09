import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowcaseTrack } from "./trackPlayer";

/**
 * The station's failure handling, with the transport faked out.
 *
 * These are regression tests for things that already went wrong once on a real
 * page, not hypotheticals — every case below is a way the station lost a song
 * or went quiet while looking healthy.
 */

const player = {
  enabled: false,
  rolling: false,
  pos: 0,
  autoAdvance: null as (() => void) | null,
  played: [] as string[],
  failWith: null as Error | null,
  playTrackFromStart: vi.fn(async (track: ShowcaseTrack) => {
    player.played.push(track.id);
    if (player.failWith) {
      const err = player.failWith;
      player.failWith = null;
      throw err;
    }
    player.enabled = true;
    player.rolling = true;
    player.pos = 0;
  }),
  play: vi.fn(async () => { player.enabled = true; player.rolling = true; }),
  pause: vi.fn(() => { player.enabled = false; player.rolling = false; }),
  hasPlaybackError: () => false,
  setRadioTransport: vi.fn(),
  position: () => player.pos,
  isRolling: () => player.rolling,
  setAutoAdvance: vi.fn((handler: (() => void) | null) => { player.autoAdvance = handler; }),
};

vi.mock("./trackPlayer", () => ({ trackPlayer: player }));

const { startRadioSession, WATCHDOG_INTERVAL_MS, WATCHDOG_STRIKES } = await import("./radioSession");

const track = (id: string): ShowcaseTrack => ({ id, url: `/audio/${id}.mp3`, title: id, artist: "MOSH" });
const LIBRARY = [track("a"), track("b"), track("c")];

/** Let the session's floating promises settle. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  player.enabled = false;
  player.rolling = false;
  player.pos = 0;
  player.played = [];
  player.failWith = null;
  player.autoAdvance = null;
  player.playTrackFromStart.mockClear();
  player.setRadioTransport.mockClear();
});

afterEach(() => { vi.useRealTimers(); });

describe("radio session", () => {
  it("starts a track and hands the player an auto-advance handler", async () => {
    const onTrack = vi.fn();
    const session = startRadioSession({ tracks: LIBRARY, onTrack });
    await settle();

    expect(player.played).toHaveLength(1);
    expect(onTrack).toHaveBeenCalledOnce();
    expect(player.autoAdvance).toBeTypeOf("function");
    session.stop();
  });

  it("restores the player's ordinary looping on stop", async () => {
    const session = startRadioSession({ tracks: LIBRARY });
    await settle();
    session.stop();
    expect(player.autoAdvance).toBeNull();
  });

  it("moves to the next track when one ends", async () => {
    const session = startRadioSession({ tracks: LIBRARY });
    await settle();
    player.autoAdvance!();
    await settle();

    expect(player.played).toHaveLength(2);
    expect(player.played[1]).not.toBe(player.played[0]);
    session.stop();
  });

  /**
   * The regression. A superseded load rejects with AbortError, which the first
   * version counted as a broken file — so the station skipped a song on
   * startup and the store answered the same rejection with an error toast.
   */
  it("does not burn a track when a load is superseded", async () => {
    player.failWith = Object.assign(new Error("The play() request was interrupted by a new load request."), { name: "AbortError" });
    const onTrack = vi.fn();
    const session = startRadioSession({ tracks: LIBRARY, onTrack });
    await settle();

    expect(player.played).toHaveLength(1);   // it did NOT chain into a skip
    expect(onTrack).not.toHaveBeenCalled();
    session.stop();
  });

  it("skips past a track that genuinely will not play", async () => {
    player.failWith = Object.assign(new Error("no decoder"), { name: "NotSupportedError" });
    const onTrack = vi.fn();
    const session = startRadioSession({ tracks: LIBRARY, onTrack });
    await settle();

    expect(player.played.length).toBeGreaterThan(1);
    expect(onTrack).toHaveBeenCalledOnce();  // landed on the next one
    session.stop();
  });

  it("reports an autoplay block instead of treating it as a bad track", async () => {
    player.failWith = Object.assign(new Error("play() failed"), { name: "NotAllowedError" });
    const onBlocked = vi.fn();
    const onTrack = vi.fn();
    const session = startRadioSession({ tracks: LIBRARY, onBlocked, onTrack });
    await settle();

    expect(onBlocked).toHaveBeenCalledOnce();
    expect(player.played).toHaveLength(1);
    expect(onTrack).not.toHaveBeenCalled();

    // …and the same track resumes on a gesture, rather than being lost.
    const blocked = player.played[0];
    session.resume();
    await settle();
    expect(player.played[1]).toBe(blocked);
    session.stop();
  });

  /**
   * The failure nothing else catches: `ended` never fires on a wedged decoder,
   * so without this the wall goes still while the page looks perfectly fine.
   */
  it("skips a frozen playhead after the watchdog's strikes", async () => {
    const session = startRadioSession({ tracks: LIBRARY });
    await settle();
    expect(player.played).toHaveLength(1);

    player.pos = 12;                     // rolling, then wedged at 12s
    await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS);
    await settle();
    for (let strike = 0; strike < WATCHDOG_STRIKES; strike++) {
      await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS);
      await settle();
    }

    expect(player.played.length).toBeGreaterThan(1);
    session.stop();
  });

  it("leaves a deliberately paused station alone", async () => {
    const session = startRadioSession({ tracks: LIBRARY });
    await settle();
    player.rolling = false;              // paused by the listener, not stalled
    player.pos = 30;

    for (let strike = 0; strike < WATCHDOG_STRIKES + 2; strike++) {
      await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS);
      await settle();
    }

    expect(player.played).toHaveLength(1);
    session.stop();
  });

  it("stops watching once stopped", async () => {
    const session = startRadioSession({ tracks: LIBRARY });
    await settle();
    session.stop();
    const seen = player.played.length;

    player.pos = 5;
    for (let strike = 0; strike < WATCHDOG_STRIKES + 2; strike++) {
      await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS);
      await settle();
    }
    expect(player.played).toHaveLength(seen);
  });
});


describe("editable radio transport", () => {
  it("plays a shared opener and follows the displayed edited queue", async () => {
    let queue: ShowcaseTrack[] = [];
    const session = startRadioSession({ tracks: LIBRARY, startWith: "b", onQueue: (_, q) => { queue = q; } });
    await settle();
    expect(session.current()?.id).toBe("b");
    session.enqueue(LIBRARY[2], true);
    expect(queue[0].id).toBe("c");
    session.move(0, queue.length - 1);
    const next = queue[0].id;
    session.skip(); await settle();
    expect(session.current()?.id).toBe(next);
    session.stop();
  });
  it("honors playlist order and returns to the preceding song", async () => {
    const session = startRadioSession({ tracks: LIBRARY, initialQueue: [LIBRARY[2], LIBRARY[0], LIBRARY[1]] });
    await settle();
    expect(session.current()?.id).toBe("c");
    session.skip(); await settle();
    expect(session.current()?.id).toBe("a");
    session.previous(); await settle();
    expect(session.current()?.id).toBe("c");
    session.skip(); await settle();
    expect(session.current()?.id).toBe("a");
    session.stop();
  });
  it("pause/resume retains the playhead instead of restarting the song", async () => {
    const session = startRadioSession({ tracks: LIBRARY }); await settle();
    player.pos = 42;
    session.pause(); session.resume(); await settle();
    expect(player.pos).toBe(42);
    expect(player.played).toHaveLength(1);
    session.stop();
  });
  it("does not let a late rejected load change a newer selection", async () => {
    let reject!: (e: Error) => void;
    player.playTrackFromStart.mockImplementationOnce(() => new Promise<void>((_, r) => { reject = r; }));
    const onBlocked = vi.fn();
    const session = startRadioSession({ tracks: LIBRARY, onBlocked });
    session.playNow(LIBRARY[2]); await settle();
    reject(Object.assign(new Error("blocked old load"), { name: "NotAllowedError" })); await settle();
    expect(session.current()?.id).toBe("c");
    expect(onBlocked).not.toHaveBeenCalled();
    session.stop();
  });
  /* Held — the listener's own mic or device audio is driving the visuals.
     The station must keep selecting and must never make a sound, because the
     old shape (pause once, on the transition) let every control still on
     screen put it straight back on the air underneath them. */
  it("selects without sounding while held, and never plays behind an external source", async () => {
    const onTrack = vi.fn();
    const session = startRadioSession({ tracks: LIBRARY, held: true, onTrack });
    await settle();

    expect(player.played).toHaveLength(0);
    expect(onTrack).toHaveBeenCalledOnce();
    expect(session.current()).not.toBeNull();

    // Every operation a HUD or a library row can still reach.
    session.skip(); session.previous(); session.resume();
    session.playNow(LIBRARY[2]); session.playQueue(LIBRARY);
    await settle();
    expect(player.played).toHaveLength(0);
    expect(player.rolling).toBe(false);
    session.stop();
  });

  it("keeps the queue and history across a hold", async () => {
    const session = startRadioSession({ tracks: LIBRARY });
    await settle();
    session.skip(); await settle();
    const before = session.current()!.id;

    session.setHeld(true); await settle();
    expect(player.rolling).toBe(false);
    expect(session.current()!.id).toBe(before);
    session.stop();
  });

  it("loads the held selection when the hold lifts, rather than un-pausing a stale one", async () => {
    const session = startRadioSession({ tracks: LIBRARY, held: true });
    await settle();
    session.skip(); await settle();
    const selected = session.current()!.id;

    session.setHeld(false); await settle();
    expect(player.played).toEqual([selected]);
    expect(player.rolling).toBe(true);
    session.stop();
  });

  it("gives the player a transport whose shuffle moves the rotation", async () => {
    const session = startRadioSession({ tracks: LIBRARY }); await settle();
    const transport = player.setRadioTransport.mock.calls.at(-1)![0] as { shuffle: () => void };
    transport.shuffle(); await settle();
    expect(player.played).toHaveLength(2);
    session.stop();
  });

  it("backs off after library-wide failures and retries without spinning", async () => {
    player.playTrackFromStart.mockRejectedValue(new Error("offline"));
    const session = startRadioSession({ tracks: LIBRARY }); await settle();
    expect(player.playTrackFromStart).toHaveBeenCalledTimes(LIBRARY.length);
    player.playTrackFromStart.mockImplementation(async track => { player.played.push(track.id); player.enabled = true; player.rolling = true; });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(player.played.length).toBeGreaterThan(0);
    session.stop();
  });
});
