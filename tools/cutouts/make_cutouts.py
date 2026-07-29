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
OVERRIDES = HERE / "overrides.csv"   # optional, exported from choices.html
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
            # Every candidate, so the review page can offer the full set.
            "alternates": json.dumps([
                {"url": g["image_url"], "score": g["score"],
                 "cut": int(bool(g.get("touches_edge", False)))}
                for g in group
            ]),
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
    log(f"\nreview: open {HERE / 'choices.html'}")
    log(f"  {flagged} flagged — click a thumbnail to swap, then Download overrides.csv")
    log("  save it next to this script and run --cut; the rest need no attention")
    return winners


def build_choice_sheet(winners, path):
    """An interactive picker, not just a contact sheet.

    Click any thumbnail to override the chosen photo, then export
    overrides.csv — no hand-editing URLs. Choices survive a page reload via
    localStorage, so a long review can be done in several sittings.
    """
    data = [
        {
            "handle": r["handle"],
            "chosen": r["chosen_url"],
            "score": r["score"],
            "review": r["needs_review"],
            "clean": r["full_shots_found"],
            "alts": json.loads(r["alternates"]),
        }
        for r in sorted(winners, key=lambda r: (-r["needs_review"], r["score"]))
    ]
    flagged = sum(d["review"] for d in data)

    path.write_text("""<!doctype html><meta charset=utf-8><title>Choose product photos</title>
<style>
:root{color-scheme:dark}
body{background:#111;color:#eee;font:13px/1.4 system-ui;margin:0;padding:16px 20px 90px}
h1{font-size:17px;margin:0 0 4px}
.sub{color:#999;margin-bottom:14px}
.bar{position:fixed;left:0;right:0;bottom:0;background:#000;border-top:2px solid #333;
     padding:12px 20px;display:flex;gap:12px;align-items:center;z-index:9}
button{background:#ff2bd6;color:#000;border:0;padding:10px 16px;font:700 12px system-ui;
       text-transform:uppercase;letter-spacing:.06em;cursor:pointer;border-radius:4px}
button.ghost{background:#222;color:#eee;border:1px solid #444}
label{display:flex;gap:6px;align-items:center;color:#bbb;cursor:pointer}
main{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))}
figure{margin:0;background:#1a1a1a;padding:10px;border-radius:8px;border:2px solid transparent}
figure.changed{border-color:#4dff9f}
figure[data-review="1"]{border-color:#ff5c5c}
figure.changed[data-review="1"]{border-color:#4dff9f}
.pick{width:100%;height:230px;object-fit:contain;background:#fff;border-radius:4px}
.meta{font-size:11px;margin:8px 0 6px;word-break:break-word;color:#ddd}
.flag{color:#ff5c5c;font-weight:700}
.ok{color:#4dff9f;font-weight:700}
.alts{display:flex;gap:5px;flex-wrap:wrap}
.alts img{width:50px;height:50px;object-fit:cover;background:#fff;border-radius:3px;
          opacity:.55;cursor:pointer;border:2px solid transparent}
.alts img:hover{opacity:1}
.alts img.sel{opacity:1;border-color:#4dff9f}
.alts img.cut{outline:2px solid #ff5c5c;outline-offset:-2px}
.hide{display:none}
</style>
<h1>Choose the photo to cut out</h1>
<div class="sub">Click a thumbnail to swap the big picture. Red border = flagged.
Red outline on a thumb = product runs off the edge in that shot.</div>
<main id="grid"></main>
<div class="bar">
  <label><input type="checkbox" id="only" checked> Flagged only (<span id=nflag></span>)</label>
  <span id="count" style="color:#999"></span>
  <button id="save">Download overrides.csv</button>
  <button class="ghost" id="reset">Reset</button>
</div>
<script>
const DATA = __DATA__;
const KEY = 'ar-cutout-overrides';
let picks = JSON.parse(localStorage.getItem(KEY) || '{}');
const wide = u => u + (u.includes('?') ? '&' : '?') + 'width=';

document.getElementById('nflag').textContent = DATA.filter(d => d.review).length;

const grid = document.getElementById('grid');
grid.innerHTML = DATA.map((d, i) => `
  <figure data-i="${i}" data-review="${d.review}" class="${picks[d.handle] ? 'changed' : ''}">
    <img class="pick" loading="lazy" src="${wide(picks[d.handle] || d.chosen)}400">
    <div class="meta">${d.handle}<br>
      ${d.review ? '<span class=flag>NEEDS REVIEW</span>' : '<span class=ok>ok</span>'}
      · score ${d.score} · ${d.clean} uncropped</div>
    <div class="alts">${d.alts.map(a => `
      <img loading="lazy" src="${wide(a.url)}110" data-url="${a.url}"
           class="${(picks[d.handle] || d.chosen) === a.url ? 'sel' : ''}${a.cut ? ' cut' : ''}"
           title="score ${a.score}${a.cut ? ' — cut off at edge' : ''}">`).join('')}</div>
  </figure>`).join('');

grid.addEventListener('click', e => {
  const thumb = e.target.closest('.alts img');
  if (!thumb) return;
  const fig = thumb.closest('figure');
  const d = DATA[+fig.dataset.i];
  const url = thumb.dataset.url;

  if (url === d.chosen) delete picks[d.handle];   // back to the automatic pick
  else picks[d.handle] = url;

  localStorage.setItem(KEY, JSON.stringify(picks));
  fig.querySelector('.pick').src = wide(url) + '400';
  fig.classList.toggle('changed', !!picks[d.handle]);
  fig.querySelectorAll('.alts img').forEach(t => t.classList.toggle('sel', t.dataset.url === url));
  refresh();
});

function refresh() {
  const only = document.getElementById('only').checked;
  DATA.forEach((d, i) => {
    const fig = grid.querySelector(`figure[data-i="${i}"]`);
    fig.classList.toggle('hide', only && !d.review && !picks[d.handle]);
  });
  document.getElementById('count').textContent = Object.keys(picks).length + ' overridden';
}
document.getElementById('only').addEventListener('change', refresh);

document.getElementById('save').addEventListener('click', () => {
  const rows = [['handle', 'chosen_url'], ...Object.entries(picks)];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  a.download = 'overrides.csv';
  a.click();
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Discard all your manual picks?')) return;
  picks = {}; localStorage.removeItem(KEY); location.reload();
});

refresh();
</script>""".replace("__DATA__", json.dumps(data)), encoding="utf-8")
    return flagged


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


def apply_overrides(rows, path=None):
    """Manual picks exported from choices.html win over the automatic choice."""
    path = path or OVERRIDES
    if not path.exists():
        return 0
    with path.open() as f:
        picks = {
            r["handle"]: r["chosen_url"]
            for r in csv.DictReader(f)
            if r.get("handle") and r.get("chosen_url")
        }
    applied = 0
    for r in rows:
        new = picks.get(r["handle"])
        if new and new != r["chosen_url"]:
            r["chosen_url"] = new
            applied += 1
    return applied


def phase_cut(model, workers, trim, overwrite, limit):
    if not SELECTED.exists():
        sys.exit("selected.csv missing — run with --select first")
    rows = list(csv.DictReader(SELECTED.open()))

    if OVERRIDES.exists():
        applied = apply_overrides(rows)
        log(f"applied {applied} manual override(s) from {OVERRIDES.name}")
        if applied:
            log("(delete those PNGs if they already exist, or pass --overwrite)")

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
