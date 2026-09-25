"""
main.py — FastAPI application entry point.

Endpoints:
  POST /api/reports          — Multipart submit with files, URLs, business context
  GET  /api/reports/{id}     — Poll status + get structured multi-source analysis
  GET  /api/reports          — List recent reports
  GET  /health               — Health check
"""

import asyncio
import json
import logging
import os
import sys
import time

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass
from contextlib import asynccontextmanager
from typing import List, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from app.core import auth_middleware
from app.core import database as db
from app.services import doc_processor
from app.services import groq_client
from app.services import normalizer
from app.services import scraper
from app.services import data_engine
from app.services import rag_engine
from app.services import chat_service
from app.routers import voice_router
from app.routers import video_router
from app.routers import calendar_router
from app.routers import profile_router
from app.routers import whatsapp_router
from app.routers import demo_voice_router
from app.services.search.router import get_search_router
from config.domain_trust import classify_and_filter, SeedUrl

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


# ─────────────────────────── Lifespan ──────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    yield
    await scraper.close_playwright()


# ─────────────────────────── App Setup ─────────────────────────────────

app = FastAPI(
    title="BizIntel Enterprise — AI Sales Intelligence & Commercial Due-Diligence",
    description="Multi-source automated discovery: documents (PDF, CSV, Excel, Images) + web scraping + Groq Llama 3 intelligence engine.",
    version="2.0.0",
    lifespan=lifespan,
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000", "http://localhost:3001", "http://localhost:8080", "http://localhost:8081", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Voice Fleet Router
app.include_router(voice_router.router, prefix="/api/voice", tags=["Voice Fleet"])

# Mount Video Sales Agent Router
app.include_router(video_router.router, prefix="/api/video", tags=["Video Sales Agent"])

# Mount Calendar & Scheduled Meetings Router
app.include_router(calendar_router.router, prefix="/api/calendar", tags=["Calendar & Meetings"])

# Mount WhatsApp Integration Router
app.include_router(whatsapp_router.router, prefix="/api/whatsapp", tags=["WhatsApp"])

# Mount public website voice-preview router (own Sarvam key, IP rate-limited, isolated from calling agents)
app.include_router(demo_voice_router.router, prefix="/api/demo-voice", tags=["Website Voice Demo"])

# Mount User Profile Router (backed by MongoDB)
app.include_router(profile_router.router, prefix="/api/profile", tags=["User Profile"])

# Also expose Vapi, Sarvam & Tavus Webhooks and Outbound at root path level for compatibility
app.add_api_route("/webhook/vapi/custom-voice", voice_router.vapi_custom_voice_webhook, methods=["GET", "POST", "HEAD"], tags=["Voice Fleet Webhook"])
app.add_api_route("/webhook/vapi", voice_router.vapi_webhook, methods=["POST"], tags=["Voice Fleet Webhook"])
app.add_api_route("/webhook/tavus", video_router.tavus_webhook, methods=["POST"], tags=["Video Sales Agent Webhook"])
app.add_api_route("/sarvam/webhook", voice_router.sarvam_webhook, methods=["POST"], tags=["Sarvam Webhook"])
app.add_api_route("/call/outbound", voice_router.direct_outbound_call, methods=["POST"], tags=["Sarvam Outbound"])


# ─────────────────────────── Calls Compatibility Endpoints ───────────────

@app.get("/api/calls", tags=["Calls Compatibility"])
async def list_calls_compat():
    """Compatibility endpoint matching zip backend, backed by project Supabase database."""
    return await db.list_voice_calls(limit=100)


@app.get("/api/calls/{call_id}", tags=["Calls Compatibility"])
async def get_call_compat(call_id: str):
    """Compatibility endpoint matching zip backend, returning call & turns from Supabase."""
    call = await db.get_voice_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return {
        "call": call,
        "turns": call.get("transcript") or [],
    }

# ─────────────────────────── Supabase Auth Provisioning ─────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = ""
    company_name: Optional[str] = ""
    industry: Optional[str] = "SaaS / Technology"
    auto_confirm: Optional[bool] = True

@app.post("/api/auth/register")
async def register_user(payload: RegisterRequest):
    """
    Registers a new user in Supabase Auth via Admin API.
    Bypasses Supabase free tier email rate limits (4 emails/hr) by directly
    provisioning the user with email_confirm=True, allowing instant login.
    """
    import asyncio
    client = db.get_supabase()
    email_clean = payload.email.strip().lower()

    try:
        # Check if user already exists
        users = await asyncio.to_thread(client.auth.admin.list_users)
        existing = next((u for u in users if u.email and u.email.lower() == email_clean), None)

        if existing:
            await asyncio.to_thread(
                client.auth.admin.update_user_by_id,
                existing.id,
                {
                    "password": payload.password,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": payload.full_name or existing.user_metadata.get("full_name", ""),
                        "company_name": payload.company_name or existing.user_metadata.get("company_name", ""),
                        "industry": payload.industry or existing.user_metadata.get("industry", ""),
                        "onboarding_completed": False,
                    }
                }
            )
            user_id = existing.id
        else:
            res = await asyncio.to_thread(
                client.auth.admin.create_user,
                {
                    "email": email_clean,
                    "password": payload.password,
                    "email_confirm": payload.auto_confirm,
                    "user_metadata": {
                        "full_name": payload.full_name or "",
                        "company_name": payload.company_name or "My Enterprise",
                        "industry": payload.industry or "SaaS / Technology",
                        "onboarding_completed": False,
                    }
                }
            )
            user_id = res.user.id

        # Upsert user profile into MongoDB
        try:
            await db.upsert_profile(
                user_id,
                {
                    "email": email_clean,
                    "full_name": payload.full_name or "",
                    "company_name": payload.company_name or "My Enterprise",
                    "industry": payload.industry or "SaaS / Technology",
                    "onboarding_completed": False,
                    "role": "owner",
                }
            )
        except Exception as profile_err:
            logger.warning(f"Could not initialize MongoDB profile for {user_id}: {profile_err}")

        return {
            "success": True,
            "user_id": user_id,
            "email": email_clean,
            "confirmed": True,
            "message": "User provisioned and confirmed successfully in Supabase."
        }
    except Exception as e:
        logger.error(f"Error provisioning user in Supabase: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/auth/me", tags=["Authentication"])
