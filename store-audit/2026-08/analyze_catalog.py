import json, re, collections, sys

SCRATCH = "/tmp/claude-0/-home-user-Mlswchr75/b061b005-e312-500b-aaa2-aa8df5ef7a64/scratchpad"

products = {}
variants = collections.defaultdict(list)
media = collections.defaultdict(list)

for line in open(f"{SCRATCH}/catalog.jsonl"):
    o = json.loads(line)
    if "id" not in o:   # non-image media nodes come back as {__parentId} only
        continue
    gid = o["id"]
    if "/Product/" in gid and "__parentId" not in o:
        products[gid] = o
    elif "/ProductVariant/" in gid:
        variants[o["__parentId"]].append(o)
    elif "/MediaImage/" in gid:
        media[o["__parentId"]].append(o)

print(f"products={len(products)}  variants={sum(len(v) for v in variants.values())}  media={sum(len(m) for m in media.values())}")

# --- status breakdown
print("\n== status ==")
for k, v in collections.Counter(p["status"] for p in products.values()).items():
    print(f"  {k}: {v}")

# --- §1 inventory policy
print("\n== §1 inventoryPolicy across all variants ==")
pol = collections.Counter()
deny_products = set()
for pid, vs in variants.items():
    for v in vs:
        pol[v["inventoryPolicy"]] += 1
        if v["inventoryPolicy"] != "CONTINUE":
            deny_products.add(pid)
print(" ", dict(pol))
print(f"  products with any non-CONTINUE variant: {len(deny_products)}")
for pid in list(deny_products)[:20]:
    print("   ", products[pid]["status"], products[pid]["title"][:70])

# --- §2 vendor
print("\n== §2 vendor ==")
for k, v in collections.Counter(p["vendor"] for p in products.values()).most_common():
    print(f"  {k!r}: {v}")
bad_vendor = [p for p in products.values() if p["vendor"] != "Aesthetic Rebellion"]
print(f"  needing fix: {len(bad_vendor)} (active: {sum(1 for p in bad_vendor if p['status']=='ACTIVE')})")

# alt text
alt_bad = [(pid, m) for pid, ms in media.items() for m in ms if m.get("alt") and "yoycol" in m["alt"].lower()]
print(f"  media alt containing 'Yoycol': {len(alt_bad)} across {len(set(p for p,_ in alt_bad))} products")

# --- §3 descriptions
print("\n== §3 descriptions ==")
desc_yoycol, desc_eurep = [], []
for gid, p in products.items():
    d = p.get("descriptionHtml") or ""
    if "yoycol" in d.lower():
        desc_yoycol.append(gid)
    if "eu representative" in d.lower() or "euegi.nl" in d.lower() or "Kraijenhoffstraat" in d:
        desc_eurep.append(gid)
print(f"  descriptionHtml containing 'Yoycol': {len(desc_yoycol)}")
print(f"  descriptionHtml containing EU-rep block: {len(desc_eurep)}")
for gid in desc_eurep:
    print(f"    [{products[gid]['status']}] {products[gid]['title'][:70]}")
empty_desc = [g for g, p in products.items() if not (p.get("descriptionHtml") or "").strip()]
print(f"  empty descriptions: {len(empty_desc)}")

# --- §4 tags
print("\n== §4 tags ==")
untagged = [(g, p) for g, p in products.items() if not p.get("tags")]
print(f"  products with NO tags: {len(untagged)}")
for g, p in untagged:
    print(f"    [{p['status']}] {p['createdAt'][:10]} {p['title'][:70]}")

# --- §5 White placeholder
print("\n== §5 'White' color option ==")
white_variants = collections.defaultdict(list)
for pid, vs in variants.items():
    for v in vs:
        for so in v.get("selectedOptions", []):
            if so["name"].lower() in ("color", "colour") and so["value"] == "White":
                white_variants[pid].append(v["id"])
print(f"  variants with Color=White: {sum(len(v) for v in white_variants.values())} across {len(white_variants)} products")
active_white = {p: v for p, v in white_variants.items() if products[p]["status"] == "ACTIVE"}
print(f"  ...of which ACTIVE products: {len(active_white)} products, {sum(len(v) for v in active_white.values())} variants")
# how many of those products have a genuinely multi-color option set?
multi = 0
for pid in white_variants:
    vals = set()
    for v in variants[pid]:
        for so in v.get("selectedOptions", []):
            if so["name"].lower() in ("color", "colour"):
                vals.add(so["value"])
    if len(vals) > 1:
        multi += 1
print(f"  products where Color has >1 distinct value: {multi}")

# --- §6 duplicates
print("\n== §6 duplicate candidates ==")
def norm(t):
    t = t.lower()
    t = re.sub(r"[—–|·]", " ", t)
    t = re.sub(r"\b(p[0-9a-z]{4,5})\b", " ", t)  # supplier sku suffixes
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return " ".join(t.split())
groups = collections.defaultdict(list)
for g, p in products.items():
    groups[norm(p["title"])].append(p)
dupes = {k: v for k, v in groups.items() if len(v) > 1}
print(f"  normalized-title groups with >1 product: {len(dupes)}")
for k, v in sorted(dupes.items(), key=lambda kv: -len(kv[1])):
    live = [p for p in v if p["status"] != "ARCHIVED"]
    print(f"    ({len(v)}, live={len(live)}) {k[:60]}")
    for p in sorted(v, key=lambda x: x["createdAt"]):
        print(f"        [{p['status']:8}] {p['createdAt']} {p['vendor']:20} {p['handle'][:55]}")

json.dump({
    "bad_vendor": [p["id"] for p in bad_vendor],
    "desc_yoycol": desc_yoycol,
    "desc_eurep": desc_eurep,
    "untagged": [g for g, _ in untagged],
    "white": {k: v for k, v in white_variants.items()},
}, open(f"{SCRATCH}/findings.json", "w"), indent=1)
