# Role Controls and 105-Effect Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading four-position voice rail with accurate Color/Warp/Glitch/Glow controls, preserve role metadata across every saved format, and prove all 105 effects compile and produce visible pixels through a repeatable headless-WebGL audit.

**Architecture:** Add one pure role-contract module between the effect registry and Zustand, then make the store and UI address layers by semantic role rather than array position. Keep canvas gestures in `QuadrantSurface`, but render the interactive rail and strip through focused components. Audit shaders outside the production bundle with a deterministic WebGL1 harness that compiles, renders, measures, and contact-sheets every registered effect.

**Tech Stack:** React 18, TypeScript 5.8, Zustand 5, Three.js 0.184/WebGL1 shaders, Vitest 4, Testing Library, Vite 8, Tailwind CSS, `gl` 8.1.6, `pngjs` 7.0.0, `tsx` 4.23.12, Netlify.

## Global Constraints

- Preserve intensity depths exactly: Mild 2, Savage 3, Nuclear 5, Interdimensional 7.
- Use primary labels `COLOR`, `WARP`, `GLITCH`, and `GLOW`; retain `Grade`, `Form`, `Accent`, and `Finish` as secondary teaching labels.
- Selecting a role must never alter artwork.
- Add, reroll, lock/unlock, and tune must target one explicit layer.
- Canvas tap rerolls the selected/next role and advances; canvas drag tunes the active layer.
- Older presets, favorites, slots, setlists, and shared links without role metadata must remain loadable.
- Do not change GIF, recording, screenshot, renderer-compositing, uploaded-image, live-camera, Forge, Journey, Kaoss, isolation, sticker, or Performance Mode contracts.
- DOM controls must remain outside the WebGL canvas and capture streams.
- Every production behavior change begins with a failing test and completes a red-green-refactor cycle.
- Deployment is blocked unless the audit contains 105 unique IDs, 105 unique display names, zero compile/link/WebGL failures, and zero visually inert results.

---

## File Map

**Create**

- `src/engine/effectRoles.ts` — role labels, role inference, role grouping, cursor advancement, and layer normalization.
- `src/engine/effectRoles.test.ts` — pure role-contract and legacy-inference tests.
- `src/store/roleControls.test.ts` — role selection, add, reroll, lock, cursor, history, and intensity behavior.
- `src/components/editor/RoleControlRail.tsx` — four accessible cards plus selected-role control strip.
- `src/components/editor/RoleControlRail.test.tsx` — real component/store interaction tests.
- `src/engine/effectAudit.ts` — pixel metrics and audit result types shared by script tests.
- `src/engine/effectAudit.test.ts` — deterministic metric, registry, and failure-gate tests.
- `scripts/effect-audit.ts` — headless WebGL compiler/renderer and report/contact-sheet writer.
- `docs/effect-audit/2026-08-14-results.json` — generated 105-effect machine-readable evidence.
- `docs/effect-audit/2026-08-14-contact-sheet.png` — generated visual evidence.

**Modify**

- `src/store/types.ts` — optional serialized `Layer.role`.
- `src/engine/artDirector.ts` — export role metadata and retain composed roles.
- `src/engine/effects.ts` — rename the duplicate `God Rays` display name.
- `src/engine/effects.test.ts` — require unique IDs and display names.
- `src/engine/presetUrl.ts` / `src/engine/presetUrl.test.ts` — compact role persistence and legacy inference.
- `src/engine/setlist.test.ts` — role survival through setlist export/import.
- `src/store/useStore.ts` — normalized loads and role-aware store actions.
- `src/store/moshNext.test.ts` — replace positional assertions with semantic-role assertions.
- `src/components/editor/QuadrantSurface.tsx` — semantic targeting, drag selection, plain-language readout, and rail integration.
- `src/components/editor/QuadrantSurface.test.tsx` — gesture assertions by role.
- `src/pages/Editor.tsx` — Tune focus callback and Tune section anchor.
- `package.json` / `package-lock.json` — audit dependencies and `audit:effects` script.
- `.gitignore` — ignore transient per-effect audit frames while retaining dated final evidence.

---

### Task 1: Establish the semantic role contract

