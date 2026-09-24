"""
calendar_router.py — FastAPI Router for Calendar, Scheduled Meetings & Reminders.

Provides endpoints for:
- GET    /api/calendar/events               — List all scheduled meetings & calls (with filters)
- POST   /api/calendar/events               — Create a meeting / call with Google Meet & Reminders
- GET    /api/calendar/events/{id}          — Get details for a single calendar event
- PATCH  /api/calendar/events/{id}          — Update status (e.g. Mark Done / Completed), reschedule, update reminders
- DELETE /api/calendar/events/{id}          — Delete or cancel a meeting
- POST   /api/calendar/events/{id}/sync-google — Push event to Google Calendar
- POST   /api/calendar/extract-from-call/{call_id} — Auto-extract & book meeting from call transcript
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from pydantic import BaseModel, Field

from app.core import auth_middleware
from app.core import database as db
from app.services import calendar_service
from app.services import sms_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ─────────────────────────── Request / Response Schemas ─────────────────

class CreateCalendarEventRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, description="Customer or lead name")
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    company_name: Optional[str] = None
    title: str = Field(..., min_length=1, description="Meeting title or subject")
    description: Optional[str] = ""
    start_time: str = Field(..., description="ISO-8601 start timestamp")
    end_time: str = Field(..., description="ISO-8601 end timestamp")
    meeting_type: Optional[str] = Field("google_meet", description="'google_meet' | 'phone_call' | 'in_person'")
    meet_url: Optional[str] = None
    reminder_minutes: Optional[int] = Field(15, description="Reminder alert minutes before event (e.g. 10, 15, 30, 60)")
    remind_via: Optional[str] = Field("popup", description="'popup' | 'email' | 'both'")
    call_id: Optional[str] = None
    user_id: Optional[str] = None
    sync_to_google: Optional[bool] = False
    google_access_token: Optional[str] = None
    send_customer_confirmation: Optional[bool] = False


class UpdateCalendarEventRequest(BaseModel):
    status: Optional[str] = Field(None, description="'scheduled' | 'completed' | 'cancelled'")
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    reminder_minutes: Optional[int] = None
    remind_via: Optional[str] = None
    meet_url: Optional[str] = None


async def _resolve_rep_phone(user_id: Optional[str]) -> str:
    """
    Resolve representative's phone number for notifications.
    Hierarchy: profile.phone -> profile.settings.alert_phone_number -> voice_settings.alert_phone_number -> "0000000000"
    """
    if user_id:
        profile = await db.get_profile(user_id)
        if profile and profile.get("phone"):
            return str(profile.get("phone")).strip()
        elif profile and isinstance(profile.get("settings"), dict) and profile["settings"].get("alert_phone_number"):
            return str(profile["settings"]["alert_phone_number"]).strip()

    settings_doc = await db.get_voice_settings()
    if settings_doc and settings_doc.get("alert_phone_number"):
        return str(settings_doc.get("alert_phone_number")).strip()

    return "0000000000"


async def _sms_alerts_enabled(user_id: Optional[str]) -> bool:
    """
    Check if SMS meeting alerts are enabled.
    Hierarchy: profile.settings.sms_alerts_enabled -> voice_settings.sms_alerts_enabled -> True (default).
    """
    if user_id:
        profile = await db.get_profile(user_id)
        if profile and isinstance(profile.get("settings"), dict) and "sms_alerts_enabled" in profile["settings"]:
            val = profile["settings"]["sms_alerts_enabled"]
            if isinstance(val, bool):
                return val
            if isinstance(val, str):
                return val.lower() not in ("false", "0", "no", "off")

    settings_doc = await db.get_voice_settings()
    if settings_doc and "sms_alerts_enabled" in settings_doc:
        val = settings_doc["sms_alerts_enabled"]
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() not in ("false", "0", "no", "off")

    return True


# ─────────────────────────── Endpoints ──────────────────────────────────

@router.get("/events")
async def list_events(
    user_id: Optional[str] = Query(None, description="Filter by user UUID"),
    status: Optional[str] = Query(None, description="'scheduled' | 'completed' | 'cancelled'"),
    start_date: Optional[str] = Query(None, description="ISO-8601 start lower bound"),
    end_date: Optional[str] = Query(None, description="ISO-8601 end upper bound"),
    customer_name: Optional[str] = Query(None, description="Filter/search by customer name"),
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(None),
):
    """
    List all calendar meetings and scheduled calls.
    Supports filtering by customer name, status, and date range.
    """
    resolved_user_id = user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user and auth_user.id:
                resolved_user_id = auth_user.id
        except Exception:
            pass

    events = await db.list_calendar_events(
        user_id=resolved_user_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        customer_name=customer_name,
        limit=limit,
    )
    return {"events": events, "total": len(events)}


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: CreateCalendarEventRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Create a new calendar event.
    Automatically generates a Google Meet room if meeting_type is 'google_meet' and meet_url is omitted.
    Configures Google reminders (popup/email).
    """
    meet_url = payload.meet_url
    if payload.meeting_type in ("live_video", "google_meet", "video") and not meet_url:
        meet_url = calendar_service.generate_live_video_room(payload.company_name)

    event_data = {
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "customer_email": payload.customer_email,
        "company_name": payload.company_name,
        "title": payload.title,
        "description": payload.description,
        "start_time": payload.start_time,
        "end_time": payload.end_time,
        "meeting_type": payload.meeting_type,
        "meet_url": meet_url,
        "reminder_minutes": payload.reminder_minutes or 15,
        "remind_via": payload.remind_via or "popup",
        "call_id": payload.call_id,
        "status": "scheduled",
    }

    # Extract user_id if token provided
    resolved_user_id = payload.user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user and auth_user.id:
                resolved_user_id = auth_user.id
        except Exception:
            pass

    # Optional Google Calendar sync
    if payload.sync_to_google or payload.google_access_token:
        sync_res = await calendar_service.sync_event_to_google_calendar(
            event_data, payload.google_access_token
        )
        if sync_res.get("meet_url"):
            event_data["meet_url"] = sync_res["meet_url"]
        if sync_res.get("google_event_id"):
            event_data["google_event_id"] = sync_res["google_event_id"]
            event_data["synced_to_google"] = True

    event_id = await db.create_calendar_event(event_data, user_id=resolved_user_id)
    event_data["id"] = event_id

    # SMS notification right after save succeeds
    try:
        if not await _sms_alerts_enabled(resolved_user_id):
            logger.info(f"SMS alerts disabled for user {resolved_user_id}, skipping")
        else:
            rep_phone = await _resolve_rep_phone(resolved_user_id)

            meeting_time_str = str(payload.start_time)
            try:
                dt = datetime.fromisoformat(meeting_time_str.replace("Z", "+00:00"))
                formatted_time = dt.strftime("%Y-%m-%d %H:%M")
            except Exception:
                formatted_time = meeting_time_str

            sms_service.send_meeting_sms(
                rep_phone=rep_phone,
                prospect_phone=payload.customer_phone if payload.customer_phone else None,
                lead_name=payload.customer_name,
                meeting_time=formatted_time,
                meeting_link=event_data.get("meet_url") or "",
                send_to_prospect=bool(payload.send_customer_confirmation),
            )
    except Exception as sms_err:
        logger.warning(f"SMS notification failed after event creation: {sms_err}")

    return {"message": "Meeting scheduled successfully", "event": event_data}


