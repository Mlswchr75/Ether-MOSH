# Ether-MOSH Thermal field card

## Direct answer

Thermal is a real-time **Color Chaos** effect that maps visible RGB luminance into a violet–magenta–yellow false-color palette. **Mix** controls how much of that palette replaces the source; **Range** compresses or expands contrast around mid-gray. It does not sense infrared radiation or measure temperature.

## Find it

1. Open Ether-MOSH and load an image, camera, or video source.
2. Open the FX panel.
3. Choose **Color Chaos**.
4. Add **Thermal**.

## Controls

| Control | Declared range | Default | Practical start | What it does |
| --- | ---: | ---: | ---: | --- |
| Mix | 0–1 | 0.80 | 0.35 | Blends the false-color map with the source. The renderer doubles the value sent to the underlying shader, so the visible control reaches a complete replacement around 0.50 and becomes more exaggerated above it. |
| Range | 0–1 | 0.50 | 0.40 | Scales visible-light luminance around mid-gray. Low settings compress the palette; high settings expand it and push more pixels toward the violet and yellow ends. |

## Five-step recipe

1. Start with a side-lit portrait, sculpture, flower, product still, or architectural detail.
2. Set **Mix 0.35** and **Range 0.40**.
3. Move Range toward **0.20** for smoother transitions or **0.70** for hard separation.
4. Raise Mix toward **0.50** for a full palette replacement, then add CRT, Bloom, or Film Grain if useful.
5. Proof the still or loop on its actual print, tile, LED wall, or projector and keep any meaningful legend outside the effected pixels.

## Production checks

- Never label an RGB Thermal frame as temperature evidence.
- Keep meaningful information available through text, shape, pattern, or another cue—not color alone.
- Soft-proof saturated violet, magenta, and yellow before CMYK or all-over-print production.
- Inspect a 3×3 repeat before sending a pattern to fabric or wallpaper.
- Test animated venue output at full size for flash, contrast, and legibility.

## Remember

Real thermography detects infrared radiation and requires a calibrated measurement workflow. Ether-MOSH recolors visible RGB luminance. Similar visual language; different signal and purpose.

Sources: [NASA infrared history](https://science.nasa.gov/ems/07_infraredwaves/) · [NASA false-color guide](https://science.nasa.gov/earth/earth-observatory/how-to-interpret-a-false-color-satellite-image/) · [FLIR thermography reference](https://support.flir.com/docdownload/assets/web/27eh/en-us/) · [W3C Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) · [Ether-MOSH effect registry](https://ether-mosh.online/effects#thermal)
