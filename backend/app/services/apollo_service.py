"""
apollo_service.py — Apollo.io B2B Intelligence Integration for VyaperiX.

Capabilities:
- Real-time Company & Organization Firmographic Enrichment (POST https://api.apollo.io/v1/organizations/enrich).
- Resolves verified corporate phone numbers, primary domains, employee headcounts, tech stacks,
  and social profiles (LinkedIn, Twitter).
- In-memory TTL caching to preserve API rate limits and minimize redundant requests.
- Graceful fallback when domain is missing or enrichment fails.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional
import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("vyepari.apollo")

APOLLO_API_BASE = "https://api.apollo.io/v1"
_ENRICH_CACHE: Dict[str, Dict[str, Any]] = {}


def get_apollo_api_key() -> str:
    """Retrieve Apollo API key from environment."""
    load_dotenv(override=True)
    return (os.getenv("APOLLO_API_KEY") or "XHIletZ7CKZWGeK4LOCatA").strip()


def clean_domain(raw_url_or_domain: str) -> str:
    """
    Extracts a clean, canonical domain name from a URL or raw string.
    Examples:
        'https://www.stripe.com/about' -> 'stripe.com'
        'http://sub.orientbell.com/'   -> 'orientbell.com'
        'linkedin.com/company/abc'     -> '' (skips social hostnames)
    """
    if not raw_url_or_domain:
        return ""
    d = raw_url_or_domain.strip().lower()
    # Strip protocol
    d = re.sub(r"^https?://", "", d)
    # Strip paths / query
    d = d.split("/")[0].split("?")[0].strip()
    # Strip www.
    if d.startswith("www."):
        d = d[4:]

    # Ignore generic social/search platforms
    ignored_hosts = {
        "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
        "youtube.com", "github.com", "google.com", "duckduckgo.com", "bing.com",
    }
    if d in ignored_hosts or not d or "." not in d:
        return ""
    return d


class ApolloService:
    """
    Client for Apollo.io B2B intelligence enrichment.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (api_key or get_apollo_api_key()).strip()

    async def enrich_organization(self, domain_or_url: str) -> Dict[str, Any]:
        """
        Enrich a company by domain using Apollo's organization enrichment API.
        Returns normalized firmographic data.
        """
        domain = clean_domain(domain_or_url)
        if not domain:
            logger.debug(f"Apollo: Skipped invalid/empty domain '{domain_or_url}'")
            return self._empty_enrichment(domain_or_url)

        # Check in-memory cache
        if domain in _ENRICH_CACHE:
            logger.debug(f"Apollo: Cache hit for domain '{domain}'")
            return _ENRICH_CACHE[domain]

        if not self.api_key:
            logger.warning("Apollo: APOLLO_API_KEY not configured. Returning empty profile.")
            return self._empty_enrichment(domain)

        url = f"{APOLLO_API_BASE}/organizations/enrich"
        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self.api_key,
        }
        params = {"domain": domain}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, params=params)

                if resp.status_code == 200:
                    data = resp.json()
                    org = data.get("organization") or {}
                    if not org:
                        logger.info(f"Apollo: No organization found for '{domain}'")
                        result = self._empty_enrichment(domain)
                        _ENRICH_CACHE[domain] = result
                        return result

                    # Extract tech stack
                    tech_list: List[str] = []
                    raw_tech = org.get("current_technologies") or []
                    for t in raw_tech:
                        if isinstance(t, dict) and t.get("name"):
                            tech_list.append(str(t["name"]))
                        elif isinstance(t, str):
                            tech_list.append(t)

                    # Extract primary corporate phone
                    phone = (
                        org.get("sanitized_phone")
                        or org.get("phone")
                        or org.get("raw_address")
                        or ""
                    )
                    # Clean up phone if it's text
                    if phone and not re.search(r"\d{5,}", phone):
                        phone = ""

                    result = {
                        "found": True,
                        "apollo_id": org.get("id"),
                        "name": org.get("name") or domain.capitalize(),
                        "domain": domain,
                        "website_url": org.get("website_url") or f"https://{domain}",
                        "linkedin_url": org.get("linkedin_url") or "",
                        "twitter_url": org.get("twitter_url") or "",
                        "phone": phone,
                        "estimated_num_employees": org.get("estimated_num_employees"),
                        "annual_revenue": org.get("annual_revenue_printed") or org.get("annual_revenue"),
                        "industry": org.get("industry") or "",
                        "sub_industry": org.get("sub_industry") or "",
                        "city": org.get("city") or "",
                        "state": org.get("state") or "",
                        "country": org.get("country") or "",
                        "logo_url": org.get("logo_url") or "",
                        "short_description": org.get("short_description") or org.get("seo_description") or "",
                        "technologies": tech_list[:12],
                        "keywords": (org.get("keywords") or [])[:10],
                    }
                    _ENRICH_CACHE[domain] = result
                    logger.info(f"Apollo: Enriched '{domain}' ({result['name']}) successfully. Phone: {result['phone'] or 'N/A'}")
                    return result
                else:
                    logger.warning(
                        f"Apollo: Enrichment for '{domain}' returned HTTP {resp.status_code}: {resp.text[:200]}"
                    )
                    fallback = self._empty_enrichment(domain)
                    _ENRICH_CACHE[domain] = fallback
                    return fallback

        except Exception as e:
            logger.error(f"Apollo: Exception during enrichment for '{domain}': {e}")
            return self._empty_enrichment(domain)

    def _empty_enrichment(self, domain: str) -> Dict[str, Any]:
        """Fallback record when Apollo returns no match or fails."""
        clean_name = domain.split(".")[0].capitalize() if domain else "Lead Prospect"
        return {
            "found": False,
            "apollo_id": None,
            "name": clean_name,
            "domain": domain,
            "website_url": f"https://{domain}" if domain else "",
            "linkedin_url": "",
            "twitter_url": "",
            "phone": "",
            "estimated_num_employees": None,
            "annual_revenue": None,
            "industry": "",
            "sub_industry": "",
            "city": "",
            "state": "",
            "country": "",
            "logo_url": "",
            "short_description": "",
            "technologies": [],
            "keywords": [],
        }

    async def search_organizations(
        self,
        keywords: Any,
        location: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Directly query Apollo.io organizations/search API.
        Retrieves authentic corporate profiles, verified switchboard phones, domains, and locations.
        """
        if not self.api_key:
            logger.warning("Apollo: APOLLO_API_KEY not configured for search.")
            return []

        keyword_list = [keywords] if isinstance(keywords, str) else list(keywords or [])
        clean_tags: List[str] = []
        for k in keyword_list:
            if not k:
                continue
            parts = re.split(r"[,&/|]+|\band\b", str(k), flags=re.IGNORECASE)
            for p in parts:
                p_clean = p.strip()
                if len(p_clean) > 1 and p_clean.lower() not in ("b2b", "commercial", "enterprise", "solutions"):
                    clean_tags.append(p_clean)

        tags = list(dict.fromkeys(clean_tags))[:6]

        norm_location = None
        if location and str(location).strip():
            raw_loc = str(location).strip()
            low_loc = raw_loc.lower()
            if any(term in low_loc for term in ["pan-india", "all india", "national", "pan india", "bharat"]):
                norm_location = "India"
            elif low_loc in ("global", "worldwide", "any", "all", "none"):
                norm_location = None
            else:
                norm_location = raw_loc

        url = f"{APOLLO_API_BASE}/organizations/search"
        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self.api_key,
        }

        payload: Dict[str, Any] = {
            "page": 1,
            "per_page": min(max(limit, 5), 25),
        }
        if tags:
            payload["q_organization_keyword_tags"] = tags
        if norm_location:
            payload["organization_locations"] = [norm_location]

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    orgs = data.get("organizations") or []
                    results: List[Dict[str, Any]] = []

                    for org in orgs:
                        primary_domain = org.get("primary_domain") or ""
                        if not primary_domain and org.get("website_url"):
                            try:
                                primary_domain = org["website_url"].replace("https://", "").replace("http://", "").split("/")[0].replace("www.", "")
                            except Exception:
                                pass

                        primary_phone_obj = org.get("primary_phone") or {}
                        phone = (
                            primary_phone_obj.get("sanitized_number")
                            or primary_phone_obj.get("number")
                            or org.get("sanitized_phone")
                            or org.get("phone")
                            or ""
                        )
                        if phone and not re.search(r"\d{5,}", phone):
                            phone = ""

                        tech_list = []
                        for t in (org.get("current_technologies") or []):
                            if isinstance(t, dict) and t.get("name"):
                                tech_list.append(str(t["name"]))
                            elif isinstance(t, str):
                                tech_list.append(t)

                        domain = primary_domain
                        contact_email = org.get("email") or org.get("corporate_email") or ""
                        sales_email = org.get("sales_email") or ""

                        item = {
                            "found": True,
                            "apollo_id": org.get("id"),
                            "name": org.get("name") or (domain.capitalize() if domain else "Lead Prospect"),
                            "domain": domain,
                            "website_url": org.get("website_url") or (f"https://{domain}" if domain else ""),
                            "linkedin_url": org.get("linkedin_url") or "",
                            "twitter_url": org.get("twitter_url") or "",
                            "facebook_url": org.get("facebook_url") or "",
                            "phone": phone,
                            "email": contact_email,
                            "sales_email": sales_email,
                            "estimated_num_employees": org.get("estimated_num_employees"),
                            "annual_revenue": org.get("organization_revenue_printed") or org.get("annual_revenue_printed") or org.get("annual_revenue"),
                            "industry": org.get("industry") or "",
                            "city": org.get("city") or "",
                            "state": org.get("state") or "",
                            "country": org.get("country") or (location or "India"),
                            "raw_address": org.get("raw_address") or "",
                            "logo_url": org.get("logo_url") or "",
                            "technologies": tech_list[:10],
                            "keywords": (org.get("keywords") or [])[:8],
                        }
                        results.append(item)
                        if domain:
                            _ENRICH_CACHE[domain] = item

                    logger.info(f"Apollo: Discovered {len(results)} verified organizations for {tags} in {location}")
                    return results
                else:
                    logger.warning(f"Apollo: organizations/search returned HTTP {resp.status_code}: {resp.text[:200]}")
                    return []
        except Exception as e:
            logger.error(f"Apollo: Exception during organizations/search: {e}")
            return []


# Global singleton instance
apollo_service = ApolloService()
