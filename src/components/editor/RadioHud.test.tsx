import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RadioGesturePrompt, RadioHud } from "./RadioHud";
import type { RadioBroadcast } from "@/hooks/useRadioBroadcast";
import type { RadioStatus } from "@/engine/radioSession";
import type { ShowcaseTrack } from "@/engine/trackPlayer";

/* The library tab reaches Supabase and auth; neither is what this file is
   about. Stubbed to the signed-out shape, which is also the shape a first-time
   listener actually sees. */
vi.mock("@/hooks/useRadioLibrary", () => ({
  useRadioLibrary: () => ({
    user: null, favorites: [], playlists: [], loading: false, busy: false, error: "",
    refresh: vi.fn(), toggleFavorite: vi.fn(), savePlaylist: vi.fn(), deletePlaylist: vi.fn(),
  }),
}));

const track = (id: string, title: string): ShowcaseTrack => ({ id, url: `/audio/${id}.mp3`, title, artist: "MOSH" });

const NOW = track("blackbox-psalm", "Blackbox Psalm");
const NEXT = track("corrupted-ivory", "Corrupted Ivory");

function broadcast(overrides: Partial<RadioBroadcast> = {}): RadioBroadcast {
  return {
    config: { active: true, station: "all", hud: true },
    queue: [NEXT], history: [NOW], status: "playing" as RadioStatus,
    nowPlaying: NOW, upNext: NEXT, needsGesture: false, paused: false,
    previous: vi.fn(), enqueue: vi.fn(), move: vi.fn(), remove: vi.fn(), shuffle: vi.fn(),
    playNow: vi.fn(), playQueue: vi.fn(), start: vi.fn(), skip: vi.fn(), togglePlay: vi.fn(),
    ...overrides,
  };
}

const draw = (radio: RadioBroadcast) =>
  render(<MemoryRouter><RadioHud radio={radio} onOpenControls={() => {}} /></MemoryRouter>);

afterEach(cleanup);
beforeEach(() => { try { localStorage.clear(); } catch { /* private mode */ } });

/**
 * These are the assertions a props rename has to break.
 *
 * The player was once given `status`, `nowPlaying` and `trackPlayer` as props
 * while its only caller kept passing the two it had. Every field fell back to
 * its default, so the plate rendered perfectly and reported "Reconnecting…"
 * over "Tuning in…" forever, with dead transport — and the tests of the day
 * had nothing to say about it, because nothing rendered the thing.
 */
describe("RadioHud", () => {
  it("shows what is actually playing rather than a placeholder", () => {
    draw(broadcast());
    expect(screen.getByRole("heading", { name: "Blackbox Psalm" })).toBeTruthy();
    expect(screen.queryByText("Tuning in…")).toBeNull();
  });

  it("reports the live status, not a default", () => {
    draw(broadcast());
    expect(screen.getByRole("status").textContent).toBe("On air");
    cleanup();
    draw(broadcast({ status: "paused" }));
    expect(screen.getByRole("status").textContent).toBe("Paused");
  });

  it("wires every transport control to the broadcast", () => {
    const radio = broadcast();
    draw(radio);

    fireEvent.click(screen.getByRole("button", { name: "Pause the broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip to the next track" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous radio song" }));
    fireEvent.click(screen.getByRole("button", { name: "Shuffle the queue" }));

    expect(radio.togglePlay).toHaveBeenCalledOnce();
    expect(radio.skip).toHaveBeenCalledOnce();
    expect(radio.previous).toHaveBeenCalledOnce();
    expect(radio.shuffle).toHaveBeenCalledOnce();
  });

  it("resumes rather than pausing when the broadcast is not rolling", () => {
    const radio = broadcast({ status: "blocked" });
    draw(radio);
    fireEvent.click(screen.getByRole("button", { name: "Resume the broadcast" }));
    expect(radio.start).toHaveBeenCalledOnce();
    expect(radio.togglePlay).not.toHaveBeenCalled();
  });

  it("shares the song, not just the page it is on", () => {
    draw(broadcast());
    // A share button per track means a link per track; when every one of them
    // carried window.location they were three buttons doing one thing.
    expect(screen.getByRole("button", { name: "Share Blackbox Psalm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share Corrupted Ivory" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share MOSH Radio" })).toBeTruthy();
  });

  it("folds to a plate that names the song, and comes back", () => {
    draw(broadcast());
    fireEvent.click(screen.getByRole("button", { name: "Minimize the radio player" }));

    expect(screen.queryByRole("region", { name: "MOSH Radio player" })).toBeNull();
    const restore = screen.getByRole("button", { name: "Expand the MOSH Radio player" });
    expect(restore.textContent).toContain("Blackbox Psalm");

    fireEvent.click(restore);
    expect(screen.getByRole("region", { name: "MOSH Radio player" })).toBeTruthy();
  });

  it("keeps the transparency choice across a remount", () => {
    const { unmount } = draw(broadcast());
    fireEvent.change(screen.getByRole("slider", { name: "Player transparency" }), { target: { value: "0.5" } });
    unmount();

    draw(broadcast());
    expect(screen.getByRole("slider", { name: "Player transparency" })).toHaveProperty("value", "0.5");
  });

  it("marks itself as a control surface so the pointer stays findable on it", () => {
    // The cursor is an inverting lens over the canvas and a plain dot over
    // controls; without this attribute the plate gets the lens, which over a
    // Forge wall is indistinguishable from no cursor at all.
    draw(broadcast());
    expect(screen.getByRole("region", { name: "MOSH Radio player" }).dataset.cursorZone).toBe("controls");
  });
});

describe("RadioGesturePrompt", () => {
  it("renders a real control — a browser will not make sound without one", () => {
    const onStart = vi.fn();
    render(<RadioGesturePrompt onStart={onStart} />);
    const button = screen.getByRole("button", { name: /Tap to listen/ });

    fireEvent.click(button);

    expect(onStart).toHaveBeenCalledOnce();
  });
});
