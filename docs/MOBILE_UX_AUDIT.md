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

---

## 8. Research findings — what the literature and shipped apps say

Gathered 2026-09-08. These are the constraints the new work is designed against.

### Radial menu breadth and depth
- **Breadth should not exceed 8 items per ring.** Research on pie-menu depth vs.
  breadth found the two behave differently: *breadth* degrades both accuracy
  and reaction time, while *depth* costs only reaction time. When accuracy
  matters, go **deeper, not wider**.
  ([Depth and Breadth of Pie Menus, IJHCI 37:2](https://www.tandfonline.com/doi/full/10.1080/10447318.2020.1809245))
- 3–12 items is the practical ceiling; **6–8 slices gives the best accuracy and
  efficiency** for gesture selection.
  ([NN/g, Expandable Menus](https://www.nngroup.com/articles/expandable-menus/))
- Marking menus turn the same layout into muscle memory: a directional *mark*
  is on average **3.5× faster** than visually scanning and selecting, and
  hierarchical marks ("zig-zag") extend that to nested menus.
  ([Gesture-based Radial Menus](https://lmjabreu.com/post/gesture-based-radial-menus/))
- Pie menus conventionally keep an **inactive dead zone at the centre** where
  releasing cancels. Ether-MOSH inverts this — the centre is the MOSH hub —
  which is a legitimate choice but means *cancel needs its own gesture*.
- Zone/polygon menus break the 8-item ceiling by using **relative position as
  well as direction**. That is the licence for a ring + radial-distance
  hybrid, as long as the two hit-tests actually agree (see §6.3).

> **Verdict for us:** 26 items across two rings is roughly 3× over the accuracy
> budget. The answer is branching — a small top ring of *categories*, each
> opening its own small ring — not more concentric rings.

### Thumb zone and target size
- The **bottom 25–40% of the screen** is the natural one-handed zone. Tap
  accuracy there is ~**96%**, versus ~**61%** in the stretch zone, and
  interactions are markedly faster.
  ([Juno School](https://www.junoschool.org/article/thumb-zone-design-one-handed-use/),
  [Parachute Design](https://parachutedesign.ca/blog/thumb-zone-ux/))
- **44×44 px** is the WCAG 2.2 AAA target; average thumb contact is ~**72 px**
  wide, so anything under 44 px is a miss waiting to happen.
  ([UXPin](https://www.uxpin.com/studio/blog/responsive-design-touch-devices-key-considerations/))
- ~**49%** of smartphone users navigate one-handed.

> **Verdict for us:** a wheel hard-centred on the viewport puts half its
> circumference in the stretch zone. Summon the wheel **at the gesture's own
> centroid**, clamped to stay fully on screen — the finger is already in the
> comfortable zone by definition, because that's where the user put it.

### Compositing over a live WebGL canvas
- `backdrop-filter` is GPU-composited but expensive on mobile Safari. The
  specific rules that matter: **never animate the blur radius** (it re-triggers
  compositing every frame and drops you to ≤30 fps), keep radius **under 20 px**
  on large elements, and **don't stack more than 3–4** backdrop-filtered
  elements in one viewport. Animate **opacity** instead.
  ([Empire UI](https://empire-ui.com/blog/backdrop-filter-css),
  [Graffino](https://graffino.com/til/how-to-fix-filter-blur-performance-issue-in-safari))

> **Verdict for us:** the existing wheel already sets `backdrop-filter: none` on
> its slot buttons — keep that discipline. The new surface gets **one**
> backdrop-filtered element at most, static radius, and every transition is
> `opacity`/`transform` only. The 78 infinite orbit animations currently
> running on an open 26-slot wheel get budgeted down and disabled under
> `prefers-reduced-motion`.

### Haptics are not a reliable channel
- The Vibration API is an Android/Chromium feature. Safari's support on
  iOS is at best inconsistent and historically absent; the popular workaround
  is a hack that layers hidden `<input type="checkbox" switch>` elements under
  the UI.
  ([caniuse](https://caniuse.com/mdn-api_navigator_vibrate),
  [ios-vibrator-pro-max](https://github.com/samdenty/ios-vibrator-pro-max))

> **Verdict for us:** every haptic must be paired with a visual confirmation
> that carries the same information, or iPhone users get a silent, unlabelled
> interface. Codify the buzz lengths into a named vocabulary instead of the
> current scattered 3/4/10/12/15 ms magic numbers.

### What shipped mobile VJ tools actually do
- **TouchOSC / Bazik** put the parameters on the phone and the render
  elsewhere — they dodge the problem rather than solve it.
- **vizz.fm** runs in a browser tab and its headline feature is exactly the one
  we already have: wiring frequency bands to parameters (bass → particle size,
  treble → rotation). Ours goes further (per-param source × amount × smoothing)
  but *only if you can reach it*.
- **STAELLA** leans on touch + flick, MIDI knobs and gamepads on iPad — i.e.
  it solved the parameter problem with external hardware.

> **Verdict for us:** nobody has solved "full parameter control, on the glass,
> without covering the art." That gap is the opportunity.

### Design rules adopted from all of the above

1. **≤8 items per ring.** Branch instead of widening.
2. **Summon at the touch point**, clamped on-screen — never a fixed centre.
3. **≥44 px targets**, with angular padding so neighbours don't overlap.
4. **One hit-test.** Render geometry and hit geometry come from one function.
5. **Opacity/transform transitions only.** No animated blur. One backdrop-filter.
6. **Reduced-motion is a real path**, not an afterthought.
7. **Every haptic has a visual twin.**
8. **The art is never fully covered** — the wheel is a ring, and the value you
   are changing reads in the middle of it, over the live frame.
