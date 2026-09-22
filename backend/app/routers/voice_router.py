"""
voice_router.py — FastAPI Router for Voice Fleet & Telephony Module.

Provides endpoints for:
- Outbound calling (Single and CSV batch campaigns)
- Inbound call simulation & webhooks
- Call logs & timely transcript retrieval
- Groq AI post-call review triggering
- Twilio & Vapi credentials configuration
"""

import asyncio
import os
import logging
import uuid
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Header, Query, Request, Response
from pydantic import BaseModel, Field

from app.core import database as db
from app.services import voice_engine
from app.services import sarvam_service
from app.core import auth_middleware

logger = logging.getLogger(__name__)

router = APIRouter()


# ─────────────────────────── Schemas ───────────────────────────────────

class CallRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, description="Target customer or lead name")
    customer_phone: str = Field(..., min_length=3, description="Phone number with country code")
    business_name: str = Field(..., min_length=1, description="Company/business name represented by AI SDR")
    call_reason: str = Field(..., min_length=1, description="Specific context and reason why called")
    direction: Optional[str] = "outbound"
    campaign_id: Optional[str] = None
    force_simulate: Optional[bool] = False
    language: Optional[str] = "auto"
    user_id: Optional[str] = None
    extra_context: Optional[dict] = None


class BatchCallRequest(BaseModel):
    campaign_name: Optional[str] = "CSV Batch Campaign"
    calls: List[CallRequest] = Field(..., min_length=1)
    force_simulate: Optional[bool] = False
    user_id: Optional[str] = None


class InboundSimRequest(BaseModel):
    customer_name: str = "Priya Patel"
    customer_phone: str = "+91 98200 12345"
    business_name: str = "Vyepari CRM"
    caller_inquiry: str = "Pricing inquiry for 25 sales seats and enterprise API integration"


class DirectOutboundCallRequest(BaseModel):
    phone_number: str = Field(..., min_length=5, description="Target phone number (e.g. 10-digit Indian number or +91...)")
    language: Optional[str] = "Hindi"
    customer_name: Optional[str] = "Customer"
    business_name: Optional[str] = "Vyepari CRM"
    call_reason: Optional[str] = "Outbound Consultation"
    extra_context: Optional[dict] = None
    user_id: Optional[str] = None


class VoiceSettingsPayload(BaseModel):
    vapi_api_key: Optional[str] = None
    vapi_public_key: Optional[str] = None
    vapi_phone_number_id: Optional[str] = None
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None
    sarvam_api_key: Optional[str] = None
    sarvam_speaker: Optional[str] = "priya"
    sarvam_connection_id: Optional[str] = None
    sarvam_agent_phone_number: Optional[str] = None
    public_webhook_url: Optional[str] = None
    voice_provider: Optional[str] = "sarvam"
    voice_id: Optional[str] = "priya"


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to synthesize")
    language: Optional[str] = "hi"
    speaker: Optional[str] = "priya"
    pace: Optional[float] = 1.0


# ─────────────────────────── Endpoints ─────────────────────────────────

@router.post("/calls", status_code=201)
async def create_single_call(
    payload: CallRequest,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
):
    """
    Dispatch a single voice call. Injects dynamic context (business name, customer name, why called).
    Supports live Vapi/Twilio dispatch with automatic fallback to high-fidelity simulation.
    """
    resolved_user_id = payload.user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user:
                resolved_user_id = auth_user.id
        except Exception:
            pass

    call_id = str(uuid.uuid4())
    call_data = {
        "id": call_id,
        "campaign_id": payload.campaign_id,
        "direction": payload.direction or "outbound",
        "customer_name": payload.customer_name.strip(),
        "customer_phone": payload.customer_phone.strip(),
        "business_name": payload.business_name.strip(),
        "call_reason": payload.call_reason.strip(),
        "status": "queued",
        "duration_seconds": 0,
        "transcript": [],
        "analysis": None,
    }

    await db.create_voice_call(call_data, user_id=resolved_user_id)

    if payload.force_simulate:
        background_tasks.add_task(
            voice_engine.simulate_call_lifecycle,
            call_id=call_id,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            business_name=payload.business_name,
            call_reason=payload.call_reason,
            direction=payload.direction or "outbound",
            language=payload.language or "auto",
            extra_context=payload.extra_context,
        )
    else:
        background_tasks.add_task(
            voice_engine.dispatch_outbound_call,
            call_id=call_id,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            business_name=payload.business_name,
            call_reason=payload.call_reason,
            language=payload.language or "auto",
            extra_context=payload.extra_context,
        )

    return {"success": True, "call_id": call_id, "status": "queued"}


