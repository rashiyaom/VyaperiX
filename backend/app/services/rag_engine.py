"""
rag_engine.py — Retrieval-Augmented Generation (RAG) engine for VyepariX.

Pipeline:
  1. Ingest: chunk document / scraped text → Gemini gemini-embedding-001 → Pinecone
  2. Retrieve: embed query → cosine search → top-k chunks back
  3. Generate: groq_client receives retrieved chunks, NOT the raw 35k profile

SDK: google-genai (new stable SDK, replaces deprecated google-generativeai)
Model: models/gemini-embedding-001 (verified available on this API key)

Design:
  - Per-report Pinecone namespace (rep-<report_id>) for strict isolation
  - Pinecone Vector Store — index survives server restarts,
    documents are never re-embedded unnecessarily (preserves Gemini free-tier quota)
  - LOUD FAILURE policy: Gemini quota/auth errors are raised immediately so the
    pipeline fails visibly — no silent degradation to raw-text Groq bypass.
    Transient or unexpected errors are also raised (not swallowed) so callers
    can handle them explicitly with full context.
  - Async-compatible: all blocking calls wrapped with asyncio.to_thread
  - Single composite synthesis query per analysis; chunk source breakdown is
    logged so you can detect when specific sections are systematically missing.
"""

import asyncio
import hashlib
import logging
import os
import re
import textwrap
import time
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ─────────────────────────── Config ────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_API_KEY_BACKUP = os.environ.get("GEMINI_API_KEY_BACKUP", "")
GEMINI_EMBED_MODEL = "models/gemini-embedding-001"
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "vyeparix-rag")
CHUNK_SIZE = 500  # approximate word/punctuation tokens
CHUNK_OVERLAP = 50
DEFAULT_TOP_K = 8

# ─────────────────────────── Custom Exceptions ─────────────────────────────

class RAGQuotaError(RuntimeError):
    """
    Raised when Gemini returns a quota-exceeded or authentication error.
    Callers should stop the analysis pipeline and alert — not silently degrade.
    """
    pass


class RAGIngestError(RuntimeError):
    """Raised when ingestion fails for a non-quota reason."""
    pass


class RAGRetrieveError(RuntimeError):
    """Raised when retrieval fails for a non-quota reason."""
    pass

# ─────────────────────────── Lazy Client Factories ─────────────────────────

_primary_embedding_key_paused_until = 0.0


def _get_gemini_client(api_key: str | None = None):
    """Return a configured google.genai Client."""
    try:
        from google import genai
        selected = api_key or GEMINI_API_KEY or GEMINI_API_KEY_BACKUP
        if not selected:
            raise RuntimeError("A Gemini embedding API key is not configured")
        # The SDK's default transport retries can stall a chat request for
        # minutes on quota errors. Bound each key attempt before failover.
        return genai.Client(api_key=selected, http_options={
            "timeout": 15000, "retry_options": {"attempts": 1},
        })
    except ImportError:
        raise RuntimeError(
            "google-genai is not installed. Run: pip3 install 'google-genai>=0.3.0'"
        )


def _get_pinecone_index():
    """Return the Pinecone index instance."""
    try:
        from pinecone import Pinecone
        if not PINECONE_API_KEY:
            raise RuntimeError("PINECONE_API_KEY not set in .env")
        pc = Pinecone(api_key=PINECONE_API_KEY)
        return pc.Index(PINECONE_INDEX_NAME)
    except ImportError:
        raise RuntimeError(
            "pinecone is not installed. Run: pip3 install 'pinecone>=5.0.0'"
        )


# ─────────────────────────── Chunking ──────────────────────────────────────

_TOKEN_RE = re.compile(r"\w+|[^\w\s]", re.UNICODE)


def _token_count(text: str) -> int:
    """Local token estimate; exact Gemini tokenization is not needed for chunk bounds."""
    return len(_TOKEN_RE.findall(text))


def _split_on_tokens(text: str, limit: int) -> list[str]:
    spans = list(_TOKEN_RE.finditer(text))
    if len(spans) <= limit:
        return [text.strip()]
    return [
        text[spans[start].start():spans[min(start + limit, len(spans)) - 1].end()].strip()
        for start in range(0, len(spans), limit)
    ]


