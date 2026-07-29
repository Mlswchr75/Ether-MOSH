# Transparent-background cutouts

Produces a transparent PNG "sibling" for each product's featured photo, named
after the product handle so it can be wired back to the listing afterwards.

The removal has to run on your Mac — the Shopify CDN is not reachable from the
agent sandbox, so the images can't be downloaded there.

## 1. Run it

```bash
cd tools/cutouts
python3 -m venv .venv && source .venv/bin/activate
pip install "rembg[cpu]" pillow requests

python3 make_cutouts.py --limit 10      # sanity-check 10 first
open review.html                        # eyeball them
python3 make_cutouts.py                 # then the full 524
```

- Resumable — finished files are skipped, so Ctrl-C and restart freely.
- First run downloads the matting model (~180MB) once.
- Output lands in `tools/cutouts/cutouts/`, one PNG per product.

Expect roughly 15–40 minutes for all 524 on Apple Silicon.

## 2. Check the results

`review.html` shows every cutout on a checkerboard, so anything that kept a
white box or lost part of the garment stands out immediately.

Delete the bad PNGs and re-run — only the missing ones get redone.

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
