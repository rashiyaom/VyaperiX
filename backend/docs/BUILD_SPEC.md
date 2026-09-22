# AI Business Intelligence & Sales Agent Platform — Build Spec

## 0. What to build

A web app where a user pastes a **website URL** (required), a **LinkedIn URL** (optional), and any **other links** (optional, repeatable). The app then:

1. Scrapes the target website (multi-page, not just the homepage).
2. Normalizes scraped content into a structured Markdown/JSON "business profile."
3. Sends that profile to the **Groq API** with a schema-locked prompt that extracts: target customers, products/services, marketing channels in use, gaps, and prioritized recommendations.
4. Persists the result and renders it as a **dashboard**: summary text, customer/product cards, and charts (marketing channel radar, opportunity score gauge, recommendation priority scatter, etc.).

Framing: this is an automated "discovery call" — the kind of research a sales/marketing consultant does manually before a pitch — compressed into ~30–90 seconds. The value is the **synthesis and recommendation layer**, not the scraping itself.

**v1 priorities:** UI should be simple and clean (minimal, corporate style — white background, one accent color, generous whitespace, no heavy gradients/illustration). Charts and analytics are a hard requirement even in v1 — don't ship without them.

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React) + Tailwind CSS | Fast to build, good defaults, deploys cleanly to Vercel |
| Charts | Recharts (or Chart.js) | Lightweight, covers bar/radar/scatter/pie out of the box |
| Backend API | FastAPI (Python) | One language across scraping + LLM orchestration + API; async-friendly |
| Scraping | `requests` + `beautifulsoup4` + `trafilatura` (static pages), `playwright` (JS-rendered fallback), `ddgs` (DuckDuckGo discovery) | Fast path for most sites, headless-browser fallback only when needed |
| LLM inference | Groq API (`groq` Python SDK) — default model `llama-3.3-70b-versatile`, cheap draft model `llama-3.1-8b-instant` | Cheapest/fastest inference for this workload; open-weight models only (no GPT/Claude on Groq) |
| Database | PostgreSQL (Supabase / Railway / Neon) | Structured report storage, JSONB columns for LLM output |
| Job handling | FastAPI `BackgroundTasks` for v1 → Redis + RQ/Celery once concurrent load grows | Scrape + LLM steps can take 15–60s; must not block the request |
| Deployment | Frontend → Vercel. Backend → Render/Railway (Docker). | Low ops overhead, generous free tiers |

Do **not** try to build synchronous request/response for report generation — treat it as a background job with a polling status endpoint from day one.

---

## 2. Architecture

```
[Browser] → paste website / linkedin / other links
    ↓ POST /api/reports
[FastAPI backend]
    ├─ Scraper: requests+BeautifulSoup/trafilatura → Playwright fallback if content is near-empty
    ├─ DuckDuckGo discovery (ddgs): find missed pages, auto-detect LinkedIn URL, surface mentions
    ├─ Normalizer: combine pages into one structured profile (JSON/Markdown)
    ├─ Groq call: schema-locked prompt → structured JSON (segments, products, gaps, recommendations)
    └─ Postgres: persist raw profile + structured analysis, status field for polling
    ↓ GET /api/reports/{id} (poll)
[Next.js frontend] → renders dashboard: summary, segment cards, product list, charts, recommendations
```

---

## 3. Build order (do these in sequence, each one testable before the next)

**Phase 0 — Setup**
- Two apps: `/backend` (FastAPI) and `/frontend` (Next.js), or a monorepo.
- `pip install fastapi uvicorn requests beautifulsoup4 trafilatura duckduckgo-search groq psycopg2-binary python-dotenv playwright pydantic`
- Get a free Groq API key from console.groq.com → `.env` as `GROQ_API_KEY` (never commit).
- Provision a free Postgres instance.

**Phase 1 — Single-page scraper**
- Fetch one URL with `requests` (real User-Agent header, timeout), extract main content with `trafilatura`.
- Test against 5–10 real business homepages; log failures (timeouts, 403s, empty JS-only content).

**Phase 2 — Multi-page crawl**
- Parse `<a>` tags from the homepage, filter to same-domain links.
- Prioritize by keyword: about, product, service, pricing, customer, case-stud, contact, blog.
- Fetch top ~10–15 pages concurrently (asyncio/httpx or thread pool), with a total crawl time budget (~20s).