**Files:**
- Create: `src/engine/effectRoles.ts`
- Create: `src/engine/effectRoles.test.ts`
- Modify: `src/store/types.ts`
- Modify: `src/engine/artDirector.ts`
- Modify: `src/engine/effects.ts`
- Modify: `src/engine/effects.test.ts`

**Interfaces:**
- Produces: `ROLE_ORDER`, `ROLE_COPY`, `roleForEffect`, `resolveLayerRole`, `groupLayersByRole`, `normalizeLayerRoles`, and `nextAvailableRole`.
- Produces: `Layer.role?: Role` at the serialized boundary.
- Consumes: `craftOf(effectId)` and the existing `Role` union from `artDirector.ts`.

- [ ] **Step 1: Write failing role-contract tests**

Add literal expectations that expose the current mismatch:

```ts
import { describe, expect, it } from "vitest";
import { groupLayersByRole, normalizeLayerRoles, roleForEffect } from "./effectRoles";
import type { Layer } from "@/store/types";

const layer = (id: string, effectId: string, role?: Layer["role"]): Layer => ({
  id, effectId, role, hidden: false, locked: false, opacity: 1,
  blend: "normal", params: {}, mods: {}, audioMaps: {},
});

it("infers a legacy finish by effect identity instead of array position", () => {
  expect(normalizeLayerRoles([layer("a", "filmicTone"), layer("b", "bloom")])
    .map(item => item.role)).toEqual(["grade", "finish"]);
});

it("groups repeated roles without changing stack order", () => {
  const grouped = groupLayersByRole([
    layer("g", "filmicTone", "grade"),
    layer("a1", "rgbShift", "accent"),
    layer("a2", "datamosh", "accent"),
  ]);
  expect(grouped.accent.map(item => item.id)).toEqual(["a1", "a2"]);
});

it("maps representative effects to plain-language roles", () => {
  expect(["filmicTone", "melt", "datamosh", "bloom"].map(roleForEffect))
    .toEqual(["grade", "form", "accent", "finish"]);
});
```

Extend `effects.test.ts` with a unique-display-name assertion that fails on the
two current `God Rays` labels.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- src/engine/effectRoles.test.ts src/engine/effects.test.ts
```

Expected: FAIL because `effectRoles.ts` and `Layer.role` do not exist and the
display name `God Rays` is duplicated.

- [ ] **Step 3: Implement the pure contract**

Add this public shape:

```ts
export const ROLE_ORDER: Role[] = ["grade", "form", "accent", "finish"];

export const ROLE_COPY: Record<Role, {
  label: "COLOR" | "WARP" | "GLITCH" | "GLOW";
  technical: "Grade" | "Form" | "Accent" | "Finish";
  description: string;
}> = {
  grade:  { label: "COLOR", technical: "Grade", description: "Tone and palette foundation" },
  form:   { label: "WARP", technical: "Form", description: "Shape, depth, and movement" },
  accent: { label: "GLITCH", technical: "Accent", description: "Corruption and signature detail" },
  finish: { label: "GLOW", technical: "Finish", description: "Atmosphere and final polish" },
};

export function roleForEffect(effectId: string): Role | null;
export function resolveLayerRole(layer: Layer, index: number): Role;
export function normalizeLayerRoles(layers: Layer[]): Layer[];
export function groupLayersByRole(layers: Layer[]): Record<Role, Layer[]>;
export function nextAvailableRole(
  layers: Layer[], current: Role, options?: { includeCurrent?: boolean },
): Role | null;
```

`resolveLayerRole` must use `layer.role`, then `roleForEffect`, then the legacy
first-four fallback, then `accent` for deeper unknown layers. `normalizeLayerRoles`
must clone only layers missing or carrying an invalid role.

Export `Craft` from `artDirector.ts` so `craftOf(id)?.role` is a stable public
contract. Add `role?: Role` to `Layer`. Rename only the display name for
`volumetricShaft` from `God Rays` to `Volumetric Shaft`; keep its ID unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/engine/effectRoles.test.ts src/engine/effects.test.ts
```

Expected: PASS with 105 unique IDs and 105 unique display names.

- [ ] **Step 5: Commit the semantic contract**

```bash
git add src/engine/effectRoles.ts src/engine/effectRoles.test.ts src/store/types.ts src/engine/artDirector.ts src/engine/effects.ts src/engine/effects.test.ts
git commit -m "feat: add semantic effect role contract"
```

---

