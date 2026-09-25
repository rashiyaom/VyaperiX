"""
calendly_router.py — FastAPI Router for Calendly Integration.

Provides endpoints for:
- GET  /api/calendly/event-types        — List all Calendly event types (scheduling links)
- GET  /api/calendly/booking-link       — Get the primary booking link to send to leads
- GET  /api/calendly/webhooks           — List existing webhooks
- POST /api/calendly/webhooks/register  — Register a new webhook
- DELETE /api/calendly/webhooks/{uuid}  — Delete a webhook
- GET  /api/calendly/user               — Fetch Calendly user info
- POST /api/webhooks/calendly           — Public webhook receiver (invitee.created / invitee.canceled)
"""

import logging
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel

from app.services import calendly_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ─────────────────────────── Schemas ─────────────────────────────────────────

class RegisterWebhookRequest(BaseModel):
    callback_url: str
    events: Optional[list] = None


# ─────────────────────────── Authenticated Endpoints ─────────────────────────

@router.get("/user")
async def get_calendly_user(authorization: Optional[str] = Header(None)):
    """Fetch current Calendly account user details."""
    user = await calendly_service.get_current_user()
    if not user:
        raise HTTPException(status_code=502, detail="Could not connect to Calendly API. Check your PAT token.")
    return {"success": True, "user": user}


@router.get("/event-types")
async def get_event_types(authorization: Optional[str] = Header(None)):
    """Retrieve all active Calendly event types (scheduling page URLs)."""
    event_types = await calendly_service.list_event_types()
    return {"success": True, "event_types": event_types, "total": len(event_types)}


@router.get("/booking-link")
async def get_booking_link(authorization: Optional[str] = Header(None)):
    """
    Returns the primary booking link to include in SMS/WhatsApp to leads.
    Can be overridden in Voice Settings via calendly_event_url.
    """
    link = await calendly_service.get_primary_booking_link()
    return {
        "success": True,
        "booking_link": link,
        "configured": bool(link),
    }


@router.get("/webhooks")
async def list_webhooks(authorization: Optional[str] = Header(None)):
    """List all registered Calendly webhook subscriptions."""
    webhooks = await calendly_service.list_webhooks()
    return {"success": True, "webhooks": webhooks, "total": len(webhooks)}


@router.post("/webhooks/register")
async def register_webhook(payload: RegisterWebhookRequest):
    """
    Register a new Calendly webhook subscription.
    The callback_url must be your public server URL (e.g. via ngrok or production domain).
    """
    result = await calendly_service.register_webhook(
        callback_url=payload.callback_url,
        events=payload.events,
    )
    if not result:
        raise HTTPException(
            status_code=502,
            detail="Failed to register Calendly webhook. Ensure callback URL is publicly accessible and Calendly PAT has webhook:write scope."
        )
    return {"success": True, "webhook": result}


@router.delete("/webhooks/{webhook_uuid}")
async def delete_webhook(webhook_uuid: str):
    """Delete a Calendly webhook subscription by UUID."""
    uri = f"https://api.calendly.com/webhook_subscriptions/{webhook_uuid}"
    ok = await calendly_service.delete_webhook(uri)
    if not ok:
        raise HTTPException(status_code=404, detail="Webhook not found or already deleted.")
    return {"success": True, "deleted_uuid": webhook_uuid}


# ─────────────────────────── Public Webhook Receiver ─────────────────────────

@router.post("/webhook")
async def receive_calendly_webhook(request: Request):
    """
    Public Calendly webhook receiver.
    Handles invitee.created and invitee.canceled events.
    Automatically updates the matching internal calendar event with booking status.
    """
    try:
        payload = await request.json()
        logger.info(f"Calendly webhook received: event={payload.get('event')}, invitee={payload.get('payload', {}).get('invitee', {}).get('email', 'N/A')}")
        result = await calendly_service.process_invitee_webhook(payload)
        return {"ok": True, "result": result}
    except Exception as e:
        logger.exception(f"Error processing Calendly webhook: {e}")
        return {"ok": False, "error": str(e)}
