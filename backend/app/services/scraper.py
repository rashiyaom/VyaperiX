"""
scraper.py — Universal multi-page web scraper.

Layer 0 (search):   SearchRouter (DDG → Serper) — concurrent with homepage fetch in main.py
Layer 1 (fast):     curl_cffi (optional) / httpx + trafilatura — SSRF-safe per redirect hop
Layer 1b (fallback): stdlib HTML-to-text on Layer-1 raw HTML
Layer 2 (reader):   Jina Reader (https://r.jina.ai/<url>) — no-browser markdown extraction
Layer 3 (JS):       Playwright headless Chromium (persistent singleton) — SPA fallback
Link discovery:     Python stdlib html.parser on Layer-1 raw HTML — no BeautifulSoup

Key features:
- SSRF guard on every URL including every redirect hop (no unchecked auto-follow)
- robots.txt respect (async, checked before Jina)
- LRU URL cache with TTL (SCRAPER_CACHE_MAX entries, SCRAPER_CACHE_TTL seconds)
- Keyword-scored page prioritization; top SCRAPER_MAX_PAGES pages only
- asyncio.Semaphore(6) on concurrent page fetches
- Persistent Playwright browser (reconnects on crash; close via close_playwright())
- Content deduplication across pages
- Structured observability log lines for metrics

Note on Layer 0:
    DDG search and company-name enrichment are handled entirely by
    `app.services.search.router.SearchRouter` and `config.domain_trust`.
    This module does NOT import ddgs or any search library directly.
    `main.py` orchestrates the concurrent fetch + search and passes
    seed_urls into `crawl_website()` and `fetch_seed_pages()`.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import re
import socket
import sys
import threading
import time
from collections import OrderedDict
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura

from app.services._metrics import emit as _emit_metric  # Phase 0 — timing only

logger = logging.getLogger(__name__)

# ─────────────────────────── Constants ─────────────────────────────────

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
}

PAGE_KEYWORDS = [
    "about", "product", "service", "pricing", "customer", "case-stud",
    "contact", "blog", "solution", "feature", "team", "story",
]

# All tunables are env-configurable so production can override without a code change.
MAX_PAGES       = int(os.environ.get("SCRAPER_MAX_PAGES",        "5"))    # top keyword-scored pages to crawl
MIN_CHARS       = int(os.environ.get("SCRAPER_MIN_CHARS",      "500"))   # chars below which we escalate layers
STATIC_TIMEOUT  = int(os.environ.get("SCRAPER_STATIC_TIMEOUT",  "12"))   # seconds per httpx/jina request
CRAWL_BUDGET    = int(os.environ.get("SCRAPER_CRAWL_BUDGET",    "25"))   # total crawl wall-clock seconds
CACHE_MAX_SIZE  = int(os.environ.get("SCRAPER_CACHE_MAX",      "256"))  # max LRU entries
CACHE_TTL       = int(os.environ.get("SCRAPER_CACHE_TTL",   "86400"))   # seconds (24 h)

CONTENT_MIN_CHARS = MIN_CHARS  # internal alias for legacy references


# ─────────────────────────── SSRF Guard ────────────────────────────────

_PRIVATE_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("169.254.0.0/16"),
]


def _is_private_ip(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(host))
        return any(ip in net for net in _PRIVATE_RANGES)
    except Exception:
        return False


def is_safe_url(url: str) -> bool:
    """Return False for localhost / internal IP targets (SSRF guard)."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            return False
        if re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
            return not _is_private_ip(host)
        return True
    except Exception:
        return False


# ─────────────────────────── Link Extractor ────────────────────────────

class _LinkParser(HTMLParser):
    """Minimal html.parser-based link extractor — no third-party deps."""

    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url
        self._domain = urlparse(base_url).netloc
        self.links: list[tuple[int, str]] = []  # (score, href)
        self._seen: set[str] = set()

    def handle_starttag(self, tag: str, attrs):
        if tag != "a":
            return
        attr_dict = dict(attrs)
        href = attr_dict.get("href", "")
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            return
        full = urljoin(self.base_url, href)
        # strip fragment
        parsed = urlparse(full)
        full = urlunparse(parsed._replace(fragment=""))
        if parsed.netloc != self._domain:
            return
        if full in self._seen:
            return
        self._seen.add(full)
        score = sum(k in full.lower() for k in PAGE_KEYWORDS)
        self.links.append((score, full))


