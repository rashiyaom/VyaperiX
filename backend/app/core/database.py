"""
database.py — MongoDB Database Adapter for Vyepari X.

Stores all application and user data in MongoDB:
  - profiles (user profile, company, industry, team size, onboarding)
  - reports (commercial due diligence reports, scraping results, SWOT, products/services)
  - voice_calls (outbound/inbound phone calls, transcripts, recordings, telemetry)
  - voice_settings (telephony configurations)
  - video_calls (Tavus Mitra video sales sessions, briefings, transcripts)
  - calendar_events (scheduled meetings, Google Meet links, reminders, statuses)

Powered by motor (AsyncIOMotorClient) with automatic collection indexing and
in-memory fallback caching for resilient offline execution.
Supabase client is retained exclusively for administrative auth provisioning.
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ReplaceOne
from supabase import Client, create_client

try:
    import dns.resolver
    dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
    dns.resolver.default_resolver.nameservers = ['8.8.8.8', '1.1.1.1']
except Exception:
    pass

load_dotenv()
logger = logging.getLogger(__name__)

# ─────────────────────────── Configuration ──────────────────────────────

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "vyepari_x")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

# ─────────────────────────── Supabase Client (Auth Only) ────────────────

_supabase_client: Optional[Client] = None

def _get_clean_supabase_url() -> str:
    raw = os.getenv("SUPABASE_URL", SUPABASE_URL).strip().rstrip("/")
    if raw.endswith("/rest/v1"):
        raw = raw[:-len("/rest/v1")].rstrip("/")
    return raw

def get_supabase() -> Client:
    """Return active Supabase client singleton for Auth Administration."""
    global _supabase_client
    if _supabase_client is None:
        url = _get_clean_supabase_url()
        secret_key = os.getenv("SUPABASE_SECRET_KEY", SUPABASE_SECRET_KEY).strip()
        if not url or not secret_key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.")
        _supabase_client = create_client(url, secret_key)
    return _supabase_client

# ─────────────────────────── MongoDB Client & DB ─────────────────────────

_mongo_client: Optional[AsyncIOMotorClient] = None
_mongo_db: Optional[AsyncIOMotorDatabase] = None
_mongo_connected: bool = False

def get_mongo_client() -> AsyncIOMotorClient:
    """Return active MongoDB async client singleton with TLS and certifi support."""
    global _mongo_client
    if _mongo_client is None:
        uri = os.getenv("MONGODB_URI", MONGODB_URI).strip()
        kwargs: Dict[str, Any] = {
            "serverSelectionTimeoutMS": 4000,
            "connectTimeoutMS": 4000,
        }
        if "mongodb+srv://" in uri or "ssl=true" in uri.lower():
            try:
                import certifi
                kwargs["tlsCAFile"] = certifi.where()
            except ImportError:
                pass
        _mongo_client = AsyncIOMotorClient(uri, **kwargs)
    return _mongo_client

def get_mongo_db() -> AsyncIOMotorDatabase:
    """Return active MongoDB database instance."""
    global _mongo_db
    if _mongo_db is None:
        client = get_mongo_client()
        db_name = os.getenv("MONGODB_DB_NAME", MONGODB_DB_NAME).strip()
        _mongo_db = client[db_name]
    return _mongo_db


async def get_chat_answer(key: str) -> Optional[dict]:
    """Durable answers are required for repeatability across API workers."""
    try:
        row = await get_mongo_db()["chat_answers"].find_one({"_id": key})
        return row.get("answer") if row else None
    except Exception as exc:
        raise RuntimeError("Chat answer cache is unavailable") from exc


async def save_chat_answer(key: str, report_id: str, answer: dict) -> dict:
    from pymongo import ReturnDocument
    from pymongo.errors import DuplicateKeyError
    collection = get_mongo_db()["chat_answers"]
    try:
        try:
            row = await collection.find_one_and_update(
                {"_id": key}, {"$setOnInsert": {"report_id": report_id, "answer": answer, "created_at": _now()}},
                upsert=True, return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            row = await collection.find_one({"_id": key})
        if not row:
            raise RuntimeError("Chat cache write returned no record")
        return row["answer"]
    except Exception as exc:
        raise RuntimeError("Chat answer cache is unavailable") from exc

def _clean_doc(doc: Optional[dict]) -> Optional[dict]:
    """Convert MongoDB _id to string or remove it so output is clean JSON."""
    if not doc:
        return None
    d = dict(doc)
    if "_id" in d:
        d["_id"] = str(d["_id"])
    return d

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

_now_iso = _now

def _clean_user_id(user_id: Optional[str]) -> Optional[str]:
    """Sanitize and validate user_id string."""
    if not user_id:
        return None
    uid = str(user_id).strip()
    if not uid or uid.lower() in ("undefined", "null", "none", "false", "true", "0"):
        return None
    return uid

def _ensure_uuid(val: Optional[str]) -> Optional[str]:
    return _clean_user_id(val)

# ─────────────────────────── In-Memory Fast Cache ────────────────────────
_in_memory_reports: Dict[str, dict] = {}
_in_memory_report_chunks: Dict[str, List[dict]] = {}
_in_memory_calls: Dict[str, dict] = {}
_in_memory_voice_campaigns: Dict[str, dict] = {}
_in_memory_video_calls: Dict[str, dict] = {}
_in_memory_calendar_events: Dict[str, dict] = {}
_in_memory_profiles: Dict[str, dict] = {}
_in_memory_voice_settings: Dict[str, str] = {}

# ─────────────────────────── Startup Initialization ──────────────────────

async def init_db():
    """Verify MongoDB connectivity and establish collection indexes on startup."""
    global _mongo_connected, _mongo_client, _mongo_db
    primary_uri = os.getenv("MONGODB_URI", MONGODB_URI).strip()
    db_name = os.getenv("MONGODB_DB_NAME", MONGODB_DB_NAME).strip()

    connected = False
    try:
        db = get_mongo_db()
        await db.command("ping")
        connected = True
        _mongo_connected = True
        logger.info(f"MongoDB connected successfully to primary database [DB: {db_name}]")
    except Exception as e:
        logger.warning(
            f"Primary MongoDB connection to {primary_uri} failed: {e}. "
            f"If using MongoDB Atlas, ensure your IP is added to the Atlas Network Access list (0.0.0.0/0)."
        )
        if "localhost" not in primary_uri and "127.0.0.1" not in primary_uri:
            try:
                local_client = AsyncIOMotorClient("mongodb://127.0.0.1:27017", serverSelectionTimeoutMS=2000)
                await local_client.admin.command("ping")
                _mongo_client = local_client
                _mongo_db = local_client[db_name]
                connected = True
                _mongo_connected = True
                logger.info("Fell back to local MongoDB daemon on 127.0.0.1:27017 for uninterrupted development.")
            except Exception:
                pass

    if connected and _mongo_db is not None:
        try:
            await _mongo_db["profiles"].create_index("id", unique=True, background=True)
            await _mongo_db["profiles"].create_index("email", background=True)
            await _mongo_db["reports"].create_index("id", unique=True, background=True)
            await _mongo_db["reports"].create_index("user_id", background=True)
            await _mongo_db["reports"].create_index("created_at", background=True)
            await _mongo_db["report_chunks"].create_index(
                [("report_id", 1), ("chunk_id", 1)], unique=True, background=True
            )
            await _mongo_db["voice_calls"].create_index("id", unique=True, background=True)
            await _mongo_db["voice_calls"].create_index("user_id", background=True)
            await _mongo_db["voice_calls"].create_index("created_at", background=True)
            await _mongo_db["video_calls"].create_index("id", unique=True, background=True)
            await _mongo_db["video_calls"].create_index("user_id", background=True)
            await _mongo_db["calendar_events"].create_index("id", unique=True, background=True)
            await _mongo_db["calendar_events"].create_index("user_id", background=True)
            await _mongo_db["calendar_events"].create_index("start_time", background=True)
            logger.info("MongoDB collection indexes verified.")
        except Exception as idx_err:
            logger.warning(f"Note on MongoDB index creation: {idx_err}")
    else:
        _mongo_connected = False
        logger.warning("MongoDB operating in in-memory resilient cache mode until database connectivity is established.")

# ─────────────────────────── Profiles Operations (MongoDB) ───────────────

async def get_profile(user_id: str) -> Optional[dict]:
    """Fetch user profile from MongoDB by user ID with memory fallback."""
    clean_uid = _clean_user_id(user_id)
    if not clean_uid:
        return None

    try:
        db = get_mongo_db()
        doc = await db["profiles"].find_one({"id": clean_uid})
        if doc:
            cleaned = _clean_doc(doc)
            _in_memory_profiles[clean_uid] = cleaned
            return cleaned
    except Exception as e:
        logger.warning(f"MongoDB get_profile error for {clean_uid}: {e}")

    return _in_memory_profiles.get(clean_uid)

async def get_profile_by_email(email: str) -> Optional[dict]:
    """Fetch user profile from MongoDB by user email with memory fallback."""
    clean_email = str(email).strip().lower()
    if not clean_email:
        return None

    try:
        db = get_mongo_db()
        doc = await db["profiles"].find_one({"email": clean_email})
        if doc:
            cleaned = _clean_doc(doc)
            if cleaned.get("id"):
                _in_memory_profiles[cleaned["id"]] = cleaned
            return cleaned
    except Exception as e:
        logger.warning(f"MongoDB get_profile_by_email error for {clean_email}: {e}")

    for p in _in_memory_profiles.values():
        if p.get("email", "").lower() == clean_email:
            return p
    return None

async def upsert_profile(user_id: str, profile_data: dict) -> dict:
    """Insert or update user profile and onboarding data in MongoDB."""
    clean_uid = _clean_user_id(user_id) or str(uuid.uuid4())
    now = _now()
    existing = await get_profile(clean_uid) or {}

    merged = dict(existing)
    merged.update(profile_data)
    merged["id"] = clean_uid
    merged["updated_at"] = now
    if "created_at" not in merged:
        merged["created_at"] = now

    _in_memory_profiles[clean_uid] = merged

    try:
        db = get_mongo_db()
        mongo_set = {k: v for k, v in merged.items() if k != "_id"}
        await db["profiles"].update_one(
            {"id": clean_uid},
            {"$set": mongo_set},
            upsert=True
        )
    except Exception as e:
        logger.warning(f"MongoDB upsert_profile error for {clean_uid}: {e}")

    return merged

# ─────────────────────────── Reports Operations (MongoDB) ────────────────

async def create_report(input_urls: dict, user_id: Optional[str] = None) -> str:
    """Insert a new pending report in MongoDB; returns generated UUID."""
    report_id = str(uuid.uuid4())
    now = _now()
    clean_uid = _clean_user_id(user_id)

    doc = {
        "id": report_id,
        "input_urls": input_urls,
        "status": "pending",
        "raw_profile": None,
        "analysis": None,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
        "user_id": clean_uid,
    }

    _in_memory_reports[report_id] = doc

    try:
        db = get_mongo_db()
        await db["reports"].insert_one(dict(doc))
    except Exception as e:
        logger.warning(f"MongoDB create_report error for {report_id}: {e}")

    return report_id

async def update_status(report_id: str, status: str, error_message: Optional[str] = None):
    """Update report status and error message in MongoDB and memory."""
    updates = {"status": status, "updated_at": _now()}
    if error_message is not None:
        updates["error_message"] = error_message

    if report_id in _in_memory_reports:
        _in_memory_reports[report_id].update(updates)

    try:
        db = get_mongo_db()
        await db["reports"].update_one({"id": report_id}, {"$set": updates})
    except Exception as e:
        logger.warning(f"MongoDB update_status error for {report_id}: {e}")

async def update_raw_profile(report_id: str, raw_profile: dict):
    """Store scraped and normalized business profile in MongoDB and memory."""
    updates = {"raw_profile": raw_profile, "updated_at": _now()}
    if report_id in _in_memory_reports:
        _in_memory_reports[report_id].update(updates)

    try:
        db = get_mongo_db()
        await db["reports"].update_one({"id": report_id}, {"$set": updates})
    except Exception as e:
        logger.warning(f"MongoDB update_raw_profile error for {report_id}: {e}")


async def replace_report_chunks(report_id: str, chunks: List[dict]) -> None:
    """Persist full extracted chunks for report-scoped retrieval fallback."""
    records = [{**chunk, "report_id": report_id} for chunk in chunks]
    _in_memory_report_chunks[report_id] = records
    try:
        collection = get_mongo_db()["report_chunks"]
        if records:
            operations = [
                ReplaceOne(
                    {"report_id": report_id, "chunk_id": record["chunk_id"]},
                    record,
                    upsert=True,
                )
                for record in records
            ]
            await collection.bulk_write(operations, ordered=False)
            await collection.delete_many({
                "report_id": report_id,
                "chunk_id": {"$nin": [record["chunk_id"] for record in records]},
            })
        else:
            await collection.delete_many({"report_id": report_id})
    except Exception as exc:
        logger.warning("MongoDB report chunk write failed for %s: %s", report_id, exc)


async def get_report_chunks(report_id: str) -> List[dict]:
    """Get only one report's canonical chunks, with process-local fallback."""
    try:
        cursor = get_mongo_db()["report_chunks"].find({"report_id": report_id}, {"_id": 0})
        records = await cursor.to_list(length=None)
        if records:
            _in_memory_report_chunks[report_id] = records
            return records
    except Exception as exc:
        logger.warning("MongoDB report chunk read failed for %s: %s", report_id, exc)
    return list(_in_memory_report_chunks.get(report_id, []))

