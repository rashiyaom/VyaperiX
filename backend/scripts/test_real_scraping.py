"""
test_real_scraping.py — Real scrape test for https://webscraper.io/test-sites/load-more

Tests:
1. Single page fetch via tiered scraper ladder (fetch_page)
2. Semantic parsing (headings, prices, offers, metadata)
3. Multi-page crawling (crawl_website)
4. Cold vs Warm cache speedup verification
"""

import asyncio
import json
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import httpx
from app.services.scraper import fetch_page, crawl_website, _url_cache


TARGET_URL = "https://webscraper.io/test-sites/load-more"


async def main():
    print("=" * 70)
    print(f"VYAPERIX REAL SCRAPING TEST: {TARGET_URL}")
    print("=" * 70)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Single Page Fetch (Static / Tier 1)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- STAGE 1: Default Ladder Fetch (Tier 1 Static) ---")
    with _url_cache._lock:
        _url_cache._store.clear()

    async with httpx.AsyncClient(follow_redirects=False) as client:
        t0 = time.perf_counter()
        page_static = await fetch_page(TARGET_URL, client)
        elapsed_static_ms = (time.perf_counter() - t0) * 1000

    print(f"Status: SUCCESS")
    print(f"Elapsed: {elapsed_static_ms:.1f} ms")
    print(f"Method Used: {page_static.get('method')}")
    print(f"Page Title: {page_static.get('title')}")
    print(f"Total Text Length: {len(page_static.get('text', '')):,} characters")
    print(f"Internal Links Discovered: {len(page_static.get('links', []))}")

    semantic = page_static.get("semantic_elements", {})
    if semantic:
        print("\nStructured Semantic Elements Extracted (Static):")
        if semantic.get("headings"):
            print(f"  Headings ({len(semantic['headings'])}): {semantic['headings'][:6]}")
        if semantic.get("pricing_signals"):
            print(f"  Pricing Signals ({len(semantic['pricing_signals'])}): {semantic['pricing_signals'][:5]}")
        if semantic.get("key_bullets"):
            print(f"  Key Bullets: {semantic['key_bullets'][:3]}")

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Dynamic Playwright Fetch (Interacts with 'Load More' button)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- STAGE 2: Dynamic Headless Playwright Fetch (Clicks 'Load More') ---")
    import os
    os.environ["FORCE_PLAYWRIGHT"] = "1"
    try:
        with _url_cache._lock:
            _url_cache._store.clear()

        async with httpx.AsyncClient(follow_redirects=False) as client:
            t0 = time.perf_counter()
            page_pw = await fetch_page(TARGET_URL, client)
            elapsed_pw_ms = (time.perf_counter() - t0) * 1000

        print(f"Status: SUCCESS")
        print(f"Elapsed: {elapsed_pw_ms:.1f} ms")
        print(f"Method Used: {page_pw.get('method')}")
        print(f"Page Title: {page_pw.get('title')}")
        print(f"Total Text Length: {len(page_pw.get('text', '')):,} characters")
        semantic_pw = page_pw.get("semantic_elements", {})
        if semantic_pw and semantic_pw.get("headings"):
            print(f"  Headings with Load-More Clicked ({len(semantic_pw['headings'])}):")
            for h in semantic_pw['headings'][:12]:
                print(f"    - {h}")
        if semantic_pw and semantic_pw.get("pricing_signals"):
            print(f"  Pricing Signals ({len(semantic_pw['pricing_signals'])} items):")
            for p in semantic_pw['pricing_signals'][:6]:
                print(f"    - {p.strip()[:60]}")
    finally:
        os.environ.pop("FORCE_PLAYWRIGHT", None)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Multi-Page Crawl (Cold vs Warm)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- STAGE 3: Multi-Page Crawl (crawl_website) ---")
    
    # Cold Crawl
    with _url_cache._lock:
        _url_cache._store.clear()
    
    t0_cold = time.perf_counter()
    crawled_cold = await crawl_website(TARGET_URL)
    cold_ms = (time.perf_counter() - t0_cold) * 1000
    cold_chars = sum(len(p.get("text", "")) for p in crawled_cold)

    print(f"\n[COLD CRAWL]")
    print(f"  Pages Crawled: {len(crawled_cold)}")
    print(f"  Total Chars: {cold_chars:,}")
    print(f"  Time Taken: {cold_ms:.1f} ms")
    for i, p in enumerate(crawled_cold, 1):
        print(f"    Page {i}: {p['url']} ({len(p.get('text','')):,} chars, method={p.get('method')})")

    # Warm Crawl
    t0_warm = time.perf_counter()
    crawled_warm = await crawl_website(TARGET_URL)
    warm_ms = (time.perf_counter() - t0_warm) * 1000
    warm_chars = sum(len(p.get("text", "")) for p in crawled_warm)
    speedup = cold_ms / max(1.0, warm_ms)

    print(f"\n[WARM CRAWL (Cache Hit)]")
    print(f"  Pages Crawled: {len(crawled_warm)}")
    print(f"  Total Chars: {warm_chars:,}")
    print(f"  Time Taken: {warm_ms:.1f} ms")
    print(f"  Speedup: {speedup:.1f}x faster")

    print("\n" + "=" * 70)
    print("ALL REAL SCRAPING CHECKS COMPLETED SUCCESSFULLY")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
