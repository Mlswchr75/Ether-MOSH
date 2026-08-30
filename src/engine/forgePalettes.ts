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
  { name: "ochre",   colors: ["#E6A817", "#6F3B18", "#140D08"] },
  { name: "moss",    colors: ["#A8C256", "#315C3A", "#07120B"] },
  { name: "oxide",   colors: ["#D85B38", "#6D8C83", "#160B0A"] },
  { name: "mono",    colors: ["#F2EEE6", "#77736D", "#090909"] },
];

type PaletteBrief = { needsColor: number; needsLift: number; needsCompression: number; warmth: number; saturation: number };

/** Automatic palette judgement shared by regular Mosh, Journey and Forge. */
export function chooseArtDirectedPalette(brief: PaletteBrief, rand: () => number = Math.random, currentIdx = -1): number {
  const scored = FORGE_PALETTES.map((palette, index) => {
    const hsls = palette.colors.map(hexToHsl);
    const saturation = hsls.reduce((sum, hsl) => sum + hsl[1], 0) / hsls.length;
    const light = hsls.reduce((sum, hsl) => sum + hsl[2], 0) / hsls.length;
    const warm = hsls.filter(([h]) => h < 75 || h > 330).length / hsls.length;
    let score = saturation * brief.needsColor * 1.2;
    score += light * brief.needsLift * 0.7 + (1 - light) * brief.needsCompression * 0.55;
    score += brief.warmth > 0.57 ? (1 - warm) * 0.8 : brief.warmth < 0.43 ? warm * 0.8 : 0;
    if (brief.saturation > 0.7) score += (1 - saturation) * 0.7;
    if (index === currentIdx) score -= 1.8;
    return { index, score: score + rand() * 0.22 };
  }).sort((a, b) => b.score - a.score);
  return scored[Math.floor(rand() * Math.min(3, scored.length))]?.index ?? 0;
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`.toUpperCase();
}

/** Cheap deterministic 0..1 hash so a numeric seed reliably re-derives the same hue jitter. */
function seedFrac(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Rotates a base palette's hue by a seed-derived amount (and gives saturation
 * a smaller seed-derived nudge) so re-rolling the seed varies *color*, not
 * just the shape/layout the seed already drives — previously every reroll
 * within one palette choice repeated the exact same three hues.
 */
export function seededPalette(base: ForgePalette, seed: number): ForgePalette {
  const hueShift = (seedFrac(seed, 1) - 0.5) * 2 * 55; // ±55°
  const satMul = 0.85 + seedFrac(seed, 2) * 0.3; // 0.85x - 1.15x
  const colors = base.colors.map((hex) => {
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h + hueShift, Math.max(0, Math.min(1, s * satMul)), l);
  }) as [string, string, string];
  return { name: base.name, colors };
}
