/**
 * Setlists — a whole rig of cues, portable.
 *
 * Slots already worked, but they lived in localStorage, which means they lived
 * on one machine. A VJ who built a set at home and then plugged into the
 * venue's laptop had nothing. That is the difference between a feature and
 * something you can depend on for a show.
 *
 * A setlist is just the preset codec applied nine times and written to a file,
 * so it inherits the same durability guarantee: cues keep resolving after the
 * effect library changes, and a cue referencing something since removed drops
 * that layer instead of taking the whole set down.
 */
import { decodePreset, encodePreset } from "./presetUrl";
import type { Layer } from "@/store/types";

export const SETLIST_VERSION = 1;
export const SETLIST_SLOTS = 9;

export type Setlist = {
  v: number;
  name: string;
  /** Nine entries; null where a slot is empty. */
  cues: (string | null)[];
  savedAt: string;
};

export function exportSetlist(slots: (Layer[] | null)[], name = "MOSH set"): Setlist {
  const cues: (string | null)[] = [];
  for (let i = 0; i < SETLIST_SLOTS; i++) {
    const layers = slots[i];
    // Encode rather than store raw layers: it is a third the size, and it
    // routes every cue through the same decoder that already tolerates a
    // changed library.
    cues.push(layers && layers.length ? encodePreset({ layers }) : null);
  }
  return { v: SETLIST_VERSION, name, cues, savedAt: new Date().toISOString() };
}

export function setlistToJson(set: Setlist): string {
  return JSON.stringify(set, null, 2);
}

/**
 * Parse a setlist file. Never throws.
 *
 * Returns nine entries whatever the file contained — short files are padded,
 * long ones truncated — so callers can index slots without bounds-checking a
 * file they did not write.
 */
export function importSetlist(json: string): { name: string; slots: (Layer[] | null)[] } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  const set = raw as Partial<Setlist>;
  if (typeof set.v !== "number" || set.v > SETLIST_VERSION) return null;
  if (!Array.isArray(set.cues)) return null;

  const slots: (Layer[] | null)[] = [];
  for (let i = 0; i < SETLIST_SLOTS; i++) {
    const cue = set.cues[i];
    if (typeof cue !== "string" || !cue) { slots.push(null); continue; }
    const payload = decodePreset(cue);
    // A cue that no longer decodes becomes an empty slot rather than failing
    // the import — losing one cue mid-show is survivable, losing the set is not.
    slots.push(payload?.layers.length ? payload.layers : null);
  }

  const name = typeof set.name === "string" && set.name.trim() ? set.name.trim() : "Imported set";
  return { name, slots };
}

/** How many cues a setlist actually carries. */
export const cueCount = (slots: (Layer[] | null)[]) =>
  slots.filter(s => s && s.length).length;

/**
 * Read a cue index off a URL: ?cue=1..9 (1-based, as printed on a controller).
 * Returns a 0-based slot index, or null.
 */
export function cueFromUrl(href?: string): number | null {
  try {
    const h = href ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!h) return null;
    const raw = new URL(h).searchParams.get("cue");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > SETLIST_SLOTS) return null;
    return n - 1;
  } catch {
    return null;
  }
}

export function setlistFilename(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "mosh-set";
  return `${safe}-${new Date().toISOString().slice(0, 10)}.moshset.json`;
}
