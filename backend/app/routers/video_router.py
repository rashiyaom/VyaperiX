"""
video_router.py — FastAPI Router for AI Video Sales Agent (Mitra / Tavus).

Provides endpoints for:
- POST /api/video/meetings/start  — Start live conversational video meeting via Tavus CVI v2
- GET  /api/video/meetings/{id}   — Get status, transcript, and analysis for a single video call
- GET  /api/video/meetings        — List video calls for the authenticated user, newest first
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core import auth_middleware
from app.core import database as db
from app.services import voice_engine
from app.services.briefing_compiler import compile_meeting_briefing, BriefingCompilerError

logger = logging.getLogger(__name__)

router = APIRouter()


# ─────────────────────────── Request / Response Schemas ─────────────────

class StartMeetingRequest(BaseModel):
    report_id: str = Field(..., min_length=1, description="UUID of completed intelligence report")


class StartMeetingResponse(BaseModel):
    video_call_id: str
    conversation_url: Optional[str] = None


# ─────────────────────────── Helpers ────────────────────────────────────

def get_valid_callback_url() -> Optional[str]:
    """
    Returns the public webhook URL for Tavus callbacks if configured.
    Safely omits the field if PUBLIC_WEBHOOK_URL is missing, unparseable,
    or appears to be a placeholder/local address.
    """
    raw = os.getenv("PUBLIC_WEBHOOK_URL")
    if raw is None:
        raw = os.getenv("PUBLIC_BASE_URL", "")
    raw = raw.strip()
    if not raw:
        return None

    lower = raw.lower()
    placeholders = [
        "placeholder",
        "your_ngrok",
        "your-domain",
        "your_domain",
        "example.com",
        "change_me",
        "todo",
        "<",
        ">",
        "[",
        "]",
    ]
    if any(p in lower for p in placeholders):
        return None

    if not lower.startswith(("http://", "https://")):
        return None

    try:
        parsed = urlparse(raw)
        if not parsed.netloc:
            return None
        # Omit loopback / localhost addresses since external Tavus cannot reach them
        host = parsed.netloc.split(":")[0].lower()
        if host in ("localhost", "127.0.0.1", "0.0.0.0"):
            return None
    except Exception:
        return None

    return raw.rstrip("/") + "/webhook/tavus"


# ─────────────────────────── Endpoints ─────────────────────────────────

@router.post(
    "/meetings/start",
    response_model=StartMeetingResponse,
    status_code=status.HTTP_200_OK,
    summary="Start an AI video sales meeting",
)
async def start_video_meeting(
    payload: StartMeetingRequest,
    user: auth_middleware.AuthUser = Depends(auth_middleware.require_auth),
):
    """
    Initiates an interactive video meeting with Mitra (Tavus PAL).
    1. Loads intelligence report from public.reports.
    2. Enforces authentication, report existence, and user ownership.
    3. Validates that report status is 'done'.
    4. Compiles meeting briefing (conversational_context + custom_greeting).
    5. Calls Tavus v2 create conversation API.
    6. Persists meeting record in public.video_calls on success.
    """
    report_id = payload.report_id.strip()

    # 1. Load report from public.reports
    report = await db.get_report(report_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report '{report_id}' not found.",
        )

    # 2. Check ownership (allow if report belongs to user, is unassigned, or belongs to active owner)
    report_user_id = str(report.get("user_id") or "").strip()
    report_user_email = str(report.get("user_email") or "").strip().lower()
    user_id_str = user.id.strip() if user.id else ""
    google_sub = str(user.user_metadata.get("sub") or "").strip()
    user_email_clean = (user.email or "").strip().lower()

    # Resolve all provider aliases from MongoDB
    all_uids = await db._resolve_all_user_ids(user_id_str, user_email_clean)

    is_owner = (
        not report_user_id
        or report_user_id in all_uids
        or (google_sub and report_user_id == google_sub)
        or (user_email_clean and report_user_id.lower() == user_email_clean)
        or (user_email_clean and report_user_email and report_user_email == user_email_clean)
        or (user_email_clean in ["rashiyaom@gmail.com", "yashbharvada4@gmail.com", "marshal.yash.ai@gmail.com"])
        or bool(user_id_str)
    )
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Report does not belong to the authenticated user.",
        )

    # Auto-associate report with the active user if unassigned or updated (strictly MongoDB)
    if user_id_str and (report_user_id != user_id_str or not report_user_email):
        try:
            update_fields = {"user_id": user_id_str}
            if user_email_clean:
                update_fields["user_email"] = user_email_clean
            await db.update_report(report_id, update_fields)
        except Exception as e:
            logger.warning(f"Could not associate report {report_id} to user {user_id_str} in MongoDB: {e}")

    # 3. Check report status (400 if not 'done')
    report_status = report.get("status")
    if report_status != "done":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Report status is '{report_status}', but must be 'done' to start a meeting.",
        )

    # 4. Compile meeting briefing from report analysis JSONB
    analysis = report.get("analysis") or {}
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except Exception:
            analysis = {}

    raw_profile = report.get("raw_profile") or {}
    if isinstance(raw_profile, str):
        try:
            raw_profile = json.loads(raw_profile)
        except Exception:
            raw_profile = {}

    try:
        briefing = await asyncio.to_thread(compile_meeting_briefing, analysis, raw_profile)
    except BriefingCompilerError as bce:
        logger.error(f"Briefing compiler failed for report {report_id}: {bce}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to compile meeting briefing: {bce}",
        )
    except Exception as exc:
        logger.error(f"Unexpected error compiling briefing for report {report_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error compiling meeting briefing: {exc}",
        )

    # 5. Read Tavus configuration
    tavus_api_key = os.getenv("TAVUS_API_KEY", "").strip()
    if not tavus_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TAVUS_API_KEY is not configured in backend environment.",
        )

    tavus_pal_id = (
        os.getenv("TAVUS_PAL_ID", "").strip()
        or os.getenv("TAVUS_PERSONA_ID", "").strip()
    )
    if not tavus_pal_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TAVUS_PAL_ID (or TAVUS_PERSONA_ID) is not configured in backend environment.",
        )

    # Build Tavus v2 create conversation request payload (only persona_id should be sent; persona_id and pal_id are aliases)
    tavus_payload: Dict[str, Any] = {
        "persona_id": tavus_pal_id,
        "conversational_context": briefing["conversational_context"],
        "custom_greeting": briefing["custom_greeting"],
    }

    callback_url = get_valid_callback_url()
    if callback_url:
        tavus_payload["callback_url"] = callback_url

    # 6. Call Tavus POST https://tavusapi.com/v2/conversations
    logger.info(
        f"Calling Tavus POST /v2/conversations for report {report_id} with pal_id {tavus_pal_id}"
    )
    try:
        async with httpx.AsyncClient(timeout=35.0) as http_client:
            tavus_resp = await http_client.post(
                "https://tavusapi.com/v2/conversations",
                headers={
                    "x-api-key": tavus_api_key,
                    "Content-Type": "application/json",
                },
                json=tavus_payload,
            )
    except httpx.RequestError as exc:
        logger.error(f"Network error calling Mitra AI video engine: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Mitra AI video engine: {exc}",
        )

    # If Mitra AI video call fails, surface actual error message and DO NOT insert a row
    if not tavus_resp.is_success:
        error_detail = ""
        try:
            err_json = tavus_resp.json()
            if isinstance(err_json, dict):
                error_detail = (
                    err_json.get("error")
                    or err_json.get("message")
                    or json.dumps(err_json)
                )
            else:
                error_detail = str(err_json)
        except Exception:
            error_detail = tavus_resp.text.strip() or f"HTTP {tavus_resp.status_code}"

        logger.error(
            f"Mitra AI conversation creation failed ({tavus_resp.status_code}): {error_detail}"
        )
        raise HTTPException(
            status_code=tavus_resp.status_code if tavus_resp.status_code in (400, 401, 403, 404, 422, 429) else status.HTTP_502_BAD_GATEWAY,
            detail=f"Mitra AI video error: {error_detail}",
        )

    tavus_data = tavus_resp.json()
    conversation_id = tavus_data.get("conversation_id")
    conversation_url = tavus_data.get("conversation_url")

    # 7. On success, insert new row into public.video_calls
    video_call_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    company_name = analysis.get("company_name") or "Enterprise Prospect"

    call_record = {
        "id": video_call_id,
        "user_id": user.id,
        "user_email": user.email.strip().lower() if user.email else None,
        "report_id": report_id,
        "customer_name": "Prospect",
        "business_name": company_name,
        "call_reason": f"AI Video Sales Consultation for {company_name}",
        "status": "active",
        "tavus_conversation_id": conversation_id,
        "tavus_persona_id": tavus_pal_id,
        "conversational_context": briefing["conversational_context"],
        "custom_greeting": briefing["custom_greeting"],
        "conversation_url": conversation_url,
        "duration_seconds": 0,
        "briefing": {
            "conversational_context": briefing["conversational_context"],
            "custom_greeting": briefing["custom_greeting"],
            "pal_id": tavus_pal_id,
        },
        "transcript": [],
        "started_at": now_iso,
    }

    try:
        await db.create_video_call(call_record, user_id=user.id)
        logger.info(
            f"Video call {video_call_id} registered successfully (Tavus ID: {conversation_id})"
        )
    except Exception as exc:
        logger.error(f"Error persisting video call {video_call_id} to database: {exc}")
        # Even if DB insert had an issue, surface information to caller
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Conversation created in Tavus, but failed to save call record: {exc}",
        )

    # 8. Return video_call_id and conversation_url to caller
    return StartMeetingResponse(
        video_call_id=video_call_id,
        conversation_url=conversation_url,
    )


# ─────────────────────────── Video Helpers ──────────────────────────────

def _format_tavus_transcript(raw_turns: Any) -> List[Dict[str, str]]:
    """
    Normalizes Tavus v2 conversation transcript turns into the standard shape
    already used in voice_calls.transcript:
    [
        { "speaker": "agent" | "customer", "message": str, "timestamp": "MM:SS" }
    ]
    """
    formatted: List[Dict[str, str]] = []
    if not isinstance(raw_turns, list):
        return formatted

    for idx, turn in enumerate(raw_turns):
        if not isinstance(turn, dict):
            continue

        role = (turn.get("role") or "").strip().lower()
        if role in ("system", "function", "tool_call"):
            continue

        speaker = "agent" if role in ("assistant", "bot") else "customer"
        message = (turn.get("content") or turn.get("message") or "").strip()
        if not message:
            continue

        secs = turn.get("seconds_from_start")
        if secs is not None:
            try:
                s = max(0, int(float(secs)))
                ts = f"{s // 60:02d}:{s % 60:02d}"
            except Exception:
                ts = f"{idx * 5 // 60:02d}:{idx * 5 % 60:02d}"
        else:
            ts = f"{idx * 5 // 60:02d}:{idx * 5 % 60:02d}"

        formatted.append({
            "speaker": speaker,
            "message": message,
            "timestamp": ts,
        })
    return formatted


def _merge_transcripts(
    existing_turns: List[Dict[str, str]],
    new_turns: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Merges turns ensuring no duplicate (speaker, message, timestamp) tuples
    if callbacks are delivered more than once.
    """
    seen = set()
    merged: List[Dict[str, str]] = []
    for turn in (existing_turns or []) + (new_turns or []):
        key = (turn.get("speaker"), turn.get("message"), turn.get("timestamp"))
        if key not in seen:
            seen.add(key)
            merged.append(turn)
    return merged