### Task 2: Persist roles and migrate every legacy load path

**Files:**
- Modify: `src/engine/presetUrl.ts`
- Modify: `src/engine/presetUrl.test.ts`
- Modify: `src/engine/setlist.test.ts`
- Modify: `src/store/useStore.ts`
- Test: `src/engine/effectRoles.test.ts`

**Interfaces:**
- Consumes: `normalizeLayerRoles(layers: Layer[]): Layer[]`.
- Produces: optional wire field `g?: 0 | 1 | 2 | 3`, mapped through `ROLE_ORDER`.
- Preserves: preset wire version 1; the new optional field is backward compatible.

- [ ] **Step 1: Write failing persistence tests**

Add tests with hand-built expectations:

```ts
it("round-trips explicit semantic roles", () => {
  const encoded = encodePreset({ layers: [layerOf("bloom", { role: "finish" })] });
  expect(decodePreset(encoded)!.layers[0].role).toBe("finish");
});

it("infers roles when decoding a version-one link without g", () => {
  const legacy = legacyWire([{ e: "filmicTone", o: 1000, b: 0 }, { e: "bloom", o: 700, b: 1 }]);
  expect(decodePreset(legacy)!.layers.map(layer => layer.role))
    .toEqual(["grade", "finish"]);
});
```

Add a setlist assertion that grade/finish survive export and import. Add store
tests that legacy favorites and slots normalize on application without changing
effect IDs, order, params, blend, opacity, locks, or regions.

- [ ] **Step 2: Run persistence tests and verify RED**

Run:

```bash
npm test -- src/engine/presetUrl.test.ts src/engine/setlist.test.ts src/engine/effectRoles.test.ts
```

Expected: FAIL because roles are neither encoded nor normalized.

- [ ] **Step 3: Implement wire encoding and load normalization**

Extend the wire layer and encoder/decoder:

```ts
type WireLayer = {
  e: string; o: number; b: number; g?: 0 | 1 | 2 | 3;
  h?: 1; p?: Record<string, number>;
  r?: [number, number, number, number, number, number];
  m?: Record<string, [number, number, number, number]>;
  a?: Record<string, [number, number, number]>;
};
```

Encode a valid role index into `g`. Decode through `ROLE_ORDER[w.g]`, then pass
the complete decoded array through `normalizeLayerRoles` once so old links infer
roles from effect IDs.

Normalize layers from local favorites and slots in `loadFavoritesFromStorage`
and `loadSlotsFromStorage`, and normalize again at `applyFavorite`, `applyPreset`,
`loadSlot`, and `importSetlistJson` boundaries. This double boundary is
intentional: in-memory payloads supplied by tests or cloud sync do not
necessarily pass through local-storage loaders.

- [ ] **Step 4: Run persistence tests and verify GREEN**

Run:

```bash
npm test -- src/engine/presetUrl.test.ts src/engine/setlist.test.ts src/engine/effectRoles.test.ts
```

Expected: PASS; old payload fixtures remain accepted.

- [ ] **Step 5: Commit compatibility support**

```bash
git add src/engine/presetUrl.ts src/engine/presetUrl.test.ts src/engine/setlist.test.ts src/store/useStore.ts src/engine/effectRoles.test.ts
git commit -m "feat: preserve roles across saved looks"
```

---

### Task 3: Replace position-based rerolling with role-aware state

**Files:**
- Create: `src/store/roleControls.test.ts`
- Modify: `src/store/useStore.ts`
- Modify: `src/store/moshNext.test.ts`
- Modify: `src/engine/artDirector.ts`

**Interfaces:**
- Produces state: `selectedRole: Role | null`, `selectedRoleLayers: Partial<Record<Role, string>>`, `roleCursor: Role`.
- Produces actions: `selectRole`, `selectRoleLayer`, `rerollRole`, `addRole`, and role-aware `moshNext`.
- Produces result: `RoleRoll`.

```ts
export type RoleRoll = {
  role: Role;
  layerId: string;
  effectId: string;
  effectName: string;
  relation: RelationLabel;
  affinity: number;
  at: number;
};

selectRole: (role: Role) => void;
selectRoleLayer: (role: Role, layerId: string) => void;
rerollRole: (role?: Role, layerId?: string) => RoleRoll | null;
addRole: (role: Role) => RoleRoll | null;
moshNext: () => RoleRoll | null;
```

