"""
email_router.py — FastAPI Router for Email Notifications & Greeting / Meeting Engine.

Provides endpoints to:
- Check SMTP connection & configuration status
- Send greeting / welcome emails to registered login/signup emails
- Send meeting confirmation emails with live video meeting links
- Send test verification emails
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core import auth_middleware
from app.core import database as db
from app.services import email_service

logger = logging.getLogger("vyepari.email")
router = APIRouter()


class SendGreetingRequest(BaseModel):
    email: Optional[str] = Field(None, description="Target recipient email (defaults to authenticated registered user email)")
    name: Optional[str] = Field(None, description="User's display name")
    company: Optional[str] = Field(None, description="User's company or workspace name")


class SendMeetingEmailRequest(BaseModel):
    event_id: Optional[str] = Field(None, description="Optional ID of existing calendar event to populate details from")
    lead_name: Optional[str] = Field(None, description="Customer or prospect name")
    meeting_time: Optional[str] = Field(None, description="Meeting time (ISO-8601 or formatted string)")
    meeting_link: Optional[str] = Field(None, description="Google Meet or Jitsi live video room link")
    title: Optional[str] = Field("Discovery & Solution Demo", description="Meeting title or subject")
    agenda: Optional[str] = Field("", description="Meeting agenda or notes")
    customer_phone: Optional[str] = Field(None, description="Customer phone number")
    customer_email: Optional[str] = Field(None, description="Customer / prospect email address")
    rep_email: Optional[str] = Field(None, description="Sales rep email (defaults to registered account email)")
    owner_email: Optional[str] = Field(None, description="Workspace owner email (defaults to registered account owner)")
    company_name: Optional[str] = Field(None, description="Company or business name")
    send_to_prospect: Optional[bool] = Field(True, description="Whether to also send client confirmation to customer_email")


class TestEmailRequest(BaseModel):
    to_email: Optional[str] = Field(None, description="Recipient email (defaults to authenticated user email)")


async def _resolve_auth_user(authorization: Optional[str]):
    """Helper to resolve current authenticated user if token present."""
    if authorization:
        try:
            return await auth_middleware.get_current_user(authorization)
        except Exception as e:
            logger.debug(f"Auth resolve note: {e}")
    return None


@router.get("/status", summary="Check Email & SMTP Service Status")
async def get_email_status(
    authorization: Optional[str] = Header(None),
):
    """
    Returns active SMTP configuration status, mock mode status, and resolved registered email.
    """
    config = email_service.get_smtp_config()
    auth_user = await _resolve_auth_user(authorization)

    registered_email = None
    if auth_user:
        registered_email = await email_service.resolve_user_registered_email(auth_user.id) or auth_user.email

    return {
        "status": "ready",
        "is_configured": config["is_configured"],
        "mock_mode": config["mock_mode"],
        "host": config["host"],
        "port": config["port"],
        "secure": config["secure"],
        "from_name": config["from_name"],
        "from_email": config["from_email"],
        "registered_user_email": registered_email,
    }


@router.post("/send-greeting", summary="Send Welcome / Greeting Email to Registered User")
async def send_greeting(
    payload: Optional[SendGreetingRequest] = None,
    authorization: Optional[str] = Header(None),
):
    """
    Dispatches a modern HTML greeting email to the registered login/signup email address.
    If no recipient is explicitly passed, automatically detects the authenticated user's email.
    """
    auth_user = await _resolve_auth_user(authorization)
    target_email = payload.email if (payload and payload.email) else None
    user_name = payload.name if (payload and payload.name) else None
    company_name = payload.company if (payload and payload.company) else None

    # Resolve from authenticated user if not provided
    if not target_email and auth_user:
        target_email = await email_service.resolve_user_registered_email(auth_user.id) or auth_user.email
        if not user_name and auth_user.user_metadata:
            user_name = auth_user.user_metadata.get("full_name") or auth_user.user_metadata.get("name")
        if not company_name and auth_user.user_metadata:
            company_name = auth_user.user_metadata.get("company_name") or auth_user.user_metadata.get("company")

    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No recipient email address could be resolved. Please log in or provide an email in the request.",
        )

    res = await email_service.send_greeting_email(
        to_email=target_email.strip(),
        user_name=user_name,
        company_name=company_name,
    )

    # If authenticated, update MongoDB profile greeting status
    if auth_user and auth_user.id:
        try:
            await db.update_profile(auth_user.id, {
                "greeting_email_sent": True,
                "greeting_email_sent_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.debug(f"Could not update greeting_email_sent in profile: {e}")

    return {
        "success": res.get("status") in ("sent", "mocked"),
        "result": res,
        "recipient": target_email,
        "mode": "mocked" if res.get("status") == "mocked" else "live",
    }


@router.post("/send-meeting", summary="Send Meeting Confirmation with Video Link")
async def send_meeting(
    payload: SendMeetingEmailRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Dispatches meeting confirmation emails containing the live meeting link (Google Meet / Jitsi).
    - Always delivers to the registered account email (rep_email).
    - Optionally delivers confirmation to the prospect/customer if customer_email is provided.
    """
    auth_user = await _resolve_auth_user(authorization)

    # 1. If event_id provided, load event details from MongoDB
    event_data = None
    if payload.event_id:
        event_data = await db.get_calendar_event(payload.event_id)

    # Merge event data with payload fallbacks
    lead_name = (
        payload.lead_name
        or (event_data.get("customer_name") if event_data else None)
        or "Valued Partner"
    )
    meeting_time = (
        payload.meeting_time
        or (event_data.get("start_time") if event_data else None)
        or "Upcoming Scheduled Slot"
    )
    meeting_link = (
        payload.meeting_link
        or (event_data.get("meet_url") if event_data else None)
        or "https://meet.jit.si/VyaperiX-Live-Demo"
    )
    title = (
        payload.title
        or (event_data.get("title") if event_data else None)
        or "Discovery & Solution Demo"
    )
    agenda = (
        payload.agenda
        or (event_data.get("agenda") or event_data.get("description") if event_data else "")
        or ""
    )
    customer_phone = (
        payload.customer_phone
        or (event_data.get("customer_phone") if event_data else None)
    )
    customer_email = (
        payload.customer_email
        or (event_data.get("customer_email") if event_data else None)
    )
    company_name = (
        payload.company_name
        or (event_data.get("company_name") if event_data else None)
        or "VyaperiX Enterprise"
    )

    # Resolve rep email: payload -> auth_user registered email -> fallback
    rep_email = payload.rep_email
    if not rep_email and auth_user:
        rep_email = await email_service.resolve_user_registered_email(auth_user.id) or auth_user.email
    if not rep_email:
        rep_email = await email_service.resolve_user_registered_email(None)

    owner_email = payload.owner_email
    if not owner_email:
        owner_email = await email_service.resolve_workspace_owner_email(auth_user.id if auth_user else None)

    if not owner_email and not rep_email and not customer_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Neither a workspace owner email, rep email, nor customer email could be determined for dispatch.",
        )

    res = await email_service.send_meeting_email(
        rep_email=rep_email or "",
        prospect_email=customer_email,
        lead_name=lead_name,
        meeting_time=meeting_time,
        meeting_link=meeting_link,
        title=title,
        agenda=agenda,
        customer_phone=customer_phone,
        company_name=company_name,
        send_to_prospect=bool(payload.send_to_prospect and customer_email),
        owner_email=owner_email,
        user_id=auth_user.id if auth_user else None,
        source="api",
    )

    # If tied to an event, mark email status in event record
    if payload.event_id and event_data:
        try:
            await db.update_calendar_event(payload.event_id, {
                "email_status": "sent",
                "email_sent_at": datetime.now(timezone.utc).isoformat(),
                "email_owner": owner_email,
                "email_rep": rep_email,
                "email_customer": customer_email,
            })
        except Exception as update_err:
            logger.debug(f"Could not update event email status: {update_err}")

    return {
        "success": True,
        "message": f"Meeting notification dispatched for {lead_name} (Owner and participants notified)",
        "owner_email": owner_email,
        "rep_email": rep_email,
        "customer_email": customer_email,
        "meeting_link": meeting_link,
        "results": res,
    }


