"""
test_search_router.py — Unit tests for SearchRouter.

Tests cover:
    - Primary provider failure causes fallback to secondary
    - All providers fail → empty list returned, no exception raised
    - Cache hit skips all providers (measures call count)
    - Breaker-open provider is skipped entirely
    - Breaker opens after repeated provider failures
"""

import asyncio
import sys
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.search.base import SearchProvider, SearchProviderError, SearchResult
from app.services.search.circuit_breaker import CircuitBreaker, _State
from app.services.search.router import SearchRouter


# ─────────────────────────── Helpers ───────────────────────────────────

def _make_provider(name: str, results=None, raises=None) -> SearchProvider:
    """Build a mock SearchProvider that returns `results` or raises `raises`."""
    provider = MagicMock(spec=SearchProvider)
    provider.name = name
    if raises is not None:
        provider.search = AsyncMock(side_effect=raises)
    else:
        provider.search = AsyncMock(return_value=results or [])
    return provider


def _make_result(url: str = "https://example.com", source: str = "ddg") -> SearchResult:
    return SearchResult(title="Test", url=url, snippet="Test snippet", source=source)


def run(coro):
    """Run a coroutine in the test event loop."""
    return asyncio.run(coro)


# ─────────────────────────── Test Cases ────────────────────────────────

class TestSearchRouterFallback(unittest.TestCase):
    def test_primary_fail_uses_fallback(self):
        """Primary raises → fallback returns results → those results are returned."""
        primary = _make_provider("ddg", raises=SearchProviderError("rate limited"))
        fallback_result = _make_result("https://fallback.com", source="serper")
        fallback = _make_provider("serper", results=[fallback_result])

        router = SearchRouter(providers=[primary, fallback], cache_ttl_seconds=0)
        results = run(router.search("test query"))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].url, "https://fallback.com")
        self.assertEqual(results[0].source, "serper")
        primary.search.assert_called_once()
        fallback.search.assert_called_once()

    def test_all_providers_fail_returns_empty_no_raise(self):
        """
        If all providers raise SearchProviderError, search() returns [] and
        does NOT raise any exception.
        """
        p1 = _make_provider("ddg", raises=SearchProviderError("down"))
        p2 = _make_provider("serper", raises=SearchProviderError("no key"))

        router = SearchRouter(providers=[p1, p2], cache_ttl_seconds=0)
        try:
            results = run(router.search("test query"))
        except Exception as e:
            self.fail(f"SearchRouter.search() raised unexpectedly: {e}")

        self.assertEqual(results, [], "Should return empty list, not raise")

    def test_all_providers_fail_with_unexpected_exception_returns_empty(self):
        """
        Unexpected (non-SearchProviderError) exceptions from a provider are
        caught and do not propagate.
        """
        p1 = _make_provider("ddg", raises=RuntimeError("unexpected crash"))
        router = SearchRouter(providers=[p1], cache_ttl_seconds=0)

        try:
            results = run(router.search("test query"))
        except Exception as e:
            self.fail(f"Unexpected exception propagated: {e}")

        self.assertEqual(results, [])


class TestSearchRouterCache(unittest.TestCase):
    def test_cache_hit_skips_providers(self):
        """
        On second call with same query, the cache is hit and providers are NOT called.
        """
        result = _make_result()
        primary = _make_provider("ddg", results=[result])
        router = SearchRouter(providers=[primary], cache_ttl_seconds=3600)

        # First call — populates cache
        run(router.search("cached query"))
        self.assertEqual(primary.search.call_count, 1)

        # Second call — should hit cache, not call provider
        results2 = run(router.search("cached query"))
        self.assertEqual(primary.search.call_count, 1, "Provider should NOT be called on cache hit")
        self.assertEqual(len(results2), 1)

    def test_expired_cache_calls_provider(self):
        """
        A cache entry past TTL should be ignored and the provider called again.
        """
        import time as time_module

        result = _make_result()
        primary = _make_provider("ddg", results=[result])
        # TTL=0 means every entry expires immediately
        router = SearchRouter(providers=[primary], cache_ttl_seconds=0)

        run(router.search("query"))
        call_1 = primary.search.call_count

        # The TTL is 0, so the previous result should be gone
        run(router.search("query"))
        self.assertEqual(primary.search.call_count, call_1 + 1, "Provider should be called again after TTL expiry")


class TestSearchRouterCircuitBreaker(unittest.TestCase):
    def test_breaker_open_skips_provider(self):
        """
        When a provider's circuit is open, that provider's search() method is
        never called.
        """
        primary = _make_provider("ddg", results=[])
        fallback_result = _make_result(source="serper")
        fallback = _make_provider("serper", results=[fallback_result])

        router = SearchRouter(
            providers=[primary, fallback],
            cache_ttl_seconds=0,
            breaker_failure_threshold=5,
        )

        # Manually open the primary's breaker (must set state + opened_at)
        router._breakers["ddg"]._consecutive_failures = 5
        router._breakers["ddg"]._opened_at = __import__("time").monotonic()
        router._breakers["ddg"]._state = _State.OPEN

        results = run(router.search("query"))

        primary.search.assert_not_called()  # ← KEY ASSERTION: blocked by breaker
        fallback.search.assert_called_once()
        self.assertEqual(results[0].source, "serper")

    def test_breaker_opens_after_repeated_failures(self):
        """
        After `failure_threshold` consecutive provider failures, the circuit
        breaker opens.
        """
        p = _make_provider("ddg", raises=SearchProviderError("always fails"))
        router = SearchRouter(
            providers=[p],
            cache_ttl_seconds=0,
            breaker_failure_threshold=3,
        )

        for _ in range(3):
            run(router.search(f"query_{_}"))

        breaker = router._breakers["ddg"]
        self.assertTrue(breaker.is_open(), "Breaker should be open after 3 failures")

    def test_breaker_success_closes_after_provider_recovers(self):
        """
        When a provider succeeds, its circuit breaker records success and stays/becomes closed.
        """
        result = _make_result()
        primary = _make_provider("ddg", results=[result])
        router = SearchRouter(providers=[primary], cache_ttl_seconds=0)

        run(router.search("test"))
        breaker = router._breakers["ddg"]
        self.assertFalse(breaker.is_open())
        self.assertEqual(breaker.consecutive_failures, 0)


if __name__ == "__main__":
    unittest.main()