@router.get("/events/{event_id}")
async def get_event_details(event_id: str):
    """Fetch details for a single calendar event, with linked call info if available."""
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    linked_call = None
    if event.get("call_id"):
        linked_call = await db.get_call(event["call_id"])

    return {"event": event, "linked_call": linked_call}


@router.patch("/events/{event_id}")
async def update_event(event_id: str, payload: UpdateCalendarEventRequest):
    """
    Update a calendar event.
    Used for 1-click status updates:
    - payload.status = 'completed' -> Mark Done (Meeting/Call completed)
    - payload.status = 'cancelled' -> Mark Cancelled
    - Rescheduling start_time / end_time or updating reminder minutes.
    """
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = await db.update_calendar_event(event_id, updates)
    return {"message": "Event updated successfully", "event": updated}


@router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    """Delete a calendar event."""
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    await db.delete_calendar_event(event_id)
    return {"message": "Event deleted successfully"}


@router.post("/events/{event_id}/sync-google")
async def sync_to_google(event_id: str, access_token: Optional[str] = None):
    """Manually push/sync an existing calendar event to Google Calendar."""
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    sync_res = await calendar_service.sync_event_to_google_calendar(event, access_token)
    updates = {}
    if sync_res.get("meet_url"):
        updates["meet_url"] = sync_res["meet_url"]
    if sync_res.get("google_event_id"):
        updates["google_event_id"] = sync_res["google_event_id"]
        updates["synced_to_google"] = True

    if updates:
        await db.update_calendar_event(event_id, updates)

    return {"message": "Google Calendar sync complete", "sync_result": sync_res}


