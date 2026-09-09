/**
 * The station's library, served from storage rather than shipped in the build.
 *
 * Every song used to be a file in `public/audio` — 31 of them, ~106 MB,
 * committed to the repo and re-uploaded on every deploy. That is fine for a
 * handful and stops being fine well before the hundreds this library is headed
 * for: the bytes live in git history forever, the bundle carries them, and
 * adding a song costs a commit and a release.
 *
 * `radio_tracks` now holds the list and `radio-catalogue` holds the audio, so a
 * new song is an upload plus a row. `SHOWCASE_TRACKS` stays as the fallback and
 * is still the thing that plays when the table is empty, unreachable, or the
 * request is simply slower than the listener — a station that answers a network
 * hiccup with silence is worse than one that answers it with the songs it
 * already had.
 */

import { supabase } from "@/integrations/supabase/client";
import { SHOWCASE_TRACKS, type ShowcaseTrack } from "./trackPlayer";

export const CATALOGUE_BUCKET = "radio-catalogue";

/** Public URL for an object in the catalogue bucket. */
export function catalogueUrl(storagePath: string): string {
  return supabase.storage.from(CATALOGUE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Everything the app has resolved so far, by id.
 *
 * Playlists, favourites and share links are all stored as bare track ids and
 * resolved back to tracks later (`knownRadioTracks`). While the library was a
 * compile-time array that lookup could never miss; with the library in a table
 * it can, so what has been loaded is remembered here rather than re-fetched by
 * every caller that holds an id.
 */
const resolved = new Map<string, ShowcaseTrack>(SHOWCASE_TRACKS.map(t => [t.id, t]));

/** The catalogue as currently known — remote rows if they arrived, else bundled. */
let current: ShowcaseTrack[] = [...SHOWCASE_TRACKS];

export function catalogueSnapshot(): ShowcaseTrack[] {
  return [...current];
}

export function lookupTrack(id: string): ShowcaseTrack | undefined {
  return resolved.get(id);
}

/** Test seam — the cache is module-scoped and outlives a single suite case. */
export function resetCatalogue(): void {
  resolved.clear();
  for (const track of SHOWCASE_TRACKS) resolved.set(track.id, track);
  current = [...SHOWCASE_TRACKS];
  pending = null;
}

type CatalogueRow = {
  id: string;
  storage_path: string;
  title: string;
  artist: string;
  tags: string[] | null;
};

function toTrack(row: CatalogueRow): ShowcaseTrack {
  return {
    id: row.id,
    url: catalogueUrl(row.storage_path),
    title: row.title,
    artist: row.artist,
    tags: row.tags ?? undefined,
  };
}

let pending: Promise<ShowcaseTrack[]> | null = null;

/**
 * Load the hosted library, once per session.
 *
 * Never rejects. The station is the main caller and it has to start something;
 * an empty table, a dropped request or a project that is simply asleep all
 * resolve to the bundled list rather than to an error the caller has to invent
 * a recovery for.
 *
 * Hosted rows *replace* the bundled list rather than merging with it, so a song
 * retired from the table is genuinely gone from the rotation. The bundled
 * tracks stay in `resolved` regardless, because an old share link naming one
 * should still resolve even after the table stops offering it.
 */
export function loadRadioCatalogue(): Promise<ShowcaseTrack[]> {
  pending ??= (async () => {
    try {
      const { data, error } = await supabase
        .from("radio_tracks")
        .select("id, storage_path, title, artist, tags")
        .order("sort", { ascending: true })
        .order("title", { ascending: true });
      if (error || !data?.length) return current;

      const tracks = (data as CatalogueRow[]).map(toTrack);
      for (const track of tracks) resolved.set(track.id, track);
      current = tracks;
      return tracks;
    } catch {
      return current;
    }
  })();
  return pending;
}
