# Ether-MOSH Overlay Entities Design

## Goal
Turn Sticker Mode into a universal animated overlay/compositing system while preserving the existing capture workflow.

## Core model
Replace the gallery-only StickerEntry concept with an OverlayEntity model. An entity owns asset metadata, transform, playback, compositing, behavior, reactivity, tracking, and optional independent FX state. Keep StickerEntry compatibility during migration so existing captures remain usable.

## Asset support
Initial ingestion: PNG, WebP, GIF, SVG, Lottie JSON and .lottie. Existing StickerCapture WebP/APNG output remains a valid creation source. Alpha WebM is a later extension of the same asset interface.

## Rendering
Entities are ordered independently from the global FX stack and expose three compositing stages: before-fx, after-fx, and own-fx. Initial delivery renders after-fx first; the data model must support all three without migration.

## Interaction
Selected entities support move, scale, rotate, opacity, duplicate, delete and z-order. Animated entities additionally expose play/pause, speed, direction, loop and segment/frame metadata.

## Behaviors
Behavior engine is deterministic and renderer-independent. Initial presets: none, float, pulse, wobble, orbit, bounce, flicker, jitter and random-walk. Swarm is implemented later as controlled instances of one source entity.

## Reactivity
Reuse Ether-MOSH audio concepts: bass, mid, treble, overall and beat. Map sources to entity transform/playback properties. MIDI is an extension of the same binding model.

## Tracking
Tracking bindings reference semantic targets rather than renderer details: free, hand, face, person, object or Journey target. Segmentation/Journey supplies normalized target transforms; the overlay engine consumes them.

## Vault
The Sticker Vault persists reusable asset definitions separately from placed scene entities. Captured/imported/extracted assets can be starred into the Vault and instantiated in future scenes.

## UI
Keep the surface small: ADD, VAULT, LAYERS, REACT. Selecting an entity reveals contextual transform/playback/blend/behavior/tracking controls. User-facing name remains Stickers; internal model uses OverlayEntity.

## Performance
Do not duplicate heavy animated runtimes per UI component. Centralize animation lifecycle, pause invisible entities, cap swarm instances based on performance budget, and keep high-frequency animation state outside React where possible.

## Delivery order
1. Overlay model/store migration and import normalization.
2. Overlay stage with selection/transforms and static/animated raster/SVG rendering.
3. dotLottie runtime for JSON/.lottie playback.
4. Blend/compositing stages and own-FX bridge.
5. Behavior engine.
6. Audio reactivity.
7. Tracking/Journey bindings.
8. Swarm.
9. Persistent Vault and Make Sticker.
10. Static-to-animate presets and polish.

## Success criteria
Existing StickerCapture continues working; imported transparent assets can be placed and manipulated; Lottie animations play correctly; overlay state has stable typed interfaces for behaviors/reactivity/tracking/compositing; additions do not regress Forge, camera or uploaded-image rendering.