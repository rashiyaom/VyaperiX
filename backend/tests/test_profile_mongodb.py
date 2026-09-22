"""
test_profile_mongodb.py — Verification tests for MongoDB-backed user profile and onboarding data.
"""

import pytest
from httpx import AsyncClient, ASGITransport
import jwt

from app.main import app
from app.core import database as db
from app.core.auth_middleware import SUPABASE_JWT_SECRET


def create_test_token(user_id: str, email: str = "testuser@vyepari.ai") -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": "authenticated",
        "user_metadata": {
            "full_name": "Test Founder",
            "company_name": "Test Dynamics Pvt Ltd",
            "industry": "SaaS / Technology",
            "onboarding_completed": False,
        }
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")


@pytest.mark.asyncio
async def test_get_profile_auto_initialization():
    user_id = "test-user-uuid-101"
    token = create_test_token(user_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == user_id
        assert data["email"] == "testuser@vyepari.ai"
        assert data["company_name"] == "Test Dynamics Pvt Ltd"


@pytest.mark.asyncio
async def test_update_profile_and_complete_onboarding():
    user_id = "test-user-uuid-102"
    token = create_test_token(user_id, email="founder@alpha.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Update profile
        update_payload = {
            "company_name": "Alpha Global Inc",
            "industry": "Financial Services",
            "team_size": "11–50",
            "onboarding_completed": True,
        }
        put_res = await ac.put(
            "/api/profile",
            headers={"Authorization": f"Bearer {token}"},
            json=update_payload,
        )
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["company_name"] == "Alpha Global Inc"
        assert updated["industry"] == "Financial Services"
        assert updated["onboarding_completed"] is True
        assert updated["team_size"] == "11–50"

        # Verify profile persists in MongoDB retrieval
        get_res = await ac.get(f"/api/profile/{user_id}")
        assert get_res.status_code == 200
        persisted = get_res.json()
        assert persisted["company_name"] == "Alpha Global Inc"
        assert persisted["team_size"] == "11–50"


@pytest.mark.asyncio
async def test_auth_me_returns_mongodb_profile():
    user_id = "test-user-uuid-103"
    token = create_test_token(user_id, email="lead@omega.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == user_id
        assert data["profile"]["id"] == user_id
