/**
 * Forge's colour palettes — shared between the unified editor's forge mode
 * (GlCanvas) and the legacy standalone /forge page, so a palette means the
 * same three colours in both places.
 */
export type ForgePalette = { name: string; colors: [string, string, string] };

export const FORGE_PALETTES: ForgePalette[] = [
  { name: "acid",    colors: ["#FF1F8F", "#00FFB2", "#1A0033"] },
  { name: "chrome",  colors: ["#C0C0C0", "#4488FF", "#0A0A14"] },
  { name: "plasma",  colors: ["#FF4500", "#FF00CC", "#050510"] },
  { name: "drift",   colors: ["#00BFFF", "#7700FF", "#000A1A"] },
  { name: "void",    colors: ["#8800FF", "#00FF88", "#040008"] },
  { name: "heat",    colors: ["#FF6B00", "#FF0033", "#100400"] },
];
