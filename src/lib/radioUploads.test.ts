import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving a listener's own song. The interesting cases are all refusals: what
 * the client rejects before it starts, and what it does with the server's two
 * named refusals — a hard limit that reads as "please try again" is a button
 * that looks broken.
 */

const state = {
  uploadError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  removed: [] as string[][],
  uploadedPath: "",
};

const supabase = {
  from: () => {
    const builder = {
      insert: () => builder,
      select: () => builder,
      single: async () => ({
        data: state.insertError ? null : { id: "row-1", title: "Song", storage_path: "u/1.mp3", bytes: 12 },
        error: state.insertError,
      }),
    };
    return builder;
  },
  storage: {
    from: () => ({
      upload: async (path: string) => { state.uploadedPath = path; return { error: state.uploadError }; },
      remove: async (paths: string[]) => { state.removed.push(paths); return { error: null }; },
    }),
  },
};

vi.mock("@/integrations/supabase/client", () => ({ supabase }));

const { MAX_SAVED_UPLOADS, saveUpload, uploadIssue } = await import("./radioUploads");

const file = (name: string, size: number, type = "audio/mpeg") =>
  ({ name, size, type }) as unknown as File;

beforeEach(() => {
  state.uploadError = null;
  state.insertError = null;
  state.removed = [];
  state.uploadedPath = "";
});

describe("radio uploads", () => {
  it("accepts a file whose MIME type the browser never filled in", () => {
    // The whole reason this went through validateAudioUpload: plenty of
    // pickers hand over an empty File.type for a song that plays perfectly.
    expect(uploadIssue(file("set.mp3", 4_000_000, ""))).toBeNull();
  });

  it("refuses a zero-byte file a MIME check would have waved through", () => {
    expect(uploadIssue(file("empty.mp3", 0))).toBeTruthy();
  });

  it("refuses a file that isn't audio at all", () => {
    expect(uploadIssue(file("photo.png", 4_000, "image/png"))).toBeTruthy();
  });

  it("refuses a file over the bucket's own limit before uploading it", () => {
    expect(uploadIssue(file("live-set.wav", 80 * 1024 * 1024))).toMatch(/50 MB/);
  });

  it("says a refusal is about supporting, not about retrying", async () => {
    state.insertError = { message: 'new row violates... radio_uploads_supporter_only' };
    await expect(saveUpload("user-1", file("song.mp3", 1_000))).rejects.toThrow(/supporter/i);
  });

  it("names the cap when the account is full", async () => {
    state.insertError = { message: "radio_uploads_limit_reached" };
    await expect(saveUpload("user-1", file("song.mp3", 1_000)))
      .rejects.toThrow(new RegExp(String(MAX_SAVED_UPLOADS)));
  });

  it("cleans up the object when the row it belongs to never lands", async () => {
    state.insertError = { message: "radio_uploads_limit_reached" };
    await saveUpload("user-1", file("song.mp3", 1_000)).catch(() => {});
    // Otherwise the bytes are invisible storage the listener is still charged for.
    expect(state.removed).toHaveLength(1);
  });

  it("puts the object under the uploader's own id, which is what RLS keys on", async () => {
    const saved = await saveUpload("user-1", file("Some Song.mp3", 1_000));
    expect(saved.id).toBe("row-1");
    // (storage.foldername(name))[1] = auth.uid() is the entire reason one
    // listener's music is invisible to every other one in a shared bucket.
    expect(state.uploadedPath.startsWith("user-1/")).toBe(true);
    expect(state.uploadedPath.endsWith(".mp3")).toBe(true);
  });
});
