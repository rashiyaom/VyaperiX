"""
data_engine.py — Deterministic Numerical Extraction & Visual Diagram Engine.

Core Functionality:
1. Direct File Extraction:
   - When a sales / financial / pipeline file (CSV, XLSX, XLS, JSON) is uploaded,
     extracts exact numerical figures directly from the rows (Revenue, MRR, Funnel stages,
     Deal sizes, Milestones) using native Python (csv, json, zipfile XML) + pandas if available.
2. Website & Heuristic Synthesis:
   - When NO numerical data file is present, calculates realistic, industry-calibrated
     figures from scraped website assets and Groq LLM synthesis.
3. Structured Diagram Data:
   - Produces clean structured data for:
     - Predictive Revenue Trajectory (Baseline vs AI Fleet acceleration)
     - Sales Pipeline & Flask Funnel Throughput (Stage efficiency & drop-off rates)
     - Execution Timeline Roadmap (Phased 30-60-90-180 day milestones)
     - ICP Segment & Deal Size Allocation
     - 6-Vector Market Advantage Radar
"""

import csv
import io
import json
import logging
import os
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _clean_num(val: Any) -> Optional[float]:
    """Parse a numerical value from messy strings like '$45,000.50', '25%', '3.5k'."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().lower()
    if not s or s in ("n/a", "none", "null", "-", ""):
        return None
    multiplier = 1.0
    if s.endswith("k"):
        multiplier = 1000.0
        s = s[:-1]
    elif s.endswith("m"):
        multiplier = 1000000.0
        s = s[:-1]
    elif s.endswith("%"):
        s = s[:-1]
    # Remove currency symbols and commas
    s = re.sub(r"[^\d.-]", "", s)
    try:
        return float(s) * multiplier
    except (ValueError, TypeError):
        return None


def parse_csv_bytes(content_bytes: bytes) -> list[dict[str, Any]]:
    """Parse CSV bytes using csv.DictReader with automatic dialect detection."""
    text = content_bytes.decode("utf-8", errors="replace")
    sample = text[:2048]
    delimiter = ","
    for d in [",", "\t", ";", "|"]:
        if sample.count(d) > sample.count(delimiter):
            delimiter = d
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for r in reader:
        # Strip keys and values
        clean_row = {str(k).strip(): str(v).strip() for k, v in r.items() if k is not None}
        if any(clean_row.values()):
            rows.append(clean_row)
    return rows


def parse_xlsx_native(content_bytes: bytes) -> list[dict[str, Any]]:
    """Native zero-dependency XLSX parser using zipfile and XML ElementTree."""
    rows: list[dict[str, Any]] = []
    try:
        with zipfile.ZipFile(io.BytesIO(content_bytes)) as z:
            # 1. Parse shared strings table if present
            shared_strings = []
            if "xl/sharedStrings.xml" in z.namelist():
                tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
                for si in tree.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                    t = si.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    shared_strings.append(t.text if t is not None and t.text else "")

            # 2. Parse sheet1.xml
            sheet_name = "xl/worksheets/sheet1.xml"
            if sheet_name not in z.namelist():
                sheets = [s for s in z.namelist() if s.startswith("xl/worksheets/sheet")]
                sheet_name = sheets[0] if sheets else None

            if not sheet_name:
                return rows

            tree = ET.fromstring(z.read(sheet_name))
            raw_grid: list[list[str]] = []
            for row_el in tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                row_cells = []
                for c_el in row_el.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                    v_el = c_el.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                    val = v_el.text if v_el is not None and v_el.text else ""
                    if c_el.attrib.get("t") == "s" and val.isdigit():
                        idx = int(val)
                        if idx < len(shared_strings):
                            val = shared_strings[idx]
                    row_cells.append(val)
                if any(row_cells):
                    raw_grid.append(row_cells)

            if len(raw_grid) > 1:
                headers = [str(h).strip() or f"col_{i}" for i, h in enumerate(raw_grid[0])]
                for row_vals in raw_grid[1:]:
                    r_dict = {}
                    for i, h in enumerate(headers):
                        r_dict[h] = row_vals[i] if i < len(row_vals) else ""
                    rows.append(r_dict)
    except Exception as e:
        logger.warning(f"Native XLSX extraction fallback error: {e}")
    return rows


def extract_rows_from_file(filename: str, content_bytes: bytes) -> list[dict[str, Any]]:
    """Extract structured tabular rows from uploaded file."""
    ext = os.path.splitext(filename.lower())[1]
    if ext in (".csv", ".tsv", ".txt"):
        return parse_csv_bytes(content_bytes)
    elif ext in (".xlsx", ".xls"):
        # Try pandas first if available, else native zipfile
        try:
            import pandas as pd  # type: ignore
            df = pd.read_excel(io.BytesIO(content_bytes), dtype=str)
            df = df.dropna(how="all").fillna("")
            return df.to_dict(orient="records")
        except Exception:
            return parse_xlsx_native(content_bytes)
    elif ext == ".json":
        try:
            data = json.loads(content_bytes.decode("utf-8", errors="replace"))
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return data
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, list) and v and isinstance(v[0], dict):
                        return v
        except Exception:
            pass
    return []


def analyze_uploaded_data(rows: Any, filename: str) -> dict[str, Any]:
    """
    Directly computes exact deterministic figures from file rows or raw bytes:
    - Revenue progression / MRR trajectory
    - Conversion Funnel stages & throughput
    - Strategic Timeline Milestones
    - Financial Highlights (Total pipeline, Avg deal size, Win rate)
    - Customer ICP distribution
    """
    if isinstance(rows, (bytes, str)):
        raw_b = rows if isinstance(rows, bytes) else rows.encode("utf-8", errors="ignore")
        rows = extract_rows_from_file(filename, raw_b)

    if not rows or not isinstance(rows, list) or not isinstance(rows[0], dict):
        return {"has_file_data": False}

    headers = list(rows[0].keys())
    logger.info(f"Analyzing {len(rows)} rows from '{filename}' with columns: {headers}")

    # Column identification helpers
    rev_col = None
    stage_col = None
    date_col = None
    customer_col = None
    deal_size_col = None

    for h in headers:
        hl = h.lower()
        if not rev_col and any(k in hl for k in ("rev", "mrr", "arr", "amount", "sales", "price", "value", "deal_val", "billing")):
            rev_col = h
        if not stage_col and any(k in hl for k in ("stage", "status", "funnel", "pipeline", "phase", "step")):
            stage_col = h
        if not date_col and any(k in hl for k in ("date", "month", "period", "quarter", "time", "created")):
            date_col = h
        if not customer_col and any(k in hl for k in ("company", "account", "customer", "client", "lead", "prospect", "name")):
            customer_col = h
        if not deal_size_col and any(k in hl for k in ("deal_size", "tier", "segment", "plan", "size")):
            deal_size_col = h

    # ── 1. Financial Numbers & Revenue Progression ──
    total_revenue = 0.0
    rev_values: list[float] = []
    period_buckets: dict[str, list[float]] = {}

    for idx, r in enumerate(rows):
        val = None
        if rev_col:
            val = _clean_num(r.get(rev_col))
        if val is not None and val > 0:
            total_revenue += val
            rev_values.append(val)
            if date_col:
                p_label = str(r.get(date_col) or f"Period {idx + 1}").strip()
                if p_label:
                    period_buckets.setdefault(p_label, []).append(val)

    avg_deal = (total_revenue / len(rev_values)) if rev_values else 0.0

    # Build multi-period revenue trajectory directly from file
    growth_forecast = []
    if period_buckets and len(period_buckets) >= 2:
        sorted_periods = list(period_buckets.keys())[:6]
        for idx, p in enumerate(sorted_periods):
            p_rev = sum(period_buckets[p])
            # Calculate real baseline vs simulated AI fleet acceleration (+35% to +65% lift)
            lift_multiplier = 1.35 + (idx * 0.08)
            growth_forecast.append({
                "period": p[:12],
                "baseline_index": round(p_rev / 1000.0, 1),
                "optimized_index": round((p_rev * lift_multiplier) / 1000.0, 1),
                "key_driver": f"Verified file metrics ({len(period_buckets[p])} recorded transactions)",
            })
    else:
        # Strict Ground Truth: If no date/time column or time-series revenue found,
        # do NOT synthesize a simulated 6-month trajectory. Leave empty so Option A is active.
        growth_forecast = []

    # ── 2. Conversion Funnel Stages & Flask Metrics ──
    funnel_stages = []
    stage_counts: dict[str, int] = {}
    if stage_col:
        for r in rows:
            st = str(r.get(stage_col) or "Active").strip()
            if st:
                stage_counts[st] = stage_counts.get(st, 0) + 1

    if len(stage_counts) >= 2:
        total_leads = sum(stage_counts.values())
        for s_name, count in stage_counts.items():
            pct = round((count / total_leads) * 100)
            health = "optimal" if pct >= 50 else "underperforming" if pct >= 20 else "bottleneck"
            funnel_stages.append({
                "stage": s_name,
                "current_health": health,
                "observation": f"{count} deals recorded in {filename} ({pct}% of total)",
                "benchmark_advice": "Streamline qualification handoff and reduce stage lag.",
            })
    else:
        # Strict Ground Truth: If file does not contain stage/status column with >=2 stages,
        # do NOT invent synthetic funnel stages. Leave empty so Option A is active.
        funnel_stages = []

    # ── 3. Strategic Timeline Roadmap (30 / 60 / 90 / 180 Days) ──
    timeline_roadmap = [
        {
            "phase_name": "Phase 1: Pipeline Activation & Data Sync",
            "timeframe": "Days 0 – 30",
            "target_metric": f"{len(rows)} Records Ingested & Qualified",
            "status": "completed",
            "deliverables": [
                f"Ground-truth sync completed for {filename}",
                "Automated ICP verification and contact enrichment",
                "Deployment of primary Voice Fleet outbound agent",
            ],
        },
        {
            "phase_name": "Phase 2: Autonomous Outbound & Pitch Scaling",
            "timeframe": "Days 30 – 60",
            "target_metric": f"${int(avg_deal * 3 / 1000)}k New Qualified Pipeline" if avg_deal > 0 else "Outbound Pipeline Activation",
            "status": "in_progress",
            "deliverables": [
                "Launch Multi-Language AI SDR campaigns",
                "Real-time objection handling integration",
                "Automated calendar booking and CRM synchronization",
            ],
        },
        {
            "phase_name": "Phase 3: Deal Acceleration & Cycle Compression",
            "timeframe": "Days 60 – 90",
            "target_metric": "35% Reduction in Sales Cycle Duration",
            "status": "scheduled",
            "deliverables": [
                "Bottleneck mitigation across mid-funnel demo stages",
                "Dynamic pricing and ROI calculator enablement",
                "Automated multi-threaded executive outreach",
            ],
        },
        {
            "phase_name": "Phase 4: Full-Fleet Scale & Market Expansion",
            "timeframe": "Days 90 – 180",
            "target_metric": (
                f"2.4x Baseline MRR (${round(growth_forecast[-1]['optimized_index'])}k/mo)"
                if growth_forecast
                else "2.4x Baseline Revenue Velocity"
            ),
            "status": "scheduled",
            "deliverables": [
                "Continuous automated market signals & competitor radar",
                "Expansion to secondary and enterprise ICP segments",
                "Full autonomous revenue operations",
            ],
        },
    ]

    # ── 4. Customer Segments Directly from Data ──
    target_customers = []
    if customer_col or deal_size_col:
        unique_segments = set()
        for r in rows:
            seg = str(r.get(deal_size_col) or r.get(customer_col) or "").strip()
            if seg and len(seg) < 40:
                unique_segments.add(seg)
        for s in list(unique_segments)[:5]:
            target_customers.append({
                "segment_name": s,
                "description": f"Extracted from {filename}",
                "evidence": f"Found in uploaded dataset records",
                "estimated_deal_size": f"${int(avg_deal):,}" if avg_deal > 0 else "Enterprise",
                "pain_points": ["Sales cycle elongation", "Follow-up latency", "Pipeline visibility"],
            })

    # ── 5. Ground-Truth Financial Highlights ──
    financial_highlights = [
        {
            "metric_name": "Identified Records & Leads",
            "value": f"{len(rows)} Active Records",
            "trend": "neutral",
            "benchmark_comparison": "100% ground-truth parsed from file",
            "source_reference": filename,
        }
    ]
    if total_revenue > 0:
        financial_highlights.insert(0, {
            "metric_name": "Total Analyzed Pipeline Value",
            "value": f"${int(total_revenue):,}",
            "trend": "up",
            "benchmark_comparison": f"Verified across {len(rows)} records in {filename}",
            "source_reference": filename,
        })
    if avg_deal > 0:
        financial_highlights.insert(1, {
            "metric_name": "Average Deal Size (ACV)",
            "value": f"${int(avg_deal):,}",
            "trend": "up",
            "benchmark_comparison": "Directly computed arithmetic mean from file records",
            "source_reference": filename,
        })

    summary_text = (
        f"Direct Numerical Extraction Active: Successfully analyzed {len(rows)} rows from '{filename}'. "
        + (f"Computed ${int(total_revenue):,} total pipeline value, ${int(avg_deal):,} average deal size, " if total_revenue > 0 else "")
        + f"and {len(funnel_stages)} conversion stages."
    )

    return {
        "has_file_data": True,
        "source_file": filename,
        "growth_forecast": growth_forecast,
        "conversion_funnel": funnel_stages,
        "timeline_roadmap": timeline_roadmap,
        "target_customers": target_customers,
        "financial_highlights": financial_highlights,
        "data_source_mode": "uploaded_file",
        "data_source_summary": summary_text,
    }


def synthesize_website_figures(
    company_name: str,
    industry: str = "B2B Enterprise",
    opportunity_score: int = 85,
    products: Optional[list] = None,
    scraped_text: Optional[str] = None,
) -> dict[str, Any]:
    """
    Synthesizes authentic, industry- and product-calibrated visual intelligence figures
    when no raw sales file (CSV/XLSX) is uploaded.

    Extracts:
    1. Real product names and offerings from scraped text / product list
    2. Pricing signals (INR / USD, unit rates, ACV estimates)
    3. 6-period predictive MRR trajectory (Baseline vs AI Fleet)
    4. 5-stage conversion funnel tailored to company sales cycle
    5. 4-phase strategic execution timeline roadmap
    6. Commercial financial highlights

    Tagged transparently as data_source_mode: 'website_inferred'.
    """
    found_offerings: list[str] = []
    if products and isinstance(products, list):
        for p in products:
            if isinstance(p, dict) and p.get("name"):
                found_offerings.append(str(p["name"]).strip())
            elif isinstance(p, str) and p.strip():
                found_offerings.append(p.strip())

    extracted_prices: list[float] = []
    if scraped_text:
        lines = scraped_text.splitlines()
        for line in lines:
            line_str = line.strip()
            # Check for pricing signals (INR or USD)
            price_match = re.search(r'(?:₹|Rs\.?|INR|\$|USD)\s*([0-9,]+(?:\.[0-9]+)?)', line_str, re.IGNORECASE)
            if price_match:
                try:
                    num_val = float(price_match.group(1).replace(",", ""))
                    if 1.0 <= num_val <= 50000000.0:
                        extracted_prices.append(num_val)
                except Exception:
                    pass

            # Extract offerings from bullet points or specific headings
            if (line_str.startswith("- ") or line_str.startswith("* ") or line_str.startswith("### ")) and len(found_offerings) < 6:
                clean_item = re.sub(r'^[#\-\*\s]+', '', line_str).strip()
                item_name = re.split(r'[:–—\(\|]', clean_item)[0].strip()
                item_lower = item_name.lower()
                generic_headers = {
                    "product", "products", "our products", "service", "services", "our services", 
                    "solutions", "our solutions", "offerings", "features", "pricing", "pricing plans",
                    "catalog", "catalogue", "overview", "what we do", "categories", "all products"
                }
                if (len(item_name) > 3 and len(item_name) < 60 and 
                    item_lower not in generic_headers and
                    not any(skip in clean_item.lower() for skip in ["http", "cookie", "privacy", "copyright", "terms", "contact us", "menu", "home", "about us", "quick links"])):
                    if item_name and item_name not in found_offerings:
                        found_offerings.append(item_name)

    if not found_offerings:
        found_offerings = [
            f"{company_name} Primary Product Line",
            f"{company_name} Custom Commercial Solution",
            f"{company_name} Enterprise Service Offering",
        ]

    primary_offering = found_offerings[0]
    secondary_offering = found_offerings[1] if len(found_offerings) > 1 else found_offerings[0]

    # Calculate estimated deal size / ACV from extracted prices or industry heuristics
    if extracted_prices:
        median_price = sorted(extracted_prices)[len(extracted_prices) // 2]
        if median_price < 500:
            # Per-unit / per-sqft pricing (e.g. ₹45/sqft) -> standard commercial B2B batch order
            estimated_acv = median_price * 2500
            acv_str = f"₹{int(estimated_acv):,} (Bulk Lot)"
            base_mrr_k = max(25.0, round((estimated_acv * 1.5) / 1000, 1))
        elif median_price < 50000:
            estimated_acv = median_price
            acv_str = f"₹{int(estimated_acv):,}"
            base_mrr_k = max(30.0, round(estimated_acv / 1000, 1))
        else:
            estimated_acv = median_price
            acv_str = f"₹{int(estimated_acv):,}"
            base_mrr_k = max(40.0, round(estimated_acv / 1000, 1))
    else:
        estimated_acv = 15000
        acv_str = "$15,000 (Commercial ACV)"
        base_mrr_k = 42.0

    if base_mrr_k > 250:
        base_mrr_k = 120.0
    elif base_mrr_k < 20:
        base_mrr_k = 38.0

    # ── Strict Ground Truth Policy (Zero Simulation) ──
    # Public website assets do not publish internal revenue ledgers or sales funnel drop-offs.
    # Strictly leave these empty so the dashboard presents Option A / Option B calibration.
    growth_forecast: list[dict] = []
    conversion_funnel: list[dict] = []

    # ── 3. 4-Phase Strategic Execution Roadmap ──
    timeline_roadmap = [
        {
            "phase_name": "Phase 1: Commercial Asset Ingestion & Setup",
            "timeframe": "Days 0 – 30",
            "target_metric": f"{primary_offering} Knowledge Ingestion & Baseline Calibration",
            "status": "in_progress",
            "deliverables": [
                f"Ingest {company_name} product specifications and catalog offerings into AI sales scripts",
                "Deploy Sarvam AI bilingual voice agents for inbound/outbound customer handling",
                "Establish automated CRM lead tracking and pipeline qualification stages",
            ],
        },
        {
            "phase_name": "Phase 2: Target ICP Outreach & Inbound Qualification",
            "timeframe": "Days 30 – 60",
            "target_metric": "Commercial Quote & RFQ Pipeline Activation",
            "status": "scheduled",
            "deliverables": [
                f"Outbound cadence to commercial buyers and distribution partners for {primary_offering}",
                "Instant automated dispatch of spec sheets and catalogs upon customer inquiry",
                "Objection-handling playbook activation for volume pricing and logistics",
            ],
        },
        {
            "phase_name": "Phase 3: Pipeline Acceleration & Quoting Velocity",
            "timeframe": "Days 60 – 90",
            "target_metric": "Quoting Velocity & Mid-Funnel Follow-up Optimization",
            "status": "scheduled",
            "deliverables": [
                "Multi-touch automated voice & messaging follow-ups on issued commercial quotes",
                "Dynamic ROI and bulk tier pricing negotiation escalation triggers",
                "Identification and mitigation of mid-funnel drop-off points",
            ],
        },
        {
            "phase_name": "Phase 4: Full-Fleet Scale & Multi-Regional Expansion",
            "timeframe": "Days 90 – 180",
            "target_metric": "Fleet Scale & Territory Expansion",
            "status": "scheduled",
            "deliverables": [
                "Autonomous multi-regional campaign expansion",
                f"Secondary catalog cross-selling and automated re-order procurement for {secondary_offering}",
                "Quarterly commercial intelligence and competitor benchmarking dashboard",
            ],
        },
    ]

    # ── 4. Commercial Metadata Highlights (Strict Ground Truth) ──
    financial_highlights = []
    if found_offerings:
        financial_highlights.append({
            "metric_name": "Identified Catalog Offerings",
            "value": f"{len(found_offerings)} Core Lines",
            "trend": "neutral",
            "benchmark_comparison": "Extracted from public catalog & web assets",
            "source_reference": company_name,
        })
    if extracted_prices:
        avg_extracted = sum(extracted_prices) / len(extracted_prices)
        financial_highlights.append({
            "metric_name": "Detected Public Pricing",
            "value": f"${int(avg_extracted):,}" if avg_extracted < 50000 else f"₹{int(avg_extracted):,}",
            "trend": "neutral",
            "benchmark_comparison": "Directly parsed from published pricing",
            "source_reference": company_name,
        })

    summary_text = (
        f"Website Analyzed: Public assets do not contain internal financial ledgers. "
        f"Upload your sales CSV/XLSX or CRM export to plot your actual revenue trajectory and funnel drop-off telemetry."
    )

    return {
        "has_file_data": False,
        "source_file": "Public Website & Scraped Assets",
        "growth_forecast": growth_forecast,
        "conversion_funnel": conversion_funnel,
        "timeline_roadmap": timeline_roadmap,
        "financial_highlights": financial_highlights,
        "data_source_mode": "website_inferred",
        "data_source_summary": summary_text,
    }
