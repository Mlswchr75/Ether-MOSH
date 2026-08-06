import { describe, expect, it } from "vitest";
import {
  DELIVERABLES,
  DELIVERABLES_BY_ID,
  clampDuration,
  deliverableFilename,
  isDeliverable,
  validate,
} from "./deliverables";

/**
 * These specs exist so a user finds out about a problem here rather than at an
 * upload form that only says "invalid". The tests guard the rules that actually
 * get files rejected — format and duration — and the honesty of the reporting.
 */

const canvas = DELIVERABLES_BY_ID.spotifyCanvas;

const cap = (over: Partial<Parameters<typeof validate>[1]> = {}) => ({
  mimeType: "video/mp4",
  seconds: 6,
  width: canvas.width,
  height: canvas.height,
  bytes: 500_000,
  ...over,
});

describe("deliverable specs", () => {
  it("has no duplicate ids", () => {
    const ids = DELIVERABLES.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every spec a coherent duration window", () => {
    for (const d of DELIVERABLES) {
      expect(d.minSec, d.id).toBeGreaterThan(0);
      expect(d.maxSec, d.id).toBeGreaterThan(d.minSec);
      expect(d.defaultSec, d.id).toBeGreaterThanOrEqual(d.minSec);
      expect(d.defaultSec, d.id).toBeLessThanOrEqual(d.maxSec);
    }
  });

  it("never asks for an audio track", () => {
    // Silent output keeps MOSH out of the sync-licensing chain entirely, which
    // is a deliberate product position and not an oversight.
    for (const d of DELIVERABLES) expect(d.audio, d.id).toBe(false);
  });

  it("pins Spotify Canvas to its real constraints", () => {
    expect(canvas.width / canvas.height).toBeCloseTo(9 / 16, 3);
    expect(canvas.minSec).toBe(3);
    expect(canvas.maxSec).toBe(8);
    expect(canvas.seamless).toBe(true);
    expect(canvas.accepts).toEqual(["video/mp4"]);
  });
});

describe("duration clamping", () => {
  it("pulls a request into the accepted window", () => {
    expect(clampDuration(canvas, 1)).toBe(3);
    expect(clampDuration(canvas, 30)).toBe(8);
    expect(clampDuration(canvas, 5)).toBe(5);
  });

  it("falls back to the default on nonsense", () => {
    expect(clampDuration(canvas, NaN)).toBe(canvas.defaultSec);
    expect(clampDuration(canvas, Infinity)).toBe(canvas.defaultSec);
  });
});

describe("validation", () => {
  it("passes a correct capture", () => {
    const issues = validate(canvas, cap());
    expect(issues).toEqual([]);
    expect(isDeliverable(issues)).toBe(true);
  });

  it("ignores the codec suffix when checking format", () => {
    // MediaRecorder returns "video/mp4;codecs=avc1.42E01E" — the suffix is not
    // what the platform is asking about.
    expect(validate(canvas, cap({ mimeType: "video/mp4;codecs=avc1.42E01E" }))).toEqual([]);
  });

  it("fails a WebM handed to Spotify, and says what to do", () => {
    const issues = validate(canvas, cap({ mimeType: "video/webm;codecs=vp9" }));
    const fmt = issues.find(i => i.rule === "format")!;
    expect(fmt).toBeTruthy();
    expect(fmt.fatal).toBe(true);
    expect(fmt.message).toMatch(/convert/i);
    expect(isDeliverable(issues)).toBe(false);
  });

  it("catches captures outside the duration window", () => {
    expect(validate(canvas, cap({ seconds: 1 })).some(i => i.rule === "duration" && i.fatal)).toBe(true);
    expect(validate(canvas, cap({ seconds: 20 })).some(i => i.rule === "duration" && i.fatal)).toBe(true);
  });

  it("tolerates a frame-boundary overshoot", () => {
    // MediaRecorder stops on a frame, not on the millisecond it was asked to.
    expect(validate(canvas, cap({ seconds: 8.3 }))).toEqual([]);
    expect(validate(canvas, cap({ seconds: 2.7 }))).toEqual([]);
  });

  it("reports a wrong aspect as a warning, not a rejection", () => {
    const issues = validate(canvas, cap({ width: 1920, height: 1080 }));
    const dim = issues.find(i => i.rule === "dimensions")!;
    expect(dim).toBeTruthy();
    expect(dim.fatal).toBe(false);
    expect(isDeliverable(issues)).toBe(true);
  });

  it("treats an empty capture as fatal and stops there", () => {
    const issues = validate(canvas, cap({ bytes: 0, seconds: 0, mimeType: "" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("empty");
    expect(isDeliverable(issues)).toBe(false);
  });

  it("accepts webm where the platform allows it", () => {
    const tiktok = DELIVERABLES_BY_ID.tiktok;
    expect(validate(tiktok, {
      mimeType: "video/webm;codecs=vp9", seconds: 15,
      width: tiktok.width, height: tiktok.height, bytes: 1000,
    })).toEqual([]);
  });
});

describe("filenames", () => {
  it("matches the extension to what was actually recorded", () => {
    expect(deliverableFilename(canvas, "video/mp4;codecs=avc1")).toMatch(/\.mp4$/);
    expect(deliverableFilename(canvas, "video/webm;codecs=vp9")).toMatch(/\.webm$/);
  });

  it("names the deliverable it was made for", () => {
    expect(deliverableFilename(canvas, "video/mp4")).toContain("spotifyCanvas");
  });

  it("contains no characters that break a download", () => {
    for (const d of DELIVERABLES) {
      expect(deliverableFilename(d, "video/mp4")).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
});
