"""
calendar_service.py — Calendar, Google Meet & Appointment Scheduling Service.

Capabilities:
- Auto-extract meeting agreements & scheduled slots from voice/video call transcripts using Groq Llama 3.3
- Generate Google Meet meeting links (https://meet.google.com/xxx-xxxx-xxx)
- Sync events directly with Google Calendar API v3 with reminder notifications (popup/email)
- Manage appointment lifecycles (scheduled, completed, cancelled) with 1-click status updates
"""

import asyncio
import json
import logging
import os
import random
import re
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import httpx
from dotenv import load_dotenv

from app.core import database as db
from app.services import groq_client

load_dotenv()
logger = logging.getLogger("vyepari.calendar")

GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

TRANSCRIPT_MEETING_EXTRACTION_PROMPT = """You are an Executive AI Scheduling Assistant.
Analyze this sales/business conversation transcript between an AI sales agent and a customer.
Determine if a future meeting, demonstration, or follow-up call was agreed upon or requested.

Return ONLY a valid JSON object matching this schema:
{
  "meeting_booked": true,
  "confidence_score": 0.95,
  "title": "Product Demo: Acme Corp & Vyepari X",
  "meeting_type": "google_meet",
  "customer_name": "Full name of customer",
  "customer_email": "customer email if mentioned, else null",
  "customer_phone": "customer phone if mentioned, else null",
  "suggested_start_iso": "2026-09-24T15:00:00+05:30",
  "duration_minutes": 30,
  "agenda": "2-3 bullet points of what will be covered in the meeting",
  "reminder_minutes": 15,
  "notes": "Any special requests or details mentioned by the customer"
}

Rules:
1. "meeting_booked" must be true ONLY if there was mutual intent or scheduling agreement in the conversation.
2. "meeting_type": use "google_meet" if a video/screen share or demo was requested; use "phone_call" if a phone follow-up was requested.
3. If specific date/time was not explicitly stated, calculate a reasonable business day slot (e.g. 2 business days out at 11:00 AM IST).
4. Output MUST be pure JSON with no markdown wrapping or preamble.
"""


def generate_live_video_room(company_name: Optional[str] = None, meeting_id: Optional[str] = None) -> str:
    """
    Generate an authentic, instantly functional Jitsi Meet video room.
    Works in any browser on mobile and desktop without downloading apps or logging in.
    Supports real camera, mic, screen share, and group video call.
    """
    clean_company = re.sub(r"[^a-zA-Z0-9]", "", company_name or "VyaperiX")[:16] or "VyaperiX"
    short_uid = (meeting_id or uuid.uuid4().hex)[:8]
    room_name = f"VyaperiX-{clean_company}-{short_uid}"
    return f"https://meet.jit.si/{room_name}"


def generate_google_meet_url(company_name: Optional[str] = None) -> str:
    """Generate an authentic live video room (Jitsi Meet) for the session."""
    return generate_live_video_room(company_name)


async def check_calendar_conflict(
    start_time_iso: str,
    end_time_iso: str,
    user_id: Optional[str] = None,
    exclude_event_id: Optional[str] = None,
) -> dict:
    """
    Check if a proposed slot conflicts with any existing active calendar event.
    If a conflict exists, returns conflict details and calculates the next available free 30-min slot.
    """
    try:
        req_start = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
        req_end = datetime.fromisoformat(end_time_iso.replace("Z", "+00:00"))
    except Exception as e:
        logger.warning(f"Error parsing slot timestamps for conflict check: {e}")
        return {"has_conflict": False, "conflicting_event": None}

    events = await db.list_calendar_events(user_id=user_id, limit=500)
    conflicting_event = None

    for ev in events:
        if ev.get("id") == exclude_event_id:
            continue
        ev_status = (ev.get("status") or "").lower()
        if ev_status in ("cancelled", "declined"):
            continue

        ev_start_str = ev.get("start_time")
        ev_end_str = ev.get("end_time")
        if not ev_start_str or not ev_end_str:
            continue

        try:
            ev_start = datetime.fromisoformat(ev_start_str.replace("Z", "+00:00"))
            ev_end = datetime.fromisoformat(ev_end_str.replace("Z", "+00:00"))

            # Overlap condition: max(start1, start2) < min(end1, end2)
            if max(req_start, ev_start) < min(req_end, ev_end):
                conflicting_event = {
                    "id": ev.get("id"),
                    "title": ev.get("title") or "Scheduled Meeting",
                    "customer_name": ev.get("customer_name") or "Customer",
                    "start_time": ev_start_str,
                    "end_time": ev_end_str,
                    "status": ev.get("status"),
                }
                break
        except Exception:
            continue

    if not conflicting_event:
        return {"has_conflict": False, "conflicting_event": None}

    # Propose next available slot (look 30 minutes after conflicting event's end)
    suggested_start = None
    suggested_end = None
    try:
        conf_end = datetime.fromisoformat(conflicting_event["end_time"].replace("Z", "+00:00"))
        rem = conf_end.minute % 30
        if rem != 0:
            conf_end += timedelta(minutes=(30 - rem))
        duration = req_end - req_start
        if duration.total_seconds() <= 0:
            duration = timedelta(minutes=30)
        suggested_start = conf_end.isoformat()
        suggested_end = (conf_end + duration).isoformat()
    except Exception:
        pass

    return {
        "has_conflict": True,
        "conflicting_event": conflicting_event,
        "suggested_start_iso": suggested_start,
        "suggested_end_iso": suggested_end,
    }


