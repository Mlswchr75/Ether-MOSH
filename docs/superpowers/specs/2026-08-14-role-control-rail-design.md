# Role Control Rail Design

**Date:** 2026-08-14  
**Status:** Approved design; implementation pending  
**Surface:** MOSH editor canvas overlay and effect-stack state

## Problem

The editor currently shows `GRADE`, `FORM`, `ACCENT`, and `FINISH` above the
canvas without explaining that they are effect-stack roles. The labels look
interactive but are not controls. A canvas tap silently rotates through the
first four stack positions, and a drag edits the selected layer.

The fixed position-to-role mapping is also wrong for several intensity levels.
Mild initially creates grade + finish, Savage creates grade + form + finish,
and Nuclear/Interdimensional create duplicate roles in deeper stacks. The rail
still labels the first four positions grade, form, accent, finish, so its text
can disagree with the effects it represents. Extra layers beyond the fourth
are invisible to the rail.

## Goals

- Explain the four visual jobs in plain language.
- Make role selection deliberate and non-destructive.
- Give each role direct reroll, lock, and tune controls.
- Represent the real stack at every intensity, including repeated roles.
- Preserve quick canvas performance gestures.
- Preserve existing presets, favorites, recordings, screenshots, GIF capture,
  uploaded-image mode, live-camera mode, and Pattern Forge behavior.
- Keep the controls out of exported visual media.

## Non-goals

- Redesigning the Tune panel or effect parameter model.
- Changing the number of layers produced by each intensity.
- Changing the shaders, renderer, GIF encoder, recording pipeline, or Forge
  compositor.
- Adding a second effect library or a new intensity tier.
- Replacing the existing full-stack MOSH action.

## Effect-Library Audit

The same delivery also establishes a repeatable WebGL audit for all 105 effects.
The audit compiles and renders every registered shader against a deterministic
diagnostic source, supplies every temporal/depth/flow/history input, reads the
resulting pixels, and records compile/link errors, WebGL errors, blank output,
and output that is indistinguishable from the source. The command exits nonzero
unless all effects pass and writes a machine-readable JSON report plus a visual
contact sheet.

The audit runs outside the production bundle through a Node headless-WebGL
harness. It therefore verifies actual GLSL compilation and pixel output without
requiring camera access, user files, or the cloud browser's disabled GPU. Any
effect reported as failed or visually inert blocks deployment until its shader
or default parameters are corrected and the complete 105-effect audit passes.

Display names must also be unique. The second effect currently presented as
`God Rays` (`volumetricShaft`) becomes `Volumetric Shaft`; its internal ID stays
unchanged so presets and saved stacks remain compatible.

## Language and Visual Hierarchy

The primary labels become:

| Primary label | Technical role | Meaning | Representative effects |
| --- | --- | --- | --- |
| COLOR | Grade | Tone and palette foundation | Filmic Tone, Duotone, Thermal |
| WARP | Form | Shape, depth, and movement | Melt, Ripple, Pixel Sort |
| GLITCH | Accent | Signature corruption and motion | Datamosh, RGB Shift, Jitter |
| GLOW | Finish | Atmosphere and final polish | Bloom, Fog, Film Grain |

Each compact card shows the primary label prominently and the technical role in
smaller type. This keeps the professional vocabulary available without making
it the entry requirement.

The rail distinguishes two states:

- **Selected:** a stable outline marks the role whose details are open.
- **Next:** a restrained pulse marks the role the next clean canvas tap will
  reroll.

Locked roles use a lock icon and strike-through treatment. Empty roles remain
visible but subdued and expose an `Add` action after selection. Roles containing
multiple layers show a count badge such as `GLITCH x2`.

## Interaction Model

### Selecting a role

Tapping or clicking a role card selects it and opens the role control strip. It
does not change the artwork. Selection also targets that role for the next clean
canvas tap, resolving the ambiguity between the selected and next states.