async def update_analysis(report_id: str, analysis: dict):
    """Store Groq intelligence analysis and mark report done in MongoDB and memory."""
    updates = {"analysis": analysis, "status": "done", "updated_at": _now()}
    if report_id in _in_memory_reports:
        _in_memory_reports[report_id].update(updates)

    try:
        db = get_mongo_db()
        await db["reports"].update_one({"id": report_id}, {"$set": updates})
    except Exception as e:
        logger.warning(f"MongoDB update_analysis error for {report_id}: {e}")

def _ensure_visual_intelligence(report: dict) -> tuple[dict, bool]:
    """Ensures timeline_roadmap is present for visual presentation."""
    analysis = report.get("analysis")
    if not analysis or not isinstance(analysis, dict):
        return report, False

    needs_update = False
    is_website_mode = analysis.get("data_source_mode") != "uploaded_file"

    if is_website_mode:
        if analysis.get("growth_forecast"):
            analysis["growth_forecast"] = []
            needs_update = True
        if analysis.get("conversion_funnel"):
            analysis["conversion_funnel"] = []
            needs_update = True

    if not analysis.get("timeline_roadmap"):
        try:
            from app.services.data_engine import synthesize_website_figures
            company = analysis.get("company_name") or "Target Company"
            ind = analysis.get("industry") or "B2B Commercial Enterprise"
            opp = analysis.get("opportunity_score") or 85
            prods = analysis.get("products_services") or []

            synth = synthesize_website_figures(
                company_name=company,
                industry=ind,
                opportunity_score=opp,
                products=prods,
            )
            if synth.get("timeline_roadmap"):
                analysis["timeline_roadmap"] = synth["timeline_roadmap"]
                needs_update = True
        except Exception as e:
            logger.warning(f"Error ensuring timeline for report {report.get('id')}: {e}")

    report["analysis"] = analysis
    return report, needs_update

