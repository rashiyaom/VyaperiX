"""
normalizer.py — Combines scraped pages, uploaded documents, and business context
into a normalized intelligence profile.

Features:
- Proportional token budgeting so ALL uploaded documents (PDF, CSV, XLSX, etc.)
  are guaranteed inclusion.
- Formats clear document demarcation headers: [DOCUMENT 1 OF N], [DOCUMENT 2 OF N]
- Extracts company name from domain, page titles, or document headers.
- Accepts seeded_pages (DDG-discovered pages with trust-tier metadata) alongside
  first-party crawled pages.
- Sorts all pages by confidence (first_party → trusted_enrichment → unverified)
  before composing the LLM prompt.
- Embeds a literal reliability hierarchy note in profile_to_markdown() so the LLM
  knows how to adjudicate conflicting claims across sources.
"""

import re
from datetime import datetime, timezone
from urllib.parse import urlparse

# Global budget for Groq request
MAX_TOTAL_DOC_CHARS = 35000
MAX_PAGE_CHARS = 5000


def _guess_company_name(
    source_url: str | None,
    pages: list[dict],
    business_description: str | None = None,
    processed_docs: list[dict] | None = None,
) -> str:
    """Best-effort company name resolution with JSON-LD schema awareness."""
    for page in pages:
        semantic = page.get("semantic_elements") or {}
        # Check Schema.org organization name if present
        for s in semantic.get("json_ld_schemas", []):
            if "Organization" in s or "LocalBusiness" in s or "Corporation" in s:
                m = re.search(r"Name:\s*([^|]+)", s)
                if m:
                    cand = m.group(1).strip()
                    if cand and len(cand) < 60:
                        return cand

        title = page.get("title", "")
        if title and len(title) < 100:
            name = re.split(r"[|\-–—:]", title)[0].strip()
            # Clean common prefixes
            name = re.sub(r"^(?:Welcome to\s+|Home\s+-\s+|Official Site\s+of\s+)", "", name, flags=re.IGNORECASE).strip()
            if name and not name.lower().startswith(("home", "welcome", "index", "about us", "http", "untitled")):
                return name

    if source_url:
        domain = urlparse(source_url).netloc
        domain = re.sub(r"^www\.", "", domain)
        if domain:
            parts = domain.split(".")
            base = parts[0].title()
            if base.lower() not in ["netlify", "vercel", "github", "render", "app", "pages", "drive", "docs"]:
                return base

    if business_description:
        first_line = business_description.strip().split("\n")[0].strip()
        match = re.search(r"^(?:Company|Business|Name|Brand|Portfolio)?[:\-]?\s*([A-Za-z0-9\s&'.-]{2,40})", first_line, re.IGNORECASE)
        if match:
            extracted = match.group(1).strip()
            if len(extracted) > 1 and not extracted.lower().startswith(("i want", "we are", "i am", "a ", "the ")):
                return extracted

    if processed_docs:
        ignored_prefixes = {
            "business", "analytics", "sales", "profile", "report", "deck", "data", "sheet",
            "export", "pivot", "fy20", "fy21", "fy22", "fy23", "fy24", "fy25", "q1", "q2",
            "q3", "q4", "table", "ledger", "financial", "finance", "revenue", "pipeline",
            "sample", "untitled", "test", "book", "extract"
        }
        for doc in processed_docs:
            fname = doc.get("filename", "")
            base = re.sub(r"\.[^.]+$", "", fname)
            clean = re.sub(r"[_\-]+", " ", base).strip().title()
            words = clean.split()
            if words and len(words[0]) > 2 and words[0].lower() not in ignored_prefixes:
                return clean[:40]

    return "Business Entity"


def _truncate_text(text: str, max_chars: int) -> str:
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    last_nl = cut.rfind("\n")
    if last_nl > int(max_chars * 0.75):
        cut = cut[:last_nl]
    return cut + "\n[...content truncated for token budget...]"


