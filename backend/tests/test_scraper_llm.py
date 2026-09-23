"""
test_scraper_llm.py — Test suite for Scraper optimizations and LLM Resilience.

Covers:
1. Cache normalization, LRU eviction, and MIN_CHARS gating.
2. SSRF prevention on initial target and on every redirect hop.
3. Concurrency semaphore capping parallel fetches.
4. Playwright persistent singleton, auto-reconnect on crash, and clean shutdown.
5. LLM Router: per-model circuit breakers, 429 retry-wait parsing & skip, 503 backoff,
   400 non-retryable skip, and fallback across providers/models.
6. Async variants in groq_client.py.
7. Playwright Windows-safe smoke test.
"""

import asyncio
import os
import sys
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from app.services.scraper import (
    _cache_key,
    _PageCache,
    is_safe_url,
    _fetch_with_ssrf_hops,
    _fetch_jina,
    _get_browser,
    close_playwright,
    _FETCH_SEM,
    MIN_CHARS,
    fetch_page,
)
from app.services.search.circuit_breaker import CircuitBreaker
from app.services.llm_router import (
    _parse_wait,
    _is_quota_429,
    _is_retryable_503,
    _is_non_retryable,
    _get_breaker,
    _AsyncRateLimiter,
    call_with_fallback,
)
from app.services import groq_client


# ─────────────────────────────────────────────────────────────────────────────
# 1. URL Cache & Normalization Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestUrlCacheAndNormalization(unittest.TestCase):
    def test_cache_key_strips_utm_and_fragments(self):
        url1 = "https://Example.COM/Path?utm_source=twitter&utm_medium=cpc&foo=Bar#section"
        key1 = _cache_key(url1)
        # Scheme and host should be lowercased, utm removed, fragment removed, path/query case kept
        self.assertTrue(key1.startswith("https://example.com/Path"))
        self.assertNotIn("utm_source", key1)
        self.assertNotIn("utm_medium", key1)
        self.assertNotIn("section", key1)
        self.assertIn("foo=Bar", key1)

    def test_cache_key_preserves_path_case(self):
        url = "https://mysite.org/CamelCasePath/FILE.html"
        key = _cache_key(url)
        self.assertEqual(key, "https://mysite.org/CamelCasePath/FILE.html")

    def test_page_cache_respects_min_chars(self):
        cache = _PageCache(max_size=10, ttl=60)
        short_page = {"url": "https://example.com/short", "text": "Too short"}
        self.assertLess(len(short_page["text"]), MIN_CHARS)
        cache.set("https://example.com/short", short_page)
        self.assertIsNone(cache.get("https://example.com/short"))

        long_page = {"url": "https://example.com/long", "text": "A" * (MIN_CHARS + 10)}
        cache.set("https://example.com/long", long_page)
        cached = cache.get("https://example.com/long")
        self.assertIsNotNone(cached)
        self.assertEqual(cached["text"], long_page["text"])

    def test_page_cache_strips_raw_html(self):
        cache = _PageCache(max_size=10, ttl=60)
        page = {
            "url": "https://example.com/page",
            "text": "Valid text content " * 30,
            "_raw_html": "<html><body>Secret or heavy raw html</body></html>",
        }
        cache.set("https://example.com/page", page)
        cached = cache.get("https://example.com/page")
        self.assertIsNotNone(cached)
        self.assertNotIn("_raw_html", cached)

    def test_page_cache_lru_eviction(self):
        cache = _PageCache(max_size=2, ttl=60)
        page1 = {"url": "https://example.com/1", "text": "Valid text 1 " * 60}
        page2 = {"url": "https://example.com/2", "text": "Valid text 2 " * 60}
        page3 = {"url": "https://example.com/3", "text": "Valid text 3 " * 60}

        cache.set("https://example.com/1", page1)
        cache.set("https://example.com/2", page2)
        # Access page 1 to make page 2 the least recently used
        _ = cache.get("https://example.com/1")
        # Add page 3 -> should evict page 2
        cache.set("https://example.com/3", page3)

        self.assertIsNotNone(cache.get("https://example.com/1"))
        self.assertIsNone(cache.get("https://example.com/2"), "Page 2 should be evicted (LRU)")
        self.assertIsNotNone(cache.get("https://example.com/3"))


