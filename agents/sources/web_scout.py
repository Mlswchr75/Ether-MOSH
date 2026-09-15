import requests
import json
import os
import time
from datetime import datetime
from bs4 import BeautifulSoup
from config import PINTEREST_CATEGORIES, VIRAL_SIGNALS, RAW_DIR

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


def scrape_pinterest_trends() -> list[dict]:
    """Scrape Pinterest trending searches and popular pins."""
    results = []
    try:
        url = "https://trends.pinterest.com/"
        r = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")
        # Pinterest trending terms appear in script tags as JSON
        for script in soup.find_all("script", type="application/json"):
            try:
                data = json.loads(script.string or "{}")
                # Walk the JSON looking for trend-shaped objects
                _extract_pinterest_trends(data, results)
            except Exception:
                pass
    except Exception as e:
        print(f"  [!] Pinterest trends: {e}")
    return results


def _extract_pinterest_trends(obj, results: list, depth: int = 0):
    if depth > 8:
        return
    if isinstance(obj, dict):
        # Look for objects with a 'trend' or 'keyword' key
        if "trend" in obj or "keyword" in obj or "query" in obj:
            term = obj.get("trend") or obj.get("keyword") or obj.get("query", "")
            if term and isinstance(term, str):
                results.append({"source": "pinterest_trends", "term": term, "data": obj})
        for v in obj.values():
            _extract_pinterest_trends(v, results, depth + 1)
    elif isinstance(obj, list):
        for item in obj:
            _extract_pinterest_trends(item, results, depth + 1)


def scrape_google_trends_rss() -> list[dict]:
    """Pull Google Trends daily trending searches via public RSS feed."""
    results = []
    try:
        url = "https://trends.google.com/trending/rss?geo=US"
        r = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(r.text, "xml")
        for item in soup.find_all("item"):
            title = item.find("title")
            traffic = item.find("ht:approx_traffic")
            results.append({
                "source": "google_trends",
                "term": title.text if title else "",
                "approx_traffic": traffic.text if traffic else "",
            })
    except Exception as e:
        print(f"  [!] Google Trends RSS: {e}")
    return results


def scrape_tiktok_discover() -> list[dict]:
    """Scrape TikTok discover/trending page for hashtags and sounds."""
    results = []
    try:
        url = "https://www.tiktok.com/discover"
        r = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")
        # TikTok inlines __NEXT_DATA__ JSON
        script = soup.find("script", id="__NEXT_DATA__")
        if script:
            data = json.loads(script.string or "{}")
            _extract_tiktok_trends(data, results)
    except Exception as e:
        print(f"  [!] TikTok discover: {e}")
    return results


def _extract_tiktok_trends(obj, results: list, depth: int = 0):
    if depth > 10:
        return
    if isinstance(obj, dict):
        if "hashtagName" in obj:
            results.append({
                "source": "tiktok_discover",
                "hashtag": obj.get("hashtagName", ""),
                "view_count": obj.get("viewCount", 0),
            })
        for v in obj.values():
            _extract_tiktok_trends(v, results, depth + 1)
    elif isinstance(obj, list):
        for item in obj:
            _extract_tiktok_trends(item, results, depth + 1)


def scrape_etsy_trending() -> list[dict]:
    """Scrape Etsy trending searches page."""
    results = []
    try:
        url = "https://www.etsy.com/trending"
        r = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.select("a[href*='search?q=']"):
            text = a.get_text(strip=True)
            if text:
                results.append({"source": "etsy_trending", "term": text})
        # dedupe
        seen = set()
        results = [r for r in results if not (r["term"] in seen or seen.add(r["term"]))]
    except Exception as e:
        print(f"  [!] Etsy trending: {e}")
    return results


def run(save_path: str = None) -> dict:
    print("[Web] Starting scan...")

    data = {
        "pinterest": scrape_pinterest_trends(),
        "google_trends": scrape_google_trends_rss(),
        "tiktok": scrape_tiktok_discover(),
        "etsy": scrape_etsy_trending(),
    }

    for source, items in data.items():
        print(f"  {source}: {len(items)} items")
        time.sleep(1)  # gentle rate limiting

    if save_path is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        save_path = os.path.join(RAW_DIR, f"web_{ts}.json")

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"[Web] Saved → {save_path}")
    return data
