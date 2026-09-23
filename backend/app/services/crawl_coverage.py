"""Generic, balanced page discovery and explicit coverage accounting."""
import re
from urllib.parse import urljoin, urlparse, urlunparse

from lxml import html

CATEGORIES = {
    "pricing": ("pricing", "prices", "plans", "billing"),
    "contact": ("contact", "support", "locations", "visit"),
    "faq": ("faq", "faqs", "questions", "help"),
    "integrations": ("integrations", "connections", "connectors"),
    "policies": ("refund", "returns", "shipping", "privacy", "terms", "policy", "policies"),
    "company": ("about", "company", "team", "story"),
    "products": ("products", "services", "features", "solutions", "catalog"),
}


def categories(*signals: str) -> list[str]:
    words = set(re.findall(r"[a-z]+", " ".join(signals).lower()))
    return [category for category, terms in CATEGORIES.items() if words.intersection(terms)]


def discover_links(base_url: str, raw_html: str) -> list[dict]:
    try:
        root = html.fromstring(raw_html)
    except (ValueError, TypeError):
        return []
    host = (urlparse(base_url).hostname or "").removeprefix("www.")
    found = {}
    for node in root.xpath("//a[@href]"):
        parsed = urlparse(urljoin(base_url, node.get("href")))
        if parsed.scheme not in {"http", "https"} or (parsed.hostname or "").removeprefix("www.") != host:
            continue
        if re.search(r"\.(?:pdf|zip|jpg|png|mp4|css|js)$", parsed.path, re.I):
            continue
        url = urlunparse(parsed._replace(fragment=""))
        label = " ".join(node.text_content().split())
        found[url] = {"url": url, "label": label,
                      "categories": categories(parsed.path, label, node.get("title", ""))}
    return list(found.values())


def prioritize(links: list[dict], limit: int, covered=()) -> list[dict]:
    pending = {link["url"]: link for link in links}
    selected, represented = [], set(covered)
    while pending and len(selected) < limit:
        ordered = sorted(pending.values(), key=lambda x: (
            -len(set(x["categories"]) - represented), -len(x["categories"]), len(urlparse(x["url"]).path), x["url"]))
        best = ordered[0]
        selected.append(best)
        represented.update(best["categories"])
        pending.pop(best["url"])
    return selected


def coverage_report(pages: list[dict], discovered: list[dict], failed: list[str]) -> dict:
    found = {name: [] for name in CATEGORIES}
    for page in pages:
        for name in page.get("categories", []):
            found[name].append(page["url"])
    return {"found": {k: v for k, v in found.items() if v},
            "missing": [k for k, v in found.items() if not v],
            "discovered": {k: sorted({l["url"] for l in discovered if k in l["categories"]}) for k in CATEGORIES},
            "failed_urls": sorted(set(failed)), "pages_fetched": len(pages),
            "note": "Missing means not captured in this crawl, not necessarily absent from the website."}
