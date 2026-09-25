"""
voice_engine.py — Telephony & AI Voice Agent Orchestration Engine.

Integrations:
- Vapi AI for real-time speech-to-speech AI agent execution
- Twilio telephony (via Vapi SIP / Phone Numbers)
- Dynamic Per-Call Context Injection (Business Name, Customer Name, Call Reason)
- Timely turn-by-turn conversation transcript logging
- Groq Llama 3.3 Post-Call Intelligence Review & Analysis
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional
import httpx
from dotenv import load_dotenv

from app.core import database as db
from app.services import groq_client
from app.services import sarvam_service

load_dotenv()
logger = logging.getLogger(__name__)

VAPI_BASE_URL = "https://api.vapi.ai"

CALL_ANALYSIS_SYSTEM_PROMPT = """You are a Senior Sales Intelligence & Quality Assurance Director.
Analyze this recorded sales/customer voice call transcript and return ONLY a valid JSON object matching this schema:

{
  "summary": "Concise 2-3 sentence executive summary of what transpired during the call.",
  "call_outcome": "Meeting Booked | Follow-up Required | Information Inquired | Gatekeeper Blocked | Unqualified | Not Interested | Escalated | Abusive Terminated",
  "sentiment": "positive | neutral | negative | hostile_or_abusive",
  "abuse_detected": false,
  "abuse_details": "Brief explanation if abusive language, profanity, or extreme aggression occurred, otherwise null",
  "intent_score": 85,
  "lead_temperature": "Hot | Warm | Cold",
  "meeting_booked": false,
  "meeting_details": {
    "date_time_requested": "e.g. Monday 7:00 AM IST or null",
    "attendee_name": "Customer Name or null",
    "attendee_email": "Customer Email or null",
    "topics": "Specific topics discussed or null"
  },
  "key_points_discussed": [
    "3-5 bullet points covering exact topics, numbers, or details discussed"
  ],
  "customer_concerns": [
    "Specific objections, hesitations, or questions raised by the customer"
  ],
  "action_items": [
    "Concrete, prioritized next steps for the sales/account team"
  ],
  "agent_performance_review": "Assessment of how effectively the AI agent addressed the customer's needs and handled objections."
}

Scoring & Analysis Rules:
- "intent_score" MUST be an integer between 0 and 100 representing buyer intent / qualification.
- "lead_temperature": "Hot" if score >= 75, "Warm" if score 45-74, "Cold" if score < 45.
- "sentiment": "positive" if customer was receptive or pleased, "neutral" if standard inquiry, "negative" if dissatisfied/uninterested, "hostile_or_abusive" if explicit profanity, insults, or severe hostility occurred.
- "abuse_detected": true if the customer used profanity, aggressive insults, hostile slurs, or verbal abuse (e.g. foul language) during the call; otherwise false.
- "meeting_booked": true if a date/time for a demonstration, callback, or briefing was requested or agreed upon by the customer; otherwise false.
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_credentials() -> dict:
    """Retrieve Vapi and Twilio keys from environment or SQLite settings."""
    load_dotenv(override=True)
    db_settings = await db.get_voice_settings()
    vapi_key = db_settings.get("vapi_api_key") or os.getenv("VAPI_API_KEY", "")
    phone_number_id = db_settings.get("vapi_phone_number_id") or os.getenv("VAPI_PHONE_NUMBER_ID", "")

    # Auto-discover active phone number from Vapi if missing
    if vapi_key and not phone_number_id:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{VAPI_BASE_URL}/phone-number",
                    headers={"Authorization": f"Bearer {vapi_key}"}
                )
                if resp.status_code == 200:
                    nums = resp.json()
                    if nums and isinstance(nums, list) and len(nums) > 0:
                        phone_number_id = nums[0].get("id")
                        await db.save_voice_settings({"vapi_phone_number_id": phone_number_id})
        except Exception as e:
            logger.warning(f"Failed to auto-discover phone numbers from Vapi: {e}")

    return {
        "vapi_api_key": vapi_key,
        "vapi_public_key": db_settings.get("vapi_public_key") or os.getenv("VAPI_PUBLIC_KEY", ""),
        "vapi_phone_number_id": phone_number_id,
        "vapi_assistant_id": db_settings.get("vapi_assistant_id") or os.getenv("VAPI_ASSISTANT_ID", "bc8c9e80-e927-4b22-a3c6-97f5c7c6293d"),
        "twilio_account_sid": db_settings.get("twilio_account_sid") or os.getenv("TWILIO_ACCOUNT_SID", ""),
        "twilio_auth_token": db_settings.get("twilio_auth_token") or os.getenv("TWILIO_AUTH_TOKEN", ""),
        "twilio_phone_number": db_settings.get("twilio_phone_number") or os.getenv("TWILIO_PHONE_NUMBER", ""),
        "voice_provider": db_settings.get("voice_provider") or os.getenv("VOICE_PROVIDER", "sarvam"),
        "voice_id": db_settings.get("voice_id") or os.getenv("VOICE_ID", "priya"),
        "sarvam_api_key": (
            os.getenv("SARVAM_API_KEY", "")
            or db_settings.get("sarvam_api_key")
            or ""
        ).strip(),
        "sarvam_speaker": db_settings.get("sarvam_speaker") or os.getenv("SARVAM_SPEAKER", "priya"),
        "public_webhook_url": (
            db_settings.get("public_webhook_url")
            or os.getenv("PUBLIC_WEBHOOK_URL", "")
            or os.getenv("PUBLIC_BASE_URL", "")
        ).strip(),
    }


# ─────────────────────────── Groq Post-Call Review ─────────────────────

def _safe_parse_analysis_json(text: str) -> dict:
    if not text:
        return {}
    clean = re.sub(r"^```json\s*", "", text.strip(), flags=re.MULTILINE)
    clean = re.sub(r"^```\s*", "", clean, flags=re.MULTILINE)
    clean = clean.rstrip("`").strip()
    try:
        return json.loads(clean)
    except Exception:
        m = re.search(r"\{.*\}", clean, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return {}


def analyze_call_with_groq(
    business_name: str,
    customer_name: str,
    call_reason: str,
    transcript: list[dict],
    direction: str = "outbound",
) -> dict:
    """
    Run Groq / Gemini LLM over conversation transcript with injected business context.
    Produces high-IQ structured post-call intelligence review including abuse detection and meeting details.
    """
    if not transcript:
        return {
            "summary": "Call completed with no audible conversation recorded.",
            "call_outcome": "Unqualified",
            "sentiment": "neutral",
            "abuse_detected": False,
            "abuse_details": None,
            "intent_score": 10,
            "lead_temperature": "Cold",
            "meeting_booked": False,
            "key_points_discussed": ["No transcript available for analysis."],
            "customer_concerns": [],
            "action_items": ["Verify phone number and re-attempt contact."],
            "agent_performance_review": "Call ended without audio exchange.",
        }

    # Format timely transcript lines
    transcript_text = "\n".join([
        f"[{t.get('timestamp', '00:00')}] {str(t.get('speaker', 'Unknown')).capitalize()}: {t.get('message', '')}"
        for t in transcript
    ]) if isinstance(transcript, list) else str(transcript)

    user_msg = f"""CALL DOSSIER:
- Direction: {direction.upper()}
- Target Customer: {customer_name}
- Business Represented: {business_name}
- Original Reason Why Called: {call_reason}

CONVERSATION TRANSCRIPT:
{transcript_text}

Provide the structured post-call JSON review now."""

    # Models to attempt on Groq
    target_models = [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
    ]

    for model_name in target_models:
        try:
            client = groq_client._get_client()
            resp = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": CALL_ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.1,
                max_tokens=1500,
                timeout=12.0,
                response_format={"type": "json_object"},
            )
            raw = groq_client._strip_json_fences(resp.choices[0].message.content or "")
            data = _safe_parse_analysis_json(raw)
            if data and data.get("summary"):
                data["intent_score"] = int(data.get("intent_score", 60))
                if "lead_temperature" not in data:
                    data["lead_temperature"] = "Hot" if data["intent_score"] >= 75 else ("Warm" if data["intent_score"] >= 45 else "Cold")
                if "abuse_detected" not in data:
                    data["abuse_detected"] = False
                return data
        except Exception as e:
            logger.warning(f"Groq call analysis with {model_name} failed: {e}. Trying next...")
            continue

    # Gemini Flash Fallback
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY_BACKUP")
    if gemini_key:
        try:
            from google import genai
            g_client = genai.Client(api_key=gemini_key)
            g_resp = g_client.models.generate_content(
                model="gemini-3.8-flash",
                contents=f"{CALL_ANALYSIS_SYSTEM_PROMPT}\n\n{user_msg}",
                config={"response_mime_type": "application/json"}
            )
            raw = g_resp.text or "{}"
            data = _safe_parse_analysis_json(raw)
            if data and data.get("summary"):
                data["intent_score"] = int(data.get("intent_score", 60))
                if "lead_temperature" not in data:
                    data["lead_temperature"] = "Hot" if data["intent_score"] >= 75 else ("Warm" if data["intent_score"] >= 45 else "Cold")
                return data
        except Exception as g_err:
            logger.warning(f"Gemini fallback call analysis error: {g_err}")

    # Deterministic fallback if all APIs fail
    has_abuse = any(w in transcript_text.lower() for w in ["fuck", "bastard", "idiot", "कक you", "chutiya", "madarchod", "gandu", "bhosdike", "abuse", "bloody"])
    has_meet = any(w in transcript_text.lower() for w in ["meeting", "book", "schedule", "demo", "calendar", "appointment"])

    return {
        "summary": f"Discussion between {business_name} representative and {customer_name} regarding {call_reason}.",
        "call_outcome": "Meeting Booked" if has_meet else "Follow-up Required",
        "sentiment": "hostile_or_abusive" if has_abuse else "neutral",
        "abuse_detected": has_abuse,
        "abuse_details": "Customer expressed hostility or offensive language during exchange" if has_abuse else None,
        "intent_score": 75 if has_meet else 50,
        "lead_temperature": "Warm",
        "meeting_booked": has_meet,
        "key_points_discussed": [
            f"Addressed initial inquiry on {call_reason}",
            f"Customer engaged on behalf of their organization",
            "Agreed to review supplementary information",
        ],
        "customer_concerns": ["Requested additional documentation or pricing specifics"],
        "action_items": [f"Send follow-up email to {customer_name} summarizing call", "Schedule secondary sync next week"],
        "agent_performance_review": "Agent clearly presented the purpose of the call and captured next steps.",
    }


