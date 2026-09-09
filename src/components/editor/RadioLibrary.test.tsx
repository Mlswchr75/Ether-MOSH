import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { RadioLibrary } from "./RadioLibrary";
import type { RadioBroadcast } from "@/hooks/useRadioBroadcast";
import type { ShowcaseTrack } from "@/engine/trackPlayer";

const entitlements = { isSupporter: false };
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => entitlements }));

const keepUpload = vi.fn(async () => null);
const removeUpload = vi.fn(async () => true);
const libraryState = (extra: Record<string, unknown> = {}) => ({
  user: null, favorites: [], playlists: [], uploads: [], loading: false, busy: false, error: "",
  refresh: vi.fn(), toggleFavorite: vi.fn(), savePlaylist: vi.fn(), deletePlaylist: vi.fn(),
  keepUpload, removeUpload,
  ...extra,
}) as unknown as Parameters<typeof RadioLibrary>[0]["library"];

let library = libraryState();

const track = (id: string, title: string): ShowcaseTrack => ({ id, url: `/audio/${id}.mp3`, title, artist: "MOSH" });
const QUEUE = [track("a", "Alpha"), track("b", "Beta"), track("c", "Gamma")];

function broadcast(overrides: Partial<RadioBroadcast> = {}): RadioBroadcast {
  return {
    config: { active: true, station: "all", hud: true },
    queue: QUEUE, history: [], status: "playing",
    nowPlaying: QUEUE[0], upNext: QUEUE[1], needsGesture: false, paused: false, externalAudio: false,
    previous: vi.fn(), enqueue: vi.fn(), move: vi.fn(), remove: vi.fn(), shuffle: vi.fn(),
    playNow: vi.fn(), playQueue: vi.fn(), start: vi.fn(), skip: vi.fn(), togglePlay: vi.fn(),
    ...overrides,
  };
}

const draw = (radio: RadioBroadcast) =>
  render(<MemoryRouter><RadioLibrary radio={radio} library={library} /><Toaster /></MemoryRouter>);

const rows = () => [...document.querySelectorAll("li")].filter(li => li.getAttribute("draggable") === "true");

/** A DataTransfer stand-in — jsdom ships none, and the handlers touch it. */
const dt = () => ({ effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn() });

afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
  entitlements.isSupporter = false;
  keepUpload.mockClear();
  library = libraryState();
});

describe("the radio queue", () => {
  it("reorders by dragging one song onto another", () => {
    const radio = broadcast();
    draw(radio);
    const [alpha, , gamma] = rows();

    fireEvent.dragStart(alpha, { dataTransfer: dt() });
    fireEvent.dragOver(gamma, { dataTransfer: dt() });
    fireEvent.drop(gamma, { dataTransfer: dt() });

    expect(radio.move).toHaveBeenCalledWith(0, 2);
  });

  it("does nothing when a song is dropped back where it started", () => {
    const radio = broadcast();
    draw(radio);
    const [alpha] = rows();

    fireEvent.dragStart(alpha, { dataTransfer: dt() });
    fireEvent.drop(alpha, { dataTransfer: dt() });

    expect(radio.move).not.toHaveBeenCalled();
  });

  it("keeps the arrows, which are the only way to do this by touch or keyboard", () => {
    // HTML5 drag-and-drop does not fire for touch at all, and cannot be driven
    // from a keyboard — so these are not a lesser fallback.
    const radio = broadcast();
    draw(radio);

    fireEvent.click(screen.getByRole("button", { name: "Move Beta up" }));
    expect(radio.move).toHaveBeenCalledWith(1, 0);
  });

  it("marks the row being dragged over, and clears it when the drag ends", () => {
    draw(broadcast());
    const [alpha, beta] = rows();

    fireEvent.dragStart(alpha, { dataTransfer: dt() });
    fireEvent.dragOver(beta, { dataTransfer: dt() });
    expect(beta.className).toContain("bg-cyan-200/10");

    fireEvent.dragEnd(alpha);
    expect(beta.className).not.toContain("bg-cyan-200/10");
  });
});