@router.post("/call/outbound", status_code=201)
async def direct_outbound_call(payload: DirectOutboundCallRequest):
    """
    Direct outbound call endpoint matching backend.zip specification.
    Dispatches via Sarvam AI Samvaad agent with Exotel telephony and logs in Supabase.
    """
    call_id = str(uuid.uuid4())
    formatted_phone = sarvam_service.format_e164_phone_number(payload.phone_number)
    customer_name = (payload.customer_name or "Customer").strip()
    business_name = (payload.business_name or "Vyepari CRM").strip()
    call_reason = (payload.call_reason or "Outbound Consultation").strip()

    call_data = {
        "id": call_id,
        "campaign_id": None,
        "direction": "outbound",
        "customer_name": customer_name,
        "customer_phone": formatted_phone,
        "business_name": business_name,
        "call_reason": call_reason,
        "status": "queued",
        "duration_seconds": 0,
        "transcript": [],
        "analysis": None,
    }
    await db.create_voice_call(call_data, user_id=payload.user_id)

    dispatch_res = await voice_engine.dispatch_outbound_call(
        call_id=call_id,
        customer_name=customer_name,
        customer_phone=formatted_phone,
        business_name=business_name,
        call_reason=call_reason,
        language=payload.language or "Hindi",
        extra_context=payload.extra_context,
    )

    if not dispatch_res.get("success"):
        raise HTTPException(status_code=500, detail=dispatch_res.get("error", "Call dispatch failed"))

    call_sid = dispatch_res.get("call_sid") or call_id
    return {
        "status": "success",
        "call_id": call_id,
        "call_sid": call_sid,
        "details": dispatch_res,
    }


@router.post("/calls/batch", status_code=202)
async def create_batch_calls(payload: BatchCallRequest, background_tasks: BackgroundTasks):
    """
    Dispatch a batch of calls parsed from an uploaded CSV file in order.
    Each call gets its unique context (customer name, why called, business name, and scraped intelligence).
    """
    campaign_id = str(uuid.uuid4())
    created_call_ids = []

    async def _process_batch(items: List[CallRequest], camp_id: str, force_sim: bool, fallback_user_id: Optional[str] = None):
        for item in items:
            c_id = str(uuid.uuid4())
            call_data = {
                "id": c_id,
                "campaign_id": camp_id,
                "direction": item.direction or "outbound",
                "customer_name": item.customer_name.strip(),
                "customer_phone": item.customer_phone.strip(),
                "business_name": item.business_name.strip(),
                "call_reason": item.call_reason.strip(),
                "status": "queued",
                "duration_seconds": 0,
                "transcript": [],
                "analysis": None,
            }
            await db.create_voice_call(call_data, user_id=item.user_id or fallback_user_id)
            created_call_ids.append(c_id)

            if force_sim:
                await voice_engine.simulate_call_lifecycle(
                    call_id=c_id,
                    customer_name=item.customer_name,
                    customer_phone=item.customer_phone,
                    business_name=item.business_name,
                    call_reason=item.call_reason,
                    direction=item.direction or "outbound",
                    language=item.language or "auto",
                    extra_context=item.extra_context,
                )
            else:
                await voice_engine.dispatch_outbound_call(
                    call_id=c_id,
                    customer_name=item.customer_name,
                    customer_phone=item.customer_phone,
                    business_name=item.business_name,
                    call_reason=item.call_reason,
                    language=item.language or "auto",
                    extra_context=item.extra_context,
                )
            # Sequential throttle delay between outbound calls
            await asyncio.sleep(1.5)

    background_tasks.add_task(
        _process_batch,
        payload.calls,
        campaign_id,
        payload.force_simulate or False,
        payload.user_id,
    )

    return {
        "success": True,
        "campaign_id": campaign_id,
        "campaign_name": payload.campaign_name,
        "total_queued": len(payload.calls),
        "status": "processing",
    }


