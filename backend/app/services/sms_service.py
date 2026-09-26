"""
sms_service.py — SMS Gateway integration for VyaperiX.

Uses "SMS Gateway for Android" (sms-gate.app) via HTTP Basic Auth.
Provides automated meeting dispatch and notifications for sales reps and prospects.
"""

from datetime import date
import logging
import os
from typing import Any, Dict, Optional
from dotenv import load_dotenv
import httpx

load_dotenv()
logger = logging.getLogger("vyepari.sms")

# Module-level in-memory daily counter: date_string (YYYY-MM-DD) -> sent count
_daily_counter: Dict[str, int] = {}


def _format_meeting_message(
    prefix: str,
    lead_name: str,
    middle: str,
    meeting_link: str,
    max_len: int = 155,
) -> str:
    """
    Format message and ensure it does not exceed max_len (~155 characters).
    Truncates lead_name first, then meeting_link as a last resort, to fit.
    """
    base_msg = f"{prefix}{lead_name}{middle}{meeting_link}"
    if len(base_msg) <= max_len:
        return base_msg

    excess = len(base_msg) - max_len

    if len(lead_name) >= excess:
        truncated_name = lead_name[: len(lead_name) - excess]
        return f"{prefix}{truncated_name}{middle}{meeting_link}"

    # Truncate lead_name first, then meeting_link as a last resort
    remaining_excess = excess - len(lead_name)
    truncated_link = meeting_link[: max(0, len(meeting_link) - remaining_excess)]
    return f"{prefix}{middle}{truncated_link}"


def send_sms(phone_number: str, message: str) -> dict:
    """
    Send an SMS using SMS Gateway for Android via HTTP Basic Auth.

    - Reads SMSGATE_USER, SMSGATE_PASS, SMSGATE_URL, SMSGATE_SIM, and DAILY_LIMIT.
    - Checks in-memory daily limit (default 50). Returns {"status": "limit_reached"} if exceeded.
    - If SMSGATE_USER or SMSGATE_PASS is not configured, prints [MOCK SMS] and returns {"status": "mocked"}.
    - Dispatches HTTP POST with Basic Auth and payload to SMS Gateway.
    - Never raises: captures exceptions, logs errors, and returns {"status": "failed", "error": str(e)}.
    """
    try:
        today = date.today().isoformat()
        try:
            daily_limit = int(os.getenv("DAILY_LIMIT", "50"))
        except (ValueError, TypeError):
            daily_limit = 50

        current_count = _daily_counter.get(today, 0)
        if current_count >= daily_limit:
            logger.warning("Daily SMS limit reached")
            return {"status": "limit_reached"}

        user = os.getenv("SMSGATE_USER")
        password = os.getenv("SMSGATE_PASS")
        url = (os.getenv("SMSGATE_URL") or "").strip()
        sim_raw = os.getenv("SMSGATE_SIM", "1")

        if not user or not password:
            print(f"[MOCK SMS] {message}")
            _daily_counter[today] = current_count + 1
            return {"status": "mocked"}

        try:
            sim_number = int(sim_raw)
        except (ValueError, TypeError):
            sim_number = 1

        payload = {
            "textMessage": {"text": message},
            "phoneNumbers": [phone_number],
            "simNumber": sim_number,
        }

        target_url = f"{url}?skipPhoneValidation=true" if "?" not in url else f"{url}&skipPhoneValidation=true"

        resp = httpx.post(
            target_url,
            auth=(user, password),
            json=payload,
            timeout=5.0,
        )
        resp.raise_for_status()

        _daily_counter[today] = current_count + 1

        try:
            resp_data = resp.json()
        except Exception:
            resp_data = resp.text

        return {"status": "sent", "response": resp_data}

    except Exception as e:
        logger.error(f"Failed to send SMS to {phone_number}: {e}")
        return {"status": "failed", "error": str(e)}


def send_meeting_sms(
    rep_phone: Optional[str],
    prospect_phone: Optional[str],
    lead_name: str,
    meeting_time: str,
    meeting_link: str,
    send_to_prospect: bool = True,
    source: str = "manual",
    company_name: Optional[str] = None,
) -> dict:
    """
    Send meeting booking SMS to sales representative and optionally to the prospect.

    - Calls send_sms for rep_phone if provided.
    - If send_to_prospect is True and prospect_phone is truthy, calls send_sms for prospect_phone.
    - If either message exceeds ~155 characters, truncates lead_name first, then meeting_link as a last resort.
    - Calls each send inside its own try/except so one failure does not block the other.
    - Returns results dict.
    """
    results: Dict[str, Any] = {"rep": None, "prospect": None}
    comp = company_name or "VyaperiX"

    if source == "ai_call":
        prefix = f"[{comp}] Hot Lead Booked! "
        middle = f" agreed to a meeting at {meeting_time}. Link: "
    else:
        prefix = f"[{comp}] Booking Confirmed! "
        middle = f" - meeting at {meeting_time}. Link: "

    if rep_phone:
        rep_message = _format_meeting_message(
            prefix=prefix,
            lead_name=lead_name,
            middle=middle,
            meeting_link=meeting_link,
            max_len=155,
        )
        try:
            results["rep"] = send_sms(rep_phone, rep_message)
        except Exception as e:
            logger.error(f"Failed to dispatch rep meeting SMS to {rep_phone}: {e}")
            results["rep"] = {"status": "failed", "error": str(e)}

    if send_to_prospect and prospect_phone:
        prospect_message = _format_meeting_message(
            prefix="Hi ",
            lead_name=lead_name,
            middle=f", your meeting with {comp} is confirmed for {meeting_time}. Link: ",
            meeting_link=meeting_link,
            max_len=155,
        )
        try:
            results["prospect"] = send_sms(prospect_phone, prospect_message)
        except Exception as e:
            logger.error(f"Failed to dispatch prospect meeting SMS to {prospect_phone}: {e}")
            results["prospect"] = {"status": "failed", "error": str(e)}

    return results
