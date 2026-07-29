#!/usr/bin/env python3
"""
Batch background removal for Aesthetic Rebellion product photos.

Reads manifest.csv, downloads each product's featured image straight from
the Shopify CDN, strips the background, and writes a transparent PNG named
after the product handle so it can be matched back to the listing later.

Run this on your Mac — it needs to reach cdn.shopify.com.

    python3 -m venv .venv && source .venv/bin/activate
    pip install "rembg[cpu]" pillow requests
    python3 make_cutouts.py

Resumable: finished files are skipped, so you can stop and restart freely.
First run downloads the matting model (~180MB) once.
"""

import argparse
import concurrent.futures
import csv
import io
import pathlib
import sys
import threading

import requests
from PIL import Image

HERE = pathlib.Path(__file__).parent
DEFAULT_MANIFEST = HERE / "manifest.csv"
DEFAULT_OUT = HERE / "cutouts"

# Shopify serves any width off the same URL; ask for a big source so the
# cutout stays crisp when it's scaled up in a hover or search preview.
SOURCE_WIDTH = 1600

_local = threading.local()
_print_lock = threading.Lock()


def log(msg):
    with _print_lock:
        print(msg, flush=True)


def get_session():
    if not hasattr(_local, "session"):
        _local.session = requests.Session()
        _local.session.headers["User-Agent"] = "AR-cutout-batch/1.0"
    return _local.session


def get_remover(model):
    """One rembg session per thread — they are not thread-safe to share."""
    if not hasattr(_local, "remover"):
        from rembg import new_session

        _local.remover = new_session(model)
    return _local.remover


def sized_url(url, width):
    """Insert Shopify's _{width}x transform before the file extension."""
    if not url:
        return url
    base, _, query = url.partition("?")
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".avif"):
        if base.lower().endswith(ext):
            # Reuse the URL's own spelling of the extension — lowercasing a
            # .JPG here would 404 against the CDN.
            base = f"{base[: -len(ext)]}_{width}x{base[-len(ext):]}"
            break
    return f"{base}?{query}" if query else base


def trim_alpha(img, pad=12):
    """Crop to the subject and add a little breathing room.

    Without this every cutout keeps the original photo's framing, so garments
    end up floating at wildly different scales when laid out in a grid.
    """
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    left, top = max(0, left - pad), max(0, top - pad)
    right, bottom = min(img.width, right + pad), min(img.height, bottom + pad)
    return img.crop((left, top, right, bottom))


def process(row, out_dir, model, trim, overwrite):
    handle = row["handle"]
    url = row["featured_image_url"]
    dest = out_dir / row["target_filename"]

    if not url:
        return handle, "skipped", "no featured image"
    if dest.exists() and not overwrite:
        return handle, "cached", ""

    try:
        from rembg import remove

        resp = get_session().get(sized_url(url, SOURCE_WIDTH), timeout=60)
        resp.raise_for_status()

        cut = remove(
            Image.open(io.BytesIO(resp.content)).convert("RGBA"),
            session=get_remover(model),
            post_process_mask=True,
        )
        if trim:
            cut = trim_alpha(cut)

        tmp = dest.with_suffix(".part")
        cut.save(tmp, "PNG", optimize=True)
        tmp.replace(dest)  # atomic: a killed run never leaves a half PNG
        return handle, "ok", f"{dest.stat().st_size // 1024}KB"
    except Exception as exc:
        return handle, "failed", f"{type(exc).__name__}: {exc}"


def build_contact_sheet(out_dir, rows, path):
    """A single scrollable page to eyeball all cutouts at once.

    Checkerboard background so a cutout that kept a white box is obvious.
    """
    cards = []
    for r in rows:
        f = out_dir / r["target_filename"]
        if f.exists():
            cards.append(
                f'<figure><img loading="lazy" src="cutouts/{r["target_filename"]}" '
                f'alt=""><figcaption>{r["handle"]}</figcaption></figure>'
            )
    path.write_text(
        "<!doctype html><meta charset=utf-8><title>Cutout QA</title>"
        "<style>body{background:#111;color:#eee;font:13px system-ui;margin:20px}"
        "h1{font-size:16px}main{display:grid;gap:14px;"
        "grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}"
        "figure{margin:0;background:conic-gradient(#666 0 25%,#999 0 50%,#666 0 75%,#999 0)"
        " 0 0/22px 22px;padding:8px;border-radius:6px}"
        "img{width:100%;height:190px;object-fit:contain;display:block}"
        "figcaption{font-size:10px;color:#bbb;margin-top:6px;word-break:break-all}</style>"
        f"<h1>{len(cards)} cutouts — look for white boxes, chewed edges or missing pieces</h1>"
        "<main>" + "".join(cards) + "</main>",
        encoding="utf-8",
    )
    return len(cards)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=pathlib.Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    ap.add_argument(
        "--model",
        default="birefnet-general",
        help="birefnet-general (best) | isnet-general-use (faster) | u2net (fastest)",
    )
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0, help="process only the first N (try 10 first)")
    ap.add_argument("--no-trim", action="store_true", help="keep original framing")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()

    if not args.manifest.exists():
        sys.exit(f"manifest not found: {args.manifest}")

    rows = list(csv.DictReader(args.manifest.open()))
    if args.limit:
        rows = rows[: args.limit]
    args.out.mkdir(parents=True, exist_ok=True)

    log(f"{len(rows)} products · model={args.model} · {args.workers} workers")
    log("first run downloads the matting model, be patient\n")

    tally = {"ok": 0, "cached": 0, "failed": 0, "skipped": 0}
    failures = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process, r, args.out, args.model, not args.no_trim, args.overwrite)
            for r in rows
        ]
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            handle, status, detail = fut.result()
            tally[status] += 1
            if status == "failed":
                failures.append((handle, detail))
            if status != "cached" or i % 50 == 0:
                log(f"[{i}/{len(rows)}] {status:<7} {handle} {detail}")

    log("\n" + "  ".join(f"{k}={v}" for k, v in tally.items()))

    if failures:
        report = args.out.parent / "failures.csv"
        with report.open("w", newline="") as f:
            csv.writer(f).writerows([("handle", "error"), *failures])
        log(f"{len(failures)} failed — see {report} (safe to just re-run; it resumes)")

    sheet = args.out.parent / "review.html"
    n = build_contact_sheet(args.out, rows, sheet)
    log(f"\nQA sheet: {sheet}  ({n} cutouts)")
    log("Open it, scan for bad cutouts, delete those PNGs, then re-run to redo just those.")


if __name__ == "__main__":
    main()