def _tail_tokens(text: str, count: int) -> str:
    spans = list(_TOKEN_RE.finditer(text))
    if not spans:
        return ""
    return text[spans[max(0, len(spans) - count)].start():].strip()


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Make roughly 300–500 token chunks, keeping paragraphs and sentences together."""
    if not text or not text.strip():
        return []
    if chunk_size <= overlap or overlap < 0:
        raise ValueError("chunk_size must exceed a nonnegative overlap")

    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    unit_limit = chunk_size - overlap
    units: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if _token_count(paragraph) <= unit_limit:
            units.append(paragraph)
            continue
        # Split long paragraphs at sentence boundaries before splitting words.
        sentences = re.split(r"(?<=[.!?])\s+|\n+", paragraph)
        sentence_group = ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            for piece in _split_on_tokens(sentence, unit_limit):
                candidate = f"{sentence_group} {piece}".strip() if sentence_group else piece
                if sentence_group and _token_count(candidate) > unit_limit:
                    units.append(sentence_group)
                    sentence_group = piece
                else:
                    sentence_group = candidate
        if sentence_group:
            units.append(sentence_group)

    chunks: list[str] = []
    current = ""
    for unit in units:
        candidate = f"{current}\n\n{unit}".strip() if current else unit
        if current and _token_count(candidate) > chunk_size:
            chunks.append(current)
            carry = _tail_tokens(current, overlap)
            current = f"{carry}\n\n{unit}".strip() if carry else unit
        else:
            current = candidate
    if current:
        chunks.append(current)
    return [chunk for chunk in chunks if chunk.strip()]


# ─────────────────────────── Embedding ─────────────────────────────────────

def _embed_texts_sync(texts: list, task_type: str = "RETRIEVAL_DOCUMENT") -> list:
    """
    Embed a list of texts using Gemini gemini-embedding-001.
    Uses the new google.genai SDK (batch embed endpoint).
    Returns list of float vectors.

    Raises RAGQuotaError on quota/auth failures (caller must not silently degrade).
    Raises RuntimeError on other unexpected API failures.
    """
    global _primary_embedding_key_paused_until
    keys = [("primary", GEMINI_API_KEY), ("backup", GEMINI_API_KEY_BACKUP)]
    keys = [(label, key) for label, key in keys if key and (label != "primary" or time.monotonic() >= _primary_embedding_key_paused_until)]
    if not keys:
        keys = [("backup", GEMINI_API_KEY_BACKUP)] if GEMINI_API_KEY_BACKUP else [("primary", GEMINI_API_KEY)]
    if not keys[0][1]:
        raise RAGQuotaError("No Gemini embedding API key is configured")
    vectors = []

    batch_size = 100  # Gemini batch limit
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        result = None
        for label, key in keys:
            try:
                client = _get_gemini_client(key)
                result = client.models.embed_content(
                    model=GEMINI_EMBED_MODEL,
                    contents=batch,
                    config={"task_type": task_type},
                )
                if label == "backup":
                    keys = [("backup", key)]
                break
            except Exception as e:
                err_str = str(e).lower()
                quota_or_auth = any(kw in err_str for kw in (
                    "quota", "rate limit", "resource_exhausted", "429",
                    "api_key", "permission", "unauthenticated", "403", "401",
                ))
                if quota_or_auth:
                    logger.warning("Gemini embedding %s key unavailable (%s); checking next configured key", label, type(e).__name__)
                    if label == "primary" and GEMINI_API_KEY_BACKUP:
                        _primary_embedding_key_paused_until = time.monotonic() + 900
                    continue
                raise RuntimeError(
                    f"[RAG] Gemini embedding unexpected {type(e).__name__}"
                ) from e
        if result is None:
            raise RAGQuotaError("All configured Gemini embedding keys are unavailable")

        if result and hasattr(result, "embeddings"):
            for emb in result.embeddings:
                vectors.append(emb.values)

    return vectors


async def _embed_texts_async(texts: list, task_type: str = "RETRIEVAL_DOCUMENT") -> list:
    return await asyncio.to_thread(_embed_texts_sync, texts, task_type)


# ─────────────────────────── Ingest ────────────────────────────────────────

def _collection_name(report_id: str) -> str:
    """Pinecone namespace: alphanumeric + hyphens."""
    safe = re.sub(r"[^a-zA-Z0-9\-]", "-", report_id)
    return f"rep-{safe}"[:63]


def _chat_collection_name(report_id: str) -> str:
    """No legacy vectors in chat; hashing avoids truncation collisions."""
    return f"rep-{hashlib.sha256(report_id.encode()).hexdigest()[:40]}-v3"


def build_report_chunks(
    report_id: str,
    pages: list[dict],
    documents: list[dict],
    business_description: str | None,
    submitted_urls: list[str],
) -> list[dict]:
    """Build canonical report chunks before normalized pages are truncated."""
    submitted_hosts = {
        (urlparse(url if "://" in url else f"https://{url}").hostname or "").lower().removeprefix("www.")
        for url in submitted_urls if url
    }
    from app.services.extraction_validator import EXTRACTION_VERSION, is_trusted, evidence_record
    chunks: list[dict] = []

    def add(source_key: str, source: str, source_type: str, text: str,
            *, url: str = "", doc_type: str = "", chat_allowed: bool = True,
            evidence: list[dict] | None = None, scope_url: str = "", categories: list | None = None) -> None:
        for chunk_idx, content in enumerate(chunk_text(text)):
            identity = f"{report_id}|{source_type}|{source_key}|{chunk_idx}|{content}"
            chunks.append({
                "report_id": report_id,
                "chunk_id": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32],
                "text": content,
                "source": source,
                "source_type": source_type,
                "type": "website" if source_type == "website" else (doc_type or source_type),
                "url": url,
                "chunk_idx": chunk_idx,
                "chat_allowed": chat_allowed,
                "extraction_version": EXTRACTION_VERSION,
                "evidence": evidence or [],
                "scope_url": scope_url or url,
                "categories": categories or [],
            })

    seen_urls: set[str] = set()
    for page in pages:
        url = str(page.get("url") or "").strip()
        if not url or url in seen_urls:
            continue
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        title = str(page.get("title") or url).strip()[:160]
        evidence = [r for r in page.get("evidence", []) if is_trusted(r) and r.get("url") == url]
        text = "\n\n".join(r["text"] for r in evidence)
        if not text.strip():
            continue
        seen_urls.add(url)
        scope_url = str(page.get("scope_url") or page.get("requested_url") or url)
        scope_host = (urlparse(scope_url).hostname or "").lower().removeprefix("www.")
        add(url, f"{title} ({url})", "website", text, url=url, scope_url=scope_url,
            chat_allowed=scope_host in submitted_hosts, evidence=evidence, categories=page.get("categories", []))

    for position, document in enumerate(documents):
        if document.get("error"):
            continue
        filename = str(document.get("filename") or "Uploaded document").strip()
        content = str(document.get("content_text") or document.get("content") or "")
        add(f"{position}:{filename}", filename, "document", content,
            doc_type=str(document.get("doc_type") or "document"),
            evidence=[evidence_record("", content, "uploaded_document", f"upload:{position}:{filename}")])

    notes = (business_description or "").strip()
    if notes:
        add("business-description", "Business description", "user_context", notes,
            evidence=[evidence_record("", notes, "user_note", "input.business_description")])
    return chunks


async def ingest_report_chunks(report_id: str, chunks: list[dict]) -> int:
    """Embed verified chunks and upsert them in this report's v3 namespace."""
    if not chunks or not PINECONE_API_KEY:
        return 0
    vectors = await _embed_texts_async([chunk["text"] for chunk in chunks])
    if len(vectors) != len(chunks):
        raise RAGIngestError("[RAG] Vector count does not match report chunk count")
    try:
        index = await asyncio.to_thread(_get_pinecone_index)
        namespace = _chat_collection_name(report_id)
        records = [{
            "id": chunk["chunk_id"],
            "values": vector,
            "metadata": {
                "source": chunk["source"],
                "source_type": chunk["source_type"],
                "type": chunk["type"],
                "url": chunk["url"],
                "chunk_idx": chunk["chunk_idx"],
                "chat_allowed": bool(chunk["chat_allowed"]),
                "text": chunk["text"],
                "report_id": report_id,
                "extraction_version": chunk["extraction_version"],
            },
        } for chunk, vector in zip(chunks, vectors)]
        for offset in range(0, len(records), 100):
            await asyncio.to_thread(index.upsert, vectors=records[offset:offset + 100], namespace=namespace)
        return len(records)
    except Exception as exc:
        raise RAGIngestError(f"[RAG] Report chunk upsert failed: {exc}") from exc