**Phase 3 — JS-rendered fallback**
- If a static fetch returns near-empty content, retry with Playwright (headless Chromium), wait for network idle, extract from rendered DOM.
- Only use this when needed — it's 5–10x slower than a plain fetch.

**Phase 4 — DuckDuckGo discovery**
- Use `ddgs` for 2–3 supplementary searches: company name, `"{company} reviews"`, `site:{domain}`.
- Use results to find missed pages, auto-detect a LinkedIn URL if not provided, and surface third-party mentions.
- Treat this as best-effort only — the unofficial endpoint can rate-limit or change; the pipeline must succeed without it.

**Phase 5 — Normalizer**
- Combine all fetched pages into one profile object (schema below).
- Dedupe repeated boilerplate; truncate/summarize any page over ~3,000 tokens before it goes to the LLM.

**Phase 6 — Groq integration**
- Single function `analyze_business(profile) -> BusinessAnalysis`.
- Schema-locked system prompt (below), JSON-only output, validate with pydantic, retry once on malformed JSON.

**Phase 7 — Persistence**
- Tables: `reports` (id, input_urls, status, created_at), raw profile JSONB, analysis JSONB, error_message.
- Status values: `pending` → `scraping` → `analyzing` → `done` / `failed`.

**Phase 8 — API endpoints**
- `POST /api/reports` — accept URLs, kick off background job, return report id.
- `GET /api/reports/{id}` — return status + result.
- `GET /api/reports` — list history (only if you add accounts).

**Phase 9 — Frontend intake form**
- Fields: website URL (required), LinkedIn URL (optional), "+ add another link" (repeatable).
- Client-side URL validation; on submit, redirect to `/report/[id]` which polls status.

**Phase 10 — Progress UI**
- Simple stepper: "Scraping website → Reading LinkedIn → Running analysis → Building report."
- Poll every 2–3 seconds (no websockets needed for v1).

**Phase 11 — Dashboard rendering**
- Components: executive summary, segment cards, product list, marketing channel table, chart set (section 5).
- Render everything straight from the structured JSON — no manual formatting of LLM text.

**Phase 12 — Recommendations layer**
- 3–5 prioritized, concrete actions, each tied to specific evidence found (not generic advice).
- e.g. "No visible testimonials on the site → add 2–3 case studies to increase trust signal for B2B buyers."

**Phase 13 — Hardening**
- Handle: unreachable site, robots.txt disallow, huge sites, LLM timeout/rate limit, malformed JSON.
- Rate limit the public form (e.g. 5 reports/hour/IP); block localhost/internal-IP targets (SSRF guard).

**Phase 14 — Deploy**
- Frontend → Vercel, backend → Render/Railway with Docker, env vars set in each dashboard.
- Add a pre-generated example report link on the landing page.

---

## 4. Data schemas

### 4.1 Scraped profile (internal, pre-LLM)

```json
{
  "source_url": "https://example.com",
  "pages": [
    {"url": "https://example.com/", "title": "Home", "text": "..."},
    {"url": "https://example.com/products", "title": "Products", "text": "..."}
  ],
  "linkedin_url": "https://linkedin.com/company/example",
  "extra_links": ["https://instagram.com/example"],
  "scraped_at": "2026-09-10T10:00:00Z"
}
```

### 4.2 Groq output schema (structured analysis)

```json
{
  "company_name": "string",
  "one_line_summary": "string",
  "industry": "string",
  "target_customers": [
    {"segment_name": "string", "description": "string", "evidence": "string"}
  ],
  "products_services": [
    {"name": "string", "description": "string", "category": "string"}
  ],
  "value_proposition": "string",
  "current_marketing_channels": [
    {"channel": "string", "evidence": "string", "strength": "strong | moderate | weak | absent"}
  ],
  "competitor_signals": ["string"],
  "marketing_gaps": ["string"],
  "recommendations": [
    {"title": "string", "detail": "string", "priority": "high | medium | low", "effort": "low | medium | high"}
  ],
  "opportunity_score": 0,
  "confidence_notes": "string"
}
```

### 4.3 `reports` table

