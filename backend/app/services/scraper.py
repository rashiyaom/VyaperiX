"""
scraper.py — Universal multi-page web scraper.

Layer 0 (search):   SearchRouter (DDG → Serper) — runs concurrently with homepage fetch in main.py
Layer 1 (fast):     httpx async + trafilatura  — works for ~60% of sites
Layer 2 (JS):       playwright headless Chromium — handles React/Vue/Angular SPAs
Link discovery:     crawl_coverage.discover_links + prioritize

Key features:
- SSRF guard (rejects localhost/internal IPs)
- Non-blocking async robots.txt respect
- Balanced category page prioritization via crawl_coverage
- Domain trust tiers on every returned page dict (tier, confidence)
- Grounded evidence extraction via extraction_validator (with robust text preservation)
- Normalized URL tracking to avoid duplicate crawls on redirects
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import re
import socket
import time
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura
from app.services import crawl_coverage, extraction_validator

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

MAX_PAGES = 20
STATIC_TIMEOUT = 12   # seconds per httpx request
CRAWL_BUDGET = 50     # total seconds for all pages (raised to allow 20 pages)
CONTENT_MIN_CHARS = 80  # below this we consider a page "near-empty" → trigger playwright

# Categories that must be crawled if available, before filling with generic pages.
# Each entry corresponds to a crawl_coverage category name.
PRIORITY_CATEGORIES = ["pricing", "contact", "faq", "integrations"]


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
    return [item["url"] for item in crawl_coverage.prioritize(
        crawl_coverage.discover_links(base_url, html), limit)]


# ─────────────────────────── robots.txt ────────────────────────────────

async def _is_allowed_by_robots(url: str, client: httpx.AsyncClient | None = None) -> bool:
    """Return True if BizIntelBot is allowed to crawl this URL (non-blocking)."""
    try:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        robots_url = f"{origin}/robots.txt"
        parser = RobotFileParser()
        if client is not None:
            resp = await client.get(robots_url, headers=HEADERS, timeout=3.0)
            parser.parse(resp.text.splitlines() if resp.status_code == 200 else [])
        else:
            async with httpx.AsyncClient(follow_redirects=True, timeout=3.0) as temp_client:
                resp = await temp_client.get(robots_url, headers=HEADERS)
                parser.parse(resp.text.splitlines() if resp.status_code == 200 else [])
        return parser.can_fetch("BizIntelBot", url)
    except Exception:
        return True  # if we can't read robots.txt, proceed


# ─────────────────────────── Static Fetch ──────────────────────────────

async def _fetch_static(url: str, client: httpx.AsyncClient) -> tuple[str | None, str | None, str]:
    """
    Fetch URL with httpx, extract main content with trafilatura.
    Returns (raw_html, extracted_text, final_url). raw_html and extracted_text can be None on failure.
    """
    try:
        resp = await client.get(url, headers=HEADERS, timeout=STATIC_TIMEOUT, follow_redirects=True)
        resp.raise_for_status()
        raw_html = resp.text
        text = trafilatura.extract(
            raw_html,
            include_comments=False,
            include_tables=True,
            no_fallback=False,
        ) or ""
        return raw_html, text, str(resp.url)
    except Exception as e:
        logger.warning(f"Static fetch failed for {url}: {e}")
        return None, None, url


# ─────────────────────────── Playwright Fallback ───────────────────────

async def _fetch_playwright(url: str) -> tuple[str | None, str | None]:
    """
    Headless Chromium via Playwright — only called when static fetch yields near-empty content.
    Returns (raw_html, extracted_text).
    """
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
            )
            try:
                ctx = await browser.new_context(
                    user_agent=HEADERS["User-Agent"],
                    java_script_enabled=True,
                    viewport={"width": 1280, "height": 800},
                )
                page = await ctx.new_page()
                await page.add_init_script("delete Object.getPrototypeOf(navigator).webdriver")
                # domcontentloaded provides reliable, fast page load without networkidle timeouts
                await page.goto(url, timeout=12000, wait_until="domcontentloaded")
                await page.wait_for_timeout(1000)

                # Dismiss intro screens / splash loaders (e.g. "tap to skip", "enter")
                try:
                    for selector in ["text=tap to skip", "text=skip", "text=enter", "text=explore", "button:has-text('Skip')", "button:has-text('Enter')"]:
                        elem = await page.query_selector(selector)
                        if elem:
                            await elem.click()
                            await page.wait_for_timeout(800)
                            break
                except Exception:
                    pass

                raw_html = await page.content()
            finally:
                await browser.close()

            text = trafilatura.extract(
                raw_html,
                include_comments=False,
                include_tables=True,
                no_fallback=False,
            ) or ""
            return raw_html, text
    except Exception as e:
        logger.warning(f"Playwright fetch failed for {url}: {e}")
        return None, None


def _extract_semantic_elements(html: str) -> dict:
    extracted = extraction_validator.extract_evidence(html, "")
    records = extracted["evidence"]
    return {
        "title": extracted["title"],
        "headings": extracted["headings"],
        "json_ld_schemas": [r["text"] for r in records if r["kind"] == "schema_org"],
        "contact_info": [r["text"] for r in records if r["kind"] == "semantic_element" and r["text"].startswith(("Phone:", "Email:"))],
        "pricing_signals": [],
        "key_bullets": [],
    }


def _extract_text_fallback(html: str) -> str:
    """Robust HTML-to-text fallback stripping script/style and extracting readable content."""
    if not html:
        return ""
    try:
        import html as html_lib
        cleaned = re.sub(r"<(script|style|noscript|head)[^>]*>[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
        cleaned = re.sub(r"</?( div|p|h[1-6]|li|tr|th|td|section|article|header|footer|nav)[^>]*>", "\n", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        cleaned = html_lib.unescape(cleaned)
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
    Fetch a single page using universal 2-layer strategy with semantic structure extraction.
    Guarantees readable text is never dropped.
    """
    requested_url = url
    raw_html, text, url = await _fetch_static(url, client)
    method = "static"

    if raw_html is not None and len(text or "") < CONTENT_MIN_CHARS:
        fb = _extract_text_fallback(raw_html)
        if len(fb) >= CONTENT_MIN_CHARS:
            text = fb

    if raw_html is None or len(text or "") < CONTENT_MIN_CHARS:
        logger.info(f"Static fetch near-empty for {url}, trying Playwright...")
        pw_html, pw_text = await _fetch_playwright(url)
        if pw_text:
            raw_html, text = pw_html, pw_text
            method = "playwright"

    # Final fallback if text is still empty but raw_html was fetched
    if (not text or len(text) < CONTENT_MIN_CHARS) and raw_html:
        fb = _extract_text_fallback(raw_html)
        if fb:
            text = fb

    if not raw_html and not text:
        return {
            "url": url, "requested_url": requested_url, "title": "", "text": "",
            "evidence": [], "categories": [], "discovered_links": [],
            "semantic_elements": {}, "method": method,
            "tier": tier, "confidence": confidence,
        }

    extracted = extraction_validator.extract_evidence(raw_html or "", url)
    records = extracted.get("evidence", [])
    extracted_text = (extracted.get("text") or "").strip()

    # CRITICAL: Preserve full extracted text if extraction_validator returned empty or shorter text
    final_text = extracted_text if len(extracted_text) >= CONTENT_MIN_CHARS else (text or extracted_text or "").strip()

    # If extraction_validator missed structured blocks but we have readable text,
    # generate visible_context evidence records so RAG chunking can index this page.
    if not records and final_text:
        para_seen = set()
        for p in final_text.split("\n\n"):
            p_clean = extraction_validator.clean(p)
            if len(p_clean) >= 15 and p_clean not in para_seen:
                para_seen.add(p_clean)
                records.append(extraction_validator.evidence_record(url, p_clean, "visible_context", "/html/body"))

    final_title = (extracted.get("title") or "").strip()
    if not final_title and raw_html:
        title_match = re.search(r"<title[^>]*>([^<]{1,250})</title>", raw_html, re.IGNORECASE)
        if title_match:
            try:
                import html as html_lib
                final_title = html_lib.unescape(title_match.group(1)).strip()
            except Exception:
                pass

    headings = extracted.get("headings", [])
    semantic = {
        "title": final_title,
        "headings": headings,
        "json_ld_schemas": [r["text"] for r in records if r.get("kind") == "schema_org"],
        "contact_info": [r["text"] for r in records if r.get("kind") == "semantic_element" and r["text"].startswith(("Phone:", "Email:"))],
        "pricing_signals": [],
        "key_bullets": [],
    }

    return {
        "url": url,
        "requested_url": requested_url,
        "title": final_title,
        "text": final_text,
        "evidence": records,
        "extraction_version": extraction_validator.EXTRACTION_VERSION,
        "categories": crawl_coverage.categories(urlparse(url).path, final_title, *headings),
        "discovered_links": crawl_coverage.discover_links(url, raw_html or ""),
        "semantic_elements": semantic,
        "method": method,
        "tier": tier,
        "confidence": confidence,
    }


