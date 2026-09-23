"""
prospecting_service.py — Autonomous B2B Lead Discovery, Market Radar & Prospecting Engine.

Combines:
1. Groq LLM Query Synthesizer (Tailored LinkedIn X-Ray queries).
2. DuckDuckGo Search Provider (site:linkedin.com X-Ray discovery for companies & decision makers).
3. Apollo.io Enrichment API (Corporate phone numbers, headcount, tech stack, firmographics).
4. Groq ICP Fit Evaluation & Personalized Sales Pitch Generation.
5. Live Outbound Telephony (Vapi / Riley AI voice SDR) & WhatsApp Intro Dispatch.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from groq import Groq

from app.core import database as db
from app.services.apollo_service import apollo_service, clean_domain
from app.services.search.ddg_provider import DDGProvider
from app.services import voice_engine
from app.services import whatsapp_service
from app.services.calendar_service import generate_live_video_room

load_dotenv()
logger = logging.getLogger("vyepari.prospecting")


def _get_groq_client() -> Groq:
    """Return active Groq client."""
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable not set")
    return Groq(api_key=api_key)


def _extract_emails(text: str) -> List[str]:
    """Extract email addresses from snippet text."""
    if not text:
        return []
    matches = re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text)
    cleaned = []
    for m in matches:
        m_lower = m.lower().rstrip(".")
        if not m_lower.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg")):
            cleaned.append(m_lower)
    return list(dict.fromkeys(cleaned))


def _extract_phone_numbers(text: str) -> List[str]:
    """Extract phone numbers (Indian & international formats) from snippet text."""
    if not text:
        return []
    # Match patterns like +91 98200 12345, 0800 00 962 37, +91-1147119100, etc.
    pattern = r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}"
    raw_matches = re.findall(pattern, text)
    valid_phones = []
    for m in raw_matches:
        digits = re.sub(r"[^\d]", "", m)
        if 8 <= len(digits) <= 14:
            valid_phones.append(m.strip())
    return list(dict.fromkeys(valid_phones))


def _parse_company_from_title(title: str) -> str:
    """Extract clean company name from LinkedIn or web title."""
    if not title:
        return "Target Enterprise"
    # Example: "Orient Bell Limited | LinkedIn" -> "Orient Bell Limited"
    # Example: "LV Granito - Ceramic Tiles Manufacturer - Morbi | LinkedIn"
    cleaned = title.split("|")[0].split(" - ")[0].split(" – ")[0].split(":")[0].strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or "Target Enterprise"


class AutonomousProspectingEngine:
    """
    Coordinates multi-source lead discovery, firmographic enrichment,
    fit evaluation, and outbound engagement.
    """

    def __init__(self):
        self.ddg = DDGProvider()

    def generate_targeted_queries(
        self, offering: str, target_industry: str, region: str = "India"
    ) -> List[str]:
        """
        Use Groq to generate 2-3 laser-targeted LinkedIn X-Ray and market search queries.
        """
        client = _get_groq_client()
        prompt = f"""You are an elite B2B Sales Prospecting Engineer.
Generate 2 distinct search queries to find real target customer companies on LinkedIn using DuckDuckGo X-Ray searches.

Context:
- Our Product/Offering: {offering}
- Target Industry: {target_industry}
- Geographic Region: {region}

