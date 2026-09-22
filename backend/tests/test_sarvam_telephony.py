"""
test_sarvam_telephony.py — Automated Unit Tests for Sarvam AI + Exotel Telephony Integration.
"""

import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from app.services.sarvam_service import (
    format_e164_phone_number,
    build_initial_bot_message,
    dispatch_sarvam_outbound_call,
)
from app.services import voice_engine
from app.main import app


def test_format_e164_phone_number():
    # 10 digit Indian number
    assert format_e164_phone_number("7016992454") == "+917016992454"
    # 10 digit Indian number with spaces and dashes
    assert format_e164_phone_number("  701-699-2454  ") == "+917016992454"
    # 12 digit Indian number without plus
    assert format_e164_phone_number("917016992454") == "+917016992454"
    # Number already with plus
    assert format_e164_phone_number("+917016992454") == "+917016992454"
    assert format_e164_phone_number("+14155552671") == "+14155552671"


def test_build_initial_bot_message():
    # Hindi
    msg_hi = build_initial_bot_message(
        business_name="Acme Corp",
        customer_name="Rohan",
        call_reason="Cloud ERP demo",
        language="Hindi",
    )
    assert "नमस्ते Rohan" in msg_hi
    assert "Acme Corp" in msg_hi
    assert "Cloud ERP demo" in msg_hi

    # Gujarati
    msg_gu = build_initial_bot_message(
        business_name="Vyepari",
        customer_name="Amit",
        call_reason="Inventory sync",
        language="Gujarati",
    )
    assert "નમસ્તે Amit" in msg_gu
    assert "Vyepari" in msg_gu
    assert "Inventory sync" in msg_gu

    # English
    msg_en = build_initial_bot_message(
        business_name="SalesAI",
        customer_name="Sarah",
        call_reason="Quarterly Review",
        language="English",
    )
    assert "Hello Sarah" in msg_en
    assert "SalesAI" in msg_en
    assert "Quarterly Review" in msg_en


@pytest.mark.asyncio
async def test_dispatch_sarvam_outbound_call_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b'{"data": {"call_id": "sarvam-call-12345"}}'
    mock_resp.json.return_value = {"data": {"call_id": "sarvam-call-12345"}}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        result = await dispatch_sarvam_outbound_call(
            call_id="call-uuid-001",
            customer_phone="9820012345",
            customer_name="Priya Patel",
            business_name="Vyepari CRM",
            call_reason="Enterprise License",
            language="Hindi",
            api_key="mock-api-key",
        )

        assert result["success"] is True
        assert result["call_sid"] == "sarvam-call-12345"

        # Verify payload sent to Sarvam
        args, kwargs = mock_post.call_args
        payload = kwargs.get("json", {})
        expected_conn = os.getenv("SARVAM_CONNECTION_ID", "VepariX-252a795f-a3f9")
        expected_phone = os.getenv("SARVAM_AGENT_PHONE_NUMBER", "+917948228458")
        assert payload["app_config"]["connection_config"]["connection_id"] == expected_conn
        assert payload["app_config"]["connection_config"]["agent_phone_number"] == expected_phone
        assert payload["webhook_config"]["metadata"]["lead_id"] == "call-uuid-001"
        assert kwargs["headers"]["X-API-Key"] == "mock-api-key"


@pytest.mark.asyncio
async def test_handle_sarvam_webhook():
    fake_call = {
        "id": "lead-100",
        "customer_name": "Rajesh Kumar",
        "business_name": "Vyepari CRM",
        "call_reason": "Pricing Discussion",
        "direction": "outbound",
        "status": "in-progress",
        "transcript": [],
        "analysis": None,
    }

    mock_payload = {
        "metadata": {"lead_id": "lead-100"},
        "status": "completed",
        "duration_seconds": 48,
        "interaction_transcript": [
            {
                "role": "agent",
                "en_text": "Hello Rajesh, this is Vyepari CRM.",
                "indic_text": "नमस्ते राजेश, मैं व्यापारी सीआरएम से बात कर रहा हूँ।",
            },
            {
                "role": "user",
                "en_text": "Yes, tell me about your pricing.",
                "indic_text": "हाँ, मुझे अपनी कीमतों के बारे में बताएं।",
            },
        ],
    }

    with patch("app.core.database.get_voice_call", new_callable=AsyncMock) as mock_get_call, \
         patch("app.core.database.update_voice_call", new_callable=AsyncMock) as mock_update_call, \
         patch("app.services.voice_engine.analyze_call_with_groq") as mock_analyze:

        mock_get_call.return_value = fake_call
        mock_analyze.return_value = {
            "summary": "Customer inquired about pricing.",
            "sentiment": "positive",
            "intent_score": 80,
            "lead_temperature": "Hot",
        }

        res = await voice_engine.handle_sarvam_webhook(mock_payload)

        assert res["status"] == "success"
        assert res["call_id"] == "lead-100"
        assert res["call_status"] == "completed"

        # Verify update call arguments
        mock_update_call.assert_called_once()
        update_args = mock_update_call.call_args[0][1]
        assert update_args["status"] == "completed"
        assert update_args["duration_seconds"] == 48
        assert len(update_args["transcript"]) == 2
        assert update_args["transcript"][0]["speaker"] == "agent"
        assert "नमस्ते राजेश" in update_args["transcript"][0]["message"]
        assert update_args["transcript"][1]["speaker"] == "customer"
        assert "कीमतों के बारे में" in update_args["transcript"][1]["message"]


def test_routes_registered_in_app():
    client = TestClient(app)

    # Test GET /api/calls compatibility route
    with patch("app.core.database.list_voice_calls", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [
            {"id": "call-1", "customer_name": "Test User", "status": "completed"}
        ]
        resp = client.get("/api/calls")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    # Test POST /sarvam/webhook endpoint
    with patch("app.services.voice_engine.handle_sarvam_webhook", new_callable=AsyncMock) as mock_handler:
        mock_handler.return_value = {"status": "success", "call_id": "test-call"}
        resp = client.post("/sarvam/webhook", json={"metadata": {"lead_id": "test-call"}, "status": "completed"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"