async def ingest_document(
    report_id: str,
    source_name: str,
    source_type: str,
    text: str,
) -> int:
    """
    Chunk text, embed via Gemini, store in Pinecone. Returns chunk count.

    Raises RAGQuotaError immediately if Gemini quota/auth fails — callers must
    not catch this silently.  Raises RAGIngestError on other ingest failures.
    """
    if not text or not text.strip():
        logger.info(f"[RAG] Skipping empty document: {source_name}")
        return 0

    chunks = chunk_text(text)
    if not chunks:
        logger.info(f"[RAG] No usable chunks from '{source_name}' (text too short?)")
        return 0

    logger.info(f"[RAG] Embedding {len(chunks)} chunks from '{source_name}' via Gemini...")
    # RAGQuotaError propagates directly — no catch here
    vectors = await _embed_texts_async(chunks, task_type="RETRIEVAL_DOCUMENT")

    if len(vectors) != len(chunks):
        raise RAGIngestError(
            f"[RAG] Vector count mismatch ({len(vectors)} vs {len(chunks)}) "
            f"for '{source_name}' — ingest aborted to avoid corrupted index"
        )

    try:
        index = _get_pinecone_index()
        namespace = _collection_name(report_id)

        ids = [
            re.sub(r"[^a-zA-Z0-9_\-\.]", "_", f"{source_type}_{source_name}_{i}")[:512]
            for i in range(len(chunks))
        ]
        
        vectors_to_upsert = []
        for i in range(len(chunks)):
            vectors_to_upsert.append({
                "id": ids[i],
                "values": vectors[i],
                "metadata": {
                    "source": source_name,
                    "type": source_type,
                    "chunk_idx": i,
                    "text": chunks[i]
                }
            })

        batch_size = 100
        for i in range(0, len(vectors_to_upsert), batch_size):
            index.upsert(
                vectors=vectors_to_upsert[i : i + batch_size],
                namespace=namespace
            )

        logger.info(
            f"[RAG] Stored {len(chunks)} chunks from '{source_name}' "
            f"→ namespace '{namespace}'"
        )
        return len(chunks)

    except Exception as e:
        raise RAGIngestError(
            f"[RAG] Pinecone upsert failed for '{source_name}': {e}"
        ) from e