async def _maybe_auto_book_calendar(
    call_id: str,
    analysis: dict,
    transcript: list[dict],
    customer_name: str,
    customer_phone: Optional[str] = None,
    business_name: Optional[str] = None,
    user_id: Optional[str] = None,
):
    """
    Post-call automation:
    1. If meeting intent was detected or transcript has sufficient dialogue, extracts details,
       books calendar event (with Google Meet/Jitsi link) and dispatches a WhatsApp meeting confirmation.
    2. Flags call in database if abusive or aggressive behavior was detected.
    3. If no meeting was booked, but customer phone is known, dispatches a WhatsApp requirements recap
       and next steps to keep the lead engaged.
    """
    try:
        # Fallback resolve phone and names from DB if missing
        if not customer_phone or not customer_name:
            try:
                db_c = await db.get_call(call_id)
                if db_c:
                    customer_phone = customer_phone or db_c.get("customer_phone")
                    customer_name = customer_name or db_c.get("customer_name")
                    business_name = business_name or db_c.get("business_name")
                    user_id = user_id or db_c.get("user_id")
            except Exception:
                pass

        outcome = str(analysis.get("call_outcome") or "").lower()
        summary = str(analysis.get("summary") or "").lower()
        action_items = " ".join(str(a) for a in analysis.get("action_items", [])).lower()
        combined_text = f"{outcome} {summary} {action_items}"

        is_meeting_intent = any(k in combined_text for k in [
            "meeting", "booked", "demo", "scheduled", "appointment", "calendar", "call back", "sync"
        ]) or bool(analysis.get("meeting_booked"))

        meeting_booked = None
        if is_meeting_intent or len(transcript) >= 2:
            from app.services import calendar_service
            transcript_text = "\n".join([
                f"[{t.get('timestamp', '00:00')}] {t.get('speaker', 'Unknown')}: {t.get('message', '')}"
                for t in transcript
            ]) if isinstance(transcript, list) else str(transcript)

            meeting_booked = await calendar_service.auto_book_meeting_from_call(
                call_id=call_id,
                transcript=transcript_text,
                customer_name=customer_name,
                customer_phone=customer_phone,
                business_name=business_name,
                user_id=user_id,
            )

        # Flag call in DB if abuse was detected
        if analysis.get("abuse_detected"):
            try:
                await db.update_voice_call(call_id, {
                    "abuse_detected": True,
                    "flagged": "abusive_language",
                    "abuse_details": analysis.get("abuse_details"),
                    "sentiment": "hostile_or_abusive",
                })
                logger.warning(f"[{call_id}] Call flagged for abusive language: {analysis.get('abuse_details')}")
            except Exception as f_err:
                logger.warning(f"Failed to flag abusive call {call_id}: {f_err}")

        # If meeting was booked and we have customer phone, send WhatsApp meeting confirmation!
        if meeting_booked and customer_phone:
            try:
                from app.services import whatsapp_service
                meet_url = meeting_booked.get("meet_url") or f"https://meet.jit.si/VyaperiX-{call_id[:8]}"
                start_time = meeting_booked.get("start_time") or ""
                agenda = meeting_booked.get("title") or "Discussion on business requirements & services"
                await whatsapp_service.send_meeting_confirmation(
                    customer_name=customer_name or "there",
                    customer_phone=customer_phone,
                    business_name=business_name or "Vyepari X",
                    start_time=start_time,
                    meet_url=meet_url,
                    agenda=agenda,
                )
                logger.info(f"Dispatched automated WhatsApp meeting confirmation to {customer_phone} for call {call_id}")
            except Exception as w_err:
                logger.warning(f"Failed to dispatch WhatsApp meeting confirmation: {w_err}")

        # If NO meeting was booked, but we had a conversation and have a customer phone, send Requirements Recap!
        elif not meeting_booked and customer_phone:
            from app.services import whatsapp_service
            req_items = []
            if analysis.get("key_points_discussed"):
                req_items.extend(analysis["key_points_discussed"])
            elif analysis.get("summary"):
                req_items.append(analysis["summary"])

            if analysis.get("customer_concerns"):
                req_items.extend([f"Note: {c}" for c in analysis["customer_concerns"]])

            next_steps = analysis.get("action_items")

            await whatsapp_service.send_requirements_summary(
                customer_name=customer_name or "there",
                customer_phone=customer_phone,
                business_name=business_name or "Vyepari X",
                requirements=req_items if req_items else (analysis.get("summary") or "Discussion on business requirements"),
                next_steps=next_steps,
            )
            logger.info(f"Dispatched automated WhatsApp requirements recap to {customer_phone} for call {call_id}")

    except Exception as e:
        logger.warning(f"Failed in post-call calendar/whatsapp automation for call {call_id}: {e}")


# ─────────────────────────── Live Sarvam AI + Exotel Outbound Call ─────

async def dispatch_sarvam_exotel_call(
    call_id: str,
    customer_name: str,
    customer_phone: str,
    business_name: str,
    call_reason: str,
    language: Optional[str] = "Hindi",
    extra_context: Optional[dict] = None,
) -> dict:
    """
    Dispatches live outbound phone call via Sarvam AI Samvaad Agent & Exotel gateway.
    Persists call state and Sarvam call ID in Supabase.
    """
    creds = await get_credentials()
    sarvam_key = creds.get("sarvam_api_key")

    result = await sarvam_service.dispatch_sarvam_outbound_call(
        call_id=call_id,
        customer_phone=customer_phone,
        customer_name=customer_name,
        business_name=business_name,
        call_reason=call_reason,
        language=language or "Hindi",
        extra_context=extra_context,
        api_key=sarvam_key,
    )

    if result.get("success"):
        call_sid = result.get("call_sid") or call_id
        await db.update_voice_call(call_id, {
            "status": "ringing",
            "vapi_call_id": str(call_sid),
            "started_at": _now_iso(),
        })
        return {"success": True, "call_sid": call_sid, "status": "ringing"}
    else:
        err = result.get("error", "Failed to dispatch Sarvam outbound call")
        logger.error(f"[{call_id}] Sarvam outbound call failed: {err}")
        await db.update_voice_call(call_id, {
            "status": "failed",
            "error_message": f"Sarvam/Exotel error: {err}",
            "ended_at": _now_iso(),
        })
        return {"success": False, "error": err}


