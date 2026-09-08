# Ether-MOSH — full surface audit & mobile-first plan

_Written 2026-09-08 as the groundwork for the Parameters Wheel build._

This is a working map of every interactive surface in the app: what exists, how
it's reached, what's automatic vs. manual, and where the mobile experience
currently falls down. It is deliberately exhaustive — the point is that nobody
(human or agent) has to re-derive this again.

---

## 1. Routes

| Route | Page | Notes |
|---|---|---|
| `/` | `Index` | Landing. Glitch word field, moshing backdrop, info carousel. |
| `/edit` | `Editor` | **The instrument.** Everything below lives here. |
| `/radio` | `Editor` | Same component, radio mode on (`?station=`, `?hud=0`). |
| `/forge` | `ForgeRedirect` | → `/edit` in forge source mode. |
| `/pattern-forge` | `PatternForge` | Standalone seamless-pattern workspace. |
| `/effects` | `EffectsRegistry` | Browsable catalog of the 117 effects. |
| `/favorites` | `Favorites` | Saved stacks. |
| `/journey-portals`, `/embed/journey` | Journey | Portal picker + embeddable player. |
| `/live-visuals`, `/vs/avsync-live`, `/guides/*`, `/faq`, `/news/*` | Marketing / SEO | Static-ish content. |
| `/auth/*`, `/account`, `/checkout`, `/pricing`, `/refund`, `/delete-account`, `/oauth/consent` | Commerce & identity | Supabase + Stripe. |
| `/install`, `/about`, `/contact`, `/terms`, `/privacy` | Misc | |

---

## 2. The Editor: five control surfaces

The editor stacks **five distinct ways to drive the same store**. Understanding
that they are five and not one is the key to the whole mobile problem.

1. **Radial hot-trigger wheel** — center-screen long-press. 26 triggers.
   Mobile and desktop variants (`MobileRadialWheel` / `DesktopRadialWheel`).
2. **Legacy right-edge launchpad** — the same 26 triggers as a vertical rail.
   Retired by default; re-enabled from the bottom rack's "legacy" section.
3. **The lower menu rack** — below the fold, requires scrolling *away from the
   visualizer*. Layers, FX picker, per-parameter Tune sliders, Beat & Audio.
4. **Keyboard** — ~40 single-key and modifier shortcuts.
5. **Touch gestures on the canvas** — swipes, multi-finger taps, long-press.

Plus modal/overlay surfaces: `CommandPalette` (⌘K), `AccountSettingsOverlay`,
`PerformanceMode`, `KaossSurface`, `QuadrantSurface`, `StickerCapture`,
`ForgePanel`, `MotifMaestroPanel`, `OverlayVault`, `RadioHud`.

---

## 3. Hot-trigger registry (26 triggers)

Defined once in `HotTriggers.tsx` as `registry`, ordered by `DEFAULT_ORDER`,
persisted per-user under `cathedral_hot_trigger_order_v2`. Both wheels and the
legacy rail render *the same nodes* — there is exactly one implementation of
each action, which is why activation works by synthesising a `.click()` on the
slot's inner button.

**Perform / change / restore**
- `mosh` — randomize the FX stack (crossfaded, `MOSH_FADE_MS`)
- `undo`, `redo` — timeline
- `journey` — auto-director on/off
- `auto-mosh` — interval re-mosh; tap toggles, **hold (420 ms)** opens the
  timing picker (`AUTO_MOSH_TIMINGS = 3/15/30/60/300/600 s`)
- `clear-fx` — drop every layer, show remastered source
- `dark-mode` — crush light to black, push colour to neon

**Live response**
- `audio` — mic / device / beat sync, with its own source picker popover
- `theme-track` — tap toggles play/pause; caret opens now-playing, load-your-own,
  drop-in point, clear
- `freeze` — hold/slow-mo

**Capture**
- `capture` — tap = still, **hold = record**
- `gif` — loop capture, lengths 3/5/7 s
- `share` — share current frame
- `favorites` — tap opens the panel, **hold (480 ms) quick-saves**

**Deepen**
- `sticker-mode` — Sticker Studio

**Source & system**
- `source-camera`, `switch-camera`, `source-upload` (**hold = photo deck**),
  `source-forge`, `forge-palette`, `source-motif`, `motif-maestro`
- `fullscreen`, `desktop-portrait` (canvas shape), `account` (settings
  overlay: Pro Mode, Help Mode, sensitivity, export settings, VR/immersive),
  `home`

### Automatic (no trigger) behaviours
- **Journey director** (`journeyDirector.ts`) — narrative arcs against audio.
- **Art director** (`artDirector.ts`, 88 KB) — role-aware stack composition.
- **Smart / storm directors** — variety and intensity shaping.
- **Auto-Mosh interval** — timer-driven re-roll.
- **Radio mode** — Forge + Journey + library rotation, unattended.
- **Idle fade** (`useIdleFade`) + **proximity idle** — chrome dims on inactivity.
- **Ambient glitch** — a random idle trigger glitches every 12–18 s.
- **Audio auto-mapping** — first mic enable auto-maps a few obvious params.
- **Mic nudge / track nudge** toasts.

---

## 4. The lower menu rack (what the Parameters Wheel must absorb)

`Editor.tsx` renders it below the canvas, gated on `!isFullscreen && !hideUI`.