async def ingest_scraped_pages(report_id: str, pages: list) -> int:
    """
    Ingest scraper page dicts (title, text, url keys).
    Batches top pages together to minimize Gemini API calls and prevent rate limiting.
    Propagates RAGQuotaError upward — callers must handle it explicitly.
    """
    if not pages:
        return 0

    # Index every crawled page so chat retrieval can find facts beyond the
    # handful of pages selected for the report's initial synthesis.
    indexed_pages = []
    for page in pages:
        text = (page.get("text") or page.get("content") or "").strip()
        if len(text) < 50:
            continue
        indexed_pages.append(page)

    # Collect chunks across every crawled page.
    all_chunks_data = []
    for page in indexed_pages:
        text = page.get("text") or page.get("content") or ""
        title = page.get("title") or page.get("url") or "Web Page"
        url = page.get("url") or ""
        source = f"{title} ({url})"[:120] if url else title[:120]
        chunks = chunk_text(text)
        for i, chunk in enumerate(chunks):
            all_chunks_data.append({
                "source": source,
                "type": "website",
                "chunk_idx": i,
                "text": chunk,
            })

    if not all_chunks_data:
        return 0

    # Embed in supported batches below; do not discard long-tail site pages.
    texts_to_embed = [c["text"] for c in all_chunks_data]

    logger.info(
        f"[RAG] Batch-embedding {len(texts_to_embed)} chunks across {len(indexed_pages)} pages via Gemini..."
    )
    vectors = await _embed_texts_async(texts_to_embed, task_type="RETRIEVAL_DOCUMENT")

    if len(vectors) != len(all_chunks_data):
        raise RAGIngestError(
            f"[RAG] Vector count mismatch ({len(vectors)} vs {len(all_chunks_data)}) during batch ingest"
        )

    try:
        index = _get_pinecone_index()
        namespace = _collection_name(report_id)

        vectors_to_upsert = []
        for i, c in enumerate(all_chunks_data):
            safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", f"web_{c['source'][:30]}_{c['chunk_idx']}_{i}")[:512]
            vectors_to_upsert.append({
                "id": safe_id,
                "values": vectors[i],
                "metadata": {
                    "source": c["source"],
                    "type": c["type"],
                    "chunk_idx": c["chunk_idx"],
                    "text": c["text"],
                },
            })

        batch_size = 100
        for i in range(0, len(vectors_to_upsert), batch_size):
            index.upsert(
                vectors=vectors_to_upsert[i : i + batch_size],
                namespace=namespace,
            )

        logger.info(
            f"[RAG] Successfully ingested {len(vectors_to_upsert)} chunks across {len(indexed_pages)} pages "
            f"in a single batch → namespace '{namespace}'"
        )
        return len(vectors_to_upsert)

    except (RAGQuotaError, RAGIngestError):
        raise
    except Exception as e:
        raise RAGIngestError(f"[RAG] Pinecone batch upsert failed: {e}") from e


