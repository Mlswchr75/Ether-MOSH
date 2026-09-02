# Ether-MOSH ASCII Collapse field card

## Quick recipe

- Category: Data Corruption
- Amount: 0.70
- Cell: 12 px
- Source: simple high-contrast silhouette
- Optional stack: Duotone before ASCII Collapse; CRT after it

## Control map

| Control | Range | What it changes |
| --- | ---: | --- |
| Amount | 0–1 | Blends the source with the glyph-like cell mask |
| Cell | 4–40 px | Sets the sampled square-grid size |

## Production checklist

1. Start at 0.70 Amount and 12 Cell.
2. Use 6–10 Cell for finer detail or 18–28 for stage-readable blocks.
3. Check subject recognition at thumbnail and venue distance.
4. Keep actual headlines, captions, and instructions as real text.
5. Treat the marks as decorative pixels, not character encoding.
6. For vectors, trace only the largest stable cell shapes.

## Accessibility note

ASCII Collapse creates pixels, not selectable or assistive-technology-readable text. Preserve every meaningful word as real content or provide an equivalent caption.

Learn more: https://ether-mosh.online/news/make-ascii-collapse-admit-it-is-not-actually-text

Sources:

- https://datatracker.ietf.org/doc/html/rfc20
- https://computerhistory.org/exhibits/technology-art/
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
