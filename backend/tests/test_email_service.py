"""
test_email_service.py — Unit tests for VyaperiX Email Notification & Dispatch Engine.
"""

import asyncio
import pytest
from app.services import email_service
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_smtp_config():
    """Verify SMTP config retrieval and default fallback."""
    config = email_service.get_smtp_config()
    assert "host" in config
    assert "port" in config
    assert "is_configured" in config
    assert "mock_mode" in config
    assert isinstance(config["port"], int)


@pytest.mark.asyncio
async def test_send_greeting_email():
    """Verify welcome greeting email dispatch and HTML generation."""
    res = await email_service.send_greeting_email(
        to_email="testuser@example.com",
        user_name="Alex Mercer",
        company_name="Acme Corp",
    )
    assert res is not None
    assert res.get("status") in ("mocked", "sent")
    assert res.get("to") == "testuser@example.com"
    assert "Alex Mercer" in res.get("subject", "") or "Welcome" in res.get("subject", "")


@pytest.mark.asyncio
async def test_send_meeting_email_to_owner_and_participants():
    """
    Verify meeting email dispatch explicitly notifies the workspace owner
    with the exact meeting date, time, and live room link.
    """
    meeting_link = "https://meet.jit.si/VyaperiX-Test-Room"
    meeting_time = "2026-09-25 14:00 UTC"
    res = await email_service.send_meeting_email(
        owner_email="founder_owner@vyaperix.ai",
        rep_email="salesrep@vyaperix.ai",
        prospect_email="prospect@client.org",
        lead_name="Sarah Connor",
        meeting_time=meeting_time,
        meeting_link=meeting_link,
        title="Enterprise AI Sales Fleet Demo",
        agenda="Review multimodal scraping and voice agents",
        customer_phone="+1234567890",
        send_to_prospect=True,
    )

    assert res is not None

    # Verify Owner Notification
    assert "owner" in res
    assert res["owner"]["status"] in ("mocked", "sent")
    assert res["owner"]["to"] == "founder_owner@vyaperix.ai"
    assert meeting_time in res["owner"]["subject"]
    assert "Sarah Connor" in res["owner"]["subject"]

    # Verify Rep Notification
    assert "rep" in res
    assert res["rep"]["status"] in ("mocked", "sent")
    assert res["rep"]["to"] == "salesrep@vyaperix.ai"

    # Verify Prospect Notification
    assert "prospect" in res
    assert res["prospect"]["status"] in ("mocked", "sent")
    assert res["prospect"]["to"] == "prospect@client.org"


def test_api_email_status():
    """Verify GET /api/email/status returns valid state."""
    response = client.get("/api/email/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert "mock_mode" in data
    assert "is_configured" in data


def test_api_send_greeting():
    """Verify POST /api/email/send-greeting."""
    payload = {
        "email": "developer@vyaperix.ai",
        "name": "Jordan Dev",
        "company": "Vyaperi Labs",
    }
    response = client.post("/api/email/send-greeting", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["recipient"] == "developer@vyaperix.ai"


def test_api_send_meeting_notifies_owner():
    """Verify POST /api/email/send-meeting notifies owner with date and time."""
    payload = {
        "lead_name": "Tony Stark",
        "meeting_time": "2026-09-28 10:00 AM EST",
        "meeting_link": "https://meet.jit.si/VyaperiX-Live-Demo",
        "title": "Quantum AI Automation Briefing",
        "owner_email": "chief_executive@starkcorp.com",
        "rep_email": "sales_agent@starkcorp.com",
        "customer_email": "stark@avengers.org",
        "send_to_prospect": True,
    }
    response = client.post("/api/email/send-meeting", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["owner_email"] == "chief_executive@starkcorp.com"
    assert data["results"]["owner"]["status"] in ("mocked", "sent")
    assert "2026-09-28 10:00 AM EST" in data["results"]["owner"]["subject"]
