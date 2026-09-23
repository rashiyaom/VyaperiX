"""
whatsapp_router.py — FastAPI Router for WhatsApp Integration.

Provides endpoints to:
- Check connection status of WhatsApp Gateway
- Retrieve QR code for device pairing
- Send custom direct messages
- Send post-call requirements summaries
- Send meeting confirmations
- Logout / disconnect session
"""

import logging
from typing import Any, List, Optional, Union
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services import whatsapp_service

logger = logging.getLogger("vyepari.whatsapp")
router = APIRouter()


class SendMessageRequest(BaseModel):
    phone: str = Field(..., description="Target phone number (with or without country code)")
    message: str = Field(..., min_length=1, description="Text message content")


class SendRequirementsRequest(BaseModel):
    customer_name: str = Field(..., description="Customer or prospect name")
    customer_phone: str = Field(..., description="Customer phone number")
    business_name: Optional[str] = Field("VyaperiX", description="Business/Organization name")
    requirements: Union[List[str], str] = Field(..., description="Key customer requirements or discussion points")
    next_steps: Optional[Union[List[str], str]] = Field(None, description="Agreed next steps or follow-ups")


class SendMeetingRequest(BaseModel):
    customer_name: str = Field(..., description="Customer or prospect name")
    customer_phone: str = Field(..., description="Customer phone number")
    business_name: Optional[str] = Field("VyaperiX", description="Business/Organization name")
    start_time: str = Field(..., description="ISO-8601 start timestamp or formatted date/time")
    meet_url: str = Field(..., description="Google Meet or meeting link")
    agenda: Optional[str] = Field(None, description="Meeting agenda / topics")
    requirements: Optional[str] = Field(None, description="Noted customer requirements")


@router.get("/status")
async def get_status():
    """
    Check if the WhatsApp Gateway is active and connected to a linked WhatsApp account.
    """
    return await whatsapp_service.check_gateway_status()


@router.get("/qr")
async def get_qr_code():
    """
    Retrieve live QR code data URL (Base64) to display in the frontend for device pairing.
    """
    return await whatsapp_service.get_gateway_qr()


@router.post("/logout")
async def logout():
    """
    Disconnect the currently paired WhatsApp device and regenerate a fresh QR code.
    """
    return await whatsapp_service.logout_gateway()


@router.post("/send")
async def send_message(payload: SendMessageRequest):
    """
    Send an arbitrary WhatsApp message to any valid phone number.
    """
    result = await whatsapp_service.send_whatsapp_message(
        phone=payload.phone,
        text=payload.message,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY if "Gateway" in str(result.get("error")) else status.HTTP_400_BAD_REQUEST,
            detail=result.get("error") or "Failed to send WhatsApp message",
        )
    return result


@router.post("/send-summary")
async def send_summary(payload: SendRequirementsRequest):
    """
    Send a post-call customer requirements recap and next steps via WhatsApp.
    """
    result = await whatsapp_service.send_requirements_summary(
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        business_name=payload.business_name,
        requirements=payload.requirements,
        next_steps=payload.next_steps,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY if "Gateway" in str(result.get("error")) else status.HTTP_400_BAD_REQUEST,
            detail=result.get("error") or "Failed to send WhatsApp requirements summary",
        )
    return result


@router.post("/send-meeting")
async def send_meeting(payload: SendMeetingRequest):
    """
    Send a meeting confirmation message with Google Meet link via WhatsApp.
    """
    result = await whatsapp_service.send_meeting_confirmation(
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        business_name=payload.business_name,
        start_time=payload.start_time,
        meet_url=payload.meet_url,
        agenda=payload.agenda,
        requirements=payload.requirements,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY if "Gateway" in str(result.get("error")) else status.HTTP_400_BAD_REQUEST,
            detail=result.get("error") or "Failed to send WhatsApp meeting confirmation",
        )
    return result
