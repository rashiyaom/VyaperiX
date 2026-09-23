"""Run fresh website crawls through the production chat service, with saved artifacts.

python scripts/evaluate_grounded_chat.py --url https://example.com --url https://another.example --categories 2
Creates evaluation-only chunk namespaces and JSON files; does not alter user reports.
"""
import argparse
import asyncio
import json
import logging
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core import database as db
from app.services import chat_evaluation as evaluation, rag_engine, scraper, chat_service


async def run(urls, category_limit, lexical_only=False):
    run_id = str(uuid.uuid4())
    output = Path(__file__).resolve().parents[1] / '.data' / 'evals' / f'grounding-{run_id}.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    artifact = {"run_id": run_id, "sites": [], "method": "Production scraper, canonical storage, Gemini embeddings, Pinecone retrieval, chat generation and validation."}

    def save():
        output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding='utf-8')

    sessions = []
    for url in urls:
        print(f'Crawling {url}', flush=True)
        pages = await scraper.crawl_website(url)
        if not pages:
            artifact['sites'].append({'url': url, 'error': 'No pages extracted'})
            save()
            continue
        report_id = 'eval-' + str(uuid.uuid4())
        report = {'id': report_id, 'input_urls': {'website': url, 'files': []}}
        chunks = rag_engine.build_report_chunks(report_id, pages, [], None, [url])
        await db.replace_report_chunks(report_id, chunks)
        try:
            if lexical_only:
                raise rag_engine.RAGQuotaError('Embedding quota unavailable; lexical mode requested')
            indexed = await rag_engine.ingest_report_chunks(report_id, chunks)
            retrieval_mode = 'vector'
        except (rag_engine.RAGQuotaError, rag_engine.RAGIngestError, RuntimeError) as exc:
            indexed = 0
            retrieval_mode = 'lexical_fallback'
            print(f'Embedding unavailable ({type(exc).__name__}); evaluating lexical fallback', flush=True)
        site = {'url': url, 'report_id': report_id, 'pages': len(pages), 'chunks': len(chunks), 'indexed': indexed,
                'retrieval_mode': retrieval_mode,
                'coverage': pages[0].get('crawl_coverage'), 'rows': [], 'source_chunks': chunks}
        artifact['sites'].append(site)
        save()
        sessions.append((report, chunks, site))
        print(f'Indexed {len(chunks)} chunks from {len(pages)} pages', flush=True)

    # A real second stored report with a private document detects leakage even
    # when the user evaluates just one website. It is never in the target corpus.
    marker = 'private-' + uuid.uuid4().hex
    other = {'id': 'eval-' + str(uuid.uuid4()), 'input_urls': {'files': ['private-evaluation.txt']}}
    other_chunks = rag_engine.build_report_chunks(other['id'], [], [
        {'filename': 'private-evaluation.txt', 'content_text': f'The private evaluation access code is {marker}.'}], None, [])
    await db.replace_report_chunks(other['id'], other_chunks)
    if all(site.get('retrieval_mode') == 'vector' for site in artifact['sites']):
        try:
            await rag_engine.ingest_report_chunks(other['id'], other_chunks)
        except (rag_engine.RAGQuotaError, rag_engine.RAGIngestError, RuntimeError):
            pass
    if any(site.get('retrieval_mode') == 'lexical_fallback' for site in artifact['sites']):
        rag_engine.PINECONE_API_KEY = None
    for report, chunks, site in sessions:
        probes = await asyncio.to_thread(evaluation.generate_probes, chunks, category_limit)
        probes.append(evaluation.cross_session_probe(other, marker))
        site['generated_probes'] = probes
        save()
        for probe in probes:
            print(f"{site['url']} [{probe['category']}] {probe['question']}", flush=True)
            # The other report is actively queried concurrently with the probe.
            if probe['category'] == 'cross_session':
                row, _ = await asyncio.gather(evaluation.run_probe(report, chunks, probe),
                    chat_service.answer_report_question(other, 'What is the private evaluation access code?'), return_exceptions=True)
                if isinstance(row, Exception):
                    raise row
            else:
                row = await evaluation.run_probe(report, chunks, probe)
            site['rows'].append(row)
            site['metrics'] = evaluation.metrics(site['rows'])
            save()
            print(f"  {row['result']} ({row.get('confidence', 'error')}) {row['latency_seconds']}s", flush=True)
    artifact['metrics'] = evaluation.metrics([row for site in artifact['sites'] for row in site.get('rows', [])])
    complete = all(all(any(row['category'] == category and row['result'] != 'invalid_probe' for row in site.get('rows', []))
                       for category in ('exact', 'inferred', 'adversarial', 'cross_session'))
                   for site in artifact['sites'])
    artifact['verdict'] = 'needs_human_review' if complete and all(
        row['result'] == 'pass' for site in artifact['sites'] for row in site.get('rows', [])) else 'needs_tuning'
    save()
    print(json.dumps({'artifact': str(output), 'metrics': artifact['metrics']}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', action='append', required=True)
    parser.add_argument('--categories', type=int, default=3)
    parser.add_argument('--lexical', action='store_true', help='Evaluate fallback when embedding quota is unavailable')
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    asyncio.run(run(args.url, args.categories, args.lexical))
