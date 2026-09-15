import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")

# Subreddits to monitor for trending products / culture
REDDIT_SUBS = [
    "hailcorporate", "findfashion", "streetwear", "malefashionadvice",
    "femalefashionadvice", "hypebeast", "sneakers", "Sneakers",
    "antiMLM", "entrepreneur", "ecommerce", "dropship",
    "ArtificialIntelligence", "ChatGPT", "MachineLearning",
    "aesthetics", "cottagecore", "darkacademia", "goblincore",
    "minimalism", "y2k", "90sdesign", "graphicdesign",
    "trending", "tiktoktrends", "Gifts", "GiftIdeas",
    "BuyItForLife", "shutupandtakemymoney", "mildlyinteresting",
]

# Pinterest trend categories to scrape
PINTEREST_CATEGORIES = [
    "aesthetic", "trending 2026", "viral products", "home decor trending",
    "fashion trends 2026", "gift ideas viral", "art prints trending",
    "neon aesthetic", "dark aesthetic", "cyberpunk fashion",
]

# Discord public servers to monitor (invite links or server IDs)
DISCORD_PUBLIC_SERVERS = [
    "hypebeast", "streetwear", "ecommerce", "dropshipping",
]

# Keywords that signal high growth/virality
VIRAL_SIGNALS = [
    "trending", "viral", "blew up", "everywhere", "can't stop seeing",
    "sold out", "waitlist", "hype", "aesthetic", "core", "2026",
    "gen z", "tiktok made me", "pinterest worthy", "obsessed",
]

DATA_DIR = "agents/data"
RAW_DIR = f"{DATA_DIR}/raw"
REPORTS_DIR = f"{DATA_DIR}/reports"

# Claude models — Haiku for bulk scraping analysis, Sonnet for final synthesis
HAIKU_MODEL = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"
