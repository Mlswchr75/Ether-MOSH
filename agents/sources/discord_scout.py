"""
Discord trend scouting via public Discord server search and public message archives.
Full bot integration requires DISCORD_BOT_TOKEN in .env and being added to servers.
Without a token, falls back to scraping public Discord archives and disboard.org.
"""
import os
import requests
import json
from datetime import datetime
from bs4 import BeautifulSoup
from config import RAW_DIR

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")


def scrape_disboard_trending() -> list[dict]:
    """Scrape Disboard (public Discord server directory) for popular trending servers."""
    results = []
    tags_to_check = ["fashion", "aesthetic", "streetwear", "art", "ecommerce", "business", "trending"]
    try:
        for tag in tags_to_check:
            url = f"https://disboard.org/servers/tag/{tag}"
            r = requests.get(url, headers=HEADERS, timeout=10)
            soup = BeautifulSoup(r.text, "html.parser")
            for server in soup.select(".server-name"):
                results.append({
                    "source": "disboard",
                    "tag": tag,
                    "server": server.get_text(strip=True),
                })
    except Exception as e:
        print(f"  [!] Disboard: {e}")
    return results


def fetch_via_bot(channel_ids: list[str], limit: int = 50) -> list[dict]:
    """If bot token present, fetch recent messages from specified channels."""
    if not BOT_TOKEN:
        return []
    results = []
    for channel_id in channel_ids:
        try:
            url = f"https://discord.com/api/v10/channels/{channel_id}/messages?limit={limit}"
            r = requests.get(url, headers={
                **HEADERS,
                "Authorization": f"Bot {BOT_TOKEN}",
            }, timeout=10)
            if r.status_code == 200:
                for msg in r.json():
                    results.append({
                        "source": f"discord_channel_{channel_id}",
                        "content": msg.get("content", ""),
                        "timestamp": msg.get("timestamp", ""),
                        "author": msg.get("author", {}).get("username", ""),
                    })
        except Exception as e:
            print(f"  [!] Discord channel {channel_id}: {e}")
    return results


def run(channel_ids: list[str] = None, save_path: str = None) -> dict:
    print("[Discord] Starting scan...")
    data = {
        "disboard_trending": scrape_disboard_trending(),
        "bot_messages": fetch_via_bot(channel_ids or []),
    }

    for k, v in data.items():
        print(f"  {k}: {len(v)} items")

    if save_path is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        save_path = os.path.join(RAW_DIR, f"discord_{ts}.json")

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"[Discord] Saved → {save_path}")
    return data
