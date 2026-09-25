"""
Public website voice-preview endpoints (unauthenticated, rate limited).

Backed by `app.services.demo_voice_service`, which uses its own Sarvam key
(SARVAM_WEBSITE_DEMO_API_KEY) and is fully isolated from the calling-agent stack.
"""

from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services import demo_voice_service as demo

router = APIRouter()


class DemoSpeakRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    language: str = "hi"
    gender: str = "female"
    speaker: Optional[str] = None
    pace: float = 1.0


def _client_ip(request: Request) -> str:
    """Real client IP, honouring the first hop of X-Forwarded-For (Railway/Vercel proxies)."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _error(exc: demo.DemoVoiceError, ip: str) -> JSONResponse:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else {}
    return JSONResponse(
        status_code=exc.status,
        headers=headers,
        content={
            "success": False,
            "error": exc.code,
            "message": exc.message,
            "retry_after": exc.retry_after,
            "quota": demo.get_quota(ip),
        },
    )


@router.get("/config")
async def demo_voice_config(request: Request):
    """Language/voice catalogue plus the caller's remaining fresh-sample quota."""
    return {**demo.catalog(), "quota": demo.get_quota(_client_ip(request))}


@router.post("/speak")
async def demo_voice_speak(payload: DemoSpeakRequest, request: Request):
    """Synthesise a short preview with Sarvam Bulbul v3 and return base64 WAV audio."""
    ip = _client_ip(request)
    gender = payload.gender.strip().lower()
    speaker = (payload.speaker or demo.DEFAULT_SPEAKER.get(gender, "priya")).strip().lower()
    if payload.speaker and speaker not in demo.DEMO_SPEAKERS.get(gender, {}):
        speaker = demo.DEFAULT_SPEAKER.get(gender, "priya")

    try:
        result = await demo.synthesize(
            text=payload.text,
            language=payload.language,
            speaker=speaker,
            client_ip=ip,
            pace=payload.pace,
        )
    except demo.DemoVoiceError as exc:
        return _error(exc, ip)

    return {"success": True, **result, "quota": demo.get_quota(ip)}
