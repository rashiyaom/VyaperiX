#!/usr/bin/env python3
"""
summarize_metrics.py -- stdlib-only summary of logs/metrics.jsonl.

Usage:
    python tools/summarize_metrics.py logs/metrics.jsonl

Produces a table like:
    event                  calls  avg_ms  total_ms  avg_chars   ok%
    layer1_fetch               8     312      2498       4210    88%
    layer2_playwright          2    4821      9642       1830   100%
    page_fetch/static          6     290      1740       3900   100%
    page_fetch/playwright      2    5100     10200       1830   100%
    llm_call/groq              3    3201      9603          -   100%
    llm_call/gemini            1    8042      8042          -   100%
    crawl_summary              1   12340     12340          -   100%
"""
import json
import sys
from collections import defaultdict
from pathlib import Path


def _load(path: str) -> list[dict]:
    records = []
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(f"  [warn] line {lineno}: {exc}", file=sys.stderr)
    return records


def _bucket(r: dict) -> str:
    ev = r.get("event", "?")
    if ev == "page_fetch":
        return f"page_fetch/{r.get('method', '?')}"
    if ev == "llm_call":
        return f"llm_call/{r.get('provider', '?')}/{r.get('model', '?')[:28]}"
    return ev


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python summarize_metrics.py <path/to/metrics.jsonl>")
        sys.exit(1)

    path = sys.argv[1]
    if not Path(path).exists():
        print(f"File not found: {path}")
        sys.exit(1)

    records = _load(path)
    if not records:
        print("No records found.")
        return

    buckets: dict[str, list] = defaultdict(list)
    for r in records:
        buckets[_bucket(r)].append(r)

    col_w = max(len(b) for b in buckets) + 2
    header = f"{'event':<{col_w}} {'calls':>6}  {'avg_ms':>8}  {'total_ms':>9}  {'avg_chars':>9}  {'ok%':>5}"
    print()
    print(header)
    print("-" * len(header))

    # Sort: layer events first, then page_fetch, then llm_call, then crawl
    order = {"layer1_fetch": 0, "layer2_playwright": 1, "page_fetch": 2, "llm_call": 3, "crawl_summary": 4}
    def _sort_key(b):
        for prefix, idx in order.items():
            if b.startswith(prefix):
                return (idx, b)
        return (99, b)

    for bucket in sorted(buckets, key=_sort_key):
        recs = buckets[bucket]
        n = len(recs)

        # ms: prefer explicit 'ms', else sum httpx_ms + trafilatura_ms
        def _ms(r):
            if "ms" in r:
                return r["ms"]
            return r.get("httpx_ms", 0) + r.get("trafilatura_ms", 0)

        ms_vals = [_ms(r) for r in recs]
        total_ms = sum(ms_vals)
        avg_ms = total_ms // n if n else 0

        chars_vals = [r.get("chars", -1) for r in recs]
        has_chars = any(c >= 0 for c in chars_vals)
        avg_chars = (sum(c for c in chars_vals if c >= 0) // max(1, sum(1 for c in chars_vals if c >= 0))) if has_chars else -1
        chars_str = str(avg_chars) if has_chars else "-"

        ok_count = sum(1 for r in recs if r.get("ok", r.get("status") == "ok"))
        ok_pct = f"{ok_count*100//n}%"

        print(f"{bucket:<{col_w}} {n:>6}  {avg_ms:>8}  {total_ms:>9}  {chars_str:>9}  {ok_pct:>5}")

    print()
    # Print crawl-level playwright ratio if present
    crawl_recs = [r for r in records if r.get("event") == "crawl_summary"]
    if crawl_recs:
        total_pages = sum(r.get("pages", 0) for r in crawl_recs)
        pw_pages = sum(r.get("playwright_pages", 0) for r in crawl_recs)
        print(f"Playwright invocations: {pw_pages}/{total_pages} pages")
    print()


if __name__ == "__main__":
    main()