- [ ] **Step 1: Write failing store behavior tests**

Cover these observable contracts with literal role/effect assertions:

```ts
it("selection changes no pixels or layer data", () => {
  const before = structuredClone(useStore.getState().layers);
  useStore.getState().selectRole("finish");
  expect(useStore.getState().layers).toEqual(before);
});

it("rerolls only the selected repeated-role layer", () => {
  const accents = groupLayersByRole(useStore.getState().layers).accent;
  useStore.getState().selectRoleLayer("accent", accents[1].id);
  const before = useStore.getState().layers.map(layer => ({ id: layer.id, effectId: layer.effectId }));
  const roll = useStore.getState().rerollRole();
  const changed = useStore.getState().layers
    .map((layer, index) => layer.effectId === before[index].effectId ? null : layer.id)
    .filter(Boolean);
  expect(roll!.layerId).toBe(accents[1].id);
  expect(changed).toEqual([accents[1].id]);
});
```

Also test: Mild exposes grade+finish; Savage exposes grade+form+finish; Nuclear
and Interdimensional expose repeated roles; locked target does not mutate;
cursor skips roles whose every layer is locked; Add inserts a missing role in
role order; reroll and Add are undoable; full MOSH resets selection/cursor to
the first represented unlocked role; Lock and Unlock are undoable; undo,
preset-loading, and full MOSH repair stale selected-layer IDs; all locked
returns null.

- [ ] **Step 2: Run store tests and verify RED**

Run:

```bash
npm test -- src/store/roleControls.test.ts src/store/moshNext.test.ts
```

Expected: FAIL because the store still maps `voiceCursor` and quadrant indices
to the first four array positions.

- [ ] **Step 3: Add a single-role composer primitive**

Extract the duplicated selection logic from `moshQuadrant` into:

```ts
export function composeRoleLayer(
  role: Role,
  look: Look,
  brief: FrameBrief,
  rand: () => number,
  options: {
    exclude: string[];
    affinityTarget?: number;
    wildness: number;
    existingRegion?: LayerRegion | null;
  },
): ComposedLayer | null;
```

It must use `pickForRole`, `paramsForRole`, `opacityForRole`, and
`blendForRole`; grade always uses normal blend. Preserve an existing region on
reroll so a role-specific edit cannot erase a carefully isolated subject;
newly added roles receive no region.

- [ ] **Step 4: Implement role-aware store state and operations**

Full MOSH must copy `cl.role` into every created `Layer`. Manual `addLayer`
must set `roleForEffect(effectId)`. `rerollRole` must locate the explicit layer,
the role's remembered layer, or the first unlocked layer in that order. It must
preserve layer ID, stack position, lock state, and existing region while
replacing the effect-specific fields.

`addRole` must insert after the last layer belonging to the previous role and
before the first layer belonging to a later role. Both operations push exactly
one undo snapshot. Update `toggleLocked` to push exactly one undo snapshot and
clear redo before toggling. After every operation that replaces a stack, repair
selection by choosing the remembered layer in the selected role, the first
layer in that role, or the first represented role in `ROLE_ORDER`.

Keep `moshNext` as the canvas compatibility action, but make it delegate to
`rerollRole(roleCursor)`. Remove `moshQuadrant` after `rg` confirms no production
caller remains. Convert `lastQuadrantRoll` to `lastRoleRoll` and remove Q1-Q4
language from state comments.

- [ ] **Step 5: Run store tests and verify GREEN**

Run:

```bash
npm test -- src/store/roleControls.test.ts src/store/moshNext.test.ts src/engine/artDirector.test.ts
```

Expected: PASS across all four intensity depths and repeated roles.

- [ ] **Step 6: Commit role-aware state**

```bash
git add src/store/useStore.ts src/store/roleControls.test.ts src/store/moshNext.test.ts src/engine/artDirector.ts
git commit -m "feat: control effect layers by semantic role"
```

---

### Task 4: Build the accessible Color/Warp/Glitch/Glow rail

**Files:**
- Create: `src/components/editor/RoleControlRail.tsx`
- Create: `src/components/editor/RoleControlRail.test.tsx`
- Modify: `src/components/editor/QuadrantSurface.tsx`

