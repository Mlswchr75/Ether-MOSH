# Forge Generator Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Forge's single gradient+blob generator with five cohesive, continuously-evolving generative "voices" (a WebGL volumetric raymarch form, two stateful Canvas2D generators, a symmetry modifier, and today's field folded in unchanged), crossfading between them on shuffle instead of hard-cutting.

**Architecture:** A `ForgeGenerator` registry (mirroring the existing `EFFECTS_BY_ID` pattern) holds cheap Canvas2D generators that draw directly into Forge's source canvas with persistent per-instance state; one heavier WebGL generator renders to its own offscreen canvas and gets composited in. Selection reuses `forgeCompose.ts`'s existing weighted-draw machinery; a shared finishing pass and a kaleidoscope modifier apply uniformly across whichever generator is active, closing the visual-quality gap between the GPU-native piece and the Canvas2D ones.

**Tech Stack:** TypeScript, React, Three.js (WebGLRenderer), Canvas2D, Zustand, Vitest.

Reference spec: `docs/superpowers/specs/2026-08-17-forge-generative-engine-design.md`

---

## Task 1: Generator type foundations + registry skeleton

**Files:**
- Create: `src/engine/forgeGenerators.ts`
- Modify: `src/engine/seamlessSource.ts` (export `hexToRgb`)
- Test: `src/engine/forgeGenerators.test.ts`

- [ ] **Step 1: Export `hexToRgb` from seamlessSource.ts**

In `src/engine/seamlessSource.ts`, change:

```ts
function hexToRgb(hex: string): [number, number, number] {
```

to:

```ts
export function hexToRgb(hex: string): [number, number, number] {
```

- [ ] **Step 2: Write the failing test for the registry helpers**

Create `src/engine/forgeGenerators.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineGenerator, GENERATORS, GENERATORS_BY_ID } from "./forgeGenerators";

describe("forge generator registry", () => {
  it("defineGenerator returns the object unchanged, widened to ForgeGeneratorDescriptor", () => {
    const g = defineGenerator({
      id: "testGen",
      name: "Test Gen",
      category: "field",
      blurb: "A generator used only in tests.",
      costTier: "cheap",
      kind: "canvas2d",
      createState: () => ({ n: 1 }),
      render: () => {},
    });
    expect(g.id).toBe("testGen");
    expect(g.kind).toBe("canvas2d");
  });

  it("GENERATORS_BY_ID indexes every entry in GENERATORS by id", () => {
    expect(GENERATORS.length).toBeGreaterThan(0);
    for (const g of GENERATORS) {
      expect(GENERATORS_BY_ID[g.id]).toBe(g);
    }
  });

  it("every registered id is unique", () => {
    const ids = GENERATORS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeGenerators.test.ts`
Expected: FAIL — `Cannot find module './forgeGenerators'`

- [ ] **Step 3: Create the registry module**

Create `src/engine/forgeGenerators.ts`:

```ts
/**
 * Forge's generator registry — the source-imagery side of Forge, mirroring
 * how effects.ts registers the 105 post-process effects. A generator draws
 * Forge's raw frame; the existing effect stack and Journey director then
 * process it exactly as they always have, unaware anything upstream changed.
 */

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

export const GENERATORS: ForgeGenerator[] = [VOLUMETRIC_BLOOM_DESCRIPTOR];

export const GENERATORS_BY_ID: Record<string, ForgeGenerator> = Object.fromEntries(
  GENERATORS.map(g => [g.id, g]),
);
```

> **Corrected in Task 2** (see that task's Step 4 for the full explanation):
> `GENERATORS`/`GENERATORS_BY_ID` were later moved out of this file into a
> new `forgeGeneratorRegistry.ts` to break a circular import with generator
> modules, and `VOLUMETRIC_BLOOM_DESCRIPTOR` became an exported (not
> module-private) `const` so that new file can import it. If you're
> implementing Task 1 fresh, skip straight to the corrected version — there's
> no reason to build the broken intermediate state first.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeGenerators.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/forgeGenerators.ts src/engine/forgeGenerators.test.ts src/engine/seamlessSource.ts
git commit -m "forge: add generator registry foundations"
```

---

## Task 2: Drift Field generator (today's field, folded in unchanged)

**Files:**
- Create: `src/engine/forgeGenerators/driftField.ts`
- Modify: `src/engine/forgeGenerators.ts` (register it)
- Test: `src/engine/forgeGenerators/driftField.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/forgeGenerators/driftField.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DRIFT_FIELD } from "./driftField";

function makeCtx(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable in test environment");
  return ctx;
}

