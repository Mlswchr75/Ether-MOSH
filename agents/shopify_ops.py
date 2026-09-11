"""
Daily Shopify operations manager for Aesthetic Rebellion.
Run this for your daily store check-in — it pulls orders, flags issues,
and produces an action list so you can approve/action each item fast.
"""
import json
import os
from datetime import datetime
from config import ANTHROPIC_API_KEY, HAIKU_MODEL, REPORTS_DIR
import anthropic

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def summarize_orders(orders: list[dict]) -> str:
    if not orders:
        return "No recent orders."
    lines = []
    for o in orders:
        name = o.get("name", "")
        status = o.get("financialStatus", "")
        fulfillment = o.get("fulfillmentStatus", "unfulfilled")
        total = o.get("totalPrice", "")
        customer = o.get("customer", {})
        cname = f"{customer.get('firstName', '')} {customer.get('lastName', '')}".strip() if customer else "Guest"
        lines.append(f"{name} | {cname} | ${total} | {status} | {fulfillment}")
    return "\n".join(lines)


def generate_daily_briefing(orders_summary: str, store_name: str = "Aesthetic Rebellion") -> dict:
    """Use Haiku to generate a fast daily ops briefing."""
    prompt = f"""
Store: {store_name}
Date: {datetime.now().strftime("%B %d, %Y")}
Recent orders:
{orders_summary}

Generate a concise daily ops briefing as JSON:
{{
  "orders_needing_attention": ["order details..."],
  "fulfillment_flags": ["any unfulfilled orders older than 24h..."],
  "revenue_today": "summary",
  "action_list": [
    {{"action": "...", "priority": "high|medium|low"}}
  ],
  "summary": "one sentence"
}}
Respond ONLY with valid JSON.
"""
    msg = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    result = msg.content[0].text.strip().strip("```json").strip("```").strip()
    try:
        return json.loads(result)
    except Exception:
        return {"raw": result}


def save_briefing(briefing: dict):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    path = os.path.join(REPORTS_DIR, f"daily_ops_{ts}.json")
    with open(path, "w") as f:
        json.dump(briefing, f, indent=2)
    # Overwrite today's latest
    with open(os.path.join(REPORTS_DIR, "ops_latest.json"), "w") as f:
        json.dump(briefing, f, indent=2)
    print(f"[Ops] Briefing saved → {path}")
    return path


def print_briefing(briefing: dict):
    print("\n" + "="*60)
    print("  AESTHETIC REBELLION — DAILY OPS BRIEFING")
    print("="*60)
    print(f"\nSummary: {briefing.get('summary', '')}\n")

    actions = briefing.get("action_list", [])
    if actions:
        print("ACTION LIST:")
        for a in actions:
            priority = a.get("priority", "").upper()
            print(f"  [{priority}] {a.get('action', '')}")

    flags = briefing.get("fulfillment_flags", [])
    if flags:
        print("\nFULFILLMENT FLAGS:")
        for f in flags:
            print(f"  ⚠ {f}")

    print("="*60 + "\n")