### Role control strip

The strip shows:

- A one-sentence description of the selected role.
- The selected effect's human-readable name.
- Effect chips when the role has multiple layers; selecting a chip changes only
  the active layer within that role.
- `Reroll`, which replaces only the active layer with another role-appropriate
  effect while preserving the rest of the composition.
- `Lock` / `Unlock`, which changes only the active layer.
- `Tune`, which opens or focuses the existing parameter controls for the active
  layer instead of duplicating sliders.
- `Add` when the role is absent. Add creates one role-appropriate layer and
  selects it without changing any existing layer.

Rerolling through the strip and rerolling by canvas tap use the same store
operation. After a successful reroll, the next target advances to the next
unlocked role represented in the stack. An explicitly selected empty role stays
targeted until it is added or another role is selected.

### Canvas gestures

- **Clean tap:** rerolls the targeted role, then advances to the next unlocked
  represented role.
- **Drag:** adjusts the primary and secondary parameters of the active layer,
  with horizontal movement driving the primary parameter and upward movement
  increasing the secondary parameter or opacity.
- **Long press:** remains reserved for the editor's existing menu rack.
- **Pinch:** retains the existing Performance Mode behavior.

The surface continues to stand down when Kaoss mode, before/after comparison,
tap isolation, or sticker selection owns the canvas.

### First-use guidance

A concise, dismissible hint appears the first time the role rail is available:

> Select a role - tap to evolve - drag to tune

Desktop hover/focus and mobile long-press descriptions explain each role. The
hint must never reappear after dismissal and must not block the canvas.

## State and Data Model

### Explicit role metadata

`Layer` gains an optional persisted `role` field using the existing
`grade | form | accent | finish` union. New art-directed layers always retain
the role returned by the composer. Manual additions derive a role from the
effect craft registry.

The role is optional at the serialized boundary for backward compatibility.
When an older preset, favorite, setlist, shared link, or saved browser state
lacks it, the application derives the role from the effect ID. If an effect is
unknown, the fallback is the legacy position mapping for the first four layers
and `accent` for additional layers. The inferred value is normalized when the
state is next saved.

### Grouped role view

A pure selector groups current layers by their resolved role while preserving
their stack order. UI rendering and canvas targeting consume this selector
instead of assuming that array index equals role.

The store tracks:

- selected role;
- selected layer ID within each role when applicable;
- next role cursor;
- existing selected layer ID for Tune compatibility.

The role cursor advances over represented, unlocked roles. A role is considered
available when it contains at least one unlocked layer. Direct selection may
target an empty role so the control strip can offer Add.

### Store operations

The existing position-oriented quadrant operation is replaced or wrapped by
role-aware operations:

- `selectRole(role)`
- `selectRoleLayer(role, layerId)`
- `rerollRole(role, layerId?)`
- `addRole(role)`
- `advanceRoleCursor()`

Existing callers may keep a compatibility wrapper during migration, but new UI
code must not infer role from a layer index.

Reroll preserves the target layer ID, stack position, lock state, and surrounding
layers. It replaces effect-specific parameters, modulators, audio maps, blend,
opacity, and optional region using the art director's role-aware generation.
Reroll never silently unlocks a locked layer.

## Component Boundaries

### `RoleControlRail`

Renders the four role cards, selected/next/locked/empty states, count badges,
keyboard focus behavior, and accessible names. It receives grouped role data
and invokes store actions; it does not choose effects.

### `RoleControlStrip`

Renders descriptions, effect chips, and Add/Reroll/Lock/Tune actions for the
selected role. It remains compact enough for the smallest supported mobile
viewport and uses horizontal scrolling only for effect chips, never for primary
actions.

### `QuadrantSurface`

Retains gesture ownership but delegates role targeting and rerolling to the
role-aware store operations. Its transient readout switches from Q1-Q4 language
to Color/Warp/Glitch/Glow language.