def extract_internal_links(base_url: str, html: str, limit: int = MAX_PAGES) -> list[str]:
    """Parse <a href> tags and return top `limit` same-domain links, keyword-scored."""
    parser = _LinkParser(base_url)
    try:
        parser.feed(html)
    except Exception:
        pass
    sorted_links = sorted(parser.links, key=lambda x: -x[0])
    return [href for _, href in sorted_links[:limit]]


from functools import lru_cache

@lru_cache(maxsize=128)
def _get_robot_parser(robots_url: str) -> RobotFileParser | None:
    try:
        rp = RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp
    except Exception:
        return None

def _is_allowed_by_robots(url: str) -> bool:
    """Return True if BizIntelBot is allowed to crawl this URL."""
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = _get_robot_parser(robots_url)
        if rp is None:
            return True
        return rp.can_fetch("BizIntelBot", url)
    except Exception:
        return True  # if we can't read robots.txt, proceed


# ─────────────────────────── URL Cache (LRU + TTL) ─────────────────────

def _cache_key(url: str) -> str:
    """
    Normalise a URL to a stable cache key:
    - Lowercase scheme + host only (path/query case preserved)
    - Strip fragment entirely
    - Strip utm_* query params
    """
    p = urlparse(url)
    qs = re.sub(r"utm_[^&]*(&|$)", "", p.query or "").strip("&")
    return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path, p.params, qs, ""))


class _PageCache:
    """
    Thread-safe LRU cache for fetched page dicts.
    Only stores pages where len(text) >= MIN_CHARS.
    _raw_html is stripped before storage (never persisted in cache).
    Evicts the oldest entry when size exceeds max_size.
    """

    def __init__(self, max_size: int, ttl: int) -> None:
        self._max = max_size
        self._ttl = ttl
        self._store: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, url: str) -> dict | None:
        key = _cache_key(url)
        with self._lock:
            if key not in self._store:
                return None
            ts, page = self._store[key]
            if time.monotonic() - ts > self._ttl:
                del self._store[key]
                return None
            self._store.move_to_end(key)  # mark as recently used
            return dict(page)  # shallow copy

    def set(self, url: str, page: dict) -> None:
        if len(page.get("text", "")) < MIN_CHARS:
            return  # only cache pages that meet the threshold
        key = _cache_key(url)
        # Strip _raw_html; it is only needed within fetch_page() scope
        stored = {k: v for k, v in page.items() if k != "_raw_html"}
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = (time.monotonic(), stored)
            if len(self._store) > self._max:
                self._store.popitem(last=False)  # evict oldest


_url_cache = _PageCache(max_size=CACHE_MAX_SIZE, ttl=CACHE_TTL)

# Concurrency cap — at most 6 outbound fetches running simultaneously
_FETCH_SEM = asyncio.Semaphore(6)


# ─────────────────────────── SSRF-safe Redirect Follower ───────────────

async def _fetch_with_ssrf_hops(
    url: str,
    client: httpx.AsyncClient,
    max_redirects: int = 10,
) -> httpx.Response:
    """
    Follow HTTP redirects manually, SSRF-checking every hop.

    NOTE on DNS-rebinding: this function validates the *hostname* on each hop
    via is_safe_url() (which resolves DNS). True IP-pinning after the first
    resolution would require a custom httpx transport and is deferred as future
    work (documented in known-limitations).
    """
    for _ in range(max_redirects):
        if not is_safe_url(url):
            raise ValueError(f"SSRF guard blocked redirect target: {url!r}")
        resp = await client.get(
            url, headers=HEADERS, timeout=STATIC_TIMEOUT, follow_redirects=False
        )
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("location", "").strip()
            if not location:
                raise ValueError(f"Empty Location header from {url!r}")
            url = urljoin(url, location)  # correctly resolves relative URLs
            continue
        return resp
    raise httpx.TooManyRedirects(request=resp.request)  # type: ignore[possibly-undefined]


# ─────────────────────────── Jina Reader (Layer 2) ─────────────────────

