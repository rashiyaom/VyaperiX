"""
calendly_service.py — Calendly API Integration Service for VyaperiX.

Capabilities:
- Fetch user event types (scheduling page URLs) via Calendly API v2.
- Resolve the active booking link to send to leads (first active event type URL).
- Register and manage Calendly webhooks for real-time booking tracking.
- Process `invitee.created` / `invitee.canceled` webhook payloads and update
  calendar event records with booking status.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

from app.core import database as db

load_dotenv()
logger = logging.getLogger("vyepari.calendly")

CALENDLY_API_BASE = "https://api.calendly.com"

# ─── Embedded Personal Access Token ──────────────────────────────────────────
EMBEDDED_CALENDLY_TOKEN = (
    "eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0"
    "IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzkw"
    "MzA5NDIxLCJqdGkiOiJhZmYxOGJkZC03ZTk4LTQzOWMtOTcwMS1mODA2YzI5NTRhMWYiLCJ1c2VyX3V1aWQiOiI4OTQxNDNjNC"
    "02NTA4LTQ1OGItOGE2OC04OTEzOTYwNzc0MzkiLCJzY29wZSI6ImV2ZW50X3R5cGVzOnJlYWQgc2NoZWR1bGVkX2V2ZW50czpy"
    "ZWFkIHdlYmhvb2tzOnJlYWQgd2ViaG9va3M6d3JpdGUifQ.tRiY3HrPiZdMFrpZK1qfs5SdZey6QrREMF9W-65KCkcp2zopOFR"
    "6IoM9V365NGIAVxp3AWd0vCI3xdtaxeSmfg"
)


def _get_token() -> str:
    """Resolve Calendly PAT: DB settings > env > embedded token."""
    env_token = os.getenv("CALENDLY_API_TOKEN", "").strip()
    return env_token or EMBEDDED_CALENDLY_TOKEN


def _auth_headers(token: Optional[str] = None) -> dict:
    return {
        "Authorization": f"Bearer {token or _get_token()}",
        "Content-Type": "application/json",
    }


# ─── User & Event Types ───────────────────────────────────────────────────────

def _decode_user_uuid_from_token(token: Optional[str] = None) -> Optional[str]:
    """
    Extract the user_uuid directly from the JWT payload (no API call needed).
    This avoids the /users/me endpoint which requires the users:read scope.
    """
    try:
        import base64, json as _json
        raw = token or _get_token()
        parts = raw.split(".")
        if len(parts) < 2:
            return None
        # Pad and decode the payload segment (index 1)
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(padded).decode())
        return payload.get("user_uuid")
    except Exception as e:
        logger.warning(f"Could not decode user UUID from Calendly token: {e}")
        return None


async def get_current_user(token: Optional[str] = None) -> Optional[dict]:
    """
    Return minimal user info extracted directly from the JWT payload.
    Constructs the Calendly user URI without requiring /users/me (users:read scope).
    """
    uuid = _decode_user_uuid_from_token(token)
    if not uuid:
        return None
    return {
        "uri": f"https://api.calendly.com/users/{uuid}",
        "uuid": uuid,
        "current_organization": None,  # Not available without users:read
    }


async def list_event_types(token: Optional[str] = None) -> List[dict]:
    """Return the user's active Calendly event types (scheduling links)."""
    user = await get_current_user(token)
    if not user:
        return []

    user_uri = user.get("uri")
    if not user_uri:
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{CALENDLY_API_BASE}/event_types",
                headers=_auth_headers(token),
                params={"user": user_uri, "active": "true"},
            )
            if resp.status_code == 200:
                return resp.json().get("collection", [])
            logger.warning(f"Calendly event_types returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Calendly list_event_types error: {e}")
    return []


async def get_primary_booking_link(token: Optional[str] = None) -> Optional[str]:
    """
    Return the first active scheduling URL from the user's Calendly account.
    This is the link sent to leads (e.g. https://calendly.com/username/30min).
    Falls back to the calendly_event_url stored in voice_settings if set.
    """
    # Check DB overrides first
    try:
        settings = await db.get_voice_settings()
        if settings and settings.get("calendly_event_url"):
            return str(settings["calendly_event_url"]).strip()
    except Exception:
        pass

    event_types = await list_event_types(token)
    if event_types:
        return event_types[0].get("scheduling_url")
    return None


# ─── Scheduled Events (Booking Tracking) ─────────────────────────────────────

async def get_scheduled_events(token: Optional[str] = None) -> List[dict]:
    """List recently scheduled Calendly events for the user."""
    user = await get_current_user(token)
    if not user:
        return []
    user_uri = user.get("uri")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{CALENDLY_API_BASE}/scheduled_events",
                headers=_auth_headers(token),
                params={"user": user_uri, "count": 50, "status": "active"},
            )
            if resp.status_code == 200:
                return resp.json().get("collection", [])
    except Exception as e:
        logger.error(f"Calendly get_scheduled_events error: {e}")
    return []


# ─── Webhook Registration ─────────────────────────────────────────────────────

