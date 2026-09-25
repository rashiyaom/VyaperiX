"""
test_video_router.py — Comprehensive Unit & Integration Tests for Video Sales Agent Router.

Covers:
1. POST /api/video/meetings/start:
   - 401 when unauthenticated
   - 404 when report does not exist
   - 403 when report belongs to another user
   - 400 when report status is not 'done'
   - Surface Tavus API error & no row created in video_calls on Tavus failure
   - 200 with video_call_id & conversation_url, inserting row into video_calls on success
   - callback_url omitted if PUBLIC_WEBHOOK_URL is missing or placeholder
2. GET /api/video/meetings/{id}:
   - 401 when unauthenticated
   - 404 when call does not exist
   - 404 when call belongs to another user
   - 200 with status, transcript, analysis when call belongs to user
3. GET /api/video/meetings:
   - 401 when unauthenticated
   - 200 listing calls scoped to authenticated user, newest first
"""

import json
import os
import sys
import uuid
from pathlib import Path
from typing import Dict
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure backend directory is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import auth_middleware
from app.core import database as db
from app.routers import video_router


def create_test_token(user_id: str, email: str = "test@example.com") -> str:
    """Creates a signed HS256 Supabase JWT token for testing."""
    secret = auth_middleware.SUPABASE_JWT_SECRET
    payload = {
        "sub": user_id,
        "email": email,
        "role": "authenticated",
        "user_metadata": {"full_name": "Test User"},
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def app():
    fastapi_app = FastAPI()
    fastapi_app.include_router(video_router.router, prefix="/api/video")
    return fastapi_app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def user_a():
    return {
        "id": str(uuid.uuid4()),
        "email": "user_a@example.com",
    }


@pytest.fixture
def user_b():
    return {
        "id": str(uuid.uuid4()),
        "email": "user_b@example.com",
    }


@pytest.fixture
def token_a(user_a):
    return create_test_token(user_a["id"], user_a["email"])


@pytest.fixture
def token_b(user_b):
    return create_test_token(user_b["id"], user_b["email"])


# ─────────────────────────── POST /meetings/start Tests ─────────────────

def test_start_meeting_unauthenticated(client):
    """POST /meetings/start requires an Authorization header."""
    res = client.post("/api/video/meetings/start", json={"report_id": "any-id"})
    assert res.status_code == 401
    assert "Authentication required" in res.json().get("detail", "")


def test_start_meeting_report_not_found(client, token_a):
    """Returns 404 when report does not exist."""
    with patch("app.core.database.get_report", new_callable=AsyncMock) as mock_get_report:
        mock_get_report.return_value = None

        res = client.post(
            "/api/video/meetings/start",
            json={"report_id": "nonexistent-report-123"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 404
        assert "not found" in res.json().get("detail", "").lower()


def test_start_meeting_report_forbidden_for_other_user(client, user_a, user_b, token_a):
    """Returns 403 when report exists but belongs to a different user."""
    with patch("app.core.database.get_report", new_callable=AsyncMock) as mock_get_report:
        mock_get_report.return_value = {
            "id": "report-user-b",
            "user_id": user_b["id"],  # Belongs to user B
            "status": "done",
            "analysis": {"company_name": "User B Corp"},
        }

        res = client.post(
            "/api/video/meetings/start",
            json={"report_id": "report-user-b"},
            headers={"Authorization": f"Bearer {token_a}"},  # User A calling
        )
        assert res.status_code == 403
        assert "not belong" in res.json().get("detail", "").lower()


def test_start_meeting_report_not_done(client, user_a, token_a):
    """Returns 400 when report status is not 'done'."""
    for bad_status in ["pending", "scraping", "analyzing", "failed"]:
        with patch("app.core.database.get_report", new_callable=AsyncMock) as mock_get_report:
            mock_get_report.return_value = {
                "id": "report-pending",
                "user_id": user_a["id"],
                "status": bad_status,
                "analysis": {},
            }

            res = client.post(
                "/api/video/meetings/start",
                json={"report_id": "report-pending"},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert res.status_code == 400
            assert "done" in res.json().get("detail", "").lower()


def test_start_meeting_tavus_error_surfaced_and_no_db_row(client, user_a, token_a):
    """
    When Tavus API fails:
    1. Tavus's actual error message is surfaced to caller.
    2. No row is inserted into public.video_calls.
    """
    mock_report = {
        "id": "report-101",
        "user_id": user_a["id"],
        "status": "done",
        "analysis": {"company_name": "Fintech Alpha"},
    }

    mock_briefing = {
        "conversational_context": "Fintech Alpha provides automated billing compliance.",
        "custom_greeting": "Hi! Excited to learn about Fintech Alpha's billing solutions.",
    }

    with (
        patch("app.core.database.get_report", new_callable=AsyncMock, return_value=mock_report),
        patch("app.routers.video_router.compile_meeting_briefing", return_value=mock_briefing),
        patch("app.core.database.create_video_call", new_callable=AsyncMock) as mock_create_call,
        patch("httpx.AsyncClient.post") as mock_tavus_post,
        patch.dict(os.environ, {"TAVUS_API_KEY": "test_tavus_key", "TAVUS_PAL_ID": "pal_123"}),
    ):
        # Mock Tavus returning 400 Bad Request with a specific error
        mock_response = MagicMock()
        mock_response.is_success = False
        mock_response.status_code = 400
        mock_response.json.return_value = {
            "error": "The specified pal_id 'pal_123' does not have an active face assigned."
        }
        mock_tavus_post.return_value = mock_response

        res = client.post(
            "/api/video/meetings/start",
            json={"report_id": "report-101"},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 400
        # Check that actual Tavus message is surfaced
        assert "pal_123" in res.json().get("detail", "")
        # CRITICAL: Verify NO row was inserted into video_calls
        mock_create_call.assert_not_called()


def test_start_meeting_success(client, user_a, token_a):
    """
    When Tavus API succeeds:
    1. Returns { video_call_id, conversation_url }.
    2. Inserts new row in public.video_calls with all required metadata.
    """
    mock_report = {
        "id": "report-200",
        "user_id": user_a["id"],
        "status": "done",
        "analysis": {"company_name": "CloudSecure Ltd"},
    }

    mock_briefing = {
        "conversational_context": "CloudSecure Ltd builds zero-trust identity verification for hospitals.",
        "custom_greeting": "Welcome! I look forward to discussing CloudSecure Ltd's zero-trust solutions.",
    }

    with (
        patch("app.core.database.get_report", new_callable=AsyncMock, return_value=mock_report),
        patch("app.routers.video_router.compile_meeting_briefing", return_value=mock_briefing),
        patch("app.core.database.create_video_call", new_callable=AsyncMock) as mock_create_call,
        patch("httpx.AsyncClient.post") as mock_tavus_post,
        patch.dict(os.environ, {
            "TAVUS_API_KEY": "test_tavus_key",
            "TAVUS_PAL_ID": "pal_cloud_456",
            "PUBLIC_WEBHOOK_URL": "",  # Empty -> callback_url omitted
        }),
    ):
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "conversation_id": "c_tavus_999",
            "conversation_url": "https://tavus.daily.co/c_tavus_999",
            "status": "active",
        }
        mock_tavus_post.return_value = mock_response

        res = client.post(
            "/api/video/meetings/start",
            json={"report_id": "report-200"},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 200
        data = res.json()
        assert "video_call_id" in data
        assert data["conversation_url"] == "https://tavus.daily.co/c_tavus_999"

        # Verify Tavus POST payload was called with persona_id, conversational_context, custom_greeting
        tavus_call_kwargs = mock_tavus_post.call_args.kwargs
        payload_sent = tavus_call_kwargs["json"]
        assert (payload_sent.get("persona_id") or payload_sent.get("pal_id")) == "pal_cloud_456"
        assert payload_sent["conversational_context"] == mock_briefing["conversational_context"]
        assert payload_sent["custom_greeting"] == mock_briefing["custom_greeting"]
        assert "callback_url" not in payload_sent  # Omitted when empty

        # Verify DB insert was called with all required fields
        mock_create_call.assert_called_once()
        inserted_row = mock_create_call.call_args.args[0]
        assert inserted_row["id"] == data["video_call_id"]
        assert inserted_row["user_id"] == user_a["id"]
        assert inserted_row["report_id"] == "report-200"
        assert inserted_row["tavus_conversation_id"] == "c_tavus_999"
        assert inserted_row["tavus_persona_id"] == "pal_cloud_456"
        assert inserted_row["status"] == "active"
        assert inserted_row["conversational_context"] == mock_briefing["conversational_context"]
        assert inserted_row["custom_greeting"] == mock_briefing["custom_greeting"]
        assert "started_at" in inserted_row


def test_callback_url_handling():
    """Validates that get_valid_callback_url properly filters placeholders."""
    # Empty
    with patch.dict(os.environ, {"PUBLIC_WEBHOOK_URL": ""}):
        assert video_router.get_valid_callback_url() is None

    # Placeholders
    for ph in [
        "https://your_ngrok_or_domain_url",
        "https://example.com",
        "https://your-domain.com",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://placeholder.com",
    ]:
        with patch.dict(os.environ, {"PUBLIC_WEBHOOK_URL": ph}):
            assert video_router.get_valid_callback_url() is None

    # Real public domain
    with patch.dict(os.environ, {"PUBLIC_WEBHOOK_URL": "https://api.vyepari.com"}):
        assert video_router.get_valid_callback_url() == "https://api.vyepari.com/webhook/tavus"

    with patch.dict(os.environ, {"PUBLIC_WEBHOOK_URL": "https://9abc-123.ngrok-free.app"}):
        assert video_router.get_valid_callback_url() == "https://9abc-123.ngrok-free.app/webhook/tavus"


# ─────────────────────────── GET /meetings/{id} Tests ──────────────────

def test_get_meeting_unauthenticated(client):
    res = client.get("/api/video/meetings/any-call-id")
    assert res.status_code == 401


def test_get_meeting_not_found(client, token_a):
    with patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=None):
        res = client.get(
            "/api/video/meetings/nonexistent-id",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 404


def test_get_meeting_forbidden_for_other_user(client, user_b, token_a):
    """Returns 404 when call exists but belongs to user B."""
    call_record = {
        "id": "call-belonging-to-b",
        "user_id": user_b["id"],
        "status": "completed",
        "transcript": [{"speaker": "Mitra", "text": "Hello"}],
        "analysis": {"lead_score": 90},
    }
    with patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=call_record):
        res = client.get(
            "/api/video/meetings/call-belonging-to-b",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 404


def test_get_meeting_success(client, user_a, token_a):
    call_record = {
        "id": "call-123",
        "user_id": user_a["id"],
        "report_id": "rep-456",
        "status": "active",
        "conversation_url": "https://tavus.daily.co/xyz",
        "transcript": [{"speaker": "Mitra", "text": "Welcome to Vyepari X!"}],
        "analysis": {"sentiment": "positive"},
        "started_at": "2026-09-12T10:00:00Z",
    }
    with patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=call_record):
        res = client.get(
            "/api/video/meetings/call-123",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == "call-123"
        assert data["status"] == "active"
        assert len(data["transcript"]) == 1



# ─────────────────────────── POST /meetings/{id}/end Tests ───────────────────

def test_end_meeting_unauthenticated(client):
    res = client.post("/api/video/meetings/call-123/end")
    assert res.status_code == 401


def test_end_meeting_not_found(client, token_a):
    with patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=None):
        res = client.post(
            "/api/video/meetings/non-existent-call/end",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 404
        assert "not found" in res.json().get("detail", "").lower()


def test_end_meeting_forbidden_for_other_user(client, user_b, token_a):
    call_record = {
        "id": "call-belonging-to-b",
        "user_id": user_b["id"],
        "status": "active",
    }
    with patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=call_record):
        res = client.post(
            "/api/video/meetings/call-belonging-to-b/end",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 404
        assert "not found" in res.json().get("detail", "").lower()


def test_end_meeting_already_ended(client, user_a, token_a):
    call_record = {
        "id": "call-already-ended",
        "user_id": user_a["id"],
        "status": "ended",
        "ended_at": "2026-09-12T12:00:00Z",
    }
    with patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=call_record):
        res = client.post(
            "/api/video/meetings/call-already-ended/end",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 400
        assert "already ended" in res.json().get("detail", "").lower()


def test_end_meeting_success(client, user_a, token_a):
    call_record = {
        "id": "call-active-1",
        "user_id": user_a["id"],
        "status": "active",
        "tavus_conversation_id": "conv-tavus-123",
        "ended_at": None,
    }
    with (
        patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=call_record),
        patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update,
        patch("httpx.AsyncClient.post") as mock_tavus_post,
        patch.dict(os.environ, {"TAVUS_API_KEY": "test-tavus-key"}),
    ):
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_tavus_post.return_value = mock_response

        res = client.post(
            "/api/video/meetings/call-active-1/end",
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["id"] == "call-active-1"
        assert data["status"] == "ended"
        assert data["ended_at"] is not None

        # Verify Tavus API call
        mock_tavus_post.assert_called_once_with(
            "https://tavusapi.com/v2/conversations/conv-tavus-123/end",
            headers={"x-api-key": "test-tavus-key"},
        )

        # Verify DB update
        mock_update.assert_called_once()
        update_args = mock_update.call_args[0]
        assert update_args[0] == "call-active-1"
        assert update_args[1]["status"] == "ended"
        assert update_args[1]["ended_at"] == data["ended_at"]


def test_end_meeting_tavus_failure_is_non_fatal(client, user_a, token_a):
    """If Tavus returns an error or exception, endpoint logs warning and still ends the call locally."""
    call_record = {
        "id": "call-active-2",
        "user_id": user_a["id"],
        "status": "active",
        "tavus_conversation_id": "conv-tavus-err",
        "ended_at": None,
    }
    with (
        patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=call_record),
        patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update,
        patch("httpx.AsyncClient.post", side_effect=Exception("Connection timeout to Tavus")),
        patch.dict(os.environ, {"TAVUS_API_KEY": "test-tavus-key"}),
    ):
        res = client.post(
            "/api/video/meetings/call-active-2/end",
            headers={"Authorization": f"Bearer {token_a}"},
        )

        # Non-fatal: still returns 200 and marks status as ended
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["status"] == "ended"
        mock_update.assert_called_once()
        assert mock_update.call_args[0][1]["status"] == "ended"


def test_end_meeting_preserves_existing_ended_at(client, user_a, token_a):
    """If ended_at is already populated (e.g. by a webhook event), it should not be overwritten."""
    existing_timestamp = "2026-09-13T15:30:00Z"
    call_record = {
        "id": "call-active-3",
        "user_id": user_a["id"],
        "status": "analyzing",
        "tavus_conversation_id": "conv-tavus-3",
        "ended_at": existing_timestamp,
    }
    with (
        patch("app.core.database.get_video_call", new_callable=AsyncMock, return_value=call_record),
        patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update,
        patch("httpx.AsyncClient.post") as mock_tavus_post,
        patch.dict(os.environ, {"TAVUS_API_KEY": "test-tavus-key"}),
    ):
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_tavus_post.return_value = mock_response

        res = client.post(
            "/api/video/meetings/call-active-3/end",
            headers={"Authorization": f"Bearer {token_a}"},
        )

        assert res.status_code == 200
        data = res.json()
        assert data["ended_at"] == existing_timestamp

        # Verify ended_at was NOT included in updates payload
        mock_update.assert_called_once()
        updates = mock_update.call_args[0][1]
        assert updates == {"status": "ended"}
        assert "ended_at" not in updates


# ─────────────────────────── GET /meetings Tests ───────────────────────

def test_list_meetings_unauthenticated(client):
    res = client.get("/api/video/meetings")
    assert res.status_code == 401


def test_list_meetings_scoped_to_user(client, user_a, token_a):
    user_calls = [
        {"id": "c-2", "user_id": user_a["id"], "status": "active", "created_at": "2026-09-12T12:00:00Z"},
        {"id": "c-1", "user_id": user_a["id"], "status": "ended", "created_at": "2026-09-12T11:00:00Z"},
    ]
    with patch("app.core.database.list_video_calls", new_callable=AsyncMock, return_value=user_calls) as mock_list:
        res = client.get(
            "/api/video/meetings",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2
        assert data[0]["id"] == "c-2"
        mock_list.assert_called_once_with(user_id=user_a["id"], limit=100)


# ─────────────────────────── Integration with main.app ──────────────────

def test_main_app_video_routes():
    """Verify video router is properly mounted in main.py under /api/video and root /webhook/tavus."""
    from app.main import app
    main_client = TestClient(app)

    # Calling endpoints via main app without auth should hit video_router and return 401
    res_list = main_client.get("/api/video/meetings")
    assert res_list.status_code == 401

    res_detail = main_client.get("/api/video/meetings/any-id")
    assert res_detail.status_code == 401

    res_start = main_client.post("/api/video/meetings/start", json={"report_id": "rep-test"})
    assert res_start.status_code == 401

    # Root /webhook/tavus should be accessible without authentication
    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=None):
        res_root_webhook = main_client.post(
            "/webhook/tavus",
            json={"conversation_id": "root-tavus-conv-1", "event_type": "system.pal_joined"},
        )
        assert res_root_webhook.status_code == 200
        assert res_root_webhook.json()["status"] == "untracked"


# ─────────────────────────── Tavus Webhook Tests ───────────────────────

def test_tavus_webhook_missing_conversation_id(client):
    """Webhook ignores payloads missing conversation_id."""
    res = client.post("/api/video/webhook/tavus", json={"event_type": "system.pal_joined"})
    assert res.status_code == 200
    assert res.json()["status"] == "ignored"


def test_tavus_webhook_untracked_conversation_id(client):
    """Returns 200 with 'untracked' when conversation is not found in database."""
    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=None):
        res = client.post(
            "/api/video/webhook/tavus",
            json={
                "conversation_id": "untracked-conv-999",
                "event_type": "system.pal_joined",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "untracked"
        assert data["conversation_id"] == "untracked-conv-999"


def test_tavus_webhook_pal_joined(client):
    """Updates status to active on system.pal_joined if call has not ended."""
    mock_call = {
        "id": "call-1",
        "tavus_conversation_id": "conv-1",
        "status": "queued",
        "transcript": [],
        "analysis": None,
    }
    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=mock_call), \
         patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update:
        res = client.post(
            "/api/video/webhook/tavus",
            json={
                "conversation_id": "conv-1",
                "event_type": "system.pal_joined",
            },
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
        mock_update.assert_called_once_with("call-1", {"status": "active"})


def test_tavus_webhook_transcription_ready_and_groq_analysis(client):
    """
    Normalizes transcript turns into {speaker, message, timestamp}, sets status to ended,
    and executes Groq post-call review in background, updating public.video_calls.
    """
    mock_call = {
        "id": "call-2",
        "tavus_conversation_id": "conv-2",
        "status": "active",
        "customer_name": "Acme Buyer",
        "business_name": "Vyepari CRM",
        "call_reason": "AI Video Sales Consultation",
        "transcript": [],
        "analysis": None,
    }
    mock_analysis_result = {
        "summary": "Buyer interested in 50 seats.",
        "call_outcome": "Meeting Booked",
        "sentiment": "positive",
        "intent_score": 88,
        "lead_temperature": "Hot",
        "key_points_discussed": ["50 seats", "Annual contract"],
        "customer_concerns": [],
        "action_items": ["Send contract proposal"],
        "agent_performance_review": "Excellent rapport and handled pricing objection.",
    }

    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=mock_call), \
         patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update, \
         patch("app.services.voice_engine.analyze_call_with_groq", return_value=mock_analysis_result) as mock_groq:

        res = client.post(
            "/api/video/webhook/tavus",
            json={
                "conversation_id": "conv-2",
                "event_type": "application.transcription_ready",
                "properties": {
                    "transcript": [
                        {"role": "assistant", "content": "Hello! Welcome to Vyepari.", "seconds_from_start": 2.2},
                        {"role": "user", "content": "Hi, I need 50 seats for my team.", "seconds_from_start": 7.5},
                    ],
                    "duration": 60,
                },
            },
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        # Verify initial database update with transcript & status (synchronous 'analyzing' marker)
        assert mock_update.call_count >= 1
        first_call_args = mock_update.call_args_list[0]
        assert first_call_args[0][0] == "call-2"
        updates = first_call_args[0][1]
        assert updates["status"] == "analyzing"
        assert "ended_at" in updates
        assert updates["duration_seconds"] == 60
        assert updates["transcript"] == [
            {"speaker": "agent", "message": "Hello! Welcome to Vyepari.", "timestamp": "00:02"},
            {"speaker": "customer", "message": "Hi, I need 50 seats for my team.", "timestamp": "00:07"},
        ]

        # Verify background Groq post-call review was triggered
        mock_groq.assert_called_once()
        assert mock_groq.call_args[1]["business_name"] == "Vyepari CRM"
        assert mock_groq.call_args[1]["customer_name"] == "Acme Buyer"
        assert mock_groq.call_args[1]["direction"] == "video"
        assert len(mock_groq.call_args[1]["transcript"]) == 2

        # Verify analysis was saved back to video_calls and status updated to ended
        assert mock_update.call_count == 2
        analysis_call_args = mock_update.call_args_list[1]
        assert analysis_call_args[0][0] == "call-2"
        assert analysis_call_args[0][1] == {"analysis": mock_analysis_result, "status": "ended"}


def test_tavus_webhook_recording_ready(client):
    """Updates recording_url and duration_seconds from application.recording_ready."""
    mock_call = {
        "id": "call-3",
        "tavus_conversation_id": "conv-3",
        "status": "ended",
        "recording_url": None,
        "duration_seconds": 0,
    }
    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=mock_call), \
         patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update:
        res = client.post(
            "/api/video/webhook/tavus",
            json={
                "conversation_id": "conv-3",
                "event_type": "application.recording_ready",
                "properties": {
                    "storage_uri": "s3://recordings-bucket/meetings/rec_123.mp4",
                    "duration": 75,
                },
            },
        )
        assert res.status_code == 200
        mock_update.assert_called_once_with(
            "call-3",
            {
                "recording_url": "s3://recordings-bucket/meetings/rec_123.mp4",
                "duration_seconds": 75,
            },
        )


def test_tavus_webhook_system_shutdown(client):
    """Updates status to analyzing then ended on system.shutdown and triggers analysis if transcript exists."""
    mock_call = {
        "id": "call-4",
        "tavus_conversation_id": "conv-4",
        "status": "active",
        "customer_name": "Prospect D",
        "business_name": "Enterprise",
        "call_reason": "Demo",
        "transcript": [{"speaker": "agent", "message": "Hi", "timestamp": "00:01"}],
        "analysis": None,
    }
    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=mock_call), \
         patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update, \
         patch("app.services.voice_engine.analyze_call_with_groq", return_value={"summary": "Demo summary"}) as mock_groq:
        res = client.post(
            "/api/video/webhook/tavus",
            json={
                "conversation_id": "conv-4",
                "event_type": "system.shutdown",
                "properties": {
                    "shutdown_reason": "participant_left_timeout",
                },
            },
        )
        assert res.status_code == 200
        mock_groq.assert_called_once()
        first_call = mock_update.call_args_list[0]
        assert first_call[0][1]["status"] == "analyzing"
        second_call = mock_update.call_args_list[1]
        assert second_call[0][1]["status"] == "ended"
        assert second_call[0][1]["analysis"] == {"summary": "Demo summary"}


def test_tavus_webhook_idempotency_skip_duplicate_analysis(client):
    """
    If call is already ended and has analysis, receiving duplicate
    application.transcription_ready does not re-trigger Groq analysis or duplicate transcript.
    """
    mock_call = {
        "id": "call-5",
        "tavus_conversation_id": "conv-5",
        "status": "ended",
        "transcript": [
            {"speaker": "agent", "message": "Hello!", "timestamp": "00:01"}
        ],
        "analysis": {"summary": "Already analyzed"},
    }
    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=mock_call), \
         patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update, \
         patch("app.services.voice_engine.analyze_call_with_groq") as mock_groq:
        res = client.post(
            "/api/video/webhook/tavus",
            json={
                "conversation_id": "conv-5",
                "event_type": "application.transcription_ready",
                "properties": {
                    "transcript": [
                        {"role": "assistant", "content": "Hello!", "seconds_from_start": 1.0}
                    ]
                },
            },
        )
        assert res.status_code == 200
        # Should NOT call Groq analysis again!
        mock_groq.assert_not_called()
        # Merged transcript does not duplicate the turn
        if mock_update.called:
            updates = mock_update.call_args[0][1]
            if "transcript" in updates:
                assert len(updates["transcript"]) == 1


def test_tavus_webhook_shutdown_after_transcription_ready_no_duplicate_analysis(client):
    """
    If application.transcription_ready arrives first and sets status='ended' and saves transcript,
    a subsequent system.shutdown arriving does NOT re-trigger Groq analysis.
    """
    mock_call_already_ended = {
        "id": "call-6",
        "tavus_conversation_id": "conv-6",
        "status": "ended",  # Already set by transcription_ready
        "ended_at": "2026-09-12T12:00:00Z",
        "transcript": [{"speaker": "agent", "message": "Hi", "timestamp": "00:01"}],
        "analysis": None,  # Analysis might still be in progress or just finished
    }
    with patch("app.core.database.get_video_call_by_tavus_id", new_callable=AsyncMock, return_value=mock_call_already_ended), \
         patch("app.core.database.update_video_call", new_callable=AsyncMock) as mock_update, \
         patch("app.services.voice_engine.analyze_call_with_groq") as mock_groq:
        res = client.post(
            "/api/video/webhook/tavus",
            json={
                "conversation_id": "conv-6",
                "event_type": "system.shutdown",
                "properties": {
                    "shutdown_reason": "end_conversation_endpoint_hit",
                },
            },
        )
        assert res.status_code == 200
        # Analysis must NOT be triggered again
        mock_groq.assert_not_called()
        # No updates needed since call is already ended
        mock_update.assert_not_called()


def test_tavus_webhook_rapid_transcription_ready_retries_only_analyzes_once(client):
    """
    Simulates two rapid application.transcription_ready webhook deliveries for the same conversation_id.
    Asserts that analyze_call_with_groq is only ever triggered once, because the first delivery
    synchronously marks the status as 'analyzing' in the DB before dispatching the background task.
    """
    # Mutable state simulating the DB row for conv-rapid
    call_state = {
        "id": "call-rapid-1",
        "tavus_conversation_id": "conv-rapid-1",
        "status": "active",
        "customer_name": "Rapid Lead",
        "business_name": "Vyepari CRM",
        "call_reason": "AI Sales Consultation",
        "transcript": [],
        "analysis": None,
    }

    async def mock_get(conv_id):
        if conv_id == "conv-rapid-1":
            return dict(call_state)
        return None

    async def mock_update(cid, updates):
        call_state.update(updates)

    mock_analysis_result = {"summary": "Rapid call", "intent_score": 90}
    captured_statuses_during_groq = []

    payload = {
        "conversation_id": "conv-rapid-1",
        "event_type": "application.transcription_ready",
        "properties": {
            "transcript": [
                {"role": "assistant", "content": "Welcome!", "seconds_from_start": 1.0},
                {"role": "user", "content": "I want to buy.", "seconds_from_start": 3.0},
            ],
            "duration": 30,
        },
    }

    def mock_groq_side_effect(*args, **kwargs):
        # Capture status at the moment Groq analysis executes
        captured_statuses_during_groq.append(call_state["status"])
        # Simulate rapid retry delivery arriving while analysis is in progress!
        res_retry = client.post("/api/video/webhook/tavus", json=payload)
        assert res_retry.status_code == 200
        return mock_analysis_result

    with patch("app.core.database.get_video_call_by_tavus_id", side_effect=mock_get), \
         patch("app.core.database.update_video_call", side_effect=mock_update), \
         patch("app.services.voice_engine.analyze_call_with_groq", side_effect=mock_groq_side_effect) as mock_groq:

        # Rapid Delivery 1: arrives when status is active
        res1 = client.post("/api/video/webhook/tavus", json=payload)
        assert res1.status_code == 200

        # Verify that during Groq execution, the DB row status was synchronously 'analyzing'
        assert captured_statuses_during_groq == ["analyzing"]

        # Verify that the final status transitioned to 'ended' after analysis completed
        assert call_state["status"] == "ended"
        assert call_state["analysis"] == mock_analysis_result

        # Assert Groq analysis was triggered ONLY ONCE across both rapid deliveries!
        assert mock_groq.call_count == 1

        # Delivery 3: arrives after analysis has completed
        res3 = client.post("/api/video/webhook/tavus", json=payload)
        assert res3.status_code == 200

        # Still only 1 analysis call!
        assert mock_groq.call_count == 1