async def ingest_processed_docs(report_id: str, processed_docs: list) -> int:
    """
    Ingest doc_processor output dicts (filename, doc_type, content_text).
    Propagates RAGQuotaError upward — callers must handle it explicitly.
    """
    total = 0
    for doc in processed_docs:
        if doc.get("error"):
            continue
        filename = doc.get("filename", "Document")
        doc_type = doc.get("doc_type", "document")
        text = doc.get("content_text") or doc.get("content") or ""
        try:
            total += await ingest_document(report_id, filename, doc_type, text)
        except RAGQuotaError:
            raise  # bubble up immediately
        except RAGIngestError as e:
            logger.error(f"[RAG] Document ingest failed (non-quota), skipping file: {e}")
    return total


# ─────────────────────────── Retrieve ──────────────────────────────────────

def _retrieve_sync(
    report_id: str,
    query: str,
    top_k: int,
    source_labels: list[str] | None = None,
    chat_only: bool = False,
) -> list:
    """
    Embed query, search Pinecone, return ranked chunk dicts.
    Raises RAGQuotaError on Gemini quota/auth failure.
    Raises RAGRetrieveError on Pinecone failures.
    """
    # RAGQuotaError propagates directly from _embed_texts_sync
    vectors = _embed_texts_sync([query], task_type="RETRIEVAL_QUERY")
    if not vectors:
        raise RAGRetrieveError("[RAG] Gemini returned empty embedding for query")
    query_vector = vectors[0]

    try:
        index = _get_pinecone_index()
        matches = []
        # Historical reports still use the original namespace. The v2 lookup
        # lets newer reports use stable chunk IDs without mixing both layouts.
        namespaces = (_chat_collection_name(report_id),) if chat_only else (_chat_collection_name(report_id), _collection_name(report_id))
        for namespace in namespaces:
            query_args = dict(
                vector=query_vector,
                top_k=top_k,
                namespace=namespace,
                include_metadata=True,
            )
            if chat_only:
                query_args["filter"] = {"$and": [{"chat_allowed": {"$eq": True}},
                    {"report_id": {"$eq": report_id}}, {"extraction_version": {"$eq": 3}}]}
            elif namespace == _collection_name(report_id) and source_labels:
                query_args["filter"] = {"source": {"$in": source_labels}}
            results = index.query(**query_args)
            matches = results.get("matches", [])
            if matches:
                break
             
    except (RAGRetrieveError, RAGQuotaError):
        raise
    except Exception as e:
        raise RAGRetrieveError(f"[RAG] Pinecone query error: {e}") from e

    return [
        {
            "chunk_id": match.id,
            "report_id": match.metadata.get("report_id"),
            "extraction_version": match.metadata.get("extraction_version"),
            "text": match.metadata.get("text", ""),
            "source": match.metadata.get("source", "Unknown"),
            "type": match.metadata.get("type", "document"),
            "source_type": match.metadata.get("source_type", match.metadata.get("type", "document")),
            "url": match.metadata.get("url", ""),
            "chunk_idx": match.metadata.get("chunk_idx", 0),
            "relevance": round(match.score, 4),
            "retrieval_method": "vector",
        }
        for match in matches
    ]