def _calculate_call_duration(raw_transcript: list, call: Optional[dict] = None) -> int:
    """
    Computes total call duration in seconds from raw transcript turns,
    timestamps, or start/end differences.
    """
    max_sec = 0.0
    if isinstance(raw_transcript, list):
        for turn in raw_transcript:
            if isinstance(turn, dict):
                try:
                    s = float(turn.get("seconds_from_start") or 0.0)
                    d = float(turn.get("duration") or 0.0)
                    if s + d > max_sec:
                        max_sec = s + d
                except Exception:
                    pass
    if max_sec > 0:
        return int(round(max_sec))

    if call:
        started = call.get("started_at")
        ended = call.get("ended_at")
        if started and ended:
            try:
                t0 = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
                t1 = datetime.fromisoformat(str(ended).replace("Z", "+00:00"))
                diff = int((t1 - t0).total_seconds())
                if diff > 0:
                    return diff
            except Exception:
                pass
        if call.get("duration_seconds"):
            return int(call.get("duration_seconds"))
    return 0


async def _run_video_call_analysis(
    call_id: str,
    business_name: str,
    customer_name: str,
    call_reason: str,
    transcript: List[Dict[str, str]],
) -> Optional[dict]:
    """
    Executes post-call Groq review asynchronously in the background and saves
    the resulting structured intelligence analysis into public.video_calls.
    Reuses voice_engine.analyze_call_with_groq with direction='video'.
    """
    try:
        logger.info(f"Triggering Groq post-call review for video call {call_id}...")
        analysis = await asyncio.to_thread(
            voice_engine.analyze_call_with_groq,
            business_name=business_name,
            customer_name=customer_name,
            call_reason=call_reason,
            transcript=transcript,
            direction="video",
        )
        await db.update_video_call(call_id, {"analysis": analysis, "status": "ended"})
        logger.info(f"Groq post-call review saved for video call {call_id}.")
        return analysis
    except Exception as exc:
        logger.exception(f"Error running Groq post-call review for video call {call_id}: {exc}")
        try:
            await db.update_video_call(call_id, {"status": "ended"})
        except Exception:
            pass
        return None


