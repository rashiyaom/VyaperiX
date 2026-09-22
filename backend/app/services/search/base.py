"""
base.py — Abstract base types for the search provider abstraction.

All business logic (main.py, scraper.py, normalizer.py) must import only from
this module or from router.py. Direct imports from ddg_provider or serper_provider
are forbidden outside of the search/ package itself.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field


# ─────────────────────────── Data Types ────────────────────────────────

@dataclass
class SearchResult:
    """
    A single result returned by a search provider.

    Attributes:
        title:   Page title as returned by the search engine.
        url:     Canonical URL of the result page.
        snippet: Short excerpt (typically 150–250 chars) from the page body.
        source:  Identifier of the provider that produced this result
                 (e.g. "ddg", "serper").
    """
    title: str
    url: str
    snippet: str
    source: str


# ─────────────────────────── Exceptions ────────────────────────────────

class SearchProviderError(Exception):
    """
    Raised by a SearchProvider implementation when a search attempt fails.

    The SearchRouter catches this exception and applies circuit-breaker
    accounting before falling through to the next provider.  It must NOT
    propagate beyond the router.
    """


# ─────────────────────────── Abstract Provider ─────────────────────────

class SearchProvider(abc.ABC):
    """
    Abstract interface for a search backend.

    Implementors:
        - DDGProvider   (ddg_provider.py) — DuckDuckGo via the ddgs library
        - SerperProvider (serper_provider.py) — Serper.dev REST API

    Contract:
        - `search()` must be a coroutine (async def).
        - On failure it must raise SearchProviderError (not any other exception).
        - It must never mutate shared state without a lock.
    """

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Short identifier used in logs and metrics, e.g. 'ddg'."""

    @abc.abstractmethod
    async def search(self, query: str, max_results: int = 10) -> list[SearchResult]:
        """
        Execute a text search and return up to `max_results` results.

        Raises:
            SearchProviderError: on any search failure (network, rate-limit, parse error, etc.)
        """
