"""Evidence extraction: never mine raw HTML for numbers or supposed facts.

Trust here means traceable to a publisher's labeled content, not independently
verified truth. Keep this distinction in consumers and in product copy.

Contact-info policy (fixes Stripe hallucination, 2026-09-23):
  Phone numbers are accepted ONLY from:
    1. Visible <a href="tel:…"> links in the DOM (after script/style removal).
    2. schema.org JSON-LD with "telephone" key inside a trusted @type block.
  Numbers seen only inside <script>, CSS, SVG, example text, or data attributes
  are silently dropped.  A 10-digit-plus string outside those two sources is NOT
  treated as a phone number regardless of context.
"""
import hashlib
import json
import re

from lxml import html

EXTRACTION_VERSION = 3
TRUSTED_KINDS = {"visible_context", "semantic_element", "schema_org", "meta", "uploaded_document", "user_note"}


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def evidence_record(url: str, text: str, kind: str, locator: str) -> dict:
    return {"id": hashlib.sha256(f"{url}|{locator}|{text}".encode()).hexdigest()[:24],
            "text": text, "kind": kind, "locator": locator, "url": url,
            "extraction_version": EXTRACTION_VERSION}


def is_trusted(record: dict) -> bool:
    return (record.get("extraction_version") == EXTRACTION_VERSION
            and record.get("kind") in TRUSTED_KINDS
            and bool(record.get("text", "").strip()) and bool(record.get("locator")))


def extract_evidence(raw_html: str, url: str) -> dict:
    if not raw_html.strip():
        return {"title": "", "evidence": [], "text": "", "headings": []}
    try:
        root = html.fromstring(raw_html)
    except (ValueError, TypeError):
        return {"title": "", "evidence": [], "text": "", "headings": []}
    tree = root.getroottree()
    title = clean(" ".join(root.xpath("//title/text()")))
    records, seen = [], set()

    def add(text, kind, locator):
        text = clean(text)
        if text and text not in seen:
            seen.add(text)
            records.append(evidence_record(url, text, kind, locator))

    for node in root.xpath("//meta[@content]"):
        label = (node.get("name") or node.get("property") or "").lower()
        if label in {"description", "og:description", "og:title", "author"}:
            add(f"{label}: {node.get('content')}", "meta", tree.getpath(node))

    # Keep nested labels (offers, address, FAQ answers) rather than flattening
    # isolated values. Arbitrary application state is never read as JSON-LD.
    def schema_objects(value, schema_context=False):
        if isinstance(value, list):
            for item in value:
                yield from schema_objects(item, schema_context)
        elif isinstance(value, dict):
            context = value.get("@context", "")
            trusted = schema_context or bool(re.search(r"https?://schema\.org(?:[\"/]|$)", json.dumps(context)))
            if trusted and value.get("@type"):
                allowed = {"@type", "name", "headline", "description", "telephone", "email", "address",
                           "offers", "price", "priceCurrency", "availability", "openingHours", "openingHoursSpecification",
                           "mainEntity", "acceptedAnswer", "text", "datePublished", "dateModified", "author",
                           "hasMerchantReturnPolicy", "shippingDetails", "areaServed", "hasOfferCatalog"}
                selected = {k: v for k, v in value.items() if k in allowed}
                if len(selected) > 1:
                    yield selected
            if "@graph" in value:
                yield from schema_objects(value["@graph"], trusted)

    for node in root.xpath('//script[@type="application/ld+json"]'):
        try:
            for data in schema_objects(json.loads(node.text or "")):
                add(json.dumps(data, ensure_ascii=False, sort_keys=True), "schema_org", tree.getpath(node))
        except (ValueError, TypeError):
            continue

    for node in list(root.iter()):
        if not isinstance(node.tag, str) or node.getparent() is None:
            continue
        style = re.sub(r"\s+", "", node.get("style", "").lower())
        markers = f"{node.get('id', '')} {node.get('class', '')}".lower().split()
        if (node.tag in {"script", "style", "noscript", "template", "svg", "head", "iframe", "nav"}
                or node.get("hidden") is not None or node.get("aria-hidden") == "true"
                or "display:none" in style or "visibility:hidden" in style
                or node.get("role") in {"navigation", "banner"}
                or set(markers) & {"advertisement", "ad-banner", "cookie-banner", "cookie-consent"}):
            node.getparent().remove(node)

    headings = [clean(n.text_content()) for n in root.xpath("//h1|//h2|//h3")]
    # ── Contact extraction: ONLY tel:/mailto: visible anchors ──────────────
    # We intentionally do NOT regex the full HTML for phone-like digit sequences.
    # Raw HTML contains phone numbers inside <script> blocks, demo forms, SVG,
    # CSS counters, and tracking pixels.  Returning those as facts is dishonest.
    for node in root.xpath('//a[starts-with(@href,"tel:") or starts-with(@href,"mailto:")]'):
        href = node.get("href", "")
        label = "Phone" if href.startswith("tel:") else "Email"
        raw_value = href.split(":", 1)[1].strip()
        if label == "Phone":
            # Accept only plausible phone strings: 7–15 digits (E.164 range),
            # optional leading +, spaces/hyphens/dots allowed.
            digits_only = re.sub(r"[^\d]", "", raw_value)
            if not (7 <= len(digits_only) <= 15):
                continue  # reject junk / tracking IDs lurking in tel: hrefs
        display_text = clean(node.text_content())
        value = f"{raw_value} ({display_text})" if display_text and display_text != raw_value else raw_value
        add(f"{label}: {value}", "semantic_element", tree.getpath(node))

    # Preserve full table headers with each row; amounts without column labels
    # cannot otherwise be interpreted safely after chunking.
    for table in root.xpath("//table"):
        headers = clean(" | ".join(table.xpath(".//th//text()")))
        for row in table.xpath(".//tr[td]"):
            add(f"{headers}\n{clean(row.text_content())}", "semantic_element", tree.getpath(row))

    blocks = root.xpath("//p|//li|//address|//dt|//dd|//h1|//h2|//h3|//h4|//h5|//h6|//article|//section|//div[not(div or p or section or article or ul or table)]")
    for node in blocks:
        if node.xpath("ancestor::table"):
            continue
        value = clean(node.text_content())
        previous = node.xpath("preceding::h1|preceding::h2|preceding::h3|preceding::h4")
        heading = clean(previous[-1].text_content()) if previous else ""
        # A short card may use separate elements for its heading and amount.
        parent = node.getparent()
        labeled = False
        if parent is not None and parent.tag not in {"body", "html"}:
            parent_text = clean(parent.text_content())
            if parent.xpath("./h2|./h3|./h4") and len(parent_text) < 2200:
                value = parent_text
                labeled = True
        if len(value) < 8 or (len(re.findall(r"[^\W\d_]+", value)) < 2 and not labeled):
            continue  # Isolated amounts/identifiers have no factual context.
        add(f"{heading}: {value}" if heading and heading != value else value,
            "visible_context", tree.getpath(node))

    # Fallback: if no blocks were captured from structured elements, extract readable paragraphs
    if not records:
        for chunk in root.xpath("//text()"):
            cleaned_chunk = clean(chunk)
            if len(cleaned_chunk) >= 20 and len(re.findall(r"[^\W\d_]+", cleaned_chunk)) >= 3:
                parent = chunk.getparent()
                locator = tree.getpath(parent) if parent is not None else "/html/body"
                add(cleaned_chunk, "visible_context", locator)

    return {"title": title, "headings": headings, "evidence": records,
            "text": "\n\n".join(r["text"] for r in records)}

