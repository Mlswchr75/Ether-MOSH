# Ether-MOSH Anaglyph field card

## Direct answer

Anaglyph is a **Color Chaos** effect that uses source luminance as a crude depth proxy, offsets two samples horizontally, and assigns one sample to red and the other to green-blue. **Amount** blends the stylization over the source; **Depth** controls the separation distance. It is not a true stereo pair because it starts with one viewpoint.

## Starter recipe

- Category: Color Chaos
- Amount: 0.28
- Depth: 0.18
- Source: a portrait, sculpture, product still, architecture, camera feed, or Forge composition with one clear foreground shape
- Optional stack: restrained Film Grain for stills or Bloom for a tested venue loop

## Control map

| Control | Range | Default | What it changes | Practical start |
| --- | ---: | ---: | --- | ---: |
| Amount | 0–1 | 0.60 | Blends the red-cyan result over the source; 0 is a true visual bypass | 0.28 |
| Depth | 0–1 | 0.50 | Sets luminance-driven horizontal sample separation; 0 removes displacement but Amount can still leave slight channel weighting | 0.18 |

## Five-step recipe

1. Load a high-contrast source with one clear foreground shape.
2. Open the FX panel, choose **Color Chaos**, and add **Anaglyph**.
3. Set **Amount 0.28** and **Depth 0.18**.
4. Move Depth first, then Amount; protect faces, labels, captions, and safety information from broad separation.
5. Proof the final still, repeat, animation, projector, or LED output and provide a clean alternative.

## Production checks

- Set Amount to 0 when you need the untouched source; Depth at 0 only removes spatial separation.
- Do not claim this single-image treatment is captured or measured stereoscopic depth.
- Never make red-cyan color the only carrier of essential meaning.
- Inspect a 3×3 repeat and final print size for seams, registration, and lost fine fringes.
- Simplify the strongest contours before vector or Lottie tracing.
- Keep disparity changes slow, allow breaks, and offer a flat or lower-motion version.
- Analyze delivered motion for general and saturated-red flash risk at its largest viewing size.

## Sources

- NASA, “What on Earth Is an Anaglyph?”: https://science.nasa.gov/blogs/earth-matters/2016/11/21/what-on-earth-is-an-anaglyph/
- Perception, “On the Origins of Terms in Binocular Vision”: https://pmc.ncbi.nlm.nih.gov/articles/PMC7926055/
- NASA MESSENGER, “Seeing to New Depths (Anaglyph)”: https://science.nasa.gov/photojournal/seeing-to-new-depths-anaglyph/
- Journal of Vision, “The Zone of Comfort”: https://pmc.ncbi.nlm.nih.gov/articles/PMC3369815/
- W3C, “Understanding Use of Color”: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color
- W3C, “Understanding Three Flashes or Below Threshold”: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold
- Ether-MOSH registry: https://ether-mosh.online/effects#anaglyph

Open Ether-MOSH: https://ether-mosh.online/edit
