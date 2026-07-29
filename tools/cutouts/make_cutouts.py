#!/usr/bin/env python3
"""
Pick the best full-product photo for each listing, then cut its background out.

Two phases:

  select  Score every candidate photo and choose the one that shows the whole
          product — nothing running off an edge, not a zoomed detail crop, not
          a size chart. Works on cheap 512px thumbnails.
  cut     Matte the winner at full resolution and write a transparent PNG.

    python3 make_cutouts.py --select      # phase 1 -> selected.csv + choices.html
    python3 make_cutouts.py --cut         # phase 2 -> cutouts/*.png
    python3 make_cutouts.py               # both

Setup (on your Mac — the Shopify CDN isn't reachable from the agent sandbox):

    python3 -m venv .venv && source .venv/bin/activate
    pip install "rembg[cpu]" pillow requests numpy

Both phases are resumable; finished work is skipped on re-run.
"""

import argparse
import concurrent.futures
import csv
import io
import json
import pathlib
import sys
import threading

import numpy as np
import requests
from PIL import Image

HERE = pathlib.Path(__file__).parent
CANDIDATES = HERE / "candidates.csv"
SELECTED = HERE / "selected.csv"
OUT_DIR = HERE / "cutouts"
THUMBS = HERE / ".thumbs"

THUMB_WIDTH = 512
FULL_WIDTH = 1600
EDGE_BAND = 3        # px treated as "touching the border"

_local = threading.local()
_lock = threading.Lock()


def log(m):
    with _lock:
        print(m, flush=True)


def session():
    if not hasattr(_local, "s"):
        _local.s = requests.Session()
        _local.s.headers["User-Agent"] = "AR-cutout-batch/2.0"
    return _local.s


def remover(model):
    """rembg sessions aren't safe to share across threads — one per thread."""
    if not hasattr(_local, "r"):
        from rembg import new_session

        _local.r = new_session(model)
    return _local.r


def sized_url(url, width):
    """Insert Shopify's _{width}x transform before the extension."""
    if not url:
        return url
    base, _, query = url.partition("?")
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".avif"):
        if base.lower().endswith(ext):
            # Keep the URL's own spelling — lowercasing .JPG 404s on the CDN.
            base = f"{base[: -len(ext)]}_{width}x{base[-len(ext):]}"
            break
    return f"{base}?{query}" if query else base


def fetch_image(url, width, cache_path=None):
    if cache_path and cache_path.exists():
        return Image.open(cache_path).convert("RGB")
    r = session().get(sized_url(url, width), timeout=60)
    r.raise_for_status()
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(cache_path, "JPEG", quality=80)
    return img


# ----------------------------------------------------------------------
# Phase 1 — choose the photo
# ----------------------------------------------------------------------

def rough_mask(img):
    """Approximate the subject without running the matting model.

    POD product shots sit on a plain backdrop, so anything that differs from
    the border colour is subject. Cheap enough to run on every candidate.
    Returns (mask, confidence) — confidence drops when the backdrop isn't
    actually plain, in which case the geometry below shouldn't be trusted.
    """
    a = np.asarray(img, dtype=np.int16)
    h, w, _ = a.shape

    border = np.concatenate([
        a[:EDGE_BAND].reshape(-1, 3), a[-EDGE_BAND:].reshape(-1, 3),
        a[:, :EDGE_BAND].reshape(-1, 3), a[:, -EDGE_BAND:].reshape(-1, 3),
    ])
    bg = np.median(border, axis=0)
    spread = float(np.median(np.abs(border - bg).sum(axis=1)))
    confidence = 1.0 if spread < 30 else max(0.0, 1.0 - (spread - 30) / 90.0)

    mask = np.abs(a - bg).sum(axis=2) > 45
    return mask, confidence


