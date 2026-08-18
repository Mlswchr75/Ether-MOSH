/**
 * Forge's generator registry — the source-imagery side of Forge, mirroring
 * how effects.ts registers the 105 post-process effects. A generator draws
 * Forge's raw frame; the existing effect stack and Journey director then
 * process it exactly as they always have, unaware anything upstream changed.
 */

import { DRIFT_FIELD } from "./forgeGenerators/driftField";

export type GeneratorCategory = "volumetric" | "cellular" | "organic" | "field";

export type ForgeGeneratorAudio = {
  treble: number;
  beat: number;
  bpm: number;
  regularity: number;
  density: number;
  brightness: number;
  weight: number;
  dynamics: number;
  energy: number;
};

export type ForgeGeneratorCtx = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  t: number;
  seed: string;
  palette: [string, string, string];
  intensity: number;
  audio: ForgeGeneratorAudio;
};

export type ForgeGeneratorKind = "canvas2d" | "webgl";

export type ForgeGeneratorDescriptor = {
  id: string;
  name: string;
  category: GeneratorCategory;
  blurb: string;
  costTier: "cheap" | "moderate" | "heavy";
  kind: ForgeGeneratorKind;
};

export type Canvas2DForgeGenerator = ForgeGeneratorDescriptor & {
  kind: "canvas2d";
  createState: (seed: string) => unknown;
  render: (gctx: ForgeGeneratorCtx, state: unknown) => void;
};

export type ForgeGenerator = Canvas2DForgeGenerator | ForgeGeneratorDescriptor;

/**
 * Widens a strongly-typed Canvas2D generator definition to the registry's
 * `unknown`-state shape exactly once, here, instead of at every call site
 * that reads from GENERATORS_BY_ID.
 */
export function defineGenerator<S>(def: {
  id: string;
  name: string;
  category: GeneratorCategory;
  blurb: string;
  costTier: "cheap" | "moderate" | "heavy";
  kind: "canvas2d";
  createState: (seed: string) => S;
  render: (gctx: ForgeGeneratorCtx, state: S) => void;
}): Canvas2DForgeGenerator {
  return def as unknown as Canvas2DForgeGenerator;
}

/** id used by forgeSource.ts to special-case the WebGL generator's lifecycle. */
export const VOLUMETRIC_BLOOM_ID = "volumetricBloom";

const VOLUMETRIC_BLOOM_DESCRIPTOR: ForgeGeneratorDescriptor = {
  id: VOLUMETRIC_BLOOM_ID,
  name: "Volumetric Bloom",
  category: "volumetric",
  blurb: "A lit, glowing form breathing and morphing against near-black.",
  costTier: "heavy",
  kind: "webgl",
};

export const GENERATORS: ForgeGenerator[] = [VOLUMETRIC_BLOOM_DESCRIPTOR, DRIFT_FIELD];

export const GENERATORS_BY_ID: Record<string, ForgeGenerator> = Object.fromEntries(
  GENERATORS.map(g => [g.id, g]),
);
