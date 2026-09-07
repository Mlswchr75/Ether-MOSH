# MOSH Radio — the 24/7 Forge-fed station

`https://ether-mosh.online/radio`

Forge generating its own visuals forever, Journey directing them against the
music, and a rotation of your own songs underneath both — running unattended
for as long as the tab is open.

---

## What was already there (and what this added)

Almost all of it existed and had simply never been pointed at itself:

| Piece | Where | What it does for the station |
|---|---|---|
| **Forge** | `src/engine/forgeGenerators/*` | Generates its own source. No photo, no camera, nothing to run out of — it can draw indefinitely. |
| **Journey** | `src/engine/journeyDirector.ts` | Two clocks: composition (slow, bar-quantised) and disruption (fast, hard 10s ceiling). This is what makes it a performance instead of a screensaver. |
| **trackPlayer** | `src/engine/trackPlayer.ts` | Already a drop-in `MicAnalyzer`. `GlCanvas` hands Journey the *track's own* analyser whenever a track is playing, so the direction reacts to the song, not to a room mic. |

What Radio added is the thing a station actually is — a rotation that never
ends, plus the unglamorous parts that decide whether it is still up in the
morning:

- `src/engine/radio.ts` — station/URL config and the rotation policy (pure).
- `src/engine/radioSession.ts` — the transport: auto-advance, autoplay blocks, bad files, and the stall watchdog.
- `src/hooks/useRadioBroadcast.ts` — arrival state, Journey request, teardown.
- `src/components/editor/RadioHud.tsx` — the lower-third ident and the tap-to-start prompt.

`/radio` **is** `/edit` with the chrome down (`App.tsx` renders the same
component). A separate page would have been a second copy of the
renderer/Forge/Journey wiring, drifting out of sync with the first the next
time either changed.

---

## Running it

```
/radio                       whole library, now-playing card on
/radio?station=flow          only tracks tagged "flow"
/radio?hud=0                 no card at all — clean output for a capture
/edit?radio=1                same station from the editor's own URL
/radio?radio=0               neutered, for a bookmark you want to keep
```

Behaviour on arrival: source switches to Forge, performance mode goes on
(chrome down, cursor auto-hides, edge-peek still available), Forge's own
auto-shuffle is armed, the screen wake lock is held (`/radio` is a visual
route in `mobileRuntime.ts`), and the rotation starts.

### Driving it

The station plate sits bottom-left and carries everything you need without
leaving the wall:

| Control | Does |
|---|---|
| ⏸ / ▶ | Pause and resume the broadcast |
| ⏭ | Skip to the next track in the rotation |
| **Controls** | Drops out of performance mode into the full editor rig — layers, FX, export, the lot — **with the station still playing** |
| `Esc` | Same exit, from the keyboard |
| Tap the canvas | Reshuffles Forge (unchanged from Forge mode) |

The plate dims to 72% after twelve idle seconds and comes back on any pointer
or key activity, so an unattended wall is mostly picture without the card ever
becoming unreadable. `?hud=0` removes it outright.

A one-line hint appears at the top on arrival and retires after eleven
seconds. It exists because dropping straight into performance mode hides every
control, which is correct for a wall and disorienting for a person who has
just opened a link.

**Journey is requested through the editor's own gate**, not around it. A
supporter gets uninterrupted direction. Everyone else gets the same
five-minute Forge Journey preview as anywhere else, after which the music
keeps playing and Forge's auto-shuffle keeps the wall moving — the station
degrades, it does not stop.

### The rotation

A shuffled deck, not a dice roll. Independent random picks are what most
"shuffle" buttons do and they are wrong here: over an eight-hour stream a
32-track library will play some songs five times and others never, and a
listener notices the repeat long before they notice the absence. Every track
plays exactly once per cycle; the deck re-cuts if a reshuffle would repeat a
song across the boundary.

### What keeps it on the air

| Failure | What happens |
|---|---|
| Browser refuses autoplay | "Tap to start the broadcast" — one gesture, then it resumes on the same track. |
| A track 404s or won't decode | Skipped immediately; the station moves on rather than unwinding. |
| **The playhead freezes** | The watchdog (`radioSession.ts`, 4s × 3 strikes) skips. `ended` never fires on a wedged decoder, so nothing else catches this — it is the failure that leaves a page looking perfectly healthy while the wall has been dead for six hours. |

---

## Getting Google Flow songs in

**There is no Flow API.** Google Flow has no public programmatic export — no
REST endpoint, no OAuth scope, nothing to poll. Anything claiming otherwise is
scraping a session cookie, which will break and can cost you the account. So
the wiring is a *file pipeline*, and the honest version of "wire Flow into
Ether-MOSH" is: make the download-to-live path short enough that it is not
worth automating.

Right now it is three commands:

```bash
# 1. Download the track from Flow, drop it in:
#    public/audio/Your Song.mp3

# 2. See what MOSH can't play yet, and get the registry row for it:
npx tsx scripts/sync-audio-library.ts --emit --tag flow

# 3. Paste that row into SHOWCASE_TRACKS (src/engine/trackPlayer.ts),
#    then generate its drop-in cues:
python3 scripts/analyze-track-cues.py your-song
```

Commit, push, Netlify deploys, the song is in rotation and
`/radio?station=flow` plays exactly that set.

### Why the registry is a hardcoded list

