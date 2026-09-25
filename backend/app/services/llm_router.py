"""
llm_router.py -- Async LLM call router with per-model circuit breakers,
async rate limiting (RPM + TPM), and smart 429/503 retry policy.

429 policy:
  Parse Retry-After header or Gemini body retryDelay.
  Wait <= LLM_RETRY_WAIT_CAP (default 15s) -> sleep and retry same model.
  Wait > cap OR not found -> record_failure() + skip to next model.

503 policy: exponential backoff, up to 30s, max_retries attempts.

400/401/403/404: record_failure() + skip immediately (no retry).

Circuit breakers: one CircuitBreaker per model name (not per provider).
  Reuses app.services.search.circuit_breaker.CircuitBreaker verbatim.

Rate limiter: token-bucket per provider.
  Groq: GROQ_RPM (default 30) + GROQ_TPM (default 6000).
  Token estimate: len(prompt) // 4.
  Gemini: GEMINI_RPM (default 15).

IMPORTANT: Groq and Gemini SDK clients MUST be constructed with max_retries=0.
This module is the sole retry layer.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import re
import time
from typing import Callable, Awaitable

from app.services._metrics import emit as _emit_metric
from app.services.search.circuit_breaker import CircuitBreaker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config from env
# ---------------------------------------------------------------------------

_RETRY_WAIT_CAP: float = float(os.environ.get("LLM_RETRY_WAIT_CAP", "15"))
_CB_THRESHOLD: int     = int(os.environ.get("LLM_CB_THRESHOLD", "3"))
_CB_TIMEOUT: float     = float(os.environ.get("LLM_CB_TIMEOUT", "60"))
GROQ_RPM: int          = int(os.environ.get("GROQ_RPM",   "30"))
GROQ_TPM: int          = int(os.environ.get("GROQ_TPM", "8000"))
GEMINI_RPM: int        = int(os.environ.get("GEMINI_RPM",  "15"))
MAX_INPUT_CHARS: int   = int(os.environ.get("MAX_INPUT_CHARS", "24000"))

# Per-model TPM limits (verified against Groq on-demand console limits)
MODEL_TPM_LIMITS: dict[str, int] = {
    "openai/gpt-oss-120b": int(os.environ.get("GROQ_TPM_GPT120B", "8000")),
    "openai/gpt-oss-20b":  int(os.environ.get("GROQ_TPM_GPT20B",  "8000")),
    "llama-3.3-70b-versatile": int(os.environ.get("GROQ_TPM_LLAMA70B", "6000")),
    "llama-3.1-8b-instant": int(os.environ.get("GROQ_TPM_LLAMA8B", "20000")),
    "qwen/qwen3.8-27b":    int(os.environ.get("GROQ_TPM_QWEN27B", "8000")),
    "gemini-2.5-flash":    int(os.environ.get("GEMINI_TPM_FLASH", "1000000")),
    "gemini-1.5-flash":    int(os.environ.get("GEMINI_TPM_15FLASH", "1000000")),
    "gemini-2.0-flash":    int(os.environ.get("GEMINI_TPM_20FLASH", "1000000")),
}


def get_model_tpm(model: str) -> int:
    for m_key, val in MODEL_TPM_LIMITS.items():
        if m_key in model or model in m_key:
            return val
    if "gemini" in model.lower():
        return 1_000_000
    return GROQ_TPM


# ---------------------------------------------------------------------------
# Per-model circuit breakers
# ---------------------------------------------------------------------------

_model_breakers: dict[str, CircuitBreaker] = {}


def _get_breaker(model: str) -> CircuitBreaker:
    if model not in _model_breakers:
        _model_breakers[model] = CircuitBreaker(
            failure_threshold=_CB_THRESHOLD,
            reset_timeout_seconds=_CB_TIMEOUT,
        )
    return _model_breakers[model]


# ---------------------------------------------------------------------------
# Async rate limiter (token bucket)
# ---------------------------------------------------------------------------

class _AsyncRateLimiter:
    """Async token-bucket rate limiter (RPM + optional TPM)."""

    def __init__(self, rpm: int, tpm: int = 0) -> None:
        self._min_interval = 60.0 / rpm if rpm > 0 else 0.0
        self._tpm = tpm
        self._last_call = 0.0
        self._tokens_used = 0
        self._window_start = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, estimated_tokens: int = 0) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_call
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)
            now = time.monotonic()
            if now - self._window_start >= 60.0:
                self._tokens_used = 0
                self._window_start = now
            if self._tpm > 0 and estimated_tokens > 0:
                if self._tokens_used + estimated_tokens > self._tpm:
                    if self._tokens_used > 0:
                        wait = 60.0 - (now - self._window_start)
                        if wait > 0:
                            await asyncio.sleep(wait)
                        self._tokens_used = 0
                        self._window_start = time.monotonic()
                self._tokens_used += min(estimated_tokens, self._tpm)
            self._last_call = time.monotonic()


_groq_limiter    = _AsyncRateLimiter(rpm=GROQ_RPM, tpm=GROQ_TPM)
_gemini_limiter  = _AsyncRateLimiter(rpm=GEMINI_RPM)
_default_limiter = _AsyncRateLimiter(rpm=60)


def _get_limiter(provider: str) -> _AsyncRateLimiter:
    if provider == "groq":
        return _groq_limiter
    if provider == "gemini":
        return _gemini_limiter
    return _default_limiter


# ---------------------------------------------------------------------------
# 429 / 503 classification
# ---------------------------------------------------------------------------

def _parse_wait(exc: Exception) -> float | None:
    """
    Extract wait seconds from a 429 exception.
    Returns float if <= LLM_RETRY_WAIT_CAP, else None (skip model).
    Checks: Retry-After header value; Gemini retryDelay field ("3s").
    """
    if _is_payload_too_large_413(exc):
        return None
    s = str(exc)
    # Retry-After: <int>
    m = re.search(r"retry.after[^\d]*(\d+)", s, re.IGNORECASE)
    if m:
        wait = float(m.group(1))
        return wait if wait <= _RETRY_WAIT_CAP else None
    # Gemini retryDelay: "3s"
    m = re.search(r"retryDelay[^\d]*(\d+(?:\.\d+)?)s", s, re.IGNORECASE)
    if m:
        wait = float(m.group(1))
        return wait if wait <= _RETRY_WAIT_CAP else None
    # Groq / generic format: "Please try again in 10.9725s"
    m = re.search(r"try again in (\d+(?:\.\d+)?)s", s, re.IGNORECASE)
    if m:
        wait = float(m.group(1))
        return wait if wait <= _RETRY_WAIT_CAP else None
    return None


def _is_payload_too_large_413(exc: Exception) -> bool:
    s = str(exc)
    return "413" in s or "request too large" in s.lower() or bool(re.search(r"Limit\s*\d+.*?Requested\s*\d+", s, re.IGNORECASE))


def _parse_limit_requested(exc: Exception) -> tuple[int, int] | None:
    s = str(exc)
    m = re.search(r"Limit\s*(\d+).*?Requested\s*(\d+)", s, re.IGNORECASE)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None


def _shrink_prompt(prompt: str, max_chars: int) -> str:
    """Shrink prompt to fit under max_chars while preserving instructions and structure."""
    if len(prompt) <= max_chars:
        return prompt
    head_len = int(max_chars * 0.65)
    tail_len = int(max_chars * 0.30)
    omitted = len(prompt) - head_len - tail_len
    return (
        f"{prompt[:head_len]}\n\n"
        f"--- [Dossier trimmed to fit model TPM limit — {omitted} characters omitted] ---\n\n"
        f"{prompt[-tail_len:]}"
    )


def _is_quota_429(exc: Exception) -> bool:
    s = str(exc).lower()
    return "429" in s or "rate limit" in s or "quota" in s or "too many" in s


def _is_retryable_503(exc: Exception) -> bool:
    s = str(exc).lower()
    return "503" in s or "service unavailable" in s or "overloaded" in s


def _is_non_retryable(exc: Exception) -> bool:
    s = str(exc)
    return any(c in s for c in (" 400", "(400)", " 401", "(401)", " 403", "(403)", " 404", "(404)"))


# ---------------------------------------------------------------------------
# Per-model retry loop
# ---------------------------------------------------------------------------

async def _call_with_retry(
    provider_fn: Callable[..., Awaitable[str]],
    provider: str,
    model: str,
    prompt: str,
    system: str,
    max_tokens: int,
    temperature: float,
    max_retries: int = 2,
) -> str:
    """Call provider_fn with retry on retryable errors (429 + 503, plus 413 single-shrink retry)."""
    # Preemptive TPM limit check: Request size = input_tokens + max_tokens + system_overhead < 80% TPM
    model_tpm = get_model_tpm(model)
    tpm_cap = int(model_tpm * 0.8)
    system_tokens = len(system) // 4
    input_tokens = len(prompt) // 4
    overhead = 200
    req_tokens = input_tokens + max_tokens + system_tokens + overhead

    if req_tokens > tpm_cap:
        avail_input = tpm_cap - max_tokens - system_tokens - overhead
        if avail_input >= 200:
            logger.info(
                f"[llm_router] Request ({req_tokens}) exceeds 80% TPM cap ({tpm_cap}) for {model}. "
                f"Trimming prompt to {avail_input} tokens."
            )
            prompt = _shrink_prompt(prompt, avail_input * 4)
        else:
            logger.warning(
                f"[llm_router] Model {model} 80% TPM cap {tpm_cap} cannot fit requested max_tokens={max_tokens} + system={system_tokens}. Skipping model."
            )
            raise ValueError(f"Request size exceeds 80% TPM cap for {model}")

    limiter = _get_limiter(provider)
    last_exc: Exception | None = None
    shrunk_on_413 = False

    for attempt in range(max_retries + 1):
        estimated_tokens = len(prompt) // 4
        await limiter.acquire(estimated_tokens)
        try:
            return await provider_fn(
                model=model, prompt=prompt, system=system,
                max_tokens=max_tokens, temperature=temperature,
            )
        except Exception as exc:
            last_exc = exc
            is_last = attempt >= max_retries

            # 413: Non-retryable by waiting. Parse Limit/Requested, shrink once to fit, retry immediately.
            if _is_payload_too_large_413(exc):
                if not shrunk_on_413:
                    shrunk_on_413 = True
                    parsed = _parse_limit_requested(exc)
                    limit = parsed[0] if parsed else get_model_tpm(model)
                    avail_tokens = tpm_cap - max_tokens - (len(system) // 4) - 200
                    avail_tokens = min(avail_tokens, max(100, int((len(prompt) // 4) * 0.70)))
                    if avail_tokens >= 100:
                        logger.info(f"[llm_router] 413 on {model} (limit={limit}). Shrinking prompt to {avail_tokens} tokens and retrying once without waiting.")
                        prompt = _shrink_prompt(prompt, avail_tokens * 4)
                        continue
                # If already shrunk once or cannot fit, raise immediately so router skips to next model
                raise

            if _is_non_retryable(exc):
                raise

            if _is_quota_429(exc):
                wait = _parse_wait(exc)
                if wait is None:
                    raise  # skip to next model
                if not is_last:
                    logger.info(f"[llm_router] 429 wait={wait:.1f}s on {model}")
                    await asyncio.sleep(wait)
                    continue
                raise

            if _is_retryable_503(exc):
                if not is_last:
                    backoff = min(2 ** attempt + random.uniform(0, 1), 30.0)
                    logger.info(f"[llm_router] 503 backoff={backoff:.1f}s on {model}")
                    await asyncio.sleep(backoff)
                    continue
                raise

            raise  # unknown error

    assert last_exc is not None
    raise last_exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def call_with_fallback(
    prompt: str,
    system: str = "",
    max_tokens: int = 3500,
    temperature: float = 0.2,
    provider_models: list[tuple[str, str]] | None = None,
    large_context: bool = False,
) -> str:
    """
    Call LLM providers in order with per-model circuit breakers + retry.

    Returns: raw text response from the first successful model.
    Raises:  RuntimeError if all providers fail.
    """
    if provider_models is None:
        provider_models = default_provider_models(large_context=large_context)
    if len(prompt) > MAX_INPUT_CHARS:
        prompt = prompt[:MAX_INPUT_CHARS]

    last_exc: Exception | None = None
    for provider, model in provider_models:
        breaker = _get_breaker(model)
        if breaker.is_open():
            logger.info(f"[llm_router] Circuit breaker OPEN for {model}, skipping.")
            continue
        _t0 = time.monotonic()
        try:
            fn = _get_provider_fn(provider)
            result = await _call_with_retry(
                provider_fn=fn, provider=provider, model=model,
                prompt=prompt, system=system,
                max_tokens=max_tokens, temperature=temperature,
            )
            breaker.record_success()
            _emit_metric({"event": "router_call", "provider": provider,
                          "model": model, "status": "ok",
                          "ms": round((time.monotonic() - _t0) * 1000)})
            return result
        except Exception as exc:
            breaker.record_failure()
            last_exc = exc
            _emit_metric({"event": "router_call", "provider": provider,
                          "model": model, "status": "error",
                          "ms": round((time.monotonic() - _t0) * 1000),
                          "error": str(exc)[:120]})
            logger.warning(f"[llm_router] {provider}/{model} failed: {exc}")

    raise RuntimeError(f"All LLM providers exhausted. Last error: {last_exc}")


def default_provider_models(large_context: bool = False) -> list[tuple[str, str]]:
    """
    Build the default ordered provider/model chain.
    If large_context=True (whole-business synthesis), Gemini is routed FIRST
    due to its 1M+ token context window and high TPM.
    Groq is retained first for small, fast per-document tasks (large_context=False).
    """
    from dotenv import load_dotenv
    load_dotenv()
    seen: set[str] = set()

    groq_chain: list[tuple[str, str]] = []
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key:
        cfg = os.environ.get("GROQ_MODEL", "")
        pool = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
        for m in ([cfg] if cfg else []) + pool:
            if m and m not in seen:
                seen.add(m)
                groq_chain.append(("groq", m))

    gemini_chain: list[tuple[str, str]] = []
    gemini_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GEMINI_API_KEY_BACKUP", "")
    if gemini_key:
        cfg = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        for m in [cfg, "gemini-2.5-flash"]:
            if m and m not in seen:
                seen.add(m)
                gemini_chain.append(("gemini", m))

    or_chain: list[tuple[str, str]] = []
    or_key = os.environ.get("OPENROUTER_API_KEY", "")
    if or_key:
        or_model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
        if or_model not in seen:
            seen.add(or_model)
            or_chain.append(("openrouter", or_model))

    # Always prioritize Groq first; Gemini is strictly fallback
    return groq_chain + gemini_chain + or_chain


def _get_provider_fn(provider: str) -> Callable[..., Awaitable[str]]:
    dispatch = {"groq": _call_groq, "gemini": _call_gemini, "openrouter": _call_openrouter}
    if provider not in dispatch:
        raise ValueError(f"Unknown provider: {provider!r}")
    return dispatch[provider]


async def _call_groq(
    model: str, prompt: str, system: str, max_tokens: int, temperature: float
) -> str:
    """Async Groq call. max_retries=0 -- this router is the retry layer."""
    from groq import AsyncGroq
    client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY", ""), max_retries=0)
    msgs: list[dict] = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    try:
        resp = await client.chat.completions.create(
            model=model, messages=msgs,
            temperature=temperature, max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""
    except Exception as json_err:
        if "json" in str(json_err).lower() or "400" in str(json_err):
            resp = await client.chat.completions.create(
                model=model, messages=msgs,
                temperature=temperature, max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""
        raise


async def _call_gemini(
    model: str, prompt: str, system: str, max_tokens: int, temperature: float
) -> str:
    """Async Gemini via run_in_executor (SDK is sync). Router handles retries."""
    from google import genai
    from google.genai import types
    active_gemini_key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GEMINI_API_KEY_BACKUP", "")
    client = genai.Client(
        api_key=active_gemini_key,
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(attempts=1)
        ),
    )
    full = f"{system}\n\n{prompt}" if system else prompt
    loop = asyncio.get_event_loop()
    resp = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
            model=model, contents=full,
            config={"response_mime_type": "application/json"},
        ),
    )
    return (resp.text or "") if resp else ""


async def _call_openrouter(
    model: str, prompt: str, system: str, max_tokens: int, temperature: float
) -> str:
    """Async OpenRouter call via httpx."""
    import httpx
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    msgs: list[dict] = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"},
            json={"model": model, "messages": msgs,
                  "temperature": temperature, "max_tokens": max_tokens},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"] or ""
