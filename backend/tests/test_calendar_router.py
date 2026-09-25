"""
test_calendar_router.py — Tests for Calendar, Google Meet & Reminders API.
"""

import asyncio
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core import database as db
from app.services import calendar_service


@pytest.fixture(autouse=True)
def reset_in_memory_calendar():
    """Clear in-memory calendar events between tests."""
    db._in_memory_calendar_events.clear()
    yield
    db._in_memory_calendar_events.clear()


@pytest.mark.asyncio
async def test_create_and_get_calendar_event():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "customer_name": "Vikram Patel",
            "customer_phone": "+919876543210",
            "customer_email": "vikram@patelenterprises.in",
            "company_name": "Patel Enterprises",
            "title": "Vyepari X AI Sales Demo",
            "description": "Review multilingual voice fleet capabilities in Hindi and Gujarati",
            "start_time": "2026-09-25T11:00:00+05:30",
            "end_time": "2026-09-25T11:30:00+05:30",
            "meeting_type": "google_meet",
            "reminder_minutes": 15,
            "remind_via": "popup",
        }
        res = await ac.post("/api/calendar/events", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["message"] == "Meeting scheduled successfully"
        event = data["event"]
        assert event["customer_name"] == "Vikram Patel"
        assert event["status"] == "scheduled"
        assert ("meet.google.com" in event["meet_url"] or "meet.jit.si" in event["meet_url"])
        event_id = event["id"]

        # Retrieve single event
        get_res = await ac.get(f"/api/calendar/events/{event_id}")
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["event"]["id"] == event_id
        assert get_data["event"]["customer_email"] == "vikram@patelenterprises.in"


@pytest.mark.asyncio
async def test_list_and_filter_by_customer_name_and_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create 2 events with different customer names
        await ac.post("/api/calendar/events", json={
            "customer_name": "Aarav Sharma",
            "title": "Intro Call with Aarav",
            "start_time": "2026-09-25T10:00:00+05:30",
            "end_time": "2026-09-25T10:30:00+05:30",
            "meeting_type": "phone_call",
            "reminder_minutes": 10,
        })
        await ac.post("/api/calendar/events", json={
            "customer_name": "Sunita Rao",
            "title": "Product Walkthrough with Sunita",
            "start_time": "2026-09-26T14:00:00+05:30",
            "end_time": "2026-09-26T14:45:00+05:30",
            "meeting_type": "google_meet",
            "reminder_minutes": 30,
        })

        # List all
        all_res = await ac.get("/api/calendar/events")
        assert all_res.status_code == 200
        assert all_res.json()["total"] == 2

        # Filter by customer_name = "Sunita"
        filter_res = await ac.get("/api/calendar/events", params={"customer_name": "Sunita"})
        assert filter_res.status_code == 200
        assert filter_res.json()["total"] == 1
        assert filter_res.json()["events"][0]["customer_name"] == "Sunita Rao"

        # Filter by customer_name = "Aarav"
        filter_res2 = await ac.get("/api/calendar/events", params={"customer_name": "Aarav"})
        assert filter_res2.status_code == 200
        assert filter_res2.json()["total"] == 1
        assert filter_res2.json()["events"][0]["meeting_type"] == "phone_call"


@pytest.mark.asyncio
async def test_mark_meeting_done_and_delete():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create event
        create_res = await ac.post("/api/calendar/events", json={
            "customer_name": "Kavita Reddy",
            "title": "Closing Call with Kavita",
            "start_time": "2026-09-24T16:00:00+05:30",
            "end_time": "2026-09-24T16:30:00+05:30",
            "meeting_type": "google_meet",
            "reminder_minutes": 15,
        })
        event_id = create_res.json()["event"]["id"]

        # Mark Done (status -> 'completed')
        patch_res = await ac.patch(f"/api/calendar/events/{event_id}", json={
            "status": "completed",
            "reminder_minutes": 0,
        })
        assert patch_res.status_code == 200
        updated = patch_res.json()["event"]
        assert updated["status"] == "completed"

        # Verify in list filter status=completed
        list_completed = await ac.get("/api/calendar/events", params={"status": "completed"})
        assert list_completed.status_code == 200
        assert list_completed.json()["total"] == 1

        # Delete event
        del_res = await ac.delete(f"/api/calendar/events/{event_id}")
        assert del_res.status_code == 200

        # Verify not found
        get_deleted = await ac.get(f"/api/calendar/events/{event_id}")
        assert get_deleted.status_code == 404


@pytest.mark.asyncio
async def test_google_meet_url_generation():
    url = calendar_service.generate_google_meet_url()
    assert url.startswith("https://meet.jit.si/") or url.startswith("https://meet.google.com/")
