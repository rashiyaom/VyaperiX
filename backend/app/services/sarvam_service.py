"""
Sarvam AI Text-to-Speech (Bulbul v3) Integration Service
Provides ultra-realistic, native Indic voice synthesis for Hindi, Gujarati, and other regional languages.
Used for direct web browser playback and Vapi Custom Voice telephony bridging.
"""

import os
import io
import re
import wave
import base64
import logging
from typing import Optional, Tuple
from dotenv import load_dotenv
import httpx

logger = logging.getLogger("vyepari.sarvam")

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
SARVAM_DEFAULT_MODEL = "bulbul:v3"


# Valid Bulbul:v3 speakers
VALID_SPEAKERS = {
    "priya": {"gender": "female", "description": "Clear, natural Indian female voice (recommended for Hindi & Gujarati)"},
    "aditya": {"gender": "male", "description": "Articulate, professional Indian male voice"},
    "pooja": {"gender": "female", "description": "Warm, consultative Indian female voice"},
    "shubh": {"gender": "male", "description": "Smooth, engaging Indian male voice"},
    "ritu": {"gender": "female", "description": "Expressive Indian female voice"},
    "rohan": {"gender": "male", "description": "Energetic Indian male voice"},
    "simran": {"gender": "female", "description": "Pleasant Indian female voice"},
    "kavya": {"gender": "female", "description": "Polite Indian female voice"},
}

# In-memory audio cache: key -> {"audio_b64": str, "pcm_bytes": bytes, "sample_rate": int}
_AUDIO_CACHE: dict[str, dict] = {}


def get_sarvam_api_key() -> str:
    """Retrieve Sarvam API key from env or fallback."""
    load_dotenv(override=True)
    return (os.getenv("SARVAM_API_KEY") or os.getenv("SARVAM_TTS_API_KEY", "")).strip()


def get_sarvam_tts_api_key() -> str:
    """Retrieve Sarvam TTS API key (prioritizing dedicated TTS key if defined)."""
    load_dotenv(override=True)
    return (os.getenv("SARVAM_TTS_API_KEY") or os.getenv("SARVAM_API_KEY", "")).strip()


def resolve_language_code(language_input: Optional[str] = "hi") -> str:
    """
    Resolve shorthand language names/codes to Sarvam BCP-47 language codes.
    Default to Hindi if ambiguous or auto.
    """
    lang = (language_input or "hi").strip().lower()
    if lang in ("gu", "gujarati", "gu-in"):
        return "gu-IN"
    elif lang in ("hi", "hindi", "hi-in"):
        return "hi-IN"
    elif lang in ("en", "english", "en-in"):
        return "en-IN"
    elif lang in ("mr", "marathi", "mr-in"):
        return "mr-IN"
    elif lang in ("ta", "tamil", "ta-in"):
        return "ta-IN"
    elif lang in ("te", "telugu", "te-in"):
        return "te-IN"
    elif lang in ("bn", "bengali", "bn-in"):
        return "bn-IN"
    return "hi-IN"


def resolve_speaker(speaker_input: Optional[str] = "priya") -> str:
    """Ensure speaker is valid for Bulbul:v3."""
    spk = (speaker_input or "priya").strip().lower()
    if spk in VALID_SPEAKERS:
        return spk
    return "priya"