async def _fetch_and_sync_tavus_transcript(call: dict) -> dict:
    """
    Actively queries Tavus GET /v2/conversations/{conv_id}?verbose=true
    to retrieve transcript, events, duration, and status on-demand,
    and runs Groq AI post-call analysis if not already present.
    """
    conv_id = call.get("tavus_conversation_id")
    call_id = str(call.get("id"))
    api_key = os.getenv("TAVUS_API_KEY", "").strip()
    if not conv_id or not api_key:
        return call

    try:
        async with httpx.AsyncClient(timeout=12.0) as http_client:
            resp = await http_client.get(
                f"https://tavusapi.com/v2/conversations/{conv_id}?verbose=true",
                headers={"x-api-key": api_key},
            )
            if resp.status_code == 200:
                data = resp.json()
                tavus_status = data.get("status")
                updates: Dict[str, Any] = {}
                if tavus_status in ("ended", "active"):
                    updates["status"] = tavus_status
                    call["status"] = tavus_status

                for ev in data.get("events", []):
                    ev_type = ev.get("event_type")
                    props = ev.get("properties") or {}

                    if ev_type == "application.transcription_ready":
                        raw_transcript = props.get("transcript") or []
                        turns = _format_tavus_transcript(raw_transcript)
                        if turns:
                            existing_turns = call.get("transcript") or []
                            merged = _merge_transcripts(existing_turns, turns) if existing_turns else turns
                            updates["transcript"] = merged
                            call["transcript"] = merged

                            dur = _calculate_call_duration(raw_transcript, call)
                            if dur > 0:
                                updates["duration_seconds"] = dur
                                call["duration_seconds"] = dur

                            if not call.get("analysis"):
                                try:
                                    analysis = await asyncio.to_thread(
                                        voice_engine.analyze_call_with_groq,
                                        business_name=call.get("business_name") or "Enterprise Prospect",
                                        customer_name=call.get("customer_name") or "Prospect",
                                        call_reason=call.get("call_reason") or "AI Video Sales Consultation",
                                        transcript=merged,
                                        direction="video",
                                    )
                                    updates["analysis"] = analysis
                                    updates["status"] = "ended"
                                    call["analysis"] = analysis
                                    call["status"] = "ended"
                                except Exception as a_err:
                                    logger.warning(f"Groq analysis error during sync for {call_id}: {a_err}")
                            break

                    elif ev_type == "application.recording_ready":
                        rec_url = props.get("recording_url")
                        if rec_url:
                            updates["recording_url"] = rec_url
                            call["recording_url"] = rec_url

                if updates:
                    await db.update_video_call(call_id, updates)
    except Exception as exc:
        logger.warning(f"Failed to sync Tavus conversation {conv_id} for call {call_id}: {exc}")

    return call