async def retrieve_context(report_id: str, query: str, top_k: int = DEFAULT_TOP_K) -> str:
    """
    Retrieve top-k relevant chunks for *query* from the report's vector index.
    Returns formatted context string ready for the Groq synthesis prompt.

    Raises RAGQuotaError on Gemini quota/auth failure — callers must not swallow this.
    Raises RAGRetrieveError on other retrieval failures — callers decide how to handle.
    On success, logs a per-source breakdown so you can detect systematically thin sections.
    """
    # Both RAGQuotaError and RAGRetrieveError propagate to caller
    chunks = await asyncio.to_thread(_retrieve_sync, report_id, query, top_k)

    # ── Per-source chunk breakdown (critical for detecting thin sections) ──
    source_counts: dict = {}
    for chunk in chunks:
        src = f"{chunk['source']} ({chunk['type']})"
        source_counts[src] = source_counts.get(src, 0) + 1

    breakdown = ", ".join(f"{s}: {n}" for s, n in source_counts.items())
    logger.info(
        f"[RAG] Retrieved {len(chunks)} chunks | "
        f"top relevance: {chunks[0]['relevance'] if chunks else 'n/a'} | "
        f"source breakdown: [{breakdown}]"
    )
    if not chunks:
        raise RAGRetrieveError(
            f"[RAG] Zero chunks returned for report {report_id} — index may be empty"
        )

    lines = [
        f"[RAG CONTEXT — {len(chunks)} chunks retrieved by semantic search "
        f"from indexed documents & web pages]\n"
    ]
    for i, chunk in enumerate(chunks, 1):
        lines.append(
            f"--- Chunk {i} | Source: {chunk['source']} ({chunk['type']}) "
            f"| Relevance: {chunk['relevance']} ---\n{chunk['text']}\n"
        )
    return "\n".join(lines)


async def retrieve_chunks(
    report_id: str,
    query: str,
    top_k: int = 20,
    source_labels: list[str] | None = None,
    chat_only: bool = False,
) -> list[dict]:
    """Return ranked chunks for a report without formatting them into a prompt."""
    return await asyncio.to_thread(_retrieve_sync, report_id, query, top_k, source_labels, chat_only)


# ─────────────────────────── Cleanup ───────────────────────────────────────

def delete_report_collection(report_id: str) -> None:
    """Remove the Pinecone namespace for a given report."""
    try:
        index = _get_pinecone_index()
        for namespace in (_chat_collection_name(report_id), f"{_collection_name(report_id)[:60]}-v2", _collection_name(report_id)):
            try:
                index.delete(delete_all=True, namespace=namespace)
                logger.info("[RAG] Deleted namespace '%s'", namespace)
            except Exception as exc:
                if "404" not in str(exc):
                    logger.warning("[RAG] Could not delete namespace '%s': %s", namespace, exc)
    except Exception as e:
        logger.warning(f"[RAG] Could not delete namespace for {report_id}: {e}")


# ─────────────────────────── Self-Test ─────────────────────────────────────

async def _self_test():
    import uuid
    test_id = str(uuid.uuid4())[:8]
    sample = (
        "Omkar Ceramic manufactures glazed vitrified tiles in 600x1200mm and 800x800mm formats. "
        "Products range from Rs.45 to Rs.180 per sq.ft. Customers include contractors, interior "
        "designers, and real-estate developers. The company exports to UAE, USA, and Europe via "
        "200+ distributors. Revenue FY24: Rs.77 crore, gross margin 34%. Risks: raw material "
        "volatility and competition from large-format slab makers. Opportunities: affordable "
        "housing and hospitality sectors."
    ) * 6

    print(f"\n[Test] report_id: {test_id}")
    print("[Test] Ingesting sample document...")
    n = await ingest_document(test_id, "test_doc.txt", "text_doc", sample)
    print(f"[Test] Ingested {n} chunks")

    print("\n[Test] Retrieving context...")
    ctx = await retrieve_context(test_id, "key products, customers, revenue")
    print(f"[Test] Retrieved {len(ctx)} chars")
    if ctx:
        print(textwrap.indent(ctx[:600], "  "))
    else:
        print("  (empty — check GEMINI_API_KEY and model availability)")

    delete_report_collection(test_id)
    print("\n[Test] Done.")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    asyncio.run(_self_test())