`assertSafeTrackUrl` only accepts a local `blob:` or a URL that is a member of
`SHOWCASE_TRACKS`, and that guarantee only holds while the list is
compile-time known. A JSON manifest fetched at runtime would put
arbitrary-at-runtime strings back into an element's `.src` — exactly what that
assertion exists to prevent. The sync script removes the tedium without
weakening the property.

### Tags = stations

**Nothing in the library is tagged `flow` today.** The nine songs registered
alongside Radio are tagged `unreleased`, because which files came out of Flow
versus anywhere else is not something the repo records — the mp3s carry no
provenance. `?station=flow` therefore falls back to the whole library until
those rows are tagged. Retagging is a one-word edit per row in
`SHOWCASE_TRACKS`.

`tags` on a track is what `?station=` filters on. Tag your Flow output
`"flow"` and it gets its own channel. Anything goes: `festival`, `ambient`,
`iron`, `unreleased`. A station tag that matches nothing falls back to the
whole library rather than to silence — an unattended broadcast answering a
typo with a black screen is not a failure anyone is watching to notice.

### If per-song deploys become the bottleneck

The next step (not built) is a hosted bucket: Supabase storage, and
`assertSafeTrackUrl` relaxed from a list-membership check to an
**origin allowlist** (`https://<project>.supabase.co/storage/v1/object/public/audio/`).
That trades the compile-time guarantee for a same-origin-family one, which is
a real trade — worth it once you are adding songs weekly, not before. Do it
deliberately, in its own change, with the CSP updated to match.

### The one file left out

`public/audio/Together Again.mp3` is an AAC/M4A that was renamed `.mp3`, and
its stream does not decode cleanly (ffmpeg rejects it outright). Chrome sniffs
the container and would probably play it; Safari and Firefox are far less
forgiving. Re-encode it to a real mp3 and add its row to put it back:

```bash
ffmpeg -i "public/audio/Together Again.mp3" -c:a libmp3lame -b:a 192k "public/audio/Together Again (mp3).mp3"
```

---

## Broadcasting it 24/7

**On a machine you control** (a Mac Mini, an old laptop, anything with a GPU
that can hold 60fps):

1. Open `https://ether-mosh.online/radio?hud=0` in Chrome, fullscreen (F).
2. Autoplay: launch Chrome with `--autoplay-policy=no-user-gesture-required`,
   or click once and never touch it again. The gesture prompt only appears
   when a `play()` was genuinely refused.
3. OBS → **Display Capture** (not Browser Source — you want the real GPU
   pipeline, and Browser Source will not hold the frame rate on the Forge
   generators) → Audio from the same machine's monitor output.
4. YouTube Live → 1080p60, ~6000 kbps. Title it by station, not by song.
5. Leave the wake lock to do its job; disable OS sleep and screensaver anyway.

**Sanity checks worth doing before you leave it:** let it run one full rotation
cycle (~90 minutes for 32 tracks) and watch memory in Chrome's task manager.
Forge holds its own buffers; a slow climb across a cycle is the thing that
takes a stream down at hour eleven, and it is much cheaper to find on purpose
at hour two.

**A cheaper unattended option:** a Raspberry Pi will not hold this. Forge is a
real WebGL pipeline, not a canvas animation. Budget an actual GPU.

---

## Things worth building next

- **Station picker in the HUD** — `availableStations()` already returns the tags; nothing renders them yet.
- **Track-aware Journey seeding** — Journey reacts to the audio but does not yet know the *song*; seeding Forge's palette per track id would give every song a recognisable visual signature.
- **Now-playing to a stream overlay** — the HUD's state is already the right shape to post to an OBS text source or a Discord/Twitch bot.
- **Recorded output** — `CanvasRecorder` already exists; a station that spits out a per-track music video while it broadcasts is a content pipeline, not a stream.

## Radio library update (September 2026)

- A new arrival selects a random song and a shuffled deck. `?track=<catalog-id>`
  selects a referenced opener. `?queue=<comma-separated-ids>&name=<name>` plays
  a shared snapshot in its supplied order. Unknown IDs are discarded.
- Queue & library exposes every upcoming song, reorder arrows for touch and
  keyboard, removal, play-next, enqueue, shuffle, search and recently played.
  A saved playlist replaces the rotation pool; its first pass follows the
  saved order and later passes shuffle. Previous/next, media keys and space
  use the same radio transport.
- Favorites and playlists are account-owned Supabase rows, with explicit
  grants and ownership policies. Playlist creation, rename, song removal,
  reordering and deletion report success only after the database responds.
  Sharing exports catalog IDs in a link; it never makes private account rows
  public. Shared playlists are snapshots, not live synchronized playlists.
- Share tags appear on the station, current song, next song, all song rows,
  queue and playlists. They open a small dismissible toast with clipboard,
  social, email, device-supported native sharing and mobile SMS options.
- AudioContext resume and HTMLAudioElement play start together inside a tap.
  The timeout covers both. Browsers that refuse audible autoplay receive a
  compact Tap to listen prompt. A failed file advances; a library-wide outage
  retries with backoff; a late load cannot override a newer song or pause.

Verification: radio rotation/session, playback race/autoplay and share-link
regression suites; TypeScript build; production artifact checks; transactional
Supabase ownership and anonymous-access tests with test writes rolled back.
