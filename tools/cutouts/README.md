# Transparent-background cutouts

Produces a transparent PNG "sibling" for each product's featured photo, named
after the product handle so it can be wired back to the listing afterwards.

The removal has to run on your Mac — the Shopify CDN is not reachable from the
agent sandbox, so the images can't be downloaded there.

## 1. Run it

```bash
cd tools/cutouts
python3 -m venv .venv && source .venv/bin/activate
pip install "rembg[cpu]" pillow requests numpy

python3 make_cutouts.py --select        # phase 1: choose the right photo
open choices.html                       # check the picks, fix any you disagree with
python3 make_cutouts.py --cut           # phase 2: cut the backgrounds
```

Phase 1 scores all 3,290 candidate photos on 512px thumbnails and writes
`selected.csv` plus `choices.html`. Phase 2 mattes only the 524 winners at
full resolution, so the slow model runs once per product, not once per photo.

- Both phases are resumable — Ctrl-C and restart freely.
- Phase 2's first run downloads the matting model (~180MB) once.
- Output lands in `tools/cutouts/cutouts/`, one PNG per product.

Expect a few minutes for phase 1 and roughly 15–40 minutes for phase 2.

## 2. Check the picks

`choices.html` lists every product with the chosen photo and its runners-up,
**worst scores first**, so anything doubtful is at the top. Items marked
`REVIEW` are ones where even the best photo looked cropped or ambiguous.

Disagree with a pick? Paste a better URL into `chosen_url` in `selected.csv`
and re-run `--cut`. Delete a PNG to have it redone.

## How a photo gets picked

Scored from the product's own silhouette against the backdrop:

| Signal | Weight | Why |
|---|---|---|
| Silhouette touches an edge | −45 | Your rule: nothing cut off |
| Clear margin around product | 15 | Full shot, room to breathe |
| Frame coverage | 20 | Rejects specks and macro crops; tight-but-complete is fine |
| Solidity | 12, ×0.45 if very low | Garments are solid; size charts and text aren't |
| Centred | 8 | Front-on rather than a corner composition |
| Is the main photo | +8 | It's already right 75–90% of the time |

The main photo wins unless something is clearly better — but the edge-crop
penalty is far larger than its bonus, so a cut-off main photo still loses to
a clean alternate.

## Options

| Flag | Why |
|---|---|
| `--model isnet-general-use` | ~2× faster, slightly softer edges |
| `--model u2net` | Fastest, weakest on thin straps and fringe |
| `--workers 8` | More parallelism (8 is fine on M-series) |
| `--no-trim` | Keep the original framing instead of cropping to the garment |
| `--overwrite` | Redo everything from scratch |

`--limit N` only processes the first N rows — use it to test settings cheaply.

## Why cropping is on by default

Each source photo frames the garment differently. Without the crop, cutouts
float at inconsistent scales when laid out in a grid or a search preview.
Trimming to the subject (plus 12px) makes them line up.

## 3. Getting them back onto the listings

1. Shopify admin → **Content → Files** → drag in the whole `cutouts/` folder.
2. Tell me when the upload finishes.

I'll then match each file to its product by filename and attach it as a
`custom.cutout` file-reference metafield, so the theme can reach it as:

```liquid
{{ product.metafields.custom.cutout | image_url: width: 600 | image_tag }}
```

That's the "recorded and easily accessible sibling photo tied to the listing"
part — a real reference on the product, not a naming convention we have to
guess at later.

## Files

- `manifest.csv` — 524 products: handle, title, featured image URL, target filename
- `make_cutouts.py` — the batch job
- `cutouts/` — output PNGs (generated, git-ignored)
- `review.html` — QA contact sheet (generated)
- `failures.csv` — written only if something fails