@router.get("/calls")
async def list_calls(
    user_id: Optional[str] = Query(None),
    direction: Optional[str] = Query(None, description="outbound | inbound | all"),
    status: Optional[str] = Query(None, description="queued | in-progress | completed | failed | all"),
    campaign_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(None),
):
    """List call history with optional filters and search."""
    resolved_user_id = user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user:
                resolved_user_id = auth_user.id
        except Exception:
            pass

    calls = await db.list_voice_calls(
        user_id=resolved_user_id,
        direction=direction,
        status=status,
        campaign_id=campaign_id,
        limit=limit,
    )
    if search and search.strip():
        s = search.strip().lower()
        calls = [
            c for c in calls
            if s in c.get("customer_name", "").lower()
            or s in c.get("customer_phone", "").lower()
            or s in c.get("business_name", "").lower()
            or s in c.get("call_reason", "").lower()
        ]
    return calls


@router.get("/calls/{call_id}")
async def get_call_details(call_id: str):
    """Retrieve full details of a specific call including timely transcripts and Groq AI analysis."""
    call = await db.get_voice_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found")

    # If call was placed via live Vapi (not Sarvam) and is still active, sync latest status & transcripts
    vapi_id = call.get("vapi_call_id")
    if (
        vapi_id
        and not str(vapi_id).startswith("sarvam_")
        and str(vapi_id) != str(call_id)
        and call.get("status") in ("queued", "in-progress", "ringing")
    ):
        try:
            synced = await voice_engine.sync_vapi_call_status(call_id)
            if synced:
                call = synced
        except Exception as e:
            logger.warning(f"Failed to sync Vapi call {call_id}: {e}")

    return call


@router.post("/calls/{call_id}/hangup")
async def hangup_call(call_id: str):
    """Explicitly hang up / terminate an ongoing call immediately (via Vapi/telephony carrier)."""
    call = await db.get_voice_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found")
    result = await voice_engine.hangup_vapi_call(call_id)
    return result


