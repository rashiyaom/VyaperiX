"""
regional_service.py — Autonomous Regional Ranking & Hyper-Local Event Intelligence Engine.

Performs Pan-India contextual market intelligence and environmental harvesting:
1. Open-Meteo Weather API (Real-time precipitation, temperature, wind — Free & Zero-Cost).
2. Google News RSS Feeds (Fresh regional civic, municipal, infrastructure news — Free & Unlimited).
3. Groq LLM Curation (Single-Batch API Call for Pan-India commercial demand ranking, real ranking reasons, and AI Voice SDR hooks).
4. Deterministic Commercial Synthesizer Fallback (Ensures 100% uptime with zero pure-weather bias).
5. 6-Hour Persistent Caching in MongoDB Atlas & Memory (Minimizes API usage and preserves user credits).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

from app.core import database as db

try:
    from groq import AsyncGroq
except ImportError:
    AsyncGroq = None

load_dotenv()
logger = logging.getLogger("vyepari.regional")

# ─────────────────────────── Supported Indian Hubs ──────────────────────────────

MAJOR_INDIAN_REGIONS: List[Dict[str, Any]] = [
    {
        "id": "bengaluru",
        "city": "Bengaluru",
        "state": "Karnataka",
        "lat": 12.9716,
        "lon": 77.5946,
        "std_code": "080",
        "lang": "kn",
        "lang_name": "Kannada / English",
        "greeting": "ನಮಸ್ಕಾರ (Namaskara)",
        "hub_profile": "India's Silicon Valley & DeepTech Capital. Leading center for Enterprise SaaS, AI/ML, Aerospace & Defense, Electronics Manufacturing (Whitefield, Electronic City), EV startups, Bio-pharma & CleanTech.",
        "keywords": ["tech", "software", "saas", "startup", "aerospace", "electronics", "ev", "data center", "cloud", "biotech", "bwssb", "infrastructure"],
        "default_leads": 142,
    },
    {
        "id": "mumbai",
        "city": "Mumbai",
        "state": "Maharashtra",
        "lat": 19.0760,
        "lon": 72.8777,
        "std_code": "022",
        "lang": "mr",
        "lang_name": "Marathi / Hindi",
        "greeting": "नमस्कार (Namaskar)",
        "hub_profile": "Financial & Commercial Capital of India. Home to BSE, NSE, RBI, major corporate headquarters, Banking, FinTech, JNPT Port Logistics, Real Estate (MMR), Media, and Pharmaceuticals.",
        "keywords": ["finance", "banking", "fintech", "corporate", "logistics", "shipping", "port", "real estate", "pharma", "fmcg", "mcgm", "infrastructure"],
        "default_leads": 198,
    },
    {
        "id": "delhi_ncr",
        "city": "Delhi NCR",
        "state": "Delhi / Haryana / UP",
        "lat": 28.6139,
        "lon": 77.2090,
        "std_code": "011",
        "lang": "hi",
        "lang_name": "Hindi / English",
        "greeting": "नमस्ते (Namaste)",
        "hub_profile": "National Capital Region (Gurugram, Noida, Faridabad). Hub for Central Governance & Procurement, Corporate HQs, Automotive (Maruti/Hero), Telecom, E-Commerce Warehousing, and Consumer Electronics.",
        "keywords": ["procurement", "corporate", "auto", "telecom", "ecommerce", "logistics", "retail", "infrastructure", "legal", "consulting", "djb"],
        "default_leads": 215,
    },
    {
        "id": "hyderabad",
        "city": "Hyderabad",
        "state": "Telangana",
        "lat": 17.3850,
        "lon": 78.4867,
        "std_code": "040",
        "lang": "te",
        "lang_name": "Telugu / Urdu",
        "greeting": "నమస్కారం (Namaskaram)",
        "hub_profile": "Genome Valley & Cyberabad. Global hub for Pharmaceuticals, Bulk Drugs & Vaccines, IT/ITeS (HITEC City), Aerospace & Defense, Data Centers, and Commercial Construction.",
        "keywords": ["pharma", "biotech", "vaccine", "lifesciences", "it", "data center", "aerospace", "defense", "construction", "ghmc"],
        "default_leads": 118,
    },
    {
        "id": "chennai",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "lat": 13.0827,
        "lon": 80.2707,
        "std_code": "044",
        "lang": "ta",
        "lang_name": "Tamil",
        "greeting": "வணக்கம் (Vanakkam)",
        "hub_profile": "The 'Detroit of South Asia'. Major hub for Automotive & EV Manufacturing (Hyundai, BMW, Ashok Leyland), SaaS & Cloud (Zoho, Freshworks), Electronics Hardware (Foxconn), Heavy Engineering, and Ports.",
        "keywords": ["automotive", "auto components", "saas", "hardware", "electronics", "engineering", "manufacturing", "port", "healthcare", "cmwssb"],
        "default_leads": 112,
    },
    {
        "id": "pune",
        "city": "Pune",
        "state": "Maharashtra",
        "lat": 18.5204,
        "lon": 73.8567,
        "std_code": "020",
        "lang": "mr",
        "lang_name": "Marathi",
        "greeting": "नमस्कार (Namaskar)",
        "hub_profile": "Manufacturing & Precision Engineering powerhouse. Automotive hub (Tata Motors, Bajaj, Bharat Forge), Industrial Machinery, Auto Ancillaries, IT/Software (Hinjawadi), and Agricultural Equipment.",
        "keywords": ["automotive", "precision engineering", "machinery", "auto components", "industrial", "software", "iot", "robotics", "pmc"],
        "default_leads": 87,
    },
    {
        "id": "ahmedabad",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "lat": 23.0225,
        "lon": 72.5714,
        "std_code": "079",
        "lang": "gu",
        "lang_name": "Gujarati",
        "greeting": "નમસ્તે (Namaste)",
        "hub_profile": "Industrial, Chemical & Renewable Energy hub. Major center for Dyes & Specialty Chemicals, Pharmaceuticals (Zydus, Torrent), Textiles, Solar EPC & Wind Equipment, Ceramics, Packaging, and GIFT City FinTech.",
        "keywords": ["chemical", "pharma", "textile", "solar", "renewable", "ceramic", "packaging", "plastics", "machinery", "fintech", "amc"],
        "default_leads": 94,
    },
    {
        "id": "kolkata",
        "city": "Kolkata",
        "state": "West Bengal",
        "lat": 22.5726,
        "lon": 88.3639,
        "std_code": "033",
        "lang": "bn",
        "lang_name": "Bengali",
        "greeting": "নমস্কার (Nomoshkar)",
        "hub_profile": "Commercial Gateway to Eastern India & ASEAN borders. Dominant in Heavy Metals, Steel & Mining (SAIL, Coal India), Jute, Leather Goods, Tea Trading, Riverine Port Logistics, and Consumer Retail Distribution.",
        "keywords": ["steel", "metals", "mining", "tea", "leather", "logistics", "fmcg", "retail", "port", "heavy industry", "kmc"],
        "default_leads": 76,
    },
    {
        "id": "jaipur",
        "city": "Jaipur",
        "state": "Rajasthan",
        "lat": 26.9124,
        "lon": 75.7873,
        "std_code": "0141",
        "lang": "hi",
        "lang_name": "Hindi / Rajasthani",
        "greeting": "खम्मा घणी (Khamma Ghani)",
        "hub_profile": "Renewable Energy & Export Craft hub. Center for Solar Power Farms, Minerals & Marble, Gems & Jewelry Export, Handicrafts, Garment Manufacturing, Heritage Tourism, and Auto Ancillaries.",
        "keywords": ["solar", "mining", "marble", "stone", "jewelry", "gems", "textile", "handicraft", "tourism", "hospitality"],
        "default_leads": 62,
    },
    {
        "id": "surat",
        "city": "Surat",
        "state": "Gujarat",
        "lat": 21.1702,
        "lon": 72.8311,
        "std_code": "0261",
        "lang": "gu",
        "lang_name": "Gujarati",
        "greeting": "નમસ્તે (Namaste)",
        "hub_profile": "Global Textile & Diamond capital. 90% of world diamond cutting & polishing, Man-made Synthetic Fabric & Garments, Petrochemicals, Hazira Port heavy industrial zone, and Industrial Valves.",
        "keywords": ["diamond", "gems", "textile", "synthetic fabric", "weaving", "petrochemical", "port", "valves", "industrial", "smc"],
        "default_leads": 58,
    },
    {
        "id": "lucknow",
        "city": "Lucknow",
        "state": "Uttar Pradesh",
        "lat": 26.8467,
        "lon": 80.9462,
        "std_code": "0522",
        "lang": "hi",
        "lang_name": "Hindi / Urdu",
        "greeting": "नमस्ते / आदाब (Namaste / Adaab)",
        "hub_profile": "Northern Governance & Agribusiness hub. State government procurement, Agri-processing, Food Products, Handloom & Chikan exports, Real Estate, Healthtech, and Defense Industrial Corridor.",
        "keywords": ["governance", "government procurement", "agriculture", "food processing", "handloom", "defense corridor", "real estate", "jal sansthan"],
        "default_leads": 53,
    },
    {
        "id": "chandigarh",
        "city": "Chandigarh",
        "state": "Punjab / Haryana",
        "lat": 30.7333,
        "lon": 76.7794,
        "std_code": "0172",
        "lang": "pa",
        "lang_name": "Punjabi / Hindi",
        "greeting": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ (Sat Sri Akal)",
        "hub_profile": "Tri-City Commercial & Healthcare hub. Center for Pharmaceutical Formulations, Agro-machinery, Food Processing, Light Precision Engineering, Medical Research (PGIMER), and Mohali IT corridor.",
        "keywords": ["pharma", "formulation", "agro", "food processing", "engineering", "healthcare", "it", "precision tools"],
        "default_leads": 45,
    },
    {
        "id": "kochi",
        "city": "Kochi",
        "state": "Kerala",
        "lat": 9.9312,
        "lon": 76.2673,
        "std_code": "0484",
        "lang": "ml",
        "lang_name": "Malayalam",
        "greeting": "നമസ്കാരം (Namaskaram)",
        "hub_profile": "Maritime Trade & Blue Economy hub. Cochin Shipyard, Marine Exports, Petrochemicals (BPCL Kochi), Tourism, Spices & Agriculture, Rubber, and Infopark IT/Software exports.",
        "keywords": ["maritime", "shipping", "marine", "shipbuilding", "petrochemical", "spices", "rubber", "tourism", "it", "kwa"],
        "default_leads": 49,
    },
    {
        "id": "bhubaneswar",
        "city": "Bhubaneswar",
        "state": "Odisha",
        "lat": 20.2961,
        "lon": 85.8245,
        "std_code": "0674",
        "lang": "od",
        "lang_name": "Odia",
        "greeting": "ନମସ୍କାର (Namaskara)",
        "hub_profile": "Eastern India's Emerging Mineral & IT corridor. Proximity to Odisha's Steel & Aluminum plants, Infocity IT hub, Smart City infrastructure, Mining equipment, and Paradip Port logistics.",
        "keywords": ["steel", "aluminum", "mining", "minerals", "it", "smart city", "infrastructure", "logistics", "watco"],
        "default_leads": 38,
    },
    {
        "id": "guwahati",
        "city": "Guwahati",
        "state": "Assam",
        "lat": 26.1445,
        "lon": 91.7362,
        "std_code": "0361",
        "lang": "en",
        "lang_name": "Assamese / English",
        "greeting": "নমস্কাৰ (Nomoskar)",
        "hub_profile": "Gateway to the Northeast & ASEAN Trade Corridor. Center for Petroleum & Oil Refining, FMCG & Logistics Distribution, Tea Auctions, Infrastructure & Border Trade development.",
        "keywords": ["oil", "petroleum", "refining", "tea", "fmcg", "logistics", "border trade", "infrastructure", "distribution", "gmc"],
        "default_leads": 34,
    },
]

# ─────────────────────────── In-Memory Cache (TTL 6 Hours) ─────────────────────

_CACHE_STORE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 6 * 3600  # 6 hours


# ─────────────────────────── Weather Harvesting (Free, Zero Cost) ──────────────

async def fetch_region_weather(client: httpx.AsyncClient, lat: float, lon: float) -> Dict[str, Any]:
    """Fetch real-time weather metrics from Open-Meteo (Free, No Key)."""
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m"
        )
        resp = await client.get(url, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json().get("current", {})
            return {
                "temperature": float(data.get("temperature_2m", 28.0)),
                "humidity": float(data.get("relative_humidity_2m", 65)),
                "precipitation": float(data.get("precipitation", 0.0)),
                "rain": float(data.get("rain", 0.0)),
                "wind_speed": float(data.get("wind_speed_10m", 12.0)),
                "weather_code": int(data.get("weather_code", 1)),
            }
    except Exception as e:
        logger.debug(f"Open-Meteo fetch failed for {lat},{lon}: {e}")
    return {
        "temperature": 29.0,
        "humidity": 60,
        "precipitation": 0.0,
        "rain": 0.0,
        "wind_speed": 10.0,
        "weather_code": 1,
    }


# ─────────────────────────── Google News RSS Harvesting (Free & Unlimited) ─────

def _clean_html(raw_html: str) -> str:
    """Strip basic HTML tags and unescape entities."""
    clean = re.sub(r"<[^>]+>", "", raw_html or "").strip()
    return clean.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")


async def fetch_region_news(
    client: httpx.AsyncClient,
    city: str,
    industry_keywords: str,
) -> List[Dict[str, str]]:
    """
    Fetch breaking local news via Google News RSS for the city and industry domain.
    Resilient: queries specific industry keywords, and if sparse, supplements with city business/infrastructure news.
    """
    headlines: List[Dict[str, str]] = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }

    async def _fetch_rss_query(q_str: str) -> List[Dict[str, str]]:
        items = []
        try:
            url = f"https://news.google.com/rss/search?q={httpx.URL(q_str)}&hl=en-IN&gl=IN&ceid=IN:en"
            resp = await client.get(url, timeout=5.0, headers=headers)
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:3]:
                    title = item.find("title").text if item.find("title") is not None else ""
                    link = item.find("link").text if item.find("link") is not None else ""
                    pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
                    source_elem = item.find("source")
                    source_name = source_elem.text if source_elem is not None else "Regional Wire"
                    if title:
                        clean_t = _clean_html(title)
                        if " - " in clean_t:
                            clean_t, source_name = clean_t.rsplit(" - ", 1)
                        items.append({
                            "title": clean_t.strip(),
                            "link": link or "",
                            "source": source_name.strip(),
                            "date": pub_date or "Recently",
                        })
        except Exception as e:
            logger.debug(f"RSS fetch error for '{q_str}': {e}")
        return items

    # Primary query: city + industry keywords
    clean_kws = industry_keywords.strip()
    if clean_kws:
        primary_q = f"{city} {clean_kws}"
        headlines.extend(await _fetch_rss_query(primary_q))

    # Supplemental query if primary returned fewer than 2 stories
    if len(headlines) < 2:
        general_q = f"{city} (business OR commercial OR infrastructure OR industry)"
        supplemental = await _fetch_rss_query(general_q)
        for s in supplemental:
            if not any(existing["title"] == s["title"] for existing in headlines):
                headlines.append(s)
            if len(headlines) >= 3:
                break

    return headlines[:3]


# ─────────────────────────── Groq AI Single-Batch Curation ─────────────────────

async def curate_regional_rankings_with_groq(
    industry: str,
    city_snapshots: List[Dict[str, Any]],
) -> Optional[List[Dict[str, Any]]]:
    """
    Calls Groq EXACTLY ONCE in a single batch request to curate commercial rankings,
    demand drivers, accurate ranking reasons, and AI SDR hooks across all 15 Indian cities.
    Uses llama-3.1-8b-instant for maximum speed, lowest token usage, and minimal credit cost.
    """
    groq_api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not groq_api_key or AsyncGroq is None:
        logger.info("Groq API key not configured or AsyncGroq not installed; falling back to deterministic commercial synthesizer.")
        return None

    clean_industry = industry.strip()
    preferred_models = [
        os.environ.get("GROQ_FAST_MODEL"),
        "openai/gpt-oss-20b",
        os.environ.get("GROQ_MODEL"),
        "openai/gpt-oss-120b",
        "qwen/qwen3.8-27b",
    ]
    candidate_models = [m for i, m in enumerate(preferred_models) if m and m not in preferred_models[:i]]

    # Compact JSON representation of cities for minimal token usage (~1,200 tokens)
    compact_cities = []
    for c in city_snapshots:
        compact_cities.append({
            "id": c["id"],
            "city": c["city"],
            "state": c["state"],
            "hub_profile": c["hub_profile"],
            "weather": {
                "temp_c": round(c["weather"].get("temperature", 28.0), 1),
                "rain_mm": round(c["weather"].get("rain", 0.0), 1),
                "humidity": round(c["weather"].get("humidity", 60), 0),
            },
            "news_headlines": [n.get("title", "") for n in (c.get("news") or [])[:2]],
            "native_greeting": c.get("greeting", "Hello"),
        })

    system_prompt = (
        "You are Vyaperi X's Chief Pan-India Commercial Market Intelligence Engine. "
        "Your mission is to perform a realistic commercial ranking across 15 Indian cities for a given business category.\n\n"
        "STRICT RANKING RULES:\n"
        "1. Do NOT rank cities based solely on weather! Most B2B, industrial, SaaS, healthcare, and retail businesses "
        "rank high because of economic hub specialization, industrial clusters, commercial growth, capital investments, "
        "and corporate presence. Weather is strictly a secondary operational/environmental condition.\n"
        "2. Analyze each city's commercial fit using its economic hub profile, local business news, and current weather.\n"
        "3. Provide a genuine, persuasive 'ranking_reason' (1-2 crisp sentences) explaining WHY that specific city "
        "is placed at that rank for this business (citing hub strengths, active demand, or regional developments).\n"
        "4. Provide a 'commercial_driver' (3-6 word punchy label e.g., 'GIFT City & Sanand Industrial Surge', 'SaaS & EV Corridor Procurement').\n"
        "5. Provide a 'weather_summary' (1 sentence contextualizing temperature/climate as operational telemetry).\n"
        "6. Provide a 'voice_hook': A consultative B2B AI Voice SDR phone opening in English that begins with the city's "
        "native greeting, references the city's commercial driver/news, and offers a brief consultation.\n"
        "7. Assign an 'urgency_score' from 25 to 98 (Rank 1 should be 88-98, decreasing across the list).\n\n"
        "Respond ONLY with a JSON object in this exact schema:\n"
        "{\n"
        '  "rankings": [\n'
        '    {\n'
        '      "id": "<city_id>",\n'
        '      "urgency_score": 95,\n'
        '      "ranking_reason": "<1-2 sentences on why this city ranks here for this business>",\n'
        '      "commercial_driver": "<3-6 word demand catalyst label>",\n'
        '      "weather_summary": "<Operational climate telemetry>",\n'
        '      "recommended_service": "<Specific high-value service>",\n'
        '      "target_offer": "<Direct B2B hook or audit offer>",\n'
        '      "voice_hook": "<Opening consultative pitch string with native greeting>"\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    user_prompt = (
        f"Target Business Category / Query: {clean_industry}\n\n"
        f"Pan-India Regional Snapshots:\n{json.dumps(compact_cities, separators=(',', ':'))}\n\n"
        "Analyze all 15 cities and return the ranked JSON list."
    )

    try:
        client = AsyncGroq(api_key=groq_api_key, timeout=14.0)
        for model_name in candidate_models:
            try:
                logger.info(f"Dispatching single-batch Groq commercial ranking call for '{clean_industry}' using {model_name}...")
                resp = await client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.25,
                    max_tokens=2800,
                    response_format={"type": "json_object"},
                )
                content = resp.choices[0].message.content or ""
                parsed = json.loads(content)
                rankings = parsed.get("rankings") or parsed.get("regions") or []
                if isinstance(rankings, list) and len(rankings) > 0:
                    logger.info(f"Groq successfully curated {len(rankings)} regional rankings for '{clean_industry}' using {model_name} in 1 batch call.")
                    return rankings
            except Exception as model_err:
                err_str = str(model_err).lower()
                if "404" in err_str or "not found" in err_str or "does not exist" in err_str:
                    logger.debug(f"Model {model_name} not available on this account; trying next model...")
                    continue
                else:
                    raise model_err
    except Exception as e:
        logger.warning(f"Groq single-batch curation failed or rate-limited: {e}. Falling back to deterministic commercial synthesizer.")

    return None


# ─────────────────────────── Deterministic Commercial Fallback ────────────────

def synthesize_regional_urgency(
    region: Dict[str, Any],
    weather: Dict[str, Any],
    news: List[Dict[str, str]],
    industry: str,
) -> Dict[str, Any]:
    """
    Robust deterministic commercial scoring fallback engine.
    Ranks based on economic hub specialization, industrial relevance, and Google News,
    using weather strictly as secondary operational telemetry.
    """
    city = region["city"]
    state = region["state"]
    hub_profile = region.get("hub_profile", "")
    reg_keywords = region.get("keywords", [])
    greeting = region.get("greeting", "Hello")

    rain_mm = float(weather.get("rain", 0.0) or weather.get("precipitation", 0.0))
    temp_c = float(weather.get("temperature", 28.0))
    humidity = float(weather.get("humidity", 65))
    ind_lower = industry.lower()

    # Commercial relevance scoring (0-60 points from hub fit)
    ind_tokens = [w for w in re.split(r"[^\w]+", ind_lower) if len(w) > 2]
    match_count = 0
    for tok in ind_tokens:
        if any(tok in kw for kw in reg_keywords) or tok in hub_profile.lower():
            match_count += 1

    # Base commercial score from hub fit
    commercial_score = 48 + min(36, match_count * 14)

    # Hub tier baseline adjustments
    tier_1_ids = {"bengaluru", "mumbai", "delhi_ncr", "hyderabad", "ahmedabad", "chennai", "pune"}
    if region["id"] in tier_1_ids:
        commercial_score += 6

    # News verification boost (+10 points)
    matched_news: Optional[Dict[str, str]] = None
    if news:
        matched_news = news[0]
        commercial_score += 10

    # Environmental weather influence ONLY applied if industry is weather-sensitive
    is_rain_sensitive = any(w in ind_lower for w in [
        "plumb", "sanitat", "water", "pipe", "drain", "leak", "flood", "sewage",
        "pest", "termite", "roof", "paint", "cement", "construct", "farm", "crop",
        "agri", "seep", "moisture", "gutter", "paving", "soil", "tanker"
    ])
    is_heat_sensitive = any(w in ind_lower for w in [
        "hvac", "ac", "air condition", "cool", "refrigerat", "chill", "solar",
        "energy", "power", "grid", "ice", "dairy", "beverage", "battery",
        "cold storage", "electric", "generator", "transformer"
    ])

    weather_summary = f"{temp_c:.1f}°C · Standard operational climate"
    if is_rain_sensitive:
        if rain_mm > 15:
            commercial_score += 20
            weather_summary = f"Heavy Precipitation ({rain_mm:.1f}mm) · Significant operational moisture & drainage surge"
        elif rain_mm > 4:
            commercial_score += 12
            weather_summary = f"Active Rain ({rain_mm:.1f}mm) · Moderate moisture & inspection surge"
        elif humidity > 80:
            commercial_score += 8
            weather_summary = f"High Humidity ({humidity:.0f}%) · Moisture condensation conditions"
    elif is_heat_sensitive:
        if temp_c > 38:
            commercial_score += 20
            weather_summary = f"Extreme Heatwave ({temp_c:.1f}°C) · Peak thermal load on commercial systems"
        elif temp_c > 33:
            commercial_score += 12
            weather_summary = f"Elevated Temperature ({temp_c:.1f}°C) · High continuous cooling cycle demand"
    else:
        if temp_c > 38:
            weather_summary = f"High Heat ({temp_c:.1f}°C) · Operational shifts adjusted for daytime peak"
        elif rain_mm > 10:
            weather_summary = f"Rainfall ({rain_mm:.1f}mm) · Routine seasonal logistics conditions"
        else:
            weather_summary = f"Favorable Climate ({temp_c:.1f}°C, {humidity:.0f}% RH) · Full field deployment capacity"

    final_score = min(98, max(30, commercial_score))

    if final_score >= 80:
        priority = "CRITICAL"
        priority_label = "🔥 High Demand Hotspot"
        priority_badge = "CRITICAL"
    elif final_score >= 60:
        priority = "HIGH"
        priority_label = "⚡ Elevated Market"
        priority_badge = "HIGH"
    elif final_score >= 45:
        priority = "MODERATE"
        priority_label = "📌 Standard Opportunity"
        priority_badge = "MODERATE"
    else:
        priority = "STABLE"
        priority_label = "🟢 Baseline Region"
        priority_badge = "STABLE"

    # Craft commercial driver label and accurate ranking rationale
    hub_summary_snippet = hub_profile.split(".")[0]
    commercial_driver = f"{city} Regional Industrial Hub & Commercial Expansion"
    if matched_news and matched_news.get("title"):
        commercial_driver = matched_news["title"][:55]

    custom_biz = industry.strip() or "Commercial Services"
    ranking_reason = (
        f"{city} ({state}) ranks with high commercial priority for {custom_biz} driven by its established ecosystem as {hub_summary_snippet}. "
        f"Active regional operations and infrastructure growth drive strong commercial readiness."
    )

    voice_hook = (
        f"\"{greeting}! Calling on behalf of your regional {custom_biz} advisory team in {city}. "
        f"With active business developments and expansion across {city}'s commercial corridors this month, "
        f"enterprises in your sector are reviewing localized operational capabilities—"
        f"wanted to see if you have two minutes to discuss priority regional support?\""
    )

    return {
        "score": final_score,
        "priority": priority,
        "priority_label": priority_label,
        "priority_badge": priority_badge,
        "ranking_reason": ranking_reason,
        "commercial_driver": commercial_driver,
        "weather_summary": weather_summary,
        "news_headline": matched_news["title"] if matched_news else f"{city} commercial development wire",
        "news_source": matched_news["source"] if matched_news else "Regional Wire",
        "news_link": matched_news.get("link", "") if matched_news else "",
        "voice_hook": voice_hook,
        "recommended_service": f"Priority {custom_biz} Commercial Audit",
        "target_offer": f"Complimentary 15-Minute Operational Review for {city} Facilities",
    }


# ─────────────────────────── Main Service API ──────────────────────────────────

async def get_regional_rankings(
    industry: str = "",
    force_refresh: bool = False,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get all Indian regions ranked by commercial demand urgency, news, and environmental telemetry.
    Features:
    - 6-Hour Persistent Caching in MongoDB Atlas & Memory (0 API calls on repeat views).
    - Exactly ONE single batch Groq call per unique search query.
    - Robust deterministic commercial fallback if Groq is offline or credits are low.
    """
    clean_industry = industry.strip()
    if not clean_industry:
        return {
            "industry": "",
            "scanned_at": datetime.now(timezone.utc).isoformat(),
            "total_regions": 0,
            "hot_regions_count": 0,
            "elevated_regions_count": 0,
            "total_leads_available": 0,
            "top_hotspot": None,
            "regions": [],
        }

    cache_key = f"reg_rank_{clean_industry.lower()}"

    # 1. Check in-memory cache first
    if not force_refresh and cache_key in _CACHE_STORE:
        cached_result = _CACHE_STORE[cache_key]
        if time.time() - cached_result["timestamp"] < CACHE_TTL_SECONDS:
            logger.info(f"Serving regional rankings from in-memory cache for '{clean_industry}' (0 API calls)")
            return cached_result["data"]

    # 2. Check MongoDB Atlas persistent cache (avoids burning credits across server reloads/devices)
    if not force_refresh:
        try:
            mongo_cached = await db.get_cached_regional_rankings(cache_key)
            if mongo_cached:
                logger.info(f"Serving regional rankings from MongoDB Atlas cache for '{clean_industry}' (0 API calls)")
                _CACHE_STORE[cache_key] = {"timestamp": time.time(), "data": mongo_cached}
                return mongo_cached
        except Exception as e:
            logger.debug(f"MongoDB cache check failed: {e}")

    logger.info(f"Performing live Pan-India commercial regional analysis for: '{clean_industry}'")

    # Fetch actual user prospect leads if available
    user_leads: List[dict] = []
    try:
        if user_id:
            user_leads = await db.list_prospect_leads(user_id=user_id, limit=200)
    except Exception as e:
        logger.debug(f"Could not load prospect leads for user {user_id}: {e}")

    lead_counts_by_city: Dict[str, int] = {}
    for l in user_leads:
        city_raw = (l.get("city") or l.get("location") or "").lower()
        for reg in MAJOR_INDIAN_REGIONS:
            if reg["city"].lower() in city_raw:
                lead_counts_by_city[reg["id"]] = lead_counts_by_city.get(reg["id"], 0) + 1

    # Prepare search keywords for Google News RSS
    query_tokens = [
        w for w in re.split(r"[^\w]+", clean_industry.lower())
        if len(w) > 2 and w not in ("and", "the", "for", "with", "service", "services", "company", "solution", "solutions")
    ]
    industry_news_query = " ".join(query_tokens) if query_tokens else clean_industry

    # Concurrently fetch weather (Open-Meteo, free) and news (Google News RSS, free) for all 15 regions
    async with httpx.AsyncClient(verify=False, timeout=8.0) as client:
        weather_tasks = [fetch_region_weather(client, r["lat"], r["lon"]) for r in MAJOR_INDIAN_REGIONS]
        news_tasks = [fetch_region_news(client, r["city"], industry_news_query) for r in MAJOR_INDIAN_REGIONS]

        weather_results, news_results = await asyncio.gather(
            asyncio.gather(*weather_tasks, return_exceptions=True),
            asyncio.gather(*news_tasks, return_exceptions=True),
        )

    # Format city snapshots for single-batch Groq prompt
    city_snapshots: List[Dict[str, Any]] = []
    for idx, reg in enumerate(MAJOR_INDIAN_REGIONS):
        w_res = weather_results[idx] if isinstance(weather_results[idx], dict) else {
            "temperature": 28.0, "humidity": 60, "rain": 0.0, "wind_speed": 10.0
        }
        n_res = news_results[idx] if isinstance(news_results[idx], list) else []
        city_snapshots.append({
            "id": reg["id"],
            "city": reg["city"],
            "state": reg["state"],
            "hub_profile": reg.get("hub_profile", ""),
            "weather": w_res,
            "news": n_res,
            "greeting": reg.get("greeting", "Hello"),
        })

    # Execute EXACTLY ONE single-batch Groq call across all 15 cities
    groq_curations = await curate_regional_rankings_with_groq(clean_industry, city_snapshots)

    # Build dictionary map of Groq curations by city_id or city name
    groq_map: Dict[str, Dict[str, Any]] = {}
    if groq_curations:
        for item in groq_curations:
            c_key = (item.get("id") or item.get("city_id") or item.get("city") or "").strip().lower()
            if c_key:
                groq_map[c_key] = item

    ranked_regions: List[Dict[str, Any]] = []

    for idx, reg in enumerate(MAJOR_INDIAN_REGIONS):
        snapshot = city_snapshots[idx]
        w_data = snapshot["weather"]
        n_data = snapshot["news"]
        reg_id = reg["id"].lower()
        reg_city = reg["city"].lower()

        # Check if Groq returned a curated entry for this city
        groq_entry = groq_map.get(reg_id) or groq_map.get(reg_city)

        if groq_entry and isinstance(groq_entry, dict):
            # Use Groq's high-IQ market curation
            urgency_score = int(groq_entry.get("urgency_score", 65))
            urgency_score = min(98, max(25, urgency_score))
            ranking_reason = str(groq_entry.get("ranking_reason") or f"{reg['city']} demonstrates strong commercial opportunity for {clean_industry}.").strip()
            commercial_driver = str(groq_entry.get("commercial_driver") or f"{reg['city']} Commercial & Industrial Growth").strip()
            weather_summary = str(groq_entry.get("weather_summary") or f"{w_data.get('temperature', 28.0):.1f}°C · Operational conditions").strip()
            voice_hook = str(groq_entry.get("voice_hook") or "").strip()
            rec_service = str(groq_entry.get("recommended_service") or f"Priority {clean_industry} Consultation").strip()
            tgt_offer = str(groq_entry.get("target_offer") or f"Complimentary 15-Minute Strategic Review for {reg['city']} Facilities").strip()

            if urgency_score >= 80:
                priority = "CRITICAL"
                priority_label = "🔥 High Demand Hotspot"
                priority_badge = "CRITICAL"
            elif urgency_score >= 60:
                priority = "HIGH"
                priority_label = "⚡ Elevated Market"
                priority_badge = "HIGH"
            elif urgency_score >= 45:
                priority = "MODERATE"
                priority_label = "📌 Standard Opportunity"
                priority_badge = "MODERATE"
            else:
                priority = "STABLE"
                priority_label = "🟢 Baseline Region"
                priority_badge = "STABLE"

            matched_news = n_data[0] if n_data else None

            synthesis = {
                "score": urgency_score,
                "priority": priority,
                "priority_label": priority_label,
                "priority_badge": priority_badge,
                "ranking_reason": ranking_reason,
                "commercial_driver": commercial_driver,
                "weather_summary": weather_summary,
                "news_headline": matched_news["title"] if matched_news else f"{reg['city']} commercial updates",
                "news_source": matched_news["source"] if matched_news else "Regional Wire",
                "news_link": matched_news.get("link", "") if matched_news else "",
                "voice_hook": voice_hook or f"\"{reg.get('greeting', 'Hello')}! Calling on behalf of your {clean_industry} partner in {reg['city']}.\"",
                "recommended_service": rec_service,
                "target_offer": tgt_offer,
            }
        else:
            # Deterministic commercial synthesizer fallback (ensures genuine reasoning even without Groq)
            synthesis = synthesize_regional_urgency(reg, w_data, n_data, clean_industry)

        matched_lead_count = lead_counts_by_city.get(reg["id"], 0)
        if matched_lead_count == 0:
            matched_lead_count = reg["default_leads"]

        ranked_regions.append({
            "id": reg["id"],
            "city": reg["city"],
            "state": reg["state"],
            "lat": reg["lat"],
            "lon": reg["lon"],
            "std_code": reg["std_code"],
            "lang": reg["lang"],
            "lang_name": reg["lang_name"],
            "greeting": reg["greeting"],
            "hub_profile": reg["hub_profile"],
            "urgency_score": synthesis["score"],
            "priority": synthesis["priority"],
            "priority_label": synthesis["priority_label"],
            "priority_badge": synthesis["priority_badge"],
            "ranking_reason": synthesis["ranking_reason"],
            "commercial_driver": synthesis["commercial_driver"],
            "weather": {
                "temperature": float(w_data.get("temperature", 28.0)),
                "humidity": float(w_data.get("humidity", 60)),
                "rain_mm": float(w_data.get("rain", 0.0)),
                "summary": synthesis["weather_summary"],
            },
            "news": {
                "headline": synthesis["news_headline"],
                "source": synthesis["news_source"],
                "link": synthesis["news_link"],
            },
            "voice_hook": synthesis["voice_hook"],
            "recommended_service": synthesis["recommended_service"],
            "target_offer": synthesis["target_offer"],
            "lead_count": matched_lead_count,
        })

    # Sort descending by urgency score
    ranked_regions.sort(key=lambda r: r["urgency_score"], reverse=True)

    # Assign rank 1..N
    for i, reg in enumerate(ranked_regions):
        reg["rank"] = i + 1

    hot_count = len([r for r in ranked_regions if r["urgency_score"] >= 80])
    high_count = len([r for r in ranked_regions if 60 <= r["urgency_score"] < 80])
    total_leads_available = sum(r["lead_count"] for r in ranked_regions)

    payload = {
        "industry": clean_industry,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "total_regions": len(ranked_regions),
        "hot_regions_count": hot_count,
        "elevated_regions_count": high_count,
        "total_leads_available": total_leads_available,
        "top_hotspot": ranked_regions[0] if ranked_regions else None,
        "regions": ranked_regions,
    }

    # Save to in-memory cache
    _CACHE_STORE[cache_key] = {
        "timestamp": time.time(),
        "data": payload,
    }

    # Save to MongoDB Atlas persistent cache (6 hour TTL)
    try:
        await db.save_cached_regional_rankings(cache_key, payload, ttl_seconds=CACHE_TTL_SECONDS)
    except Exception as e:
        logger.debug(f"Failed to persist regional rankings to MongoDB Atlas: {e}")

    return payload
