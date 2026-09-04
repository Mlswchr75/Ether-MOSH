"""
Reddit trend scouting via Reddit's public JSON API.
No credentials required — uses public hot/rising/top endpoints.
"""
import requests
import json
import os
import time
from datetime import datetime
from config import REDDIT_SUBS, VIRAL_SIGNALS, RAW_DIR

HEADERS = {
    "User-Agent": "TrendScout/1.0 (trend research bot; non-commercial)",
    "Accept": "application/json",
}


def is_viral(text: str) -> bool:
    text_lower = text.lower()
    return any(sig in text_lower for sig in VIRAL_SIGNALS)


def fetch_subreddit(sub: str, sort: str = "hot", limit: int = 25) -> list[dict]:
    url = f"https://www.reddit.com/r/{sub}/{sort}.json?limit={limit}&t=day"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 429:
            print(f"  [rate limit] r/{sub} — waiting 5s")
            time.sleep(5)
            r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            print(f"  [!] r/{sub} {sort}: HTTP {r.status_code}")
            return []
        posts = r.json().get("data", {}).get("children", [])
        results = []
        for p in posts:
            d = p.get("data", {})
            score = d.get("score", 0)
            if score < 20:
                continue
            results.append({
                "source": f"r/{sub}",
                "sort": sort,
                "title": d.get("title", ""),
                "score": score,
                "comments": d.get("num_comments", 0),
                "url": f"https://reddit.com{d.get('permalink', '')}",
                "flair": d.get("link_flair_text"),
                "viral_signals": is_viral(d.get("title", "")),
                "created_utc": d.get("created_utc", 0),
            })
        return results
    except Exception as e:
        print(f"  [!] r/{sub} {sort}: {e}")
        return []


def run(save_path: str = None) -> list[dict]:
    print("[Reddit] Scanning via public JSON API (no credentials needed)...")
    all_posts = []

    for sub in REDDIT_SUBS:
        # hot gives volume; rising gives early-signal trend detection
        posts = fetch_subreddit(sub, sort="hot")
        rising = fetch_subreddit(sub, sort="rising", limit=10)
        combined = posts + rising
        all_posts.extend(combined)
        print(f"  r/{sub}: {len(combined)} posts")
        time.sleep(0.75)  # gentle rate limiting — Reddit allows ~1 req/sec unauthenticated

    if save_path is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        save_path = os.path.join(RAW_DIR, f"reddit_{ts}.json")

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "w") as f:
        json.dump(all_posts, f, indent=2)

    print(f"[Reddit] Saved {len(all_posts)} posts → {save_path}")
    return all_posts