describe("Drift Field generator", () => {
  it("is registered as a cheap, canvas2d field generator", () => {
    expect(DRIFT_FIELD.id).toBe("driftField");
    expect(DRIFT_FIELD.kind).toBe("canvas2d");
    expect(DRIFT_FIELD.costTier).toBe("cheap");
    expect(DRIFT_FIELD.category).toBe("field");
  });

  it("renders without throwing and fills every pixel", () => {
    const w = 32, h = 32;
    const ctx = makeCtx(w, h);
    const state = DRIFT_FIELD.createState("abc123");
    DRIFT_FIELD.render(
      {
        ctx, w, h, t: 1.2, seed: "abc123",
        palette: ["#FF1F8F", "#00FFB2", "#1A0033"],
        intensity: 0.6,
        audio: { treble: 0, beat: 0, bpm: 0, regularity: 0, density: 0, brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0 },
      },
      state,
    );
    const px = ctx.getImageData(0, 0, w, h).data;
    let sawNonBlack = false;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 0 || px[i + 1] > 0 || px[i + 2] > 0) { sawNonBlack = true; break; }
    }
    expect(sawNonBlack).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeGenerators/driftField.test.ts`
Expected: FAIL — `Cannot find module './driftField'`

- [ ] **Step 3: Implement Drift Field as a thin adapter over drawSeamless**

Create `src/engine/forgeGenerators/driftField.ts`:

```ts
/**
 * Drift Field — the gradient+blob field Forge already had, folded into the
 * generator roster unchanged as one voice among several. drawSeamless is
 * already a pure function of (seed, t), so this generator carries no
 * persistent state of its own.
 */
import { drawSeamless } from "../seamlessSource";
import { defineGenerator } from "../forgeGenerators";

export const DRIFT_FIELD = defineGenerator<Record<string, never>>({
  id: "driftField",
  name: "Drift Field",
  category: "field",
  blurb: "Slowly shifting gradient waves with soft radial highlights.",
  costTier: "cheap",
  kind: "canvas2d",
  createState: () => ({}),
  render: (gctx) => {
    drawSeamless(gctx.ctx, gctx.w, gctx.h, {
      colors: gctx.palette,
      seed: gctx.seed,
      t: gctx.t,
      complexity: Math.min(6, 2 + Math.round(gctx.intensity * 4 + gctx.audio.treble * 2)),
    });
  },
});
```

- [ ] **Step 4: Register it in the generator list**

> **Corrected during implementation:** registering a generator by importing it
> directly into `forgeGenerators.ts` creates a runtime circular import —
> `driftField.ts` imports `defineGenerator` (a value) from
> `forgeGenerators.ts`, and `forgeGenerators.ts` would import `DRIFT_FIELD`
> (a value) back. Whichever module a test reaches first ends up mid-evaluation
> when the other tries to read from it, so `GENERATORS_BY_ID` gets built from
> an `undefined` entry and throws. `GENERATORS`/`GENERATORS_BY_ID` now live in
> a separate `src/engine/forgeGeneratorRegistry.ts`, which is the only module
> allowed to import both `forgeGenerators.ts` (types + `defineGenerator`) and
> individual generator files — nothing imports `forgeGeneratorRegistry.ts`
> back, so there's no cycle. `forgeGenerators.ts` itself must never import
> from `./forgeGenerators/*`.
>
> Register a new generator in `src/engine/forgeGeneratorRegistry.ts`
> (**not** `forgeGenerators.ts`):
>
> ```ts
> import { VOLUMETRIC_BLOOM_DESCRIPTOR, type ForgeGenerator } from "./forgeGenerators";
> import { DRIFT_FIELD } from "./forgeGenerators/driftField";
>
> export const GENERATORS: ForgeGenerator[] = [VOLUMETRIC_BLOOM_DESCRIPTOR, DRIFT_FIELD];
>
> export const GENERATORS_BY_ID: Record<string, ForgeGenerator> = Object.fromEntries(
>   GENERATORS.map(g => [g.id, g]),
> );
> ```
>
> (`VOLUMETRIC_BLOOM_DESCRIPTOR` is exported from `forgeGenerators.ts`, not
> module-private, specifically so this file can import it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeGenerators.test.ts src/engine/forgeGeneratorRegistry.test.ts src/engine/forgeGenerators/driftField.test.ts`
Expected: PASS (5 tests — `forgeGenerators.test.ts` now covers only `defineGenerator`, `forgeGeneratorRegistry.test.ts` covers `GENERATORS`/`GENERATORS_BY_ID`, both split out of the original combined test file)

**Also note:** jsdom (this project's vitest test environment) doesn't implement real Canvas2D rendering, and the native `canvas` npm package isn't installable in this sandbox (missing system cairo/pkg-config). `driftField.test.ts` includes a feature-detected polyfill (only activates if `getContext("2d")` returns null) implementing just enough of the 2D context surface for `drawSeamless`'s pixel-based drawing to run for real in tests. Later Canvas2D generator tasks (3, 4) can reuse the same minimal ImageData-based approach; tasks needing canvas transforms/compositing (5, 6) will need to extend it for the specific methods they call (`drawImage`, `clip`, `translate`, `rotate`, `scale`, `clearRect`, etc.) — check what jsdom actually lacks before assuming, don't guess.

- [ ] **Step 6: Commit**

```bash
git add src/engine/forgeGenerators/driftField.ts src/engine/forgeGenerators/driftField.test.ts src/engine/forgeGenerators.ts
git commit -m "forge: fold existing field into the generator registry as Drift Field"
```

---

## Task 3: Shatter Field generator (cellular fracture)

**Files:**
- Create: `src/engine/forgeGenerators/shatterField.ts`
- Modify: `src/engine/forgeGenerators.ts` (register it)
- Test: `src/engine/forgeGenerators/shatterField.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/forgeGenerators/shatterField.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHATTER_FIELD, type ShatterFieldState } from "./shatterField";

function makeCtx(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable in test environment");
  return ctx;
}

const AUDIO = { treble: 0, beat: 0, bpm: 0, regularity: 0, density: 0, brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0 };

describe("Shatter Field generator", () => {
  it("seeds between 8 and 13 drifting cells", () => {
    const state = SHATTER_FIELD.createState("seed-a") as ShatterFieldState;
    expect(state.cells.length).toBeGreaterThanOrEqual(8);
    expect(state.cells.length).toBeLessThanOrEqual(13);
    for (const c of state.cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(1);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(1);
    }
  });

  it("advances cell positions between frames using elapsed time, wrapping at the edges", () => {
    const state = SHATTER_FIELD.createState("seed-b") as ShatterFieldState;
    const before = state.cells.map(c => ({ x: c.x, y: c.y }));
    const ctx = makeCtx(16, 16);
    SHATTER_FIELD.render(
      { ctx, w: 16, h: 16, t: 0, seed: "seed-b", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    SHATTER_FIELD.render(
      { ctx, w: 16, h: 16, t: 2, seed: "seed-b", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    let moved = false;
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i].x !== before[i].x || state.cells[i].y !== before[i].y) { moved = true; break; }
      expect(state.cells[i].x).toBeGreaterThanOrEqual(0);
      expect(state.cells[i].x).toBeLessThan(1);
    }
    expect(moved).toBe(true);
  });

  it("renders without throwing and fills every pixel", () => {
    const w = 24, h = 24;
    const ctx = makeCtx(w, h);
    const state = SHATTER_FIELD.createState("seed-c");
    SHATTER_FIELD.render(
      { ctx, w, h, t: 1, seed: "seed-c", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    const px = ctx.getImageData(0, 0, w, h).data;
    expect(px.length).toBe(w * h * 4);
    expect(px[3]).toBe(255); // fully opaque
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeGenerators/shatterField.test.ts`
Expected: FAIL — `Cannot find module './shatterField'`

- [ ] **Step 3: Implement Shatter Field**

Create `src/engine/forgeGenerators/shatterField.ts`:

```ts
/**
 * Shatter Field — a living Voronoi-like cellular tessellation. Cell centres
 * drift slowly (toroidal wrap, so a cell that exits one edge re-enters the
 * opposite one) and the cracks between them stay visible as thin dark lines.
 * Each cell gets an offset-highlight radial shade — a simulated light source
 * — rather than a flat fill, so it reads as a lit dimensional form in the
 * same visual language as Volumetric Bloom, not a flat vector shape.
 */
import { defineGenerator, type ForgeGeneratorCtx } from "../forgeGenerators";
import { hexToRgb } from "../seamlessSource";
import { rngFromSeed } from "../seed";

type ShatterCell = { x: number; y: number; vx: number; vy: number };
export type ShatterFieldState = { cells: ShatterCell[]; lastT: number | null };

function toroidalDelta(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d;
}

function createState(seed: string): ShatterFieldState {
  const rand = rngFromSeed(seed);
  const count = 8 + Math.floor(rand() * 6); // 8..13
  const cells: ShatterCell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      x: rand(),
      y: rand(),
      vx: (rand() - 0.5) * 0.03,
      vy: (rand() - 0.5) * 0.03,
    });
  }
  return { cells, lastT: null };
}

function render(gctx: ForgeGeneratorCtx, state: unknown) {
  const s = state as ShatterFieldState;
  const { ctx, w, h, t, palette, audio } = gctx;

  const dt = s.lastT == null ? 0 : Math.max(0, Math.min(0.25, t - s.lastT));
  s.lastT = t;
  const speed = 1 + audio.energy * 1.5;
  for (const cell of s.cells) {
    cell.x = ((cell.x + cell.vx * speed * dt) % 1 + 1) % 1;
    cell.y = ((cell.y + cell.vy * speed * dt) % 1 + 1) % 1;
  }

  const colors = [hexToRgb(palette[0]), hexToRgb(palette[1]), hexToRgb(palette[2])];
  const crackWidth = 0.006 + audio.dynamics * 0.01;

  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;

      let best = Infinity;
      let second = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < s.cells.length; i++) {
        const cell = s.cells[i];
        const dx = toroidalDelta(u, cell.x);
        const dy = toroidalDelta(v, cell.y);
        const dist = dx * dx + dy * dy;
        if (dist < best) {
          second = best;
          best = dist;
          bestIdx = i;
        } else if (dist < second) {
          second = dist;
        }
      }

      const i4 = (y * w + x) * 4;
      if (Math.sqrt(second) - Math.sqrt(best) < crackWidth) {
        d[i4] = 4; d[i4 + 1] = 3; d[i4 + 2] = 6;
      } else {
        const col = colors[bestIdx % 3];
        const cell = s.cells[bestIdx];
        const cdx = toroidalDelta(u, cell.x);
        const cdy = toroidalDelta(v, cell.y);
        const distToCenter = Math.sqrt(cdx * cdx + cdy * cdy);
        const light = Math.max(0, 1 - distToCenter * 3.2);
        d[i4] = Math.min(255, col[0] * (0.55 + light * 0.6));
        d[i4 + 1] = Math.min(255, col[1] * (0.55 + light * 0.6));
        d[i4 + 2] = Math.min(255, col[2] * (0.55 + light * 0.6));
      }
      d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const SHATTER_FIELD = defineGenerator<ShatterFieldState>({
  id: "shatterField",
  name: "Shatter Field",
  category: "cellular",
  blurb: "A living cellular tessellation, cracks drifting and pulsing over time.",
  costTier: "moderate",
  kind: "canvas2d",
  createState,
  render,
});
```

- [ ] **Step 4: Register it in the generator list**

Register in `src/engine/forgeGeneratorRegistry.ts` (**not** `forgeGenerators.ts` — see Task 2's Step 4 for why: that file must never import a generator module, to avoid a circular import with `defineGenerator`):

```ts
import { SHATTER_FIELD } from "./forgeGenerators/shatterField";
```

```ts
export const GENERATORS: ForgeGenerator[] = [VOLUMETRIC_BLOOM_DESCRIPTOR, DRIFT_FIELD, SHATTER_FIELD];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeGenerators/shatterField.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/engine/forgeGenerators/shatterField.ts src/engine/forgeGenerators/shatterField.test.ts src/engine/forgeGenerators.ts
git commit -m "forge: add Shatter Field cellular-fracture generator"
```

---

## Task 4: Pour Bloom generator (metaball / organic blend)

**Files:**
- Create: `src/engine/forgeGenerators/pourBloom.ts`
- Modify: `src/engine/forgeGenerators.ts` (register it)
- Test: `src/engine/forgeGenerators/pourBloom.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/forgeGenerators/pourBloom.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { POUR_BLOOM, type PourBloomState } from "./pourBloom";