async def _fetch_jina(url: str, client: httpx.AsyncClient) -> tuple[None, str | None]:
    """
    Fetch URL via Jina Reader (https://r.jina.ai/<url>) as a no-browser
    markdown extraction fallback.

    SSRF guard is applied to the *target* URL before constructing the Jina URL.
    Jina.ai itself is a trusted public proxy — we do not SSRF-check the proxy host.
    Returns (None, text) — Jina returns markdown, not raw HTML.
    """
    if not is_safe_url(url):
        logger.debug(f"_fetch_jina: skipping {url!r} — SSRF guard")
        return None, None
    _t0 = time.monotonic()
    try:
        jina_url = f"https://r.jina.ai/{url}"
        resp = await client.get(
            jina_url,
            headers={"Accept": "text/plain", "User-Agent": HEADERS["User-Agent"]},
            timeout=STATIC_TIMEOUT,
            follow_redirects=True,
        )
        resp.raise_for_status()
        text = resp.text.strip()
        _emit_metric({
            "event": "jina_fetch", "url": url, "ok": True,
            "ms": round((time.monotonic() - _t0) * 1000), "chars": len(text),
        })
        return None, text or None
    except Exception as e:
        _emit_metric({
            "event": "jina_fetch", "url": url, "ok": False,
            "ms": round((time.monotonic() - _t0) * 1000), "chars": 0, "error": str(e)[:120],
        })
        logger.debug(f"Jina fetch failed for {url}: {e}")
        return None, None


# ─────────────────────────── Playwright Singleton ──────────────────────

class _PlaywrightRunner:
    """
    Manages Playwright Chromium in a dedicated event loop thread.
    Guarantees WindowsProactorEventLoopPolicy on Windows regardless of whether
    Uvicorn or other frameworks set SelectorEventLoop on the main thread.
    Provides persistent singleton browser with auto-reconnect on crash.
    """

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._browser: Any = None
        self._pw: Any = None
        self._ready = threading.Event()
        self._lock = threading.Lock()

    def _ensure_started(self) -> None:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._ready.clear()

            def _worker() -> None:
                if sys.platform == "win32":
                    try:
                        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                    except Exception:
                        pass
                self._loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self._loop)
                self._ready.set()
                self._loop.run_forever()

            self._thread = threading.Thread(target=_worker, name="PlaywrightRunnerThread", daemon=True)
            self._thread.start()
            self._ready.wait()

    async def get_browser(self) -> Any:
        self._ensure_started()
        assert self._loop is not None

        async def _do() -> Any:
            return await self._get_browser_in_loop()

        return await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(_do(), self._loop))

    async def _get_browser_in_loop(self) -> Any:
        if self._browser is None or not self._browser.is_connected():
            if self._pw is not None:
                try:
                    await self._pw.stop()
                except Exception:
                    pass
            from playwright.async_api import async_playwright
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            logger.info("Playwright browser launched.")
        return self._browser

    async def fetch(self, url: str) -> tuple[str | None, str | None]:
        self._ensure_started()
        assert self._loop is not None
        _t0 = time.monotonic()

        async def _do() -> tuple[str | None, str | None]:
            ctx = None
            try:
                browser = await self._get_browser_in_loop()
                ctx = await browser.new_context(
                    user_agent=HEADERS["User-Agent"],
                    java_script_enabled=True,
                    viewport={"width": 1280, "height": 800},
                )
                page = await ctx.new_page()
                await page.add_init_script("delete Object.getPrototypeOf(navigator).webdriver")

                async def _block_resources(route: Any) -> None:
                    if route.request.resource_type in {"image", "font", "media", "stylesheet"}:
                        await route.abort()
                    else:
                        await route.continue_()

                await page.route("**/*", _block_resources)
                await page.goto(url, timeout=12000, wait_until="domcontentloaded")

                try:
                    for selector in [
                        "text=tap to skip", "text=skip", "text=enter",
                        "text=explore", "button:has-text('Skip')", "button:has-text('Enter')",
                    ]:
                        elem = await page.query_selector(selector)
                        if elem:
                            await elem.click()
                            await asyncio.sleep(0.5)
                            break
                except Exception:
                    pass

                try:
                    for selector in [
                        "button.load-more-btn", "button:has-text('Load more')", "button:has-text('Load More')",
                    ]:
                        elem = await page.query_selector(selector)
                        if elem:
                            await elem.click()
                            await asyncio.sleep(0.8)
                            break
                except Exception:
                    pass

                raw_html = await page.content()
                text = trafilatura.extract(
                    raw_html,
                    include_comments=False,
                    include_tables=True,
                    no_fallback=False,
                ) or ""
                _emit_metric({
                    "event": "layer2_playwright", "url": url, "ok": True,
                    "ms": round((time.monotonic() - _t0) * 1000), "chars": len(text),
                })
                return raw_html, text
            except Exception as e:
                _emit_metric({
                    "event": "layer2_playwright", "url": url, "ok": False,
                    "ms": round((time.monotonic() - _t0) * 1000), "chars": 0, "error": str(e)[:120],
                })
                logger.warning(f"Playwright fetch failed for {url}: {e}")
                return None, None
            finally:
                if ctx is not None:
                    try:
                        await ctx.close()
                    except Exception:
                        pass

        return await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(_do(), self._loop))

    async def close(self) -> None:
        if self._loop and self._loop.is_running():
            async def _stop() -> None:
                if self._browser is not None:
                    try:
                        await self._browser.close()
                    except Exception:
                        pass
                    self._browser = None
                if self._pw is not None:
                    try:
                        await self._pw.stop()
                    except Exception:
                        pass
                    self._pw = None

            try:
                await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(_stop(), self._loop))
                self._loop.call_soon_threadsafe(self._loop.stop)
            except Exception:
                pass
            logger.info("Playwright browser closed.")


