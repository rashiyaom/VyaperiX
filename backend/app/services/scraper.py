"""
scraper.py — Universal multi-page web scraper.

Layer 0 (search):   SearchRouter (DDG → Serper) — runs concurrently with homepage fetch in main.py
Layer 1 (fast):     httpx async + trafilatura  — works for ~60% of sites
Layer 2 (JS):       playwright headless Chromium — handles React/Vue/Angular SPAs
Link discovery:     Python stdlib html.parser — no BeautifulSoup dependency

Key features:
- SSRF guard (rejects localhost/internal IPs)
- robots.txt respect
- Keyword-scored page prioritization
- Domain trust tiers on every returned page dict (tier, confidence)
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
import re
import socket
import time
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura

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

MAX_PAGES = 15
STATIC_TIMEOUT = 12   # seconds per httpx request
CRAWL_BUDGET = 25     # total seconds for all pages
CONTENT_MIN_CHARS = 80  # below this we consider a page "near-empty" → trigger playwright


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


# ─────────────────────────── robots.txt ────────────────────────────────

def _is_allowed_by_robots(url: str) -> bool:
    """Return True if BizIntelBot is allowed to crawl this URL."""
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch("BizIntelBot", url)
    except Exception:
        return True  # if we can't read robots.txt, proceed


# ─────────────────────────── Static Fetch ──────────────────────────────

async def _fetch_static(url: str, client: httpx.AsyncClient) -> tuple[str | None, str | None]:
    """
    Fetch URL with httpx, extract main content with trafilatura.
    Returns (raw_html, extracted_text). Both can be None on failure.
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
        return raw_html, text
    except Exception as e:
        logger.warning(f"Static fetch failed for {url}: {e}")
        return None, None


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
            ctx = await browser.new_context(
                user_agent=HEADERS["User-Agent"],
                java_script_enabled=True,
                viewport={"width": 1280, "height": 800},
            )
            page = await ctx.new_page()
            await page.add_init_script("delete Object.getPrototypeOf(navigator).webdriver")
            await page.goto(url, timeout=30000, wait_until="networkidle")
            # Extra wait for late-loading SPAs
            await page.wait_for_timeout(1500)

            # Dismiss intro screens / splash loaders (e.g. "tap to skip", "enter")
            try:
                for selector in ["text=tap to skip", "text=skip", "text=enter", "text=explore", "button:has-text('Skip')", "button:has-text('Enter')"]:
                    elem = await page.query_selector(selector)
                    if elem:
                        await elem.click()
                        await page.wait_for_timeout(1500)
                        break
            except Exception:
                pass

            raw_html = await page.content()
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
    Fetch a single page using universal 2-layer strategy with semantic structure extraction.

    Args:
        url:        Target URL (already SSRF-checked by caller).
        client:     Shared httpx.AsyncClient.
        tier:       Trust tier from domain_trust classification.
        confidence: Confidence score (0 < x ≤ 1.0) from domain_trust.

    Returns:
        dict with keys: url, title, text, semantic_elements, method, tier, confidence
    """
    raw_html, text = await _fetch_static(url, client)
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
            "url": url, "title": "", "text": "",
            "semantic_elements": {}, "method": method,
            "tier": tier, "confidence": confidence,
        }

    # Extract rich semantic elements
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

    return {
        "url": url,
        "title": title,
        "text": combined_text.strip(),
        "semantic_elements": semantic,
        "method": method,
        "tier": tier,
        "confidence": confidence,
    }


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

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # Step 1: fetch homepage (first_party, confidence 1.0)
        homepage = await fetch_page(base_url, client, tier="first_party", confidence=1.0)
        if homepage["text"]:
            pages.append(homepage)

        # Step 2: extract internal links from homepage HTML
        try:
            resp = await client.get(base_url, headers=HEADERS, timeout=STATIC_TIMEOUT, follow_redirects=True)
            homepage_html = resp.text
        except Exception:
            homepage_html = ""

        links = extract_internal_links(base_url, homepage_html, limit=MAX_PAGES * 2)

        # Step 3: also try playwright links if homepage was JS-rendered
        if homepage.get("method") == "playwright":
            try:
                from playwright.async_api import async_playwright
                async with async_playwright() as p:
                    browser = await p.chromium.launch(headless=True)
                    page = await (await browser.new_context()).new_page()
                    await page.goto(base_url, timeout=30000, wait_until="networkidle")
                    js_html = await page.content()
                    await browser.close()
                    links = extract_internal_links(base_url, js_html, limit=MAX_PAGES * 2)
            except Exception:
                pass

        # Step 4: filter already-fetched and robots-disallowed, then crawl concurrently
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
                return {"url": url, "title": "", "text": "", "method": "timeout", "tier": "first_party", "confidence": 1.0}

        results = await asyncio.gather(*[_safe_fetch(u) for u in candidate_links])
        pages.extend([r for r in results if r["text"]])

    crawl_duration = time.monotonic() - crawl_start
    logger.info(
        '{"event": "crawl_stage_duration", "stage": "crawl", "seconds": %.2f, "pages": %d, "base_url": %r}',
        crawl_duration,
        len(pages),
        base_url,
    )
    logger.info(f"Crawled {len(pages)} pages from {base_url}")
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
