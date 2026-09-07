# Ether-MOSH Solarize field card

## Direct answer

Solarize is a real-time Color effect that inverts each RGB channel when that channel rises above **Pivot**, then blends the altered color with **Amount**. It echoes the positive/negative reversal of photographic solarization but does not reproduce darkroom chemistry.

## Find it

1. Open Ether-MOSH and load an image, camera, or video source.
2. Open the FX panel.
3. Choose **Color**.
4. Add **Solarize**.

## Controls

| Control | Range | Default | Practical start | What it does |
| --- | ---: | ---: | ---: | --- |
| Amount | 0–1 | 0.70 | 0.35 | Replaces the source with the selectively inverted result. The current renderer applies a 2× gain, so the visible slider reaches a complete blend around 0.50 and becomes more clipped above it. |
| Pivot | 0.15–0.85 | 0.50 | 0.52 | Inverts red, green, or blue independently when that channel is above the pivot. Lower values flip more of the frame. |

## Five-step recipe

1. Start with a hard-lit portrait, flower, product still, or architectural detail.
2. Set **Amount 0.35** and **Pivot 0.52**.
3. Sweep Pivot between **0.35–0.65** until the important highlight boundaries reverse.
4. Raise Amount toward **0.50** for a complete blend; move higher only for deliberate clipping.
5. Stack **Posterize** or **Film Grain** after Solarize, then proof the export at its real print or venue size.

## Production checks

- Keep meaningful text, captions, and instructions outside the effected image.
- Soft-proof inverted color before CMYK printing or all-over-print production.
- Inspect a 3×3 repeat before committing to fabric or wallpaper.
- For projection, automate one control slowly and test the largest display.
- Do not create more than three high-contrast flashes per second unless the result has been measured below the applicable accessibility thresholds.

## Remember

Darkroom solarization or the Sabattier effect uses an additional light exposure during chemical development. Ether-MOSH uses a per-channel threshold and inversion shader. Similar visual family; different machinery.

Sources: [Getty Research](https://vocab.getty.edu/page/aat/300135014) · [MoMA](https://www.moma.org/interactives/objectphoto/materials/glossary.html) · [The Met](https://www.metmuseum.org/perspectives/man-ray-lee-miller) · [W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) · [Ether-MOSH effect registry](https://ether-mosh.online/effects#solarize)