def score_mask(mask, confidence):
    """Rank a photo by how completely it shows the product."""
    h, w = mask.shape
    total = mask.sum()
    if total < (h * w) * 0.01:
        return 0.0, {"reason": "almost empty"}

    ys, xs = np.nonzero(mask)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()

    touches = (
        top <= EDGE_BAND or left <= EDGE_BAND
        or bottom >= h - 1 - EDGE_BAND or right >= w - 1 - EDGE_BAND
    )

    fill = total / (h * w)
    bbox_area = max(1, (bottom - top + 1) * (right - left + 1))
    solidity = total / bbox_area                    # garments are solid; text/charts aren't
    margin = min(top, left, h - 1 - bottom, w - 1 - right) / max(h, w)
    cy, cx = ys.mean() / h, xs.mean() / w
    centred = 1.0 - min(1.0, (abs(cy - 0.5) + abs(cx - 0.5)) * 2)

    # How much of the frame the product fills is mostly a framing choice, not
    # a defect — a tightly shot but complete garment is still a full shot.
    # So this is a wide plateau that only punishes true extremes: a speck in
    # the corner, or a macro crop with no room left.
    if fill < 0.15:
        fill_score = fill / 0.15
    elif fill > 0.80:
        fill_score = max(0.0, 1.0 - (fill - 0.80) / 0.20)
    else:
        fill_score = 1.0

    score = 0.0
    # The stated requirement: nothing may run off an edge. Dominates everything.
    score += 0.0 if touches else 45.0
    score += min(margin / 0.04, 1.0) * 15.0
    score += fill_score * 20.0
    score += min(solidity / 0.55, 1.0) * 12.0
    score += centred * 8.0
    # A garment silhouette is a solid blob (~0.5–0.9). Scattered marks that
    # barely fill their own bounding box are text: size charts, care labels,
    # promo graphics. Penalise hard rather than just withholding points.
    if solidity < 0.25:
        score *= 0.45
    score *= 0.35 + 0.65 * confidence

    return score, {
        "touches_edge": bool(touches), "fill": round(float(fill), 3),
        "solidity": round(float(solidity), 3), "margin": round(float(margin), 3),
        "confidence": round(float(confidence), 2),
    }


def score_candidate(row):
    url = row["image_url"]
    key = f"{row['handle']}-{row['position']}.jpg"
    try:
        img = fetch_image(url, THUMB_WIDTH, THUMBS / key)
        mask, conf = rough_mask(img)
        score, detail = score_mask(mask, conf)
        # Providers usually lead with the clean front shot, so use position
        # only to break ties between otherwise equally good photos.
        score += max(0.0, 3.0 - int(row["position"]) * 0.5)
        # The main photo is already the right shot on most listings, so it
        # wins unless another photo is clearly better. This bonus is small
        # next to the 45-point edge-crop penalty, so a main photo that runs
        # off the frame still loses to a clean alternate — but a merely
        # slightly-tighter-cropped main photo is left alone.
        if int(row["is_featured"]):
            score += 8.0
        return {**row, "score": round(score, 2), **detail}
    except Exception as exc:
        return {**row, "score": -1.0, "reason": f"{type(exc).__name__}: {exc}"}


def phase_select(rows, workers):
    log(f"scoring {len(rows)} candidate photos at {THUMB_WIDTH}px…")
    scored = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for i, res in enumerate(pool.map(score_candidate, rows), 1):
            scored.append(res)
            if i % 250 == 0:
                log(f"  {i}/{len(rows)}")

    by_product = {}
    for r in scored:
        by_product.setdefault(r["handle"], []).append(r)

    winners = []
    for handle, group in by_product.items():
        group.sort(key=lambda r: -r["score"])
        best = group[0]
        clean = [g for g in group if not g.get("touches_edge", True) and g["score"] > 0]
        winners.append({
            "handle": handle,
            "product_id": best["product_id"],
            "chosen_url": best["image_url"],
            "chosen_position": best["position"],
            "target_filename": best["target_filename"],
            "score": best["score"],
            "full_shots_found": len(clean),
            "needs_review": int(best.get("touches_edge", True) or best["score"] < 45),
            "alternates": json.dumps([g["image_url"] for g in group[1:6]]),
        })

    winners.sort(key=lambda r: r["handle"])
    with SELECTED.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(winners[0].keys()))
        w.writeheader()
        w.writerows(winners)

    flagged = sum(r["needs_review"] for r in winners)
    none_clean = sum(1 for r in winners if r["full_shots_found"] == 0)
    log(f"\nchose a photo for {len(winners)} products")
    log(f"  {len(winners) - flagged} confident · {flagged} flagged for review")
    log(f"  {none_clean} products where every photo was cropped at an edge")

    build_choice_sheet(winners, HERE / "choices.html")
    log(f"\nreview: {HERE / 'choices.html'}")
    log("Wrong pick? Paste a better URL into chosen_url in selected.csv, then run --cut.")
    return winners