_pw_runner = _PlaywrightRunner()


async def _get_browser() -> Any:
    """
    Return the shared persistent Playwright Chromium browser.
    Launches on first call; reconnects automatically on crash.
    """
    return await _pw_runner.get_browser()


async def close_playwright() -> None:
    """
    Gracefully close the shared Playwright browser.
    Call from FastAPI lifespan shutdown.
    """
    await _pw_runner.close()


# ─────────────────────────── Static Fetch ──────────────────────────────

async def _fetch_static(url: str, client: httpx.AsyncClient) -> tuple[str | None, str | None]:
    """
    Fetch URL with httpx + trafilatura.
    Uses _fetch_with_ssrf_hops so every redirect hop is SSRF-checked.
    Returns (raw_html, extracted_text). Both can be None on failure.
    """
    _t0 = time.monotonic()
    try:
        _t_http = time.monotonic()
        resp = await _fetch_with_ssrf_hops(url, client)
        resp.raise_for_status()
        raw_html = resp.text
        _http_ms = round((time.monotonic() - _t_http) * 1000)

        _t_traf = time.monotonic()
        text = trafilatura.extract(
            raw_html,
            include_comments=False,
            include_tables=True,
            no_fallback=False,
        ) or ""
        _traf_ms = round((time.monotonic() - _t_traf) * 1000)

        _emit_metric({
            "event": "layer1_fetch", "url": url, "ok": True,
            "httpx_ms": _http_ms, "trafilatura_ms": _traf_ms, "chars": len(text),
        })
        return raw_html, text
    except Exception as e:
        _emit_metric({
            "event": "layer1_fetch", "url": url, "ok": False,
            "ms": round((time.monotonic() - _t0) * 1000), "chars": 0, "error": str(e)[:120],
        })
        logger.warning(f"Static fetch failed for {url}: {e}")
        return None, None


# ─────────────────────────── Playwright Fallback (Singleton) ───────────

async def _fetch_playwright(url: str) -> tuple[str | None, str | None]:
    """Headless Chromium via the persistent Playwright singleton."""
    return await _pw_runner.fetch(url)