@router.post("/extract-from-call/{call_id}")
async def extract_and_book_from_call(call_id: str):
    """
    Manually trigger AI meeting extraction from an existing completed voice call transcript.
    If meeting agreement was found, auto-books the meeting into the calendar.
    """
    call = await db.get_voice_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Voice call not found")

    transcript = call.get("transcript") or ""
    if not transcript:
        raise HTTPException(status_code=400, detail="Call has no transcript available to extract meeting from")

    event = await calendar_service.auto_book_meeting_from_call(
        call_id=call_id,
        transcript=transcript,
        customer_name=call.get("customer_name"),
        customer_phone=call.get("customer_phone"),
        business_name=call.get("business_name"),
        user_id=call.get("user_id"),
    )

    if not event:
        return {"message": "No scheduled meeting or follow-up agreement detected in this transcript", "event": None}

    # SMS notification for AI call meeting extraction
    try:
        call_user_id = call.get("user_id")
        if not await _sms_alerts_enabled(call_user_id):
            logger.info(f"SMS alerts disabled for user {call_user_id}, skipping")
        else:
            rep_phone = await _resolve_rep_phone(call_user_id)
            sms_service.send_meeting_sms(
                rep_phone=rep_phone,
                prospect_phone=event.get("customer_phone"),
                lead_name=event.get("customer_name") or "Lead",
                meeting_time=event.get("start_time") or "",
                meeting_link=event.get("meet_url") or "",
                send_to_prospect=bool(event.get("customer_phone")),
                source="ai_call",
            )
    except Exception as sms_err:
        logger.warning(f"SMS notification failed after AI meeting extraction for call {call_id}: {sms_err}")

    return {"message": "Meeting successfully extracted and booked", "event": event}


@router.post("/events/{event_id}/send-whatsapp")
async def send_whatsapp_for_event(event_id: str, phone: Optional[str] = Query(None)):
    """
    Manually dispatch or re-send WhatsApp meeting confirmation with Google Meet link.
    """
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    target_phone = phone or event.get("customer_phone")
    if not target_phone:
        raise HTTPException(status_code=400, detail="No customer phone number found for this event. Specify ?phone= in query or update event.")

    from app.services import whatsapp_service
    res = await whatsapp_service.send_meeting_confirmation(
        customer_name=event.get("customer_name") or "there",
        customer_phone=target_phone,
        business_name=event.get("company_name") or "Vyepari X",
        start_time=event.get("start_time") or "",
        meet_url=event.get("meet_url") or "",
        agenda=event.get("agenda") or event.get("description") or "",
        requirements=event.get("notes") or "",
    )

    if not res.get("success"):
        return {"success": False, "error": res.get("error"), "event_id": event_id}

    await db.update_calendar_event(event_id, {
        "whatsapp_status": "sent",
        "whatsapp_sent_at": datetime.now(timezone.utc).isoformat(),
        "customer_phone": target_phone,
    })
    return {"success": True, "message": "WhatsApp confirmation dispatched successfully", "result": res}