**Interfaces:**
- Consumes: grouped layers and role store actions from Tasks 1-3.
- Produces callback: `onTune(layerId: string): void`.

```ts
type RoleControlRailProps = {
  onTune: (layerId: string) => void;
};
```

- [ ] **Step 1: Write failing component tests**

Use the real Zustand store and Testing Library; do not mock the rail or store.
Assert:

```ts
render(<RoleControlRail onTune={onTune} />);
expect(screen.getByRole("button", { name: /Color.*Grade/i })).toBeVisible();
expect(screen.getByRole("button", { name: /Warp.*Form/i })).toBeVisible();
expect(screen.getByRole("button", { name: /Glitch.*Accent/i })).toBeVisible();
expect(screen.getByRole("button", { name: /Glow.*Finish/i })).toBeVisible();
```

Then prove: clicking Glow does not change layers; it opens a strip containing
the explanation and current effect; repeated-role chips select the intended
layer; Reroll changes only that chip's layer; Lock toggles only that layer; Tune
passes its ID; an empty role offers Add; selected/next/locked/empty states expose
text or ARIA in addition to color.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- src/components/editor/RoleControlRail.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement four role cards**

Render `ROLE_ORDER` as real buttons. Each button must expose
`aria-pressed`, `aria-expanded`, a label containing both plain and technical
terms, count text for repeated roles, `empty` text for absent roles, and a lock
indicator when every layer in that role is locked. Stop pointer propagation so
selecting a card never also triggers a canvas reroll.

Use a compact fixed-width grid:

```tsx
<div className="pointer-events-auto grid w-[min(96vw,34rem)] grid-cols-4 gap-1">
  {/* Four 40px-minimum role buttons */}
</div>
```

Selected uses a stable border; next uses an animated dot/pulse; locked adds an
icon and line-through; empty uses reduced opacity plus the word `empty`.
Wrap each card in the existing Radix tooltip primitive for mouse hover and
keyboard focus. On touch, holding a card for 450ms exposes the same description
without invoking Reroll; clear that timer on movement, pointer cancellation, or
release.

- [ ] **Step 4: Implement the selected-role strip**

The strip must show `ROLE_COPY[role].description`, one chip per layer, and only
these primary actions:

```tsx
{layers.length === 0 ? <button>Add</button> : (
  <>
    <button>Reroll</button>
    <button>{active.locked ? "Unlock" : "Lock"}</button>
    <button>Tune</button>
  </>
)}
```

Keep effect chips in an `overflow-x-auto` row and primary actions in a wrapping
row. No duplicate sliders belong here. Disable Add when neither `imageElement`
nor `videoElement` exists. When a store action returns null, preserve the stack
and show `Role locked` or `No alternate effect available` through Sonner rather
than allowing a silent dead control.

- [ ] **Step 5: Implement first-use guidance**

Use storage key `cathedral_role_rail_seen_v1`. Show exactly:

```text
Select a role - tap to evolve - drag to tune
```

The hint is dismissible, pointer-nonblocking outside its close button, and
never renders after the stored value is `1`.

- [ ] **Step 6: Run component tests and verify GREEN**

Run:

```bash
npm test -- src/components/editor/RoleControlRail.test.tsx
```

Expected: PASS with no React act warnings.

- [ ] **Step 7: Commit the control rail**

```bash
git add src/components/editor/RoleControlRail.tsx src/components/editor/RoleControlRail.test.tsx src/components/editor/QuadrantSurface.tsx
git commit -m "feat: add Color Warp Glitch Glow controls"
```

---

### Task 5: Integrate role targeting, drag tuning, and Tune focus

**Files:**
- Modify: `src/components/editor/QuadrantSurface.tsx`
- Modify: `src/components/editor/QuadrantSurface.test.tsx`
- Modify: `src/pages/Editor.tsx`

**Interfaces:**
- Consumes: `RoleControlRail` and role-aware `moshNext`.
- Produces: `QuadrantSurface({ onRoll?, onTogglePerf?, onTune? })` where `onRoll` receives a `Role`.

- [ ] **Step 1: Replace positional gesture tests with failing semantic tests**

Add tests proving that selecting Glow then tapping anywhere changes one finish
layer, advances the next target, and leaves grade/form/accent untouched. Add a
drag test proving the selected role chip's layer receives param changes and no
effect IDs change. Add an all-locked readout assertion for `all roles locked`.

