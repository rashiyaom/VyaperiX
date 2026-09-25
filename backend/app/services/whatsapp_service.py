"""
whatsapp_service.py — WhatsApp Integration Service for VyaperiX.

Capabilities:
- Communicates with the local or cloud WhatsApp Gateway (Baileys WebSocket / QR bridge).
- Formats and dispatches post-call customer requirements summaries.
- Formats and dispatches meeting confirmations with Google Meet links and discussion agendas.
- Cleanly sanitizes and validates phone numbers for WhatsApp international messaging.
- Resilient non-blocking execution (gracefully logs status if gateway is not connected).
"""

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("vyepari.whatsapp")

DEFAULT_GATEWAY_URL = "http://localhost:3001"


def get_gateway_url() -> str:
    """Retrieve WhatsApp Gateway base URL from environment or fallback."""
    raw = os.getenv("WHATSAPP_GATEWAY_URL", DEFAULT_GATEWAY_URL).strip()
    return raw.rstrip("/")


def normalize_whatsapp_number(phone: str) -> Optional[str]:
    """
    Normalizes phone numbers to standard international digits (E.164 without '+').
    Examples:
        '+91 98200-12345' -> '919820012345'
        '9820012345'      -> '919820012345' (assumes India for 10-digit numbers)
        '09820012345'     -> '919820012345'
    """
    if not phone:
        return None
    digits = re.sub(r"[^\d]", "", str(phone))
    if not digits:
        return None

    # Handle leading zero in Indian mobile numbers
    if len(digits) == 11 and digits.startswith("0"):
        digits = "91" + digits[1:]
    # If standard 10-digit Indian number without country code
    elif len(digits) == 10:
        digits = "91" + digits

    if len(digits) < 8:
        return None
    return digits


def format_meeting_time(iso_time: str) -> str:
    """Formats an ISO-8601 timestamp into a readable date and time string."""
    try:
        # Normalize trailing Z to UTC
        cleaned = iso_time.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        # Format as: "Thursday, 24 Sep at 03:00 PM IST"
        return dt.strftime("%A, %d %b %Y at %I:%M %p")
    except Exception:
        return iso_time


async def check_gateway_status() -> dict:
    """Check connectivity with the WhatsApp Gateway service."""
    url = f"{get_gateway_url()}/status"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.json()
            return {"connected": False, "error": f"Gateway returned status {resp.status_code}"}
    except Exception as e:
        return {"connected": False, "error": f"Cannot connect to WhatsApp Gateway at {url}: {e}"}


async def get_gateway_qr() -> dict:
    """Fetch QR code details (data URL + connection status) from WhatsApp Gateway."""
    url = f"{get_gateway_url()}/api/qr"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.json()
            return {"connected": False, "error": f"Gateway returned status {resp.status_code}"}
    except Exception as e:
        return {"connected": False, "error": f"Cannot connect to WhatsApp Gateway at {url}: {e}"}


async def logout_gateway() -> dict:
    """Logout current WhatsApp session to reconnect with a new device/phone."""
    url = f"{get_gateway_url()}/api/logout"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url)
            return resp.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


