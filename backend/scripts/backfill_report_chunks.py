"""Refresh one historical report with newly verified website evidence.

Usage: python scripts/backfill_report_chunks.py REPORT_ID
Old raw_profile website blobs lack extraction provenance and are never indexed.
This command recrawls the submitted website. Uploaded documents and notes can
be reused because their provenance is the explicit user upload/input.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import database as db
from app.services import rag_engine, scraper


async def backfill(report_id: str, force: bool) -> None:
    report = await db.get_report(report_id)
    if not report:
        raise SystemExit(f"Report {report_id} was not found")
    existing = await db.get_report_chunks(report_id)
    if existing and not force:
        print(f"Report {report_id} already has {len(existing)} saved chunks; pass --force to rebuild")
        return
    inputs = report.get("input_urls") or {}
    profile = report.get("raw_profile") or {}
    urls = [url for url in [inputs.get("website"), *(inputs.get("other") or [])] if url]
    pages = []
    if inputs.get("website"):
        pages.extend(await scraper.crawl_website(inputs["website"]))
        if not pages:
            raise SystemExit("Website refresh failed; legacy text was not indexed")
    if inputs.get("other"):
        import httpx
        async with httpx.AsyncClient(follow_redirects=True) as client:
            for url in inputs["other"]:
                if scraper.is_safe_url(url):
                    page = await scraper.fetch_page(url, client, tier="user_submitted")
                    if page.get("evidence"):
                        pages.append(page)
    chunks = rag_engine.build_report_chunks(
        report_id, pages, profile.get("documents") or [],
        inputs.get("business_description"), urls,
    )
    await db.replace_report_chunks(report_id, chunks)
    embedded = await rag_engine.ingest_report_chunks(report_id, chunks)
    print(f"Report {report_id}: saved {len(chunks)} chunks; indexed {embedded} in Pinecone")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report_id")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    asyncio.run(backfill(args.report_id, args.force))
