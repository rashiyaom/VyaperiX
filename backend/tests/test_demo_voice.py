"""Tests for the isolated website demo-voice feature (Sarvam is mocked — zero credits)."""

import base64
import os

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import demo_voice_router
from app.services import demo_voice_service as demo

FAKE_WAV_B64 = base64.b64encode(b"RIFF....WAVEfake").decode()


class _FakeClient:
    def __init__(self, status=200, body=None):
        self.status, self.body, self.calls = status, body, []
        self.is_closed = False

    async def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return httpx.Response(self.status, json=self.body if self.body is not None else {"audios": [FAKE_WAV_B64]})


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("SARVAM_WEBSITE_DEMO_API_KEY", "demo-key")
    monkeypatch.setenv("SARVAM_API_KEY", "calling-agent-key")
    monkeypatch.setenv("SARVAM_TTS_API_KEY", "calling-agent-tts-key")
    demo.reset_state_for_tests(
        demo.DemoVoiceLimits(
            max_chars=100, ip_burst_max=3, ip_burst_window=600, ip_daily_max=5,
            ip_request_per_minute=50, global_daily_requests=6, global_daily_chars=10_000,
        )
    )


@pytest.fixture
def client(env, monkeypatch):
    fake = _FakeClient()
    monkeypatch.setattr(demo, "_get_client", lambda: fake)
    app = FastAPI()
    app.include_router(demo_voice_router.router, prefix="/api/demo-voice")
    tc = TestClient(app)
    tc.fake = fake
    return tc


def speak(tc, text="नमस्ते", lang="hi", gender="female", ip="1.1.1.1", **extra):
    return tc.post("/api/demo-voice/speak", json={"text": text, "language": lang, "gender": gender, **extra},
                   headers={"x-forwarded-for": ip})


def test_uses_only_dedicated_key_never_calling_agent_keys(client, monkeypatch):
    r = speak(client)
    assert r.status_code == 200
    assert client.fake.calls[0]["headers"]["api-subscription-key"] == "demo-key"
    # Without the dedicated key the feature must be off, even if calling-agent keys exist.
    monkeypatch.delenv("SARVAM_WEBSITE_DEMO_API_KEY")
    r = speak(client, text="different text")
    assert r.status_code == 503 and r.json()["error"] == "not_configured"
    assert len(client.fake.calls) == 1


def test_returns_audio_and_maps_language_and_speaker(client):
    r = speak(client, lang="od", gender="male")
    body = r.json()
    assert body["success"] and body["audio_b64"] == FAKE_WAV_B64 and body["cached"] is False
    sent = client.fake.calls[0]["json"]
    assert sent["target_language_code"] == "od-IN" and sent["speaker"] == "aditya"
    assert sent["model"] == "bulbul:v3"


def test_cache_hits_do_not_call_sarvam_or_consume_quota(client):
    for _ in range(10):
        r = speak(client, text="same phrase")
        assert r.status_code == 200
    assert len(client.fake.calls) == 1
    assert r.json()["cached"] is True
    assert r.json()["quota"]["burst_remaining"] == 2


def test_per_ip_burst_limit_then_other_ip_unaffected(client):
    for i in range(3):
        assert speak(client, text=f"t{i}").status_code == 200
    blocked = speak(client, text="t-extra")
    assert blocked.status_code == 429 and blocked.json()["error"] == "burst_limit"
    assert int(blocked.headers["retry-after"]) > 0
    assert speak(client, text="t-extra", ip="2.2.2.2").status_code == 200
    assert len(client.fake.calls) == 4


def test_global_budget_stops_everyone(client):
    for i in range(6):
        assert speak(client, text=f"g{i}", ip=f"9.9.9.{i}").status_code == 200
    r = speak(client, text="g-over", ip="8.8.8.8")
    assert r.status_code == 503 and r.json()["error"] == "demo_budget_exhausted"
    assert len(client.fake.calls) == 6


def test_validation(client):
    assert speak(client, text="   ").status_code == 422
    assert speak(client, text="x" * 101).status_code == 422
    assert speak(client, lang="xx").status_code == 422
    assert client.fake.calls == []


def test_upstream_failure_refunds_quota(client):
    client.fake.status, client.fake.body = 500, {"error": "boom"}
    for i in range(5):
        assert speak(client, text=f"f{i}").status_code == 502
    client.fake.status, client.fake.body = 200, None
    assert speak(client, text="ok now").status_code == 200  # not locked out by failed calls


def test_config_endpoint_lists_all_languages(client):
    body = client.get("/api/demo-voice/config").json()
    assert body["configured"] is True
    assert set(body["languages"]) >= {"hi", "gu", "en", "mr", "bn", "ta", "te", "kn", "ml", "pa", "od"}
    assert len(body["languages"]) >= 10


def test_calling_agent_service_is_untouched_and_independent():
    """Calling-agent module must not import the demo module, and vice versa."""
    root = os.path.join(os.path.dirname(__file__), "..", "app", "services")
    with open(os.path.join(root, "sarvam_service.py"), encoding="utf-8") as f:
        calling_src = f.read()
    assert "demo_voice" not in calling_src and "SARVAM_WEBSITE_DEMO_API_KEY" not in calling_src
    with open(os.path.join(root, "demo_voice_service.py"), encoding="utf-8") as f:
        src = f.read()
    assert "sarvam_service" not in src.replace("`sarvam_service.py`", "")
    assert 'os.getenv("SARVAM_API_KEY"' not in src and "SARVAM_TTS_API_KEY\"" not in src