- [ ] **Step 2: Run gesture tests and verify RED**

Run:

```bash
npm test -- src/components/editor/QuadrantSurface.test.tsx
```

Expected: FAIL because gesture targeting still derives a layer from the first
four positions and the readout still emits Q1-Q4.

- [ ] **Step 3: Make gesture targeting semantic**

Replace `activeVoice()` with an active-layer resolver based on
`selectedLayerId`, selected role memory, then the first unlocked layer for the
role cursor. Keep the existing movement threshold, 400ms tap ceiling, 750ms
long-press separation, and pinch ratio unchanged.

The readout must render the plain label instead of `Q1`:

```tsx
<span>{ROLE_COPY[r.role].label}</span>
<span>{r.effectName}</span>
```

Mount `RoleControlRail` inside the DOM overlay. Do not place any of it inside
`GlCanvas`.

- [ ] **Step 4: Wire Tune to the existing panel**

Add `data-tune-panel` to the Tune `<section>` in `Editor.tsx`. Pass this callback:

```ts
const focusTune = useCallback((layerId: string) => {
  useStore.getState().selectLayer(layerId);
  setHideUI(false);
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>("[data-tune-panel]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}, []);
```

`Tune` must not create a second parameter UI.

- [ ] **Step 5: Run gesture and rail tests and verify GREEN**

Run:

```bash
npm test -- src/components/editor/QuadrantSurface.test.tsx src/components/editor/RoleControlRail.test.tsx src/store/roleControls.test.ts
```

Expected: PASS; selection remains non-destructive and each gesture changes only
the targeted layer.

- [ ] **Step 6: Commit editor integration**

```bash
git add src/components/editor/QuadrantSurface.tsx src/components/editor/QuadrantSurface.test.tsx src/pages/Editor.tsx
git commit -m "feat: integrate semantic role gestures"
```

---

### Task 6: Build the deterministic 105-effect WebGL audit

**Files:**
- Create: `src/engine/effectAudit.ts`
- Create: `src/engine/effectAudit.test.ts`
- Create: `scripts/effect-audit.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `measureEffectFrame(source, output): EffectFrameMetrics`.
- Produces CLI: `npm run audit:effects -- --out-dir docs/effect-audit` and the
  diagnostic form `npm run audit:effects -- --effect bloom --out-dir /tmp/ether-mosh-effect-audit`.
- Produces exit 0 only when every selected effect passes.

```ts
export type EffectFrameMetrics = {
  meanAbsoluteDelta: number;
  changedPixelRatio: number;
  luminanceMean: number;
  luminanceVariance: number;
  blank: boolean;
  inert: boolean;
};

export type EffectAuditResult = {
  id: string;
  name: string;
  category: EffectCategory;
  status: "pass" | "compile-fail" | "webgl-fail" | "blank" | "inert";
  compileLog: string;
  glError: number;
  metrics: EffectFrameMetrics | null;
  elapsedMs: number;
};
```

- [ ] **Step 1: Install exact audit-only dependencies**

Run:

```bash
NPM_CONFIG_CACHE=/tmp/ether-mosh-npm-cache npm install --save-dev --save-exact gl@8.1.6 @types/gl@6.0.5 pngjs@7.0.0 @types/pngjs@6.0.5 tsx@4.23.12
```

Add:

```json
"audit:effects": "tsx scripts/effect-audit.ts"
```

These packages remain dev-only and must not enter the Vite production bundle.

- [ ] **Step 2: Write failing metric and registry-gate tests**

Use hand-created pixel arrays:

```ts
it("flags identical output as inert", () => {
  const source = new Uint8Array([20, 40, 60, 255, 80, 100, 120, 255]);
  expect(measureEffectFrame(source, source).inert).toBe(true);
});

it("accepts a visibly changed nonblank output", () => {
  const source = new Uint8Array([20, 40, 60, 255, 80, 100, 120, 255]);
  const output = new Uint8Array([220, 40, 60, 255, 10, 210, 120, 255]);
  const metrics = measureEffectFrame(source, output);
  expect(metrics.blank).toBe(false);
  expect(metrics.inert).toBe(false);
});