# ─────────────────────────── Multi-page Crawl ──────────────────────────

async def crawl_website(base_url: str) -> list[dict]:
    """Bounded breadth-first discovery, balanced across generic page categories.

    Priority pass: a dedicated first wave reserves one slot per PRIORITY_CATEGORY
    (pricing, contact, FAQ, integrations) so high-value pages are never displaced
    by generic product or blog pages even when the site is large.
    """
    if not is_safe_url(base_url):
        raise ValueError(f"URL is not allowed: {base_url}")
    started = time.monotonic()
    pages, discovered, failed = [], [], []
    canonical_host = (urlparse(base_url).hostname or "").lower().removeprefix("www.")

    def _norm(u: str) -> str:
        return u.split("#")[0].rstrip("/")

    norm_base = _norm(base_url)
    pending = [{"url": base_url, "categories": [], "label": ""}]
    seen: set[str] = set()
    covered = set()

    async with httpx.AsyncClient(follow_redirects=True) as client:
        robots: dict[str, RobotFileParser] = {}

        async def allowed(url: str) -> bool:
            try:
                parsed = urlparse(url)
                origin = f"{parsed.scheme}://{parsed.netloc}"
                if origin not in robots:
                    parser = RobotFileParser()
                    try:
                        response = await client.get(origin + "/robots.txt", headers=HEADERS, timeout=3.0)
                        parser.parse(response.text.splitlines() if response.status_code == 200 else [])
                    except (httpx.HTTPError, asyncio.TimeoutError, Exception):
                        parser.parse([])
                    robots[origin] = parser
                return robots[origin].can_fetch("BizIntelBot", url)
            except Exception:
                return True

        async def fetch(link: dict) -> dict:
            url = link["url"]
            try:
                if not is_safe_url(url) or not await allowed(url):
                    return {"url": url, "text": ""}
                remaining_time = max(1.0, CRAWL_BUDGET - (time.monotonic() - started))
                fetch_timeout = min(STATIC_TIMEOUT + 5, remaining_time)
                return await asyncio.wait_for(fetch_page(url, client), timeout=fetch_timeout)
            except Exception as e:
                logger.debug("Fetch failed for %s: %s", url, e)
                return {"url": url, "text": ""}

        async def _process_batch(batch: list[dict]) -> None:
            """Fetch a batch, add successful results to pages/discovered/pending."""
            for l in batch:
                seen.add(_norm(l["url"]))
            results = await asyncio.gather(*(fetch(link) for link in batch), return_exceptions=True)
            for result in results:
                if isinstance(result, Exception) or not isinstance(result, dict) or not result.get("text"):
                    if isinstance(result, dict) and result.get("url"):
                        failed.append(result["url"])
                    continue
                final_norm = _norm(result.get("url", ""))
                seen.add(final_norm)
                final_host = (urlparse(result["url"]).hostname or "").lower().removeprefix("www.")
                if _norm(result.get("requested_url", "")) == norm_base:
                    canonical_host = final_host
                if canonical_host and final_host != canonical_host:
                    failed.append(result["url"])
                    logger.warning("crawl_redirect_outside_canonical url=%s", result["url"])
                    continue
                result["scope_url"] = base_url
                pages.append(result)
                covered.update(result.get("categories", []))
                links = result.pop("discovered_links", [])
                discovered.extend(links)
                pending.extend(links)

        # ── Phase 1: homepage (always first) ──────────────────────────────────
        await _process_batch(pending[:])
        pending.clear()
        pending = [l for l in discovered if _norm(l["url"]) not in seen]

        # ── Phase 2: priority pass – one slot per PRIORITY_CATEGORY ──────────────
        # Build candidate lists for each uncovered priority category, then fetch
        # the best representative before moving on to the general crawl.
        for cat in PRIORITY_CATEGORIES:
            if cat in covered or len(pages) >= MAX_PAGES:
                continue  # already captured by homepage or slot full
            if time.monotonic() - started >= CRAWL_BUDGET:
                break
            candidates = [l for l in pending if cat in l.get("categories", []) and _norm(l["url"]) not in seen]
            if not candidates:
                continue
            best = sorted(candidates, key=lambda l: (len(urlparse(l["url"]).path), l["url"]))[0]
            await _process_batch([best])
            pending = [l for l in pending if _norm(l["url"]) not in seen]

        # ── Phase 3: general balanced crawl ─────────────────────────────────
        while pending and len(pages) < MAX_PAGES and time.monotonic() - started < CRAWL_BUDGET:
            unseen_pending = [l for l in pending if _norm(l["url"]) not in seen]
            if not unseen_pending:
                break
            batch = crawl_coverage.prioritize(unseen_pending, min(4, MAX_PAGES - len(pages)), covered)
            if not batch:
                break
            await _process_batch(batch)
            pending = [l for l in pending if _norm(l["url"]) not in seen]

    # Deduplicate pages by normalized URL
    unique_pages: list[dict] = []
    seen_urls: set[str] = set()
    for p in pages:
        p_norm = _norm(p.get("url", ""))
        if p_norm and p_norm not in seen_urls:
            seen_urls.add(p_norm)
            unique_pages.append(p)
    pages = unique_pages[:MAX_PAGES]

    coverage = crawl_coverage.coverage_report(pages, discovered, failed)
    coverage["budget_exhausted"] = bool(pending)
    if pages:
        pages[0]["crawl_coverage"] = coverage
    logger.info("%s", json.dumps({"event": "crawl_coverage", "url": base_url, **coverage}))
    return pages