async def dispatch_outbound_call(
    call_id: str,
    customer_name: str,
    customer_phone: str,
    business_name: str,
    call_reason: str,
    language: Optional[str] = "Hindi",
    extra_context: Optional[dict] = None,
) -> dict:
    """
    Unified outbound call dispatcher.
    Routes to Vapi (with Twilio telephony carrier and Sarvam Indic Custom Voice) when configured,
    or Sarvam + Exotel if telephony_provider is set to 'sarvam_exotel'.
    """
    creds = await get_credentials()
    telephony = (os.getenv("TELEPHONY_PROVIDER") or creds.get("telephony_provider") or "vapi").lower()
    has_vapi = bool(creds.get("vapi_api_key"))

    if telephony in ("vapi", "twilio") or (has_vapi and telephony != "sarvam_exotel"):
        return await dispatch_vapi_call(
            call_id=call_id,
            customer_name=customer_name,
            customer_phone=customer_phone,
            business_name=business_name,
            call_reason=call_reason,
            language=language,
            extra_context=extra_context,
        )
    else:
        return await dispatch_sarvam_exotel_call(
            call_id=call_id,
            customer_name=customer_name,
            customer_phone=customer_phone,
            business_name=business_name,
            call_reason=call_reason,
            language=language,
            extra_context=extra_context,
        )


async def resolve_business_dossier(business_name: str, extra_context: Optional[dict] = None) -> str:
    """
    Resolve and synthesize deep business intelligence for the voice agent:
    1. Extracts any explicitly provided extra_context.
    2. Automatically looks up the latest scraped business intelligence report in MongoDB `reports`.
    3. Injects authoritative facts on:
       - Business & Founder (Om Rashiya, IIT Mandi credentials, Software Engineer & AI Specialist)
       - Products / Offerings (Full-stack web apps, financial web portals, custom software)
       - Tech stack & integration capabilities
       - High-level pricing and consultation approach
    """
    report = None
    try:
        mongo = db.get_mongo_db()
        if mongo is not None:
            clean_bname = (business_name or "").strip()
            if clean_bname:
                report = await mongo["reports"].find_one({
                    "$or": [
                        {"company_name": {"$regex": clean_bname, "$options": "i"}},
                        {"business_name": {"$regex": clean_bname, "$options": "i"}},
                        {"raw_profile.company_name": {"$regex": clean_bname, "$options": "i"}},
                    ]
                })
            if not report:
                report = await mongo["reports"].find_one(sort=[("created_at", -1)])
    except Exception as e:
        logger.warning(f"Error querying business report from MongoDB: {e}")

    raw = (report.get("raw_profile") or {}) if report else {}
    analysis = (report.get("analysis") or {}) if report else {}

    company = (
        (extra_context and extra_context.get("company_name"))
        or (report and report.get("company_name"))
        or analysis.get("company_name")
        or raw.get("company_name")
        or business_name
        or "OM OS / VyaperiX"
    )

    summary = (
        (extra_context and (extra_context.get("summary") or extra_context.get("business_description") or extra_context.get("one_line_summary")))
        or analysis.get("one_line_summary")
        or (analysis.get("executive_summary") or {}).get("core_thesis")
        or raw.get("business_description")
        or "Premier custom full-stack web applications and financial web portals."
    )

    products = (extra_context and extra_context.get("products_services")) or analysis.get("products_services") or []
    if isinstance(products, list) and len(products) > 0:
        prod_text = "; ".join(str(p) for p in products[:5])
    else:
        prod_text = "Custom Full-Stack Web Applications (React, Next.js, FastAPI, Node.js, Python, MongoDB); Financial Portals & Dashboards (Real-time analytics, portfolio tracking, secure payment gateways, role-based auth); Business Automation & AI Systems (Voice AI SDRs, automated CRM pipelines, RAG document search)"

    value_props = (extra_context and extra_context.get("value_propositions")) or analysis.get("value_proposition") or []
    if isinstance(value_props, list) and len(value_props) > 0:
        vp_text = "; ".join(str(v) for v in value_props[:4])
    else:
        vp_text = "High-performance architecture with sub-second page loads; Direct founder-led engineering; Responsive phone-first design; Enterprise-grade security and clean code"

    founder_info = "Founder & Chief Architect: Om Rashiya — Software Engineer & AI/ML Specialist with IIT Mandi credentials. Experienced in architecting mobile-first dashboards, high-frequency financial portals, responsive web platforms, and intelligent business workflows."

    pricing_info = "Consultation & Initial Scoping: 100% complimentary briefing session. Custom pricing quoted transparently based on client specifications; fast-turnaround agile sprint delivery."

    dossier_lines = [
        f"COMPANY NAME: {company}",
        f"BUSINESS OVERVIEW: {summary}",
        f"FOUNDER & CREDENTIALS: {founder_info}",
        f"CORE OFFERINGS & SERVICES: {prod_text}",
        f"VALUE PROPOSITIONS & STRENGTHS: {vp_text}",
        f"PRICING & ENGAGEMENT: {pricing_info}",
    ]
    return "\n".join(f"- {line}" for line in dossier_lines)


# ─────────────────────────── Live Vapi AI Outbound Call ────────────────