it("requires exactly 105 unique effect ids and names", () => {
  expect(EFFECTS).toHaveLength(105);
  expect(new Set(EFFECTS.map(effect => effect.id)).size).toBe(105);
  expect(new Set(EFFECTS.map(effect => effect.name)).size).toBe(105);
});
```

- [ ] **Step 3: Run audit unit tests and verify RED**

Run:

```bash
npm test -- src/engine/effectAudit.test.ts
```

Expected: FAIL because the metric module does not exist.

- [ ] **Step 4: Implement deterministic pixel metrics**

Compute RGB absolute delta normalized by `255 * 3 * pixelCount`, changed-pixel
ratio using per-pixel RGB delta greater than 12, luminance using
`0.2126R + 0.7152G + 0.0722B`, and variance over luminance. Mark output blank
when alpha coverage is below 1% or luminance mean and variance are both below
`1 / 255`. Mark output inert when mean absolute delta is below `0.003` and
changed-pixel ratio is below `0.01`.

- [ ] **Step 5: Implement the headless-WebGL renderer**

The script must:

1. Create one 256x144 WebGL1 context with `preserveDrawingBuffer: true`.
2. Generate a deterministic diagnostic RGBA texture containing gradients,
   checkerboard edges, colored shapes, fine lines, and asymmetric detail.
3. Create deterministic feedback, depth, flow, and four history textures.
4. Compile `PASSTHROUGH_VERT` plus each `EffectDef.frag` separately and capture
   both shader logs and the program link log.
5. Bind every declared sampler and common uniform, then bind every effect param
   at its declared default.
6. Draw at time samples `0`, `0.7`, and `1.4` with pulses `0`, `0.65`, and `1`;
   retain the sample with the greatest delta so animated effects are not falsely
   called inert.
7. Call `readPixels`, flip rows for image output, call `measureEffectFrame`, and
   drain `gl.getError()` after every effect.
8. Destroy programs, shaders, and transient textures after each effect.

The `--effect id` option must audit exactly one ID for diagnosis. An unknown ID
must print a clear error and exit 2.

- [ ] **Step 6: Write JSON and contact-sheet evidence**

Write `docs/effect-audit/2026-08-14-results.json` with registry totals, environment,
thresholds, summary counts, and all `EffectAuditResult` records. Build a PNG
contact sheet with seven columns; each tile contains the effect output, its
display name, ID, category, and PASS/FAIL status. Generate text with a tiny
embedded bitmap font so the script has no browser or canvas dependency.

Ignore only transient `docs/effect-audit/frames/` files in `.gitignore`; retain
the dated JSON and contact sheet.

- [ ] **Step 7: Run audit unit tests and verify GREEN**

Run:

```bash
npm test -- src/engine/effectAudit.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the audit harness**

```bash
git add package.json package-lock.json .gitignore src/engine/effectAudit.ts src/engine/effectAudit.test.ts scripts/effect-audit.ts
git commit -m "test: add complete WebGL effect audit"
```

---

### Task 7: Audit all effects and repair every failure

**Files:**
- Modify when identified: `src/engine/effects.ts`
- Modify: `src/engine/effects.test.ts`
- Create: `docs/effect-audit/2026-08-14-results.json`
- Create: `docs/effect-audit/2026-08-14-contact-sheet.png`

**Interfaces:**
- Consumes: `npm run audit:effects` from Task 6.
- Produces: committed zero-failure audit evidence.

- [ ] **Step 1: Run the complete audit**

Run:

```bash
npm run audit:effects -- --out-dir docs/effect-audit
```

Expected: 105 audited. If the exit code is nonzero, do not weaken thresholds or
add exemptions.

- [ ] **Step 2: Diagnose each reported ID independently**

For every non-pass record, run:

```bash
npm run audit:effects -- --effect EFFECT_ID --out-dir /tmp/ether-mosh-effect-audit
```

Classify from evidence:

- `compile-fail`: repair the exact GLSL line named by the shader/program log.
- `webgl-fail`: repair the invalid operation or missing uniform/texture binding.
- `blank`: repair output alpha/color math or unsafe default params.
- `inert`: repair the shader/default range so a default render visibly differs;
  do not merely inflate the audit threshold.

After each repair, add a focused assertion to `effects.test.ts` that names the
broken contract (uniform, safe range, nonzero default, or required shader read),
run the single-ID audit, then run the complete audit again.