@router.post("/test", summary="Send Test Email")
async def send_test_email(
    payload: Optional[TestEmailRequest] = None,
    authorization: Optional[str] = Header(None),
):
    """
    Sends a test verification email to confirm SMTP connectivity and delivery.
    """
    auth_user = await _resolve_auth_user(authorization)
    target_email = payload.to_email if (payload and payload.to_email) else None

    if not target_email and auth_user:
        target_email = await email_service.resolve_user_registered_email(auth_user.id) or auth_user.email

    if not target_email:
        config = email_service.get_smtp_config()
        target_email = config.get("user") or config.get("from_email")

    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please specify a recipient email address in the request payload.",
        )

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    subject = f"🧪 VyaperiX Email Notification Test — {now_str}"
    html = f"""
    <div style="font-family: sans-serif; background: #0b0d13; color: #f4f4f5; padding: 30px; border-radius: 8px;">
      <h2 style="color: #a855f7;">VyaperiX Email Engine Verification</h2>
      <p>This is a test notification confirming that the VyaperiX email delivery engine is operational.</p>
      <ul>
        <li><strong>Timestamp:</strong> {now_str}</li>
        <li><strong>Recipient:</strong> {target_email}</li>
        <li><strong>Status:</strong> Success</li>
      </ul>
      <p style="color: #71717a; font-size: 12px;">VyaperiX Autonomous Commercial Intelligence</p>
    </div>
    """

    res = await email_service.send_email(
        to_email=target_email,
        subject=subject,
        html_content=html,
        text_content=f"VyaperiX Email Test successfully delivered to {target_email} at {now_str}",
    )

    return {
        "success": res.get("status") in ("sent", "mocked"),
        "result": res,
        "recipient": target_email,
    }


