/**
 * Forge's assembled generator list — separate from forgeGenerators.ts (the
 * types + defineGenerator kit) specifically to avoid a runtime import cycle.
 *
 * Every generator module (./forgeGenerators/*) imports types and
 * `defineGenerator` FROM forgeGenerators.ts. If forgeGenerators.ts also
 * imported generator modules (to build GENERATORS itself, as an earlier
 * version of this file did), that becomes a cycle: whichever of the two
 * modules a test or caller reaches first ends up mid-evaluation when the
 * other tries to read back from it, and `DRIFT_FIELD` (or any other
 * generator) is still `undefined` at the moment GENERATORS_BY_ID is built —
 * Object.fromEntries then throws reading `.id` off `undefined`.
 *
 * This file is the only thing allowed to import both sides: it depends on
 * forgeGenerators.ts and every generator module, but nothing imports this
 * file back except consumers (forgeCompose.ts, forgeSource.ts) that never
 * feed into a generator's own module graph. One direction, no cycle.
 */
import { VOLUMETRIC_BLOOM_DESCRIPTOR, type ForgeGenerator } from "./forgeGenerators";
import { DRIFT_FIELD } from "./forgeGenerators/driftField";
import { SHATTER_FIELD } from "./forgeGenerators/shatterField";
import { POUR_BLOOM } from "./forgeGenerators/pourBloom";

export const GENERATORS: ForgeGenerator[] = [VOLUMETRIC_BLOOM_DESCRIPTOR, DRIFT_FIELD, SHATTER_FIELD, POUR_BLOOM];

export const GENERATORS_BY_ID: Record<string, ForgeGenerator> = Object.fromEntries(
  GENERATORS.map(g => [g.id, g]),
);
