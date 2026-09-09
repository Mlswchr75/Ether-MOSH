import { describe, expect, it } from "vitest";
import { assertSafeTrackUrl, SHOWCASE_TRACKS } from "./trackPlayer";

/**
 * The guard between `setSource` and an audio element's `.src`.
 *
 * It got wider when the library moved into storage — it can no longer check
 * membership in a compile-time array, because the list is a table now. These
 * cases are the new boundary: this project's own buckets, and nothing that
 * merely resembles them.
 */

const ORIGIN = "https://test-project.supabase.co"; // vitest.config.ts

describe("assertSafeTrackUrl", () => {
  it("admits object URLs — a locally-picked file never leaves the machine", () => {
    expect(assertSafeTrackUrl("blob:https://ether-mosh.online/abc")).toBeTruthy();
  });

  it("admits the bundled tracks", () => {
    expect(assertSafeTrackUrl(SHOWCASE_TRACKS[1].url)).toBeTruthy();
  });

  it("admits an object in the public catalogue bucket", () => {
    expect(assertSafeTrackUrl(`${ORIGIN}/storage/v1/object/public/radio-catalogue/song.mp3`)).toBeTruthy();
  });

  it("admits a signed URL for a listener's own upload", () => {
    expect(assertSafeTrackUrl(`${ORIGIN}/storage/v1/object/sign/radio-uploads/uid/song.mp3?token=x`)).toBeTruthy();
  });

  it("refuses another bucket on the same project", () => {
    expect(() => assertSafeTrackUrl(`${ORIGIN}/storage/v1/object/public/avatars/song.mp3`)).toThrow();
  });

  it("refuses a lookalike origin", () => {
    // The prefix check alone would pass this one, which is why both run.
    expect(() => assertSafeTrackUrl(
      "https://test-project.supabase.co.evil.example/storage/v1/object/public/radio-catalogue/song.mp3",
    )).toThrow();
  });

  it("refuses an off-origin URL that ends in the right path", () => {
    expect(() => assertSafeTrackUrl(
      "https://evil.example/storage/v1/object/public/radio-catalogue/song.mp3",
    )).toThrow();
  });

  it("refuses a plain remote file and a javascript: URL", () => {
    expect(() => assertSafeTrackUrl("https://evil.example/song.mp3")).toThrow();
    expect(() => assertSafeTrackUrl("javascript:alert(1)")).toThrow();
  });
});
