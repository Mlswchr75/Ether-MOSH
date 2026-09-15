import json
import os
import anthropic
from datetime import datetime
from config import ANTHROPIC_API_KEY, HAIKU_MODEL, SONNET_MODEL, REPORTS_DIR

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _haiku(prompt: str, system: str = "") -> str:
    """Cheap bulk analysis pass using Haiku."""
    msg = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=1024,
        system=system or "You are a trend analyst. Be concise and structured.",
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text


def _sonnet(prompt: str, system: str = "") -> str:
    """High-quality synthesis pass using Sonnet."""
    msg = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=2048,
        system=system or "You are a senior trend analyst and product strategist.",
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text


def extract_keywords_from_reddit(posts: list[dict]) -> list[str]:
    """Use Haiku to pull trending keywords/products from Reddit post titles."""
    if not posts:
        return []
    # Batch titles to reduce calls — send up to 100 at once
    titles = [p["title"] for p in posts[:100] if p.get("viral_signals") or p.get("score", 0) > 100]
    if not titles:
        titles = [p["title"] for p in posts[:50]]

    chunk = "\n".join(f"- {t}" for t in titles)
    result = _haiku(
        f"From these Reddit post titles, extract a JSON list of trending product names, "
        f"aesthetic keywords, and viral concepts relevant to 2026 e-commerce.\n\n{chunk}\n\n"
        f"Respond ONLY with a JSON array of strings.",
    )
    try:
        # Strip markdown fences if present
        clean = result.strip().strip("```json").strip("```").strip()
        return json.loads(clean)
    except Exception:
        return []


def extract_keywords_from_web(web_data: dict) -> list[str]:
    """Use Haiku to pull keywords from web scrape data."""
    items = []
    for source, entries in web_data.items():
        for e in entries[:30]:
            term = e.get("term") or e.get("hashtag") or e.get("server") or ""
            if term:
                items.append(f"[{source}] {term}")

    if not items:
        return []

    chunk = "\n".join(items[:120])
    result = _haiku(
        f"From these trending terms and hashtags, extract a JSON list of the most commercially "
        f"relevant product keywords and aesthetic trends for 2026 e-commerce.\n\n{chunk}\n\n"
        f"Respond ONLY with a JSON array of strings.",
    )
    try:
        clean = result.strip().strip("```json").strip("```").strip()
        return json.loads(clean)
    except Exception:
        return []


def synthesize_final_report(
    reddit_keywords: list[str],
    web_keywords: list[str],
    store_context: str = "Aesthetic Rebellion — an art/fashion e-commerce store",
) -> dict:
    """Use Sonnet for the final high-quality synthesis and action plan."""

    all_keywords = list(set(reddit_keywords + web_keywords))
    keywords_str = "\n".join(f"- {k}" for k in all_keywords[:150])

    system = (
        "You are a senior trend analyst and product strategist specializing in viral e-commerce, "
        "Gen Z culture, and 2026 aesthetic movements. You give actionable, specific intelligence."
    )

    prompt = f"""
Store context: {store_context}
Date: {datetime.now().strftime("%B %d, %Y")}

Raw trending keywords collected from Reddit, Pinterest, TikTok, Google Trends, Etsy, and Discord:
{keywords_str}

Produce a structured trend intelligence report as JSON with this exact shape:
{{
  "top_viral_keywords": ["keyword1", ...],  // top 20 highest-potential keywords
  "trending_products": [
    {{
      "product": "name",
      "why_trending": "brief reason",
      "growth_potential": "high|medium|low",
      "relevant_to_store": true/false
    }},
    ...  // top 15 products
  ],
  "aesthetic_movements": ["movement1", ...],  // top 10 rising aesthetics
  "recommended_actions": [
    {{
      "action": "what to do",
      "priority": "urgent|high|medium",
      "estimated_impact": "brief"
    }},
    ...  // top 10 actions
  ],
  "keywords_to_target_in_ads": ["kw1", ...],  // top 15 for paid/organic
  "summary": "2-3 sentence executive summary"
}}

Respond ONLY with valid JSON.
"""

    result = _sonnet(prompt, system)
    try:
        clean = result.strip().strip("```json").strip("```").strip()
        return json.loads(clean)
    except Exception:
        return {"raw": result, "error": "JSON parse failed"}


def run(reddit_data: list, web_data: dict, discord_data: dict = None) -> dict:
    print("[Analyzer] Extracting keywords from Reddit...")
    reddit_kws = extract_keywords_from_reddit(reddit_data)
    print(f"  Reddit keywords: {len(reddit_kws)}")

    print("[Analyzer] Extracting keywords from web sources...")
    web_kws = extract_keywords_from_web(web_data)
    print(f"  Web keywords: {len(web_kws)}")

    print("[Analyzer] Running final Sonnet synthesis...")
    report = synthesize_final_report(reddit_kws, web_kws)

    # Save report
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_path = os.path.join(REPORTS_DIR, f"trend_report_{ts}.json")
    with open(report_path, "w") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "reddit_keywords": reddit_kws,
            "web_keywords": web_kws,
            "report": report,
        }, f, indent=2)

    # Also overwrite latest.json for easy access
    latest_path = os.path.join(REPORTS_DIR, "latest.json")
    with open(latest_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"[Analyzer] Report saved → {report_path}")
    return report