### Pure role helpers

Role resolution, grouping, cursor advancement, and empty-role decisions live in
small pure functions so store and component behavior can be tested without a
renderer or browser.

## Responsive and Accessibility Requirements

- Four cards fit within a 320 CSS-pixel viewport without covering the central
  source controls.
- The expanded strip may wrap into two short rows but must not cover the bottom
  performance controls or trap scrolling.
- Touch targets are at least 40 CSS pixels where space permits.
- Every card is a real button with selected, disabled, and expanded state
  exposed through ARIA.
- Actions are keyboard reachable and retain visible focus styles.
- Color is never the only indication of selected, next, locked, or empty state.
- The rail and strip remain DOM overlays and are never drawn into the WebGL
  canvas or captured by export/capture streams.

## Failure and Edge States

- With no source or no effect stack, role cards remain explanatory but reroll,
  lock, and tune are disabled; Add is enabled only when the editor can render a
  source.
- If every represented role is locked, a canvas tap reports `all roles locked`
  and does not mutate state.
- If the selected layer disappears through undo, preset loading, or a full
  MOSH, selection falls back to the first layer in that role, then the first
  represented role.
- If role-aware effect selection cannot produce a candidate, the existing layer
  remains untouched and the UI reports that no alternate effect is available.
- Undo/redo treats Add, Reroll, Lock, and Unlock as normal single history steps.

## Compatibility

- Full-stack MOSH continues to analyze the real source and choose a named art
  direction.
- Intensity layer counts remain Mild 2, Savage 3, Nuclear 5, and
  Interdimensional 7.
- Older presets, favorites, shared links, setlists, and local storage remain
  loadable through role inference.
- Existing Tune controls continue to use `selectedLayerId`.
- GIF, video, screenshot, uploaded-image, live-camera, Forge, isolation, sticker,
  Journey, Kaoss, and Performance modes receive no renderer or encoder changes.

## Testing Strategy

Implementation follows red-green-refactor.

### Pure/state tests

- Mixed and repeated roles group correctly while retaining stack order.
- Missing role metadata is inferred from the effect registry.
- Unknown legacy effects use the documented fallback.
- Mild, Savage, Nuclear, and Interdimensional stacks expose their true roles and
  counts.
- Selecting a role does not mutate the artwork.
- Reroll affects only the selected layer and preserves locked/surrounding layers.
- Cursor advancement skips locked and absent roles.
- Add creates only the requested missing role.
- All-locked and no-candidate paths do not mutate state.
- Older preset/favorite/setlist payloads load successfully.

### Component tests

- Cards expose understandable labels and technical subtitles.
- Selected, next, locked, empty, and repeated-role states are visually and
  accessibly distinguishable.
- Effect chips select the intended layer.
- Add/Reroll/Lock/Tune call the corresponding real state behavior.
- First-use guidance dismisses and stays dismissed.

### Rendered QA

- Desktop and narrow mobile editor views render without overlap or clipping.
- Uploaded-image and live-camera surfaces show the same role controls.
- At least one role selection, reroll, lock, tune, canvas tap, and drag is
  exercised with a state check.
- No framework overlay or relevant new console errors appear.
- A capture/export check confirms the rail is absent from output media.
- The headless-WebGL audit compiles and renders all 105 registered effects with
  zero failures or visually inert results.
- The audit report contains 105 unique IDs and 105 unique display names.

## Acceptance Criteria

The work is complete when a new user can identify what each role changes,
select any role without altering the artwork, deliberately reroll/lock/tune an
individual effect, understand repeated and absent roles, and use canvas taps for
fast evolution without the labels lying about the underlying stack. All legacy
saved data loads, all automated checks pass, the production build succeeds, and
rendered desktop/mobile QA confirms the controls do not obstruct the editor or
appear in captured output. The 105-effect audit must also exit successfully and
produce its JSON results and visual contact sheet before deployment.
