"""
crm_router.py — FastAPI Router for HubSpot CRM & Universal Webhook Integration.

Endpoints:
- GET  /api/crm/status: CRM connection telemetry, provider mode, and pipeline totals.
- POST /api/crm/settings: Persist CRM tokens, webhook URL, and auto-sync preferences.
- POST /api/crm/test-connection: Live validation against HubSpot CRM REST API.
- POST /api/crm/sync-lead: 1-click sync for any discovered radar lead to HubSpot.
- POST /api/crm/sync-all-leads: Batch synchronization of all qualified prospects.
- POST /api/crm/sync-meeting: Sync scheduled meeting & Jitsi video room into CRM deal.
- GET  /api/crm/records: List all synced CRM contacts and pipeline deals from MongoDB.
- GET  /api/crm/export-csv: Export CRM records as standard CSV for manual import.
"""

import csv
import io
import logging
import os
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Header, Query, Response
from pydantic import BaseModel, Field

from app.core import database as db
from app.core import auth_middleware
from app.services.crm_service import crm_service, _parse_deal_amount

logger = logging.getLogger("vyepari.crm.router")
router = APIRouter()


class CRMSettingsPayload(BaseModel):
    provider: Optional[str] = Field("hubspot", description="CRM provider (hubspot, webhook)")
    crm_type: Optional[str] = None
    access_token: Optional[str] = Field(None, description="HubSpot Private App Access Token")
    api_key: Optional[str] = None
    webhook_url: Optional[str] = Field(None, description="Zapier / Make / Universal Webhook URL")
    auto_sync: Optional[bool] = None
    auto_sync_radar: Optional[bool] = Field(True, description="Auto-sync qualified leads from Radar")
    auto_sync_meetings: Optional[bool] = Field(True, description="Auto-sync confirmed meetings as Deals")
    auto_sync_calls: Optional[bool] = Field(True, description="Auto-log AI call summaries into CRM")


class SyncLeadRequest(BaseModel):
    lead_id: Optional[str] = Field(None, description="Database ID of the prospect lead")
    user_id: Optional[str] = Field(None, description="Owner user ID")
    user_email: Optional[str] = Field(None, description="Owner user email")
    company: Optional[str] = Field(None, description="Company name")
    name: Optional[str] = Field(None, description="Contact person or team name")
    email: Optional[str] = Field(None, description="Contact email")
    phone: Optional[str] = Field(None, description="Contact phone")
    website: Optional[str] = Field(None, description="Company website")
    deal_size: Optional[str] = Field(None, description="Estimated deal size or budget")
    notes: Optional[str] = Field(None, description="Meeting or qualification notes")


class SyncMeetingRequest(BaseModel):
    event_id: Optional[str] = Field(None, description="Calendar event UUID")
    user_id: Optional[str] = Field(None, description="Owner user ID")
    user_email: Optional[str] = Field(None, description="Owner user email")
    meeting_id: Optional[str] = None
    customer_name: Optional[str] = None
    contact_name: Optional[str] = None
    company_name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    meet_url: Optional[str] = None
    start_time: Optional[str] = None
    agenda: Optional[str] = None
    deal_amount: Optional[float] = None
    notes: Optional[str] = None