async def register_webhook(
    callback_url: str,
    events: Optional[List[str]] = None,
    token: Optional[str] = None,
) -> Optional[dict]:
    """
    Register a Calendly webhook using user scope.
    The callback_url should point to /webhook/calendly on your public server.
    """
    if events is None:
        events = ["invitee.created", "invitee.canceled"]

    user = await get_current_user(token)
    if not user:
        logger.warning("Cannot register Calendly webhook: could not resolve user.")
        return None

    user_uri = user.get("uri")
    if not user_uri:
        logger.warning("Calendly: no user URI resolved from token.")
        return None

    # Use user scope (works without users:read or org access)
    payload = {
        "url": callback_url,
        "events": events,
        "user": user_uri,
        "scope": "user",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{CALENDLY_API_BASE}/webhook_subscriptions",
                headers=_auth_headers(token),
                json=payload,
            )
            if resp.status_code in (200, 201):
                logger.info(f"Calendly webhook registered at {callback_url}")
                return resp.json()
            logger.warning(f"Calendly webhook registration failed {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        logger.error(f"Calendly register_webhook error: {e}")
    return None


async def list_webhooks(token: Optional[str] = None) -> List[dict]:
    """List existing Calendly webhook subscriptions for this user."""
    user = await get_current_user(token)
    if not user:
        return []
    user_uri = user.get("uri")
    if not user_uri:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{CALENDLY_API_BASE}/webhook_subscriptions",
                headers=_auth_headers(token),
                params={"user": user_uri, "scope": "user"},
            )
            if resp.status_code == 200:
                return resp.json().get("collection", [])
    except Exception as e:
        logger.error(f"Calendly list_webhooks error: {e}")
    return []


async def delete_webhook(webhook_uri: str, token: Optional[str] = None) -> bool:
    """Delete a Calendly webhook subscription by URI."""
    try:
        uuid = webhook_uri.split("/")[-1]
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(
                f"{CALENDLY_API_BASE}/webhook_subscriptions/{uuid}",
                headers=_auth_headers(token),
            )
            return resp.status_code in (200, 204)
    except Exception as e:
        logger.error(f"Calendly delete_webhook error: {e}")
    return False


# ─── Webhook Payload Processing ───────────────────────────────────────────────

async def process_invitee_webhook(payload: dict) -> dict:
    """
    Handle Calendly webhook payloads (invitee.created / invitee.canceled).

    Looks for a matching calendar event in MongoDB via:
    - email address of the invitee matching customer_email on calendar event
    - or phone number of invitee matching customer_phone

    Updates the event with:
    - calendly_booked: True/False
    - calendly_booking_at: ISO timestamp
    - calendly_invitee_name: Name from Calendly
    - calendly_invitee_email: Email from Calendly
    - calendly_event_uri: The Calendly event URI
    - status updates accordingly
    """
    event_type = payload.get("event", "")
    event_data = payload.get("payload", {})

    invitee = event_data.get("invitee", {}) or {}
    invitee_email = invitee.get("email", "").lower().strip()
    invitee_name = invitee.get("name", "")
    invitee_uri = invitee.get("uri", "")
    created_at = invitee.get("created_at", "")
    cancel_url = invitee.get("cancel_url", "")
    reschedule_url = invitee.get("reschedule_url", "")

    scheduled_event_uri = event_data.get("event", {}).get("uri", "") if event_data.get("event") else ""

    is_created = event_type == "invitee.created"
    is_canceled = event_type == "invitee.canceled"

    result = {
        "event_type": event_type,
        "invitee_email": invitee_email,
        "invitee_name": invitee_name,
        "matched_calendar_event": None,
        "updated": False,
    }

    if not invitee_email and not invitee_uri:
        logger.warning(f"Calendly webhook payload missing invitee details: {payload}")
        return result

    # Search matching internal calendar event by email or by calendly_link reference
    matched_event = None
    try:
        all_events = await db.list_calendar_events(limit=500)
        for ev in all_events:
            ev_email = (ev.get("customer_email") or "").lower().strip()
            ev_link = (ev.get("calendly_link") or "").strip()
            # Match by email address
            if invitee_email and ev_email == invitee_email:
                matched_event = ev
                break
            # Match by Calendly event URI embedded in the link (fallback)
            if ev_link and scheduled_event_uri and scheduled_event_uri in ev_link:
                matched_event = ev
                break
    except Exception as e:
        logger.error(f"Error searching calendar events for Calendly webhook match: {e}")

    if not matched_event:
        logger.info(f"Calendly webhook: No matching internal calendar event for invitee {invitee_email}")
        result["message"] = "No matching internal calendar event found."
        return result

    # Build update payload for the matched event
    updates: dict = {}
    if is_created:
        updates = {
            "calendly_booked": True,
            "calendly_booking_at": created_at,
            "calendly_invitee_name": invitee_name,
            "calendly_invitee_email": invitee_email,
            "calendly_event_uri": scheduled_event_uri,
            "calendly_cancel_url": cancel_url,
            "calendly_reschedule_url": reschedule_url,
            "status": "confirmed",
        }
        logger.info(f"Calendly booking confirmed for {invitee_email} → internal event {matched_event['id']}")
    elif is_canceled:
        updates = {
            "calendly_booked": False,
            "calendly_canceled_at": created_at,
            "calendly_invitee_email": invitee_email,
            "status": "new_booking",
        }
        logger.info(f"Calendly booking canceled for {invitee_email} → internal event {matched_event['id']}")

    if updates:
        await db.update_calendar_event(matched_event["id"], updates)
        result["updated"] = True
        result["matched_calendar_event"] = matched_event["id"]
        result["updates_applied"] = updates

    return result