async def get_report(report_id: str) -> Optional[dict]:
    """Fetch single intelligence report by ID from MongoDB with in-memory fallback."""
    try:
        db = get_mongo_db()
        doc = await db["reports"].find_one({"id": report_id})
        if doc:
            report = _clean_doc(doc)
            report, updated = _ensure_visual_intelligence(report)
            if updated:
                asyncio.create_task(update_analysis(report_id, report["analysis"]))
            _in_memory_reports[report_id] = report
            return report
    except Exception as e:
        logger.warning(f"MongoDB get_report error for {report_id}: {e}")

    if report_id in _in_memory_reports:
        rep = dict(_in_memory_reports[report_id])
        rep, _ = _ensure_visual_intelligence(rep)
        return rep

    return None

async def list_reports(user_id: Optional[str] = None, limit: int = 50) -> List[dict]:
    """List recent intelligence reports from MongoDB with in-memory fallback."""
    clean_uid = _clean_user_id(user_id)
    query: Dict[str, Any] = {}
    if clean_uid:
        query = {"$or": [{"user_id": clean_uid}, {"user_id": None}]}

    try:
        db = get_mongo_db()
        cursor = db["reports"].find(query).sort("created_at", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        enriched_list = []
        seen_ids = set()
        for d in docs:
            r = _clean_doc(d)
            enriched, updated = _ensure_visual_intelligence(r)
            if updated and r.get("id"):
                asyncio.create_task(update_analysis(r["id"], enriched["analysis"]))
            enriched_list.append(enriched)
            if r.get("id"):
                seen_ids.add(r["id"])

        for mid, mrep in _in_memory_reports.items():
            if mid not in seen_ids:
                if not clean_uid or mrep.get("user_id") in (clean_uid, None):
                    rep_copy = dict(mrep)
                    rep_copy, _ = _ensure_visual_intelligence(rep_copy)
                    enriched_list.insert(0, rep_copy)

        return enriched_list[:limit]
    except Exception as e:
        logger.warning(f"MongoDB list_reports error: {e}")
        return list(_in_memory_reports.values())[:limit]

# ─────────────────────────── Voice Fleet Operations (MongoDB) ────────────

async def create_voice_call(call_data: dict, user_id: Optional[str] = None) -> str:
    """Insert a new voice call record in MongoDB."""
    call_id = call_data.get("id") or str(uuid.uuid4())
    now = _now()
    clean_uid = _clean_user_id(user_id) or _clean_user_id(call_data.get("user_id"))

    transcript = call_data.get("transcript", [])
    if isinstance(transcript, str):
        try:
            transcript = json.loads(transcript)
        except Exception:
            transcript = []

    analysis = call_data.get("analysis")
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except Exception:
            analysis = None

    row = {
        "id": call_id,
        "campaign_id": call_data.get("campaign_id"),
        "direction": call_data.get("direction", "outbound"),
        "customer_name": call_data.get("customer_name", "Customer"),
        "customer_phone": call_data.get("customer_phone", ""),
        "business_name": call_data.get("business_name", "Business"),
        "call_reason": call_data.get("call_reason", "Outbound Consultation"),
        "status": call_data.get("status", "queued"),
        "vapi_call_id": call_data.get("vapi_call_id"),
        "duration_seconds": call_data.get("duration_seconds", 0),
        "started_at": call_data.get("started_at", now),
        "ended_at": call_data.get("ended_at"),
        "transcript": transcript,
        "recording_url": call_data.get("recording_url"),
        "analysis": analysis,
        "error_message": call_data.get("error_message"),
        "created_at": now,
        "updated_at": now,
        "user_id": clean_uid,
    }

    _in_memory_calls[call_id] = dict(row)

    try:
        db = get_mongo_db()
        await db["voice_calls"].insert_one(dict(row))
    except Exception as e:
        logger.warning(f"MongoDB create_voice_call error for {call_id}: {e}")

    return call_id

async def update_voice_call(call_id: str, updates: dict):
    """Update fields of an existing voice call record in MongoDB and memory."""
    clean_updates = dict(updates)
    clean_updates["updated_at"] = _now()

    for k in ("transcript", "analysis"):
        if k in clean_updates and isinstance(clean_updates[k], str):
            try:
                clean_updates[k] = json.loads(clean_updates[k])
            except Exception:
                pass

    if call_id in _in_memory_calls:
        _in_memory_calls[call_id].update(clean_updates)

    try:
        db = get_mongo_db()
        await db["voice_calls"].update_one({"id": call_id}, {"$set": clean_updates})
    except Exception as e:
        logger.warning(f"MongoDB update_voice_call error for {call_id}: {e}")

async def get_voice_call(call_id: str) -> Optional[dict]:
    """Fetch single voice call by ID from MongoDB."""
    try:
        db = get_mongo_db()
        doc = await db["voice_calls"].find_one({"id": call_id})
        if doc:
            cleaned = _clean_doc(doc)
            _in_memory_calls[call_id] = cleaned
            return cleaned
    except Exception as e:
        logger.warning(f"MongoDB get_voice_call error for {call_id}: {e}")

    return _in_memory_calls.get(call_id)

async def list_voice_calls(
    user_id: Optional[str] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    campaign_id: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    """List recent voice calls with optional filtering from MongoDB."""
    clean_uid = _clean_user_id(user_id)
    query: Dict[str, Any] = {}
    if clean_uid:
        query["$or"] = [{"user_id": clean_uid}, {"user_id": None}]
    if direction and direction != "all":
        query["direction"] = direction
    if status and status != "all":
        query["status"] = status
    if campaign_id:
        query["campaign_id"] = campaign_id

    try:
        db = get_mongo_db()
        cursor = db["voice_calls"].find(query).sort("created_at", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [_clean_doc(d) for d in docs]
    except Exception as e:
        logger.warning(f"MongoDB list_voice_calls error: {e}")
        calls = list(_in_memory_calls.values())
        if clean_uid:
            calls = [c for c in calls if c.get("user_id") in (clean_uid, None)]
        if direction and direction != "all":
            calls = [c for c in calls if c.get("direction") == direction]
        if status and status != "all":
            calls = [c for c in calls if c.get("status") == status]
        return calls[:limit]

async def delete_voice_call(call_id: str) -> bool:
    """Delete a voice call record from MongoDB and memory."""
    if call_id in _in_memory_calls:
        del _in_memory_calls[call_id]

    try:
        db = get_mongo_db()
        res = await db["voice_calls"].delete_one({"id": call_id})
        return res.deleted_count > 0
    except Exception as e:
        logger.warning(f"MongoDB delete_voice_call error for {call_id}: {e}")
        return True

async def get_voice_stats(user_id: Optional[str] = None) -> dict:
    """Compute aggregate call stats for dashboard KPI cards from MongoDB."""
    stats = {
        "total_calls": 0,
        "outbound_calls": 0,
        "inbound_calls": 0,
        "completed_calls": 0,
        "in_progress_calls": 0,
        "failed_calls": 0,
        "avg_duration_seconds": 0,
        "hot_leads": 0,
        "positive_sentiment": 0,
    }

    rows = await list_voice_calls(user_id=user_id, limit=500)
    stats["total_calls"] = len(rows)

    total_dur = 0
    dur_count = 0

    for r in rows:
        dir_val = (r.get("direction") or "outbound").lower()
        status_val = (r.get("status") or "").lower()
        dur = int(r.get("duration_seconds") or 0)

        if dir_val == "outbound":
            stats["outbound_calls"] += 1
        elif dir_val == "inbound":
            stats["inbound_calls"] += 1

        if status_val in ("completed", "ended"):
            stats["completed_calls"] += 1
        elif status_val in ("in-progress", "ringing", "queued"):
            stats["in_progress_calls"] += 1
        elif status_val in ("failed", "no-answer", "busy", "canceled"):
            stats["failed_calls"] += 1

        if dur > 0:
            total_dur += dur
            dur_count += 1

        analysis = r.get("analysis")
        if analysis:
            if isinstance(analysis, str):
                try:
                    analysis = json.loads(analysis)
                except Exception:
                    analysis = {}
            if isinstance(analysis, dict):
                if analysis.get("lead_temperature") == "Hot" or (analysis.get("intent_score") or 0) >= 75:
                    stats["hot_leads"] += 1
                if analysis.get("sentiment") == "positive":
                    stats["positive_sentiment"] += 1

    if dur_count > 0:
        stats["avg_duration_seconds"] = int(total_dur / dur_count)

    return stats

async def get_voice_settings() -> dict:
    """Retrieve saved voice/telephony settings from MongoDB."""
    try:
        db = get_mongo_db()
        cursor = db["voice_settings"].find({})
        docs = await cursor.to_list(length=100)
        return {d["key"]: d["value"] for d in docs if "key" in d and "value" in d}
    except Exception as e:
        logger.warning(f"MongoDB get_voice_settings error: {e}")
        return dict(_in_memory_voice_settings)

async def save_voice_settings(settings: dict) -> dict:
    """Upsert voice/telephony settings in MongoDB."""
    now = _now()
    _in_memory_voice_settings.update({k: str(v) for k, v in settings.items()})

    try:
        db = get_mongo_db()
        for k, v in settings.items():
            val_str = json.dumps(v) if not isinstance(v, str) else v
            await db["voice_settings"].update_one(
                {"key": k},
                {"$set": {"key": k, "value": val_str, "updated_at": now}},
                upsert=True
            )
    except Exception as e:
        logger.warning(f"MongoDB save_voice_settings error: {e}")

    return await get_voice_settings()

# ─────────────────────────── Video Sales Agent Operations (MongoDB) ──────

async def create_video_call(call_data: dict, user_id: Optional[str] = None) -> str:
    """Insert a new video call record in MongoDB."""
    call_id = call_data.get("id") or str(uuid.uuid4())
    now = _now()
    clean_uid = _clean_user_id(user_id) or _clean_user_id(call_data.get("user_id"))

    briefing = call_data.get("briefing")
    if isinstance(briefing, str):
        try:
            briefing = json.loads(briefing)
        except Exception:
            briefing = None

    transcript = call_data.get("transcript", [])
    if isinstance(transcript, str):
        try:
            transcript = json.loads(transcript)
        except Exception:
            transcript = []

    analysis = call_data.get("analysis")
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except Exception:
            analysis = None

    row = {
        "id": call_id,
        "report_id": call_data.get("report_id"),
        "customer_name": call_data.get("customer_name") or "Prospect",
        "customer_email": call_data.get("customer_email"),
        "customer_phone": call_data.get("customer_phone"),
        "business_name": call_data.get("business_name") or "Enterprise",
        "call_reason": call_data.get("call_reason"),
        "status": call_data.get("status", "active"),
        "tavus_conversation_id": call_data.get("tavus_conversation_id"),
        "tavus_persona_id": call_data.get("tavus_persona_id"),
        "conversational_context": call_data.get("conversational_context"),
        "custom_greeting": call_data.get("custom_greeting"),
        "conversation_url": call_data.get("conversation_url"),
        "duration_seconds": call_data.get("duration_seconds", 0),
        "briefing": briefing,
        "transcript": transcript,
        "recording_url": call_data.get("recording_url"),
        "analysis": analysis,
        "error_message": call_data.get("error_message"),
        "started_at": call_data.get("started_at", now),
        "ended_at": call_data.get("ended_at"),
        "created_at": now,
        "updated_at": now,
        "user_id": clean_uid,
    }

    _in_memory_video_calls[call_id] = dict(row)

    try:
        db = get_mongo_db()
        await db["video_calls"].insert_one(dict(row))
    except Exception as e:
        logger.warning(f"MongoDB create_video_call error for {call_id}: {e}")

    return call_id

async def update_video_call(call_id: str, updates: dict):
    """Update fields of an existing video call record in MongoDB and memory."""
    clean_updates = dict(updates)
    clean_updates["updated_at"] = _now()

    if call_id in _in_memory_video_calls:
        _in_memory_video_calls[call_id].update(clean_updates)

    for k in ("briefing", "transcript", "analysis"):
        if k in clean_updates and isinstance(clean_updates[k], str):
            try:
                clean_updates[k] = json.loads(clean_updates[k])
            except Exception:
                pass

    try:
        db = get_mongo_db()
        await db["video_calls"].update_one({"id": call_id}, {"$set": clean_updates})
    except Exception as e:
        logger.warning(f"MongoDB update_video_call error for {call_id}: {e}")

async def get_video_call(call_id: str) -> Optional[dict]:
    """Fetch single video call by ID from MongoDB with memory fallback."""
    try:
        db = get_mongo_db()
        doc = await db["video_calls"].find_one({"id": call_id})
        if doc:
            cleaned = _clean_doc(doc)
            _in_memory_video_calls[call_id] = cleaned
            return cleaned
    except Exception as e:
        logger.warning(f"MongoDB get_video_call error for {call_id}: {e}")

    return _in_memory_video_calls.get(call_id)

async def list_video_calls(
    user_id: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    """List recent video calls for a user from MongoDB with memory fallback."""
    clean_uid = _clean_user_id(user_id)
    query: Dict[str, Any] = {}
    if clean_uid:
        query["$or"] = [{"user_id": clean_uid}, {"user_id": None}]

    try:
        db = get_mongo_db()
        cursor = db["video_calls"].find(query).sort("created_at", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [_clean_doc(d) for d in docs]
    except Exception as e:
        logger.warning(f"MongoDB list_video_calls error: {e}")
        calls = list(_in_memory_video_calls.values())
        if clean_uid:
            calls = [c for c in calls if c.get("user_id") in (clean_uid, None)]
        return calls[:limit]

async def get_video_call_by_tavus_id(tavus_conversation_id: str) -> Optional[dict]:
    """Fetch single video call by Tavus conversation ID from MongoDB with memory fallback."""
    try:
        db = get_mongo_db()
        doc = await db["video_calls"].find_one({"tavus_conversation_id": tavus_conversation_id})
        if doc:
            return _clean_doc(doc)
    except Exception as e:
        logger.warning(f"MongoDB get_video_call_by_tavus_id error: {e}")

    for c in _in_memory_video_calls.values():
        if c.get("tavus_conversation_id") == tavus_conversation_id:
            return c
    return None

# ─────────────────────────── Calendar Events (MongoDB) ───────────────────

async def create_calendar_event(event_data: dict, user_id: Optional[str] = None) -> str:
    """Create a new scheduled meeting or call calendar event in MongoDB."""
    event_id = event_data.get("id") or str(uuid.uuid4())
    clean_uid = _clean_user_id(user_id or event_data.get("user_id"))
    now = _now_iso()

    row = {
        "id": event_id,
        "user_id": clean_uid,
        "call_id": event_data.get("call_id"),
        "report_id": event_data.get("report_id"),
        "customer_name": event_data.get("customer_name") or "Prospective Buyer",
        "customer_phone": event_data.get("customer_phone"),
        "customer_email": event_data.get("customer_email"),
        "company_name": event_data.get("company_name"),
        "title": event_data.get("title") or f"Sales Meeting with {event_data.get('customer_name', 'Lead')}",
        "description": event_data.get("description") or "",
        "start_time": event_data.get("start_time") or now,
        "end_time": event_data.get("end_time") or now,
        "meeting_type": event_data.get("meeting_type") or "google_meet",
        "meet_url": event_data.get("meet_url"),
        "status": event_data.get("status") or "scheduled",
        "reminder_minutes": event_data.get("reminder_minutes") or 15,
        "remind_via": event_data.get("remind_via") or "popup",
        "google_event_id": event_data.get("google_event_id"),
        "synced_to_google": bool(event_data.get("synced_to_google", False)),
        "created_at": now,
        "updated_at": now,
    }

    _in_memory_calendar_events[event_id] = dict(row)

    try:
        db = get_mongo_db()
        await db["calendar_events"].insert_one(dict(row))
    except Exception as e:
        logger.warning(f"MongoDB create_calendar_event error for {event_id}: {e}")

    return event_id

async def get_calendar_event(event_id: str) -> Optional[dict]:
    """Fetch a single calendar event by UUID from MongoDB with memory fallback."""
    try:
        db = get_mongo_db()
        doc = await db["calendar_events"].find_one({"id": event_id})
        if doc:
            cleaned = _clean_doc(doc)
            _in_memory_calendar_events[event_id] = cleaned
            return cleaned
    except Exception as e:
        logger.warning(f"MongoDB get_calendar_event error for {event_id}: {e}")

    return _in_memory_calendar_events.get(event_id)

async def list_calendar_events(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    customer_name: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    """List calendar events from MongoDB filtered by user, status, date bounds, or customer name."""
    clean_uid = _clean_user_id(user_id)
    query: Dict[str, Any] = {}
    if clean_uid:
        query["$or"] = [{"user_id": clean_uid}, {"user_id": None}]
    if status and status != "all":
        query["status"] = status
    if start_date:
        query["start_time"] = {"$gte": start_date}
    if end_date:
        if "start_time" in query:
            query["start_time"]["$lte"] = end_date
        else:
            query["start_time"] = {"$lte": end_date}
    if customer_name:
        query["customer_name"] = {"$regex": customer_name, "$options": "i"}

    try:
        db = get_mongo_db()
        cursor = db["calendar_events"].find(query).sort("start_time", 1).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [_clean_doc(d) for d in docs]
    except Exception as e:
        logger.warning(f"MongoDB list_calendar_events error: {e}")
        events = list(_in_memory_calendar_events.values())
        if clean_uid:
            events = [e for e in events if e.get("user_id") in (clean_uid, None)]
        if status and status != "all":
            events = [e for e in events if e.get("status") == status]
        if customer_name:
            cn_lower = customer_name.lower()
            events = [e for e in events if cn_lower in str(e.get("customer_name") or "").lower()]
        events.sort(key=lambda x: str(x.get("start_time") or ""))
        return events[:limit]

async def update_calendar_event(event_id: str, updates: dict) -> Optional[dict]:
    """Update fields on a calendar event in MongoDB and memory."""
    clean_updates = dict(updates)
    clean_updates["updated_at"] = _now_iso()

    if event_id in _in_memory_calendar_events:
        _in_memory_calendar_events[event_id].update(clean_updates)

    try:
        db = get_mongo_db()
        await db["calendar_events"].update_one({"id": event_id}, {"$set": clean_updates})
        doc = await db["calendar_events"].find_one({"id": event_id})
        if doc:
            return _clean_doc(doc)
    except Exception as e:
        logger.warning(f"MongoDB update_calendar_event error for {event_id}: {e}")

    return _in_memory_calendar_events.get(event_id)

async def delete_calendar_event(event_id: str) -> bool:
    """Delete a calendar event from MongoDB and memory."""
    if event_id in _in_memory_calendar_events:
        del _in_memory_calendar_events[event_id]

    try:
        db = get_mongo_db()
        res = await db["calendar_events"].delete_one({"id": event_id})
        return res.deleted_count > 0
    except Exception as e:
        logger.warning(f"MongoDB delete_calendar_event error for {event_id}: {e}")
        return True
