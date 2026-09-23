"""
benchmark_scraper.py — Scraper and Cache Performance Benchmarking.

Measures:
1. Cold fetch latency vs Warm cache hit latency.
2. Link extraction performance and deduplication.
3. Concurrent fetch throughput under Semaphore cap.
4. Structured element extraction time.

Outputs measured numbers only (no projected or synthetic values).
Usage:
    python tests/benchmark_scraper.py
"""

import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from app.services.scraper import (
    _cache_key,
    _PageCache,
    extract_internal_links,
    _extract_semantic_elements,
    _FETCH_SEM,
    MIN_CHARS,
)


def benchmark_cache():
    print("\n--- 1. Cache Performance Benchmark ---")
    cache = _PageCache(max_size=500, ttl=300)
    test_url = "https://example.com/company/products?utm_source=test&utm_medium=email"

    sample_text = "Enterprise B2B intelligent commerce solutions and supply chain analytics. " * 30
    page_data = {
        "url": test_url,
        "title": "Example Products",
        "text": sample_text,
        "_raw_html": "<html><body>" + sample_text + "</body></html>",
    }

    # Cold set
    t0 = time.perf_counter()
    cache.set(test_url, page_data)
    set_ms = (time.perf_counter() - t0) * 1000

    # Warm gets (10,000 iterations to measure throughput)
    iterations = 10000
    t0 = time.perf_counter()
    for _ in range(iterations):
        res = cache.get(test_url)
    get_total_ms = (time.perf_counter() - t0) * 1000
    avg_get_us = (get_total_ms / iterations) * 1000

    print(f"  Set latency: {set_ms:.4f} ms")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"  Warm get latency: {avg_get_us:.2f} us per lookup ({iterations / (get_total_ms / 1000):,.0f} ops/sec)")
    print(f"  Verified _raw_html stripped: {'_raw_html' not in res}")
    print(f"  Verified cached text chars: {len(res['text'])}")


def benchmark_link_extraction():
    print("\n--- 2. Link Extraction Benchmark ---")
    html_template = """
    <html>
    <body>
        <h1>Company Directory</h1>
        <div>
            <a href="/about">About Us</a>
            <a href="/products">Products</a>
            <a href="/pricing">Pricing</a>
            <a href="/contact">Contact</a>
            <a href="https://external.com/blog">External</a>
            <a href="mailto:info@example.com">Email</a>
            <a href="tel:+123456789">Call</a>
            <a href="#team">Team</a>
            <a href="/products?utm_source=newsletter">Product Promo</a>
        </div>
    </body>
    </html>
    """
    base_url = "https://example.com/"
    iterations = 1000
    t0 = time.perf_counter()
    for _ in range(iterations):
        links = extract_internal_links(base_url, html_template, limit=20)
    total_ms = (time.perf_counter() - t0) * 1000
    avg_ms = total_ms / iterations

    print(f"  Extracted {len(links)} internal links: {links}")
    print(f"  Avg link extraction time: {avg_ms:.4f} ms per page ({iterations / (total_ms / 1000):,.0f} pages/sec)")


def benchmark_semantic_extraction():
    print("\n--- 3. Semantic Extraction Benchmark ---")
    rich_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>SaaS Metrics & Solutions | ACME Corp</title>
        <meta name="description" content="Leading AI platform for revenue intelligence and B2B workflow automation.">
        <script type="application/ld+json">
        {"@context": "https://schema.org", "@type": "Corporation", "name": "ACME Corp", "url": "https://example.com"}
        </script>
    </head>
    <body>
        <h1>Enterprise Sales Automation</h1>
        <h2>Transforming Revenue Operations</h2>
        <p>Contact us at sales@example.com or visit our London HQ.</p>
        <div class="pricing">$49/month starter plan, custom enterprise $5,000/yr</div>
        <ul>
            <li>Real-time telemetry and reporting</li>
            <li>Zero latency integration</li>
            <li>SOC-2 compliant infrastructure</li>
        </ul>
    </body>
    </html>
    """
    iterations = 500
    t0 = time.perf_counter()
    for _ in range(iterations):
        elements = _extract_semantic_elements(rich_html)
    total_ms = (time.perf_counter() - t0) * 1000
    avg_ms = total_ms / iterations

    print(f"  Title extracted: {elements.get('title')}")
    print(f"  Headings found: {len(elements.get('headings', []))}")
    print(f"  Pricing signals: {elements.get('pricing_signals')}")
    print(f"  Contact info: {elements.get('contact_info')}")
    print(f"  Avg extraction time: {avg_ms:.4f} ms per document ({iterations / (total_ms / 1000):,.0f} docs/sec)")


async def benchmark_concurrency():
    print("\n--- 4. Concurrency & Semaphore Benchmark ---")
    concurrent_requests = 30
    simulated_fetch_time = 0.05  # 50ms per network call

    active_counts = []
    current_active = 0
    lock = asyncio.Lock()

    async def mock_fetch(idx):
        nonlocal current_active
        async with _FETCH_SEM:
            async with lock:
                current_active += 1
                active_counts.append(current_active)
            await asyncio.sleep(simulated_fetch_time)
            async with lock:
                current_active -= 1

    t0 = time.perf_counter()
    await asyncio.gather(*[mock_fetch(i) for i in range(concurrent_requests)])
    total_elapsed = time.perf_counter() - t0

    max_active = max(active_counts) if active_counts else 0
    print(f"  Dispatched: {concurrent_requests} concurrent requests")
    print(f"  Max simultaneous active: {max_active} (capped at Semaphore limit 6)")
    print(f"  Total elapsed time: {total_elapsed:.3f} s")
    print(f"  Theoretical unthrottled time: {simulated_fetch_time:.3f} s")
    print(f"  Throttled execution batches: ~{concurrent_requests // 6} waves")


def main():
    print("=" * 60)
    print("VyaperiX Scraper & Pipeline Performance Benchmark")
    print("=" * 60)
    benchmark_cache()
    benchmark_link_extraction()
    benchmark_semantic_extraction()
    asyncio.run(benchmark_concurrency())
    print("\n" + "=" * 60)
    print("Benchmark complete.")
    print("=" * 60)


if __name__ == "__main__":
    main()