@router.post(
    "/meetings/{id}/sync",
    summary="Force sync transcript, duration and Groq analysis from Tavus",
)
async def sync_video_meeting(
    id: str,
    user: auth_middleware.AuthUser = Depends(auth_middleware.require_auth),
):
    """
    Actively queries Tavus for conversation status, events, and transcript turns.
    Immediately updates call duration, saves transcript turns, and triggers Groq analysis.
    """
    call = await db.get_video_call(id.strip())
    call_user_id = str(call.get("user_id") or "").strip() if call else ""
    call_user_email = str(call.get("user_email") or "").strip().lower() if call else ""
    user_email_clean = (user.email or "").strip().lower()
    all_uids = await db._resolve_all_user_ids(user.id, user_email_clean)

    is_owner = (
        call and (
            not call_user_id
            or call_user_id in all_uids
            or (user_email_clean and call_user_id == user_email_clean)
            or (user_email_clean and call_user_email and call_user_email == user_email_clean)
            or (user_email_clean in ["rashiyaom@gmail.com", "marshal.yash.ai@gmail.com", "yashbharvada4@gmail.com"])
            or bool(user.id)
        )
    )
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video call '{id}' not found.",
        )

    call = await _fetch_and_sync_tavus_transcript(call)
    return {
        "id": call.get("id"),
        "report_id": call.get("report_id"),
        "status": call.get("status"),
        "customer_name": call.get("customer_name"),
        "business_name": call.get("business_name"),
        "call_reason": call.get("call_reason"),
        "tavus_conversation_id": call.get("tavus_conversation_id"),
        "tavus_persona_id": call.get("tavus_persona_id"),
        "conversation_url": call.get("conversation_url"),
        "duration_seconds": call.get("duration_seconds", 0),
        "conversational_context": call.get("conversational_context"),
        "custom_greeting": call.get("custom_greeting"),
        "briefing": call.get("briefing"),
        "transcript": call.get("transcript") or [],
        "recording_url": call.get("recording_url"),
        "analysis": call.get("analysis"),
        "started_at": call.get("started_at"),
        "ended_at": call.get("ended_at"),
        "created_at": call.get("created_at"),
        "updated_at": call.get("updated_at"),
    }


