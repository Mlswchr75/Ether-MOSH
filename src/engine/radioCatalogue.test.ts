import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The library now lives in a table, and the one thing that must never happen
 * is a station answering a database problem with silence — so every case here
 * is about what plays when the hosted list is absent, empty, or slow.
 */

const query = {
  rows: [] as unknown[],
  error: null as unknown,
  calls: 0,
};

const supabase = {
  from: vi.fn(() => {
    query.calls++;
    const builder = {
      select: () => builder,
      order: () => builder,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: query.rows, error: query.error }).then(resolve),
    };
    return builder;
  }),
  storage: {
    from: () => ({
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/radio-catalogue/${path}` },
      }),
    }),
  },
};

vi.mock("@/integrations/supabase/client", () => ({ supabase }));

const { SHOWCASE_TRACKS } = await import("./trackPlayer");
const { catalogueSnapshot, catalogueUrl, loadRadioCatalogue, lookupTrack, resetCatalogue } =
  await import("./radioCatalogue");

beforeEach(() => {
  query.rows = [];
  query.error = null;
  query.calls = 0;
  resetCatalogue();
});
afterEach(() => { resetCatalogue(); });

describe("radio catalogue", () => {
  it("starts on the bundled library so the first render already has a rotation", () => {
    expect(catalogueSnapshot()).toEqual(SHOWCASE_TRACKS);
    expect(lookupTrack(SHOWCASE_TRACKS[0].id)).toEqual(SHOWCASE_TRACKS[0]);
  });

  it("replaces the rotation with the hosted rows", async () => {
    query.rows = [{ id: "hosted", storage_path: "hosted.mp3", title: "Hosted", artist: "MOSH", tags: ["flow"] }];
    const tracks = await loadRadioCatalogue();
    expect(tracks).toEqual([{
      id: "hosted",
      url: catalogueUrl("hosted.mp3"),
      title: "Hosted",
      artist: "MOSH",
      tags: ["flow"],
    }]);
    expect(catalogueSnapshot()).toEqual(tracks);
  });

  it("keeps bundled ids resolvable after the hosted list replaces them, so old share links still open", async () => {
    query.rows = [{ id: "hosted", storage_path: "hosted.mp3", title: "Hosted", artist: "MOSH", tags: null }];
    await loadRadioCatalogue();
    expect(lookupTrack(SHOWCASE_TRACKS[1].id)).toEqual(SHOWCASE_TRACKS[1]);
    expect(lookupTrack("hosted")?.title).toBe("Hosted");
  });

  it("plays the bundled songs when the table is empty", async () => {
    expect(await loadRadioCatalogue()).toEqual(SHOWCASE_TRACKS);
  });

  it("plays the bundled songs when the request errors, rather than rejecting", async () => {
    query.error = { message: "offline" };
    await expect(loadRadioCatalogue()).resolves.toEqual(SHOWCASE_TRACKS);
  });

  it("asks the table once per session however many callers hold an id", async () => {
    query.rows = [{ id: "hosted", storage_path: "hosted.mp3", title: "Hosted", artist: "MOSH", tags: null }];
    await Promise.all([loadRadioCatalogue(), loadRadioCatalogue(), loadRadioCatalogue()]);
    expect(query.calls).toBe(1);
  });
});
