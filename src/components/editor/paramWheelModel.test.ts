import { describe, expect, it } from "vitest";
import {
  breadcrumb, clampAnchor, formatScalar, PAGE_SIZE, pageCount, pageSlice,
  scalarFraction, scalarFromFraction, wheelSizeFor,
  type WheelItem, type WheelScalar, type WheelTree,
} from "./paramWheelModel";

const item = (id: string): WheelItem => ({ id, label: id });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(`i${i}`));
const scalar = (over: Partial<WheelScalar> = {}): WheelScalar =>
  ({ value: 0.5, min: 0, max: 1, set: () => {}, ...over });

describe("paging", () => {
  it("keeps a ring-sized node on one page", () => {
    expect(pageCount(PAGE_SIZE)).toBe(1);
    const view = pageSlice(items(PAGE_SIZE), 0);
    expect(view.paged).toBe(false);
    expect(view.items).toHaveLength(PAGE_SIZE);
  });

  it("pages an oversized node, leaving room for the chevrons", () => {
    const view = pageSlice(items(30), 0);
    expect(view.paged).toBe(true);
    // Two of the eight slots go to the chevrons, so a page carries six.
    expect(view.items).toHaveLength(PAGE_SIZE - 2);
    expect(view.items.length + 2).toBeLessThanOrEqual(PAGE_SIZE);
  });

  it("covers every item across its pages, with no gaps or repeats", () => {
    const all = items(30);
    const seen = new Set<string>();
    const pages = pageCount(all.length);
    for (let page = 0; page < pages; page++) {
      for (const entry of pageSlice(all, page).items) {
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
    }
    expect(seen.size).toBe(all.length);
  });

  it("wraps in both directions, so spinning past either end is continuous", () => {
    const all = items(30);
    const pages = pageCount(all.length);
    expect(pageSlice(all, pages).page).toBe(0);
    expect(pageSlice(all, -1).page).toBe(pages - 1);
    expect(pageSlice(all, -pages - 1).page).toBe(pages - 1);
  });

  it("survives an empty node", () => {
    const view = pageSlice([], 3);
    expect(view.items).toEqual([]);
    expect(view.pages).toBe(1);
  });
});

describe("scalars", () => {
  it("round-trips value through fraction", () => {
    const s = scalar({ value: 0.25 });
    expect(scalarFraction(s)).toBeCloseTo(0.25);
    expect(scalarFromFraction(s, 0.25)).toBeCloseTo(0.25);
  });

  it("handles a range that does not start at zero", () => {
    const s = scalar({ value: 120, min: 40, max: 240 });
    expect(scalarFraction(s)).toBeCloseTo(0.4);
    expect(scalarFromFraction(s, 0.4)).toBeCloseTo(120);
  });

  it("handles a signed range", () => {
    const s = scalar({ value: 0, min: -1, max: 1 });
    expect(scalarFraction(s)).toBeCloseTo(0.5);
    expect(scalarFromFraction(s, 0)).toBe(-1);
    expect(scalarFromFraction(s, 1)).toBe(1);
  });

  it("clamps a scrub that runs past either end", () => {
    const s = scalar();
    expect(scalarFromFraction(s, -3)).toBe(0);
    expect(scalarFromFraction(s, 4)).toBe(1);
    expect(scalarFraction(scalar({ value: 99 }))).toBe(1);
    expect(scalarFraction(scalar({ value: -99 }))).toBe(0);
  });

  it("snaps to the step without escaping the range", () => {
    const s = scalar({ value: 120, min: 40, max: 240, step: 1 });
    expect(scalarFromFraction(s, 0.333)).toBe(Math.round(40 + 0.333 * 200));
    expect(scalarFromFraction(s, 1)).toBeLessThanOrEqual(240);
    expect(scalarFromFraction(s, 0)).toBeGreaterThanOrEqual(40);
  });

  it("does not divide by a zero-width range", () => {
    expect(scalarFraction(scalar({ min: 1, max: 1, value: 1 }))).toBe(0);
  });

  it("formats integers as integers and fine values with precision", () => {
    expect(formatScalar(scalar({ value: 120, min: 40, max: 240, step: 1 }))).toBe("120");
    expect(formatScalar(scalar({ value: 0.5 }))).toBe("0.50");
    expect(formatScalar(scalar({ value: 0.5, format: v => `${Math.round(v * 100)}%` }))).toBe("50%");
  });
});

describe("clampAnchor", () => {
  const size = 400;
  const width = 390;
  const height = 844;

  it("keeps the wheel on screen when the gesture is near an edge", () => {
    const near = clampAnchor(10, 10, 300, width, height);
    expect(near.x).toBeGreaterThanOrEqual(150);
    expect(near.y).toBeGreaterThanOrEqual(150);
    const far = clampAnchor(width, height, 300, width, height);
    expect(far.x).toBeLessThanOrEqual(width - 150);
    expect(far.y).toBeLessThanOrEqual(height - 150);
  });

  it("leaves a comfortable gesture where it is", () => {
    expect(clampAnchor(195, 600, 300, width, height)).toEqual({ x: 195, y: 600 });
  });

  it("centres an axis too small for the wheel rather than inverting the clamp", () => {
    // An unsatisfiable clamp would otherwise throw the wheel off screen.
    const anchor = clampAnchor(10, 10, size, width, height);
    expect(anchor.x).toBe(width / 2);
    expect(anchor.y).toBeGreaterThan(0);
    expect(anchor.y).toBeLessThan(height);
  });
});

describe("wheelSizeFor", () => {
  it("fits inside the viewport with room to spare, on phone and desktop", () => {
    for (const [w, h] of [[390, 844], [360, 640], [1440, 900], [844, 390]]) {
      const size = wheelSizeFor(w, h);
      expect(size).toBeLessThan(Math.min(w, h));
      expect(size).toBeGreaterThan(0);
    }
  });

  it("is capped, so a large desktop does not get an absurd ring", () => {
    expect(wheelSizeFor(3840, 2160)).toBe(520);
  });

  it("stays shorter against height than width, keeping the ring in thumb reach", () => {
    // A tall phone: height must not be what sets the size.
    expect(wheelSizeFor(390, 844)).toBeCloseTo(390 * 0.86);
  });
});

describe("breadcrumb", () => {
  const tree: WheelTree = {
    root: { id: "root", title: "Root", items: [] },
    tune: { id: "tune", title: "Tune", parent: "root", items: [] },
    mod: { id: "mod", title: "Mod", parent: "tune", items: [] },
  };

  it("walks to the root, nearest last", () => {
    expect(breadcrumb(tree, "mod").map(n => n.id)).toEqual(["root", "tune", "mod"]);
    expect(breadcrumb(tree, "root").map(n => n.id)).toEqual(["root"]);
  });

  it("returns nothing for an unknown node", () => {
    expect(breadcrumb(tree, "nope")).toEqual([]);
  });

  it("does not spin on a malformed tree — this runs during render", () => {
    const cyclic: WheelTree = {
      a: { id: "a", title: "A", parent: "b", items: [] },
      b: { id: "b", title: "B", parent: "a", items: [] },
    };
    expect(breadcrumb(cyclic, "a").map(n => n.id)).toEqual(["b", "a"]);
  });
});
