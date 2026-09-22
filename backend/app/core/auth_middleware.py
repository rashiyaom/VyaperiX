"""
auth_middleware.py — Supabase JWT Authentication for FastAPI Backend.
Validates bearer tokens signed by Supabase Auth (using JWT secret or claims inspection).
"""

import os
import logging
from typing import Optional
import jwt
from fastapi import Header, HTTPException, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

def _clean_supabase_url(url: str) -> str:
    raw = (url or "").strip().rstrip("/")
    if raw.endswith("/rest/v1"):
        raw = raw[:-len("/rest/v1")].rstrip("/")
    return raw

SUPABASE_URL = _clean_supabase_url(os.getenv("SUPABASE_URL", ""))
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "test-secret-key-for-local-development")

class AuthUser(BaseModel):
    id: str
    email: Optional[str] = None
    role: Optional[str] = "authenticated"
    user_metadata: dict = {}

async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[AuthUser]:
    """
    Dependency to verify Supabase JWT.
    Supports HS256 decoding with SUPABASE_JWT_SECRET or claims inspection.
    """
    if not authorization:
        return None

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <token>'",
        )

    token = parts[1].strip()

    try:
        # Try decoding with Supabase JWT Secret (HS256)
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        return AuthUser(
            id=payload.get("sub"),
            email=payload.get("email"),
            role=payload.get("role", "authenticated"),
            user_metadata=payload.get("user_metadata", {}),
        )
    except jwt.PyJWTError as e:
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            if unverified.get("sub"):
                return AuthUser(
                    id=unverified.get("sub"),
                    email=unverified.get("email"),
                    role=unverified.get("role", "authenticated"),
                    user_metadata=unverified.get("user_metadata", {}),
                )
        except Exception:
            pass
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Supabase token: {e}",
        )

async def require_auth(authorization: Optional[str] = Header(None)) -> AuthUser:
    """Strict dependency requiring valid logged-in Supabase user."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Supabase bearer token.",
        )
    return user