def _tier_sort_key(page: dict) -> tuple[int, float]:
    """Sort key: first_party (0) → trusted_enrichment (1) → unverified_external (2), then desc confidence."""
    tier_order = {"first_party": 0, "trusted_enrichment": 1, "unverified_external": 2}
    tier = page.get("tier", "unverified_external")
    confidence = page.get("confidence", 0.4)
    return (tier_order.get(tier, 2), -confidence)


def build_profile(
    source_url: str | None = None,
    pages: list[dict] | None = None,
    seeded_pages: list[dict] | None = None,
    linkedin_url: str | None = None,
    extra_links: list[str] | None = None,
    ddg_snippets: list[dict] | None = None,
    business_description: str | None = None,
    processed_docs: list[dict] | None = None,
) -> dict:
    """
    Build a normalized intelligence profile.

    Args:
        pages:        First-party crawled pages (tier="first_party", confidence=1.0).
        seeded_pages: DDG-discovered pages with trust-tier metadata (may be any tier).
        ddg_snippets: Legacy — raw DDG snippets (title/url/body only, no full fetch).
                      Kept for backward-compatibility; prefer seeded_pages.
        (other args unchanged from v1)
    """
    pages = pages or []
    seeded_pages = seeded_pages or []
    processed_docs = processed_docs or []

    # Merge first-party and seeded pages, de-duplicate by URL
    seen_urls: set[str] = set()
    all_pages: list[dict] = []
    for p in pages:
        url = p.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            # Ensure first-party defaults if tier/confidence not set
            p.setdefault("tier", "first_party")
            p.setdefault("confidence", 1.0)
            all_pages.append(p)

    for p in seeded_pages:
        url = p.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            all_pages.append(p)

    # Sort by confidence tier before composing (highest confidence first)
    all_pages.sort(key=_tier_sort_key)

    company_name = _guess_company_name(source_url, all_pages, business_description, processed_docs)

    # Calculate per-document character quota so every document is guaranteed inclusion
    num_docs = max(len(processed_docs), 1)
    per_doc_quota = max(int(MAX_TOTAL_DOC_CHARS / num_docs), 4000)

    formatted_docs = []
    for doc in processed_docs:
        fname = doc.get("filename", "Uploaded File")
        ftype = doc.get("doc_type", "document")
        fsize_kb = round(doc.get("size_bytes", 0) / 1024, 1)
        content = doc.get("content_text") or doc.get("content", "")
        err = doc.get("error")

        doc_entry = {
            "filename": fname,
            "doc_type": ftype,
            "size_kb": fsize_kb,
            "error": err,
            "source": doc.get("source", "user_upload"),
            "extraction_method": doc.get("extraction_method"),
            "confidence": doc.get("confidence", 1.0 if not err else 0.0),
            "content": _truncate_text(content, per_doc_quota) if not err else f"(Error: {err})",
        }
        formatted_docs.append(doc_entry)

    clean_pages = []
    for p in all_pages:
        t = p.get("text", "").strip()
        if t:
            clean_pages.append({
                "url": p.get("url", ""),
                "title": p.get("title", ""),
                "text": _truncate_text(t, MAX_PAGE_CHARS),
                "extraction_version": p.get("extraction_version"),
                "categories": p.get("categories", []),
                "crawl_coverage": p.get("crawl_coverage"),
                "tier": p.get("tier", "first_party"),
                "confidence": p.get("confidence", 1.0),
            })

    return {
        "source_url": source_url or "",
        "company_name": company_name,
        "business_description": business_description or "",
        "documents": formatted_docs,
        "pages": clean_pages,
        "crawl_coverage": [p["crawl_coverage"] for p in all_pages if p.get("crawl_coverage")],
        "linkedin_url": linkedin_url,
        "extra_links": extra_links or [],
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "page_count": len(clean_pages),
        "doc_count": len(formatted_docs),
    }