class SendPitchEmailRequest(BaseModel):
    to_email: str = Field(..., description="Target prospect email address")
    company_name: str = Field(..., description="Prospect company name")
    lead_name: Optional[str] = Field("Commercial Procurement Team", description="Recipient lead/contact name")
    subject: Optional[str] = Field(None, description="Custom email subject line")
    pitch_text: str = Field(..., min_length=5, description="Personalized pitch or value proposition")
    sender_name: Optional[str] = Field(None, description="Sender name (defaults to user display name)")
    sender_company: Optional[str] = Field(None, description="Sender company (defaults to user business name)")


@router.post("/send-pitch", summary="Dispatch Direct B2B Email Pitch to Lead")
async def send_lead_pitch(
    payload: SendPitchEmailRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Sends a high-converting personalized B2B outreach email directly to a discovered company lead.
    """
    auth_user = await _resolve_auth_user(authorization)
    sender_name = payload.sender_name
    sender_company = payload.sender_company

    if auth_user and auth_user.user_metadata:
        if not sender_name:
            sender_name = auth_user.user_metadata.get("full_name") or auth_user.user_metadata.get("name")
        if not sender_company:
            sender_company = auth_user.user_metadata.get("company_name") or auth_user.user_metadata.get("company")

    sender_name = sender_name or "Commercial Director"
    sender_company = sender_company or "VyaperiX"

    subject = payload.subject or f"Exploring Synergy: {sender_company} x {payload.company_name}"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0f17; color: #f4f4f5;">
  <div style="max-width: 600px; margin: 30px auto; background-color: #161926; border: 1px solid #2a2e42; border-radius: 12px; overflow: hidden; padding: 32px;">
    <div style="border-bottom: 1px solid #2a2e42; padding-bottom: 16px; margin-bottom: 24px;">
      <span style="font-size: 11px; font-weight: bold; letter-spacing: 0.1em; color: #a855f7; text-transform: uppercase;">Direct Commercial Inquiry</span>
      <h2 style="margin: 6px 0 0 0; color: #ffffff; font-size: 20px;">{sender_company} &rarr; {payload.company_name}</h2>
    </div>

    <p style="font-size: 15px; color: #e4e4e7; line-height: 1.6; margin-bottom: 16px;">
      Hello {payload.lead_name or 'Team'},
    </p>

    <div style="background-color: #1e2235; border-left: 3px solid #8b5cf6; padding: 16px; border-radius: 6px; margin: 20px 0; font-size: 14px; line-height: 1.6; color: #e4e4e7;">
      {payload.pitch_text.replace(chr(10), '<br/>')}
    </div>

    <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">
      Would your team be open to a brief 10-minute discovery conversation this week to discuss how we can support your commercial objectives?
    </p>

    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #2a2e42; font-size: 13px; color: #71717a;">
      <strong style="color: #ffffff;">{sender_name}</strong><br/>
      {sender_company}
    </div>
  </div>
</body>
</html>"""

    res = await email_service.send_email(
        to_email=payload.to_email.strip(),
        subject=subject,
        html_content=html,
        text_content=f"{payload.pitch_text}\n\nBest regards,\n{sender_name}\n{sender_company}",
        from_name=sender_name,
    )

    return {
        "success": res.get("status") in ("sent", "mocked"),
        "status": res.get("status"),
        "recipient": payload.to_email.strip(),
        "subject": subject,
        "message": "B2B pitch email dispatched successfully.",
        "result": res,
    }