- [ ] **Step 3: Verify the zero-failure gate**

Run:

```bash
npm run audit:effects -- --out-dir docs/effect-audit
node -e 'const r=require("./docs/effect-audit/2026-08-14-results.json"); if(r.summary.total!==105||r.summary.pass!==105||r.summary.failed!==0) process.exit(1)'
```

Expected: exit 0 with 105 passes, 0 failures, 105 unique IDs, and 105 unique
display names.

- [ ] **Step 4: Commit repairs and evidence**

```bash
git add src/engine/effects.ts src/engine/effects.test.ts docs/effect-audit/2026-08-14-results.json docs/effect-audit/2026-08-14-contact-sheet.png
git commit -m "fix: verify all 105 visual effects"
```

---

### Task 8: Full regression, rendered QA, publication, and production verification

**Files:**
- Modify only if a regression is found: files already named above.
- Evidence outside repo: `/workspace/scratch/ether-mosh-role-controls-desktop.jpg`

**Interfaces:**
- Consumes: complete implementation and audit evidence.
- Produces: exact verified Git tree on GitHub and Netlify production.

- [ ] **Step 1: Run the complete automated gate**

Run each command separately and read its exit code:

```bash
npm run typecheck
npm run lint
npm test
npm run audit:effects -- --out-dir docs/effect-audit
npm run build
git diff --check
```

Expected: zero TypeScript errors, zero ESLint errors, all tests passing, 105/105
effects passing, successful Vite production build, and clean whitespace check.
Existing non-blocking lint or Vite warnings must be reported rather than hidden.

- [ ] **Step 2: Run local rendered interaction QA with Browser**

The flow under test is:

```text
/edit -> load a diagnostic image -> select Glow without changing the stack ->
reroll Glow -> lock it -> Tune scrolls to the existing parameter panel ->
canvas tap advances to the next unlocked role -> drag changes only its params
```

Use the Browser plugin path required by `frontend-testing-debugging`. Verify page
identity, meaningful DOM, no framework overlay, relevant console health, and a
viewport screenshot. Exercise desktop and a narrow mobile viewport when the
connected browser exposes viewport control. Confirm the four cards fit without
covering central source controls or bottom hot triggers.

- [ ] **Step 3: Verify capture isolation**

Capture a still from the WebGL canvas while the role strip is expanded. Compare
the exported image dimensions/pixels with the canvas and assert the screenshot
contains no `COLOR`, `WARP`, `GLITCH`, `GLOW`, action labels, or hint text. The
DOM screenshot may show controls; the exported canvas file must not.

- [ ] **Step 4: Commit final QA-only fixes**

If rendered QA required code edits, add a failing component test first, apply
the smallest fix, rerun the complete automated gate, then commit:

```bash
git add src/components/editor/RoleControlRail.tsx src/components/editor/RoleControlRail.test.tsx src/components/editor/QuadrantSurface.tsx src/components/editor/QuadrantSurface.test.tsx src/pages/Editor.tsx
git commit -m "fix: polish semantic role controls"
```

If no edits were required, do not create an empty commit.

- [ ] **Step 5: Publish the verified tree**

Push the exact tested tree to `Mlswchr75/Ether-MOSH` branch `Ether-MOSH` using a
non-force fast-forward GitHub update. Re-read the remote ref immediately before
updating; if it moved, stop and reconcile rather than overwriting it.

- [ ] **Step 6: Verify Netlify production**

Confirm the Netlify deploy for site `ether-mosh` is `ready`, its `commit_ref`
equals the published GitHub commit, and deploy/secret-scan errors are null. Open
the verified post-redirect URL `https://ether-mosh.netlify.app/edit`, repeat page
identity, meaningful DOM, overlay, console, screenshot, and role interaction
checks, and attach the final screenshot if the shared-file mount accepts it.

- [ ] **Step 7: Final evidence report**

Report:

- the exact production commit and Netlify deploy;
- TypeScript, lint, test, build, and 105-effect audit counts;
- role-control interactions exercised;
- desktop/mobile coverage actually achieved;
- any environment-only WebGL limitation from the cloud browser;
- any remaining warnings or untested hardware-specific behavior;
- links to the live editor, commit, audit JSON, and contact sheet.

Do not claim a pass for any command or environment that was not observed fresh.