| Field | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| input_urls | JSONB | `{"website": "...", "linkedin": "...", "other": ["..."]}` |
| status | text | pending / scraping / analyzing / done / failed |
| raw_profile | JSONB | scraped+normalized profile (4.1) |
| analysis | JSONB | Groq output (4.2) |
| error_message | text, nullable | |
| created_at / updated_at | timestamp | |

---

## 5. Dashboard & charts (must-have, not optional)

| Chart | Type | Data source |
|---|---|---|
| Customer segment breakdown | Horizontal bar / donut | `target_customers` |
| Marketing channel strength | Radar chart | `current_marketing_channels` (strong=3, moderate=2, weak=1, absent=0) |
| Recommendation priority matrix | Scatter (effort vs. priority) | `recommendations` |
| Opportunity score | Gauge / progress ring | `opportunity_score` |
| Product/service category split | Vertical bar | `products_services` grouped by category |

Rule: every chart must map to a real field in the schema — don't add decorative charts with no backing data. Extend the schema first if a chart needs a field that doesn't exist yet.

**Report page layout, top to bottom:**
1. Header: company name, source URL, generated date, "regenerate" button.
2. Executive summary (2–4 sentences).
3. Two-column row: customer segments (cards) | products/services (list).
4. Chart row: marketing channel radar + opportunity score gauge.
5. Recommendations list, sorted by priority.
6. Footer: list of scraped source URLs (transparency).

---

## 6. Groq prompt templates

**System prompt (fixed — keep this stable across every call for cache-friendliness):**

```
You are a B2B business analyst. You will receive scraped content from a
company's website (and optionally LinkedIn/other sources). Analyze it and
return ONLY valid JSON matching this exact schema, with no prose before or
after the JSON:

<paste the schema from section 4.2>

Rules:
- Base every claim on the provided text. If something cannot be determined,
  use an empty array or "insufficient data" rather than inventing facts.
- "evidence" fields must reference what was actually found (a page section,
  a phrase, or a notable absence).
- opportunity_score is 0-100, reflecting how much upside exists in tightening
  the company's marketing/positioning based on gaps found.
- Do not include markdown code fences. Return raw JSON only.
```

**User prompt (per request):**

```
Company profile data:
---
{normalized profile from section 4.1, truncated to fit token budget}
---

Additional context:
- LinkedIn URL provided: {yes/no}
- Other links provided: {list or "none"}

Analyze this business per the system instructions.
```

Tips:
- Validate/parse the response with pydantic; on failure, retry once with "that was not valid JSON, return only JSON."
- Cap input to ~2,000–4,000 tokens of the most information-dense content before calling the LLM.
- Few-shot one example of a good, evidence-tied recommendation in the system prompt — measurably improves output specificity, especially on smaller/faster models.

---

## 7. LinkedIn handling — important constraint

**Do not build a generic crawler that scrapes or logs into LinkedIn pages.** LinkedIn's User Agreement prohibits automated data collection, and LinkedIn has pursued litigation against companies and individuals building products on scraped LinkedIn data (including a 2025 federal case). Public-data scraping is generally not a CFAA/criminal violation, but it is still a terms-of-service and civil-liability risk.

For v1: treat the LinkedIn URL as a reference field only. Either let the user paste in relevant LinkedIn text themselves, or plan to integrate a licensed third-party enrichment API later. Do not have the scraper (Phase 1–3) touch LinkedIn URLs the same way it touches the website URL.

Also apply an SSRF guard (reject localhost/internal IPs as scrape targets) and keep DuckDuckGo usage light/best-effort since it's an unofficial endpoint.

---

## 8. Reference code

### 8.1 Scraper core

```python
import requests
from bs4 import BeautifulSoup
import trafilatura

def fetch_page(url: str, timeout: int = 10) -> str | None:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; BizIntelBot/1.0)"}
    try:
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException:
        return None
    return trafilatura.extract(resp.text) or ""

def get_internal_links(base_url: str, html: str, limit: int = 15) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    from urllib.parse import urljoin, urlparse
    domain = urlparse(base_url).netloc
    keywords = ["about", "product", "service", "pricing", "customer", "case-stud", "contact", "blog"]
    scored = []
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"])
        if urlparse(href).netloc != domain:
            continue
        score = sum(k in href.lower() for k in keywords)
        scored.append((score, href))
    scored.sort(key=lambda x: -x[0])
    seen, out = set(), []
    for _, href in scored:
        if href not in seen:
            seen.add(href)
            out.append(href)
        if len(out) >= limit:
            break
    return out
```