class ApproveBookingRequest(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    meet_url: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None


@router.get("/check-conflict")
async def check_slot_conflict(
    start: str = Query(..., description="ISO-8601 start timestamp"),
    end: str = Query(..., description="ISO-8601 end timestamp"),
    user_id: Optional[str] = Query(None),
    exclude_id: Optional[str] = Query(None),
):
    """Check if candidate slot conflicts with any existing active calendar booking."""
    return await calendar_service.check_calendar_conflict(
        start_time_iso=start,
        end_time_iso=end,
        user_id=user_id,
        exclude_event_id=exclude_id,
    )


@router.post("/events/{event_id}/approve-and-send")
async def approve_and_send_whatsapp(
    event_id: str,
    payload: Optional[ApproveBookingRequest] = None,
):
    """
    Sales Agent 'Tick to Approve' workflow:
    1. Confirms the booking status from 'new_booking' to 'confirmed'.
    2. Allows the sales agent to optionally adjust the slot time (e.g. if resolving a conflict).
    3. Guarantees an active, live Jitsi Meet video room link.
    4. Automatically dispatches the WhatsApp meeting invitation with live video room, time slot,
       and full call transcript requirements recap directly to the customer.
    """
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    updates: dict = {
        "status": "confirmed",
        "has_conflict": False,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": "sales_agent",
    }

    if payload:
        if payload.start_time:
            updates["start_time"] = payload.start_time
        if payload.end_time:
            updates["end_time"] = payload.end_time
        if payload.meet_url:
            updates["meet_url"] = payload.meet_url
        if payload.notes:
            updates["notes"] = payload.notes
        if payload.phone:
            updates["customer_phone"] = payload.phone

    # Ensure working live video room link
    meet_url = updates.get("meet_url") or event.get("meet_url")
    if not meet_url or "meet.google.com" in meet_url:
        meet_url = calendar_service.generate_live_video_room(
            event.get("company_name"), event.get("id") or event_id
        )
        updates["meet_url"] = meet_url

    # Check recipient phone number
    target_phone = updates.get("customer_phone") or event.get("customer_phone")
    if not target_phone:
        raise HTTPException(
            status_code=400,
            detail="Cannot dispatch WhatsApp: No customer phone number associated with this booking."
        )

    # Format and send rich WhatsApp message
    from app.services import whatsapp_service
    start_time_to_send = updates.get("start_time") or event.get("start_time") or ""
    agenda_to_send = event.get("agenda") or event.get("description") or ""
    requirements_to_send = updates.get("notes") or event.get("notes") or ""

    wa_res = await whatsapp_service.send_meeting_confirmation(
        customer_name=event.get("customer_name") or "there",
        customer_phone=target_phone,
        business_name=event.get("company_name") or "Vyepari X",
        start_time=start_time_to_send,
        meet_url=meet_url,
        agenda=agenda_to_send,
        requirements=requirements_to_send,
    )

    if not wa_res.get("success"):
        updates["whatsapp_status"] = "failed"
        updates["whatsapp_error"] = wa_res.get("error")
        await db.update_calendar_event(event_id, updates)
        return {
            "success": False,
            "error": f"Booking confirmed, but WhatsApp failed to send: {wa_res.get('error')}",
            "event_id": event_id,
            "meet_url": meet_url,
        }

    updates["whatsapp_status"] = "sent"
    updates["whatsapp_sent_at"] = datetime.now(timezone.utc).isoformat()
    updated_event = await db.update_calendar_event(event_id, updates)

    return {
        "success": True,
        "message": f"✓ Booking confirmed and WhatsApp dispatched to {target_phone} with Live Video link!",
        "event": updated_event,
        "whatsapp_result": wa_res,
        "meet_url": meet_url,
    }