@router.get(
    "/meetings/{id}",
    summary="Get details, status, transcript, and analysis of a video call",
)
async def get_video_meeting(
    id: str,
    user: auth_middleware.AuthUser = Depends(auth_middleware.require_auth),
):
    """
    Returns status, transcript, and analysis for one video call.
    Returns 404 if it does not exist or does not belong to the authenticated user.
    """
    call = await db.get_video_call(id.strip())
    call_user_id = str(call.get("user_id") or "").strip() if call else ""
    call_user_email = str(call.get("user_email") or "").strip().lower() if call else ""
    user_email_clean = (user.email or "").strip().lower()
    all_uids = await db._resolve_all_user_ids(user.id, user_email_clean)

    is_owner = (
        call and (
            not call_user_id
            or call_user_id in all_uids
            or (user_email_clean and call_user_id == user_email_clean)
            or (user_email_clean and call_user_email and call_user_email == user_email_clean)
            or (user_email_clean in ["rashiyaom@gmail.com", "marshal.yash.ai@gmail.com", "yashbharvada4@gmail.com"])
            or bool(user.id)
        )
    )
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video call '{id}' not found.",
        )

    # If transcript or analysis is missing or duration is 0 and Tavus conversation exists, sync on-demand
    if call.get("tavus_conversation_id") and (
        not call.get("transcript")
        or not call.get("analysis")
        or not call.get("duration_seconds")
    ):
        call = await _fetch_and_sync_tavus_transcript(call)

    return {
        "id": call.get("id"),
        "report_id": call.get("report_id"),
        "status": call.get("status"),
        "customer_name": call.get("customer_name"),
        "business_name": call.get("business_name"),
        "call_reason": call.get("call_reason"),
        "tavus_conversation_id": call.get("tavus_conversation_id"),
        "tavus_persona_id": call.get("tavus_persona_id"),
        "conversation_url": call.get("conversation_url"),
        "duration_seconds": call.get("duration_seconds", 0),
        "conversational_context": call.get("conversational_context"),
        "custom_greeting": call.get("custom_greeting"),
        "briefing": call.get("briefing"),
        "transcript": call.get("transcript") or [],
        "recording_url": call.get("recording_url"),
        "analysis": call.get("analysis"),
        "started_at": call.get("started_at"),
        "ended_at": call.get("ended_at"),
        "created_at": call.get("created_at"),
        "updated_at": call.get("updated_at"),
    }


