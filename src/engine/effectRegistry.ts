/**
 * Effect registry — the single source of truth for what every MOSH effect
 * *is*, in two languages at once:
 *
 *   HUMAN  — name, category, blurb, and each parameter's label + range, the
 *            same words a person reads in the editor.
 *   MACHINE — the actual GLSL fragment shader body for that effect. This is
 *            not a paraphrase of the effect; it IS the effect. GLSL is the
 *            universal shading language every GPU, engine, and downstream
 *            tool already speaks, so it doubles as "code for recreating this
 *            effect" without inventing a private format only MOSH understands.
 *
 * Built directly from EFFECTS (src/engine/effects.ts) rather than duplicated
 * by hand, so the registry can never drift out of sync with what the app
 * actually renders — regenerate it any time by calling buildEffectRegistry().
 */
import { EFFECTS, type EffectDef } from "./effects";

/**
 * Renderer.ts widens every effect's "amount" param past its declared max
 * before it reaches the shader (most shader bodies were tuned against a
 * muted top end). This is the same multiplier Renderer.ts applies — kept
 * here, in the file that calls itself "the single source of truth for what
 * every effect *is*", so `renderedMax` below can't drift out of sync with
 * what actually gets rendered.
 */
export const AMOUNT_RENDER_BOOST = 2.0;

export type EffectRegistryEntry = {
  id: string;
  name: string;
  category: string;
  /** Human-language description of what the effect does to its source. */
  blurb: string;
  params: {
    key: string;
    label: string;
    min: number;
    max: number;
    default: number;
    step?: number;
    /**
     * The actual upper bound reaching the shader, if it differs from `max`.
     * Only set for "amount", which Renderer.ts rescales by
     * AMOUNT_RENDER_BOOST past its declared range — a preset validator or
     * external tool reading `max` alone would otherwise describe a
     * different range than what's actually rendered.
     */
    renderedMax?: number;
  }[];
  /** Machine-language recreation: the GLSL fragment shader body. */
  glsl: string;
};

export function buildEffectRegistry(): EffectRegistryEntry[] {
  return EFFECTS.map((e: EffectDef) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    blurb: e.blurb,
    params: e.params.map(p => ({
      key: p.key,
      label: p.label,
      min: p.min,
      max: p.max,
      default: p.default,
      step: p.step,
      ...(p.key === "amount" ? { renderedMax: p.min + (p.max - p.min || 1) * AMOUNT_RENDER_BOOST } : {}),
    })),
    glsl: e.frag.trim(),
  }));
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  // Quote whenever the cell could be misread as a delimiter, a newline, or
  // starts a new field — cheaper to over-quote than to hand-audit every blurb
  // and shader body for commas.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per effect, one row per param nested as a compact summary column. */
export function effectRegistryToCSV(entries: EffectRegistryEntry[]): string {
  const header = ["id", "name", "category", "blurb", "params", "glsl"];
  const rows = entries.map(e => {
    const paramsSummary = e.params
      .map(p => `${p.key}(${p.label}: ${p.min}..${p.max}, default ${p.default})`)
      .join(" | ");
    return [e.id, e.name, e.category, e.blurb, paramsSummary, e.glsl].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function effectRegistryToJSON(entries: EffectRegistryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

let cached: EffectRegistryEntry[] | null = null;
/** Memoised — EFFECTS is a static module-level array, so this never changes at runtime. */
export function getEffectRegistry(): EffectRegistryEntry[] {
  if (!cached) cached = buildEffectRegistry();
  return cached;
}

export function effectRegistryEntry(effectId: string): EffectRegistryEntry | undefined {
  return getEffectRegistry().find(e => e.id === effectId);
}
