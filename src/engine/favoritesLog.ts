/**
 * Favorites log — turns saved favorites into a spreadsheet-ready export.
 *
 * Each favorite already stores the exact numeric stack (per-layer effect id,
 * opacity, blend, and every param's value — the "token" for that effect's
 * influence). This module cross-references those ids against the effect
 * registry to expand them into a human-readable row, and keeps the machine
 * side (effect id + raw param values) alongside it so the same row can be
 * re-parsed programmatically.
 */
import type { Favorite, Layer } from "@/store/types";
import { effectRegistryEntry } from "./effectRegistry";

function describeLayer(l: Layer): string {
  const reg = effectRegistryEntry(l.effectId);
  const name = reg?.name ?? l.effectId;
  const params = reg?.params.length
    ? reg.params.map(p => `${p.label}=${(l.params[p.key] ?? p.default).toFixed(3)}`).join(", ")
    : Object.entries(l.params).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(", ");
  return `${name} [${reg?.category ?? "?"}] · opacity=${l.opacity.toFixed(3)} · blend=${l.blend}${params ? ` · ${params}` : ""}`;
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per favorite: identity, link, and a human-readable stack summary. */
export function favoritesToCSV(favorites: Favorite[]): string {
  const header = ["id", "name", "createdAt", "seed", "link", "layerCount", "stack"];
  const rows = favorites.map(f => {
    const stack = f.layers.map(describeLayer).join(" ‖ ");
    return [f.id, f.name, f.createdAt ?? "", f.seed ?? "", f.link ?? "", f.layers.length, stack]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

/**
 * Full machine-readable dump: every layer's raw effectId + params (the exact
 * numeric tokens driving each effect) plus the resolved registry entry, so a
 * consumer never needs a second lookup pass to know what a favorite does.
 */
export function favoritesToJSON(favorites: Favorite[]): string {
  const expanded = favorites.map(f => ({
    id: f.id,
    name: f.name,
    createdAt: f.createdAt,
    seed: f.seed,
    link: f.link,
    layers: f.layers.map(l => ({
      effectId: l.effectId,
      effect: effectRegistryEntry(l.effectId) ?? null,
      opacity: l.opacity,
      blend: l.blend,
      hidden: l.hidden,
      region: l.region ?? null,
      params: l.params,
      mods: l.mods,
      audioMaps: l.audioMaps ?? {},
    })),
  }));
  return JSON.stringify(expanded, null, 2);
}