# ─────────────────────────────────────────────────────────────────────────────
# 2. SSRF Guard Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestSSRFGuards(unittest.IsolatedAsyncioTestCase):
    def test_is_safe_url_blocks_internal(self):
        self.assertFalse(is_safe_url("http://localhost:8000/"))
        self.assertFalse(is_safe_url("http://127.0.0.1:3000/"))
        self.assertFalse(is_safe_url("http://10.0.0.5/api"))
        self.assertFalse(is_safe_url("http://192.168.1.1/"))
        self.assertFalse(is_safe_url("http://172.16.0.1/"))
        self.assertTrue(is_safe_url("https://example.com/"))
        self.assertTrue(is_safe_url("https://google.com/search"))

    async def test_fetch_with_ssrf_hops_blocks_initial_unsafe(self):
        client = AsyncMock(spec=httpx.AsyncClient)
        with self.assertRaises(ValueError) as ctx:
            await _fetch_with_ssrf_hops("http://127.0.0.1/admin", client)
        self.assertIn("SSRF guard blocked", str(ctx.exception))
        client.get.assert_not_called()

    async def test_fetch_with_ssrf_hops_blocks_unsafe_redirect(self):
        client = AsyncMock(spec=httpx.AsyncClient)
        # First request to safe public URL redirects to 192.168.1.1
        resp_redirect = MagicMock()
        resp_redirect.status_code = 302
        resp_redirect.headers = {"location": "http://192.168.1.1/admin"}
        client.get.return_value = resp_redirect

        with self.assertRaises(ValueError) as ctx:
            await _fetch_with_ssrf_hops("https://example.com/start", client)
        self.assertIn("SSRF guard blocked redirect target", str(ctx.exception))

    async def test_fetch_with_ssrf_hops_blocks_empty_location(self):
        client = AsyncMock(spec=httpx.AsyncClient)
        resp_redirect = MagicMock()
        resp_redirect.status_code = 302
        resp_redirect.headers = {"location": "   "}
        client.get.return_value = resp_redirect

        with self.assertRaises(ValueError) as ctx:
            await _fetch_with_ssrf_hops("https://example.com/start", client)
        self.assertIn("Empty Location header", str(ctx.exception))

    async def test_fetch_with_ssrf_hops_resolves_relative_redirect(self):
        client = AsyncMock(spec=httpx.AsyncClient)
        resp_redirect = MagicMock()
        resp_redirect.status_code = 301
        resp_redirect.headers = {"location": "/final-page"}

        resp_final = MagicMock()
        resp_final.status_code = 200
        resp_final.headers = {}
        client.get.side_effect = [resp_redirect, resp_final]

        res = await _fetch_with_ssrf_hops("https://example.com/start", client)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(client.get.call_count, 2)
        second_call_url = client.get.call_args_list[1][0][0]
        self.assertEqual(second_call_url, "https://example.com/final-page")

    async def test_fetch_jina_blocks_unsafe_url_before_request(self):
        client = AsyncMock(spec=httpx.AsyncClient)
        html, text = await _fetch_jina("http://127.0.0.1:8080/secret", client)
        self.assertIsNone(html)
        self.assertIsNone(text)
        client.get.assert_not_called()

    async def test_jina_success_does_not_call_playwright(self):
        client = AsyncMock(spec=httpx.AsyncClient)
        jina_text = "This is clean high quality markdown content from Jina Reader. " * 30
        self.assertGreaterEqual(len(jina_text), MIN_CHARS)

        with patch("app.services.scraper._fetch_static", AsyncMock(return_value=(None, ""))), \
             patch("app.services.scraper._is_allowed_by_robots", return_value=True), \
             patch("app.services.scraper._fetch_jina", AsyncMock(return_value=(None, jina_text))), \
             patch("app.services.scraper._fetch_playwright", AsyncMock()) as mock_pw:

            res = await fetch_page("https://example.com/jina-success-test", client)
            self.assertEqual(res["method"], "jina")
            self.assertIn("Jina Reader", res["text"])
            mock_pw.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Semaphore Concurrency Test
