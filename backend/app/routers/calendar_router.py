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
from app.services import email_service
from app.services import calendly_service
from app.services import whatsapp_service

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
    user_email: Optional[str] = None
    sync_to_google: Optional[bool] = False
    google_access_token: Optional[str] = None
    send_customer_confirmation: Optional[bool] = False


class UpdateCalendarEventRequest(BaseModel):
    status: Optional[str] = Field(None, description="'scheduled' | 'completed' | 'cancelled' | 'confirmed'")
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    reminder_minutes: Optional[int] = None
    remind_via: Optional[str] = None
    meet_url: Optional[str] = None
    calendly_link: Optional[str] = None


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
    user_email: Optional[str] = Query(None, description="Filter by user email"),
    status: Optional[str] = Query(None, description="'scheduled' | 'completed' | 'cancelled' | 'confirmed'"),
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
    resolved_user_email = user_email
    if authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user:
                if not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", ""):
                    resolved_user_id = auth_user.id
                if not resolved_user_email:
                    resolved_user_email = auth_user.email
        except Exception:
            pass

    events = await db.list_calendar_events(
        user_id=resolved_user_id,
        user_email=resolved_user_email,
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

    # Extract user_id and email if token provided
    resolved_user_id = payload.user_id
    resolved_user_email = payload.user_email
    if authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user:
                if not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", ""):
                    resolved_user_id = auth_user.id
                if not resolved_user_email:
                    resolved_user_email = auth_user.email
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

    event_id = await db.create_calendar_event(event_data, user_id=resolved_user_id, user_email=resolved_user_email)
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

    # Email notification to workspace owner, registered rep, and customer
    try:
        owner_email = await email_service.resolve_workspace_owner_email(resolved_user_id)
        rep_email = await email_service.resolve_user_registered_email(resolved_user_id)
        meeting_time_str = str(payload.start_time)
        try:
            dt = datetime.fromisoformat(meeting_time_str.replace("Z", "+00:00"))
            formatted_time = dt.strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            formatted_time = meeting_time_str

        if owner_email or rep_email or payload.customer_email:
            email_res = await email_service.send_meeting_email(
                rep_email=rep_email or "",
                prospect_email=payload.customer_email if payload.send_customer_confirmation else None,
                lead_name=payload.customer_name,
                meeting_time=formatted_time,
                meeting_link=event_data.get("meet_url") or "",
                title=payload.title,
                agenda=payload.description or "",
                customer_phone=payload.customer_phone,
                company_name=payload.company_name,
                send_to_prospect=bool(payload.send_customer_confirmation and payload.customer_email),
                owner_email=owner_email,
                user_id=resolved_user_id,
                source="calendar_event_created",
            )
            event_data["email_status"] = "dispatched"
            event_data["email_owner"] = owner_email
            event_data["email_rep"] = rep_email
            event_data["email_customer"] = payload.customer_email
            event_data["email_sent"] = True
            await db.update_calendar_event(event_id, {
                "email_status": "dispatched",
                "email_owner": owner_email,
                "email_rep": rep_email,
                "email_customer": payload.customer_email,
                "email_sent": True,
            })
    except Exception as email_err:
        logger.warning(f"Email notification failed after event creation: {email_err}")

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

    if updates.get("status") in ("confirmed", "completed"):
        try:
            await db.create_meeting_log(
                {
                    "event_id": event_id,
                    "call_id": event.get("call_id"),
                    "customer_name": event.get("customer_name"),
                    "customer_phone": event.get("customer_phone"),
                    "customer_email": event.get("customer_email"),
                    "company_name": event.get("company_name"),
                    "title": updates.get("title") or event.get("title"),
                    "description": updates.get("description") or event.get("description"),
                    "start_time": updates.get("start_time") or event.get("start_time"),
                    "end_time": updates.get("end_time") or event.get("end_time"),
                    "meet_url": updates.get("meet_url") or event.get("meet_url"),
                    "calendly_link": updates.get("calendly_link") or event.get("calendly_link"),
                    "status": "accepted",
                    "approval_status": "accepted",
                    "approved_at": datetime.now(timezone.utc).isoformat(),
                    "approved_by": "user",
                    "whatsapp_status": event.get("whatsapp_status", "pending"),
                    "email_status": event.get("email_status", "pending"),
                },
                user_id=event.get("user_id"),
                user_email=event.get("user_email") or event.get("email_owner"),
            )
        except Exception as log_err:
            logger.warning(f"Could not record meeting log on update_event: {log_err}")

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

    # Email notification to workspace owner, registered rep, and customer for AI call meeting extraction
    try:
        call_user_id = call.get("user_id")
        owner_email = await email_service.resolve_workspace_owner_email(call_user_id)
        rep_email = await email_service.resolve_user_registered_email(call_user_id)
        if owner_email or rep_email or event.get("customer_email"):
            await email_service.send_meeting_email(
                rep_email=rep_email or "",
                prospect_email=event.get("customer_email"),
                lead_name=event.get("customer_name") or "Lead",
                meeting_time=event.get("start_time") or "",
                meeting_link=event.get("meet_url") or "",
                title=event.get("title") or "Discovery & Demo (from AI Call)",
                agenda=f"Auto-booked from AI Call #{call_id}. Customer Phone: {event.get('customer_phone')}",
                customer_phone=event.get("customer_phone"),
                company_name=event.get("company_name") or call.get("business_name"),
                send_to_prospect=bool(event.get("customer_email")),
                owner_email=owner_email,
                user_id=call_user_id,
                source="ai_call",
            )
            event["email_status"] = "dispatched"
            event["email_owner"] = owner_email
            event["email_rep"] = rep_email
            event["email_sent"] = True
            if event.get("id"):
                await db.update_calendar_event(event["id"], {
                    "email_status": "dispatched",
                    "email_owner": owner_email,
                    "email_rep": rep_email,
                    "email_sent": True,
                })
    except Exception as email_err:
        logger.warning(f"Email notification failed after AI meeting extraction for call {call_id}: {email_err}")

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


@router.post("/events/{event_id}/send-email")
async def send_email_for_event(
    event_id: str,
    recipient_email: Optional[str] = Query(None, description="Optional recipient email override"),
    send_to_both: Optional[bool] = Query(True, description="Send to both rep and customer if available"),
):
    """
    Manually dispatch or re-send meeting confirmation email with live video room link.
    Delivers to registered sales rep email and/or prospect email.
    """
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    owner_email = await email_service.resolve_workspace_owner_email(event.get("user_id"))
    rep_email = await email_service.resolve_user_registered_email(event.get("user_id"))
    target_customer_email = recipient_email or event.get("customer_email")

    if not owner_email and not rep_email and not target_customer_email:
        raise HTTPException(
            status_code=400,
            detail="No valid recipient email (owner email, rep email, or customer email) found for this event."
        )

    meet_url = event.get("meet_url") or calendar_service.generate_live_video_room(
        event.get("company_name"), event_id
    )

    res = await email_service.send_meeting_email(
        rep_email=rep_email or "",
        prospect_email=target_customer_email,
        lead_name=event.get("customer_name") or "Valued Partner",
        meeting_time=event.get("start_time") or "",
        meeting_link=meet_url,
        title=event.get("title") or "Discovery & Demo Meeting",
        agenda=event.get("agenda") or event.get("description") or "",
        customer_phone=event.get("customer_phone"),
        company_name=event.get("company_name") or "VyaperiX",
        send_to_prospect=bool(send_to_both and target_customer_email),
        owner_email=owner_email,
        user_id=event.get("user_id"),
        source="manual_event_dispatch",
    )

    await db.update_calendar_event(event_id, {
        "email_status": "sent",
        "email_sent_at": datetime.now(timezone.utc).isoformat(),
        "email_owner": owner_email,
        "email_rep": rep_email,
        "email_customer": target_customer_email,
    })

    return {
        "success": True,
        "message": f"Meeting confirmation email dispatched successfully to owner ({owner_email}) and participants",
        "owner_email": owner_email,
        "rep_email": rep_email,
        "customer_email": target_customer_email,
        "meet_url": meet_url,
        "result": res,
    }


class ApproveBookingRequest(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    meet_url: Optional[str] = None
    phone: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    custom_message: Optional[str] = None
    employee_email: Optional[str] = None
    employee_name: Optional[str] = None
    send_whatsapp: Optional[bool] = True
    send_sms: Optional[bool] = True
    send_email: Optional[bool] = True


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
@router.post("/events/{event_id}/confirm")
async def approve_and_confirm_meeting(
    event_id: str,
    payload: Optional[ApproveBookingRequest] = None,
    authorization: Optional[str] = Header(None),
):
    """
    Enterprise Meeting Confirmation Workflow:
    As soon as the meeting is confirmed by a company employee in the calendar:
    1. Dispatches Lead Confirmation Email via SMTP/SMTPS with custom meeting text and meeting link.
    2. Dispatches WhatsApp Web message to customer with custom text, meeting link, and date/time.
    3. Dispatches SMS alert to customer with meeting time and join link.
    4. Dispatches Employee Alert Email/Gmail to the company employee (where login is done)
       alerting them that the meeting is confirmed for the given time with client details.
    5. Saves dedicated historical meeting confirmation log in MongoDB.
    """
    event = await db.get_calendar_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    # ── 1. Resolve Company Employee Email (where login is done) ───────────────
    employee_email = None
    if payload and payload.employee_email and "@" in str(payload.employee_email):
        employee_email = str(payload.employee_email).strip()

    if not employee_email and authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user and auth_user.email:
                employee_email = str(auth_user.email).strip()
        except Exception as auth_err:
            logger.debug(f"Auth token decode in confirm event: {auth_err}")

    if not employee_email:
        raw_owner = event.get("user_email") or event.get("email_owner")
        if raw_owner and "@" in str(raw_owner):
            employee_email = str(raw_owner).strip()

    if not employee_email:
        employee_email = await email_service.resolve_user_registered_email(event.get("user_id"))

    if not employee_email:
        employee_email = await email_service.resolve_workspace_owner_email(event.get("user_id"))

    employee_name = (payload.employee_name if payload else None) or event.get("approved_by") or "Sales Specialist"

    # ── 2. Resolve Parameters & Custom Meeting Text ───────────────────────────
    start_time = (payload.start_time if payload else None) or event.get("start_time") or ""
    end_time = (payload.end_time if payload else None) or event.get("end_time") or ""
    custom_message = (
        (payload.custom_message if payload else None)
        or (payload.notes if payload else None)
        or event.get("notes")
        or event.get("custom_message")
        or ""
    )
    agenda = event.get("agenda") or event.get("description") or ""
    company_name = event.get("company_name") or "VyaperiX"
    customer_name = event.get("customer_name") or "Valued Partner"

    target_phone = (payload.phone if payload else None) or event.get("customer_phone")
    target_email = (payload.customer_email if payload else None) or event.get("customer_email")

    # ── 3. Resolve Working Live Video Room / Calendly Link ───────────────────
    meet_url = (payload.meet_url if payload else None) or event.get("meet_url")
    if not meet_url or "meet.google.com" in meet_url:
        meet_url = calendar_service.generate_live_video_room(
            company_name, event.get("id") or event_id
        )

    calendly_link = None
    try:
        calendly_link = await calendly_service.get_primary_booking_link()
    except Exception as cal_err:
        logger.warning(f"Could not resolve Calendly booking link: {cal_err}")

    formatted_time = email_service.format_datetime_human(start_time)

    # ── 4. Build Status Updates Dict ──────────────────────────────────────────
    updates: dict = {
        "status": "confirmed",
        "has_conflict": False,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": employee_email or "company_employee",
        "confirmed_by_employee_email": employee_email,
        "start_time": start_time,
        "end_time": end_time,
        "meet_url": meet_url,
        "notes": custom_message,
        "custom_message": custom_message,
    }
    if target_phone:
        updates["customer_phone"] = target_phone
    if target_email:
        updates["customer_email"] = target_email
    if calendly_link:
        updates["calendly_link"] = calendly_link
        updates["calendly_link_sent_at"] = datetime.now(timezone.utc).isoformat()
        updates["calendly_booked"] = updates.get("calendly_booked", False)

    # ── 5. Dispatch WhatsApp Web Message to Lead ──────────────────────────────
    wa_res: dict = {"success": False, "skipped": True}
    should_send_wa = payload.send_whatsapp if (payload and payload.send_whatsapp is not None) else True

    if target_phone and should_send_wa:
        try:
            wa_res = await whatsapp_service.send_meeting_confirmation_with_calendly(
                customer_name=customer_name,
                customer_phone=target_phone,
                business_name=company_name,
                start_time=start_time,
                meet_url=meet_url,
                calendly_link=calendly_link,
                agenda=agenda,
                requirements=event.get("notes") or "",
                custom_message=custom_message,
                employee_name=employee_name,
            )
            if wa_res.get("success"):
                updates["whatsapp_status"] = "sent"
                updates["whatsapp_sent_at"] = datetime.now(timezone.utc).isoformat()
            else:
                err_text = str(wa_res.get("error", ""))
                updates["whatsapp_status"] = "awaiting_scan" if ("not connected" in err_text or "gateway" in err_text) else "failed"
                updates["whatsapp_error"] = err_text
                logger.info(f"WhatsApp dispatch status for booking {event_id}: {err_text}")
        except Exception as wa_err:
            logger.warning(f"WhatsApp dispatch error: {wa_err}")
            updates["whatsapp_status"] = "failed"
            updates["whatsapp_error"] = str(wa_err)
    else:
        updates["whatsapp_status"] = "skipped_no_phone" if not target_phone else "skipped_by_flag"

    # ── 6. Dispatch SMS to Lead & Rep ─────────────────────────────────────────
    sms_res: dict = {"rep": None, "prospect": None}
    should_send_sms = payload.send_sms if (payload and payload.send_sms is not None) else True

    if target_phone and should_send_sms:
        try:
            rep_phone = await _resolve_rep_phone(event.get("user_id"))
            sms_res = sms_service.send_meeting_sms(
                rep_phone=rep_phone,
                prospect_phone=target_phone,
                lead_name=customer_name,
                meeting_time=formatted_time,
                meeting_link=calendly_link or meet_url,
                send_to_prospect=bool(target_phone),
                source="approved_booking",
                company_name=company_name,
            )
            updates["sms_status"] = "sent" if (sms_res.get("prospect") or {}).get("status") in ("sent", "mocked") else "failed"
        except Exception as sms_err:
            logger.warning(f"SMS notification failed during booking approval: {sms_err}")
            updates["sms_status"] = "error"
    else:
        updates["sms_status"] = "skipped_no_phone" if not target_phone else "skipped_by_flag"

    # ── 7. Dispatch Email Broadcast via SMTP/SMTPS ───────────────────────────
    # Channels:
    # A) Lead Confirmation Email (with custom text & live meeting link)
    # B) Company Employee Gmail Alert (where login is done)
    email_res: dict = {"customer": None, "employee": None, "owner": None}
    should_send_email = payload.send_email if (payload and payload.send_email is not None) else True

    if should_send_email:
        try:
            email_res = await email_service.send_meeting_confirmation_broadcast(
                employee_email=employee_email,
                customer_email=target_email,
                lead_name=customer_name,
                meeting_time=start_time,
                meeting_link=calendly_link or meet_url,
                title=event.get("title") or "Confirmed Discovery Session",
                agenda=agenda,
                customer_phone=target_phone,
                company_name=company_name,
                custom_message=custom_message,
                employee_name=employee_name,
                user_id=event.get("user_id"),
                source="approved_booking",
            )
            cust_status = (email_res.get("customer") or {}).get("status")
            emp_status = (email_res.get("employee") or {}).get("status")

            updates["email_status"] = "sent" if cust_status in ("sent", "mocked") else ("skipped" if cust_status == "skipped" else "failed")
            updates["email_sent_at"] = datetime.now(timezone.utc).isoformat()
            updates["email_owner"] = employee_email
            updates["employee_email"] = employee_email
            updates["employee_email_status"] = "sent" if emp_status in ("sent", "mocked") else ("skipped" if emp_status == "skipped" else "failed")
        except Exception as email_err:
            logger.warning(f"Email broadcast failed during booking approval: {email_err}")
            updates["email_status"] = "error"

    # ── 8. Persist Event & Record Dedicated Meeting Log ───────────────────────
    updated_event = await db.update_calendar_event(event_id, updates)

    try:
        await db.create_meeting_log(
            {
                "event_id": event_id,
                "call_id": event.get("call_id"),
                "customer_name": customer_name,
                "customer_phone": target_phone,
                "customer_email": target_email,
                "employee_email": employee_email,
                "company_name": company_name,
                "title": event.get("title") or "Confirmed Meeting",
                "description": event.get("description") or "",
                "agenda": agenda,
                "notes": custom_message,
                "custom_message": custom_message,
                "start_time": start_time,
                "end_time": end_time,
                "formatted_time": formatted_time,
                "meet_url": meet_url,
                "calendly_link": calendly_link,
                "calendly_booked": updates.get("calendly_booked", False),
                "status": "accepted",
                "approval_status": "accepted",
                "approved_at": updates.get("approved_at"),
                "approved_by": employee_email or "company_employee",
                "confirmed_by_employee_email": employee_email,
                "whatsapp_status": updates.get("whatsapp_status", "pending"),
                "whatsapp_sent_at": updates.get("whatsapp_sent_at"),
                "email_status": updates.get("email_status", "pending"),
                "email_sent_at": updates.get("email_sent_at"),
                "employee_email_status": updates.get("employee_email_status", "pending"),
                "sms_status": updates.get("sms_status", "pending"),
                "channels_notified": ["whatsapp", "customer_email", "sms", "employee_gmail"],
            },
            user_id=event.get("user_id"),
            user_email=employee_email or event.get("user_email"),
        )
    except Exception as log_err:
        logger.warning(f"Could not record dedicated meeting log: {log_err}")

    emp_feedback = f" & Gmail alert dispatched to {employee_email}" if employee_email else ""
    return {
        "success": True,
        "message": f"✓ Meeting confirmed for {formatted_time}! Notifications dispatched: Email, SMS, WhatsApp{emp_feedback}.",
        "event": updated_event,
        "dispatches": {
            "whatsapp": wa_res,
            "whatsapp_status": updates.get("whatsapp_status"),
            "sms": sms_res,
            "sms_status": updates.get("sms_status"),
            "customer_email": target_email,
            "customer_email_status": (email_res.get("customer") or {}).get("status"),
            "employee_email": employee_email,
            "employee_email_status": (email_res.get("employee") or {}).get("status"),
            "meet_url": meet_url,
            "formatted_time": formatted_time,
            "custom_message": custom_message,
        },
        "meet_url": meet_url,
        "calendly_link": calendly_link,
    }



# ─────────────────────────── Accepted Meeting Logs Endpoints ───────────

@router.get("/meeting-logs")
async def list_accepted_meeting_logs(
    user_id: Optional[str] = Query(None, description="Filter by user UUID"),
    user_email: Optional[str] = Query(None, description="Filter by user email"),
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(None),
):
    """
    List all accepted & confirmed meetings from the dedicated MongoDB meeting_logs collection.
    Preserves historical confirmation audit logs completely isolated from the standard schedule.
    """
    resolved_user_id = user_id
    resolved_user_email = user_email
    if authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user:
                if not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", ""):
                    resolved_user_id = auth_user.id
                if not resolved_user_email:
                    resolved_user_email = auth_user.email
        except Exception:
            pass

    logs = await db.list_meeting_logs(user_id=resolved_user_id, user_email=resolved_user_email, limit=limit)
    return {"meeting_logs": logs, "count": len(logs)}


@router.delete("/meeting-logs/{log_id}")
async def delete_meeting_log_entry(log_id: str):
    """Delete or archive an accepted meeting log."""
    deleted = await db.delete_meeting_log(log_id)
    return {"success": deleted, "deleted_id": log_id}