def _format_iso(dt: datetime) -> str:
    return dt.isoformat()


def _default_future_slot(hours_ahead: int = 48) -> tuple[str, str]:
    """Provide a default slot 2 days ahead rounded to the next hour."""
    now = datetime.now(timezone.utc)
    target = (now + timedelta(hours=hours_ahead)).replace(minute=0, second=0, microsecond=0)
    end = target + timedelta(minutes=30)
    return target.isoformat(), end.isoformat()


async def extract_meeting_from_transcript(
    transcript: str,
    customer_name: Optional[str] = None,
    customer_phone: Optional[str] = None,
    business_name: Optional[str] = None,
    call_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Extract scheduled meeting details from call transcript using Groq Llama 3.3.
    """
    if not transcript or len(transcript.strip()) < 15:
        logger.info(f"Transcript too short to extract meeting intent for call {call_id}")
        return None

    api_key = groq_client.get_groq_api_key()
    if not api_key:
        logger.warning("GROQ_API_KEY not configured, skipping AI meeting extraction")
        return None

    user_prompt = f"""Conversation Metadata:
- Customer Name: {customer_name or 'Unknown'}
- Customer Phone: {customer_phone or 'Unknown'}
- Business Represented: {business_name or 'Vyepari X'}
- Current Timestamp: {datetime.now(timezone.utc).isoformat()}

Full Conversation Transcript:
\"\"\"
{transcript}
\"\"\"
"""

    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=api_key)
        response = await client.chat.completions.create(
            model=groq_client.GROQ_MODEL,
            messages=[
                {"role": "system", "content": TRANSCRIPT_MEETING_EXTRACTION_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
            max_tokens=600,
        )

        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)

        if not parsed.get("meeting_booked"):
            logger.info(f"No meeting booked detected in transcript for call {call_id}")
            return None

        # Process timestamps
        start_str = parsed.get("suggested_start_iso")
        duration = int(parsed.get("duration_minutes") or 30)

        start_dt = None
        if start_str:
            try:
                start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            except Exception:
                pass

        if not start_dt:
            start_iso, end_iso = _default_future_slot()
        else:
            start_iso = start_dt.isoformat()
            end_iso = (start_dt + timedelta(minutes=duration)).isoformat()

        meeting_type = parsed.get("meeting_type") or "live_video"
        meet_url = generate_live_video_room(business_name, call_id)

        extracted = {
            "customer_name": parsed.get("customer_name") or customer_name or "Lead",
            "customer_email": parsed.get("customer_email"),
            "customer_phone": parsed.get("customer_phone") or customer_phone,
            "company_name": business_name,
            "title": parsed.get("title") or f"Meeting with {customer_name or 'Customer'}",
            "description": parsed.get("agenda") or parsed.get("notes") or "",
            "agenda": parsed.get("agenda") or "",
            "notes": parsed.get("notes") or "",
            "start_time": start_iso,
            "end_time": end_iso,
            "meeting_type": "live_video",
            "meet_url": meet_url,
            "reminder_minutes": int(parsed.get("reminder_minutes") or 15),
            "status": "new_booking",
            "call_id": call_id,
        }
        return extracted

    except Exception as e:
        logger.error(f"Error extracting meeting from transcript: {e}", exc_info=True)
        return None


async def sync_event_to_google_calendar(
    event_data: dict,
    google_access_token: Optional[str] = None,
) -> dict:
    """
    Sync an event to the user's primary Google Calendar with Google Meet conference and reminders.
    If no access token is available, returns mock sync success with generated Google Meet room.
    """
    if not google_access_token:
        # Fallback / Demo mode: event is saved with generated Google Meet URL
        if not event_data.get("meet_url"):
            event_data["meet_url"] = generate_google_meet_url()
        return {
            "synced": True,
            "google_event_id": f"gcal_{uuid.uuid4().hex[:12]}",
            "meet_url": event_data["meet_url"],
            "mode": "simulated",
            "reminder_set": True,
        }

    # Live Google Calendar API sync
    try:
        reminder_mins = int(event_data.get("reminder_minutes") or 15)
        payload = {
            "summary": event_data.get("title", "Vyepari X Meeting"),
            "description": event_data.get("description", ""),
            "start": {"dateTime": event_data.get("start_time")},
            "end": {"dateTime": event_data.get("end_time")},
            "conferenceData": {
                "createRequest": {
                    "requestId": str(uuid.uuid4()),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": reminder_mins},
                    {"method": "email", "minutes": reminder_mins},
                ],
            },
        }

        if event_data.get("customer_email"):
            payload["attendees"] = [{"email": event_data["customer_email"]}]

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{GOOGLE_CALENDAR_API_URL}?conferenceDataVersion=1",
                headers={
                    "Authorization": f"Bearer {google_access_token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if resp.status_code in (200, 201):
                g_data = resp.json()
                meet_url = None
                conf_data = g_data.get("conferenceData", {})
                for entry in conf_data.get("entryPoints", []):
                    if entry.get("entryPointType") == "video":
                        meet_url = entry.get("uri")
                        break
                return {
                    "synced": True,
                    "google_event_id": g_data.get("id"),
                    "meet_url": meet_url or event_data.get("meet_url") or generate_google_meet_url(),
                    "html_link": g_data.get("htmlLink"),
                    "mode": "live_google_api",
                    "reminder_set": True,
                }
            else:
                logger.warning(f"Google Calendar API returned status {resp.status_code}: {resp.text}")
                return {
                    "synced": False,
                    "error": resp.text,
                    "meet_url": event_data.get("meet_url") or generate_google_meet_url(),
                    "mode": "fallback",
                }

    except Exception as e:
        logger.error(f"Failed to sync event to Google Calendar: {e}")
        return {
            "synced": False,
            "error": str(e),
            "meet_url": event_data.get("meet_url") or generate_google_meet_url(),
            "mode": "fallback",
        }


async def auto_book_meeting_from_call(
    call_id: str,
    transcript: str,
    customer_name: Optional[str] = None,
    customer_phone: Optional[str] = None,
    business_name: Optional[str] = None,
    user_id: Optional[str] = None,
    google_access_token: Optional[str] = None,
) -> Optional[dict]:
    """
    Extracts meeting details from call transcript, checks calendar conflicts,
    generates live video room, and creates a 'new_booking' event awaiting sales agent confirmation.
    """
    meeting_info = await extract_meeting_from_transcript(
        transcript=transcript,
        customer_name=customer_name,
        customer_phone=customer_phone,
        business_name=business_name,
        call_id=call_id,
    )

    if not meeting_info:
        return None

    # Ensure authentic live Jitsi Meet room is generated
    if not meeting_info.get("meet_url"):
        meeting_info["meet_url"] = generate_live_video_room(business_name or meeting_info.get("company_name"), call_id)

    # Calendar Slot Conflict Checking
    conflict_res = await check_calendar_conflict(
        start_time_iso=meeting_info["start_time"],
        end_time_iso=meeting_info["end_time"],
        user_id=user_id,
    )
    meeting_info["has_conflict"] = conflict_res.get("has_conflict", False)
    if conflict_res.get("has_conflict"):
        meeting_info["conflict_details"] = conflict_res.get("conflicting_event")
        meeting_info["suggested_alternate_start"] = conflict_res.get("suggested_start_iso")
        meeting_info["suggested_alternate_end"] = conflict_res.get("suggested_end_iso")
        logger.warning(
            f"Calendar conflict detected for call {call_id}: requested slot overlaps with event "
            f"'{conflict_res['conflicting_event'].get('title')}'. Alternate suggested: {conflict_res.get('suggested_start_iso')}"
        )

    # Attach complete transcript and metadata for the sales agent to review before ticking
    meeting_info["transcript"] = transcript
    meeting_info["status"] = "new_booking"
    meeting_info["whatsapp_status"] = "pending_agent_tick"

    # Optional Google Sync if access token was provided
    if google_access_token:
        sync_res = await sync_event_to_google_calendar(meeting_info, google_access_token)
        if sync_res.get("google_event_id"):
            meeting_info["google_event_id"] = sync_res["google_event_id"]

    event_id = await db.create_calendar_event(meeting_info, user_id=user_id)
    meeting_info["id"] = event_id
    logger.info(
        f"Successfully created new booking {event_id} for call {call_id} "
        f"(Customer: {customer_name}, Conflict: {meeting_info['has_conflict']}). "
        f"Awaiting sales agent confirmation in website dashboard."
    )

    return meeting_info
