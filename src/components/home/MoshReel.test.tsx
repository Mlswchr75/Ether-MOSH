import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoshReel } from "./MoshReel";
import { markFrameDead, resetDeadFrames, type DemoFrame } from "@/data/demoReel";
import type { ReelPlan } from "./useReelDirector";

const frame = (n: number): DemoFrame => ({
  label: `frame ${n}`,
  src: `https://cdn.shopify.com/f/${n}.png?v=1`,
  productUrl: `https://aestheticrebellion.store/products/p-${n}`,
});

const plan = (frames: DemoFrame[]): ReelPlan => ({
  id: 1,
  frames,
  angle: 0,
  sign: 1,
  cx: 50,
  cy: 50,
  speed: 120,
  lifetimeMs: 30_000,
});

/** The frame box a given `<img>` lives in. */
const boxOf = (img: HTMLElement) => img.closest("button") as HTMLButtonElement;

const imgsFor = (src: string) =>
  Array.from(document.querySelectorAll<HTMLImageElement>("img")).filter((i) =>
    i.getAttribute("src")?.startsWith(src),
  );

// No global auto-cleanup in this project, and every test here queries the
// whole document for frames — one leftover tree and the queries lie.
afterEach(cleanup);

beforeEach(() => {
  resetDeadFrames();
  // The strip repeats itself until it outruns the viewport, and jsdom reports
  // zero for both dimensions — pin a real one so the repeat count is stable.
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 800);
  // The scroll loop bails out under reduced motion; jsdom ships no matchMedia,
  // so say plainly that motion is allowed and let the reel run.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});

describe("MoshReel broken frames", () => {
  it("hides a frame whose image will not paint", () => {
    const frames = [frame(1), frame(2), frame(3)];
    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={() => {}} onFrameError={() => {}} />);

    const target = imgsFor(frames[1].src)[0];
    expect(boxOf(target).className).not.toContain("invisible");

    fireEvent.error(target);

    expect(boxOf(target).className).toContain("invisible");
    expect(boxOf(target).className).toContain("pointer-events-none");
  });

  it("takes every repeat of that frame with it, not just the copy that failed", () => {
    const frames = [frame(1), frame(2), frame(3)];
    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={() => {}} onFrameError={() => {}} />);

    const copies = imgsFor(frames[1].src);
    expect(copies.length).toBeGreaterThan(1);

    fireEvent.error(copies[0]);

    copies.forEach((img) => expect(boxOf(img).className).toContain("invisible"));
  });

  it("leaves the other frames alone", () => {
    const frames = [frame(1), frame(2), frame(3)];
    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={() => {}} onFrameError={() => {}} />);

    fireEvent.error(imgsFor(frames[1].src)[0]);

    [frames[0], frames[2]].forEach((f) =>
      imgsFor(f.src).forEach((img) => expect(boxOf(img).className).not.toContain("invisible")),
    );
  });

  it("keeps the box in the layout so the strip does not jump", () => {
    const frames = [frame(1), frame(2), frame(3)];
    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={() => {}} onFrameError={() => {}} />);
    const before = document.querySelectorAll("button").length;

    fireEvent.error(imgsFor(frames[1].src)[0]);

    expect(document.querySelectorAll("button").length).toBe(before);
  });

  it("takes the dead frame out of the tab order and off the accessibility tree", () => {
    const frames = [frame(1), frame(2), frame(3)];
    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={() => {}} onFrameError={() => {}} />);

    const target = imgsFor(frames[1].src)[0];
    expect(boxOf(target).tabIndex).toBe(0);

    fireEvent.error(target);

    expect(boxOf(target).tabIndex).toBe(-1);
    expect(boxOf(target).getAttribute("aria-hidden")).toBe("true");
  });

  it("cannot be moshed once it is broken", () => {
    const frames = [frame(1), frame(2), frame(3)];
    const onSelect = vi.fn();
    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={onSelect} onFrameError={() => {}} />);

    const target = imgsFor(frames[1].src)[0];
    fireEvent.error(target);
    fireEvent.click(boxOf(target));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reports the failure so later reels can skip the url", () => {
    const frames = [frame(1), frame(2)];
    const onFrameError = vi.fn();
    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={() => {}} onFrameError={onFrameError} />);

    fireEvent.error(imgsFor(frames[0].src)[0]);

    expect(onFrameError).toHaveBeenCalledWith(frames[0].src);
  });

  it("never flashes a frame that already failed on an earlier reel", () => {
    const frames = [frame(1), frame(2)];
    markFrameDead(frames[0].src);

    render(<MoshReel plan={plan(frames)} phase="hold" onSelect={() => {}} onFrameError={() => {}} />);

    imgsFor(frames[0].src).forEach((img) => expect(boxOf(img).className).toContain("invisible"));
    imgsFor(frames[1].src).forEach((img) => expect(boxOf(img).className).not.toContain("invisible"));
  });

  it("still labels the frames it can paint", () => {
    render(<MoshReel plan={plan([frame(1)])} phase="hold" onSelect={() => {}} onFrameError={() => {}} />);
    expect(screen.getAllByAltText("frame 1").length).toBeGreaterThan(0);
  });
});
