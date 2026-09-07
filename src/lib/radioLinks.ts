import { SHOWCASE_TRACKS, type ShowcaseTrack } from "@/engine/trackPlayer";

export const MAX_PLAYLIST_TRACKS = 100;
export function knownRadioTracks(ids: readonly string[]): ShowcaseTrack[] {
  const catalog = new Map(SHOWCASE_TRACKS.map(t => [t.id, t]));
  return [...new Set(ids)].slice(0, MAX_PLAYLIST_TRACKS)
    .flatMap(id => catalog.has(id) ? [catalog.get(id)!] : []);
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