| Section | Component | Contents |
|---|---|---|
| utility bar | inline | back, seed, slots, camera menu, undo/redo, before/after hold, mic, device audio, shortcuts, cast, performance mode, **Export** (+ 5K/8K/PNG print menu) |
| Layers | `LayerStack` | per layer: visibility, lock, blend mode `<select>`, opacity slider, reorder ↑↓, duplicate, delete |
| FX | `ShufflePanel` + `FxPicker` | 4 category tabs, 117 effects, tap-to-add cards |
| Tune | `ParamDock` | **the real prize** — per-param slider, live value, 6 modulator types (sine/tri/saw/perlin/random/beat) with speed/depth/offset, audio mapping popover (source × amount × smoothing) + live meter; plus `SeamlessPanel` |
| Beat & Audio | `BeatPanel` | BPM / beat-sync controls |
| Legacy | inline | re-enable the old right-edge launchpad |

**The core mobile failure:** on a phone the canvas fills the viewport, so
reaching *Tune* means scrolling the visualizer off screen. You cannot see what
you are adjusting while you adjust it. That single fact is what makes the app
"highly favorable on a computer" — a parameter instrument whose parameters are
invisible while in use is not an instrument.

---

## 5. Gesture map (as-built, before this work)

All scoped to `canvasContainerRef` and ignore
`button, a, input, textarea, [role='slider'], [data-no-longpress]`.

| Gesture | Result | Where |
|---|---|---|
| 1-finger long-press, **centre 25%-radius circle** | Radial hot-trigger wheel. Arm 220 ms → open 400 ms. Steer by flick, release to fire; release without steering = MOSH | `HotTriggers.tsx` |
| 1-finger horizontal swipe ≥72 px | right = undo, left = redo (or fresh mosh at the head) | `Editor.tsx` |
| 2-finger horizontal swipe ≥72 px | same undo/redo | `Editor.tsx` |
| **2-finger tap** (≤420 ms, ≤20 px) | screenshot | `Editor.tsx` |
| **3-finger tap** (≤420 ms, ≤20 px) | 3-second GIF | `Editor.tsx` |
| 1 finger held + 2nd finger down (**Pro Mode only**) | toggle hide-UI, fires on `pointerdown` | `Editor.tsx` |
| Hold `Shift` (desktop) | flash the wheel open; release closes | `Editor.tsx` |
| Wheel/scroll over an open wheel | rotate the ring | `HotTriggers.tsx` |

### Conflicts this creates for a two-finger tap-and-hold
- **2-finger tap → screenshot** requires `elapsed ≤ 420 ms`. A *hold* is
  therefore free — but the two gestures must agree on the boundary or a slow
  tap will do both, or neither.
- **Pro-Mode 2-finger toggle fires on `pointerdown`**, with no duration test at
  all. As written it would fire the instant the second finger lands, before a
  hold could ever be recognised. This must move to `pointerup` with a duration
  guard.
- 2-finger *swipe* undo/redo must be able to abort a pending hold (travel
  cancel), and vice-versa.

### Documentation defects found
- `ShortcutsOverlay` claims **"3-finger tap → Capture screenshot"**. The code
  binds 3-finger tap to a 3-second GIF and 2-finger tap to the screenshot.
- The overlay documents no touch gesture for opening the radial wheel at all,
  despite it being the primary mobile control surface.

---

## 6. Mobile-specific weak points

1. **Params are unreachable without leaving the visualizer.** (§4)
2. **Two competing "open a wheel" affordances is one too few and one too many.**
   One wheel holds actions; nothing holds parameters.
3. **Wheel capacity is capped and arbitrary.** `radialTriggerIndex` hard-codes
   an outer ring of 14 with the remainder on an inner ring, and the hit-test
   uses a *fixed* 112 px ring boundary while the render uses *fractional*
   radii (`.19`/`.36`/`.54` of wheel width). The two disagree on any viewport
   where `--radial-size` isn't ~600 px, so the flick target and the drawn
   target drift apart. Real bug, not cosmetic.
4. **Touch targets.** Ring buttons are `clamp(40px, 12% of wheel, 52px)`, which
   pins to 40 px on any phone — under the 44 px floor. Worse, the inner ring is
   the tight one: on a 390 px-wide phone `--radial-size` is 328 px, so the inner
   ring sits at r≈95 px and its 12 slots are ~50 px apart centre-to-centre —
   a **10 px gap** between 40 px buttons. The outer ring (r≈141 px, 14 slots)
   is a comfortable ~63 px apart. The wheel is hardest to hit exactly where it
   puts the overflow.
5. **No coarse/fine control.** Every value is one-shot; there is no way to nudge
   a param by a hair on a touch screen.
6. **No reduced-motion path.** `radial-orbit`, `radial-orbit-reverse`,
   `radial-icon-breathe` run infinitely on every slot while open — on a 26-slot
   wheel that's 78 infinite animations composited over a live WebGL canvas.
7. **Rotation persists but selection doesn't.** The wheel remembers its angle;
   it doesn't remember what you last touched.
8. **`hotTriggerMobile.ts` enhances a rail that is hidden by default** — the
   legacy launchpad. Its `MutationObserver` runs for the life of the page on
   every SPA route.
9. **No haptic vocabulary.** `navigator.vibrate` is called with 3/4/10/12/15 ms
   at various sites with no shared meaning.
10. **Safe-area.** The wheel is centred on the viewport, not the safe area, so
    on a notched phone in landscape the ring can sit under the notch.

---

## 7. What "best visualizer on the internet, on a phone" requires

- Every parameter reachable **without the canvas ever leaving the screen**.
- Adjustment you can *see*: semi-transparent chrome, live value read-out at the
  centre of attention, the affected pixels never occluded by your own hand.
- Two-axis navigation: rotate the ring (angular), branch inward/outward
  (hierarchical), scroll a long list (linear) — all with the same thumb.
- Gestures that never fight each other, and always tell you which one won.
- 60 fps while a WebGL scene is running underneath.

