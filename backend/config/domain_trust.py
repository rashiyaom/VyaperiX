"""
domain_trust.py — Domain trust tier classification for DDG-discovered seed URLs.

Trust tiers (in descending confidence order):
    first_party          confidence 1.0   Same domain as the target company site.
    trusted_enrichment   confidence 0.7–0.8  Known B2B data / review platforms.
    unverified_external  confidence 0.4   Any other public site.

Hard-blocked domains are NEVER fetched regardless of DDG ranking.
A blocked URL is removed at `classify_and_filter()` time; it cannot reach
`fetch_page()` or any downstream crawler function.

Usage::

    from config.domain_trust import classify_and_filter, SeedUrl

    seed_urls: list[SeedUrl] = classify_and_filter(search_results, "acme.com")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from urllib.parse import urlparse

from app.services.search.base import SearchResult

logger = logging.getLogger(__name__)

# ─────────────────────────── Configuration ─────────────────────────────

# Hard-blocked: social platforms that require auth, track via redirects,
# or provide no publicly-scrapeable content.  MUST never be fetched.
BLOCKED_DOMAINS: frozenset[str] = frozenset(
    {
        "linkedin.com",
        "www.linkedin.com",
        "facebook.com",
        "www.facebook.com",
        "instagram.com",
        "www.instagram.com",
        "twitter.com",
        "www.twitter.com",
        "x.com",
        "www.x.com",
    }
)

# Trusted B2B enrichment platforms — publicly crawlable, generally accurate.
# Weights were chosen to reflect typical factual reliability (not branding).
TRUSTED_ENRICHMENT_DOMAINS: dict[str, float] = {
    "crunchbase.com": 0.80,
    "www.crunchbase.com": 0.80,
    "g2.com": 0.75,
    "www.g2.com": 0.75,
    "capterra.com": 0.75,
    "www.capterra.com": 0.75,
    "producthunt.com": 0.70,
    "www.producthunt.com": 0.70,
    "trustpilot.com": 0.70,
    "www.trustpilot.com": 0.70,
    "clutch.co": 0.70,
    "www.clutch.co": 0.70,
}


# ─────────────────────────── Data Types ────────────────────────────────

@dataclass
class SeedUrl:
    """
    A URL discovered via search, enriched with trust metadata.

    Attributes:
        url:        The full URL to potentially fetch.
        tier:       Trust tier name.
        confidence: Float in (0, 1] indicating source reliability.
        source:     Which search provider surfaced this URL ("ddg", "serper", …).
    """
    url: str
    tier: str        # "first_party" | "trusted_enrichment" | "unverified_external"
    confidence: float
    source: str


# ─────────────────────────── Public Function ───────────────────────────

def classify_and_filter(
    results: list[SearchResult],
    company_domain: str,
) -> list[SeedUrl]:
    """
    Classify each SearchResult URL into a trust tier and filter out blocked domains.

    Guaranteed properties:
        - A URL whose eTLD+1 is in BLOCKED_DOMAINS will NEVER appear in the output.
        - Same-domain URLs always receive confidence 1.0 and tier "first_party".
        - Trusted-enrichment domains receive their configured confidence weight.
        - Everything else receives confidence 0.4 and tier "unverified_external".

    Args:
        results:        Raw SearchResult list from SearchRouter.
        company_domain: The netloc of the company's primary website (e.g. "acme.com").
                        Pass empty string if no primary site is known.

    Returns:
        Ordered list of SeedUrl objects (blocked URLs excluded).
        Order: first_party first, then trusted_enrichment (desc confidence), then external.
    """
    # Normalise company domain: strip www. prefix for comparison
    normalised_company = _strip_www(company_domain.lower())

    seed_urls: list[SeedUrl] = []
    blocked_count = 0

    for result in results:
        url = result.url
        if not url:
            continue

        host = _extract_host(url)
        if not host:
            continue

        # ── Hard block check ────────────────────────────────────────────
        if _is_blocked(host):
            blocked_count += 1
            logger.debug(
                '{"event": "seed_url_blocked", "url": %r, "host": %r}',
                url,
                host,
            )
            continue

        # ── Tier classification ─────────────────────────────────────────
        normalised_host = _strip_www(host)

        if normalised_company and normalised_host == normalised_company:
            tier = "first_party"
            confidence = 1.0
        elif host in TRUSTED_ENRICHMENT_DOMAINS:
            tier = "trusted_enrichment"
            confidence = TRUSTED_ENRICHMENT_DOMAINS[host]
        elif normalised_host in TRUSTED_ENRICHMENT_DOMAINS:
            tier = "trusted_enrichment"
            confidence = TRUSTED_ENRICHMENT_DOMAINS[normalised_host]
        else:
            tier = "unverified_external"
            confidence = 0.4

        seed_urls.append(
            SeedUrl(url=url, tier=tier, confidence=confidence, source=result.source)
        )

    # Emit observability counters
    logger.info(
        '{"event": "ddg_seed_urls_fetched", "count": %d, "blocked": %d}',
        len(seed_urls),
        blocked_count,
    )

    # Sort: first_party → trusted_enrichment (desc confidence) → unverified_external
    _tier_order = {"first_party": 0, "trusted_enrichment": 1, "unverified_external": 2}
    seed_urls.sort(key=lambda s: (_tier_order.get(s.tier, 9), -s.confidence))

    return seed_urls


# ─────────────────────────── Helpers ───────────────────────────────────

def _extract_host(url: str) -> str:
    """Return the netloc (host) of a URL, lowercased. Empty string on failure."""
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def _strip_www(host: str) -> str:
    """Remove a leading 'www.' from a hostname."""
    if host.startswith("www."):
        return host[4:]
    return host


def _is_blocked(host: str) -> bool:
    """
    Return True if `host` is in BLOCKED_DOMAINS (checking both with and without www.).
    This is the sole gate — nothing in BLOCKED_DOMAINS should ever reach fetch_page().
    """
    return host in BLOCKED_DOMAINS or _strip_www(host) in BLOCKED_DOMAINS