# ─────────────────────────── Seed URL Fetcher ──────────────────────────

async def fetch_seed_pages(
    seed_urls: list,           # list[SeedUrl] from config.domain_trust
    existing_urls: set[str],
    max_seed_pages: int = 5,
) -> list[dict]:
    """
    Fetch DDG-discovered seed URLs that are not already in the crawled set.
    """
    if not seed_urls:
        return []

    def _norm(u: str) -> str:
        return u.split("#")[0].rstrip("/")

    norm_existing = {_norm(u) for u in existing_urls}

    candidates = []
    for seed in seed_urls:
        url = seed.url
        if _norm(url) in norm_existing:
            continue
        if not is_safe_url(url):
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
                allowed = await _is_allowed_by_robots(seed.url, client)
                if not allowed:
                    return {"url": seed.url, "title": "", "text": "", "method": "disallowed", "tier": seed.tier, "confidence": seed.confidence}
                return await asyncio.wait_for(
                    fetch_page(seed.url, client, tier=seed.tier, confidence=seed.confidence),
                    timeout=CRAWL_BUDGET / 3,
                )
            except Exception as e:
                logger.warning(f"Error fetching seed URL {seed.url}: {e}")
                return {"url": seed.url, "title": "", "text": "", "method": "error", "tier": seed.tier, "confidence": seed.confidence}

        results = await asyncio.gather(*[_fetch_seed(s) for s in candidates], return_exceptions=True)
        seed_pages = [r for r in results if isinstance(r, dict) and r.get("text")]

    logger.info(
        '{"event": "seed_pages_fetched", "count": %d, "requested": %d}',
        len(seed_pages),
        len(candidates),
    )
    return seed_pages
