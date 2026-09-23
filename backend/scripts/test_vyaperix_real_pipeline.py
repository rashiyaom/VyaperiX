"""
test_vyaperix_real_pipeline.py — End-to-end execution of VyaperiX's real intelligence pipeline:

1. Stage A: Concurrent website crawl (crawl_website) + Domain Intelligence Search
2. Stage B: Trust-tier classification + Seed page enrichment (fetch_seed_pages)
3. Stage C: Profile Normalization & Semantic Aggregation (build_profile)
4. Stage D: LLM Commercial Intelligence Synthesis via llm_router
"""

import asyncio
import json
import os
import sys
import time
from urllib.parse import urlparse
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.services import scraper, normalizer, groq_client
from app.services.search.router import get_search_router
from config.domain_trust import classify_and_filter


TARGET_URL = "https://webscraper.io/test-sites/load-more"


async def run_pipeline():
    print("=" * 75)
    print("VYAPERIX AUTHENTIC PIPELINE: REAL SCRAPE & BUSINESS INTELLIGENCE")
    print(f"Target: {TARGET_URL}")
    print("=" * 75)

    domain = urlparse(TARGET_URL).netloc
    domain_hint = domain.split(".")[0] if domain else ""
    search_query = f"{domain_hint} {domain}" if domain_hint else domain

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1: Stage A — Parallel Crawl + Search
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[PHASE 1] Launching Stage A: Parallel Website Crawl + Web Search...")
    t0_stage_a = time.perf_counter()

    pages, search_results = await asyncio.gather(
        scraper.crawl_website(TARGET_URL),
        get_search_router().search(search_query, max_results=5),
        return_exceptions=False,
    )
    stage_a_ms = (time.perf_counter() - t0_stage_a) * 1000

    print(f"  Stage A Finished in: {stage_a_ms:.1f} ms")
    print(f"  Crawled Pages ({len(pages)}):")
    for i, p in enumerate(pages, 1):
        print(f"    [{i}] {p['url']} | chars: {len(p.get('text', '')):,} | method: {p.get('method')}")

    print(f"  External Search Results ({len(search_results)}):")
    for i, s in enumerate(search_results[:3], 1):
        print(f"    [{i}] {getattr(s, 'title', '')} ({getattr(s, 'url', '')})")

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 2: Stage B — Classify & Fetch Seed Enrichment
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[PHASE 2] Launching Stage B: Trust-Tier Classification & Seed Fetch...")
    t0_stage_b = time.perf_counter()

    seed_urls = classify_and_filter(search_results, domain)
    existing_urls = {p["url"] for p in pages}
    seeded_pages = []
    if seed_urls:
        print(f"  Classified {len(seed_urls)} external seed candidates.")
        seeded_pages = await scraper.fetch_seed_pages(
            seed_urls,
            existing_urls=existing_urls,
            max_seed_pages=3,
        )
    stage_b_ms = (time.perf_counter() - t0_stage_b) * 1000

    print(f"  Stage B Finished in: {stage_b_ms:.1f} ms | Seeded Pages: {len(seeded_pages)}")
    for i, p in enumerate(seeded_pages, 1):
        print(f"    [{i}] [{p.get('tier')}] {p['url']} (confidence: {p.get('confidence')})")

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 3: Profile Normalization & Semantic Aggregation
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[PHASE 3] Building Normalized Intelligence Profile...")
    profile = normalizer.build_profile(
        source_url=TARGET_URL,
        pages=pages,
        seeded_pages=seeded_pages,
        business_description="E-commerce site with load-more dynamic products",
    )

    company_name = profile.get("company_name", "WebScraper Test Site")
    total_chars = sum(len(p.get("text", "")) for p in profile.get("pages", []))
    print(f"  Identified Business Name: {company_name}")
    print(f"  Total Extracted Characters in Dossier: {total_chars:,}")
    print(f"  Normalized Pages ({len(profile.get('pages', []))}):")
    for i, p in enumerate(profile.get("pages", [])[:5], 1):
        print(f"    [{i}] [{p.get('tier')}] {p['url']} ({len(p.get('text', '')):,} chars, conf: {p.get('confidence')})")

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 4: Commercial Synthesis via VyaperiX LLM Router
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[PHASE 4] Running Commercial Intelligence Synthesis (LLM Router)...")
    t0_llm = time.perf_counter()

    try:
        report: groq_client.BusinessAnalysis = await groq_client.analyze_business_async(profile)
        llm_ms = (time.perf_counter() - t0_llm) * 1000

        print(f"  LLM Analysis Completed in: {llm_ms:.1f} ms")
        print("\n" + "=" * 75)
        print("SYNTHESIZED BUSINESS REPORT (FROM REAL SCRAPED DATA):")
        print("=" * 75)
        print(f"Company: {report.company_name} | Industry: {report.industry}")
        print(f"One-Line Summary: {report.one_line_summary}\n")
        print(f"Executive Overview:")
        overview = getattr(report.executive_summary, "overview", str(report.executive_summary))
        print(f"  {overview[:400]}...\n")
        print(f"Value Proposition:")
        print(f"  {report.value_proposition}\n")

        if report.products_services:
            print(f"Detected Products / Offerings ({len(report.products_services)}):")
            for prod in report.products_services[:4]:
                print(f"  - {prod.name}: {prod.description[:80]}... (Model: {prod.pricing_model})")

        swot = report.swot_analysis
        if swot:
            print(f"\nSWOT Analysis Highlights:")
            print(f"  - Strengths: {swot.strengths[:2]}")
            print(f"  - Opportunities: {swot.opportunities[:2]}")
            print(f"  - Threats: {swot.threats[:2]}")

        print(f"\nCommercial Opportunity Score: {report.opportunity_score}/100")
        print(f"Confidence Score: {report.confidence_score}/100")

    except Exception as e:
        print(f"  LLM synthesis skipped or errored: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 75)
    print("VYAPERIX REAL SCRAPING & INTELLIGENCE PIPELINE COMPLETED")
    print("=" * 75)


if __name__ == "__main__":
    asyncio.run(run_pipeline())