### 8.2 DuckDuckGo discovery

```python
from ddgs import DDGS

def discover_extra_context(company_name: str, domain: str) -> list[dict]:
    results = []
    with DDGS() as ddgs:
        for query in [f"{company_name} reviews", f"site:{domain}"]:
            try:
                for r in ddgs.text(query, max_results=5):
                    results.append(r)
            except Exception:
                continue  # best-effort only, never blocks the pipeline
    return results
```

### 8.3 Groq call with schema validation

```python
import os
from groq import Groq
from pydantic import BaseModel, ValidationError

client = Groq(api_key=os.environ["GROQ_API_KEY"])

class Recommendation(BaseModel):
    title: str
    detail: str
    priority: str
    effort: str

class BusinessAnalysis(BaseModel):
    company_name: str
    one_line_summary: str
    industry: str
    target_customers: list[dict]
    products_services: list[dict]
    value_proposition: str
    current_marketing_channels: list[dict]
    competitor_signals: list[str]
    marketing_gaps: list[str]
    recommendations: list[Recommendation]
    opportunity_score: int
    confidence_notes: str

SYSTEM_PROMPT = "...(paste the full schema-locked prompt from section 6)..."

def analyze_business(profile_markdown: str) -> BusinessAnalysis:
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": profile_markdown},
        ],
        temperature=0.3,
    )
    raw = resp.choices[0].message.content
    try:
        return BusinessAnalysis.model_validate_json(raw)
    except ValidationError:
        resp2 = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": profile_markdown},
                {"role": "assistant", "content": raw},
                {"role": "user", "content": "That was not valid JSON matching the schema. Return ONLY valid JSON."},
            ],
            temperature=0.1,
        )
        return BusinessAnalysis.model_validate_json(resp2.choices[0].message.content)
```

### 8.4 FastAPI endpoints

```python
from fastapi import FastAPI, BackgroundTasks
from uuid import uuid4

app = FastAPI()

@app.post("/api/reports")
async def create_report(payload: dict, background_tasks: BackgroundTasks):
    report_id = str(uuid4())
    # insert a 'pending' row in Postgres here
    background_tasks.add_task(run_pipeline, report_id, payload)
    return {"report_id": report_id, "status": "pending"}

@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    # fetch row from Postgres, return status + analysis if done
    ...
```

### 8.5 Recharts radar chart (marketing channels)

```jsx
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

const strengthToScore = { strong: 3, moderate: 2, weak: 1, absent: 0 };

function ChannelRadar({ channels }) {
  const data = channels.map(c => ({
    channel: c.channel,
    strength: strengthToScore[c.strength] ?? 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="channel" />
        <Radar dataKey="strength" stroke="#3457a6" fill="#3457a6" fillOpacity={0.4} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

---

## 9. Risks to design around

| Risk | Mitigation |
|---|---|
| Target site blocks scraping (403, Cloudflare) | Fail gracefully; allow user to paste raw text as fallback input |
| LLM returns malformed JSON | Schema-locked prompt + one retry + pydantic validation |
| LinkedIn ToS/legal exposure | Never automate LinkedIn scraping directly (section 7) |
| DuckDuckGo endpoint changes/rate-limits | Best-effort only; pipeline must succeed without it |
| Slow reports (>60s) | Background jobs + polling UI; cap crawl depth/page count |
| Abuse (spam, malicious scrape targets) | Rate limit by IP; SSRF guard on target URLs |
| Thin/small-business sites → low-quality output | Prompt must allow "insufficient data" instead of hallucinating |

---

## 10. Build this now

Implement Phases 0–8 first (scraper → normalizer → Groq → persistence → API) and get one end-to-end report working against 2–3 real test sites before touching the frontend dashboard. Then build Phases 9–12 (frontend + charts + recommendations). Defer Phase 13 hardening and Phase 14 deployment until the core loop works.