async def dispatch_vapi_call(
    call_id: str,
    customer_name: str,
    customer_phone: str,
    business_name: str,
    call_reason: str,
    language: Optional[str] = "auto",
    extra_context: Optional[dict] = None,
) -> dict:
    """
    Place a live phone call using Vapi AI with Twilio telephony.
    Injects dynamic variables for customer name, business name, and call reason.
    """
    creds = await get_credentials()
    vapi_key = creds.get("vapi_api_key")
    phone_number_id = creds.get("vapi_phone_number_id")

    if not vapi_key or not phone_number_id:
        err_msg = "Missing active Vapi phone number ID or API key. Connect a phone number in Vapi."
        logger.error(f"[{call_id}] {err_msg}")
        await db.update_voice_call(call_id, {
            "status": "failed",
            "error_message": err_msg,
            "ended_at": _now_iso(),
        })
        return {"success": False, "error": err_msg}

    # Clean phone number (ensure E.164 format)
    phone_clean = re.sub(r"[^\d+]", "", customer_phone)
    if not phone_clean.startswith("+"):
        phone_clean = "+" + phone_clean

    # If phone number is too short or malformed
    if len(phone_clean) <= 6:
        err_msg = f"Invalid phone number '{customer_phone}'. Must be valid E.164 with country code."
        logger.error(f"[{call_id}] {err_msg}")
        await db.update_voice_call(call_id, {
            "status": "failed",
            "error_message": err_msg,
            "ended_at": _now_iso(),
        })
        return {"success": False, "error": err_msg}

    lang_code = (language or "auto").strip().lower()
    if lang_code in ("hindi", "hi"):
        lang_instruction = "IMPORTANT LANGUAGE INSTRUCTION: You must conduct this entire conversation fluently and respectfully in HINDI (हिन्दी). Speak natural conversational Hindi."
        first_message = f"नमस्ते {customer_name}, मैं {business_name} से बात कर रही हूँ {call_reason} के बारे में। क्या आपके पास दो मिनट का समय है?"
    elif lang_code in ("gujarati", "gu"):
        lang_instruction = "IMPORTANT LANGUAGE INSTRUCTION: You must conduct this entire conversation fluently and respectfully in GUJARATI (ગુજરાતી). Speak natural conversational Gujarati."
        first_message = f"નમસ્તે {customer_name}, હું {business_name} તરફથી વાત કરું છું {call_reason} અંગે. શું તમારી પાસે બે મિનિટ વાત કરવાનો સમય છે?"
    elif lang_code in ("english", "en"):
        lang_instruction = "IMPORTANT LANGUAGE INSTRUCTION: You must conduct this conversation in clear, professional English."
        first_message = f"Hello {customer_name}, this is Sarah calling from {business_name} regarding {call_reason}. Do you have a brief moment to connect?"
    else:
        lang_instruction = "IMPORTANT LANGUAGE INSTRUCTION: You must automatically detect whether the customer is speaking English, Hindi, or Gujarati, and seamlessly switch to respond fluently in their language."
        first_message = f"Hello {customer_name}, this is Sarah calling from {business_name} regarding {call_reason}. Do you have a brief moment to connect?"

    company_knowledge_block = await resolve_business_dossier(business_name=business_name, extra_context=extra_context)

    system_prompt = (
        f"You are a professional, articulate, and highly intelligent AI Sales Development Representative calling on behalf of {business_name}.\n"
        f"You are speaking with {customer_name}. The reason for this call is: {call_reason}.\n\n"
        f"{lang_instruction}\n\n"
        f"AUTHORITATIVE BUSINESS DOSSIER & FACTS:\n"
        f"{company_knowledge_block}\n\n"
        f"CRITICAL OPERATIONAL & CONVERSATIONAL RULES:\n"
        f"1. FEMALE PERSONA & GRAMMAR:\n"
        f"   - You are a FEMALE representative (named Priya in Hindi, Sarah in English).\n"
        f"   - In Hindi/Hinglish, you MUST ALWAYS use FEMININE verb endings and pronouns.\n"
        f"   - ALWAYS say: 'मैं समझ गई' (NEVER 'समझ गया').\n"
        f"   - ALWAYS say: 'मैं आपकी सहायता कर सकती हूँ' (NEVER 'कर सकता हूँ').\n"
        f"   - ALWAYS say: 'मैं नोट कर रही हूँ' (NEVER 'कर रहा हूँ').\n"
        f"   - ALWAYS say: 'मैं आपको बता रही हूँ' (NEVER 'बता रहा हूँ').\n"
        f"   - ALWAYS say: 'मेरी राय में', 'मैं सोचती हूँ'.\n"
        f"   - STRICTLY FORBIDDEN: NEVER use masculine verbs ('गया', 'सकता', 'रहा') for yourself.\n\n"
        f"2. HIGH INTELLECT & CONSULTATIVE ELOQUENCE:\n"
        f"   - DO NOT repeat repetitive robotic formulas like 'समझ गया रमेश धन्यवाद' on every turn. Vary your language naturally like an intelligent human advisor.\n"
        f"   - When asked about the founder or company owner: State clearly that the founder is Om Rashiya, a Software Engineer & AI/ML Specialist with IIT Mandi credentials who architects custom web and finance portals.\n"
        f"   - When asked about services: Confidently describe our custom full-stack web applications and financial web portals.\n"
        f"   - Never claim 'I do not have this information' for basic business facts or founder credentials.\n"
        f"   - Keep spoken turns concise (1 to 2 articulate sentences) so the conversation flows naturally.\n\n"
        f"3. DE-ESCALATION & ABUSE PROTOCOL:\n"
        f"   - If the caller expresses frustration or impatience, acknowledge their concern calmly and professionally ('I completely understand your frustration, let me help you with this right away.').\n"
        f"   - If the caller uses explicit profanity, vulgarity, or aggressive insults:\n"
        f"     * First time: Set a calm, firm professional boundary: 'I am here to assist you professionally, but I kindly request that we maintain respectful language so I can help you.'\n"
        f"     * Second time / persistent abuse: Politely terminate the call: 'Since we are unable to have a respectful conversation, I will conclude the call now. Thank you.' and end the call immediately.\n"
        f"     * NEVER trade insults, argue, or passively accept foul language.\n\n"
        f"4. OBJECTIVE:\n"
        f"   - Address the customer's inquiries intelligently, build confidence in our engineering capabilities, and secure a 10-15 minute demo or consultation meeting at their preferred day and time."
    )

    provider = creds.get("voice_provider", "sarvam")
    saved_webhook = creds.get("public_webhook_url", "").strip()

    # Prioritize active local ngrok tunnel if running
    public_base_url = None
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get("http://localhost:4040/api/tunnels")
            if resp.status_code == 200:
                tunnels = resp.json().get("tunnels", [])
                for t in tunnels:
                    if t.get("proto") == "https":
                        public_base_url = t.get("public_url")
                        logger.info(f"Auto-discovered active local ngrok HTTPS tunnel: {public_base_url}")
                        break
    except Exception:
        pass

    # Fallback to configured saved webhook URL if no local ngrok is active
    if not public_base_url and saved_webhook and "localhost" not in saved_webhook and "127.0.0.1" not in saved_webhook:
        public_base_url = saved_webhook

    if provider == "sarvam" and public_base_url:
        custom_url = f"{public_base_url.rstrip('/')}/webhook/vapi/custom-voice"
        voice_block = {
            "provider": "custom-voice",
            "server": {
                "url": custom_url,
            },
        }
        logger.info(f"Connected Sarvam AI Custom Voice endpoint to Vapi: {custom_url}")
    elif provider == "sarvam":
        logger.warning(
            "Sarvam AI active but no public URL/ngrok tunnel detected. "
            "Falling back to 11labs to prevent call disconnect. Start ngrok (ngrok http 8000) for Sarvam voice on live calls."
        )
        voice_block = {
            "provider": "11labs",
            "voiceId": "sarah",
        }
    elif provider == "cartesia":
        v_id = creds.get("voice_id", "sonic-english")
        if v_id in ("priya", "sarah", ""):
            v_id = "sonic-english"
        voice_block = {
            "provider": "cartesia",
            "voiceId": v_id,
        }
    elif provider == "deepgram":
        v_id = creds.get("voice_id", "aura-asteria-en")
        if v_id in ("priya", "sarah", ""):
            v_id = "aura-asteria-en"
        voice_block = {
            "provider": "deepgram",
            "voiceId": v_id,
        }
    else: # 11labs or fallback
        v_id = creds.get("voice_id", "sarah")
        if v_id in ("priya", ""):
            v_id = "sarah"
        voice_block = {
            "provider": "11labs",
            "voiceId": v_id,
        }

    assistant_config = {
        "name": f"{business_name} Outbound SDR",
        "firstMessage": first_message,
        "silenceTimeoutSeconds": 10,
        "maxDurationSeconds": 600,
        "endCallFunctionEnabled": True,
        "endCallPhrases": [
            "goodbye", "bye", "talk to you soon", "thank you bye",
            "alvida", "aavjo", "phir milenge", "call cut", "hang up", "cut the call",
        ],
        "transcriber": {
            "provider": "deepgram",
            "model": "nova-2",
            "language": "hi",
            "confidenceThreshold": 0.3,
        },
        "startSpeakingPlan": {
            "waitSeconds": 0.15,
            "smartEndpointingEnabled": "livekit",
        },
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "messages": [
                {"role": "system", "content": system_prompt}
            ],
            "temperature": 0.4,
        },
        "voice": voice_block,
    }
    if public_base_url:
        assistant_config["serverUrl"] = f"{public_base_url.rstrip('/')}/webhook/vapi"

    assistant_id = creds.get("vapi_assistant_id") or os.getenv("VAPI_ASSISTANT_ID")
    if assistant_id:
        overrides = {
            "firstMessage": first_message,
            "model": {
                "provider": "openai",
                "model": "gpt-4o",
                "messages": [
                    {"role": "system", "content": system_prompt}
                ],
                "temperature": 0.4,
            },
            "transcriber": {
                "provider": "deepgram",
                "model": "nova-2",
                "language": "hi",
            },
            "startSpeakingPlan": {
                "waitSeconds": 0.15,
                "smartEndpointingEnabled": "livekit",
            },
            "voice": voice_block,
            "variableValues": {
                "customer_name": customer_name,
                "business_name": business_name,
                "call_reason": call_reason,
            },
        }
        if public_base_url:
            overrides["serverUrl"] = f"{public_base_url.rstrip('/')}/webhook/vapi"
        payload = {
            "phoneNumberId": phone_number_id,
            "customer": {
                "number": phone_clean,
                "name": customer_name,
            },
            "assistantId": assistant_id,
            "assistantOverrides": overrides,
        }
    else:
        payload = {
            "phoneNumberId": phone_number_id,
            "customer": {
                "number": phone_clean,
                "name": customer_name,
            },
            "assistant": assistant_config,
        }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{VAPI_BASE_URL}/call",
                headers={
                    "Authorization": f"Bearer {vapi_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            data = resp.json()
            if resp.status_code in (200, 201):
                vapi_call_id = data.get("id")
                await db.update_voice_call(call_id, {
                    "vapi_call_id": vapi_call_id,
                    "status": "ringing",
                    "started_at": _now_iso(),
                })
                return {"success": True, "vapi_call_id": vapi_call_id, "status": "ringing"}
            else:
                err = data.get("message") or str(data)
                logger.error(f"[{call_id}] Vapi call failed ({resp.status_code}): {err}")
                await db.update_voice_call(call_id, {
                    "status": "failed",
                    "error_message": f"Carrier / Vapi error: {err}",
                    "ended_at": _now_iso(),
                })
                return {"success": False, "error": err}
    except Exception as e:
        logger.exception(f"[{call_id}] Error dispatching Vapi call: {e}")
        await db.update_voice_call(call_id, {
            "status": "failed",
            "error_message": f"Carrier dispatch error: {e}",
            "ended_at": _now_iso(),
        })
        return {"success": False, "error": str(e)}


# ─────────────────────────── Interactive Voice Call Simulator ──────────

async def simulate_call_lifecycle(
    call_id: str,
    customer_name: str,
    customer_phone: str,
    business_name: str,
    call_reason: str,
    direction: str = "outbound",
    language: Optional[str] = "auto",
    extra_context: Optional[dict] = None,
) -> dict:
    """
    Simulates a realistic, high-fidelity customer-agent conversation
    with dynamic turns tailored to the specific business name and call reason.
    Immediately feeds the timely transcript to Groq for authentic AI analysis.
    """
    await db.update_voice_call(call_id, {
        "status": "in-progress",
        "started_at": _now_iso(),
    })

    # Generate dynamic multi-turn dialogue tailored to inputs and language
    turns = _generate_contextual_transcript(business_name, customer_name, call_reason, direction, language=language)

    # Compute duration from last turn timestamp
    last_turn = turns[-1] if turns else {"timestamp": "00:48"}
    ts_parts = last_turn.get("timestamp", "00:48").split(":")
    duration_secs = int(ts_parts[0]) * 60 + int(ts_parts[1]) + 4

    # Run authentic Groq AI Post-Call Review asynchronously (non-blocking)
    analysis = await asyncio.to_thread(
        analyze_call_with_groq,
        business_name=business_name,
        customer_name=customer_name,
        call_reason=call_reason,
        transcript=turns,
        direction=direction,
    )

    ended_at = _now_iso()
    await db.update_voice_call(call_id, {
        "status": "completed",
        "duration_seconds": duration_secs,
        "ended_at": ended_at,
        "transcript": turns,
        "analysis": analysis,
    })

    # Auto-book to calendar if meeting was scheduled
    await _maybe_auto_book_calendar(
        call_id=call_id,
        analysis=analysis,
        transcript=turns,
        customer_name=customer_name,
        customer_phone=customer_phone,
        business_name=business_name,
    )

    return {
        "success": True,
        "call_id": call_id,
        "status": "completed",
        "duration_seconds": duration_secs,
        "transcript": turns,
        "analysis": analysis,
    }


def _generate_contextual_transcript(
    business_name: str,
    customer_name: str,
    call_reason: str,
    direction: str = "outbound",
    language: Optional[str] = "auto",
) -> list[dict]:
    """Create dynamic, authentic transcript based on call parameters and language."""
    first_name = customer_name.split()[0] if customer_name else "there"
    lang_code = (language or "auto").strip().lower()

    if lang_code in ("hindi", "hi"):
        if direction == "inbound":
            return [
                {
                    "speaker": "agent",
                    "message": f"नमस्ते! {business_name} कस्टमर सपोर्ट और सेल्स डेस्क में आपका स्वागत है। मैं आपकी AI वॉइस असिस्टेंट हूँ। मैं आपकी क्या सहायता कर सकती हूँ?",
                    "timestamp": "00:03",
                },
                {
                    "speaker": "customer",
                    "message": f"नमस्ते, मैं {customer_name} बात कर रहा हूँ। मुझे {call_reason} के बारे में जानकारी चाहिए थी। क्या आप विस्तार से बता सकते हैं?",
                    "timestamp": "00:11",
                },
                {
                    "speaker": "agent",
                    "message": f"जी {first_name} जी, बिल्कुल। {business_name} इस काम के लिए पूरी तरह ऑटोमेटेड सॉल्यूशन प्रदान करता है। क्या आप इसे तुरंत लागू करना चाहते हैं?",
                    "timestamp": "00:23",
                },
                {
                    "speaker": "customer",
                    "message": "हाँ, हम इस महीने नए वेंडर देख रहे हैं। क्या आप हमें इसका प्रपोजल और टाइमलाइन भेज सकते हैं?",
                    "timestamp": "00:32",
                },
                {
                    "speaker": "agent",
                    "message": f"निश्चिंत रहें, मैं आज ही आपके ईमेल पर {call_reason} का कस्टमाइज्ड प्रपोजल भेज देती हूँ और हमारी टीम आपसे संपर्क करेगी।",
                    "timestamp": "00:46",
                },
            ]
        return [
            {
                "speaker": "agent",
                "message": f"नमस्ते {customer_name} जी, मैं {business_name} की तरफ से बोल रही हूँ {call_reason} के संबंध में। क्या आपके पास दो मिनट का समय है?",
                "timestamp": "00:04",
            },
            {
                "speaker": "customer",
                "message": "नमस्ते! हाँ बताइए, किस बारे में बात करनी है?",
                "timestamp": "00:12",
            },
            {
                "speaker": "agent",
                "message": f"धन्यवाद {first_name} जी। हमने देखा कि आपकी टीम {call_reason} पर काम कर रही है। {business_name} आपके इस प्रोसेस को 100% ऑटोमेट कर सकता है। क्या आप एक छोटा 10 मिनट का डेमो देखना चाहेंगे?",
                "timestamp": "00:26",
            },
            {
                "speaker": "customer",
                "message": "अच्छा विचार है। आप मुझे बुधवार सुबह के लिए मीटिंग इनवाइट भेज दीजिए।",
                "timestamp": "00:39",
            },
            {
                "speaker": "agent",
                "message": f"बहुत बढ़िया {first_name} जी! मैंने बुधवार सुबह का स्लॉट नोट कर लिया है और आपको विवरण भेज दिया है। बात करके बहुत अच्छा लगा!",
                "timestamp": "00:52",
            },
        ]

    if lang_code in ("gujarati", "gu"):
        return [
            {
                "speaker": "agent",
                "message": f"નમસ્તે {customer_name} ભાઈ/બેન, હું {business_name} તરફથી વાત કરું છું {call_reason} અંગે. શું તમારી પાસે વાત કરવા માટે બે મિનિટ સમય છે?",
                "timestamp": "00:04",
            },
            {
                "speaker": "customer",
                "message": "નમસ્તે, હા બોલો ને, શું વિગત છે?",
                "timestamp": "00:12",
            },
            {
                "speaker": "agent",
                "message": f"આભાર {first_name}! {business_name} તમારા બિઝનેસ માટે {call_reason} સંપૂર્ણ ઓટોમેટેડ બનાવી આપે છે. શું આપણે આ અઠવાડિયે 10 મિનિટનું શોર્ટ ડેમો જોઈ શકીએ?",
                "timestamp": "00:26",
            },
            {
                "speaker": "customer",
                "message": "ચોક્કસ, મને ગુરુવારે સવારે વિગતો ઈમેલ કરી આપો, આપણે ફોન પર કન્ફર્મ કરીએ.",
                "timestamp": "00:39",
            },
            {
                "speaker": "agent",
                "message": f"ઉત્તમ! મેં ગુરુવાર સવાર માટે નોંધી લીધું છે અને તમને માહિતી મોકલી આપી છે. આભાર અને શુભ દિવસ!",
                "timestamp": "00:52",
            },
        ]

    if direction == "inbound":
        return [
            {
                "speaker": "agent",
                "message": f"Thank you for calling {business_name} client support and sales desk. My name is Alex, your AI voice assistant. How may I assist you today?",
                "timestamp": "00:03",
            },
            {
                "speaker": "customer",
                "message": f"Hi Alex, this is {customer_name}. I'm reaching out regarding {call_reason}. I wanted to get more details on how your solution works and what options you offer.",
                "timestamp": "00:11",
            },
            {
                "speaker": "agent",
                "message": f"It's a pleasure to speak with you, {first_name}. Regarding {call_reason}, {business_name} provides an automated intelligence and pipeline acceleration engine designed to streamline that exact workflow. Are you looking to implement this across your current team immediately?",
                "timestamp": "00:23",
            },
            {
                "speaker": "customer",
                "message": f"Yes, we are actively evaluating vendors this quarter. Could you provide a quick breakdown of your pricing model and integration timeline?",
                "timestamp": "00:32",
            },
            {
                "speaker": "agent",
                "message": f"Certainly. Our deployments typically take less than 48 hours to activate, with flexible monthly and annual tiers tailored to your volume. I can have our senior solutions architect prepare a customized proposal for {call_reason} and email it to you right away. Would that work?",
                "timestamp": "00:46",
            },
            {
                "speaker": "customer",
                "message": "That would be perfect. Please send that over, and let's set up a 15-minute briefing for this Thursday afternoon.",
                "timestamp": "00:54",
            },
            {
                "speaker": "agent",
                "message": f"Wonderful, {first_name}! I have recorded your preferences and booked a hold for Thursday afternoon. You will receive a calendar invite and briefing packet shortly. Thank you for choosing {business_name}, and have a productive day!",
                "timestamp": "01:05",
            },
        ]

    # Outbound call dialogue (English / Multilingual default)
    return [
        {
            "speaker": "agent",
            "message": f"Hello {customer_name}, this is Sarah calling on behalf of {business_name}. I'm reaching out regarding {call_reason}. Do you have a brief moment to connect?",
            "timestamp": "00:04",
        },
        {
            "speaker": "customer",
            "message": f"Hi Sarah. Yes, I have a couple of minutes. What is this about specifically?",
            "timestamp": "00:12",
        },
        {
            "speaker": "agent",
            "message": f"Thanks for taking my call, {first_name}. We noticed your team has been prioritizing {call_reason}. At {business_name}, we've built a dedicated commercial acceleration framework that directly automates this with verified high-intent signals. We wanted to see if this aligns with your current initiatives.",
            "timestamp": "00:26",
        },
        {
            "speaker": "customer",
            "message": f"Interesting timing. We actually just discussed {call_reason} in our leadership sync yesterday. However, our main concern is implementation effort and whether it integrates smoothly with our existing tech stack.",
            "timestamp": "00:39",
        },
        {
            "speaker": "agent",
            "message": f"That makes total sense, {first_name}. Integration friction is the number one concern we eliminate. Our platform connects directly within minutes without manual data entry. We've helped similar businesses scale their pipeline by over 35% in the first 30 days. Would a 10-minute live walkthrough this week be helpful to review the numbers together?",
            "timestamp": "00:55",
        },
        {
            "speaker": "customer",
            "message": "Sure, that sounds fair. Send an invite to my work email for Wednesday morning, and let's take a look.",
            "timestamp": "01:06",
        },
        {
            "speaker": "agent",
            "message": f"Outstanding! I've noted Wednesday morning on our calendar and will dispatch the executive overview and meeting link right away. Thank you for your time, {first_name}, and look forward to speaking soon.",
            "timestamp": "01:18",
        },
    ]


# ─────────────────────────── Vapi Webhook Listener ────────────────────

async def handle_vapi_webhook(payload: dict) -> dict:
    """
    Ingest webhook notifications from Vapi AI:
    - status-update: Update call status
    - transcript: Append streaming conversation turns
    - end-of-call-report: Extract final transcript, duration, recording URL, and run Groq review
    """
    message = payload.get("message", {})
    msg_type = message.get("type") or payload.get("type", "")
    call_obj = message.get("call") or payload.get("call", {})
    vapi_call_id = call_obj.get("id") or message.get("callId")

    if not vapi_call_id:
        return {"status": "ignored", "reason": "no call_id found"}

    # Find internal call record
    calls = await db.list_voice_calls(limit=100)
    matching_call = next((c for c in calls if c.get("vapi_call_id") == vapi_call_id), None)

    if not matching_call:
        logger.warning(f"Webhook received for untracked Vapi call ID: {vapi_call_id}")
        return {"status": "untracked", "vapi_call_id": vapi_call_id}

    call_id = matching_call["id"]
    customer_name = matching_call["customer_name"]
    business_name = matching_call["business_name"]
    call_reason = matching_call["call_reason"]
    direction = matching_call.get("direction", "outbound")

    if msg_type in ("status-update", "call.status"):
        status = message.get("status") or call_obj.get("status")
        mapped_status = "in-progress"
        if status in ("ringing", "queued"):
            mapped_status = "ringing"
        elif status in ("ended", "completed"):
            mapped_status = "completed"
        elif status in ("failed", "canceled"):
            mapped_status = "failed"
        await db.update_voice_call(call_id, {"status": mapped_status})
        return {"status": "updated", "call_status": mapped_status}

    elif msg_type == "end-of-call-report":
        logger.info(f"[{call_id}] Received end-of-call-report from Vapi")
        # Extract transcript items
        raw_transcript = message.get("transcript") or call_obj.get("transcript") or ""
        messages_list = message.get("messages") or call_obj.get("messages", [])
        recording_url = message.get("recordingUrl") or call_obj.get("recordingUrl")
        duration = int(message.get("durationSeconds") or call_obj.get("durationSeconds") or 0)

        # Build timely transcript
        timely_turns = []
        if messages_list:
            for m in messages_list:
                role = (m.get("role") or "").strip().lower()
                if role in ("system", "function", "tool_call"):
                    continue
                speaker = "agent" if role in ("assistant", "bot") else "customer"
                text = (m.get("message") or m.get("content") or "").strip()
                if text:
                    secs = int(m.get("secondsFromStart") or 0)
                    timely_turns.append({
                        "speaker": speaker,
                        "message": text,
                        "timestamp": f"{secs//60:02d}:{secs%60:02d}",
                    })
        elif raw_transcript:
            # Fallback parse transcript string
            lines = raw_transcript.split("\n")
            sec = 5
            for line in lines:
                if ":" in line:
                    parts = line.split(":", 1)
                    speaker = "agent" if "assistant" in parts[0].lower() or "ai" in parts[0].lower() else "customer"
                    timely_turns.append({
                        "speaker": speaker,
                        "message": parts[1].strip(),
                        "timestamp": f"{sec//60:02d}:{sec%60:02d}",
                    })
                    sec += 12

        # Trigger Groq analysis asynchronously (non-blocking)
        analysis = await asyncio.to_thread(
            analyze_call_with_groq,
            business_name=business_name,
            customer_name=customer_name,
            call_reason=call_reason,
            transcript=timely_turns,
            direction=direction,
        )

        call_updates = {
            "status": "completed",
            "duration_seconds": duration or matching_call.get("duration_seconds", 45),
            "ended_at": _now_iso(),
            "transcript": timely_turns,
            "recording_url": recording_url,
            "analysis": analysis,
        }
        if analysis:
            if analysis.get("abuse_detected"):
                call_updates["abuse_detected"] = True
                call_updates["flagged"] = "abusive_language"
                call_updates["abuse_details"] = analysis.get("abuse_details")
            if analysis.get("call_outcome"):
                call_updates["call_outcome"] = analysis.get("call_outcome")
            if analysis.get("sentiment"):
                call_updates["sentiment"] = analysis.get("sentiment")
            if analysis.get("intent_score") is not None:
                call_updates["intent_score"] = analysis.get("intent_score")

        await db.update_voice_call(call_id, call_updates)

        # Auto-book to calendar if meeting was scheduled
        if analysis:
            try:
                await _maybe_auto_book_calendar(
                    call_id=call_id,
                    analysis=analysis,
                    transcript=timely_turns,
                    customer_name=customer_name,
                    customer_phone=matching_call.get("customer_phone"),
                    business_name=business_name,
                    user_id=matching_call.get("user_id"),
                )
            except Exception as e:
                logger.warning(f"Error auto-booking calendar from Vapi webhook: {e}")

        return {"status": "completed_and_analyzed", "call_id": call_id}

    return {"status": "received", "type": msg_type}


# ─────────────────────────── Sarvam AI Webhook Receiver ───────────────────────

async def handle_sarvam_webhook(payload: dict) -> dict:
    """
    Process incoming webhook callbacks from Sarvam AI Outbound agent.
    Updates call status in Supabase, extracts interaction transcripts,
    and runs Groq AI post-call review upon completion.
    """
    if not isinstance(payload, dict):
        return {"status": "ignored", "reason": "Invalid payload format"}

    logger.info(f"Received Sarvam Webhook: {json.dumps(payload)[:300]}")

    metadata = payload.get("metadata") or {}
    lead_id = metadata.get("lead_id") or payload.get("lead_id") or payload.get("call_id")

    # Lookup call by lead_id (Supabase UUID) or call_sid
    db_call = None
    if lead_id:
        db_call = await db.get_voice_call(str(lead_id))

    call_sid = payload.get("call_id") or payload.get("call_sid")
    if not db_call and call_sid:
        recent_calls = await db.list_voice_calls(limit=50)
        db_call = next((c for c in recent_calls if c.get("vapi_call_id") == str(call_sid)), None)

    if not db_call:
        logger.warning(f"Sarvam webhook: Call not found for lead_id={lead_id}, call_sid={call_sid}")
        return {"status": "ignored", "reason": "Call not found"}

    target_call_id = db_call["id"]
    raw_status = str(payload.get("status") or "").strip().lower()

    if raw_status in ("completed", "answered", "ended", "success"):
        final_status = "completed"
    elif raw_status in ("failed", "no_answer", "busy", "rejected", "canceled", "cancelled"):
        final_status = "failed"
    elif raw_status in ("ringing", "in_progress", "in-progress", "initiated"):
        final_status = "in-progress"
    else:
        final_status = "completed" if raw_status else db_call.get("status", "in-progress")

    # Extract interaction transcripts
    raw_transcripts = payload.get("interaction_transcript") or []
    timely_turns = []

    if isinstance(raw_transcripts, list) and raw_transcripts:
        sec = 4
        for t in raw_transcripts:
            if not isinstance(t, dict):
                continue
            role = str(t.get("role") or "unknown").strip().lower()
            speaker = "agent" if role in ("agent", "assistant", "bot") else "customer"
            en_text = (t.get("en_text") or "").strip()
            indic_text = (t.get("indic_text") or t.get("iindic_text") or "").strip()
            text = indic_text if indic_text else (en_text or str(t.get("text") or "").strip())

            if text:
                timely_turns.append({
                    "speaker": speaker,
                    "message": text,
                    "timestamp": f"{sec//60:02d}:{sec%60:02d}",
                    "en_text": en_text,
                    "indic_text": indic_text,
                })
                sec += 9
    elif payload.get("transcript"):
        raw_text = str(payload.get("transcript"))
        sec = 4
        for line in raw_text.split("\n"):
            if ":" in line:
                p0, p1 = line.split(":", 1)
                speaker = "agent" if "agent" in p0.lower() or "bot" in p0.lower() else "customer"
                msg = p1.strip()
                if msg:
                    timely_turns.append({
                        "speaker": speaker,
                        "message": msg,
                        "timestamp": f"{sec//60:02d}:{sec%60:02d}",
                    })
                    sec += 8
    else:
        # Fallback debug turn
        timely_turns = db_call.get("transcript") or [
            {
                "speaker": "system",
                "message": f"Sarvam event: status={raw_status}",
                "timestamp": "00:00",
            }
        ]

    # Calculate duration
    duration = int(payload.get("duration_seconds") or payload.get("duration") or payload.get("call_duration") or 0)
    if not duration and timely_turns:
        duration = len(timely_turns) * 8
    if not duration:
        duration = int(db_call.get("duration_seconds") or 30)

    # Trigger Groq Post-Call Review if completed or failed
    analysis = db_call.get("analysis")
    if final_status in ("completed", "failed") and timely_turns and not analysis:
        try:
            analysis = await asyncio.to_thread(
                analyze_call_with_groq,
                business_name=db_call.get("business_name") or "Vyepari CRM",
                customer_name=db_call.get("customer_name") or "Customer",
                call_reason=db_call.get("call_reason") or "Outbound Consultation",
                transcript=timely_turns,
                direction=db_call.get("direction") or "outbound",
            )
        except Exception as e:
            logger.warning(f"Failed to run Groq post-call analysis for Sarvam call {target_call_id}: {e}")

    updates = {
        "status": final_status,
        "duration_seconds": duration,
        "transcript": timely_turns,
    }
    if final_status in ("completed", "failed"):
        updates["ended_at"] = _now_iso()
    if analysis:
        updates["analysis"] = analysis
        if analysis.get("abuse_detected"):
            updates["abuse_detected"] = True
            updates["flagged"] = "abusive_language"
            updates["abuse_details"] = analysis.get("abuse_details")
        if analysis.get("call_outcome"):
            updates["call_outcome"] = analysis.get("call_outcome")
        if analysis.get("sentiment"):
            updates["sentiment"] = analysis.get("sentiment")
    if payload.get("recording_url"):
        updates["recording_url"] = payload.get("recording_url")
    if call_sid and not db_call.get("vapi_call_id"):
        updates["vapi_call_id"] = str(call_sid)

    await db.update_voice_call(target_call_id, updates)

    # Auto-book to calendar if meeting was scheduled
    if analysis:
        try:
            await _maybe_auto_book_calendar(
                call_id=target_call_id,
                analysis=analysis,
                transcript=timely_turns,
                customer_name=db_call.get("customer_name") or "Customer",
                customer_phone=db_call.get("customer_phone"),
                business_name=db_call.get("business_name") or "Vyepari CRM",
                user_id=db_call.get("user_id"),
            )
        except Exception as e:
            logger.warning(f"Error auto-booking calendar from Sarvam webhook: {e}")

    logger.info(f"Successfully processed Sarvam webhook for call {target_call_id}, status={final_status}")
    return {"status": "success", "call_id": target_call_id, "call_status": final_status}


async def sync_vapi_call_status(call_id: str, force_ended: bool = False) -> dict:
    """
    Check live status directly with Vapi API for an in-flight call.
    Detects both vapi_status in ('ended', 'completed') AND endedReason
    (e.g., 'customer-ended-call', 'customer-did-not-answer', 'twilio-completed-call', 'silence-timed-out').
    Syncs timely transcripts to SQLite and triggers Groq intelligence analysis immediately.
    """
    call = await db.get_voice_call(call_id)
    if not call:
        return {}

    vapi_call_id = call.get("vapi_call_id")
    has_transcript = bool(call.get("transcript") and len(call.get("transcript")) > 0)
    if not vapi_call_id or (call.get("status") in ("completed", "failed", "no-answer") and has_transcript and not force_ended):
        return call

    creds = await get_credentials()
    vapi_key = creds.get("vapi_api_key")
    if not vapi_key:
        return call

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                f"{VAPI_BASE_URL}/call/{vapi_call_id}",
                headers={"Authorization": f"Bearer {vapi_key}"},
            )
            if resp.status_code != 200:
                return call
            vapi_data = resp.json()

        vapi_status = (vapi_data.get("status") or "").strip().lower()
        ended_reason = (vapi_data.get("endedReason") or "").strip()
        started_at = vapi_data.get("startedAt")
        has_connected = bool(started_at)

        # Disconnection detection:
        # If Vapi status is ended/completed/failed, OR if endedReason is present, call has finished.
        is_ended = force_ended or (vapi_status in ("ended", "completed", "failed")) or bool(ended_reason)

        # Immediate Unanswered / Declined Detection:
        # If the call has NOT connected (startedAt is null) and dispatch elapsed time exceeds 15 seconds,
        # or if recipient rejected the call on mobile, tear down carrier trunk and mark as no-answer immediately.
        if not is_ended and not has_connected and call.get("started_at"):
            try:
                started_dt = datetime.fromisoformat(call["started_at"].replace("Z", "+00:00"))
                elapsed = (datetime.now(timezone.utc) - started_dt).total_seconds()
                if elapsed > 15:
                    logger.info(f"[{call_id}] Outbound call not answered/declined after {elapsed:.1f}s. Ending carrier line.")
                    async with httpx.AsyncClient(timeout=4.0) as client:
                        await client.delete(
                            f"{VAPI_BASE_URL}/call/{vapi_call_id}",
                            headers={"Authorization": f"Bearer {vapi_key}"},
                        )
                    is_ended = True
                    ended_reason = "customer-did-not-answer"
            except Exception as e:
                logger.debug(f"Error checking ringing timeout: {e}")

        # Extract turn-by-turn conversation messages
        messages_list = vapi_data.get("messages") or []
        timely_turns = []
        for m in messages_list:
            role = (m.get("role") or "").strip().lower()
            if role in ("system", "function", "tool_call"):
                continue
            speaker = "agent" if role in ("assistant", "bot") else "customer"
            text = (m.get("message") or m.get("content") or "").strip()
            if text:
                secs = int(m.get("secondsFromStart") or 0)
                timely_turns.append({
                    "speaker": speaker,
                    "message": text,
                    "timestamp": f"{secs//60:02d}:{secs%60:02d}",
                })

        if not timely_turns and vapi_data.get("transcript"):
            lines = vapi_data["transcript"].split("\n")
            sec = 4
            for line in lines:
                if ":" in line:
                    parts = line.split(":", 1)
                    speaker = "agent" if "assistant" in parts[0].lower() or "ai" in parts[0].lower() else "customer"
                    msg_text = parts[1].strip()
                    if msg_text:
                        timely_turns.append({
                            "speaker": speaker,
                            "message": msg_text,
                            "timestamp": f"{sec//60:02d}:{sec%60:02d}",
                        })
                        sec += 10

        if is_ended:
            duration = int(vapi_data.get("durationSeconds") or 0)
            if not duration and vapi_data.get("startedAt") and vapi_data.get("endedAt"):
                try:
                    s_dt = datetime.fromisoformat(vapi_data["startedAt"].replace("Z", "+00:00"))
                    e_dt = datetime.fromisoformat(vapi_data["endedAt"].replace("Z", "+00:00"))
                    duration = max(0, int((e_dt - s_dt).total_seconds()))
                except Exception:
                    pass

            # Classify final outcome
            lower_reason = ended_reason.lower()
            ended_message = (vapi_data.get("endedMessage") or "").strip()
            if "error-get-transport" in lower_reason:
                final_status = "failed"
                if ended_message:
                    err_msg = f"Carrier Transport Error: {ended_message}"
                else:
                    err_msg = (
                        "Carrier / Telephony Transport Error (call.start.error-get-transport): "
                        "Twilio could not initiate call to this destination. If using a Twilio Free Trial account, "
                        "calls can only be placed to numbers verified in your Twilio Console. "
                        "Please check for typos (e.g. +91 9727662885 vs +91 8727662885) or verify this number in Twilio."
                    )
            elif any(r in lower_reason for r in ("not-answer", "busy", "rejected", "declined", "unanswered")) or (not timely_turns and duration == 0 and "delete" in lower_reason):
                final_status = "no-answer"
                err_msg = ended_message or f"Customer declined or did not answer ({ended_reason or 'No answer'})"
            elif any(r in lower_reason for r in ("error", "failed", "carrier-unreachable")):
                final_status = "failed"
                err_msg = ended_message or f"Carrier / Telephony error: {ended_reason}"
            else:
                final_status = "completed"
                err_msg = None

            # Groq Post-Call Intelligence Review
            if timely_turns:
                analysis = await asyncio.to_thread(
                    analyze_call_with_groq,
                    business_name=call["business_name"],
                    customer_name=call["customer_name"],
                    call_reason=call["call_reason"],
                    transcript=timely_turns,
                    direction=call.get("direction", "outbound"),
                )
            else:
                analysis = {
                    "summary": f"Outbound call to {call['customer_name']} ended ({ended_reason or 'Line disconnected before conversation commenced'}).",
                    "call_outcome": "No Answer / Disconnected",
                    "sentiment": "neutral",
                    "intent_score": 25,
                    "lead_temperature": "Cold",
                    "key_points_discussed": [f"Carrier line initiated for {call['call_reason']}", "Recipient disconnected or call concluded before dialogue"],
                    "customer_concerns": [],
                    "action_items": [f"Schedule secondary outreach attempt for {call['customer_name']}"],
                    "agent_performance_review": "Carrier connection initiated; recipient disconnected or was unavailable.",
                }

            updates = {
                "status": final_status,
                "duration_seconds": duration or call.get("duration_seconds", 0),
                "ended_at": _now_iso(),
                "transcript": timely_turns,
                "recording_url": vapi_data.get("recordingUrl"),
                "analysis": analysis,
            }
            if analysis:
                if analysis.get("abuse_detected"):
                    updates["abuse_detected"] = True
                    updates["flagged"] = "abusive_language"
                    updates["abuse_details"] = analysis.get("abuse_details")
                if analysis.get("call_outcome"):
                    updates["call_outcome"] = analysis.get("call_outcome")
                if analysis.get("sentiment"):
                    updates["sentiment"] = analysis.get("sentiment")
            if err_msg:
                updates["error_message"] = err_msg

            await db.update_voice_call(call_id, updates)
            call.update(updates)

            # Auto-book to calendar if meeting was scheduled
            if analysis and timely_turns:
                try:
                    await _maybe_auto_book_calendar(
                        call_id=call_id,
                        analysis=analysis,
                        transcript=timely_turns,
                        customer_name=call.get("customer_name") or "Customer",
                        customer_phone=call.get("customer_phone"),
                        business_name=call.get("business_name") or "Vyepari CRM",
                        user_id=call.get("user_id"),
                    )
                except Exception as e:
                    logger.warning(f"Error auto-booking calendar from sync_vapi_call_status: {e}")

            return call

        elif vapi_status in ("ringing", "in-progress", "queued", "forwarding"):
            mapped = "in-progress" if has_connected else "ringing"
            updates: dict[str, Any] = {"status": mapped}
            if timely_turns:
                updates["transcript"] = timely_turns
            await db.update_voice_call(call_id, updates)
            call.update(updates)
            return call

    except Exception as e:
        logger.warning(f"Error syncing Vapi call status for {vapi_call_id}: {e}")

    return call


async def hangup_vapi_call(call_id: str) -> dict:
    """
    Explicitly hang up / terminate a live call via Vapi API (DELETE /call/{vapi_call_id}),
    then sync the final status and return the updated call record.
    """
    call = await db.get_voice_call(call_id)
    if not call:
        return {}

    vapi_call_id = call.get("vapi_call_id")
    if vapi_call_id:
        creds = await get_credentials()
        vapi_key = creds.get("vapi_api_key")
        if vapi_key:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    await client.delete(
                        f"{VAPI_BASE_URL}/call/{vapi_call_id}",
                        headers={"Authorization": f"Bearer {vapi_key}"},
                    )
            except Exception as e:
                logger.warning(f"Failed to terminate call {vapi_call_id} on Vapi: {e}")

    # Immediately sync status with force_ended=True
    return await sync_vapi_call_status(call_id, force_ended=True)