Rules:
1. One query must search for LinkedIn Company pages: site:linkedin.com/company "keywords" "{region}"
2. One query must search for relevant key buyers or distributors: site:linkedin.com/company ("distributor" OR "procurement" OR "solutions") "{target_industry}" "{region}"
3. Output STRICT JSON only: {{"queries": ["query 1", "query 2"]}}
No conversational text.
"""
        try:
            model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=300,
            )
            raw = (resp.choices[0].message.content or "").strip()
            # Clean JSON fences
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\s*```$", "", raw)
            match = re.search(r"(\{[\s\S]*\})", raw)
            if match:
                parsed = json.loads(match.group(1))
                queries = parsed.get("queries") or []
                if queries:
                    return queries[:2]
        except Exception as e:
            logger.warning(f"Groq query generation error: {e}. Using deterministic fallback.")

        # Fallback queries
        ind_kw = target_industry.replace('"', '').strip()
        reg_kw = region.replace('"', '').strip()
        return [
            f'site:linkedin.com/company "{ind_kw}" "{reg_kw}"',
            f'site:linkedin.com/company "{ind_kw}" distributor "{reg_kw}"',
        ]

    async def discover_leads(
        self,
        offering: str,
        target_industry: str,
        region: str = "India",
        custom_query: Optional[str] = None,
        max_results: int = 6,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Full autonomous pipeline:
        DDG LinkedIn Discovery -> Apollo Firmographic Deep Enrichment -> Groq Fit Evaluation -> Storage.
        """
        # Step 1: Determine queries
        if custom_query and custom_query.strip():
            queries = [custom_query.strip()]
        else:
            queries = self.generate_targeted_queries(offering, target_industry, region)

        logger.info(f"Prospecting: Executing queries: {queries}")

        # Step 2: DuckDuckGo search
        raw_search_results = []
        for q in queries:
            try:
                results = await self.ddg.search(q, max_results=max_results + 2)
                raw_search_results.extend(results)
            except Exception as e:
                logger.warning(f"DDG search failed for query '{q}': {e}")

        if not raw_search_results and not custom_query:
            # Try a broader search
            try:
                fallback_q = f'"{target_industry}" companies {region} contact'
                raw_search_results = await self.ddg.search(fallback_q, max_results=max_results)
            except Exception as e:
                logger.error(f"Fallback DDG search failed: {e}")

        # Step 3: Parse and deduplicate companies
        candidates: List[Dict[str, Any]] = []
        seen_names = set()

        for item in raw_search_results:
            title = item.title
            snippet = item.snippet
            url = item.url

            # Extract company name
            company_name = _parse_company_from_title(title)
            slug = re.sub(r"[^a-z0-9]", "", company_name.lower())
            if not slug or slug in seen_names:
                continue
            seen_names.add(slug)

            # Extract emails and phone numbers from snippet
            emails = _extract_emails(snippet)
            phones = _extract_phone_numbers(snippet)

            # Derive domain candidate
            domain_candidate = ""
            if emails:
                domain_candidate = emails[0].split("@")[-1].strip()
            if not domain_candidate or domain_candidate in ("gmail.com", "yahoo.com", "outlook.com", "hotmail.com"):
                # Clean company name into domain slug
                clean_slug = re.sub(r"[^a-zA-Z0-9]", "", company_name.split()[0]).lower()
                domain_candidate = f"{clean_slug}.com"

            candidates.append({
                "raw_company": company_name,
                "linkedin_url": url if "linkedin.com" in url else "",
                "snippet": snippet,
                "emails": emails,
                "phones": phones,
                "domain_candidate": domain_candidate,
            })

            if len(candidates) >= max_results:
                break

        # Step 4: Apollo Deep Enrichment (in parallel)
        async def _enrich_candidate(c: Dict[str, Any]) -> Dict[str, Any]:
            domain = c["domain_candidate"]
            enrichment = await apollo_service.enrich_organization(domain)
            # If not found or phone is missing, try raw company name domain
            if not enrichment.get("found"):
                alt_domain = clean_domain(f"{c['raw_company'].lower().replace(' ', '')}.com")
                if alt_domain and alt_domain != domain:
                    alt_enrich = await apollo_service.enrich_organization(alt_domain)
                    if alt_enrich.get("found"):
                        enrichment = alt_enrich

            # Determine best phone
            resolved_phone = (
                enrichment.get("phone")
                or (c["phones"][0] if c["phones"] else "")
            )

            # Determine best email
            resolved_email = (
                c["emails"][0] if c["emails"]
                else (f"info@{enrichment.get('domain')}" if enrichment.get("domain") else "contact@enterprise.com")
            )

            # Determine website
            website = enrichment.get("website_url") or f"https://{c['domain_candidate']}"

            # Best LinkedIn URL
            linkedin_url = enrichment.get("linkedin_url") or c["linkedin_url"]

            return {
                "company": enrichment.get("name") or c["raw_company"],
                "domain": enrichment.get("domain") or c["domain_candidate"],
                "phone": resolved_phone,
                "email": resolved_email,
                "website": website,
                "linkedin_url": linkedin_url,
                "employee_count": enrichment.get("estimated_num_employees"),
                "annual_revenue": enrichment.get("annual_revenue"),
                "industry": enrichment.get("industry") or target_industry,
                "city": enrichment.get("city") or "",
                "state": enrichment.get("state") or "",
                "country": enrichment.get("country") or region,
                "logo_url": enrichment.get("logo_url") or "",
                "technologies": enrichment.get("technologies") or [],
                "snippet": c["snippet"],
                "apollo_found": enrichment.get("found", False),
            }

        enriched_leads = await asyncio.gather(*[_enrich_candidate(c) for c in candidates])

        # Step 5: Groq ICP Fit Evaluation & Personalized Pitch Generation
        final_leads: List[Dict[str, Any]] = []
        try:
            evaluated = await self._evaluate_and_pitch_batch(
                offering=offering,
                target_industry=target_industry,
                leads=list(enriched_leads),
            )
            final_leads = evaluated
        except Exception as e:
            logger.warning(f"Groq ICP fit evaluation failed: {e}. Falling back to default scoring.")
            for idx, el in enumerate(enriched_leads):
                final_leads.append({
                    **el,
                    "intentScore": 85 - idx * 3,
                    "dealSize": "Custom Enterprise Tier",
                    "why_matched": f"Active commercial requirement matching {offering}.",
                    "personalized_pitch": f"Hi {el['company']} team, we noticed your leadership in {el['industry']}. We help companies like yours automate sales operations with AI.",
                    "signals": [f"Target {el['industry']} operator", "Active digital presence"],
                })

        # Step 6: Format, normalize, and persist leads
        saved_leads = []
        for lead in final_leads:
            lead_id = f"lead-{uuid.uuid4().hex[:10]}"
            # Ensure proper schema fields
            lead_record = {
                "id": lead_id,
                "user_id": user_id,
                "name": f"{lead['company']} Commercial Team",
                "title": f"Key Decision Maker / {lead['industry']}",
                "company": lead["company"],
                "domain": lead.get("domain", ""),
                "industry": lead.get("industry") or target_industry,
                "intentScore": lead.get("intentScore", 85),
                "dealSize": lead.get("dealSize", "Enterprise Tier"),
                "signals": lead.get("signals") or ["Verified LinkedIn Profile", "Apollo Corporate Record"],
                "why_matched": lead.get("why_matched") or "Target customer profile match",
                "personalized_pitch": lead.get("personalized_pitch") or f"Solutions for {lead['company']}",
                "website": lead.get("website", ""),
                "email": lead.get("email", ""),
                "phone": lead.get("phone", ""),
                "linkedin_url": lead.get("linkedin_url", ""),
                "employee_count": lead.get("employee_count"),
                "technologies": lead.get("technologies", []),
                "logo_url": lead.get("logo_url", ""),
                "status": "new",
                "created_at": db._now_iso(),
                "updated_at": db._now_iso(),
            }
            await db.save_prospect_lead(lead_record, user_id=user_id)
            saved_leads.append(lead_record)

        logger.info(f"Prospecting: Successfully discovered, enriched, and stored {len(saved_leads)} leads.")
        return saved_leads

    async def _evaluate_and_pitch_batch(
        self, offering: str, target_industry: str, leads: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Evaluates fit score (60-99%) and generates a personalized opening pitch hook for each lead.
        """
        if not leads:
            return []

        client = _get_groq_client()
        simplified_leads = [
            {
                "index": i,
                "company": l["company"],
                "industry": l["industry"],
                "employee_count": l["employee_count"],
                "technologies": l["technologies"][:4],
                "snippet": l["snippet"][:200],
            }
            for i, l in enumerate(leads)
        ]

        prompt = f"""You are the Chief Commercial Officer at VyaperiX.
Evaluate how well each discovered company fits our offering, and generate a customized high-converting sales opening pitch.

Our Business Offering:
{offering}

Target Industry: {target_industry}

Discovered Prospects:
{json.dumps(simplified_leads, indent=2)}

For each company, output a JSON array of objects with:
- "index": int
- "intentScore": int (between 68 and 98 based on fit)
- "dealSize": string (e.g. "₹3L - ₹6L / yr" or "$15k - $30k ARR")
- "why_matched": string (1 concise sentence explaining the commercial fit)
- "personalized_pitch": string (1 punchy, conversational sentence Riley AI Voice SDR can use as the call opening hook)
- "signals": list of 2-3 short buying signals (e.g. ["Expanding B2B dealer network", "Legacy CRM stack", "High employee headcount"])

Output STRICT JSON only: {{"evaluations": [...]}}
"""
        model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500,
        )
        raw = (resp.choices[0].message.content or "").strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)

        match = re.search(r"(\{[\s\S]*\})", raw)
        eval_map = {}
        if match:
            try:
                parsed = json.loads(match.group(1))
                for item in parsed.get("evaluations", []):
                    idx = item.get("index")
                    if idx is not None:
                        eval_map[idx] = item
            except Exception as e:
                logger.warning(f"Error parsing Groq ICP evaluations: {e}")

        results = []
        for i, lead in enumerate(leads):
            ev = eval_map.get(i, {})
            score = ev.get("intentScore") or (92 - i * 4)
            deal_size = ev.get("dealSize") or "₹2.5L - ₹5L / yr"
            why_matched = ev.get("why_matched") or f"Direct buyer fit for {offering}"
            pitch = (
                ev.get("personalized_pitch")
                or f"Hi, reaching out from VyaperiX regarding our sales automation platform designed for {lead['company']}."
            )
            signals = ev.get("signals") or [f"Active in {lead['industry']}", "Qualified B2B Target"]

            results.append({
                **lead,
                "intentScore": score,
                "dealSize": deal_size,
                "why_matched": why_matched,
                "personalized_pitch": pitch,
                "signals": signals,
            })

        return results

    async def trigger_voice_call(
        self,
        lead_id: str,
        user_id: Optional[str] = None,
        phone_override: Optional[str] = None,
        business_name: Optional[str] = "VyaperiX",
    ) -> Dict[str, Any]:
        """
        Dispatches an autonomous outbound call via Riley Voice SDR (Vapi) to the prospect.
        """
        lead = await db.get_prospect_lead(lead_id)
        if not lead:
            raise ValueError(f"Prospect lead '{lead_id}' not found.")

        target_phone = phone_override or lead.get("phone")
        if not target_phone:
            raise ValueError(
                f"No phone number available for '{lead.get('company')}'. Please provide a phone number."
            )

        call_id = str(uuid.uuid4())
        call_reason = lead.get("personalized_pitch") or f"Consultation on AI Sales Intelligence for {lead.get('company')}"

        call_data = {
            "id": call_id,
            "user_id": user_id,
            "direction": "outbound",
            "customer_name": lead.get("company", "Prospect"),
            "customer_phone": target_phone,
            "business_name": business_name or "VyaperiX",
            "call_reason": call_reason,
            "status": "queued",
            "duration_seconds": 0,
            "transcript": [],
            "analysis": None,
        }

        await db.create_voice_call(call_data, user_id=user_id)

        # Dispatch call asynchronously
        asyncio.create_task(
            voice_engine.dispatch_outbound_call(
                call_id=call_id,
                customer_name=lead.get("company", "Prospect"),
                customer_phone=target_phone,
                business_name=business_name or "VyaperiX",
                call_reason=call_reason,
                language="auto",
                extra_context={
                    "company": lead.get("company"),
                    "domain": lead.get("domain"),
                    "industry": lead.get("industry"),
                    "employee_count": lead.get("employee_count"),
                    "signals": lead.get("signals"),
                },
            )
        )

        # Update lead status
        await db.update_prospect_lead(lead_id, {"status": "in_call", "last_call_id": call_id})

        return {
            "success": True,
            "call_id": call_id,
            "target_phone": target_phone,
            "company": lead.get("company"),
            "pitch": call_reason,
            "status": "queued",
        }

    async def trigger_whatsapp_intro(
        self,
        lead_id: str,
        phone_override: Optional[str] = None,
        custom_message: Optional[str] = None,
        business_name: Optional[str] = "VyaperiX",
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Dispatches a high-converting WhatsApp intro message with an Instant Live Jitsi Video Room link.
        """
        lead = await db.get_prospect_lead(lead_id)
        if not lead:
            raise ValueError(f"Prospect lead '{lead_id}' not found.")

        target_phone = phone_override or lead.get("phone")
        if not target_phone:
            raise ValueError(
                f"No phone number available for '{lead.get('company')}'. Please provide a phone number."
            )

        # Generate live video room link
        live_video_url = generate_live_video_room(
            company_name=business_name or "VyaperiX",
            meeting_id=f"intro-{lead.get('company', 'partner').lower()[:10]}",
        )

        if custom_message and custom_message.strip():
            msg_text = custom_message.strip()
        else:
            company = lead.get("company", "Partner")
            pitch = lead.get("personalized_pitch") or f"We noticed {company}'s market expansion."
            msg_text = (
                f"👋 *Hello {company} Team,*\n\n"
                f"Reaching out from *{business_name or 'VyaperiX'}*.\n\n"
                f"🎯 *Context & Fit:*\n"
                f"{pitch}\n\n"
                f"💡 We have prepared an executive demo for your leadership.\n"
                f"🚀 *Instant Live Video Room:* {live_video_url}\n\n"
                f"Would you be open for a quick 10-minute briefing this week? Simply reply to this chat to pick a time."
            )

        resp = await whatsapp_service.send_whatsapp_message(
            phone=target_phone,
            text=msg_text,
        )

        if resp.get("success"):
            await db.update_prospect_lead(lead_id, {"status": "contacted", "last_whatsapp_at": db._now_iso()})

        return {
            "success": resp.get("success", False),
            "recipient": target_phone,
            "message_id": resp.get("message_id"),
            "live_video_url": live_video_url,
            "message_preview": msg_text,
            "error": resp.get("error"),
        }


# Global singleton
prospecting_engine = AutonomousProspectingEngine()