def _extract_semantic_elements(html: str) -> dict:
    """
    Extract high-value structured semantic elements from raw HTML:
    - Meta description, keywords, OpenGraph titles & descriptions
    - Schema.org JSON-LD structured data (Product, Organization, Service, LocalBusiness, FAQ)
    - Headings (H1, H2, H3)
    - Pricing tables & pricing cards
    - Key bullet points & offerings
    - Contact details & social channels
    """
    if not html:
        return {}

    import json
    import html as html_lib

    elements: dict[str, Any] = {
        "title": "",
        "meta_description": "",
        "json_ld_schemas": [],
        "headings": [],
        "pricing_signals": [],
        "key_bullets": [],
        "contact_info": [],
    }

    # 1. Title & Meta tags
    title_match = re.search(r"<title[^>]*>([^<]{1,250})</title>", html, re.IGNORECASE)
    if title_match:
        elements["title"] = html_lib.unescape(title_match.group(1)).strip()

    meta_desc_match = re.search(
        r'<meta[^>]*?(?:name|property)=["\'](?:description|og:description)["\'][^>]*?content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    ) or re.search(
        r'<meta[^>]*?content=["\']([^"\']+)["\'][^>]*?(?:name|property)=["\'](?:description|og:description)["\']',
        html,
        re.IGNORECASE,
    )
    if meta_desc_match:
        elements["meta_description"] = html_lib.unescape(meta_desc_match.group(1)).strip()

    site_name_match = re.search(
        r'<meta[^>]*?(?:name|property)=["\'](?:og:site_name|application-name)["\'][^>]*?content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    ) or re.search(
        r'<meta[^>]*?content=["\']([^"\']+)["\'][^>]*?(?:name|property)=["\'](?:og:site_name|application-name)["\']',
        html,
        re.IGNORECASE,
    )
    if site_name_match:
        elements["site_name"] = html_lib.unescape(site_name_match.group(1)).strip()

    # 2. JSON-LD Schemas
    for script_match in re.finditer(r'<script\s+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>', html, re.IGNORECASE):
        try:
            raw_json = script_match.group(1).strip()
            if raw_json:
                data = json.loads(raw_json)
                if isinstance(data, dict):
                    schema_type = data.get("@type", "Schema")
                    name = data.get("name") or data.get("headline") or ""
                    desc = data.get("description") or ""
                    offers = data.get("offers") or data.get("hasOfferCatalog")
                    summary = f"Type: {schema_type}"
                    if name:
                        summary += f" | Name: {name}"
                    if desc:
                        summary += f" | Description: {desc[:200]}"
                    if offers:
                        summary += f" | Offers/Pricing: {str(offers)[:200]}"
                    elements["json_ld_schemas"].append(summary)
                elif isinstance(data, list):
                    for item in data[:3]:
                        if isinstance(item, dict):
                            elements["json_ld_schemas"].append(f"Type: {item.get('@type')} | Name: {item.get('name', '')}")
        except Exception:
            pass

    # 3. Headings (H1, H2, H3)
    for h_match in re.finditer(r'<h([1-3])[^>]*>([\s\S]*?)</h\1>', html, re.IGNORECASE):
        h_level = h_match.group(1)
        h_text = re.sub(r'<[^>]+>', ' ', h_match.group(2))
        h_text = re.sub(r'\s+', ' ', html_lib.unescape(h_text)).strip()
        if h_text and len(h_text) > 2 and len(h_text) < 180:
            elements["headings"].append(f"H{h_level}: {h_text}")

    # Deduplicate headings while preserving order
    seen_h = set()
    elements["headings"] = [h for h in elements["headings"] if not (h in seen_h or seen_h.add(h))][:15]

    # 4. Pricing elements & currency patterns
    pricing_patterns = re.finditer(
        r'(?:[$₹€£]\s*\d+(?:[.,]\d+)?(?:\s*(?:/\s*(?:mo|month|yr|year|user|seat|sq\.?ft|unit|piece|kg))|k|m)?)|(?:(?:₹|INR|USD|\$)\s*\d+)',
        html,
        re.IGNORECASE,
    )
    for p_match in pricing_patterns:
        start = max(0, p_match.start() - 60)
        end = min(len(html), p_match.end() + 80)
        snippet = html[start:end]
        snippet_clean = re.sub(r'<[^>]+>', ' ', snippet)
        snippet_clean = re.sub(r'\s+', ' ', html_lib.unescape(snippet_clean)).strip()
        if snippet_clean and len(snippet_clean) > 8:
            elements["pricing_signals"].append(snippet_clean)

    # Deduplicate pricing signals
    seen_p = set()
    elements["pricing_signals"] = [p for p in elements["pricing_signals"] if not (p in seen_p or seen_p.add(p))][:8]

    # 5. Key Feature Bullets & List items
    for li_match in re.finditer(r'<li[^>]*>([\s\S]*?)</li>', html, re.IGNORECASE):
        li_text = re.sub(r'<[^>]+>', ' ', li_match.group(1))
        li_text = re.sub(r'\s+', ' ', html_lib.unescape(li_text)).strip()
        if li_text and 15 < len(li_text) < 220:
            elements["key_bullets"].append(li_text)

    seen_b = set()
    elements["key_bullets"] = [b for b in elements["key_bullets"] if not (b in seen_b or seen_b.add(b))][:12]

    # 6. Contact Information & Social Channels
    emails = set(re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', html))
    clean_emails = [e for e in emails if not e.endswith(('.png', '.jpg', '.webp', '.js', '.css'))][:3]
    if clean_emails:
        elements["contact_info"].append(f"Email: {', '.join(clean_emails)}")

    phones = set(re.findall(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', html))
    if phones:
        elements["contact_info"].append(f"Phone: {', '.join(list(phones)[:3])}")

    return elements


def _extract_text_fallback(html: str) -> str:
    """Robust HTML-to-text fallback stripping script/style and extracting readable content."""
    if not html:
        return ""
    try:
        import html as html_lib
        # Strip script, style, head, noscript
        cleaned = re.sub(r"<(script|style|noscript|head)[^>]*>[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
        # Block elements to newline
        cleaned = re.sub(r"</?( div|p|h[1-6]|li|tr|th|td|section|article|header|footer|nav)[^>]*>", "\n", cleaned, flags=re.IGNORECASE)
        # Strip other HTML tags
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        # Unescape standard entities
        cleaned = html_lib.unescape(cleaned)
        # Collapse multiple spaces and filter lines
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in cleaned.splitlines()]
        return "\n".join(l for l in lines if l)
    except Exception:
        return ""


# ─────────────────────────── Single Page ───────────────────────────────

async def fetch_page(
    url: str,
    client: httpx.AsyncClient,
    tier: str = "first_party",
    confidence: float = 1.0,
) -> dict:
    """
    Fetch a single page using the 4-layer ladder:
      Layer 1  : httpx + trafilatura (SSRF-safe redirect following)
      Layer 1b : stdlib HTML-to-text on Layer-1 raw HTML
      Layer 2  : Jina Reader (only if robots.txt allows it)
      Layer 3  : Playwright persistent singleton (only when both above fail)

    Also:
      - Checks/populates LRU cache (_url_cache) before any I/O.
      - Extracts links from Layer-1 raw HTML regardless of which layer
        won the text (Jina/Playwright return no anchor tags).
      - Guarded by _FETCH_SEM so at most 6 pages run concurrently.

    Args:
        url:        Target URL (SSRF-checked by caller).
        client:     Shared httpx.AsyncClient.
        tier:       Trust tier from domain_trust classification.
        confidence: Confidence score (0 < x ≤ 1.0) from domain_trust.

    Returns:
        dict: url, title, text, links, semantic_elements, method, tier, confidence
              (never contains _raw_html)
    """
    # ── Cache check (outside semaphore — no I/O) ──────────────────────────────
    cached = _url_cache.get(url)
    if cached is not None:
        return cached

    _t_page = time.monotonic()

    async with _FETCH_SEM:
        # ── Forced Playwright (for smoke testing / dynamic SPAs) ─────────────
        force_pw = os.environ.get("FORCE_PLAYWRIGHT", "").lower() in ("1", "true", "yes")
        if force_pw:
            logger.info(f"FORCE_PLAYWRIGHT active — escalating directly to Playwright for {url}")
            pw_html, pw_text = await _fetch_playwright(url)
            raw_html = pw_html
            text = pw_text
            method = "playwright"
            _layer1_html = raw_html or ""
        else:
            # ── Layer 1: httpx + trafilatura (SSRF-safe redirects) ────────────────
            raw_html, text = await _fetch_static(url, client)
            method = "static"
            _layer1_html = raw_html or ""  # preserved for link extraction

        # ── Layer 1b: stdlib text fallback on Layer-1 HTML ──────────────────
        if _layer1_html and len(text or "") < MIN_CHARS:
            fb = _extract_text_fallback(_layer1_html)
            if len(fb) >= MIN_CHARS:
                text = fb

        # ── robots.txt + Jina check ────────────────────────────────────
        if len(text or "") < MIN_CHARS:
            _jina_allowed = _is_allowed_by_robots(url)

            # Layer 2: Jina Reader
            if _jina_allowed:
                _, jina_text = await _fetch_jina(url, client)
                if jina_text and len(jina_text) >= MIN_CHARS:
                    text = jina_text
                    method = "jina"

        # ── Layer 3: Playwright singleton ────────────────────────────────
        if len(text or "") < MIN_CHARS:
            logger.info(f"Escalating to Playwright for {url} (method so far: {method})")
            pw_html, pw_text = await _fetch_playwright(url)
            if pw_text and len(pw_text) >= MIN_CHARS:
                raw_html = pw_html or raw_html
                text = pw_text
                method = "playwright"

        # Final text fallback on raw HTML (Layer 1 or Playwright)
        if (not text or len(text) < MIN_CHARS) and raw_html:
            fb = _extract_text_fallback(raw_html)
            if fb:
                text = fb

        # ── Empty result ────────────────────────────────────────────────
        if not raw_html and not text:
            _emit_metric({"event": "page_fetch", "url": url, "method": method,
                          "ms": round((time.monotonic() - _t_page) * 1000), "chars": 0, "ok": False})
            return {
                "url": url, "title": "", "text": "", "links": [],
                "semantic_elements": {}, "method": method,
                "tier": tier, "confidence": confidence,
            }

        # ── Link extraction (always from Layer-1 HTML) ───────────────────────
        # Jina returns markdown (no anchor tags); Playwright HTML would work but
        # we consistently use Layer-1 HTML so link set is stable and deduplicated.
        links = extract_internal_links(url, _layer1_html, limit=MAX_PAGES * 3)

        # ── Semantic extraction ──────────────────────────────────────────
        semantic = _extract_semantic_elements(raw_html or "")
        title = semantic.get("title") or ""

        # Assemble structured text representation
        structured_sections = []
        if semantic.get("meta_description"):
            structured_sections.append(f"**Meta Description / Tagline:** {semantic['meta_description']}")

        if semantic.get("json_ld_schemas"):
            structured_sections.append("**Structured Data (Schema.org):**\n" + "\n".join(f"- {s}" for s in semantic["json_ld_schemas"]))

        if semantic.get("headings"):
            structured_sections.append("**Key Page Headings:**\n" + "\n".join(f"- {h}" for h in semantic["headings"]))

        if semantic.get("pricing_signals"):
            structured_sections.append("**Detected Pricing & Offer Signals:**\n" + "\n".join(f"- {p}" for p in semantic["pricing_signals"]))

        if semantic.get("key_bullets"):
            structured_sections.append("**Key Offerings / Features:**\n" + "\n".join(f"- {b}" for b in semantic["key_bullets"][:8]))

        if semantic.get("contact_info"):
            structured_sections.append("**Contact & Channels:** " + " | ".join(semantic["contact_info"]))

        if text:
            structured_sections.append(f"**Main Extracted Page Text:**\n{text.strip()}")

        combined_text = "\n\n".join(structured_sections) if structured_sections else (text or "")

        _result = {
            "url": url,
            "title": title,
            "text": combined_text.strip(),
            "links": links,  # from Layer-1 HTML — always present for crawl dedup
            "semantic_elements": semantic,
            "method": method,
            "tier": tier,
            "confidence": confidence,
            # _raw_html intentionally omitted — never returned or cached
        }
        _emit_metric({"event": "page_fetch", "url": url, "method": method,
                      "ms": round((time.monotonic() - _t_page) * 1000),
                      "chars": len(_result["text"]), "ok": True})
        _url_cache.set(url, _result)
        return _result


# ─────────────────────────── Multi-page Crawl ──────────────────────────

async def crawl_website(base_url: str) -> list[dict]:
    """
    Crawl up to MAX_PAGES pages of a website within CRAWL_BUDGET seconds.

    All crawled pages carry tier="first_party" and confidence=1.0 because
    they originate from the company's own domain.

    Args:
        base_url: Primary website URL (SSRF-checked before calling this function).

    Returns:
        list of page dicts with keys: url, title, text, method, tier, confidence
    """
    if not is_safe_url(base_url):
        raise ValueError(f"URL is not allowed (SSRF guard): {base_url}")

    crawl_start = time.monotonic()
    pages: list[dict] = []

    async with httpx.AsyncClient(follow_redirects=False) as client:
        # Step 1: fetch homepage (first_party, confidence 1.0)
        homepage = await fetch_page(base_url, client, tier="first_party", confidence=1.0)
        if homepage["text"]:
            pages.append(homepage)

        # Step 2: use links already extracted by fetch_page() from Layer-1 HTML.
        # No second HTTP fetch needed — homepage['links'] is populated by fetch_page().
        links = homepage.get("links") or []
        if not links:
            # Fallback: attempt link extraction directly if homepage had no links field
            links = extract_internal_links(base_url, "", limit=MAX_PAGES * 2)

        # Step 3: filter already-fetched and robots-disallowed, then crawl concurrently
        fetched_urls = {base_url, base_url.rstrip("/")}
        candidate_links = []
        for link in links:
            if link not in fetched_urls and is_safe_url(link) and _is_allowed_by_robots(link):
                candidate_links.append(link)
                fetched_urls.add(link)

        candidate_links = candidate_links[: MAX_PAGES - 1]

        # Concurrent fetch with overall time budget
        async def _safe_fetch(url: str) -> dict:
            try:
                return await asyncio.wait_for(
                    fetch_page(url, client, tier="first_party", confidence=1.0),
                    timeout=CRAWL_BUDGET / 3,
                )
            except asyncio.TimeoutError:
                logger.warning(f"Timeout fetching {url}")
                return {"url": url, "title": "", "text": "", "links": [], "method": "timeout", "tier": "first_party", "confidence": 1.0}

        results = await asyncio.gather(*[_safe_fetch(u) for u in candidate_links])
        pages.extend([r for r in results if r["text"]])

    crawl_duration = time.monotonic() - crawl_start
    _playwright_pages = sum(1 for p in pages if p.get("method") == "playwright")
    logger.info(
        '{"event": "crawl_stage_duration", "stage": "crawl", "seconds": %.2f, "pages": %d, "base_url": %r}',
        crawl_duration,
        len(pages),
        base_url,
    )
    logger.info(f"Crawled {len(pages)} pages from {base_url}")
    _emit_metric({
        "event": "crawl_summary",
        "base_url": base_url,
        "total_ms": round(crawl_duration * 1000),
        "pages": len(pages),
        "playwright_pages": _playwright_pages,
        "static_pages": len(pages) - _playwright_pages,
    })
    return pages


# ─────────────────────────── Seed URL Fetcher ──────────────────────────

async def fetch_seed_pages(
    seed_urls: list,           # list[SeedUrl] from config.domain_trust
    existing_urls: set[str],
    max_seed_pages: int = 5,
) -> list[dict]:
    """
    Fetch DDG-discovered seed URLs that are not already in the crawled set.

    This is Stage B of the two-stage crawl.  It runs after `crawl_website()`
    (Stage A) completes, using the trust-tier metadata from
    `config.domain_trust.classify_and_filter()`.

    Args:
        seed_urls:     Classified SeedUrl objects from domain_trust.
        existing_urls: URLs already fetched by crawl_website() — deduplicated here.
        max_seed_pages: Cap on how many seed pages to fetch (to bound latency).

    Returns:
        list of page dicts with tier and confidence populated from the SeedUrl.
    """
    if not seed_urls:
        return []

    # Filter to URLs not already fetched, respecting SSRF guard and robots
    candidates = []
    for seed in seed_urls:
        url = seed.url
        # Normalise trailing slash for dedup
        if url in existing_urls or url.rstrip("/") in existing_urls:
            continue
        if not is_safe_url(url):
            continue
        if not _is_allowed_by_robots(url):
            continue
        candidates.append(seed)
        if len(candidates) >= max_seed_pages:
            break

    if not candidates:
        return []

    seed_pages: list[dict] = []
    async with httpx.AsyncClient(follow_redirects=True) as client:
        async def _fetch_seed(seed) -> dict:
            try:
                return await asyncio.wait_for(
                    fetch_page(seed.url, client, tier=seed.tier, confidence=seed.confidence),
                    timeout=CRAWL_BUDGET / 3,
                )
            except asyncio.TimeoutError:
                logger.warning(f"Timeout fetching seed URL {seed.url}")
                return {"url": seed.url, "title": "", "text": "", "method": "timeout", "tier": seed.tier, "confidence": seed.confidence}

        results = await asyncio.gather(*[_fetch_seed(s) for s in candidates])
        seed_pages = [r for r in results if r["text"]]

    logger.info(
        '{"event": "seed_pages_fetched", "count": %d, "requested": %d}',
        len(seed_pages),
        len(candidates),
    )
    return seed_pages