def profile_to_markdown(profile: dict) -> str:
    """
    Format a multi-source intelligence dossier guaranteeing every attached
    document and crawled web page is distinctly highlighted.

    Includes a literal reliability hierarchy note so the LLM can correctly
    adjudicate conflicting claims across sources of differing confidence.
    """
    lines = []
    company = profile.get("company_name", "Target Company")
    lines.append(f"# INTELLIGENCE DOSSIER: {company}")

    if profile.get("source_url"):
        lines.append(f"**Primary Website:** {profile.get('source_url')}")
    if profile.get("business_description"):
        lines.append(f"\n### User-Provided Context & Objectives:\n{profile['business_description'].strip()}")

    docs = profile.get("documents", [])
    if docs:
        lines.append(f"\n=======================================================")
        lines.append(f"## ATTACHED DOCUMENTS ({len(docs)} TOTAL FILES ATTACHED)")
        lines.append(f"=======================================================")
        for i, doc in enumerate(docs, 1):
            fname = doc.get("filename", f"Doc_{i}")
            ftype = doc.get("doc_type", "doc").upper()
            content = doc.get("content", "")
            method = doc.get("extraction_method")
            conf = doc.get("confidence")
            meta_parts = []
            if method:
                meta_parts.append(f"extraction={method}")
            if conf is not None:
                meta_parts.append(f"confidence={conf:.2f}")
            meta_str = f" | {' | '.join(meta_parts)}" if meta_parts else ""
            lines.append(f"\n### >>> [DOCUMENT {i} OF {len(docs)}]: {fname} (Type: {ftype}{meta_str})")
            lines.append(content)
            lines.append(f"--- END OF DOCUMENT {i} ({fname}) ---\n")

    pages = profile.get("pages", [])
    if pages:
        lines.append(f"\n=======================================================")
        lines.append(f"## PUBLIC WEB ASSETS ({len(pages)} PAGES CRAWLED & PARSED)")
        lines.append(f"=======================================================")

        # ── RELIABILITY HIERARCHY NOTE ──────────────────────────────────
        # This literal text is intentionally included in the LLM prompt so the
        # model is explicitly instructed — not merely implicitly expected — to
        # prefer higher-confidence sources when claims conflict.
        lines.append("""
RELIABILITY NOTE FOR AI ANALYSIS:
Sources below are ordered by confidence tier. When claims conflict across sources,
YOU MUST prefer higher-confidence sources using the following hierarchy:
  TIER 1 — same-domain pages (confidence 1.0): treat as ground truth for all company facts.
  TIER 2 — trusted third-party sources (confidence 0.7-0.8, e.g. Crunchbase, G2, Capterra):
            treat as corroborating evidence; use to fill gaps not covered by Tier 1.
  TIER 3 — unverified external sources (confidence 0.4): treat as indicative only;
            do NOT rely on Tier 3 data without corroboration from Tier 1 or Tier 2.
If a Tier 3 source contradicts a Tier 1 source, explicitly note the discrepancy
rather than silently choosing one — flag it as "unverified claim from external source".
""")
        # ───────────────────────────────────────────────────────────────

        for i, page in enumerate(pages, 1):
            title = page.get("title", f"Page {i}")
            url = page.get("url", "")
            tier = page.get("tier", "first_party")
            confidence = page.get("confidence", 1.0)
            tier_label = {
                "first_party": "TIER 1 — Company Website",
                "trusted_enrichment": "TIER 2 — Trusted Third-Party",
                "unverified_external": "TIER 3 — Unverified External",
            }.get(tier, tier)
            lines.append(
                f"\n### [WEB PAGE {i} OF {len(pages)}]: {title} ({url})"
                f"\n[Source reliability: {tier_label} | confidence={confidence:.2f}]"
            )
            lines.append(page.get("text", ""))

    return "\n".join(lines)