async def get_current_user_profile(
    authorization: Optional[str] = Header(None),
):
    """
    Returns current authenticated user profile and Supabase UUID.
    Works with both Supabase JWT and Google OAuth bearer tokens.
    Stores and retrieves all user profile and workspace metadata in MongoDB.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    auth_user = await auth_middleware.get_current_user(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Invalid token")

    profile = await db.get_profile(auth_user.id)
    if not profile and auth_user.email:
        profile = await db.get_profile_by_email(auth_user.email)

    if not profile:
        meta = auth_user.user_metadata or {}
        profile = await db.upsert_profile(
            auth_user.id,
            {
                "email": auth_user.email or "",
                "full_name": meta.get("full_name") or meta.get("name") or "",
                "company_name": meta.get("company_name") or meta.get("company") or "",
                "industry": meta.get("industry") or "SaaS / Technology",
                "avatar_url": meta.get("avatar_url") or meta.get("picture") or "",
                "role": "owner",
                "onboarding_completed": bool(meta.get("onboarding_completed", False)),
            }
        )

    return {
        "id": auth_user.id,
        "email": auth_user.email,
        "user_metadata": auth_user.user_metadata,
        "profile": profile,
    }


# ─────────────────────────── Request Schemas ────────────────────────────

class ReportRequest(BaseModel):
    website_url: Optional[str] = None
    business_description: Optional[str] = None
    linkedin_url: Optional[str] = None
    other_links: list[str] = []

    @field_validator("website_url")
    @classmethod
    def validate_website(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            v = "https://" + v
        parsed = urlparse(v)
        if not parsed.netloc:
            raise ValueError("Invalid website URL")
        if not scraper.is_safe_url(v):
            raise ValueError("URL targets a private/internal address (not allowed)")
        return v

    @field_validator("business_description")
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        return v.strip()


class ReportChatRequest(BaseModel):
    question: str

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Question cannot be empty")
        if len(value) > 2000:
            raise ValueError("Question must be 2000 characters or fewer")
        return value


# ─────────────────────────── Pipeline Worker ────────────────────────────

async def run_pipeline(
    report_id: str,
    website_url: Optional[str],
    business_description: Optional[str],
    linkedin_url: Optional[str],
    other_links: list[str],
    raw_files: list[tuple[str, bytes]],
):
    """
    Three-tier intelligence pipeline (with RAG and DDG-first search layer):
    1. Parse uploaded documents
    2. Stage A (concurrent via asyncio.gather):
       - Crawl website (first-party pages, tier=first_party, confidence=1.0)
       - Search via SearchRouter (DDG → Serper fallback) for enrichment URLs
    3. Classify search results via domain_trust; fetch seed pages (Stage B)
    3.5. RAG Ingest: chunk + embed all content → ChromaDB (per report_id)
    4. Run dedicated individual deep-dive on EVERY document (guaranteeing 100% extraction)
    5. RAG Retrieve: top-8 relevant chunks for synthesis query
    6. Run global commercial synthesis (Groq sees only retrieved chunks)
    7. Persist to Supabase
    """
    try:
        # ── Phase 1: Parse Uploaded Documents ─────────────────────────
        processed_docs = []
        if raw_files:
            await db.update_status(report_id, "parsing_docs")
            logger.info(f"[{report_id}] Parsing {len(raw_files)} attached documents...")
            groq_key = os.getenv("GROQ_API_KEY", "")
            processed_docs = doc_processor.process_documents(raw_files, groq_api_key=groq_key)

        # ── Phase 2: Stage A — Concurrent crawl + search ──────────────
        # IMPORTANT: both tasks start simultaneously via asyncio.gather.
        # The docstring above and these comments reflect the actual execution
        # model — do NOT change to sequential without updating the docstring.
        pages: list[dict] = []
        search_results = []
        domain = ""

        if website_url:
            await db.update_status(report_id, "scraping")
            domain = urlparse(website_url).netloc
            # Derive a search hint from domain so Stage A search can run
            # concurrently with the crawl (we don't have company_name yet).
            domain_hint = domain.split(".")[0] if domain else ""
            search_query = f"{domain_hint} {domain}" if domain_hint else domain

            logger.info(
                f"[{report_id}] Stage A: launching crawl + search concurrently "
                f"(site={website_url}, query={search_query!r})"
            )
            stage_a_start = time.monotonic()

            # Genuinely parallel — both coroutines run concurrently
            pages, search_results = await asyncio.gather(
                scraper.crawl_website(website_url),
                get_search_router().search(search_query, max_results=10),
                return_exceptions=False,
            )

            stage_a_duration = time.monotonic() - stage_a_start
            logger.info(
                '{"event": "crawl_stage_duration", "stage": "search", "seconds": %.2f, "report_id": %r}',
                stage_a_duration,
                report_id,
            )

            if not pages and not business_description and not processed_docs:
                await db.update_status(
                    report_id, "failed",
                    "No content could be extracted from the website and no documents/notes provided."
                )
                return

        elif business_description:
            # No URL — use DDG alone for discovery (company-name-only mode)
            logger.info(f"[{report_id}] No URL provided — DDG-only discovery mode")
            first_line = (business_description or "").strip().split("\n")[0][:60]
            search_results = await get_search_router().search(first_line, max_results=10)
        else:
            logger.info(f"[{report_id}] Direct documents/context mode (no web sources)")

        # ── Phase 2 Stage B: Classify + fetch seed pages ───────────────
        # Stage B runs after Stage A has completed (seed_urls depend on
        # search_results from Stage A).  This is sequential by design.
        seeded_pages: list[dict] = []
        if search_results:
            seed_urls = classify_and_filter(search_results, domain)
            existing_urls = {p["url"] for p in pages}
            if seed_urls:
                logger.info(
                    f"[{report_id}] Stage B: fetching {len(seed_urls)} classified seed URLs"
                )
                seeded_pages = await scraper.fetch_seed_pages(
                    seed_urls,
                    existing_urls=existing_urls,
                    max_seed_pages=5,
                )
                logger.info(
                    f"[{report_id}] Stage B complete: {len(seeded_pages)} seed pages fetched"
                )

        # Fetch user-submitted additional URLs directly so chat can retrieve
        # their content too. Search-discovered pages remain separate sources.
        if other_links:
            existing_urls = {p.get("url", "") for p in [*pages, *seeded_pages]}
            submitted_seeds = [
                SeedUrl(url=url, tier="user_submitted", confidence=1.0, source="user")
                for url in other_links
                if (urlparse(url).hostname or "").lower() != "linkedin.com"
                and not (urlparse(url).hostname or "").lower().endswith(".linkedin.com")
            ]
            if submitted_seeds:
                submitted_pages = await scraper.fetch_seed_pages(
                    submitted_seeds,
                    existing_urls=existing_urls,
                    max_seed_pages=10,
                )
                seeded_pages.extend(submitted_pages)

        # ── Phase 3: Normalization (single pass — no double build_profile) ─
        full_profile = normalizer.build_profile(
            source_url=website_url,
            pages=pages,
            seeded_pages=seeded_pages,
            linkedin_url=linkedin_url,
            extra_links=other_links,
            business_description=business_description,
            processed_docs=processed_docs,
        )
        company_name = full_profile.get("company_name", domain or "Business Entity")

        await db.update_raw_profile(report_id, full_profile)

        # ── Phase 2.5: RAG Ingest — chunk and embed report content into Pinecone ──
        # Store full extracted chunks before normalized pages are truncated.
        report_chunks = rag_engine.build_report_chunks(
            report_id,
            [*pages, *seeded_pages],
            processed_docs,
            business_description,
            [url for url in [website_url, *other_links] if url],
        )
        await db.replace_report_chunks(report_id, report_chunks)
        logger.info(f"[{report_id}] RAG: Ingesting {len(report_chunks)} report chunks into Pinecone...")
        rag_web_chunks = 0
        rag_doc_chunks = 0
        rag_ingest_ok = False
        try:
            ingested = await rag_engine.ingest_report_chunks(report_id, report_chunks)
            rag_ingest_ok = ingested > 0
            if rag_ingest_ok:
                rag_web_chunks = sum(chunk["source_type"] == "website" for chunk in report_chunks)
                rag_doc_chunks = ingested - rag_web_chunks
            logger.info(
                f"[{report_id}] RAG: Ingested {rag_web_chunks} web chunks + {rag_doc_chunks} doc chunks "
                f"({rag_web_chunks + rag_doc_chunks} total)"
            )
        except rag_engine.RAGQuotaError as quota_err:
            logger.warning(
                f"[{report_id}] Gemini embedding rate limit reached ({quota_err}). "
                "Continuing with direct full-profile synthesis via Groq Llama 3."
            )
            rag_ingest_ok = False
        except (rag_engine.RAGIngestError, RuntimeError) as ingest_err:
            # Non-quota Pinecone failure — the stored chunks remain available.
            logger.error(
                f"[{report_id}] RAG ingest error (partial ingest, retrieval may be incomplete): {ingest_err}"
            )
            rag_ingest_ok = False

        # ── Phase 4: Tier 1 Individual Document Deep-Dives ────────────
        await db.update_status(report_id, "analyzing")
        logger.info(f"[{report_id}] Running dedicated extraction on {len(processed_docs)} documents...")

        doc_coros = [
            groq_client.analyze_single_document_async(
                doc.get("filename", "Document"),
                doc.get("doc_type", "document"),
                doc.get("content_text") or doc.get("content", ""),
            )
            for doc in processed_docs
            if (doc.get("content_text") or doc.get("content")) and not doc.get("error")
        ]

        # If website scraped, also add a website deep-dive entry
        if pages:
            web_summary_text = "\n\n".join([f"Page: {p.get('title')}\n{p.get('text')[:1000]}" for p in pages[:4]])
            doc_coros.append(
                groq_client.analyze_single_document_async(
                    doc_name=website_url or "Public Website",
                    doc_type="website",
                    content_text=web_summary_text,
                )
            )

        individual_insights = list(await asyncio.gather(*doc_coros)) if doc_coros else []

        # ── Phase 4.5: Deterministic Numerical Extraction & Diagram Generation ──
        data_engine_figures = None
        tabular_file_found = False

        for fname, cbytes in raw_files:
            ext = os.path.splitext(fname.lower())[1]
            if ext in (".csv", ".xlsx", ".xls", ".tsv", ".json"):
                rows = data_engine.extract_rows_from_file(fname, cbytes)
                if rows:
                    data_engine_figures = data_engine.analyze_uploaded_data(rows, fname)
                    if data_engine_figures.get("has_file_data"):
                        tabular_file_found = True
                        logger.info(f"[{report_id}] Direct data file extracted: {data_engine_figures.get('data_source_summary')}")
                        break

        profile_md = normalizer.profile_to_markdown(full_profile)

        if not tabular_file_found:
            logger.info(f"[{report_id}] No tabular sales file uploaded — synthesizing figures from website & market intelligence")
            data_engine_figures = data_engine.synthesize_website_figures(
                company_name=company_name,
                industry="B2B Commercial Enterprise",
                opportunity_score=86,
                scraped_text=profile_md,
            )

        # ── Phase 4.7: RAG Retrieve — top-k relevant chunks for synthesis ──
        rag_context = ""
        if rag_ingest_ok:
            synthesis_query = (
                f"Commercial analysis, key products, pricing, SWOT analysis, target customers, "
                f"revenue, financial highlights, risks, and growth opportunities for {company_name}"
            )
            logger.info(f"[{report_id}] RAG: Retrieving context for synthesis query...")
            try:
                rag_context = await rag_engine.retrieve_context(
                    report_id=report_id,
                    query=synthesis_query,
                    top_k=8,
                )
                logger.info(
                    f"[{report_id}] RAG: Retrieved {len(rag_context)} chars of grounded context. "
                    f"Groq will reason over retrieved chunks only (not the full "
                    f"{len(profile_md)}-char profile)."
                )
            except rag_engine.RAGQuotaError as quota_err:
                logger.warning(
                    f"[{report_id}] RAG retrieval rate limit reached ({quota_err}). "
                    "Falling through to direct profile synthesis."
                )
                rag_context = ""
            except rag_engine.RAGRetrieveError as retrieve_err:
                # Non-quota retrieval error — explicitly logged at ERROR, then falls
                # through to direct profile synthesis (NOT silent — caller sees it).
                logger.error(
                    f"[{report_id}] RAG retrieval failed (non-quota). "
                    f"Falling through to direct profile synthesis. Error: {retrieve_err}"
                )
                rag_context = ""  # explicit, not silent
        else:
            logger.info(f"[{report_id}] RAG: No chunks ingested — using direct profile synthesis.")

        # ── Phase 5: Tier 2 Global Commercial Synthesis ───────────────
        logger.info(f"[{report_id}] Running global commercial synthesis...")
        analysis = await groq_client.analyze_business_async(
            profile_markdown=profile_md,
            linkedin_url=linkedin_url,
            extra_links=other_links,
            doc_count=len(processed_docs),
            individual_doc_insights=individual_insights,
            data_engine_figures=data_engine_figures,
            rag_context=rag_context if rag_context else None,
        )

        # ── Phase 6: Persist ──────────────────────────────────────────
        await db.update_analysis(report_id, analysis.model_dump())
        logger.info(f"[{report_id}] Enterprise Intelligence Report Completed Successfully ✓")

    except Exception as e:
        logger.exception(f"[{report_id}] Pipeline failed: {e}")
        await db.update_status(report_id, "failed", str(e))


# ─────────────────────────── Endpoints ─────────────────────────────────

@app.post("/api/reports", status_code=202)
async def create_report(
    background_tasks: BackgroundTasks,
    website_url: Optional[str] = Form(None),
    business_description: Optional[str] = Form(None),
    linkedin_url: Optional[str] = Form(None),
    other_links: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
    files: List[UploadFile] = File(default=[]),
):
    resolved_user_id = None
    if authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user and auth_user.id:
                resolved_user_id = auth_user.id
        except Exception:
            pass
    if not resolved_user_id and user_id:
        resolved_user_id = user_id

    clean_other_links: list[str] = []
    if other_links:
        try:
            parsed = json.loads(other_links)
            if isinstance(parsed, list):
                clean_other_links = [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            clean_other_links = [x.strip() for x in other_links.split(",") if x.strip()]

    if len(clean_other_links) > 10:
        raise HTTPException(status_code=422, detail="A maximum of 10 additional source URLs is allowed.")
    validated_other_links: list[str] = []
    for raw_link in clean_other_links:
        link = raw_link if raw_link.startswith(("http://", "https://")) else f"https://{raw_link}"
        parsed_link = urlparse(link)
        if parsed_link.scheme not in ("http", "https") or not parsed_link.netloc:
            raise HTTPException(status_code=422, detail=f"Invalid additional source URL: {raw_link}")
        if not scraper.is_safe_url(link):
            raise HTTPException(status_code=422, detail="An additional source URL targets a private/internal address.")
        validated_other_links.append(link)
    clean_other_links = validated_other_links

    validated_website = None
    if website_url and website_url.strip():
        w = website_url.strip()
        if not w.startswith(("http://", "https://")):
            w = "https://" + w
        parsed = urlparse(w)
        if not parsed.netloc:
            raise HTTPException(status_code=422, detail="Invalid website URL format")
        if not scraper.is_safe_url(w):
            raise HTTPException(status_code=422, detail="Website URL targets a private/internal address")
        validated_website = w

    raw_files: list[tuple[str, bytes]] = []
    if files:
        if len(files) > doc_processor.MAX_FILES_PER_REQUEST:
            raise HTTPException(
                status_code=422,
                detail=f"Too many files. Maximum {doc_processor.MAX_FILES_PER_REQUEST} files allowed.",
            )
        for f in files:
            if not f.filename:
                continue
            content = await f.read()
            if len(content) > 0:
                raw_files.append((f.filename, content))

    has_website = bool(validated_website)
    has_desc = bool(business_description and business_description.strip())
    has_files = len(raw_files) > 0

    if not (has_website or has_desc or has_files):
        raise HTTPException(
            status_code=422,
            detail="Please provide at least one source: Website URL, Business Description, or Uploaded Document.",
        )

    report_id = await db.create_report({
        "website": validated_website or "",
        "business_description": business_description or "",
        "linkedin": linkedin_url or "",
        "other": clean_other_links,
        "files": [fname for fname, _ in raw_files],
    }, user_id=resolved_user_id)

    background_tasks.add_task(
        run_pipeline,
        report_id=report_id,
        website_url=validated_website,
        business_description=business_description,
        linkedin_url=linkedin_url,
        other_links=clean_other_links,
        raw_files=raw_files,
    )

    return {"report_id": report_id, "status": "pending", "attached_files": len(raw_files)}


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    report = await db.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.post("/api/reports/{report_id}/chat")
async def chat_about_report(
    report_id: str,
    payload: ReportChatRequest,
    authorization: Optional[str] = Header(None),
):
    auth_user = await auth_middleware.get_current_user(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    report = await db.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    owner_id = report.get("user_id")
    if owner_id and str(owner_id) != str(auth_user.id):
        raise HTTPException(status_code=404, detail="Report not found")
    if report.get("status") != "done":
        raise HTTPException(status_code=409, detail="Report is not ready for questions yet")

    try:
        return await chat_service.answer_report_question(report, payload.question)
    except (rag_engine.RAGQuotaError, rag_engine.RAGRetrieveError) as exc:
        logger.error("Report chat retrieval failed for %s: %s", report_id, exc)
        raise HTTPException(status_code=503, detail="Could not retrieve this report's source data") from exc
    except RuntimeError as exc:
        logger.error("Report chat generation failed for %s: %s", report_id, exc)
        raise HTTPException(status_code=503, detail="Chat service is temporarily unavailable") from exc


@app.get("/api/reports")
async def list_reports(
    user_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    resolved_user_id = None
    if authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user and auth_user.id:
                resolved_user_id = auth_user.id
        except Exception:
            pass
    if not resolved_user_id and user_id:
        resolved_user_id = user_id
    return await db.list_reports(user_id=resolved_user_id, limit=50)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "BizIntel AI Intelligence Platform",
        "supported_extensions": list(doc_processor.ALLOWED_EXTENSIONS),
        "max_file_size_mb": 15,
        "max_files": doc_processor.MAX_FILES_PER_REQUEST,
    }