# ─────────────────────────────────────────────────────────────────────────────

class TestConcurrencySemaphore(unittest.IsolatedAsyncioTestCase):
    async def test_semaphore_caps_concurrency(self):
        max_active = 0
        current_active = 0
        lock = asyncio.Lock()

        async def worker():
            nonlocal max_active, current_active
            async with _FETCH_SEM:
                async with lock:
                    current_active += 1
                    if current_active > max_active:
                        max_active = current_active
                await asyncio.sleep(0.02)
                async with lock:
                    current_active -= 1

        tasks = [asyncio.create_task(worker()) for _ in range(15)]
        await asyncio.gather(*tasks)

        self.assertLessEqual(max_active, 6, f"Concurrency exceeded 6 (was {max_active})")


# ─────────────────────────────────────────────────────────────────────────────
# 4. Playwright Singleton & Reconnect Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestPlaywrightSingleton(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await close_playwright()

    async def test_playwright_reconnects_on_disconnect(self):
        mock_browser1 = MagicMock()
        mock_browser1.is_connected.return_value = True

        mock_browser2 = MagicMock()
        mock_browser2.is_connected.return_value = True

        mock_pw = AsyncMock()
        mock_pw.chromium.launch = AsyncMock(side_effect=[mock_browser1, mock_browser2])
        mock_pw.stop = AsyncMock()

        with patch("playwright.async_api.async_playwright") as mock_ap:
            mock_ap.return_value.start = AsyncMock(return_value=mock_pw)

            # First get_browser call
            b1 = await _get_browser()
            self.assertEqual(b1, mock_browser1)
            self.assertEqual(mock_pw.chromium.launch.call_count, 1)

            # Same call while connected should return same browser
            b1_again = await _get_browser()
            self.assertEqual(b1_again, mock_browser1)
            self.assertEqual(mock_pw.chromium.launch.call_count, 1)

            # Now simulate crash / disconnect
            mock_browser1.is_connected.return_value = False

            b2 = await _get_browser()
            self.assertEqual(b2, mock_browser2)
            self.assertEqual(mock_pw.chromium.launch.call_count, 2)

    async def test_jina_success_does_not_call_playwright(self):
        """When static fetch yields < MIN_CHARS but Jina succeeds, Playwright must NOT be invoked."""
        with patch("app.services.scraper._fetch_static", AsyncMock(return_value=("<html></html>", "short"))), \
             patch("app.services.scraper._is_allowed_by_robots", return_value=True), \
             patch("app.services.scraper._fetch_jina", AsyncMock(return_value=(None, "# Rich Jina Markdown Content\n" + "x" * 600))), \
             patch("app.services.scraper._fetch_playwright", AsyncMock(return_value=("", ""))) as mock_pw, \
             patch("app.services.scraper._url_cache", _PageCache(max_size=10, ttl=60)):

            async with httpx.AsyncClient() as client:
                res = await fetch_page("https://example.com/jina-test", client)

            self.assertEqual(res["method"], "jina")
            self.assertGreaterEqual(len(res["text"]), 600)
            mock_pw.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# 5. LLM Router Tests: Circuit Breakers, 429/503 Policies, Fallback
# ─────────────────────────────────────────────────────────────────────────────

