"""
serper_provider.py — Serper.dev search provider (fallback).

STATUS: Interface fully wired and integrated into SearchRouter.
        Activation requires SERPER_API_KEY in environment.
        Without it, raises SearchProviderError immediately (NOT silently skipped)
        so the router correctly falls through to the next provider and logs the skip.

TODO: When SERPER_API_KEY is provisioned, the HTTP call below is already
      implemented and ready — no further code changes needed beyond setting
      the env var.

Serper.dev API reference: https://serper.dev/api-reference
"""

from __future__ import annotations

import logging
import os

import httpx

from app.services.search.base import SearchProvider, SearchProviderError, SearchResult

logger = logging.getLogger(__name__)

_SERPER_ENDPOINT = "https://google.serper.dev/search"
_SERPER_TIMEOUT = 10.0  # seconds


class SerperProvider(SearchProvider):
    """
    Async search provider backed by Serper.dev's Google Search API.

    Requires the SERPER_API_KEY environment variable to be set.  If absent,
    every call raises SearchProviderError so the router falls through to the
    next provider (currently none) and returns an empty list — no silent drop,
    the skip is explicitly logged by the router.
    """

    @property
    def name(self) -> str:
        return "serper"

    async def search(self, query: str, max_results: int = 10) -> list[SearchResult]:
        """
        Async text search via Serper.dev Google Search API.

        Raises:
            SearchProviderError: if SERPER_API_KEY is absent, or on HTTP/parse error.
        """
        api_key = os.getenv("SERPER_API_KEY", "").strip()
        if not api_key:
            raise SearchProviderError(
                "SERPER_API_KEY not configured — Serper provider cannot be used. "
                "Set SERPER_API_KEY in environment to activate this fallback."
            )

        payload = {"q": query, "num": min(max_results, 10)}
        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=_SERPER_TIMEOUT) as client:
                resp = await client.post(_SERPER_ENDPOINT, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise SearchProviderError(
                f"Serper API HTTP {exc.response.status_code} for query {query!r}: {exc}"
            ) from exc
        except Exception as exc:
            raise SearchProviderError(
                f"Serper API request failed for query {query!r}: {exc}"
            ) from exc

        results: list[SearchResult] = []
        for item in data.get("organic", []):
            url = item.get("link", "")
            title = item.get("title", "")
            snippet = item.get("snippet", "")
            if url:
                results.append(
                    SearchResult(title=title, url=url, snippet=snippet, source="serper")
                )

        logger.info(
            '{"event": "search_provider_used", "provider": "serper", '
            '"query": %r, "result_count": %d}',
            query,
            len(results),
        )
        return results