describe("adding your own songs", () => {
  it("queues a chosen file without uploading it anywhere", async () => {
    const radio = broadcast();
    draw(radio);
    // jsdom has no createObjectURL; the point is that a blob: url is what
    // reaches the queue, since that is what assertSafeTrackUrl admits.
    const createObjectURL = vi.fn(() => "blob:mosh/abc");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL }));

    const input = screen.getByLabelText("Add your own songs to the queue") as HTMLInputElement;
    const file = new File(["fake audio"], "Night Drive.mp3", { type: "audio/mpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(radio.enqueue).toHaveBeenCalled());
    const queued = (radio.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0] as ShowcaseTrack;
    expect(queued.url).toBe("blob:mosh/abc");
    expect(queued.title).toBe("Night Drive");
    expect(queued.artist).toBe("Your upload");
  });

  it("refuses a file that isn't audio rather than queueing silence", async () => {
    const radio = broadcast();
    draw(radio);

    const input = screen.getByLabelText("Add your own songs to the queue") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "cover.png", { type: "image/png" })] } });

    await screen.findByText(/isn't audio/i);
    expect(radio.enqueue).not.toHaveBeenCalled();
  });

  it("queues a song whose MIME type the browser left blank", async () => {
    // A MIME-only filter drops these, and they play perfectly — plenty of
    // pickers (share sheets, some Android file providers) send an empty type.
    const radio = broadcast();
    draw(radio);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mosh/abc") }));

    const input = screen.getByLabelText("Add your own songs to the queue") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["fake audio"], "Set 03.m4a", { type: "" })] } });

    await waitFor(() => expect(radio.enqueue).toHaveBeenCalled());
  });

  it("refuses an empty file, which a MIME check would have queued as silence", async () => {
    const radio = broadcast();
    draw(radio);

    const input = screen.getByLabelText("Add your own songs to the queue") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([], "Empty.mp3", { type: "audio/mpeg" })] } });

    await waitFor(() => expect(radio.enqueue).not.toHaveBeenCalled());
  });

  it("offers to keep a song only to a signed-in supporter", async () => {
    draw(broadcast());
    expect(screen.queryByLabelText(/keep on my account/i)).toBeNull();
    cleanup();

    entitlements.isSupporter = true;
    library = libraryState({ user: { id: "user-1" } });
    draw(broadcast());
    expect(screen.getByText(/keep on my account/i)).toBeTruthy();
  });

  it("queues the song first and saves it second, so a failed save costs nothing", async () => {
    entitlements.isSupporter = true;
    library = libraryState({ user: { id: "user-1" } });
    const radio = broadcast();
    draw(radio);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mosh/abc") }));

    fireEvent.click(screen.getByRole("checkbox", { name: /keep on my account/i }));
    const input = screen.getByLabelText("Add your own songs to the queue") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["fake audio"], "Kept.mp3", { type: "audio/mpeg" })] } });

    await waitFor(() => expect(keepUpload).toHaveBeenCalled());
    expect(radio.enqueue).toHaveBeenCalled();
  });
});

describe("songs kept on the account", () => {
  it("lists them with the cap, so the limit is visible before it bites", () => {
    library = libraryState({
      user: { id: "user-1" },
      uploads: [{ id: "u1", title: "Kept Song", storagePath: "user-1/1.mp3", bytes: 12 }],
    });
    draw(broadcast());
    expect(screen.getByText(/Your saved songs · 1\/100/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kept Song" })).toBeTruthy();
  });

  it("removes one on request", () => {
    library = libraryState({
      user: { id: "user-1" },
      uploads: [{ id: "u1", title: "Kept Song", storagePath: "user-1/1.mp3", bytes: 12 }],
    });
    draw(broadcast());
    fireEvent.click(screen.getByRole("button", { name: "Remove Kept Song from your account" }));
    expect(removeUpload).toHaveBeenCalled();
  });
});
