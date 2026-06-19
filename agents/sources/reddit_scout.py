import praw
import json
import os
from datetime import datetime
from config import REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT, REDDIT_SUBS, VIRAL_SIGNALS, RAW_DIR


def get_client():
    return praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        user_agent=REDDIT_USER_AGENT,
    )


def is_viral(text: str) -> bool:
    text_lower = text.lower()
    return any(sig in text_lower for sig in VIRAL_SIGNALS)


def scrape_subreddit(reddit, sub_name: str, limit: int = 25) -> list[dict]:
    results = []
    try:
        sub = reddit.subreddit(sub_name)
        for post in sub.hot(limit=limit):
            if post.score < 50:
                continue
            entry = {
                "source": f"r/{sub_name}",
                "title": post.title,
                "score": post.score,
                "comments": post.num_comments,
                "url": f"https://reddit.com{post.permalink}",
                "flair": post.link_flair_text,
                "viral_signals": is_viral(post.title),
                "created_utc": post.created_utc,
            }
            results.append(entry)
    except Exception as e:
        print(f"  [!] r/{sub_name}: {e}")
    return results


def run(save_path: str = None) -> list[dict]:
    print("[Reddit] Starting scan...")
    reddit = get_client()
    all_posts = []

    for sub in REDDIT_SUBS:
        posts = scrape_subreddit(reddit, sub)
        all_posts.extend(posts)
        print(f"  r/{sub}: {len(posts)} posts")

    # Save raw data
    if save_path is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        save_path = os.path.join(RAW_DIR, f"reddit_{ts}.json")

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "w") as f:
        json.dump(all_posts, f, indent=2)

    print(f"[Reddit] Saved {len(all_posts)} posts → {save_path}")
    return all_posts
