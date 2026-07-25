# RePurpose Studio — Project Brief

A mobile-first material-repurposing app, built in Lovable.

- **Public app URL:** https://reforge-creative-studio.lovable.app (published, no login needed)
- **Lovable editor:** https://lovable.dev/projects/d1d9a2a7-6781-47f8-a28c-4718b0af1a72
- **Live preview:** https://id-preview--d1d9a2a7-6781-47f8-a28c-4718b0af1a72.lovable.app
- **Created:** 2026-07-24

## Where to find it

Naming and account details, recorded because the project was initially hard to locate:

| | |
|---|---|
| Lovable account that owns it | `m.whitcher@yahoo.com` (profile name "dm") |
| Workspace | Aesthetic Rebellion's Workspace |
| Name in the Lovable dashboard | **RePurpose Studio** |
| Branding inside the app | **ReForge Studio** |
| Project slug | `reforge-creative-studio` |
| Project id | `d1d9a2a7-6781-47f8-a28c-4718b0af1a72` |

Searching the dashboard for "ReForge" finds nothing — the dashboard card is named
"RePurpose Studio". The workspace is shared between two Lovable accounts, so the
workspace switcher must be set to Aesthetic Rebellion's Workspace for the project
to appear.

## Concept

A mobile-first app (also great on desktop/tablet) built around using your smartphone
or tablet camera to snap pictures of random raw materials — scrap wood of any size or
shape, metals, recycled parts, hardware, everyday items — and throwing them into a
creative "mixing pot." An idea engine grounded in real-world physics and known
application methods suggests tasteful, functional, thoughtful ways to repurpose those
exact ingredients, and an interactive 3D workspace lets you scale, angle, and place
the components to compose a project.

## v1 constraints and decisions

- **Token-free AI at first:** no paid AI API keys. The idea engine is a curated,
  rule-based knowledge system — materials × joining methods × real-world project
  patterns — with matching logic that scores ideas against what's in the user's bin.
  The code is structured so a real vision/LLM API can be plugged in later behind a
  clean interface.
- **No login required to try it:** data stored locally, structured so Supabase
  auth/storage can be added later.
- **Device measuring is staged:** manual dimension entry with unit toggle in v1, with
  visible "Measure with camera (coming soon)" affordances reserving the spot for
  AR dimensioning, distance estimation, and sensor-based measuring.

## v1 screens

1. **Capture** — camera-first flow (getUserMedia, upload fallback on desktop) with a
   quick tagging sheet: material type, rough dimensions, condition, quantity,
   dominant colors sampled from the photo, notes.
2. **Materials Bin** — a visual pantry of everything captured, filterable by
   material type.
3. **Mixing Pot** — select ingredients, hit Mix, get ranked project ideas with
   physics/strength/weather rationale, difficulty, tools, steps, and safety notes.
4. **3D Workbench** — three.js / @react-three/fiber scene where materials appear as
   proxy shapes sized from their dimensions; drag, rotate, scale, snap on a ground
   grid, with real-world dimension labels and touch-friendly controls.
5. **Projects** — save a mix (idea + 3D arrangement) with status
   (idea / in progress / done).

## Roadmap after v1

- Camera/AR measuring: dimensions, distances, angles via device sensors
- Vision AI for automatic material, color, texture, and lighting recognition
- Plug-in LLM idea generation behind the existing idea-engine interface
- Supabase auth + cloud storage, sharing, and community project gallery