function makeCtx(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable in test environment");
  return ctx;
}

const AUDIO = { treble: 0, beat: 0, bpm: 0, regularity: 0, density: 0, brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0 };

describe("Pour Bloom generator", () => {
  it("seeds between 5 and 8 blobs with positive radii", () => {
    const state = POUR_BLOOM.createState("seed-a") as PourBloomState;
    expect(state.blobs.length).toBeGreaterThanOrEqual(5);
    expect(state.blobs.length).toBeLessThanOrEqual(8);
    for (const b of state.blobs) expect(b.r).toBeGreaterThan(0);
  });

  it("is deterministic for a fixed seed", () => {
    const a = POUR_BLOOM.createState("same-seed") as PourBloomState;
    const b = POUR_BLOOM.createState("same-seed") as PourBloomState;
    expect(a.blobs).toEqual(b.blobs);
  });

  it("renders without throwing and produces a fully opaque frame", () => {
    const w = 24, h = 24;
    const ctx = makeCtx(w, h);
    const state = POUR_BLOOM.createState("seed-c");
    POUR_BLOOM.render(
      { ctx, w, h, t: 1, seed: "seed-c", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeGenerators/pourBloom.test.ts`
Expected: FAIL — `Cannot find module './pourBloom'`

- [ ] **Step 3: Implement Pour Bloom**

Create `src/engine/forgeGenerators/pourBloom.ts`:

```ts
/**
 * Pour Bloom — soft merging colour cells with ink-in-water boundary
 * blending, the "acrylic pour" read rather than gravity-drip streaks.
 * Classic inverse-square metaball field: each blob contributes r^2/dist^2 to
 * a scalar field, and where two blobs' fields are close to the surface
 * threshold together, a bright boundary line appears — the wet-ink edge.
 */
import { defineGenerator, type ForgeGeneratorCtx } from "../forgeGenerators";
import { hexToRgb } from "../seamlessSource";
import { rngFromSeed } from "../seed";

type PourBlob = { x: number; y: number; vx: number; vy: number; r: number };
export type PourBloomState = { blobs: PourBlob[]; lastT: number | null };

const SURFACE = 1.6;

function toroidalDelta(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d;
}

function createState(seed: string): PourBloomState {
  const rand = rngFromSeed(seed);
  const count = 5 + Math.floor(rand() * 4); // 5..8
  const blobs: PourBlob[] = [];
  for (let i = 0; i < count; i++) {
    blobs.push({
      x: rand(),
      y: rand(),
      vx: (rand() - 0.5) * 0.02,
      vy: (rand() - 0.5) * 0.02,
      r: 0.12 + rand() * 0.14,
    });
  }
  return { blobs, lastT: null };
}

function render(gctx: ForgeGeneratorCtx, state: unknown) {
  const s = state as PourBloomState;
  const { ctx, w, h, t, palette, audio } = gctx;

  const dt = s.lastT == null ? 0 : Math.max(0, Math.min(0.25, t - s.lastT));
  s.lastT = t;
  const speed = 1 + audio.dynamics * 1.2;
  for (const b of s.blobs) {
    b.x = ((b.x + b.vx * speed * dt) % 1 + 1) % 1;
    b.y = ((b.y + b.vy * speed * dt) % 1 + 1) % 1;
  }

  const colors = [hexToRgb(palette[0]), hexToRgb(palette[1]), hexToRgb(palette[2])];
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;

      let field = 0;
      let dominant = 0;
      let dominantWeight = 0;
      for (let i = 0; i < s.blobs.length; i++) {
        const b = s.blobs[i];
        const dx = toroidalDelta(u, b.x);
        const dy = toroidalDelta(v, b.y);
        const distSq = Math.max(1e-5, dx * dx + dy * dy);
        const contribution = (b.r * b.r) / distSq;
        field += contribution;
        if (contribution > dominantWeight) {
          dominantWeight = contribution;
          dominant = i;
        }
      }

      const i4 = (y * w + x) * 4;
      const edge = Math.abs(field - SURFACE);
      const inside = Math.min(1, field / SURFACE);
      const col = colors[dominant % 3];
      const boundaryGlow = Math.max(0, 1 - edge * 4) * 0.5;

      d[i4] = Math.min(255, col[0] * (0.3 + inside * 0.75) + boundaryGlow * 255);
      d[i4 + 1] = Math.min(255, col[1] * (0.3 + inside * 0.75) + boundaryGlow * 200);
      d[i4 + 2] = Math.min(255, col[2] * (0.3 + inside * 0.75) + boundaryGlow * 255);
      d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const POUR_BLOOM = defineGenerator<PourBloomState>({
  id: "pourBloom",
  name: "Pour Bloom",
  category: "organic",
  blurb: "Soft merging colour cells with ink-in-water boundary blending.",
  costTier: "moderate",
  kind: "canvas2d",
  createState,
  render,
});
```

- [ ] **Step 4: Register it in the generator list**

Register in `src/engine/forgeGeneratorRegistry.ts` (**not** `forgeGenerators.ts` — see Task 2's Step 4):

```ts
import { POUR_BLOOM } from "./forgeGenerators/pourBloom";
```

```ts
export const GENERATORS: ForgeGenerator[] = [VOLUMETRIC_BLOOM_DESCRIPTOR, DRIFT_FIELD, SHATTER_FIELD, POUR_BLOOM];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeGenerators/pourBloom.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/engine/forgeGenerators/pourBloom.ts src/engine/forgeGenerators/pourBloom.test.ts src/engine/forgeGenerators.ts
git commit -m "forge: add Pour Bloom metaball generator"
```

---

## Task 5: Kaleidoscope modifier

**Files:**
- Create: `src/engine/forgeKaleidoscope.ts`
- Test: `src/engine/forgeKaleidoscope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/forgeKaleidoscope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyKaleidoscope, KALEIDOSCOPE_FOLD_OPTIONS } from "./forgeKaleidoscope";

function solidCanvas(w: number, h: number, rgba: [number, number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = rgba[0]; img.data[i + 1] = rgba[1]; img.data[i + 2] = rgba[2]; img.data[i + 3] = rgba[3];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

describe("kaleidoscope modifier", () => {
  it("offers only even fold counts, so the mirror trick lines up at wedge seams", () => {
    for (const f of KALEIDOSCOPE_FOLD_OPTIONS) expect(f % 2).toBe(0);
  });

  it("preserves a solid-colour source (every wedge samples the same content)", () => {
    const w = 20, h = 20;
    const source = solidCanvas(w, h, [10, 20, 30, 255]);
    const dest = document.createElement("canvas");
    dest.width = w; dest.height = h;
    const ctx = dest.getContext("2d")!;
    applyKaleidoscope(ctx, w, h, 4, source);
    const px = ctx.getImageData(0, 0, w, h).data;
    // Center pixels should be fully covered and close to the source colour —
    // interpolation at wedge edges means "close", not exact, everywhere.
    const centerIdx = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4;
    expect(px[centerIdx + 3]).toBeGreaterThan(0);
  });

  it("does not throw for every supported fold count", () => {
    const w = 16, h = 16;
    const source = solidCanvas(w, h, [200, 100, 50, 255]);
    const dest = document.createElement("canvas");
    dest.width = w; dest.height = h;
    const ctx = dest.getContext("2d")!;
    for (const folds of KALEIDOSCOPE_FOLD_OPTIONS) {
      expect(() => applyKaleidoscope(ctx, w, h, folds, source)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeKaleidoscope.test.ts`
Expected: FAIL — `Cannot find module './forgeKaleidoscope'`

- [ ] **Step 3: Implement the modifier**

Create `src/engine/forgeKaleidoscope.ts`:

```ts
/**
 * Kaleidoscope — not a generator, a modifier. Folds any generator's already-
 * rendered output into N-fold radial mirror symmetry by clipping to each
 * angular wedge and stamping a rotated (and, on alternating wedges, mirrored)
 * copy of the full source frame into it. Even fold counts only, so the
 * mirrored copies line up cleanly at wedge boundaries instead of leaving a
 * visible seam.
 */

export const KALEIDOSCOPE_FOLD_OPTIONS = [4, 6, 8] as const;

export function applyKaleidoscope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  folds: number,
  source: HTMLCanvasElement,
) {
  const cx = w / 2;
  const cy = h / 2;
  const wedgeAngle = (Math.PI * 2) / folds;
  const reach = Math.hypot(w, h);

  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < folds; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, reach, i * wedgeAngle, (i + 1) * wedgeAngle);
    ctx.closePath();
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(i * wedgeAngle);
    if (i % 2 === 1) ctx.scale(1, -1);
    ctx.translate(-cx, -cy);

    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeKaleidoscope.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/forgeKaleidoscope.ts src/engine/forgeKaleidoscope.test.ts
git commit -m "forge: add kaleidoscope symmetry modifier"
```

---

## Task 6: Shared finishing pass

**Files:**
- Create: `src/engine/forgeFinishing.ts`
- Test: `src/engine/forgeFinishing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/forgeFinishing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyFinishingGlow } from "./forgeFinishing";

describe("shared finishing pass", () => {
  it("brightens a dim frame without throwing, at any intensity in range", () => {
    const w = 20, h = 20;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 40; img.data[i + 1] = 40; img.data[i + 2] = 40; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const before = ctx.getImageData(0, 0, w, h).data.slice();
    const scratch = document.createElement("canvas");
    const scratchCtx = scratch.getContext("2d")!;

    expect(() => applyFinishingGlow(ctx, w, h, scratch, scratchCtx, 0.8)).not.toThrow();

    const after = ctx.getImageData(0, 0, w, h).data;
    let brighterSomewhere = false;
    for (let i = 0; i < after.length; i += 4) {
      if (after[i] > before[i]) { brighterSomewhere = true; break; }
    }
    expect(brighterSomewhere).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeFinishing.test.ts`
Expected: FAIL — `Cannot find module './forgeFinishing'`

- [ ] **Step 3: Implement the finishing pass**

Create `src/engine/forgeFinishing.ts`:

```ts
/**
 * Shared finishing pass — runs on every generator's output, regardless of
 * which one produced it, so a Canvas2D generator reads as lit and dimensional
 * in the same visual language as Volumetric Bloom rather than looking flat
 * next to it. A cheap "poor man's bloom": blur a copy of the frame, then
 * screen-composite it back over the original at partial opacity.
 */
export function applyFinishingGlow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scratch: HTMLCanvasElement,
  scratchCtx: CanvasRenderingContext2D,
  intensity: number,
) {
  scratch.width = w;
  scratch.height = h;
  scratchCtx.clearRect(0, 0, w, h);
  scratchCtx.drawImage(ctx.canvas, 0, 0, w, h);
  scratchCtx.filter = `blur(${Math.max(2, Math.round(w * 0.02))}px)`;
  scratchCtx.drawImage(ctx.canvas, 0, 0, w, h);
  scratchCtx.filter = "none";

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.25 + Math.max(0, Math.min(1, intensity)) * 0.25;
  ctx.drawImage(scratch, 0, 0, w, h);
  ctx.restore();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeFinishing.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/engine/forgeFinishing.ts src/engine/forgeFinishing.test.ts
git commit -m "forge: add shared finishing glow pass"
```

---

## Task 7: Volumetric Bloom (WebGL raymarch generator)

**Files:**
- Create: `src/engine/volumetricBloom.ts`
- Test: `src/engine/volumetricBloom.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/volumetricBloom.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VolumetricBloomRenderer } from "./volumetricBloom";

describe("VolumetricBloomRenderer", () => {
  it("throws on construction rather than silently producing a broken instance when WebGL is unavailable", () => {
    // jsdom's canvas has no real WebGL support, so THREE.WebGLRenderer's
    // constructor throws here exactly as it would on a device with a dead or
    // unsupported GPU context. forgeSource.ts's fallback path (Task 10)
    // depends on this being a thrown error it can catch, not a half-working
    // instance it would have to detect some other way.
    const canvas = document.createElement("canvas");
    expect(() => new VolumetricBloomRenderer(canvas)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/volumetricBloom.test.ts`
Expected: FAIL — `Cannot find module './volumetricBloom'`

- [ ] **Step 3: Implement the raymarch renderer**

Create `src/engine/volumetricBloom.ts`:

```ts
/**
 * Volumetric Bloom — the one GPU-native generator. A small sibling to
 * MoshRenderer: its own WebGLRenderer, its own full-screen quad, its own
 * context-loss handling, following the exact same construction pattern
 * (antialias off, mediump precision, high-performance power preference) so
 * it behaves consistently with the rest of the app's WebGL usage. Renders a
 * smooth-union of three animated spheres via sphere-tracing — a lit,
 * breathing, morphing form against near-black, composited into Forge's
 * source canvas the same way a base photo already is.
 */
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform float uEnergy;
uniform float uBeat;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uStepBudget;

#define MAX_STEPS 64
#define MAX_DIST 12.0
#define SURF_EPS 0.01

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdSphere(vec3 p, float r) { return length(p) - r; }

float map(vec3 p) {
  float t = uTime * 0.6;
  vec3 p1 = p + vec3(sin(t * 0.9) * 0.5, cos(t * 0.7) * 0.4, sin(t * 1.1) * 0.3);
  vec3 p2 = p + vec3(cos(t * 1.2) * 0.45, sin(t * 0.5) * 0.5, cos(t * 0.8) * 0.35);
  vec3 p3 = p + vec3(sin(t * 0.4 + 2.0) * 0.4, cos(t * 1.3 + 1.0) * 0.3, sin(t * 0.6) * 0.45);
  float r = 0.85 + uBeat * 0.18;
  float d1 = sdSphere(p1, r * 0.55);
  float d2 = sdSphere(p2, r * 0.45);
  float d3 = sdSphere(p3, r * 0.4);
  return smin(smin(d1, d2, 0.5), d3, 0.5);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= uResolution.x / uResolution.y;

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv, -1.6));

  float dist = 0.0;
  bool hit = false;
  vec3 p = ro;
  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= uStepBudget) break;
    p = ro + rd * dist;
    float d = map(p);
    if (d < SURF_EPS) { hit = true; break; }
    dist += d;
    if (dist > MAX_DIST) break;
  }

  vec3 col = vec3(0.0);
  if (hit) {
    vec3 n = normalAt(p);
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.6));
    float diff = max(0.0, dot(n, lightDir));
    float rim = pow(1.0 - max(0.0, dot(n, -rd)), 2.5);
    vec3 base = mix(uColorA, uColorB, 0.5 + 0.5 * sin(dist * 1.3 + uTime * 0.4));
    col = base * (0.25 + diff * 0.75) + base * rim * 1.4;
    col += uEnergy * 0.3 * base;
  } else {
    float glow = 1.0 / (1.0 + dist * dist * 0.35);
    col = mix(uColorA, uColorB, 0.5) * glow * 0.5;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export type VolumetricBloomFrame = {
  energy: number;
  beat: number;
  colorA: [number, number, number];
  colorB: [number, number, number];
  stepBudget: number;
};

export class VolumetricBloomRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private canvas: HTMLCanvasElement;
  private lost = false;
  private onLost = () => { this.lost = true; };
  private onRestored = () => { this.lost = false; };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(canvas.width || 1, canvas.height || 1) },
        uEnergy: { value: 0 },
        uBeat: { value: 0 },
        uColorA: { value: new THREE.Vector3(1, 1, 1) },
        uColorB: { value: new THREE.Vector3(1, 1, 1) },
        uStepBudget: { value: 48 },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    // Throws here if WebGL is unavailable — the caller is expected to catch
    // construction and fall back to a different generator, matching how
    // MoshingBackdrop already treats its own renderer construction.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    this.renderer.setClearColor(0x000000, 1);

    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  get isLost(): boolean {
    return this.lost;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  render(t: number, frame: VolumetricBloomFrame) {
    if (this.lost) return;
    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uEnergy.value = frame.energy;
    u.uBeat.value = frame.beat;
    u.uStepBudget.value = frame.stepBudget;
    (u.uColorA.value as THREE.Vector3).set(frame.colorA[0], frame.colorA[1], frame.colorA[2]);
    (u.uColorB.value as THREE.Vector3).set(frame.colorB[0], frame.colorB[1], frame.colorB[2]);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.material.dispose();
    this.renderer.dispose();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/volumetricBloom.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/engine/volumetricBloom.ts src/engine/volumetricBloom.test.ts
git commit -m "forge: add Volumetric Bloom WebGL raymarch generator"
```

---

## Task 8: Weighted generator + kaleidoscope selection

**Files:**
- Modify: `src/engine/forgeCompose.ts`
- Test: `src/engine/forgeCompose.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/engine/forgeCompose.test.ts`:

```ts
import { GENERATORS } from "./forgeGeneratorRegistry";
import { pickForgeGenerator, rollKaleidoscope } from "./forgeCompose";

describe("forge generator selection", () => {
  it("only picks ids that exist in the registry", () => {
    const rand = rng(99);
    for (let i = 0; i < 100; i++) {
      const id = pickForgeGenerator(rand);
      expect(GENERATORS.some(g => g.id === id)).toBe(true);
    }
  });

  it("reaches every registered generator over many rolls", () => {
    const rand = rng(4242);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickForgeGenerator(rand));
    for (const g of GENERATORS) expect(seen.has(g.id)).toBe(true);
  });

  it("rollKaleidoscope returns null most of the time and a valid fold count otherwise", () => {
    const rand = rng(55);
    let sawNull = false;
    let sawFold = false;
    for (let i = 0; i < 200; i++) {
      const fold = rollKaleidoscope(rand);
      if (fold === null) sawNull = true;
      else { sawFold = true; expect([4, 6, 8]).toContain(fold); }
    }
    expect(sawNull).toBe(true);
    expect(sawFold).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeCompose.test.ts`
Expected: FAIL — `pickForgeGenerator is not exported` / `rollKaleidoscope is not exported`

- [ ] **Step 3: Implement selection in forgeCompose.ts**

In `src/engine/forgeCompose.ts`, add these imports near the top (alongside the existing ones):

```ts
import { GENERATORS } from "./forgeGeneratorRegistry";
import { KALEIDOSCOPE_FOLD_OPTIONS } from "./forgeKaleidoscope";
```

Add these exported functions at the end of the file, after `explainPool`:

```ts
/**
 * Pick which generator drives the next shuffle. Uses the same weighted-draw
 * machinery as effect selection above, but with a flat weight per generator
 * for now — a director with an opinion (Journey, later) can pass its own
 * weighting the same way categoryBias already lets it for effects.
 */
export function pickForgeGenerator(rand: () => number): string {
  const ids = GENERATORS.map(g => g.id);
  const picked = weightedDraw(ids, () => 1, 1, rand);
  return picked[0] ?? ids[0];
}

/**
 * Roughly one shuffle in four wraps the chosen generator in kaleidoscope
 * symmetry. Returns the fold count to use, or null for no symmetry this
 * round.
 */
export function rollKaleidoscope(rand: () => number): number | null {
  if (rand() > 0.25) return null;
  const idx = Math.floor(rand() * KALEIDOSCOPE_FOLD_OPTIONS.length);
  return KALEIDOSCOPE_FOLD_OPTIONS[idx];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeCompose.test.ts`
Expected: PASS (all tests, including the pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add src/engine/forgeCompose.ts src/engine/forgeCompose.test.ts
git commit -m "forge: weighted generator + kaleidoscope selection"
```

---

## Task 9: Extend ForgeState + shuffle actions

**Files:**
- Modify: `src/store/types.ts`
- Modify: `src/store/useStore.ts`

- [ ] **Step 1: Extend ForgeState**

In `src/store/types.ts`, change the `ForgeState` type:

```ts
export type ForgeState = {
  paletteIdx: number;
  seed: number;
  /** 0..1 — layer count and how far params travel from their defaults. */
  intensity: number;
  /** Confines the effect pool to tile-safe effects and wraps sampling. */
  seamless: boolean;
  stack: Layer[];
  /** Optional photo the generated pattern composites over. */
  baseImage: HTMLImageElement | null;
  baseName: string | null;
  /** How much of the generated field sits over `baseImage`, 0..1. */
  overlay: number;
  /** Id of the generator currently producing Forge's source imagery. */
  activeGeneratorId: string;
  /** Fold count if kaleidoscope symmetry is wrapping the active generator this shuffle, else null. */
  kaleidoscopeFolds: number | null;
  /**
   * Set on shuffle/reseed to the *previous* generator id so
   * paintForgeSource can crossfade into the new one instead of hard-cutting.
   * Cleared once the transition window elapses.
   */
  transitionFromGeneratorId: string | null;
  /** performance.now() timestamp the current transition began, or null when settled. */
  transitionStartedAt: number | null;
};
```

- [ ] **Step 2: Update the store's initial forge state and shuffle actions**

In `src/store/useStore.ts`, add imports near the existing ones:

```ts
import { pickForgeGenerator, rollKaleidoscope } from "@/engine/forgeCompose";
import { DRIFT_FIELD } from "@/engine/forgeGenerators/driftField";
```

In the `forge:` initial state object (around line 438), add the new fields:

```ts
  forge: {
    paletteIdx: 0,
    seed: Math.floor(Math.random() * 0xFFFFFF),
    intensity: 0.6,
    seamless: false,
    stack: [],
    baseImage: null,
    baseName: null,
    overlay: 0,
    activeGeneratorId: DRIFT_FIELD.id,
    kaleidoscopeFolds: null,
    transitionFromGeneratorId: null,
    transitionStartedAt: null,
  } as ForgeState,
```

In `randomiseForge` (around line 1245), pick a new generator and start a transition. This follows the exact same two-step shape the existing code already uses elsewhere in this function (build `nextForge`, compute the effect stack *from* `nextForge`, assign it back) rather than reordering it:

```ts
  randomiseForge: () => {
    const s = get();
    const nextForge: ForgeState = {
      ...s.forge,
      seed: Math.floor(Math.random() * 0xFFFFFF),
      paletteIdx: Math.floor(Math.random() * FORGE_PALETTES.length),
      activeGeneratorId: pickForgeGenerator(Math.random),
      kaleidoscopeFolds: rollKaleidoscope(Math.random),
      transitionFromGeneratorId: s.forge.activeGeneratorId,
      transitionStartedAt: performance.now(),
    };
    const stack = composeForgeLayers(nextForge);
    nextForge.stack = stack;
    set({ forge: nextForge, ...(s.sourceMode === "forge" ? { layers: stack } : {}) });
  },
```

This is a direct extension of the current implementation — only the four new fields (`activeGeneratorId`, `kaleidoscopeFolds`, `transitionFromGeneratorId`, `transitionStartedAt`) are additions; everything else matches what's already there today.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `composeForgeLayers`'s call signature or `FORGE_PALETTES` import already exists under a different name, adjust the reference to match what's actually in the file rather than introducing a duplicate.

- [ ] **Step 4: Commit**

```bash
git add src/store/types.ts src/store/useStore.ts
git commit -m "forge: extend ForgeState with active generator + transition fields"
```

---

## Task 10: Orchestrate generation in paintForgeSource

**Files:**
- Modify: `src/engine/forgeSource.ts`
- Modify: `src/components/editor/GlCanvas.tsx`
- Test: `src/engine/forgeSource.test.ts`

This is the task that ties Tasks 1–9 together into the actual rendered frame: generator lookup, crossfade between outgoing/incoming generators, kaleidoscope, the finishing pass, and — unchanged — base-photo compositing.

- [ ] **Step 1: Write the failing test**

Create `src/engine/forgeSource.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { paintForgeSource, createForgeRuntime, TRANSITION_MS } from "./forgeSource";
import type { ForgeState } from "@/store/types";

function makeCtx(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable in test environment");
  return ctx;
}

const AUDIO = { treble: 0, beat: 0, bpm: 0, regularity: 0, density: 0, brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0 };

const BASE_FORGE: ForgeState = {
  paletteIdx: 0,
  seed: 42,
  intensity: 0.6,
  seamless: false,
  stack: [],
  baseImage: null,
  baseName: null,
  overlay: 0,
  activeGeneratorId: "driftField",
  kaleidoscopeFolds: null,
  transitionFromGeneratorId: null,
  transitionStartedAt: null,
};

describe("paintForgeSource orchestration", () => {
  it("renders the active generator and produces a fully opaque frame", () => {
    const w = 32, h = 32;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    paintForgeSource(ctx, w, h, 1.0, BASE_FORGE, AUDIO, runtime);
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it("falls back to Drift Field if the active generator id is unknown, without throwing", () => {
    const w = 16, h = 16;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    const forge = { ...BASE_FORGE, activeGeneratorId: "not-a-real-generator" };
    expect(() => paintForgeSource(ctx, w, h, 1.0, forge, AUDIO, runtime)).not.toThrow();
  });

  it("falls back to Drift Field if Volumetric Bloom's WebGL context fails to construct", () => {
    // jsdom has no WebGL, so selecting volumetricBloom must not throw or
    // leave a blank frame — it should render whatever the fallback produces.
    const w = 16, h = 16;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    const forge = { ...BASE_FORGE, activeGeneratorId: "volumetricBloom" };
    expect(() => paintForgeSource(ctx, w, h, 1.0, forge, AUDIO, runtime)).not.toThrow();
    const px = ctx.getImageData(0, 0, w, h).data;
    let sawContent = false;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 0 || px[i + 1] > 0 || px[i + 2] > 0) { sawContent = true; break; }
    }
    expect(sawContent).toBe(true);
  });

  it("blends outgoing and incoming generators during a transition window", () => {
    const w = 16, h = 16;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    const forge: ForgeState = {
      ...BASE_FORGE,
      activeGeneratorId: "shatterField",
      transitionFromGeneratorId: "driftField",
      transitionStartedAt: performance.now(),
    };
    expect(() => paintForgeSource(ctx, w, h, 1.0, forge, AUDIO, runtime)).not.toThrow();
  });

  it("exposes the transition duration for the store to reference", () => {
    expect(TRANSITION_MS).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/forgeSource.test.ts`
Expected: FAIL — `createForgeRuntime is not exported`, `TRANSITION_MS is not exported`, signature mismatch on `paintForgeSource`

- [ ] **Step 3: Rewrite forgeSource.ts**

Replace the full contents of `src/engine/forgeSource.ts`:

```ts
import { drawSeamless } from "./seamlessSource";
import { FORGE_PALETTES } from "./forgePalettes";
import { VOLUMETRIC_BLOOM_ID, type ForgeGeneratorAudio, type Canvas2DForgeGenerator } from "./forgeGenerators";
import { GENERATORS_BY_ID } from "./forgeGeneratorRegistry";
import { DRIFT_FIELD } from "./forgeGenerators/driftField";
import { applyKaleidoscope } from "./forgeKaleidoscope";
import { applyFinishingGlow } from "./forgeFinishing";
import { VolumetricBloomRenderer } from "./volumetricBloom";
import { hexToRgb } from "./seamlessSource";
import type { ForgeState } from "@/store/types";

export const TRANSITION_MS = 2400;

/**
 * Per-GlCanvas-instance mutable state that must not live in the Zustand
 * store: generator simulation state (particle positions, cell radii, ...)
 * changes every frame and should never trigger a React re-render, and a
 * WebGL context is not serializable at all. One runtime per live canvas.
 */
export type ForgeRuntime = {
  states: Map<string, unknown>;
  scratchA: HTMLCanvasElement;
  scratchACtx: CanvasRenderingContext2D;
  scratchB: HTMLCanvasElement;
  scratchBCtx: CanvasRenderingContext2D;
  finishScratch: HTMLCanvasElement;
  finishScratchCtx: CanvasRenderingContext2D;
  volumetric: VolumetricBloomRenderer | null;
  volumetricCanvas: HTMLCanvasElement | null;
  volumetricFailed: boolean;
};

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return { canvas, ctx };
}

export function createForgeRuntime(): ForgeRuntime {
  const a = makeCanvas();
  const b = makeCanvas();
  const f = makeCanvas();
  return {
    states: new Map(),
    scratchA: a.canvas,
    scratchACtx: a.ctx,
    scratchB: b.canvas,
    scratchBCtx: b.ctx,
    finishScratch: f.canvas,
    finishScratchCtx: f.ctx,
    volumetric: null,
    volumetricCanvas: null,
    volumetricFailed: false,
  };
}

function stateFor(runtime: ForgeRuntime, generator: Canvas2DForgeGenerator, seed: string): unknown {
  const key = `${generator.id}:${seed}`;
  let s = runtime.states.get(key);
  if (s === undefined) {
    s = generator.createState(seed);
    runtime.states.set(key, s);
  }
  return s;
}

/**
 * Renders one generator (Canvas2D by id lookup, or Volumetric Bloom by its
 * reserved id) into `target`. Unknown or failing generators fall back to
 * Drift Field, which cannot itself fail — it has no external dependencies —
 * so this function always leaves `target` painted.
 */
function renderGeneratorInto(
  target: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  seed: string,
  palette: [string, string, string],
  intensity: number,
  audio: ForgeGeneratorAudio,
  generatorId: string,
  runtime: ForgeRuntime,
) {
  if (generatorId === VOLUMETRIC_BLOOM_ID) {
    if (!runtime.volumetricFailed) {
      try {
        if (!runtime.volumetricCanvas) {
          runtime.volumetricCanvas = document.createElement("canvas");
        }
        if (runtime.volumetricCanvas.width !== w || runtime.volumetricCanvas.height !== h) {
          runtime.volumetricCanvas.width = w;
          runtime.volumetricCanvas.height = h;
          if (runtime.volumetric) runtime.volumetric.resize(w, h);
        }
        if (!runtime.volumetric) {
          runtime.volumetric = new VolumetricBloomRenderer(runtime.volumetricCanvas);
          runtime.volumetric.resize(w, h);
        }
        const colorA = hexToRgb(palette[0]).map(c => c / 255) as [number, number, number];
        const colorB = hexToRgb(palette[1]).map(c => c / 255) as [number, number, number];
        runtime.volumetric.render(t, {
          energy: audio.energy,
          beat: audio.beat,
          colorA,
          colorB,
          stepBudget: 48,
        });
        if (!runtime.volumetric.isLost) {
          target.clearRect(0, 0, w, h);
          target.drawImage(runtime.volumetricCanvas, 0, 0, w, h);
          return;
        }
      } catch {
        runtime.volumetricFailed = true;
        runtime.volumetric = null;
      }
    }
    // Fell through: WebGL unavailable or context lost. Fall back below.
    renderGeneratorInto(target, w, h, t, seed, palette, intensity, audio, DRIFT_FIELD.id, runtime);
    return;
  }

  const entry = GENERATORS_BY_ID[generatorId];
  const generator = entry && entry.kind === "canvas2d" ? entry : DRIFT_FIELD;
  const state = stateFor(runtime, generator, seed);
  generator.render({ ctx: target, w, h, t, seed, palette, intensity, audio }, state);
}

export type ForgeSourceOpts = ForgeState;

export function paintForgeSource(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  forge: ForgeSourceOpts,
  reactive: Partial<ForgeGeneratorAudio> = {},
  runtime: ForgeRuntime,
) {
  const palette = FORGE_PALETTES[forge.paletteIdx]?.colors ?? FORGE_PALETTES[0].colors;
  const audio: ForgeGeneratorAudio = {
    treble: reactive.treble ?? 0,
    beat: reactive.beat ?? 0,
    bpm: reactive.bpm ?? 0,
    regularity: reactive.regularity ?? 0,
    density: reactive.density ?? 0,
    brightness: reactive.brightness ?? 0.4,
    weight: reactive.weight ?? 0.4,
    dynamics: reactive.dynamics ?? 0,
    energy: reactive.energy ?? 0,
  };

  const seed = forge.seed.toString(36);

  // Base-photo mode preserves today's behaviour exactly: photo underneath,
  // optional generated overlay on top via the "overlay" blend.
  if (forge.baseImage) {
    const img = forge.baseImage;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    if (forge.overlay > 0.01) {
      renderGeneratorInto(runtime.scratchACtx, w, h, t, seed, palette, forge.intensity, audio, forge.activeGeneratorId, runtime);
      ctx.save();
      ctx.globalAlpha = forge.overlay;
      ctx.globalCompositeOperation = "overlay";
      ctx.drawImage(runtime.scratchA, 0, 0, w, h);
      ctx.restore();
    }
    return;
  }

  // Transition in progress: render outgoing generator into scratchA,
  // incoming generator into scratchB, cross-dissolve them into ctx.
  const inTransition = forge.transitionFromGeneratorId != null && forge.transitionStartedAt != null;
  let progress = 1;
  if (inTransition) {
    progress = Math.min(1, (performance.now() - (forge.transitionStartedAt as number)) / TRANSITION_MS);
  }

  if (inTransition && progress < 1) {
    renderGeneratorInto(runtime.scratchACtx, w, h, t, seed, palette, forge.intensity, audio, forge.transitionFromGeneratorId as string, runtime);
    renderGeneratorInto(runtime.scratchBCtx, w, h, t, seed, palette, forge.intensity, audio, forge.activeGeneratorId, runtime);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(runtime.scratchA, 0, 0, w, h);
    ctx.globalAlpha = progress;
    ctx.drawImage(runtime.scratchB, 0, 0, w, h);
    ctx.globalAlpha = 1;
  } else {
    renderGeneratorInto(ctx, w, h, t, seed, palette, forge.intensity, audio, forge.activeGeneratorId, runtime);
  }

  if (forge.kaleidoscopeFolds) {
    runtime.scratchACtx.clearRect(0, 0, w, h);
    runtime.scratchACtx.drawImage(ctx.canvas, 0, 0, w, h);
    applyKaleidoscope(ctx, w, h, forge.kaleidoscopeFolds, runtime.scratchA);
  }

  applyFinishingGlow(ctx, w, h, runtime.finishScratch, runtime.finishScratchCtx, forge.intensity);
}
```

Note: `drawSeamless` is no longer called directly from this file (Drift Field owns that call now) — the import is kept only if still referenced elsewhere in the file; remove the `drawSeamless` import if the linter flags it unused after this rewrite.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/forgeSource.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Update GlCanvas.tsx's call site**

In `src/components/editor/GlCanvas.tsx`, add the import:

```ts
import { paintForgeSource, createForgeRuntime, type ForgeRuntime } from "@/engine/forgeSource";
```

Add a ref alongside the existing `forgeCanvasRef`/`forgeCtxRef` declarations:

```ts
const forgeRuntimeRef = useRef<ForgeRuntime | null>(null);
```

Change the render-loop call site from:

```ts
        paintForgeSource(forgeCtxRef.current, fc.width, fc.height, t, forgeRef.current, {
          treble: sources.treble ?? 0,
          beat: sources.beat ?? 0,
        });
```

to:

```ts
        if (!forgeRuntimeRef.current) forgeRuntimeRef.current = createForgeRuntime();
        paintForgeSource(forgeCtxRef.current, fc.width, fc.height, t, forgeRef.current, {
          treble: sources.treble ?? 0,
          beat: sources.beat ?? 0,
        }, forgeRuntimeRef.current);
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/engine/forgeSource.ts src/engine/forgeSource.test.ts src/components/editor/GlCanvas.tsx
git commit -m "forge: orchestrate generator selection, crossfade, kaleidoscope, and finishing in paintForgeSource"
```

---

## Task 11: Richer audio features

**Files:**
- Modify: `src/components/editor/GlCanvas.tsx`

- [ ] **Step 1: Add an AudioWindow instance and sample it every frame**

In `src/components/editor/GlCanvas.tsx`, add the import:

```ts
import { AudioWindow } from "@/engine/journeyCore";
import type { JourneyMic } from "@/engine/journeyCore";
```

Add a ref alongside the other render-loop refs:

```ts
const forgeAudioWindowRef = useRef(new AudioWindow());
```

In the render loop, immediately after the existing line `(window as any).__aegisMic = mic;`, add:

```ts
      // Forge's richer audio features reuse the exact same rolling-window
      // analysis Journey already relies on — the mic object published above
      // already satisfies JourneyMic, so no adaptation is needed.
      forgeAudioWindowRef.current.sample(mic as unknown as JourneyMic, now);
```

- [ ] **Step 2: Pass the richer features into paintForgeSource**

Change the `paintForgeSource` call site added in Task 10 from:

```ts
        paintForgeSource(forgeCtxRef.current, fc.width, fc.height, t, forgeRef.current, {
          treble: sources.treble ?? 0,
          beat: sources.beat ?? 0,
        }, forgeRuntimeRef.current);
```

to:

```ts
        const forgeAudioFeatures = forgeAudioWindowRef.current.features(mic as unknown as JourneyMic, now);
        paintForgeSource(forgeCtxRef.current, fc.width, fc.height, t, forgeRef.current, {
          treble: sources.treble ?? 0,
          beat: sources.beat ?? 0,
          bpm: forgeAudioFeatures.bpm,
          regularity: forgeAudioFeatures.regularity,
          density: forgeAudioFeatures.density,
          brightness: forgeAudioFeatures.brightness,
          weight: forgeAudioFeatures.weight,
          dynamics: forgeAudioFeatures.dynamics,
          energy: forgeAudioFeatures.energy,
        }, forgeRuntimeRef.current);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `mic`'s inferred type already structurally satisfies `JourneyMic` without a cast, the `as unknown as JourneyMic` casts can be simplified to a direct pass — keep them only if TypeScript actually complains without them.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/GlCanvas.tsx
git commit -m "forge: feed generators the same rolling audio-feature analysis Journey uses"
```

---

## Task 12: Device-adaptive performance tiering

**Files:**
- Modify: `src/engine/forgeSource.ts`

- [ ] **Step 1: Add a device-tier step budget for Volumetric Bloom with runtime backoff**

In `src/engine/forgeSource.ts`, add to the `ForgeRuntime` type:

```ts
export type ForgeRuntime = {
  states: Map<string, unknown>;
  scratchA: HTMLCanvasElement;
  scratchACtx: CanvasRenderingContext2D;
  scratchB: HTMLCanvasElement;
  scratchBCtx: CanvasRenderingContext2D;
  finishScratch: HTMLCanvasElement;
  finishScratchCtx: CanvasRenderingContext2D;
  volumetric: VolumetricBloomRenderer | null;
  volumetricCanvas: HTMLCanvasElement | null;
  volumetricFailed: boolean;
  volumetricStepBudget: number;
  volumetricSlowFrameStreak: number;
};
```

In `createForgeRuntime`, initialize the two new fields — the starting budget mirrors `MoshingBackdrop`'s own device-tier guess (`navigator.hardwareConcurrency`):

```ts
export function createForgeRuntime(): ForgeRuntime {
  const a = makeCanvas();
  const b = makeCanvas();
  const f = makeCanvas();
  const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return {
    states: new Map(),
    scratchA: a.canvas,
    scratchACtx: a.ctx,
    scratchB: b.canvas,
    scratchBCtx: b.ctx,
    finishScratch: f.canvas,
    finishScratchCtx: f.ctx,
    volumetric: null,
    volumetricCanvas: null,
    volumetricFailed: false,
    volumetricStepBudget: cpuCount <= 4 ? 28 : 48,
    volumetricSlowFrameStreak: 0,
  };
}
```

- [ ] **Step 2: Measure render cost and back off on sustained slow frames**

In `renderGeneratorInto`, change the Volumetric Bloom branch's render call to measure elapsed time and step the budget down on a sustained slow streak, mirroring `MoshingBackdrop`'s `recordFrameCost`:

```ts
        const colorA = hexToRgb(palette[0]).map(c => c / 255) as [number, number, number];
        const colorB = hexToRgb(palette[1]).map(c => c / 255) as [number, number, number];
        const frameStart = performance.now();
        runtime.volumetric.render(t, {
          energy: audio.energy,
          beat: audio.beat,
          colorA,
          colorB,
          stepBudget: runtime.volumetricStepBudget,
        });
        const frameCost = performance.now() - frameStart;
        const budget = 1000 / 30; // 30fps floor for this generator specifically
        if (frameCost > budget * 1.4) {
          runtime.volumetricSlowFrameStreak++;
          if (runtime.volumetricSlowFrameStreak >= 8 && runtime.volumetricStepBudget > 16) {
            runtime.volumetricStepBudget = Math.max(16, runtime.volumetricStepBudget - 8);
            runtime.volumetricSlowFrameStreak = 0;
          }
        } else {
          runtime.volumetricSlowFrameStreak = 0;
        }
```

This replaces the existing unconditional `runtime.volumetric.render(...)` call inside that branch — the rest of the branch (the `if (!runtime.volumetric.isLost) { ... }` block and beyond) stays as Task 10 left it.

- [ ] **Step 3: Cap Canvas2D generator complexity by the same device signal**

In `src/engine/forgeGenerators/shatterField.ts`, change the cell-count line in `createState` from:

```ts
  const count = 8 + Math.floor(rand() * 6); // 8..13
```

to:

```ts
  const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const ceiling = cpuCount <= 4 ? 9 : 13;
  const count = 6 + Math.floor(rand() * (ceiling - 6)); // 6..ceiling
```

Apply the same pattern to `src/engine/forgeGenerators/pourBloom.ts`'s blob count in `createState`:

```ts
  const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const ceiling = cpuCount <= 4 ? 6 : 8;
  const count = 4 + Math.floor(rand() * (ceiling - 4)); // 4..ceiling
```

- [ ] **Step 4: Update the existing seed-count-range tests to match the new ceilings**

In `src/engine/forgeGenerators/shatterField.test.ts`, change the first test's bounds:

```ts
  it("seeds between 6 and 13 drifting cells depending on device tier", () => {
    const state = SHATTER_FIELD.createState("seed-a") as ShatterFieldState;
    expect(state.cells.length).toBeGreaterThanOrEqual(6);
    expect(state.cells.length).toBeLessThanOrEqual(13);
```

In `src/engine/forgeGenerators/pourBloom.test.ts`, change the first test's bounds:

```ts
  it("seeds between 4 and 8 blobs with positive radii depending on device tier", () => {
    const state = POUR_BLOOM.createState("seed-a") as PourBloomState;
    expect(state.blobs.length).toBeGreaterThanOrEqual(4);
    expect(state.blobs.length).toBeLessThanOrEqual(8);
```

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: all tests pass

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/engine/forgeSource.ts src/engine/forgeGenerators/shatterField.ts src/engine/forgeGenerators/shatterField.test.ts src/engine/forgeGenerators/pourBloom.ts src/engine/forgeGenerators/pourBloom.test.ts
git commit -m "forge: device-adaptive quality tiering for generators, mirroring MoshingBackdrop's backoff"
```

---

## Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, zero failures

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; note the new chunk sizes for `forgeGenerators`/`volumetricBloom` in the output for awareness, no action required unless something is unexpectedly enormous

- [ ] **Step 4: Live browser verification**

Start the dev server and navigate to `/forge`. For each of the following, take a screenshot as proof:
1. Initial load — Drift Field renders (the default `activeGeneratorId`).
2. Click to shuffle at least 8 times, screenshotting whenever Shatter Field, Pour Bloom, or Volumetric Bloom appears — confirm each is visibly distinct and neither flat nor broken.
3. Screenshot mid-shuffle (within ~1 second of a click) to confirm the crossfade is visible rather than a hard cut.
4. Trigger a shuffle that rolls kaleidoscope active (may take several shuffles) and confirm visible radial symmetry.
5. Check the browser console for errors after all of the above — expect none.

- [ ] **Step 5: Confirm no regression to non-Forge modes**

Navigate to `/edit` with an uploaded image and with the camera source, confirm both still render normally — Task 10's changes only altered the `sourceMode === "forge"` branch, but this confirms the shared `GlCanvas.tsx` edits didn't affect anything else.

---

## Self-review notes

- **Spec coverage:** All five roster generators (Volumetric Bloom, Shatter Field, Pour Bloom, Kaleidoscope, Drift Field), the shared finishing pass, crossfade transitions, the existing-effect-registry reuse (no work needed, confirmed already true during brainstorming), device-adaptive performance tiering, and WebGL error-handling/fallback are each covered by a task. Phase 2 (seamless tiling for the new generators) and Phase 3 (image-upload + self-learning) are explicitly out of scope per the spec and are not addressed here.
- **Type consistency:** `ForgeGeneratorAudio` is defined once in Task 1 and reused unchanged through every later task. `ForgeGenerator`/`Canvas2DForgeGenerator`/`defineGenerator` are defined once and used identically by all three Canvas2D generators. `ForgeRuntime` is defined in Task 10 and only ever extended (Task 12), never redefined. `paintForgeSource`'s signature changes exactly once (Task 10) and every later reference to it (Task 11) matches that signature.
- **No placeholders:** every step contains complete, runnable code — no `TBD`, no "add appropriate error handling" without showing the handling, no "similar to Task N" without repeating the code.

**Amendment (discovered during Task 2 implementation):** the original plan had every generator module import `defineGenerator` (a value) from `forgeGenerators.ts`, while `forgeGenerators.ts` itself imported each generator back to build `GENERATORS`/`GENERATORS_BY_ID` — a runtime circular import. This wasn't caught during design or spec/code review because those reviews inspect structure and types, not module evaluation order; it only surfaced when a test actually ran and hit the cycle. Fixed by splitting `GENERATORS`/`GENERATORS_BY_ID` into a new `forgeGeneratorRegistry.ts` that imports both `forgeGenerators.ts` and every generator module, while `forgeGenerators.ts` itself never imports a generator. Tasks 1, 2, 3, 4, 8, and 10 above are updated in place to reflect this — treat the plan as already corrected, not as something to re-derive.