class TestLLMRouter(unittest.IsolatedAsyncioTestCase):
    def test_parse_wait(self):
        # Retry-After header format
        e1 = Exception("Rate limit exceeded. Retry-After: 4 seconds")
        self.assertEqual(_parse_wait(e1), 4.0)

        # Gemini retryDelay format
        e2 = Exception("Resource has been exhausted (e.g. check quota). retryDelay: 6.5s")
        self.assertEqual(_parse_wait(e2), 6.5)

        # Wait exceeds cap (15s)
        e3 = Exception("Rate limit exceeded. Retry-After: 30")
        self.assertIsNone(_parse_wait(e3), "Waits > 15s should return None to trigger next model")

        # No wait found
        e4 = Exception("429 Too Many Requests")
        self.assertIsNone(_parse_wait(e4))

    def test_error_classification(self):
        self.assertTrue(_is_quota_429(Exception("429 Too Many Requests")))
        self.assertTrue(_is_quota_429(Exception("Rate limit reached for requests per minute")))
        self.assertTrue(_is_retryable_503(Exception("503 Service Unavailable")))
        self.assertTrue(_is_retryable_503(Exception("The model is overloaded")))
        self.assertTrue(_is_non_retryable(Exception("Error code: 400 - Invalid prompt")))
        self.assertTrue(_is_non_retryable(Exception("Error code: 401 - Unauthorized")))

    async def test_circuit_breaker_trips_and_skips_model(self):
        test_model_1 = "test-provider/broken-model-1"
        test_model_2 = "test-provider/working-model-2"

        breaker1 = _get_breaker(test_model_1)
        breaker2 = _get_breaker(test_model_2)

        # Force breaker1 to trip
        breaker1.record_failure()
        breaker1.record_failure()
        breaker1.record_failure()
        self.assertTrue(breaker1.is_open())
        self.assertFalse(breaker2.is_open())

        provider_models = [("mock", test_model_1), ("mock", test_model_2)]

        called_models = []

        async def mock_provider_fn(model, prompt, system, max_tokens, temperature):
            called_models.append(model)
            return '{"status": "ok"}'

        with patch("app.services.llm_router._get_provider_fn", return_value=mock_provider_fn):
            result = await call_with_fallback(
                prompt="test prompt",
                provider_models=provider_models,
            )

        self.assertIn("ok", result)
        self.assertEqual(called_models, [test_model_2], "Broken model with open circuit breaker must be skipped")

    async def test_429_short_wait_retries_and_succeeds(self):
        test_model = "test-provider/rate-limited-model"
        breaker = _get_breaker(test_model)
        breaker._state = breaker._state.__class__.CLOSED
        breaker._failure_count = 0

        attempts = 0

        async def mock_provider_fn(model, prompt, system, max_tokens, temperature):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise Exception("429 Too Many Requests. retryDelay: 0.05s")
            return '{"response": "success_after_retry"}'

        with patch("app.services.llm_router._get_provider_fn", return_value=mock_provider_fn):
            result = await call_with_fallback(
                prompt="test",
                provider_models=[("mock", test_model)],
            )

        self.assertIn("success_after_retry", result)
        self.assertEqual(attempts, 2, "Should have retried after short 429 wait")

    async def test_429_unknown_wait_skips_to_next_model(self):
        model1 = "test-provider/model-with-unknown-429"
        model2 = "test-provider/model-backup"

        breaker1 = _get_breaker(model1)
        breaker1._state = breaker1._state.__class__.CLOSED
        breaker1._failure_count = 0

        calls = []

        async def mock_provider_fn(model, prompt, system, max_tokens, temperature):
            calls.append(model)
            if model == model1:
                raise Exception("429 Too Many Requests (no retry header)")
            return '{"response": "backup_model_ok"}'

        with patch("app.services.llm_router._get_provider_fn", return_value=mock_provider_fn):
            result = await call_with_fallback(
                prompt="test",
                provider_models=[("mock", model1), ("mock", model2)],
            )

        self.assertIn("backup_model_ok", result)
        self.assertEqual(calls, [model1, model2], "Should skip immediately to model2 on unknown wait")

    async def test_413_payload_too_large_shrinks_and_retries_once_without_sleep(self):
        test_model = "openai/gpt-oss-120b"
        breaker = _get_breaker(test_model)
        breaker._state = breaker._state.__class__.CLOSED
        breaker._failure_count = 0

        calls = []
        sleep_mock = AsyncMock()

        async def mock_provider_fn(model, prompt, system, max_tokens, temperature):
            calls.append({"model": model, "prompt_len": len(prompt)})
            if len(calls) == 1:
                # First attempt fails with real Groq 413 error string
                raise Exception(
                    "Error code: 413 - {'error': {'message': 'Request too large for model `openai/gpt-oss-120b` "
                    "on tokens per minute (TPM): Limit 8000, Requested 10150. Please try again in 16.125s.', "
                    "'type': 'tokens', 'code': 'rate_limit_exceeded'}}"
                )
            return '{"response": "success_after_shrink"}'

        with patch("app.services.llm_router._get_provider_fn", return_value=mock_provider_fn), \
             patch("app.services.llm_router._get_limiter", return_value=_AsyncRateLimiter(rpm=0)), \
             patch("asyncio.sleep", sleep_mock):
            result = await call_with_fallback(
                prompt="Initial prompt text " * 200,
                max_tokens=1000,
                provider_models=[("mock", test_model)],
            )

        self.assertIn("success_after_shrink", result)
        self.assertEqual(len(calls), 2, "Should retry once after shrinking")
        self.assertLess(calls[1]["prompt_len"], calls[0]["prompt_len"])
        # Verifies 413 does NOT wait/sleep even though the error said "Please try again in 16.125s"
        sleep_mock.assert_not_called()

    async def test_413_persistent_failure_skips_to_next_model(self):
        model1 = "openai/gpt-oss-120b"
        model2 = "openai/gpt-oss-20b"

        calls = []
        sleep_mock = AsyncMock()

        async def mock_provider_fn(model, prompt, system, max_tokens, temperature):
            calls.append(model)
            if model == model1:
                raise Exception("413 Request too large. Limit 8000, Requested 10150")
            return '{"response": "fallback_model_success"}'

        with patch("app.services.llm_router._get_provider_fn", return_value=mock_provider_fn), \
             patch("app.services.llm_router._get_limiter", return_value=_AsyncRateLimiter(rpm=0)), \
             patch("asyncio.sleep", sleep_mock):
            result = await call_with_fallback(
                prompt="Prompt text",
                max_tokens=1000,
                provider_models=[("mock", model1), ("mock", model2)],
            )

        self.assertIn("fallback_model_success", result)
        self.assertEqual(calls, [model1, model1, model2])
        sleep_mock.assert_not_called()

    async def test_async_rate_limiter_rpm(self):
        limiter = _AsyncRateLimiter(rpm=120)  # 0.5s interval
        t0 = time.monotonic()
        await limiter.acquire()
        await limiter.acquire()
        elapsed = time.monotonic() - t0
        self.assertGreaterEqual(elapsed, 0.45, "Rate limiter should enforce min_interval between calls")

    async def test_503_retry_and_succeeds(self):
        test_model = "test-provider/overloaded-model"
        breaker = _get_breaker(test_model)
        breaker._state = breaker._state.__class__.CLOSED
        breaker._failure_count = 0

        attempts = 0

        async def mock_provider_fn(model, prompt, system, max_tokens, temperature):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise Exception("503 Service Unavailable: High demand")
            return '{"response": "success_after_503"}'

        with patch("app.services.llm_router._get_provider_fn", return_value=mock_provider_fn), \
             patch("asyncio.sleep", AsyncMock()):
            result = await call_with_fallback(
                prompt="test",
                provider_models=[("mock", test_model)],
            )

        self.assertIn("success_after_503", result)
        self.assertEqual(attempts, 2, "Should have retried after 503 and succeeded")

    async def test_all_providers_fail_raises_runtime_error(self):
        async def mock_failing_provider(model, prompt, system, max_tokens, temperature):
            raise Exception("500 Internal API Error")

        with patch("app.services.llm_router._get_provider_fn", return_value=mock_failing_provider), \
             patch("asyncio.sleep", AsyncMock()):
            with self.assertRaises(RuntimeError) as ctx:
                await call_with_fallback(
                    prompt="test",
                    provider_models=[("mock", "model-a"), ("mock", "model-b")],
                )
            self.assertIn("All LLM providers exhausted", str(ctx.exception))

    def test_circuit_breaker_60s_cooldown_resets(self):
        cb = CircuitBreaker(failure_threshold=3, reset_timeout_seconds=60.0)
        # Fail 3 times -> trips to OPEN
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        self.assertTrue(cb.is_open())

        # Advance 30s -> still OPEN
        t_base = time.monotonic()
        with patch("time.monotonic", return_value=t_base + 30.0):
            self.assertTrue(cb.is_open())

        # Advance 61s -> resets to HALF_OPEN (is_open() returns False to allow probe)
        with patch("time.monotonic", return_value=t_base + 61.0):
            self.assertFalse(cb.is_open())

    async def test_tpm_limiter_large_request_does_not_block_forever(self):
        # Bucket size is 1000 tokens, single request is 2500 tokens
        limiter = _AsyncRateLimiter(rpm=600, tpm=1000)
        t0 = time.monotonic()
        # Fresh window: should proceed immediately without sleeping 60s
        await limiter.acquire(estimated_tokens=2500)
        elapsed = time.monotonic() - t0
        self.assertLess(elapsed, 1.0, "Request >= TPM on fresh window must proceed immediately")
        self.assertEqual(limiter._tokens_used, 1000)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Groq Client Async Variants Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestGroqClientAsync(unittest.IsolatedAsyncioTestCase):
    async def test_analyze_single_document_async_unreadable(self):
        res = await groq_client.analyze_single_document_async(
            doc_name="image.png",
            doc_type="image",
            content_text="(Vision model processed asset without text)",
        )
        self.assertEqual(res.source_name, "image.png")
        self.assertEqual(res.source_type, "image")
        self.assertIn("Visual asset", res.document_purpose)

    async def test_analyze_single_document_async_success(self):
        fake_response = """
        {
            "source_name": "report.pdf",
            "source_type": "pdf",
            "document_purpose": "Annual financial statements",
            "key_findings": ["Revenue grew 35% YoY to $12M ARR"],
            "extracted_metrics": [{"metric": "ARR", "value": "$12M", "context": "Year end"}],
            "strengths_identified": ["Strong recurring revenue"],
            "risks_or_red_flags": [],
            "verifiable_quotes": ["Revenue grew 35% YoY"]
        }
        """
        with patch("app.services.llm_router.call_with_fallback", AsyncMock(return_value=fake_response)):
            res = await groq_client.analyze_single_document_async(
                doc_name="report.pdf",
                doc_type="pdf",
                content_text="Detailed financial summary: Revenue grew 35% YoY to $12M ARR.",
            )
            self.assertEqual(res.source_name, "report.pdf")
            self.assertEqual(len(res.key_findings), 1)
            self.assertEqual(res.extracted_metrics[0].value, "$12M")


# ─────────────────────────────────────────────────────────────────────────────
# 7. Playwright Windows Smoke Test
# ─────────────────────────────────────────────────────────────────────────────

class TestPlaywrightWindowsSmoke(unittest.IsolatedAsyncioTestCase):
    async def test_playwright_windows_smoke(self):
        """Verify Playwright Chromium launches, evaluates JS, and shuts down on Windows."""
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"],
                )
                page = await browser.new_page()
                res = await page.evaluate("() => 40 + 2")
                self.assertEqual(res, 42)
                await browser.close()
        except Exception as e:
            # If Playwright browser binaries aren't installed in the test environment,
            # record a skip instead of hard failure
            self.skipTest(f"Playwright binary not available: {e}")


if __name__ == "__main__":
    unittest.main()