async def synthesize_speech(
    text: str,
    language: Optional[str] = "hi",
    speaker: Optional[str] = "priya",
    pace: float = 1.0,
    api_key: Optional[str] = None,
) -> dict:
    """
    Synthesizes speech using Sarvam AI Bulbul:v3.
    Returns:
        {
            "success": bool,
            "audio_b64": str (WAV audio base64 encoded),
            "mime_type": "audio/wav",
            "language_code": str,
            "speaker": str,
            "error": Optional[str]
        }
    """
    key = (api_key or get_sarvam_api_key()).strip()
    if not key:
        return {
            "success": False,
            "error": "Sarvam API key is not configured. Set SARVAM_API_KEY in backend settings.",
        }

    clean_text = text.strip()
    if not clean_text:
        return {"success": False, "error": "Text cannot be empty."}

    lang_code = resolve_language_code(language)
    spk = resolve_speaker(speaker)

    # Check cache
    cache_key = f"{lang_code}:{spk}:{pace}:{clean_text}"
    if cache_key in _AUDIO_CACHE:
        cached = _AUDIO_CACHE[cache_key]
        return {
            "success": True,
            "audio_b64": cached["audio_b64"],
            "mime_type": "audio/wav",
            "language_code": lang_code,
            "speaker": spk,
            "cached": True,
        }

    headers = {
        "api-subscription-key": key,
        "Content-Type": "application/json",
    }

    # Sarvam expects inputs as an array of strings, max 2500 chars total
    payload = {
        "inputs": [clean_text[:2400]],
        "target_language_code": lang_code,
        "speaker": spk,
        "model": SARVAM_DEFAULT_MODEL,
        "pace": max(0.5, min(2.0, pace)),
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(SARVAM_TTS_URL, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                audios = data.get("audios", [])
                if audios:
                    audio_b64 = audios[0]
                    # Cache the result (limit cache to 200 entries to prevent memory leak)
                    if len(_AUDIO_CACHE) > 200:
                        _AUDIO_CACHE.pop(next(iter(_AUDIO_CACHE)))
                    _AUDIO_CACHE[cache_key] = {
                        "audio_b64": audio_b64,
                    }
                    return {
                        "success": True,
                        "audio_b64": audio_b64,
                        "mime_type": "audio/wav",
                        "language_code": lang_code,
                        "speaker": spk,
                    }
                else:
                    return {"success": False, "error": "Sarvam returned empty audio list."}
            else:
                err_msg = resp.text
                logger.error(f"Sarvam TTS failed ({resp.status_code}): {err_msg}")
                return {"success": False, "error": f"Sarvam error ({resp.status_code}): {err_msg}"}
    except Exception as e:
        logger.exception(f"Exception during Sarvam TTS request: {e}")
        return {"success": False, "error": str(e)}


import numpy as np


def resample_pcm16(pcm_bytes: bytes, orig_sr: int, target_sr: int) -> bytes:
    """
    Resamples 16-bit mono PCM audio bytes from orig_sr to target_sr using numpy linear interpolation.
    Prevents pitch shifting or slowed-down/distorted playback when fed into Vapi WebRTC/SIP engines.
    """
    if not pcm_bytes or orig_sr == target_sr or target_sr <= 0:
        return pcm_bytes
    try:
        audio = np.frombuffer(pcm_bytes, dtype=np.int16)
        num_output_samples = int(round(len(audio) * float(target_sr) / orig_sr))
        x_old = np.linspace(0, 1, len(audio))
        x_new = np.linspace(0, 1, num_output_samples)
        resampled = np.interp(x_new, x_old, audio).astype(np.int16)
        return resampled.tobytes()
    except Exception as e:
        logger.error(f"Failed to resample PCM bytes: {e}")
        return pcm_bytes


async def synthesize_raw_pcm(
    text: str,
    language: Optional[str] = "hi",
    speaker: Optional[str] = "priya",
    target_sample_rate: Optional[int] = 24000,
    api_key: Optional[str] = None,
) -> Tuple[Optional[bytes], int]:
    """
    Synthesizes speech using Sarvam Bulbul v3 and returns raw 16-bit PCM bytes resampled to target_sample_rate
    (default 24000 Hz expected by Vapi Custom Voice).
    Returns: (pcm_bytes, sample_rate)
    """
    res = await synthesize_speech(text, language=language, speaker=speaker, api_key=api_key)
    if not res.get("success") or not res.get("audio_b64"):
        return None, 0

    try:
        raw_wav_bytes = base64.b64decode(res["audio_b64"])
        with wave.open(io.BytesIO(raw_wav_bytes), "rb") as wf:
            orig_sample_rate = wf.getframerate()
            frames = wf.readframes(wf.getnframes())

            target_sr = target_sample_rate or 24000
            resampled_frames = resample_pcm16(frames, orig_sample_rate, target_sr)
            return resampled_frames, target_sr
    except Exception as e:
        logger.exception(f"Failed to extract PCM frames from Sarvam WAV: {e}")
        return None, 0


# ─────────────────────────── Sarvam + Exotel Outbound Caller ───────────────────

def format_e164_phone_number(phone_number: str) -> str:
    """
    Normalizes phone number to strict E.164 format required by Sarvam AI.
    Handles raw Indian 10-digit numbers, missing '+', dashes, and spaces.
    Examples:
        '9820012345'       -> '+919820012345'
        '919820012345'     -> '+919820012345'
        '+91 98200-12345'  -> '+919820012345'
    """
    raw = str(phone_number or "").strip()
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("+"):
        return digits

    # If exactly 10 digits, assume standard Indian mobile number
    if len(digits) == 10 and digits.isdigit():
        return "+91" + digits
    elif len(digits) == 12 and digits.startswith("91"):
        return "+" + digits
    else:
        return "+" + digits


def build_initial_bot_message(
    business_name: Optional[str] = "Vyepari CRM",
    customer_name: Optional[str] = "",
    call_reason: Optional[str] = "Outbound Consultation",
    language: Optional[str] = "Hindi",
) -> str:
    """
    Generates authentic, high-relevance opening greeting for the Sarvam agent
    tailored to language (Hindi, Gujarati, English) and call context.
    """
    lang = (language or "Hindi").strip().lower()
    b_name = (business_name or "Vyepari CRM").strip()
    c_name = (customer_name or "").strip()
    c_reason = (call_reason or "sales consultation").strip()

    if lang in ("hindi", "hi", "hi-in"):
        if c_name and c_reason:
            return f"नमस्ते {c_name}, मैं {b_name} से बात कर रहा हूँ {c_reason} के बारे में। क्या आपके पास दो मिनट का समय है?"
        return f"नमस्ते, मैं {b_name} से बात कर रहा हूँ। मैं आपकी कैसे मदद कर सकता हूँ?"
    elif lang in ("gujarati", "gu", "gu-in"):
        if c_name and c_reason:
            return f"નમસ્તે {c_name}, હું {b_name} તરફથી વાત કરું છું {c_reason} અંગે. શું તમારી પાસે બે મિનિટ વાત કરવાનો સમય છે?"
        return f"નમસ્તે, હું {b_name} તરફથી છું. હું તમારી કેવી રીતે મદદ કરી શકું?"
    else:
        if c_name and c_reason:
            return f"Hello {c_name}, this is calling from {b_name} regarding {c_reason}. Do you have a brief moment to connect?"
        return f"Hello, I am calling from {b_name}. How can I help you today?"


async def dispatch_sarvam_outbound_call(
    call_id: str,
    customer_phone: str,
    customer_name: Optional[str] = "Customer",
    business_name: Optional[str] = "Vyepari CRM",
    call_reason: Optional[str] = "Outbound Consultation",
    language: Optional[str] = "Hindi",
    extra_context: Optional[dict] = None,
    api_key: Optional[str] = None,
) -> dict:
    """
    Dispatch an outbound phone call via Sarvam AI Samvaad Outbound Agent API
    bridged with Exotel telephony.
    """
    sarvam_key = (api_key or get_sarvam_api_key()).strip()
    if not sarvam_key:
        return {
            "success": False,
            "error": "Sarvam API key is not configured. Set SARVAM_API_KEY in backend settings or .env",
        }

    sarvam_url = os.getenv(
        "SARVAM_OUTBOUND_URL",
        "https://apps.sarvam.ai/api/outbounds/v1/orgs/01a09649-1638-78ad-aa1b-3f931d5fe076/workspaces/01a09649-163e-7025-b065-8cc04b34e1ef/outbounds"
    )
    app_id = os.getenv("SARVAM_APP_ID", "vepariX1-a2091c40-a905")
    try:
        app_version = int(os.getenv("SARVAM_APP_VERSION", "2"))
    except ValueError:
        app_version = 2

    connection_id = os.getenv("SARVAM_CONNECTION_ID", "VepariX-252a795f-a3f9")
    agent_phone = os.getenv("SARVAM_AGENT_PHONE_NUMBER", "+917948228458")
    
    public_base_url = (
        os.getenv("PUBLIC_BASE_URL", "")
        or os.getenv("PUBLIC_WEBHOOK_URL", "https://giant-enjoyable-unclad.ngrok-free.dev")
    ).rstrip("/")

    destination_number = format_e164_phone_number(customer_phone)
    digits_only = re.sub(r"[^\d]", "", destination_number)
    if destination_number.startswith("+91"):
        sub_len = len(digits_only) - 2
        if sub_len != 10:
            return {
                "success": False,
                "error": f"Invalid Indian phone number '{customer_phone}'. It contains {sub_len} digits, but Indian mobile numbers must have exactly 10 digits (e.g. +91 98765 43210).",
            }
    elif len(digits_only) < 10:
        return {
            "success": False,
            "error": f"Invalid phone number '{customer_phone}'. Please provide a valid phone number in E.164 format with country code.",
        }

    initial_bot_message = build_initial_bot_message(
        business_name=business_name,
        customer_name=customer_name,
        call_reason=call_reason,
        language=language,
    )

    call_summary = "N/A"
    if extra_context and isinstance(extra_context, dict):
        summary_val = (
            extra_context.get("summary")
            or extra_context.get("one_line_summary")
            or extra_context.get("business_description")
        )
        if summary_val:
            call_summary = str(summary_val)[:250]

    payload = {
        "app_config": {
            "app_id": app_id,
            "app_version": app_version,
            "app_type": "agent",
            "connection_config": {
                "connection_id": connection_id,
                "agent_phone_number": agent_phone,
            },
            "agent_variables": {
                "call_summary": call_summary,
                "callback_time": "N/A",
                "disposition": "pending",
                "gender": "N/A",
                "user_name": customer_name or "N/A",
            },
            "app_overrides": {
                "initial_bot_message": initial_bot_message,
                "initial_state_name": "start",
            },
        },
        "user_config": {
            "user_phone_number": destination_number,
        },
        "webhook_config": {
            "url": f"{public_base_url}/sarvam/webhook",
            "metadata": {
                "lead_id": str(call_id),
            },
        },
    }

    headers = {
        "Content-Type": "application/json",
        "api-subscription-key": sarvam_key,
        "X-API-Key": sarvam_key,
    }

    logger.info(f"[{call_id}] Dispatching Sarvam + Exotel call to {destination_number} via {sarvam_url}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(sarvam_url, headers=headers, json=payload)
            try:
                resp_data = resp.json()
            except Exception:
                resp_data = {"raw_text": resp.text}

            if resp.status_code not in (200, 201, 202):
                err_msg = f"Sarvam API Error ({resp.status_code}): {resp_data}"
                logger.error(f"[{call_id}] {err_msg}")
                return {
                    "success": False,
                    "error": err_msg,
                    "status_code": resp.status_code,
                    "sarvam_response": resp_data,
                }

            call_sid = (
                resp_data.get("data", {}).get("call_id")
                or resp_data.get("call_id")
                or str(call_id)
            )

            logger.info(f"[{call_id}] Sarvam outbound call successfully queued. Call SID: {call_sid}")
            return {
                "success": True,
                "call_sid": call_sid,
                "sarvam_response": resp_data,
            }

    except Exception as e:
        logger.exception(f"[{call_id}] Error connecting to Sarvam Outbounds API: {e}")
        return {
            "success": False,
            "error": f"Connection error: {str(e)}",
        }
