import { type ShowcaseTrack } from "@/engine/trackPlayer";
import { lookupTrack } from "@/engine/radioCatalogue";

export const MAX_PLAYLIST_TRACKS = 100;
/**
 * Playlists, favourites and share links all travel as bare track ids, so this
 * is where an id becomes a song again.
 *
 * `lookupTrack` covers the hosted library as well as the bundled one — while
 * the library was a compile-time array this could never miss, and now that it
 * is a table it can. Bundled tracks stay resolvable either way, so a share link
 * made before the move still opens.
 */
export function knownRadioTracks(ids: readonly string[]): ShowcaseTrack[] {
  return [...new Set(ids)].slice(0, MAX_PLAYLIST_TRACKS)
    .flatMap(id => { const track = lookupTrack(id); return track ? [track] : []; });
}

export function radioRequest(href: string) {
  const url = new URL(href);
  return {
    track: knownRadioTracks([url.searchParams.get("track") || ""])[0],
    tracks: knownRadioTracks((url.searchParams.get("queue") || "").slice(0, 6000).split(",")),
    name: (url.searchParams.get("name") || "Shared queue").slice(0, 80),
  };
}

/** Share only stable catalog IDs; never serialize account IDs or audio URLs. */
export function radioLink(options: { track?: ShowcaseTrack; tracks?: readonly ShowcaseTrack[]; name?: string; station?: string } = {}) {
  const url = new URL("https://ether-mosh.online/radio");
  if (options.station && options.station !== "all") url.searchParams.set("station", options.station);
  if (options.tracks?.length) {
    url.searchParams.set("queue", knownRadioTracks(options.tracks.map(t => t.id)).map(t => t.id).join(","));
    if (options.name) url.searchParams.set("name", options.name.slice(0, 80));
  }
  if (options.track) url.searchParams.set("track", options.track.id);
  return url.toString();
}
