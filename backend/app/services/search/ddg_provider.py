"""
ddg_provider.py — DuckDuckGo search provider.

Uses the `ddgs` library (formerly duckduckgo-search).  Because `ddgs` is
synchronous-only, every call is dispatched to the default thread-pool executor
so it doesn't block the asyncio event loop.

Failure modes wrapped as SearchProviderError:
    - ImportError  (ddgs not installed)
    - Rate-limit / HTTP errors from DuckDuckGo
    - Any other exception raised by ddgs.text()
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.services.search.base import SearchProvider, SearchProviderError, SearchResult

logger = logging.getLogger(__name__)

_DDGS_IMPORT_ERROR: ImportError | None = None
try:
    from ddgs import DDGS  # type: ignore[import-untyped]
except ImportError:
    try:
        from duckduckgo_search import DDGS  # type: ignore[import-untyped]
    except ImportError as exc:
        _DDGS_IMPORT_ERROR = exc
        DDGS = None  # type: ignore[assignment,misc]


def _sync_search(query: str, max_results: int) -> list[dict[str, Any]]:
    """
    Blocking DuckDuckGo search — runs in a thread-pool executor.
    Returns raw result dicts from ddgs.
    Raises SearchProviderError on any failure.
    """
    if _DDGS_IMPORT_ERROR is not None or DDGS is None:
        raise SearchProviderError(
            f"ddgs / duckduckgo-search is not installed: {_DDGS_IMPORT_ERROR}"
        )
    try:
        with DDGS() as ddgs:
            raw: list[dict[str, Any]] = list(ddgs.text(query, max_results=max_results))
            return raw
    except Exception as exc:
        raise SearchProviderError(f"DDG search failed for query {query!r}: {exc}") from exc


class DDGProvider(SearchProvider):
    """
    Async wrapper around the synchronous `ddgs` library.

    The blocking `ddgs.text()` call is run in the default thread-pool executor
    so that it never blocks the asyncio event loop.  A dedicated executor is NOT
    used because the thread pool is shared with other blocking I/O in the pipeline
    (e.g., pdfplumber, robot.txt reads) and keeping a single shared pool avoids
    unbounded thread creation.
    """

    @property
    def name(self) -> str:
        return "ddg"

    async def search(self, query: str, max_results: int = 10) -> list[SearchResult]:
        """
        Async text search via DuckDuckGo.

        Raises:
            SearchProviderError: on import failure, rate-limit, or any other ddgs error.
        """
        loop = asyncio.get_event_loop()
        try:
            raw_results: list[dict[str, Any]] = await loop.run_in_executor(
                None, _sync_search, query, max_results
            )
        except SearchProviderError:
            raise
        except Exception as exc:
            # Catch anything the executor might wrap around the thread exception
            raise SearchProviderError(
                f"DDG executor error for query {query!r}: {exc}"
            ) from exc

        results: list[SearchResult] = []
        for r in raw_results:
            url = r.get("href") or r.get("url", "")
            title = r.get("title", "")
            snippet = r.get("body") or r.get("snippet", "")
            if url:
                results.append(
                    SearchResult(title=title, url=url, snippet=snippet, source="ddg")
                )

        logger.info(
            '{"event": "search_provider_used", "provider": "ddg", '
            '"query": %r, "result_count": %d}',
            query,
            len(results),
        )
        return results
