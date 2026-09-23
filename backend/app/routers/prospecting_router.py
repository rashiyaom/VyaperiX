"""
prospecting_router.py — FastAPI Router for Autonomous B2B Prospecting & Market Radar.

Endpoints:
- POST /api/prospecting/discover: Run DDG X-Ray search + Apollo enrichment + Groq ICP scoring.
- GET  /api/prospecting/leads: Retrieve discovered leads list.
- GET  /api/prospecting/leads/{id}: Retrieve single lead details.
- POST /api/prospecting/leads/{id}/call: Dispatch autonomous Riley AI Voice call via Vapi.
- POST /api/prospecting/leads/{id}/whatsapp: Dispatch WhatsApp intro with Jitsi live video link.
- POST /api/prospecting/enrich-domain: Instant Apollo.io organization firmographic lookup.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel, Field

from app.core import database as db
from app.core import auth_middleware
from app.services.prospecting_service import prospecting_engine
from app.services.apollo_service import apollo_service

logger = logging.getLogger("vyepari.prospecting.router")
router = APIRouter()


class DiscoverRequest(BaseModel):
    offering: str = Field(..., min_length=2, description="What product/service your business offers")
    target_industry: str = Field(..., min_length=2, description="Target industry sector for prospecting")
    region: Optional[str] = Field("India", description="Geographic area or country")
    custom_query: Optional[str] = Field(None, description="Optional custom DuckDuckGo search query")
    max_results: Optional[int] = Field(6, ge=1, le=15, description="Number of target leads to discover")


class CallLeadRequest(BaseModel):
    phone_override: Optional[str] = Field(None, description="Alternative phone number to dial")
    business_name: Optional[str] = Field("VyaperiX", description="Name of company represented on call")


class WhatsAppLeadRequest(BaseModel):
    phone_override: Optional[str] = Field(None, description="Alternative phone number for WhatsApp")
    custom_message: Optional[str] = Field(None, description="Custom message text to send")
    business_name: Optional[str] = Field("VyaperiX", description="Name of your business")


class EnrichDomainRequest(BaseModel):
    domain: str = Field(..., min_length=3, description="Company domain (e.g. stripe.com or orientbell.com)")


@router.post("/discover")
async def discover_prospects(
    payload: DiscoverRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Autonomous B2B Lead Discovery:
    Uses DuckDuckGo to run LinkedIn X-Ray queries, enriches company profiles with Apollo.io,
    and calculates ICP match scores and custom opening hooks via Groq LLM.
    """
    user_id = None
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                user_id = user.id
        except Exception:
            pass

    try:
        leads = await prospecting_engine.discover_leads(
            offering=payload.offering,
            target_industry=payload.target_industry,
            region=payload.region or "India",
            custom_query=payload.custom_query,
            max_results=payload.max_results or 6,
            user_id=user_id,
        )
        return {
            "success": True,
            "leads": leads,
            "count": len(leads),
            "offering": payload.offering,
            "target_industry": payload.target_industry,
        }
    except Exception as e:
        logger.error(f"Prospecting discovery error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Discovery failed: {str(e)}")


@router.get("/leads")
async def list_prospect_leads(
    limit: int = Query(50, ge=1, le=100),
    authorization: Optional[str] = Header(None),
):
    """
    List all previously discovered and enriched prospect leads.
    """
    user_id = None
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                user_id = user.id
        except Exception:
            pass

    leads = await db.list_prospect_leads(user_id=user_id, limit=limit)
    return {"leads": leads, "count": len(leads)}


@router.get("/leads/{lead_id}")
async def get_lead_details(lead_id: str):
    """
    Get deep profile details for a specific prospect lead.
    """
    lead = await db.get_prospect_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Prospect lead not found")
    return lead


@router.post("/leads/{lead_id}/call")
async def call_prospect_lead(
    lead_id: str,
    payload: Optional[CallLeadRequest] = None,
    authorization: Optional[str] = Header(None),
):
    """
    Trigger live outbound call via Riley Voice SDR (Vapi) to the lead's verified corporate phone.
    """
    user_id = None
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                user_id = user.id
        except Exception:
            pass

    phone_override = payload.phone_override if payload else None
    business_name = payload.business_name if payload else "VyaperiX"

    try:
        res = await prospecting_engine.trigger_voice_call(
            lead_id=lead_id,
            user_id=user_id,
            phone_override=phone_override,
            business_name=business_name,
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error calling lead {lead_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Outbound call dispatch failed: {str(e)}")


@router.post("/leads/{lead_id}/whatsapp")
async def send_whatsapp_to_lead(
    lead_id: str,
    payload: Optional[WhatsAppLeadRequest] = None,
    authorization: Optional[str] = Header(None),
):
    """
    Send high-converting WhatsApp intro with Instant Live Video link (Jitsi) to the lead.
    """
    user_id = None
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                user_id = user.id
        except Exception:
            pass

    phone_override = payload.phone_override if payload else None
    custom_msg = payload.custom_message if payload else None
    business_name = payload.business_name if payload else "VyaperiX"

    try:
        res = await prospecting_engine.trigger_whatsapp_intro(
            lead_id=lead_id,
            phone_override=phone_override,
            custom_message=custom_msg,
            business_name=business_name,
            user_id=user_id,
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error sending WhatsApp to lead {lead_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"WhatsApp intro failed: {str(e)}")


@router.post("/enrich-domain")
async def enrich_domain_direct(payload: EnrichDomainRequest):
    """
    Instant test endpoint to look up firmographics from Apollo.io by domain.
    """
    result = await apollo_service.enrich_organization(payload.domain)
    return result