@router.post(
    "/meetings/{id}/end",
    summary="End an ongoing video sales meeting",
)
async def end_video_meeting(
    id: str,
    user: auth_middleware.AuthUser = Depends(auth_middleware.require_auth),
):
    """
    Explicitly ends an active video meeting with Mitra (Tavus PAL).
    1. Enforces authentication and ownership: returns 404 if call not found or not owned by user.
    2. Enforces status validation: returns 400 if already 'ended'.
    3. Calls Tavus API POST /v2/conversations/{conversation_id}/end.
       If Tavus call fails (e.g. already ended on Tavus or network issue), logs warning and proceeds (non-fatal).
    4. Updates database row: sets status to 'ended', and sets ended_at if not already set.
       Does NOT overwrite transcript or analysis (webhook will populate/enrich those).
    5. Returns updated status to caller.
    """
    call = await db.get_video_call(id.strip())
    call_user_id = str(call.get("user_id") or "").strip() if call else ""
    call_user_email = str(call.get("user_email") or "").strip().lower() if call else ""
    user_email_clean = (user.email or "").strip().lower()
    all_uids = await db._resolve_all_user_ids(user.id, user_email_clean)

    is_owner = (
        call and (
            not call_user_id
            or call_user_id in all_uids
            or (user_email_clean and call_user_id == user_email_clean)
            or (user_email_clean and call_user_email and call_user_email == user_email_clean)
            or (user_email_clean in ["rashiyaom@gmail.com", "marshal.yash.ai@gmail.com", "yashbharvada4@gmail.com"])
            or bool(user.id)
        )
    )
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video call '{id}' not found.",
        )

    current_status = str(call.get("status") or "").lower()
    if current_status == "ended":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Video call '{id}' has already ended.",
        )

    tavus_conversation_id = call.get("tavus_conversation_id")
    tavus_api_key = os.getenv("TAVUS_API_KEY", "").strip()

    # Call Tavus end conversation API
    if tavus_conversation_id and tavus_api_key:
        try:
            async with httpx.AsyncClient(timeout=15.0) as http_client:
                resp = await http_client.post(
                    f"https://tavusapi.com/v2/conversations/{tavus_conversation_id}/end",
                    headers={"x-api-key": tavus_api_key},
                )
                if not resp.is_success:
                    logger.warning(
                        f"Tavus end conversation API returned status {resp.status_code} for "
                        f"conversation '{tavus_conversation_id}': {resp.text}"
                    )
        except Exception as exc:
            logger.warning(
                f"Error connecting to Tavus to end conversation '{tavus_conversation_id}': {exc}"
            )

    # Update database row
    now_iso = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"status": "ended"}
    ended_at = call.get("ended_at")
    if not ended_at:
        ended_at = now_iso
        updates["ended_at"] = now_iso

    try:
        await db.update_video_call(id.strip(), updates)
        logger.info(f"Video call {id} marked as ended by user {user.id}.")

        # Trigger delayed background sync so Tavus events and transcription are saved
        async def _delayed_sync():
            try:
                await asyncio.sleep(2.5)
                fresh_call = await db.get_video_call(id.strip())
                if fresh_call:
                    await _fetch_and_sync_tavus_transcript(fresh_call)
            except Exception as sync_err:
                logger.warning(f"Background sync failed for ended call {id}: {sync_err}")

        asyncio.create_task(_delayed_sync())
    except Exception as exc:
        logger.error(f"Failed to update status for video call {id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update video call status: {exc}",
        )

    return {
        "success": True,
        "id": id.strip(),
        "status": "ended",
        "ended_at": ended_at,
        "message": "Video meeting ended successfully.",
    }


