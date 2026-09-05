# Ether-MOSH RGB Shift field card

## Direct answer

RGB Shift is a real-time **Color Chaos** effect that samples the red, green, and blue channels at different positions along a radial direction. **Amount** sets the separation strength; **Angle** moves the off-center focus through one full orbit. It resembles lateral chromatic aberration but does not simulate light passing through a physical lens.

## Find it

1. Open Ether-MOSH and load an image, camera, or video source.
2. Open the FX panel.
3. Choose **Color Chaos**.
4. Add **RGB Shift**.

## Controls

| Control | Declared range | Default | Practical start | What it does |
| --- | ---: | ---: | ---: | --- |
| Amount | 0–1 | 0.40 | 0.18 | Separates radial red, green, and blue samples. The renderer doubles the value sent to the shader, so the visible control reaches the declared shader strength near 0.50 and becomes deliberately extreme above it. True zero remains unshifted. |
| Angle | 0–3.14159 | 0 | 0.25 | Moves the off-center focus. The shader doubles the angle, so one full slider drag completes one orbit without ending on the same direction twice. |

## Five-step recipe

1. Start with a portrait, product still, sculpture, or building with strong edges.
2. Set **Amount 0.18** and **Angle 0.25**.
3. Move Angle slowly and place the strongest fringe away from important faces, labels, and captions.
4. Raise Amount toward **0.35** for a harder transition, then add one distinct texture or corruption effect if useful.
5. Proof the still or loop on its actual print, tile, LED wall, or projector and keep essential information outside the shifted layer.

## Production checks

- Keep type, captions, safety signs, legends, and data outside the shifted pixels.
- Soft-proof saturated channel edges before CMYK or all-over-print production.
- Inspect a 3×3 repeat so radial fringes do not form a hard tile seam.
- Simplify displaced contours before tracing them into vector or Lottie assets.
- Animate slowly and test full-size venue output for flash, contrast, and legibility.

## Remember

Real chromatic aberration comes from wavelength-dependent refraction in an optical system. Ether-MOSH separates RGB texture samples in a shader. Similar fringe language; different mechanism.

Sources: [Newton's Opticks](https://www.gutenberg.org/cache/epub/33504/pg33504-images.html) · [NCBI chromatic-aberration reference](https://www.ncbi.nlm.nih.gov/books/NBK597386/) · [Nikon MicroscopyU optical reference](https://www.microscopyu.com/pdfs/Davidson_and_Abramowitz_2002.pdf) · [W3C flash guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold) · [Ether-MOSH effect registry](https://ether-mosh.online/effects#rgbShift)
