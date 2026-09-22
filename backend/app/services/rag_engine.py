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
import logging
import os
import re
import textwrap
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ─────────────────────────── Config ────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_EMBED_MODEL = "models/gemini-embedding-001"
CHROMA_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", str(Path(__file__).resolve().parents[2] / "data" / "chroma_store"))
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150
DEFAULT_TOP_K = 8

# ─────────────────────────── Custom Exceptions ─────────────────────────────

class RAGQuotaError(RuntimeError):
    """
    Raised when Gemini returns a quota-exceeded or authentication error.
    Callers should stop the analysis pipeline and alert — not silently degrade.
    """
    pass


class RAGIngestError(RuntimeError):
    """Raised when ingestion fails for a non-quota reason (e.g., ChromaDB issue)."""
    pass


class RAGRetrieveError(RuntimeError):
    """Raised when retrieval fails for a non-quota reason."""
    pass

# ─────────────────────────── Lazy Client Factories ─────────────────────────

def _get_gemini_client():
    """Return a configured google.genai Client."""
    try:
        from google import genai
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not set in .env")
        return genai.Client(api_key=GEMINI_API_KEY)
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

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list:
    """Split text into overlapping character-level chunks, preferring paragraph breaks."""
    if not text or not text.strip():
        return []

    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    paragraphs = text.split("\n\n")
    chunks = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 <= chunk_size:
            current = (current + "\n\n" + para).strip() if current else para
        else:
            if current:
                chunks.append(current)
            if len(para) > chunk_size:
                for i in range(0, len(para), chunk_size - overlap):
                    sub = para[i : i + chunk_size]
                    if sub.strip():
                        chunks.append(sub.strip())
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return [c for c in chunks if len(c.strip()) >= 40]


# ─────────────────────────── Embedding ─────────────────────────────────────

def _embed_texts_sync(texts: list, task_type: str = "RETRIEVAL_DOCUMENT") -> list:
    """
    Embed a list of texts using Gemini gemini-embedding-001.
    Uses the new google.genai SDK (batch embed endpoint).
    Returns list of float vectors.

    Raises RAGQuotaError on quota/auth failures (caller must not silently degrade).
    Raises RuntimeError on other unexpected API failures.
    """
    client = _get_gemini_client()
    vectors = []

    batch_size = 100  # Gemini batch limit
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        max_retries = 3
        result = None
        for attempt in range(max_retries):
            try:
                result = client.models.embed_content(
                    model=GEMINI_EMBED_MODEL,
                    contents=batch,
                    config={"task_type": task_type},
                )
                break
            except Exception as e:
                err_str = str(e).lower()
                is_rate_limit = any(kw in err_str for kw in ("429", "resource_exhausted", "rate limit"))
                if is_rate_limit and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 3
                    logger.warning(
                        f"[RAG] Gemini embedding rate limit hit (429). Retrying in {wait_time}s (attempt {attempt+1}/{max_retries})..."
                    )
                    time.sleep(wait_time)
                    continue

                # Detect quota / auth failures explicitly
                if any(kw in err_str for kw in (
                    "quota", "rate limit", "resource_exhausted", "429",
                    "api_key", "permission", "unauthenticated", "403", "401",
                )):
                    raise RAGQuotaError(
                        f"[RAG] Gemini embedding quota/auth failure — analysis STOPPED. "
                        f"Do not fall back to raw-text synthesis. Error: {e}"
                    ) from e
                raise RuntimeError(
                    f"[RAG] Gemini embedding unexpected error: {e}"
                ) from e

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

    # Rank and select top informative pages (homepage, pricing, products, solutions, about)
    ranked_pages = []
    for page in pages:
        text = (page.get("text") or page.get("content") or "").strip()
        if len(text) < 50:
            continue
        url = (page.get("url") or "").lower()
        score = len(text)
        if any(kw in url for kw in ("pricing", "feature", "product", "solution", "about", "contact")):
            score += 5000
        ranked_pages.append((score, page))

    ranked_pages.sort(key=lambda x: x[0], reverse=True)
    selected_pages = [p for _, p in ranked_pages[:8]]  # Top 8 most valuable pages

    # Collect all chunks across selected pages
    all_chunks_data = []
    for page in selected_pages:
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

    # Cap total chunks to 80 (well within Gemini batch limits)
    all_chunks_data = all_chunks_data[:80]
    texts_to_embed = [c["text"] for c in all_chunks_data]

    logger.info(
        f"[RAG] Batch-embedding {len(texts_to_embed)} chunks across {len(selected_pages)} pages via Gemini..."
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
            f"[RAG] Successfully ingested {len(vectors_to_upsert)} chunks across {len(selected_pages)} pages "
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

def _retrieve_sync(report_id: str, query: str, top_k: int) -> list:
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
        namespace = _collection_name(report_id)
        
        results = index.query(
            vector=query_vector,
            top_k=top_k,
            namespace=namespace,
            include_metadata=True
        )
        
        matches = results.get("matches", [])
        if not matches:
             return []
             
    except (RAGRetrieveError, RAGQuotaError):
        raise
    except Exception as e:
        raise RAGRetrieveError(f"[RAG] Pinecone query error: {e}") from e

    return [
        {
            "text": match.metadata.get("text", ""),
            "source": match.metadata.get("source", "Unknown"),
            "type": match.metadata.get("type", "document"),
            "chunk_idx": match.metadata.get("chunk_idx", 0),
            "relevance": round(match.score, 4),
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


# ─────────────────────────── Cleanup ───────────────────────────────────────

def delete_report_collection(report_id: str) -> None:
    """Remove the Pinecone namespace for a given report."""
    try:
        index = _get_pinecone_index()
        namespace = _collection_name(report_id)
        index.delete(delete_all=True, namespace=namespace)
        logger.info(f"[RAG] Deleted namespace '{namespace}'")
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
