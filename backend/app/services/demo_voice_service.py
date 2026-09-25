"""
Website Demo Voice (Sarvam Bulbul v3) — isolated public-preview TTS.

This module powers the unauthenticated "listen to our voice agents" widgets on the
marketing home page. It is INTENTIONALLY independent from `sarvam_service.py`
(the telephony / calling-agent integration):

  * It reads ONLY `SARVAM_WEBSITE_DEMO_API_KEY`. It never falls back to
    `SARVAM_API_KEY` / `SARVAM_TTS_API_KEY`, so the two features can never share
    (or accidentally exhaust) each other's credentials.
  * It has its own HTTP client, its own audio cache and its own rate limiter.
  * Nothing here imports from, or is imported by, the calling-agent code.

Because callers are anonymous, every request that would reach Sarvam is metered:
per-IP burst + daily limits and a global daily request/character budget. Cached
replays never reach Sarvam and cost nothing, so preset phrases are effectively
free after their first play.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional, Tuple

import httpx

logger = logging.getLogger("vyepari.demo_voice")

SARVAM_DEMO_TTS_URL = "https://api.sarvam.ai/text-to-speech"
SARVAM_DEMO_MODEL = "bulbul:v3"
API_KEY_ENV = "SARVAM_WEBSITE_DEMO_API_KEY"

# Languages Sarvam Bulbul v3 can synthesise natively (10 Indian languages + Indian English).
# Keys are the short codes used by the website; values are Sarvam BCP-47 codes.
DEMO_LANGUAGES: Dict[str, str] = {
    "hi": "hi-IN",
    "gu": "gu-IN",
    "en": "en-IN",
    "mr": "mr-IN",
    "bn": "bn-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "pa": "pa-IN",
    "od": "od-IN",
}

# Website-facing voices. Gender -> allowed Bulbul v3 speakers.
DEMO_SPEAKERS: Dict[str, Dict[str, str]] = {
    "female": {"priya": "Priya", "pooja": "Pooja", "ritu": "Ritu"},
    "male": {"aditya": "Aditya", "shubh": "Shubh", "rohan": "Rohan"},
}
DEFAULT_SPEAKER = {"female": "priya", "male": "aditya"}
_ALL_SPEAKERS = {s for group in DEMO_SPEAKERS.values() for s in group}


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, "").strip() or default))
    except ValueError:
        return default


@dataclass(frozen=True)
class DemoVoiceLimits:
    """Tunable ceilings, all overridable via DEMO_VOICE_* env vars."""

    max_chars: int
    ip_burst_max: int  # uncached Sarvam calls per IP inside ip_burst_window
    ip_burst_window: int  # seconds
    ip_daily_max: int  # uncached Sarvam calls per IP per rolling 24h
    ip_request_per_minute: int  # any request (cached or not) per IP per minute
    global_daily_requests: int  # uncached Sarvam calls across all visitors per 24h
    global_daily_chars: int  # characters sent to Sarvam across all visitors per 24h

    @classmethod
    def from_env(cls) -> "DemoVoiceLimits":
        return cls(
            max_chars=_env_int("DEMO_VOICE_MAX_CHARS", 280),
            ip_burst_max=_env_int("DEMO_VOICE_IP_BURST_MAX", 6),
            ip_burst_window=_env_int("DEMO_VOICE_IP_BURST_WINDOW_SEC", 600),
            ip_daily_max=_env_int("DEMO_VOICE_IP_DAILY_MAX", 25),
            ip_request_per_minute=_env_int("DEMO_VOICE_IP_PER_MINUTE", 20),
            global_daily_requests=_env_int("DEMO_VOICE_GLOBAL_DAILY_REQUESTS", 300),
            global_daily_chars=_env_int("DEMO_VOICE_GLOBAL_DAILY_CHARS", 30000),
        )


class DemoVoiceError(Exception):
    """Raised with an HTTP-ish status so the router can map it directly."""

    def __init__(self, status: int, code: str, message: str, retry_after: int = 0):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after


DAY = 86400


class _RateLimiter:
    """In-memory sliding-window limiter. Single-process; resets on restart."""

    def __init__(self, limits: DemoVoiceLimits):
        self.limits = limits
        self._ip_calls: Dict[str, Deque[Tuple[float, int]]] = {}  # uncached (ts, chars)
        self._ip_requests: Dict[str, Deque[float]] = {}  # every request
        self._global: Deque[Tuple[float, int]] = deque()

    @staticmethod
    def _prune(dq: Deque, cutoff: float) -> None:
        while dq and (dq[0][0] if isinstance(dq[0], tuple) else dq[0]) <= cutoff:
            dq.popleft()

    def _sweep(self, now: float) -> None:
        """Drop idle IP entries so memory stays bounded under scanning traffic."""
        if len(self._ip_calls) + len(self._ip_requests) < 2000:
            return
        for table in (self._ip_calls, self._ip_requests):
            for ip in list(table):
                self._prune(table[ip], now - DAY)
                if not table[ip]:
                    del table[ip]

    def check_request(self, ip: str, now: Optional[float] = None) -> None:
        """Cheap per-minute guard applied to every request, cached or not."""
        now = now if now is not None else time.time()
        self._sweep(now)
        dq = self._ip_requests.setdefault(ip, deque())
        self._prune(dq, now - 60)
        if len(dq) >= self.limits.ip_request_per_minute:
            raise DemoVoiceError(
                429, "too_many_requests",
                "You're going a bit fast. Please wait a few seconds and try again.",
                retry_after=max(1, int(dq[0] + 60 - now) + 1),
            )
        dq.append(now)

    def check_and_reserve(self, ip: str, chars: int, now: Optional[float] = None) -> None:
        """Validate (and record) one uncached Sarvam call. Raises DemoVoiceError."""
        now = now if now is not None else time.time()
        lim = self.limits

        self._prune(self._global, now - DAY)
        if (
            len(self._global) >= lim.global_daily_requests
            or sum(c for _, c in self._global) + chars > lim.global_daily_chars
        ):
            oldest = self._global[0][0] if self._global else now
            raise DemoVoiceError(
                503, "demo_budget_exhausted",
                "Today's free voice-preview budget has been used up. "
                "Please try again later, or book a demo to hear the full agents.",
                retry_after=max(60, int(oldest + DAY - now)),
            )

        dq = self._ip_calls.setdefault(ip, deque())
        self._prune(dq, now - DAY)
        if len(dq) >= lim.ip_daily_max:
            raise DemoVoiceError(
                429, "daily_limit",
                f"Daily preview limit reached ({lim.ip_daily_max} fresh voice samples). "
                "Previously played samples still work — or sign up to hear more.",
                retry_after=max(60, int(dq[0][0] + DAY - now)),
            )
        burst = [t for t, _ in dq if t > now - lim.ip_burst_window]
        if len(burst) >= lim.ip_burst_max:
            raise DemoVoiceError(
                429, "burst_limit",
                f"Preview limit reached ({lim.ip_burst_max} fresh samples per "
                f"{lim.ip_burst_window // 60} min). Try again shortly — replays are free.",
                retry_after=max(1, int(burst[0] + lim.ip_burst_window - now) + 1),
            )

        dq.append((now, chars))
        self._global.append((now, chars))

    def release(self, ip: str, chars: int) -> None:
        """Refund a reservation when Sarvam itself failed (no credits were used)."""
        dq = self._ip_calls.get(ip)
        if dq:
            for i in range(len(dq) - 1, -1, -1):
                if dq[i][1] == chars:
                    del dq[i]
                    break
        for i in range(len(self._global) - 1, -1, -1):
            if self._global[i][1] == chars:
                del self._global[i]
                break

    def remaining(self, ip: str, now: Optional[float] = None) -> Dict[str, int]:
        now = now if now is not None else time.time()
        lim = self.limits
        dq = self._ip_calls.get(ip, deque())
        self._prune(dq, now - DAY)
        self._prune(self._global, now - DAY)
        burst_used = sum(1 for t, _ in dq if t > now - lim.ip_burst_window)
        return {
            "burst_remaining": max(0, lim.ip_burst_max - burst_used),
            "daily_remaining": max(0, lim.ip_daily_max - len(dq)),
            "burst_window_seconds": lim.ip_burst_window,
        }


class _AudioCache:
    """Small LRU of base64 WAVs keyed by (lang, speaker, pace, text)."""

    def __init__(self, capacity: int = 400):
        self.capacity = capacity
        self._data: "OrderedDict[str, str]" = OrderedDict()

    def get(self, key: str) -> Optional[str]:
        if key in self._data:
            self._data.move_to_end(key)
            return self._data[key]
        return None

    def put(self, key: str, audio_b64: str) -> None:
        self._data[key] = audio_b64
        self._data.move_to_end(key)
        while len(self._data) > self.capacity:
            self._data.popitem(last=False)


_limits = DemoVoiceLimits.from_env()
_limiter = _RateLimiter(_limits)
_cache = _AudioCache()
_upstream_gate = asyncio.Semaphore(3)  # never hammer Sarvam with parallel anonymous calls
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=25.0, write=8.0, pool=10.0))
    return _client


def get_demo_api_key() -> str:
    """Dedicated website-demo key only. Deliberately no fallback to the calling-agent keys."""
    return os.getenv(API_KEY_ENV, "").strip()


def is_configured() -> bool:
    return bool(get_demo_api_key())


def get_limits() -> DemoVoiceLimits:
    return _limits


def get_quota(ip: str) -> Dict[str, int]:
    return _limiter.remaining(ip)


def catalog() -> dict:
    return {
        "configured": is_configured(),
        "model": SARVAM_DEMO_MODEL,
        "languages": list(DEMO_LANGUAGES),
        "speakers": {g: list(s) for g, s in DEMO_SPEAKERS.items()},
        "max_chars": _limits.max_chars,
    }


def _validate(text: str, language: str, speaker: str, pace: float) -> Tuple[str, str, str, float]:
    clean = " ".join((text or "").split())
    if not clean:
        raise DemoVoiceError(422, "empty_text", "Please enter some text to speak.")
    if len(clean) > _limits.max_chars:
        raise DemoVoiceError(
            422, "text_too_long",
            f"Preview text is limited to {_limits.max_chars} characters.",
        )
    lang_key = (language or "").strip().lower()
    if lang_key not in DEMO_LANGUAGES:
        raise DemoVoiceError(422, "unsupported_language", f"Unsupported language '{language}'.")
    spk = (speaker or "").strip().lower()
    if spk not in _ALL_SPEAKERS:
        raise DemoVoiceError(422, "unsupported_speaker", f"Unsupported voice '{speaker}'.")
    return clean, DEMO_LANGUAGES[lang_key], spk, max(0.8, min(1.2, float(pace or 1.0)))


async def synthesize(
    text: str,
    language: str,
    speaker: str,
    client_ip: str,
    pace: float = 1.0,
) -> dict:
    """
    Returns {"audio_b64", "mime_type", "cached", "language_code", "speaker"}.
    Raises DemoVoiceError for validation, rate-limit, budget and upstream failures.
    """
    clean, lang_code, spk, pace = _validate(text, language, speaker, pace)

    _limiter.check_request(client_ip)

    cache_key = f"{lang_code}|{spk}|{pace}|{clean}"
    hit = _cache.get(cache_key)
    if hit:
        return {"audio_b64": hit, "mime_type": "audio/wav", "cached": True,
                "language_code": lang_code, "speaker": spk}

    key = get_demo_api_key()
    if not key:
        raise DemoVoiceError(
            503, "not_configured",
            f"Voice preview is not configured on this server (set {API_KEY_ENV}).",
        )

    chars = len(clean)
    _limiter.check_and_reserve(client_ip, chars)

    payload = {
        "text": clean,
        "target_language_code": lang_code,
        "speaker": spk,
        "model": SARVAM_DEMO_MODEL,
        "pace": pace,
        "speech_sample_rate": 22050,
        "output_audio_codec": "wav",
    }
    headers = {"api-subscription-key": key, "Content-Type": "application/json"}

    try:
        async with _upstream_gate:
            resp = await _get_client().post(SARVAM_DEMO_TTS_URL, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        _limiter.release(client_ip, chars)
        logger.warning("Demo TTS network error: %s", exc)
        raise DemoVoiceError(502, "upstream_unreachable", "Voice service is unreachable. Please retry.") from exc

    if resp.status_code != 200:
        _limiter.release(client_ip, chars)
        logger.error("Demo TTS upstream %s: %s", resp.status_code, resp.text[:300])
        if resp.status_code in (401, 403):
            raise DemoVoiceError(503, "upstream_auth", "Voice preview credentials were rejected by the provider.")
        if resp.status_code == 402:
            raise DemoVoiceError(
                503, "provider_credits_exhausted",
                "Voice previews are temporarily unavailable. Please check back soon.",
                retry_after=3600,
            )
        if resp.status_code == 429:
            raise DemoVoiceError(503, "upstream_busy", "The voice provider is busy. Please retry in a moment.", retry_after=20)
        raise DemoVoiceError(502, "upstream_error", "Voice provider returned an error. Please retry.")

    audios = (resp.json() or {}).get("audios") or []
    if not audios:
        _limiter.release(client_ip, chars)
        raise DemoVoiceError(502, "upstream_empty", "Voice provider returned no audio.")

    _cache.put(cache_key, audios[0])
    return {"audio_b64": audios[0], "mime_type": "audio/wav", "cached": False,
            "language_code": lang_code, "speaker": spk}


def reset_state_for_tests(limits: Optional[DemoVoiceLimits] = None) -> None:
    """Test hook: clear limiter + cache (optionally with custom limits)."""
    global _limits, _limiter, _cache
    _limits = limits or DemoVoiceLimits.from_env()
    _limiter = _RateLimiter(_limits)
    _cache = _AudioCache()
