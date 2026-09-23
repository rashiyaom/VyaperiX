"""
measure_real_sites.py — End-to-end crawl measurement on 3 real sites (Cold vs Warm).

Runs real multi-page crawling via app.services.scraper.crawl_website():
- Cold crawl (empty cache): network fetches, link discovery, and text extraction
- Warm crawl (cached): instant cache hits from _url_cache

Emits all metrics to logs/metrics.jsonl and summarizes with tools/summarize_metrics.py.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import httpx
from app.services.scraper import crawl_website, _url_cache
from tools.summarize_metrics import main as summarize_main

SITES = [
    "https://www.python.org/",
    "https://fastapi.tiangolo.com/",
    "https://news.ycombinator.com/",
]


async def run_measurements():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    metrics_file = BACKEND_DIR / "logs" / "metrics.jsonl"
    # Reset metrics file for this run
    metrics_file.parent.mkdir(parents=True, exist_ok=True)
    if metrics_file.exists():
        metrics_file.unlink()

    print("=" * 70)
    print("VYAPERIX REAL-SITE END-TO-END MEASUREMENT (COLD vs WARM)")
    print("=" * 70)

    site_results = []

    for site in SITES:
        print(f"\nTarget Site: {site}")
        print("-" * 50)

        # ── COLD RUN (clear cache first) ─────────────────────────────────────
        with _url_cache._lock:
            _url_cache._store.clear()

        t0_cold = time.perf_counter()
        pages_cold = await crawl_website(site)
        cold_elapsed_ms = (time.perf_counter() - t0_cold) * 1000

        cold_chars = sum(len(p.get("text", "")) for p in pages_cold)
        cold_methods = [p.get("method") for p in pages_cold]
        print(f"  [COLD] Elapsed: {cold_elapsed_ms:.1f} ms | Pages: {len(pages_cold)} | Total chars: {cold_chars:,} | Methods: {cold_methods}")

        # ── WARM RUN (cache is populated) ────────────────────────────────────
        t0_warm = time.perf_counter()
        pages_warm = await crawl_website(site)
        warm_elapsed_ms = (time.perf_counter() - t0_warm) * 1000

        warm_chars = sum(len(p.get("text", "")) for p in pages_warm)
        warm_methods = [p.get("method") for p in pages_warm]
        speedup = cold_elapsed_ms / max(1.0, warm_elapsed_ms)
        print(f"  [WARM] Elapsed: {warm_elapsed_ms:.1f} ms | Pages: {len(pages_warm)} | Total chars: {warm_chars:,} | Methods: {warm_methods}")
        print(f"  [SPEEDUP] {speedup:.1f}x faster on warm cache hit")

        site_results.append({
            "site": site,
            "cold_ms": round(cold_elapsed_ms, 1),
            "cold_pages": len(pages_cold),
            "cold_chars": cold_chars,
            "cold_methods": cold_methods,
            "warm_ms": round(warm_elapsed_ms, 1),
            "warm_pages": len(pages_warm),
            "warm_chars": warm_chars,
            "speedup": round(speedup, 1),
        })

    print("\n" + "=" * 70)
    print("SUMMARY METRICS TABLE (from tools/summarize_metrics.py):")
    print("=" * 70)
    # Invoke summarize tool
    sys.argv = ["summarize_metrics.py", str(metrics_file)]
    try:
        summarize_main()
    except SystemExit:
        pass

    print("\n" + "=" * 70)
    print("MEASURED END-TO-END RESULTS SUMMARY:")
    print("=" * 70)
    print(f"{'Site':<35} {'Cold (ms)':>10} {'Warm (ms)':>10} {'Pages':>6} {'Chars':>10} {'Speedup':>9}")
    print("-" * 85)
    for r in site_results:
        print(f"{r['site']:<35} {r['cold_ms']:>10.1f} {r['warm_ms']:>10.1f} {r['cold_pages']:>6} {r['cold_chars']:>10,} {r['speedup']:>8.1f}x")
    print("-" * 85)

    # Save results to a json file for report embedding
    out_path = BACKEND_DIR / "logs" / "real_sites_measured.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(site_results, f, indent=2)
    print(f"Results written to: {out_path}")


if __name__ == "__main__":
    asyncio.run(run_measurements())
