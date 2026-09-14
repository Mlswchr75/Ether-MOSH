# Ether-MOSH Photocopy field card

## Direct answer

Photocopy is a **Color Chaos** effect that compares each pixel's luminance with a local blurred average, shifts the cutoff with **Exposure**, adds fine fixed spatial noise, and maps the result between near-black toner and warm off-white paper. **Amount** blends that stylization over the source. It is a GPU effect, not physical xerography or a preservation process.

## Starter recipe

- Category: Color Chaos
- Amount: 0.55
- Exposure: 0.48
- Source: a portrait, botanical scan, bold object, architectural detail, camera feed, or Forge composition with clear light-dark structure
- Optional stack: restrained Halftone for print texture or Cross Hatch for drawn structure

## Control map

| Control | Range | Default | What it changes | Practical start |
| --- | ---: | ---: | --- | ---: |
| Amount | 0–1 | 0.80 | Blends the source with the black-toner and off-white-paper result; 0 is a true visual bypass | 0.55 |
| Exposure | 0–1 | 0.50 | Shifts the local luminance cutoff; higher values make more local tones dark | 0.48 |

## Five-step recipe

1. Load a high-contrast source with a strong silhouette or readable local detail.
2. Open the FX panel, choose **Color Chaos**, and add **Photocopy**.
3. Set **Amount 0.55** and **Exposure 0.48**.
4. Move Exposure first to protect faces, highlights, captions, and other important detail; then set the blend with Amount.
5. Proof the final still, 3×3 repeat, vector or Lottie simplification, compression, and actual projector or LED display.

## Production checks

- Set Amount to 0 when you need the untouched source.
- Raising Exposure makes more local tones dark; lower it when midtones disappear.
- Keep essential text and safety information outside the effected layer.
- Do not describe the effect as physical xerography, a toner separation, or an archival copy.
- Inspect physical prints at final size and follow real prepress requirements.
- For preservation facsimiles, follow collection-specific paper, imaging-material, adhesion, inspection, identification, and storage standards.
- Analyze delivered motion for contrast and flash risk, especially when Exposure or source brightness changes quickly.
- Provide a clean or lower-intensity alternate when the transformed image carries important information.

## Sources

- Xerox, “Chester Carlson and Xerography”: https://www.xerox.com/en-us/innovation/insights/chester-carlson-xerography
- MoMA, “Jack Whitten. Broken Spaces #1”: https://www.moma.org/collection/works/110295
- MoMA, “The Seth Siegelaub Papers as Institutional Critique”: https://www.moma.org/calendar/exhibitions/1327
- Library of Congress, “Preservation Facsimile”: https://www.loc.gov/preservation/care/photocpy.html
- W3C, “Web Content Accessibility Guidelines 2.2”: https://www.w3.org/TR/WCAG22/
- Ether-MOSH registry: https://ether-mosh.online/effects#photocopy

Open Ether-MOSH: https://ether-mosh.online/edit
Read the full field report: https://ether-mosh.online/news/make-the-photocopy-effect-stop-copying-the-evidence
