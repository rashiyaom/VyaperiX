"""
profile_router.py — FastAPI Router for User Profile & Onboarding in MongoDB.

Provides endpoints for:
- GET  /api/profile         — Get current authenticated user profile from MongoDB
- PUT  /api/profile         — Update current user profile / onboarding data in MongoDB
- POST /api/profile         — Upsert user profile in MongoDB
- GET  /api/profile/{user_id} — Get profile by ID
"""

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict

from app.core import auth_middleware
from app.core import database as db
from app.services import email_service

logger = logging.getLogger(__name__)

router = APIRouter()


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    full_name: Optional[str] = None
    company_name: Optional[str] = None
    industry: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    team_size: Optional[str] = None
    use_case: Optional[str] = None
    source: Optional[str] = None
    phone: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


async def _resolve_user(authorization: Optional[str], user_id: Optional[str] = None):
    """Helper to resolve user from Bearer token or optional user_id fallback."""
    if authorization:
        try:
            auth_user = await auth_middleware.get_current_user(authorization)
            if auth_user and auth_user.id:
                return auth_user
        except Exception as e:
            logger.debug(f"Auth token decode note: {e}")
    if user_id:
        return auth_middleware.AuthUser(id=user_id, email=None)
    return None


@router.get("", summary="Get user profile from MongoDB")
@router.get("/", summary="Get user profile from MongoDB")
async def get_profile(
    authorization: Optional[str] = Header(None),
    user_id: Optional[str] = Query(None),
):
    """
    Fetch the user profile directly from MongoDB.
    If the user has just registered with Supabase and doesn't have a MongoDB document yet,
    initializes their profile document from Supabase metadata.
    """
    auth_user = await _resolve_user(authorization, user_id)
    if not auth_user or not auth_user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
        )

    profile = await db.get_profile(auth_user.id)
    if not profile and auth_user.email:
        profile = await db.get_profile_by_email(auth_user.email)

    if not profile:
        # Initialize default profile in MongoDB
        meta = auth_user.user_metadata or {}
        default_profile = {
            "id": auth_user.id,
            "email": auth_user.email or "",
            "full_name": meta.get("full_name") or meta.get("name") or "",
            "company_name": meta.get("company_name") or meta.get("company") or "",
            "industry": meta.get("industry") or "SaaS / Technology",
            "avatar_url": meta.get("avatar_url") or meta.get("picture") or "",
            "role": "owner",
            "onboarding_completed": bool(meta.get("onboarding_completed", False)),
            "greeting_email_sent": False,
        }
        profile = await db.upsert_profile(auth_user.id, default_profile)

    # If greeting email has not yet been sent to this user's registered email, trigger it
    if profile and not profile.get("greeting_email_sent"):
        target_email = profile.get("email") or auth_user.email
        if target_email:
            try:
                asyncio.create_task(
                    email_service.send_greeting_email(
                        to_email=target_email,
                        user_name=profile.get("full_name"),
                        company_name=profile.get("company_name"),
                    )
                )
                await db.update_profile(auth_user.id, {
                    "greeting_email_sent": True,
                    "greeting_email_sent_at": datetime.now(timezone.utc).isoformat(),
                })
                profile["greeting_email_sent"] = True
            except Exception as greet_err:
                logger.debug(f"Could not auto-dispatch greeting email in get_profile: {greet_err}")

    return profile


@router.put("", summary="Update user profile in MongoDB")
@router.put("/", summary="Update user profile in MongoDB")
@router.post("", summary="Upsert user profile in MongoDB")
@router.post("/", summary="Upsert user profile in MongoDB")
async def update_profile(
    payload: ProfileUpdateRequest,
    authorization: Optional[str] = Header(None),
    user_id: Optional[str] = Query(None),
):
    """
    Update or upsert user profile, workspace settings, and onboarding status into MongoDB.
    """
    auth_user = await _resolve_user(authorization, user_id)
    if not auth_user or not auth_user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
        )

    # Filter out None values to avoid overwriting existing data with null
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if auth_user.email and "email" not in updates:
        updates["email"] = auth_user.email

    saved = await db.upsert_profile(auth_user.id, updates)
    return saved


@router.get("/{target_user_id}", summary="Get user profile by user ID from MongoDB")
async def get_profile_by_id(target_user_id: str):
    """Fetch user profile by user UUID from MongoDB."""
    profile = await db.get_profile(target_user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile
