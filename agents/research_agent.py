#!/usr/bin/env python3
"""
Aesthetic Rebellion — Trend Research Agent
Scours Reddit, Pinterest, TikTok, Google Trends, Etsy, and Discord
for viral 2026 keywords and products with growth potential.

Usage:
    python research_agent.py              # Full run
    python research_agent.py --reddit     # Reddit only
    python research_agent.py --web        # Web sources only
    python research_agent.py --report     # Re-analyze latest raw data
    python research_agent.py --schedule   # Run on a daily schedule
"""
import sys
import json
import os
import glob
import argparse
import schedule
import time
from datetime import datetime
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

# Add agents dir to path when run directly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sources import reddit_scout, web_scout, discord_scout
from analysis import trend_analyzer
from config import RAW_DIR, REPORTS_DIR


def load_latest_raw(prefix: str) -> dict | list | None:
    """Load the most recent raw data file for a given source prefix."""
    pattern = os.path.join(RAW_DIR, f"{prefix}_*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        return None
    with open(files[-1]) as f:
        return json.load(f)


def print_report(report: dict):
    console.print(Panel.fit(
        f"[bold cyan]Aesthetic Rebellion — Trend Intelligence Report[/bold cyan]\n"
        f"[dim]{datetime.now().strftime('%B %d, %Y %H:%M')}[/dim]",
        border_style="cyan",
    ))

    console.print(f"\n[bold]Summary:[/bold] {report.get('summary', '')}\n")

    # Top viral keywords
    kws = report.get("top_viral_keywords", [])
    if kws:
        t = Table(title="Top Viral Keywords", show_header=False, border_style="dim")
        t.add_column("keyword", style="green")
        for kw in kws:
            t.add_row(kw)
        console.print(t)

    # Trending products
    products = report.get("trending_products", [])
    if products:
        t = Table(title="Trending Products", border_style="dim")
        t.add_column("Product", style="bold")
        t.add_column("Growth", style="cyan")
        t.add_column("Relevant", style="yellow")
        t.add_column("Why", style="dim")
        for p in products:
            rel = "✓" if p.get("relevant_to_store") else ""
            t.add_row(p.get("product", ""), p.get("growth_potential", ""), rel, p.get("why_trending", ""))
        console.print(t)

    # Recommended actions
    actions = report.get("recommended_actions", [])
    if actions:
        t = Table(title="Recommended Actions", border_style="dim")
        t.add_column("Priority", style="bold red")
        t.add_column("Action")
        t.add_column("Impact", style="dim")
        for a in actions:
            t.add_row(a.get("priority", "").upper(), a.get("action", ""), a.get("estimated_impact", ""))
        console.print(t)

    # Ad keywords
    ad_kws = report.get("keywords_to_target_in_ads", [])
    if ad_kws:
        console.print(f"\n[bold]Ad Keywords:[/bold] {', '.join(ad_kws)}\n")


def run_full(skip_reddit: bool = False, skip_web: bool = False, skip_discord: bool = False):
    console.print("[bold cyan]Starting full trend research run...[/bold cyan]")
    ts = datetime.now().strftime("%Y%m%d_%H%M")

    from config import REDDIT_CLIENT_ID
    reddit_data = []
    web_data = {}
    discord_data = {}

    reddit_available = bool(REDDIT_CLIENT_ID)
    if not skip_reddit and reddit_available:
        console.print("\n[yellow]▶ Reddit Scout[/yellow]")
        reddit_data = reddit_scout.run(save_path=os.path.join(RAW_DIR, f"reddit_{ts}.json"))
    elif not skip_reddit:
        console.print("\n[dim]▶ Reddit Scout skipped (no credentials — add REDDIT_CLIENT_ID to .env to enable)[/dim]")

    if not skip_web:
        console.print("\n[yellow]▶ Web Scout (Pinterest / Google / TikTok / Etsy)[/yellow]")
        web_data = web_scout.run(save_path=os.path.join(RAW_DIR, f"web_{ts}.json"))

    if not skip_discord:
        console.print("\n[yellow]▶ Discord Scout[/yellow]")
        discord_data = discord_scout.run(save_path=os.path.join(RAW_DIR, f"discord_{ts}.json"))

    console.print("\n[yellow]▶ AI Analysis & Report Generation[/yellow]")
    report = trend_analyzer.run(reddit_data, web_data, discord_data)

    print_report(report)
    console.print(f"\n[green]✓ Report saved to {REPORTS_DIR}/latest.json[/green]")
    return report


def run_report_only():
    """Re-analyze the most recent raw data without re-scraping."""
    console.print("[bold]Re-analyzing latest raw data...[/bold]")
    reddit_data = load_latest_raw("reddit") or []
    web_data = load_latest_raw("web") or {}
    report = trend_analyzer.run(reddit_data, web_data)
    print_report(report)
    return report


def scheduled_job():
    console.print(f"\n[dim]{datetime.now().isoformat()}[/dim] — Running scheduled trend scan...")
    run_full()


def main():
    parser = argparse.ArgumentParser(description="Aesthetic Rebellion Trend Research Agent")
    parser.add_argument("--reddit", action="store_true", help="Reddit only")
    parser.add_argument("--web", action="store_true", help="Web sources only")
    parser.add_argument("--report", action="store_true", help="Re-analyze latest raw data")
    parser.add_argument("--schedule", action="store_true", help="Run on daily schedule (6am + 6pm)")
    args = parser.parse_args()

    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)

    if args.report:
        run_report_only()
    elif args.reddit:
        reddit_scout.run()
    elif args.web:
        web_scout.run()
    elif args.schedule:
        console.print("[bold cyan]Scheduling trend scans at 6:00 AM and 6:00 PM daily...[/bold cyan]")
        schedule.every().day.at("06:00").do(scheduled_job)
        schedule.every().day.at("18:00").do(scheduled_job)
        scheduled_job()  # run immediately on start
        while True:
            schedule.run_pending()
            time.sleep(60)
    else:
        run_full()


if __name__ == "__main__":
    main()