@router.get("/status")
async def get_crm_status(
    user_id: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Returns active CRM integration status, credentials state, and pipeline summary.
    """
    resolved_user_id = user_id
    resolved_user_email = user_email
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                if not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", ""):
                    resolved_user_id = user.id
                if not resolved_user_email:
                    resolved_user_email = user.email
        except Exception:
            pass

    settings = await db.get_crm_settings(user_id=resolved_user_id)
    records = await db.list_crm_records(user_id=resolved_user_id, user_email=resolved_user_email, limit=200)

    token = settings.get("access_token") or os.getenv("HUBSPOT_ACCESS_TOKEN", "") or ""
    has_token = bool(token.strip())
    webhook_url = settings.get("webhook_url") or os.getenv("CRM_WEBHOOK_URL", "") or ""

    total_pipeline = sum(float(r.get("deal_amount") or 0.0) for r in records)
    synced_contacts_count = len([r for r in records if r.get("contact_id") or r.get("hubspot_contact_id")])
    synced_deals_count = len([r for r in records if r.get("deal_id") or r.get("hubspot_deal_id")])
    last_sync_at = records[0].get("synced_at") or records[0].get("updated_at") if records else None

    return {
        "crm_type": settings.get("provider", "hubspot"),
        "provider": settings.get("provider", "hubspot"),
        "has_token": has_token,
        "token_preview": f"pat-na1-...{token[-4:]}" if len(token) > 8 else ("Configured" if has_token else "Not Set"),
        "has_webhook": bool(webhook_url.strip()),
        "mode": "live" if has_token else "sandbox",
        "synced_contacts_count": synced_contacts_count,
        "synced_deals_count": synced_deals_count,
        "total_pipeline_value": total_pipeline,
        "auto_sync_radar": settings.get("auto_sync_radar", True),
        "auto_sync_meetings": settings.get("auto_sync_meetings", True),
        "hubspot": {
            "configured": has_token,
            "has_token": has_token,
            "connected": True,
            "mode": "live" if has_token else "sandbox_mock",
            "message": "Connected to HubSpot Direct API v3" if has_token else "Running in HubSpot Sandbox Simulation Mode",
        },
        "webhook": {
            "configured": bool(webhook_url.strip()),
            "url": webhook_url,
            "events": ["lead_synced", "meeting_scheduled", "call_completed"],
        },
        "totals": {
            "synced_contacts": synced_contacts_count,
            "synced_deals": synced_deals_count,
            "total_deal_value_inr": total_pipeline,
            "last_sync_at": last_sync_at,
        },
    }


@router.post("/settings")
async def update_crm_settings(
    payload: CRMSettingsPayload,
    user_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Save or update CRM configuration in MongoDB.
    """
    resolved_user_id = user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                resolved_user_id = user.id
        except Exception:
            pass

    token_in = payload.access_token if payload.access_token is not None else payload.api_key
    provider_in = payload.provider or payload.crm_type or "hubspot"
    auto_radar = payload.auto_sync if payload.auto_sync is not None else payload.auto_sync_radar
    auto_meet = payload.auto_sync if payload.auto_sync is not None else payload.auto_sync_meetings

    existing = await db.get_crm_settings(user_id=resolved_user_id)
    updated = {
        **existing,
        "provider": provider_in,
        "access_token": token_in.strip() if token_in is not None else existing.get("access_token", ""),
        "webhook_url": payload.webhook_url.strip() if payload.webhook_url is not None else existing.get("webhook_url", ""),
        "auto_sync_radar": auto_radar if auto_radar is not None else existing.get("auto_sync_radar", True),
        "auto_sync_meetings": auto_meet if auto_meet is not None else existing.get("auto_sync_meetings", True),
        "auto_sync_calls": payload.auto_sync_calls if payload.auto_sync_calls is not None else existing.get("auto_sync_calls", True),
    }

    saved = await db.save_crm_settings(updated, user_id=resolved_user_id)
    return {"success": True, "settings": saved}


@router.post("/test-connection")
async def test_crm_connection(
    payload: Optional[CRMSettingsPayload] = None,
    authorization: Optional[str] = Header(None),
):
    """
    Test live connectivity against the HubSpot CRM API.
    """
    token_to_test = None
    if payload:
        token_to_test = payload.access_token or payload.api_key
        if token_to_test:
            token_to_test = token_to_test.strip()
    
    if not token_to_test:
        user_id = None
        if authorization:
            try:
                user = await auth_middleware.get_current_user(authorization)
                if user:
                    user_id = user.id
            except Exception:
                pass
        settings = await db.get_crm_settings(user_id=user_id)
        token_to_test = settings.get("access_token")

    res = await crm_service.test_connection(token_override=token_to_test)
    return res


@router.post("/sync-lead")
async def sync_lead_to_crm(
    payload: SyncLeadRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Syncs an individual lead from Lead Radar to HubSpot CRM and/or Universal Webhook.
    """
    resolved_user_id = payload.user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                resolved_user_id = user.id
        except Exception:
            pass
    user_id = resolved_user_id

    # Load lead from MongoDB if lead_id provided
    lead_dict: Dict[str, Any] = {}
    if payload.lead_id:
        db_lead = await db.get_prospect_lead(payload.lead_id)
        if db_lead:
            lead_dict = dict(db_lead)

    # Merge payload overrides
    if payload.company:
        lead_dict["company"] = payload.company
    if payload.name:
        lead_dict["name"] = payload.name
    if payload.email:
        lead_dict["email"] = payload.email
    if payload.phone:
        lead_dict["phone"] = payload.phone
    if payload.website:
        lead_dict["website"] = payload.website
    if payload.deal_size:
        lead_dict["dealSize"] = payload.deal_size

    if not lead_dict.get("company"):
        lead_dict["company"] = "Prospective Account"

    # Get user CRM credentials
    settings = await db.get_crm_settings(user_id=user_id)
    token = settings.get("access_token")
    webhook_url = settings.get("webhook_url")

    # 1. Sync Contact
    contact_res = await crm_service.sync_contact(lead_dict, token_override=token)

    # 2. Sync Deal
    deal_amount = _parse_deal_amount(lead_dict.get("dealSize"))
    deal_res = await crm_service.sync_deal(lead_dict, deal_amount=deal_amount, token_override=token)

    # 3. Dispatch Webhook if configured
    if webhook_url:
        await crm_service.dispatch_universal_webhook(
            event_type="lead_synced",
            payload={
                "company": lead_dict.get("company"),
                "name": lead_dict.get("name"),
                "phone": lead_dict.get("phone"),
                "email": lead_dict.get("email"),
                "deal_amount": deal_amount,
                "hubspot_contact_id": contact_res.get("contact_id"),
                "hubspot_deal_id": deal_res.get("deal_id"),
            },
            webhook_url_override=webhook_url,
        )

    # 4. Save CRM Record in MongoDB
    crm_record = {
        "id": f"crm-{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "user_email": payload.user_email,
        "lead_id": payload.lead_id,
        "company": lead_dict.get("company"),
        "contact_name": lead_dict.get("name") or f"{lead_dict.get('company')} Team",
        "email": lead_dict.get("email"),
        "phone": lead_dict.get("phone"),
        "deal_amount": deal_amount,
        "deal_stage": "qualifiedtobuy",
        "provider": "hubspot",
        "contact_id": contact_res.get("contact_id"),
        "deal_id": deal_res.get("deal_id"),
        "hubspot_contact_id": contact_res.get("contact_id"),
        "hubspot_deal_id": deal_res.get("deal_id"),
        "hubspot_url": deal_res.get("hubspot_url") or contact_res.get("hubspot_url"),
        "mode": contact_res.get("mode", "sandbox"),
        "status": "synced",
        "synced_at": db._now_iso(),
    }
    rec_id = await db.save_crm_record(crm_record, user_id=user_id, user_email=payload.user_email)

    # 5. Update Lead in MongoDB if linked
    if payload.lead_id:
        await db.update_prospect_lead(
            payload.lead_id,
            {"crm_synced": True, "crm_record_id": rec_id, "crm_deal_id": deal_res.get("deal_id")},
        )

    return {
        "success": True,
        "record_id": rec_id,
        "contact_id": contact_res.get("contact_id"),
        "deal_id": deal_res.get("deal_id"),
        "contact": {"id": contact_res.get("contact_id"), "properties": contact_res.get("properties", {})},
        "deal": {"id": deal_res.get("deal_id"), "properties": deal_res.get("properties", {})},
        "deal_amount": deal_amount,
        "mode": contact_res.get("mode"),
        "hubspot_url": crm_record.get("hubspot_url"),
        "company": lead_dict.get("company"),
    }


@router.post("/sync-all-leads")
async def sync_all_leads_batch(
    user_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Sync all discovered prospect leads in MongoDB to CRM in batch.
    """
    resolved_user_id = user_id
    if (not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", "")) and authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                resolved_user_id = user.id
        except Exception:
            pass

    leads = await db.list_prospect_leads(user_id=resolved_user_id, limit=50)
    synced_records = []

    for l in leads:
        try:
            res = await sync_lead_to_crm(
                SyncLeadRequest(lead_id=l["id"]),
                authorization=authorization,
            )
            synced_records.append(res)
        except Exception as e:
            logger.warning(f"Batch CRM sync error for lead {l.get('id')}: {e}")

    total_val = sum(float(r.get("deal_amount") or 0.0) for r in synced_records)
    settings = await db.get_crm_settings(user_id=user_id)
    mode = "live" if settings.get("access_token") else "sandbox"

    return {
        "success": True,
        "synced_count": len(synced_records),
        "total_leads": len(leads),
        "total_deal_value": total_val,
        "mode": mode,
        "results": synced_records,
    }


@router.post("/sync-meeting")
async def sync_meeting_to_crm(
    payload: SyncMeetingRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Sync a confirmed calendar meeting and Jitsi room link as a CRM Deal.
    """
    user_id = None
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                user_id = user.id
        except Exception:
            pass

    event_id = payload.event_id or payload.meeting_id or f"meet-{uuid.uuid4().hex[:6]}"
    event = await db.get_calendar_event(event_id)
    company = payload.company or payload.company_name or (event.get("company_name") if event else None) or "Meeting Partner"
    customer_name = payload.contact_name or payload.customer_name or (event.get("customer_name") if event else None) or "Executive"
    meet_url = payload.meet_url or (event.get("meet_url") if event else None) or ""
    email = payload.email or (event.get("customer_email") if event else "")
    phone = payload.phone or (event.get("customer_phone") if event else "")
    deal_amount = float(payload.deal_amount or 500000.0)

    lead_stub = {
        "company": company,
        "name": customer_name,
        "email": email,
        "phone": phone,
        "dealSize": f"₹{int(deal_amount):,}",
    }

    settings = await db.get_crm_settings(user_id=user_id)
    token = settings.get("access_token")

    # Sync Contact First
    contact_res = await crm_service.sync_contact(lead=lead_stub, token_override=token)

    # Sync Deal
    deal_res = await crm_service.sync_deal(
        lead=lead_stub,
        deal_amount=deal_amount,
        deal_stage="appointmentscheduled",
        token_override=token,
    )

    crm_record = {
        "id": f"crm-meet-{uuid.uuid4().hex[:8]}",
        "user_id": user_id,
        "user_email": payload.user_email,
        "event_id": event_id,
        "company": company,
        "contact_name": customer_name,
        "email": email,
        "phone": phone,
        "deal_amount": deal_amount,
        "deal_stage": "appointmentscheduled",
        "provider": "hubspot",
        "contact_id": contact_res.get("contact_id"),
        "deal_id": deal_res.get("deal_id"),
        "hubspot_contact_id": contact_res.get("contact_id"),
        "hubspot_deal_id": deal_res.get("deal_id"),
        "hubspot_url": deal_res.get("hubspot_url"),
        "meet_url": meet_url,
        "mode": deal_res.get("mode", "sandbox"),
        "synced_at": db._now_iso(),
    }
    rec_id = await db.save_crm_record(crm_record, user_id=user_id, user_email=payload.user_email)

    return {
        "success": True,
        "record_id": rec_id,
        "contact_id": contact_res.get("contact_id"),
        "deal_id": deal_res.get("deal_id"),
        "contact": {"id": contact_res.get("contact_id"), "properties": contact_res.get("properties", {})},
        "deal": {"id": deal_res.get("deal_id"), "properties": deal_res.get("properties", {})},
        "meet_url": meet_url,
        "mode": deal_res.get("mode"),
    }


@router.get("/records")
async def list_crm_records(
    user_id: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    authorization: Optional[str] = Header(None),
):
    """
    List all synced CRM records from MongoDB.
    """
    resolved_user_id = user_id
    resolved_user_email = user_email
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                if not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", ""):
                    resolved_user_id = user.id
                if not resolved_user_email:
                    resolved_user_email = user.email
        except Exception:
            pass

    records = await db.list_crm_records(user_id=resolved_user_id, user_email=resolved_user_email, limit=limit)
    return {"records": records, "count": len(records)}


@router.post("/transfer-test-data")
async def transfer_test_data(
    user_id: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Explicit test data transfer: creates a test commercial contact and pipeline deal,
    dispatches to HubSpot API / Webhook, and stores verified record in MongoDB.
    """
    resolved_user_id = user_id
    resolved_user_email = user_email
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                if not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", ""):
                    resolved_user_id = user.id
                if not resolved_user_email:
                    resolved_user_email = user.email
        except Exception:
            pass

    test_lead = {
        "company": "Tata Communications Enterprise",
        "name": "Sunil Varma",
        "email": "sunil.varma@tatacommunications.com",
        "phone": "+919820011223",
        "website": "https://tatacommunications.com",
        "dealSize": "₹2,500,000",
    }

    settings = await db.get_crm_settings(user_id=resolved_user_id)
    token = settings.get("access_token") or os.getenv("HUBSPOT_ACCESS_TOKEN", "")

    contact_res = await crm_service.sync_contact(test_lead, token_override=token)
    deal_amount = 2500000.0
    deal_res = await crm_service.sync_deal(test_lead, deal_amount=deal_amount, token_override=token)

    crm_record = {
        "id": f"crm-test-{uuid.uuid4().hex[:8]}",
        "user_id": resolved_user_id,
        "user_email": resolved_user_email,
        "company": test_lead["company"],
        "contact_name": test_lead["name"],
        "email": test_lead["email"],
        "phone": test_lead["phone"],
        "deal_amount": deal_amount,
        "deal_stage": "qualifiedtobuy",
        "provider": "hubspot",
        "contact_id": contact_res.get("contact_id"),
        "deal_id": deal_res.get("deal_id"),
        "hubspot_contact_id": contact_res.get("contact_id"),
        "hubspot_deal_id": deal_res.get("deal_id"),
        "hubspot_url": deal_res.get("hubspot_url") or contact_res.get("hubspot_url"),
        "mode": contact_res.get("mode", "sandbox"),
        "status": "synced",
        "synced_at": db._now_iso(),
    }
    rec_id = await db.save_crm_record(crm_record, user_id=resolved_user_id, user_email=resolved_user_email)

    return {
        "success": True,
        "message": f"Verified CRM data transfer successful! Contact: {contact_res.get('contact_id')}, Deal: {deal_res.get('deal_id')}",
        "mode": contact_res.get("mode"),
        "record_id": rec_id,
        "contact": contact_res,
        "deal": deal_res,
    }


@router.get("/export-csv")
async def export_crm_csv(
    user_id: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Export all synced CRM records as a downloadable CSV.
    """
    resolved_user_id = user_id
    resolved_user_email = user_email
    if authorization:
        try:
            user = await auth_middleware.get_current_user(authorization)
            if user:
                if not resolved_user_id or str(resolved_user_id).lower() in ("undefined", "null", ""):
                    resolved_user_id = user.id
                if not resolved_user_email:
                    resolved_user_email = user.email
        except Exception:
            pass

    records = await db.list_crm_records(user_id=resolved_user_id, user_email=resolved_user_email, limit=500)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Record ID", "Company", "Contact Name", "Phone", "Email",
        "Deal Amount (INR)", "Deal Stage", "HubSpot Deal ID", "HubSpot URL", "Synced At"
    ])

    for r in records:
        writer.writerow([
            r.get("id", ""),
            r.get("company", ""),
            r.get("contact_name", ""),
            r.get("phone", ""),
            r.get("email", ""),
            r.get("deal_amount", 0),
            r.get("deal_stage", "qualifiedtobuy"),
            r.get("deal_id", ""),
            r.get("hubspot_url", ""),
            r.get("synced_at", ""),
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vyaperix_crm_export.csv"},
    )