@router.delete("/calls/{call_id}")
async def delete_call(call_id: str):
    """Delete a call log."""
    deleted = await db.delete_voice_call(call_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Call record not found")
    return {"success": True, "deleted_call_id": call_id}


@router.post("/calls/{call_id}/analyze")
async def analyze_call(call_id: str):
    """(Re)run Groq AI review and analysis on a completed call transcript."""
    call = await db.get_voice_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found")

    transcript = call.get("transcript") or []
    if not transcript:
        raise HTTPException(status_code=400, detail="Cannot analyze call with no recorded transcript")

    analysis = await asyncio.to_thread(
        voice_engine.analyze_call_with_groq,
        business_name=call["business_name"],
        customer_name=call["customer_name"],
        call_reason=call["call_reason"],
        transcript=transcript,
        direction=call.get("direction", "outbound"),
    )

    await db.update_voice_call(call_id, {"analysis": analysis})

    # Auto-book to calendar if meeting was scheduled
    try:
        await voice_engine._maybe_auto_book_calendar(
            call_id=call_id,
            analysis=analysis,
            transcript=transcript,
            customer_name=call.get("customer_name"),
            customer_phone=call.get("customer_phone"),
            business_name=call.get("business_name"),
            user_id=call.get("user_id"),
        )
    except Exception as e:
        logger.warning(f"Error auto-booking calendar event from analyze endpoint: {e}")

    return {"success": True, "call_id": call_id, "analysis": analysis}


@router.post("/simulate-inbound", status_code=201)
async def simulate_inbound_call(payload: InboundSimRequest, background_tasks: BackgroundTasks):
    """
    Simulate an inbound customer call to test inbound call logging,
    timely transcript streaming, and Groq analysis.
    """
    call_id = str(uuid.uuid4())
    call_data = {
        "id": call_id,
        "campaign_id": None,
        "direction": "inbound",
        "customer_name": payload.customer_name.strip(),
        "customer_phone": payload.customer_phone.strip(),
        "business_name": payload.business_name.strip(),
        "call_reason": payload.caller_inquiry.strip(),
        "status": "queued",
        "duration_seconds": 0,
        "transcript": [],
        "analysis": None,
    }
    await db.create_voice_call(call_data)

    background_tasks.add_task(
        voice_engine.simulate_call_lifecycle,
        call_id=call_id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        business_name=payload.business_name,
        call_reason=payload.caller_inquiry,
        direction="inbound",
    )

    return {"success": True, "call_id": call_id, "direction": "inbound", "status": "queued"}


@router.post("/tts")
async def generate_speech(payload: TTSRequest):
    """
    Synthesizes speech using Sarvam AI Bulbul v3 for in-browser playback.
    Produces authentic, fluent Hindi & Gujarati native audio.
    """
    creds = await voice_engine.get_credentials()
    api_key = creds.get("sarvam_api_key")
    speaker = payload.speaker or creds.get("sarvam_speaker", "priya")
    res = await sarvam_service.synthesize_speech(
        text=payload.text,
        language=payload.language,
        speaker=speaker,
        pace=payload.pace or 1.0,
        api_key=api_key,
    )
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error", "Speech synthesis failed"))
    return res


@router.get("/sarvam/test")
@router.post("/sarvam/test")
async def test_sarvam_service(speaker: Optional[str] = "priya", language: Optional[str] = "hi"):
    """
    Directly test Sarvam AI Indic voice synthesis connectivity and audio output.
    Returns synthesized sample audio metadata and base64 WAV payload.
    """
    creds = await voice_engine.get_credentials()
    api_key = creds.get("sarvam_api_key")
    if not api_key:
        return {"success": False, "error": "SARVAM_API_KEY is not configured in backend environment or voice settings."}

    test_phrase = "नमस्ते! मैं व्यापारी एक्स की एआई वॉइस एजेंट हूँ। आपकी क्या सहायता कर सकती हूँ?"
    if language in ("gu", "gujarati"):
        test_phrase = "નમસ્તે! હું વ્યાપારી એક્સ એઆઈ વોઈસ એજન્ટ છું. હું તમને કેવી રીતે મદદ કરી શકું?"

    res = await sarvam_service.synthesize_speech(
        text=test_phrase,
        language=language,
        speaker=speaker or "priya",
        api_key=api_key,
    )
    if res.get("success"):
        return {
            "success": True,
            "provider": "sarvam",
            "model": "bulbul:v3",
            "speaker": speaker or "priya",
            "language": language or "hi",
            "sample_phrase": test_phrase,
            "audio_b64": res.get("audio_b64"),
            "mime_type": "audio/wav",
            "message": "Sarvam AI API connection & Indic voice synthesis operational!"
        }
    return res



@router.post("/webhook/vapi/custom-voice")
async def vapi_custom_voice_webhook(request: Request):
    """
    Vapi custom-voice webhook endpoint.
    Receives voice-request from Vapi with text to synthesize,
    synthesizes speech using Sarvam Bulbul v3, and streams raw 16-bit PCM bytes back.
    """
    try:
        body = await request.json()
        msg = body.get("message", {})
        msg_type = msg.get("type")

        # If it's a voice synthesis request
        if msg_type == "voice-request":
            text = msg.get("text", "")
            target_sr = msg.get("sampleRate") or 24000
            call_obj = msg.get("call", {})
            # Determine language if specified in call assistant or default based on script
            language = "en-IN"
            combined_text = text
            if call_obj:
                assistant = call_obj.get("assistant", {})
                first_msg = assistant.get("firstMessage", "")
                combined_text = f"{first_msg} {text}"

            if any(ord(c) >= 0x0A80 and ord(c) <= 0x0AFF for c in combined_text):
                language = "gu-IN"
            elif any(ord(c) >= 0x0900 and ord(c) <= 0x097F for c in combined_text):
                language = "hi-IN"
            else:
                language = "en-IN"

            creds = await voice_engine.get_credentials()
            speaker = creds.get("sarvam_speaker", "priya")
            api_key = creds.get("sarvam_api_key")

            pcm_bytes, out_sr = await sarvam_service.synthesize_raw_pcm(
                text=text,
                language=language,
                speaker=speaker,
                target_sample_rate=target_sr,
                api_key=api_key,
            )
            if pcm_bytes:
                return Response(content=pcm_bytes, media_type="audio/pcm")
            else:
                logger.error("Failed to generate PCM audio from Sarvam.")
                return Response(status_code=500, content=b"")

        return {"status": "ok"}
    except Exception as e:
        logger.exception(f"Error handling Vapi custom-voice request: {e}")
        return Response(status_code=500, content=b"")


@router.post("/webhook/vapi")
async def vapi_webhook(request: Request):
    """
    Public webhook receiver for Vapi AI events (call started, speech transcript, call ended).
    Captures timely transcripts and executes post-call Groq review.
    """
    try:
        body = await request.json()
        logger.info(f"Vapi webhook payload received: {list(body.keys())}")
        result = await voice_engine.handle_vapi_webhook(body)
        return {"ok": True, "result": result}
    except Exception as e:
        logger.exception(f"Error processing Vapi webhook: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/sarvam/webhook")
async def sarvam_webhook(request: Request):
    """
    Webhook receiver for Sarvam AI Outbound agent events and interaction transcripts.
    Saves transcripts and updates call status in Supabase.
    """
    try:
        body = await request.json()
        logger.info(f"Sarvam webhook payload received: {list(body.keys()) if isinstance(body, dict) else type(body)}")
        result = await voice_engine.handle_sarvam_webhook(body)
        return result
    except Exception as e:
        logger.exception(f"Error processing Sarvam webhook: {e}")
        return {"status": "error", "error": str(e)}


@router.get("/stats")
async def get_stats(
    user_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """Retrieve aggregate statistics for dashboard metric cards."""
    resolved_user_id = user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user:
                resolved_user_id = auth_user.id
        except Exception:
            pass
    return await db.get_voice_stats(user_id=resolved_user_id)


@router.get("/config")
async def get_config():
    """Get active voice and telephony configuration (masked for security)."""
    creds = await voice_engine.get_credentials()
    return {
        "has_vapi_key": bool(creds.get("vapi_api_key")),
        "vapi_key_masked": f"...{creds['vapi_api_key'][-4:]}" if creds.get("vapi_api_key") else "",
        "vapi_public_key": creds.get("vapi_public_key", ""),
        "vapi_phone_number_id": creds.get("vapi_phone_number_id", ""),
        "has_twilio_sid": bool(creds.get("twilio_account_sid")),
        "twilio_account_sid_masked": f"...{creds['twilio_account_sid'][-4:]}" if creds.get("twilio_account_sid") else "",
        "twilio_phone_number": creds.get("twilio_phone_number", ""),
        "has_sarvam_key": bool(creds.get("sarvam_api_key")),
        "sarvam_key_masked": f"...{creds['sarvam_api_key'][-4:]}" if creds.get("sarvam_api_key") else "",
        "sarvam_speaker": creds.get("sarvam_speaker", "priya"),
        "sarvam_connection_id": os.getenv("SARVAM_CONNECTION_ID", "Exotel-091864e2-adfa"),
        "sarvam_agent_phone_number": os.getenv("SARVAM_AGENT_PHONE_NUMBER", "+917948518309"),
        "public_webhook_url": creds.get("public_webhook_url", "") or os.getenv("PUBLIC_BASE_URL", ""),
        "voice_provider": creds.get("voice_provider", "sarvam"),
        "voice_id": creds.get("voice_id", "priya"),
    }


@router.post("/config")
async def save_config(payload: VoiceSettingsPayload):
    """Save or update Vapi, Twilio, and Sarvam telephony credentials."""
    updates = {}
    if payload.vapi_api_key is not None:
        updates["vapi_api_key"] = payload.vapi_api_key.strip()
    if payload.vapi_public_key is not None:
        updates["vapi_public_key"] = payload.vapi_public_key.strip()
    if payload.vapi_phone_number_id is not None:
        updates["vapi_phone_number_id"] = payload.vapi_phone_number_id.strip()
    if payload.twilio_account_sid is not None:
        updates["twilio_account_sid"] = payload.twilio_account_sid.strip()
    if payload.twilio_auth_token is not None:
        updates["twilio_auth_token"] = payload.twilio_auth_token.strip()
    if payload.twilio_phone_number is not None:
        updates["twilio_phone_number"] = payload.twilio_phone_number.strip()
    if payload.sarvam_api_key is not None:
        updates["sarvam_api_key"] = payload.sarvam_api_key.strip()
    if payload.sarvam_speaker is not None:
        updates["sarvam_speaker"] = payload.sarvam_speaker.strip()
    if payload.sarvam_connection_id is not None:
        updates["sarvam_connection_id"] = payload.sarvam_connection_id.strip()
    if payload.sarvam_agent_phone_number is not None:
        updates["sarvam_agent_phone_number"] = payload.sarvam_agent_phone_number.strip()
    if payload.public_webhook_url is not None:
        updates["public_webhook_url"] = payload.public_webhook_url.strip()
    if payload.voice_provider is not None:
        updates["voice_provider"] = payload.voice_provider.strip()
    if payload.voice_id is not None:
        updates["voice_id"] = payload.voice_id.strip()

    await db.save_voice_settings(updates)
    return {"success": True, "message": "Voice and telephony configuration updated successfully"}
