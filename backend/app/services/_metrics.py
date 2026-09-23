"""
_metrics.py - Lightweight structured metrics emitter for observability.

Writes one JSON line per event to backend/logs/metrics.jsonl, resolved
relative to this file location so the path is CWD-independent.

Thread-safe via threading.Lock. Falls back silently on any write error.
Never raises in production code.

Emitted event keys (Phase 0):
    layer1_fetch      - httpx + trafilatura timing per URL
    layer2_playwright - Playwright timing per URL
    page_fetch        - total per-page timing (whichever layer won)
    crawl_summary     - whole crawl totals
    llm_call          - individual Groq / Gemini API call timing
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

# backend/app/services/_metrics.py -> .parent * 3 -> backend/
_LOG_PATH: Path = Path(__file__).parent.parent.parent / "logs" / "metrics.jsonl"
_lock = threading.Lock()


def emit(record: dict) -> None:
    """Append *record* as one JSON line to logs/metrics.jsonl. Never raises."""
    record.setdefault("ts", round(time.time(), 3))
    line = json.dumps(record, ensure_ascii=False)
    try:
        _LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _lock:
            with _LOG_PATH.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
    except Exception:
        pass  # metrics must never crash the caller