def build_choice_sheet(winners, path):
    """Chosen photo next to the runners-up, worst scores first."""
    cards = []
    for r in sorted(winners, key=lambda r: (-r["needs_review"], r["score"])):
        alts = "".join(
            f'<img src="{u}&width=150" loading="lazy" alt="">'
            for u in json.loads(r["alternates"])
        )
        flag = ' <b class="flag">REVIEW</b>' if r["needs_review"] else ""
        cards.append(
            f'<figure><img class="pick" loading="lazy" src="{r["chosen_url"]}&width=320" alt="">'
            f'<figcaption>{r["handle"]}{flag}<br><small>score {r["score"]} · '
            f'{r["full_shots_found"]} uncropped</small><div class="alts">{alts}</div>'
            f"</figcaption></figure>"
        )
    path.write_text(
        "<!doctype html><meta charset=utf-8><title>Chosen photos</title><style>"
        "body{background:#111;color:#eee;font:13px system-ui;margin:20px}"
        "main{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}"
        "figure{margin:0;background:#1c1c1c;padding:10px;border-radius:8px}"
        ".pick{width:100%;height:240px;object-fit:contain;background:#fff;border-radius:4px}"
        "figcaption{font-size:11px;margin-top:8px;word-break:break-word}"
        ".flag{color:#ff5c5c}.alts{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}"
        ".alts img{width:44px;height:44px;object-fit:cover;background:#fff;border-radius:3px;opacity:.65}"
        "</style><h1>Chosen photo per product — flagged items first</h1><main>"
        + "".join(cards) + "</main>",
        encoding="utf-8",
    )


# ----------------------------------------------------------------------
# Phase 2 — cut the background out
# ----------------------------------------------------------------------

def trim_alpha(img, pad=12):
    """Crop to the subject so cutouts share a consistent scale in a grid."""
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    return img.crop((max(0, l - pad), max(0, t - pad),
                     min(img.width, r + pad), min(img.height, b + pad)))


def cut_one(row, model, trim, overwrite):
    from rembg import remove

    handle = row["handle"]
    dest = OUT_DIR / row["target_filename"]
    if dest.exists() and not overwrite:
        return handle, "cached", ""
    try:
        img = fetch_image(row["chosen_url"], FULL_WIDTH)
        cut = remove(img.convert("RGBA"), session=remover(model), post_process_mask=True)

        # Re-check against the real mask; the phase-1 estimate was only a proxy.
        a = np.asarray(cut.getchannel("A"))
        edge = max(a[0].max(), a[-1].max(), a[:, 0].max(), a[:, -1].max())
        note = "subject reaches edge" if edge > 40 else ""

        if trim:
            cut = trim_alpha(cut)
        tmp = dest.with_suffix(".part")
        cut.save(tmp, "PNG", optimize=True)
        tmp.replace(dest)          # atomic — an interrupted run leaves no half file
        return handle, "ok", note
    except Exception as exc:
        return handle, "failed", f"{type(exc).__name__}: {exc}"


def phase_cut(model, workers, trim, overwrite, limit):
    if not SELECTED.exists():
        sys.exit("selected.csv missing — run with --select first")
    rows = list(csv.DictReader(SELECTED.open()))
    if limit:
        rows = rows[:limit]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    log(f"\ncutting {len(rows)} photos at {FULL_WIDTH}px · model={model}")
    log("(first run downloads the matting model, ~180MB)\n")

    tally = {"ok": 0, "cached": 0, "failed": 0}
    problems = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futs = [pool.submit(cut_one, r, model, trim, overwrite) for r in rows]
        for i, f in enumerate(concurrent.futures.as_completed(futs), 1):
            handle, status, note = f.result()
            tally[status] += 1
            if status == "failed" or note:
                problems.append((handle, status, note))
            if status != "cached" or i % 50 == 0:
                log(f"[{i}/{len(rows)}] {status:<7} {handle} {note}")

    log("\n" + "  ".join(f"{k}={v}" for k, v in tally.items()))
    if problems:
        rep = HERE / "problems.csv"
        with rep.open("w", newline="") as f:
            csv.writer(f).writerows([("handle", "status", "note"), *problems])
        log(f"{len(problems)} need a look — {rep}")
    log(f"\nPNGs: {OUT_DIR}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--select", action="store_true", help="only choose photos")
    ap.add_argument("--cut", action="store_true", help="only cut backgrounds")
    ap.add_argument("--model", default="birefnet-general",
                    help="birefnet-general (best) | isnet-general-use | u2net (fastest)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0, help="first N products only")
    ap.add_argument("--no-trim", action="store_true")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()

    do_select = args.select or not args.cut
    do_cut = args.cut or not args.select

    if do_select:
        if not CANDIDATES.exists():
            sys.exit(f"missing {CANDIDATES}")
        rows = list(csv.DictReader(CANDIDATES.open()))
        if args.limit:
            keep = {r["handle"] for r in rows}
            keep = set(sorted(keep)[: args.limit])
            rows = [r for r in rows if r["handle"] in keep]
        phase_select(rows, args.workers)

    if do_cut:
        phase_cut(args.model, args.workers, not args.no_trim, args.overwrite, args.limit)


if __name__ == "__main__":
    main()