async def send_whatsapp_message(phone: str, text: str) -> dict:
    """
    Send an arbitrary WhatsApp text message to a recipient.
    Returns:
        {"success": bool, "recipient": str, "message_id": Optional[str], "error": Optional[str]}
    """
    clean_phone = normalize_whatsapp_number(phone)
    if not clean_phone:
        err = f"Invalid phone number '{phone}' for WhatsApp dispatch."
        logger.warning(err)
        return {"success": False, "error": err}

    clean_text = (text or "").strip()
    if not clean_text:
        return {"success": False, "error": "Message body cannot be empty."}

    url = f"{get_gateway_url()}/api/send"
    payload = {
        "phone": clean_phone,
        "message": clean_text,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()
            if resp.status_code == 200 and data.get("success"):
                logger.info(f"WhatsApp message dispatched successfully to {clean_phone}")
                return {
                    "success": True,
                    "recipient": clean_phone,
                    "message_id": data.get("message_id"),
                    "sent_at": data.get("sent_at"),
                }
            else:
                err = data.get("error") or f"Gateway error ({resp.status_code})"
                logger.warning(f"WhatsApp gateway failed to send message to {clean_phone}: {err}")
                return {"success": False, "recipient": clean_phone, "error": err}
    except httpx.ConnectError:
        err = f"WhatsApp Gateway is not running at {url}. Start it with 'npm run dev:whatsapp'."
        logger.warning(err)
        return {"success": False, "recipient": clean_phone, "error": err}
    except Exception as e:
        logger.exception(f"Unexpected error sending WhatsApp message to {clean_phone}: {e}")
        return {"success": False, "recipient": clean_phone, "error": str(e)}


async def send_meeting_confirmation(
    customer_name: str,
    customer_phone: str,
    business_name: str,
    start_time: str,
    meet_url: str,
    agenda: Optional[str] = None,
    requirements: Optional[str] = None,
) -> dict:
    """
    Builds and sends a meeting confirmation message with live video room link & call requirements.
    """
    c_name = (customer_name or "there").strip()
    b_name = (business_name or "our team").strip()
    formatted_time = format_meeting_time(start_time)

    lines = [
        f"नमस्ते / Hello {c_name}! 🎉",
        "",
        f"Thank you for speaking with our team today! As discussed, your product demonstration & briefing session with *{b_name}* is officially confirmed.",
        "",
        f"📅 *Date & Time:* {formatted_time}",
        f"🎥 *Live Video Meeting Room:*",
        f"{meet_url}",
        "_(Click link above to join from your mobile phone or PC. No app download or account required!)_",
    ]

    if agenda:
        clean_agenda = agenda.strip()
        lines.extend(["", f"📋 *Discussion Agenda & Topics:*\n{clean_agenda}"])

    if requirements:
        clean_req = requirements.strip()
        lines.extend(["", f"📌 *Key Requirements Noted from Call:*\n_{clean_req}_"])

    lines.extend([
        "",
        "💡 *Session Tips:* Please join 2 minutes early with your camera and microphone enabled for the live walkthrough.",
        "",
        "Looking forward to connecting! If you need to reschedule or have questions before the session, simply reply to this WhatsApp message.",
        f"— Team *{b_name}*",
    ])

    full_message = "\n".join(lines)
    return await send_whatsapp_message(phone=customer_phone, text=full_message)


async def send_requirements_summary(
    customer_name: str,
    customer_phone: str,
    business_name: str,
    requirements: Any,
    next_steps: Optional[Any] = None,
) -> dict:
    """
    Builds and sends a post-call requirements summary when no meeting was booked.
    Formats lists as clean bullet points.
    """
    c_name = (customer_name or "there").strip()
    b_name = (business_name or "our team").strip()

    # Format requirements
    if isinstance(requirements, list):
        req_lines = [f"• {str(r).strip()}" for r in requirements if str(r).strip()]
        clean_req = "\n".join(req_lines) if req_lines else "Discussion on business requirements."
    else:
        clean_req = str(requirements or "Discussion on business requirements.").strip()

    # Format next steps
    if isinstance(next_steps, list):
        step_lines = [f"• {str(s).strip()}" for s in next_steps if str(s).strip()]
        clean_next_steps = "\n".join(step_lines) if step_lines else "Our team will follow up with the requested details shortly."
    elif next_steps:
        clean_next_steps = str(next_steps).strip()
    else:
        clean_next_steps = "Our solution specialist is reviewing your requirements and will reach out with a personalized proposal shortly."

    lines = [
        f"Hello {c_name}! 👋",
        "",
        f"Thank you for speaking with *{b_name}* today.",
        "",
        "Here is a summary of your requirements noted by our team:",
        f"📌 *Requirements Noted:*\n{clean_req}",
        "",
        f"🚀 *Next Steps:*\n{clean_next_steps}",
        "",
        "Have any additional questions, or would you like to schedule a live demo? Reply directly to this WhatsApp message anytime!",
        f"— Team *{b_name}*",
    ]

    full_message = "\n".join(lines)
    return await send_whatsapp_message(phone=customer_phone, text=full_message)


async def send_meeting_confirmation_with_calendly(
    customer_name: str,
    customer_phone: str,
    business_name: str,
    start_time: str,
    meet_url: str,
    calendly_link: Optional[str] = None,
    agenda: Optional[str] = None,
    requirements: Optional[str] = None,
) -> dict:
    """
    Sends a meeting confirmation. If a Calendly link is provided, it is featured
    prominently so the customer can self-pick their preferred time slot.
    Falls back to Jitsi / video room link when no Calendly link is configured.
    """
    c_name = (customer_name or "there").strip()
    b_name = (business_name or "our team").strip()
    formatted_time = format_meeting_time(start_time)

    lines = [
        f"नमस्ते / Hello {c_name}! 🎉",
        "",
        f"Thank you for speaking with *{b_name}* today! Our team has reviewed your request and confirmed your meeting.",
        "",
    ]

    if calendly_link:
        lines += [
            "📅 *Book Your Preferred Time Slot:*",
            f"{calendly_link}",
            "_(Tap the link above to pick a time that works best for you — no app required!)_",
            "",
            f"📌 *Proposed Slot:* {formatted_time}",
        ]
    else:
        lines += [
            f"📅 *Date & Time:* {formatted_time}",
            "🎥 *Live Video Meeting Room:*",
            f"{meet_url}",
            "_(Click link above to join from mobile or PC. No app download required!)_",
        ]

    if agenda:
        clean_agenda = agenda.strip()
        lines.extend(["", f"📋 *Discussion Agenda:*\n{clean_agenda}"])

    if requirements:
        clean_req = requirements.strip()
        lines.extend(["", f"📌 *Key Requirements from Call:*\n_{clean_req}_"])

    lines.extend([
        "",
        "💡 *Tip:* Join 2 minutes early with your camera and mic enabled.",
        "",
        "Reply to this WhatsApp message anytime if you have questions.",
        f"— Team *{b_name}*",
    ])

    full_message = "\n".join(lines)
    return await send_whatsapp_message(phone=customer_phone, text=full_message)
