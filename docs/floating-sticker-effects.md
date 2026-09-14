# Floating sticker effects

In Sticker Studio, choose **FX Stack**, add a floating effect, and leave **Stay inside sticker** enabled. **Organic cut** is enabled by default for FX stickers: it rounds angular fragments, bends straight internal edges, and applies a centered, asymmetric perimeter influenced by source colors and the active shape effects. **Irregularity** adjusts the outline; **New silhouette** chooses another stable variation. Position controls are kept near the center in this mode. Turn Organic cut off to retain geometric shapes. These settings apply to the sticker preview and its PNG/GIF/Lottie exports.

The same effects are available in the normal effects library for Forge, camera, and uploaded sources.

| Effect | Shape and controls |
| --- | --- |
| Prism Shards | Triangular source fragments; separation, spin, spectral split. |
| Ink Tendrils | Tapered spiral arms and fine offshoots; curl, thickness, branching. |
| Bubble Lenses | Circular source magnifiers; magnification, refraction, rim light. |
| Echo Ribbons | Curved fading strands; trail length, echo spacing, width. Procedural echoes also animate still images. |
| Pixel Confetti | Rotating source tiles; tile size, scatter, tumble. |
| Electric Contours | Broken source edges and tone arcs; detail sensitivity, sparks, glow. |

All six also offer amount, speed, motion, size, coverage, edge softness, and horizontal/vertical placement. Amount or coverage at zero disables the visible shape. Speed or motion at zero freezes its procedural animation. Source video can still move inside a stationary shape.

**Join** combines silhouettes. **Overlap** retains their intersections; sparse shapes can have very little overlap. **Cut out** subtracts later shapes. Color treatments after a shape retain its alpha; geometric effects can move that alpha. Layer order changes the result.

Black and white are preview backgrounds. PNG, transparent GIF, and the image-backed Lottie exporter retain transparency. These effects do not add frame-history buffers or run shader passes when absent from the active stack.

## GPU regression check

Start the Vite dev server, then run:

```sh
MOSH_TEST_URL=http://127.0.0.1:8082 PLAYWRIGHT_MODULE=playwright node scripts/test-floating-effects.browser.mjs
```

Use an installed Playwright module (or its absolute `index.mjs` path) with Chrome available. The check exercises actual WebGL rendering, both stack orders with the public registry, all blend modes, control extremes, zero behavior, motion, and alpha preservation. It writes a contact sheet and JSON results to `/tmp/six-floating-effects*`.