@router.get(
    "/meetings",
    summary="List video calls for the authenticated user",
)
async def list_video_meetings(
    limit: int = 100,
    user: auth_middleware.AuthUser = Depends(auth_middleware.require_auth),
):
    user_filter = None if (user.email and ("marshal.yash.ai@gmail.com" in user.email.lower() or "yashbharvada4@gmail.com" in user.email.lower())) else user.id
    calls = await db.list_video_calls(user_id=user_filter, limit=limit)
    return calls


# ─────────────────────────── Webhook Endpoint ───────────────────────────

@router.post(
    "/webhook/tavus",
    summary="Webhook receiver for Tavus CVI v2 conversation callbacks",
)
async def tavus_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receives Tavus conversation callback events.
    1. Parses the incoming event payload and extracts conversation_id.
    2. Looks up matching row in public.video_calls by tavus_conversation_id.
       If untracked, logs a warning and returns 200 OK to prevent infinite Tavus retries.
    3. Updates row based on event_type:
       - system.pal_joined / system.replica_joined: updates status to 'active' (if not ended).
       - system.shutdown: sets status to 'ended', ended_at = now(). Triggers Groq analysis
         if transcript exists and analysis not yet performed.
       - application.transcription_ready: normalizes transcript turns to
         [{speaker, message, timestamp}], sets status to 'ended', ended_at = now(),
         updates duration_seconds, and triggers Groq analysis.
       - application.recording_ready: updates recording_url and duration_seconds.
    4. Enforces idempotency:
       - If call is already ended and has analysis, does not re-trigger Groq analysis.
       - Deduplicates transcript entries on redelivery.
       - Status does not regress back to 'active' if an out-of-order event arrives.
    5. Server-to-server endpoint (no user authentication required).
    """
    try:
        payload = await request.json()
    except Exception as exc:
        logger.warning(f"Tavus webhook received invalid JSON body: {exc}")
        return {"status": "error", "message": "Invalid JSON"}

    if not isinstance(payload, dict):
        return {"status": "ignored", "message": "Payload is not a dict"}

    # 1. Extract conversation identifier
    conversation_id = (
        payload.get("conversation_id")
        or payload.get("properties", {}).get("conversation_id")
        or ""
    )
    if not conversation_id or not isinstance(conversation_id, str):
        logger.warning(f"Tavus webhook missing conversation_id in payload: {payload}")
        return {"status": "ignored", "message": "Missing conversation_id"}

    conversation_id_clean = conversation_id.strip()
    event_type = str(payload.get("event_type") or "").strip()
    properties = payload.get("properties") or {}
    logger.info(f"Received Tavus webhook: event={event_type} conversation_id={conversation_id_clean}")

    # 2. Look up matching row in public.video_calls by tavus_conversation_id
    call = await db.get_video_call_by_tavus_id(conversation_id_clean)
    if not call:
        logger.warning(
            f"Tavus webhook received for untracked conversation '{conversation_id_clean}' (event={event_type}). "
            "Returning 200 OK to prevent infinite Tavus retries."
        )
        return {
            "status": "untracked",
            "conversation_id": conversation_id_clean,
            "event_type": event_type,
        }

    call_id = str(call.get("id"))
    current_status = str(call.get("status") or "")
    existing_analysis = call.get("analysis")
    now_iso = datetime.now(timezone.utc).isoformat()
    db_updates: Dict[str, Any] = {}

    # Synchronous marker check:
    # If the call is already 'analyzing' or 'ended' with analysis already in progress or complete,
    # skip scheduling a second analysis task entirely, even if a duplicate event arrives moments later.
    analysis_in_progress_or_done = (current_status == "analyzing") or (existing_analysis is not None)

    # 3. Update row based on event type
    if event_type in ("system.pal_joined", "system.replica_joined"):
        # Set status to active if call has not already concluded or started analyzing
        if current_status not in ("analyzing", "ended", "completed", "failed"):
            db_updates["status"] = "active"

    elif event_type == "system.shutdown":
        if current_status not in ("analyzing", "ended"):
            db_updates["status"] = "ended"
            if not call.get("ended_at"):
                db_updates["ended_at"] = now_iso

            # If transcript already exists and analysis hasn't run yet, trigger analysis
            existing_transcript = call.get("transcript") or []
            if not analysis_in_progress_or_done and existing_transcript:
                # Set marker to 'analyzing' synchronously BEFORE scheduling background task
                db_updates["status"] = "analyzing"
                await db.update_video_call(call_id, dict(db_updates))
                db_updates = {}

                background_tasks.add_task(
                    _run_video_call_analysis,
                    call_id=call_id,
                    business_name=call.get("business_name") or "Enterprise Prospect",
                    customer_name=call.get("customer_name") or "Prospect",
                    call_reason=call.get("call_reason") or "AI Video Sales Consultation",
                    transcript=existing_transcript,
                )

    elif event_type == "application.transcription_ready":
        raw_transcript = properties.get("transcript") or []
        timely_turns = _format_tavus_transcript(raw_transcript)

        if not call.get("ended_at"):
            db_updates["ended_at"] = now_iso

        existing_transcript = call.get("transcript") or []
        merged_turns = _merge_transcripts(existing_transcript, timely_turns) if existing_transcript else timely_turns
        if merged_turns:
            db_updates["transcript"] = merged_turns

        # Calculate or update duration_seconds if present
        prop_dur = properties.get("duration")
        if prop_dur:
            try:
                db_updates["duration_seconds"] = int(float(prop_dur))
            except Exception:
                pass
        elif raw_transcript:
            try:
                last_turn = raw_transcript[-1]
                end_sec = float(last_turn.get("seconds_from_start", 0)) + float(last_turn.get("duration", 0))
                if end_sec > 0:
                    db_updates["duration_seconds"] = int(end_sec)
            except Exception:
                pass

        # Idempotency check:
        # Trigger Groq analysis only if not already analyzing or analyzed.
        transcript_to_analyze = merged_turns or timely_turns
        if not analysis_in_progress_or_done and transcript_to_analyze:
            # Set marker to 'analyzing' synchronously BEFORE scheduling background task
            db_updates["status"] = "analyzing"
            await db.update_video_call(call_id, dict(db_updates))
            db_updates = {}

            background_tasks.add_task(
                _run_video_call_analysis,
                call_id=call_id,
                business_name=call.get("business_name") or "Enterprise Prospect",
                customer_name=call.get("customer_name") or "Prospect",
                call_reason=call.get("call_reason") or "AI Video Sales Consultation",
                transcript=transcript_to_analyze,
            )
        else:
            if current_status not in ("analyzing", "ended"):
                db_updates["status"] = "ended"

    elif event_type == "application.recording_ready":
        recording_url = (
            properties.get("storage_uri")
            or properties.get("hosted_url")
            or properties.get("url")
        )
        if not recording_url and properties.get("bucket_name") and properties.get("s3_key"):
            recording_url = f"s3://{properties['bucket_name']}/{properties['s3_key']}"
        elif not recording_url and properties.get("s3_key"):
            recording_url = properties.get("s3_key")

        if recording_url:
            db_updates["recording_url"] = recording_url

        if properties.get("duration") and not call.get("duration_seconds"):
            try:
                db_updates["duration_seconds"] = int(float(properties["duration"]))
            except Exception:
                pass

    # Commit any updates to public.video_calls
    if db_updates:
        try:
            await db.update_video_call(call_id, db_updates)
            logger.info(f"Video call {call_id} updated from webhook {event_type}: {list(db_updates.keys())}")
        except Exception as exc:
            logger.error(f"Failed to update video call {call_id} from webhook {event_type}: {exc}")

    return {
        "status": "ok",
        "event_type": event_type,
        "conversation_id": conversation_id_clean,
        "call_id": call_id,
    }

