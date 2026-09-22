"""
router.py — SearchRouter: provider chain with circuit-breaker and TTL cache.

Design invariants (do NOT violate):
    1. `SearchRouter.search()` NEVER raises.  All-providers-down → return [].
    2. Providers are tried in priority order; a breaker-open or exception on
       provider N causes silent fall-through to provider N+1.
    3. Cache is keyed on the literal query string; a hit skips all providers.
    4. Every observable event (provider used, cache hit, breaker open, all-fail)
       is emitted as a structured log line for downstream metrics collection.

Extension point for Redis cache:
    Override `_cache_get` and `_cache_set` in a subclass, e.g.::

        class RedisCachedSearchRouter(SearchRouter):
            def _cache_get(self, key): ...
            def _cache_set(self, key, value): ...
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Sequence

from app.services.search.base import SearchProvider, SearchProviderError, SearchResult
from app.services.search.circuit_breaker import CircuitBreaker
from app.services.search.ddg_provider import DDGProvider
from app.services.search.serper_provider import SerperProvider

logger = logging.getLogger(__name__)

# Default provider priority order — DDG first, Serper as fallback
_DEFAULT_PROVIDERS: list[SearchProvider] = [DDGProvider(), SerperProvider()]

# Cache TTL in seconds (6 hours)
_CACHE_TTL_SECONDS: float = 6 * 60 * 60


class SearchRouter:
    """
    Routes search queries through a prioritised chain of SearchProviders.

    - Checks in-memory TTL cache first.
    - On cache miss: tries each provider in order.
    - Per-provider CircuitBreaker skips a provider when it has opened.
    - If a provider raises SearchProviderError it is recorded as a failure and
      the next provider is tried.
    - If all providers fail or are breaker-open, returns [] without raising.

    Thread/coroutine safety: the cache dict is protected by an asyncio.Lock;
    the CircuitBreakers are protected by their own threading.Lock instances.
    """

    def __init__(
        self,
        providers: Sequence[SearchProvider] | None = None,
        cache_ttl_seconds: float = _CACHE_TTL_SECONDS,
        breaker_failure_threshold: int = 5,
        breaker_reset_timeout_seconds: float = 120.0,
    ) -> None:
        self._providers: list[SearchProvider] = list(
            providers if providers is not None else _DEFAULT_PROVIDERS
        )
        self._cache_ttl = cache_ttl_seconds
        self._cache: dict[str, tuple[list[SearchResult], float]] = {}
        self._cache_lock = asyncio.Lock()
        self._breakers: dict[str, CircuitBreaker] = {
            p.name: CircuitBreaker(
                failure_threshold=breaker_failure_threshold,
                reset_timeout_seconds=breaker_reset_timeout_seconds,
            )
            for p in self._providers
        }

    # ── Public API ──────────────────────────────────────────────────────

    async def search(
        self, query: str, max_results: int = 10
    ) -> list[SearchResult]:
        """
        Search using the provider chain.

        This method NEVER raises.  Returns an empty list when all providers are
        unavailable (open circuit) or have failed.

        Args:
            query:       Literal search query string (also the cache key).
            max_results: Maximum results requested from each provider.

        Returns:
            List of SearchResult objects, or [] on total failure.
        """
        # 1. Cache check
        cached = await self._cache_get(query)
        if cached is not None:
            logger.info(
                '{"event": "search_cache_hit", "query": %r, "result_count": %d}',
                query,
                len(cached),
            )
            return cached

        # 2. Try providers in order
        for provider in self._providers:
            breaker = self._breakers[provider.name]

            if breaker.is_open():
                logger.info(
                    '{"event": "search_provider_breaker_open", "provider": %r, "query": %r}',
                    provider.name,
                    query,
                )
                continue

            try:
                results = await provider.search(query, max_results=max_results)
                breaker.record_success()
                await self._cache_set(query, results)
                return results

            except SearchProviderError as exc:
                breaker.record_failure()
                logger.warning(
                    '{"event": "search_provider_failed", "provider": %r, '
                    '"query": %r, "error": %r, '
                    '"consecutive_failures": %d}',
                    provider.name,
                    query,
                    str(exc),
                    breaker.consecutive_failures,
                )
                # Fall through to next provider

            except Exception as exc:
                # Unexpected exception from provider (should not happen if provider
                # contract is honoured, but we guard anyway)
                breaker.record_failure()
                logger.error(
                    '{"event": "search_provider_unexpected_error", "provider": %r, '
                    '"query": %r, "error": %r}',
                    provider.name,
                    query,
                    str(exc),
                )
                # Fall through to next provider

        # 3. All providers failed or breaker-open
        logger.warning(
            '{"event": "search_all_providers_failed", "query": %r}',
            query,
        )
        return []

    # ── Cache extension points ──────────────────────────────────────────

    async def _cache_get(self, key: str) -> list[SearchResult] | None:
        """
        Return cached results for `key` if not expired, else None.

        Override in a subclass to use Redis or another shared cache.
        """
        async with self._cache_lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            results, expires_at = entry
            if time.monotonic() >= expires_at:
                del self._cache[key]
                return None
            return results

    async def _cache_set(self, key: str, results: list[SearchResult]) -> None:
        """
        Store results in cache with TTL expiry.

        Override in a subclass to use Redis or another shared cache.
        """
        async with self._cache_lock:
            self._cache[key] = (results, time.monotonic() + self._cache_ttl)


# ── Module-level singleton — import and reuse across the application ────

_router: SearchRouter | None = None


def get_search_router() -> SearchRouter:
    """
    Return the application-wide SearchRouter singleton.

    Lazily initialised on first call.  Inject a custom instance via
    `set_search_router()` in tests.
    """
    global _router
    if _router is None:
        _router = SearchRouter()
    return _router


def set_search_router(router: SearchRouter) -> None:
    """Replace the singleton — used in tests to inject mocks."""
    global _router
    _router = router
