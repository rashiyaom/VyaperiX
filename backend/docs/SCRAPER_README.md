# AI Business Intelligence & Sales Agent Platform

A full-stack web app that automates B2B discovery calls. Paste a website URL and get a complete intelligence report in 30–90 seconds.

## What it does

1. **Multi-page scraping** — crawls up to 15 pages of any website (static *and* JS-rendered)
2. **AI analysis** — Groq's `llama-3.3-70b-versatile` extracts customer segments, products, marketing channels, gaps
3. **Dashboard** — 5 live charts: radar, gauge, scatter matrix, bar charts + recommendations

## Scraping Architecture

| Layer | Tool | When |
|---|---|---|
| Fast path | `httpx` + `trafilatura` | Static HTML, SSR sites (~60% of the web) |
| JS fallback | `playwright` (headless Chromium) | React, Vue, Angular SPAs |
| Link discovery | Python stdlib `html.parser` | Always — no BeautifulSoup needed |

## Quick Start

### 1. Get a free Groq API key
Sign up at https://console.groq.com — it's free.

### 2. Backend setup
```bash
cd backend
pip install -r requirements.txt
playwright install chromium          # one-time: downloads headless browser
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
uvicorn main:app --reload --port 8000
```

### 3. Frontend setup
```bash
cd frontend
npm install
# .env.local already points to http://localhost:8000
npm run dev
```

Open http://localhost:3000

## Project Structure

```
design-haven/
├── backend/
│   ├── main.py           # FastAPI app + pipeline orchestration
│   ├── scraper.py        # Universal scraper (httpx + playwright)
│   ├── normalizer.py     # Profile builder + token budget management
│   ├── groq_client.py    # Groq API + pydantic validation
│   ├── database.py       # SQLite (local) / Postgres-compatible
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── page.tsx              # Intake form
    │   └── report/[id]/page.tsx  # Dashboard + polling
    └── components/
        ├── ProgressStepper.tsx
        ├── ExecutiveSummary.tsx
        ├── SegmentCards.tsx
        ├── ProductList.tsx
        ├── ChannelRadar.tsx       # Recharts radar chart
        ├── OpportunityGauge.tsx   # Recharts radial gauge
        ├── RecommendationMatrix.tsx  # Recharts scatter chart
        ├── ProductCategoryBar.tsx    # Recharts bar chart
        └── RecommendationsList.tsx
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/reports` | Submit URLs, get report_id back |
| GET | `/api/reports/{id}` | Poll status + get result |
| GET | `/api/reports` | List recent reports |
| GET | `/health` | Health check |

## Report Statuses

`pending` → `scraping` → `analyzing` → `done` / `failed`

## Production Deployment

- **Frontend** → Vercel (`vercel deploy`)
- **Backend** → Render / Railway with Docker; set `GROQ_API_KEY` in env vars
- **Database** → Replace SQLite with Postgres: set `DATABASE_URL` env var (schema is compatible)

## Notes

- **LinkedIn**: Stored as reference field only — not scraped (per LinkedIn ToS, see spec section 7)
- **SSRF guard**: Backend rejects localhost/internal IP targets
- **robots.txt**: Respected automatically
- **Rate limiting**: Add nginx rate limit or a middleware for production
