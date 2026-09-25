# VYAPERI X — Full Project Context & Architecture Reference

> **Notice for LLMs & AI Assistants**: This document is the single source of truth for understanding the **VYAPERI X** (repository: `FUTURE-RIZION`) codebase architecture, sitemap, data models, API endpoints, core workflows, and development guidelines. Always consult this reference when making modifications, adding features, or debugging.

---

## 1. Executive Summary & Purpose

**VYAPERI X** is an enterprise-grade **Autonomous AI Sales & Commercial Intelligence Platform** paired with a **Multilingual Agent Fleet** (Voice, Video, WhatsApp, and Web RAG Chatbot).

### Key Features:
1. **Commercial Due-Diligence & Ingestion Engine**: Automatically crawls target websites using Playwright/BeautifulSoup, parses multi-format documents (PDF, CSV, Excel, Images/OCR), and generates a structured due-diligence report (Company Overview, SWOT, Products/Pricing, Competitors) using Groq LLaMA-3.3-70B.
2. **Grounded Anti-Hallucination RAG Chatbot**: Answers customer queries strictly using vector-indexed source excerpts (ChromaDB + SentenceTransformers `all-MiniLM-L6-v2`), featuring mathematical confidence scoring, source citation enforcement, and clarification logic for ambiguous prompts.
3. **Multilingual Autonomous Voice Fleet**: Conducts outbound/inbound telephony calls in multiple languages (English, Hindi, regional Indian languages) powered by **Sarvam AI** and **Vapi**, featuring real-time speech-to-text, streaming TTS, turn-logging, and live conversation analysis.
4. **Interactive AI Video Sales Agent**: Deploys WebRTC-based AI video personas via **Tavus** for live interactive sales consultations and product walkthroughs.
5. **Autonomous WhatsApp Lead Gateway**: Integrates Node.js `@whiskeysockets/baileys` gateway to monitor incoming WhatsApp messages, run RAG-backed lead qualification, and sync leads to CRM.
6. **Smart Calendar & Meeting Scheduler**: Detects lead intent, calculates available meeting slots, generates Google Meet links, and sends reminders.

---

## 2. Monorepo Architecture & Sitemaps

The project is structured as a **modular monorepo**:

```
d:\FUTURE-RIZION\
├── backend/                  ← Python FastAPI (Intelligence Engine, RAG, Voice/Video API)
│   ├── app/
│   │   ├── main.py           ← FastAPI entry point, CORS, lifespan, router registrations
│   │   ├── core/             ← Database adapters (MongoDB Motor + Supabase Auth) & Auth middleware
│   │   │   ├── database.py   ← Async MongoDB client + in-memory store + Supabase Auth fallback
│   │   │   └── auth_middleware.py ← JWT token validation & security
│   │   ├── routers/          ← Endpoint route controllers
│   │   │   ├── voice_router.py    ← Voice call scheduling, Sarvam/Vapi webhooks, batch calls
│   │   │   ├── video_router.py    ← Tavus video persona & call session endpoints
│   │   │   ├── calendar_router.py ← Meeting booking, slot resolution, calendar sync
│   │   │   ├── whatsapp_router.py ← WhatsApp incoming webhook & outbound reply handler
│   │   │   └── profile_router.py  ← User profile & workspace metadata CRUD
│   │   ├── services/         ← Business logic & AI pipelines
│   │   │   ├── scraper.py             ← Playwright & BeautifulSoup web crawler
│   │   │   ├── doc_processor.py       ← Parsers for PDF, CSV, Excel, Images (OCR)
│   │   │   ├── data_engine.py         ← Main orchestrator for ingestion & profiling
│   │   │   ├── briefing_compiler.py   ← Compiles raw profiles into structured JSON reports
│   │   │   ├── groq_client.py         ← Groq LLaMA-3.3-70B API wrapper & fallbacks
│   │   │   ├── rag_engine.py          ← ChromaDB vector indexing & vector retrieval
│   │   │   ├── chat_service.py        ← Grounded RAG QA system with anti-hallucination checks
│   │   │   ├── confidence_scorer.py   ← Mathematical scoring (vector sim + lexical coverage)
│   │   │   ├── voice_engine.py        ← Telephony orchestrator & call state management
│   │   │   ├── sarvam_service.py       ← Sarvam AI Indic STT/TTS & call controller
│   │   │   ├── whatsapp_service.py     ← WhatsApp conversation orchestrator
│   │   │   ├── calendar_service.py     ← Slot allocation & calendar event creator
│   │   │   ├── extraction_validator.py ← Schema validation & trust filtering
│   │   │   ├── normalizer.py          ← Text cleaning & metric normalization
│   │   │   └── chat_evaluation.py     ← RAG benchmark & accuracy evaluator
│   │   └── services/search/  ← Deep search router & web query engines
│   ├── requirements.txt      ← Backend Python dependencies
│   └── .env.example          ← Backend environment variables template
├── frontend/                 ← React 19 / TanStack Start / Vite / Tailwind CSS v4 UI
│   ├── src/
│   │   ├── routes/           ← App pages & file-based routing
│   │   │   ├── index.tsx     ← Public landing page
│   │   │   ├── onboarding.tsx← Business setup wizard
│   │   │   ├── dashboard.tsx ← Main SaaS executive dashboard (combines all modules)
│   │   │   └── login.tsx     ← Auth page (Supabase Auth / Google OAuth)
│   │   ├── components/
│   │   │   ├── app/          ← Core layout components
│   │   │   │   ├── store.tsx              ← Zustand global state store
│   │   │   │   ├── voice-synthesizer.tsx  ← Audio player & Web Audio synthesizer
│   │   │   │   ├── StaggeredMenu.tsx      ← Navigation drawer
│   │   │   │   ├── ui.tsx                 ← Reusable UI atoms (Buttons, Cards, Inputs)
│   │   │   │   └── lang.tsx / theme.tsx   ← i18n & Theme providers
│   │   │   └── modules/      ← Dashboard Tab Modules
│   │   │       ├── radar/      ← Executive sales intelligence radar view
│   │   │       ├── scraper/    ← Commercial scraper & document uploader view
│   │   │       ├── voice/      ← Voice fleet call queue, dialer & turn logs
│   │   │       ├── video/      ← Tavus video call launcher & persona selector
│   │   │       ├── whatsapp/   ← Live WhatsApp chat inbox & gateway manager
│   │   │       ├── calendar/   ← Meeting scheduler & appointment calendar
│   │   │       ├── analytics/  ← Conversion rates & ROI analytics
│   │   │       └── settings/   ← Telephony, API keys, & profile settings
│   ├── package.json          ← Frontend dependencies & scripts
│   └── vite.config.ts        ← Vite configuration
├── whatsapp-gateway/         ← Node.js Baileys WhatsApp Gateway
│   ├── server.js             ← Express app connecting WhatsApp client & proxying webhooks
│   └── package.json          ← WhatsApp gateway dependencies
├── supabase/                 ← Database Schemas & Migrations
│   ├── schema.sql            ← Consolidated PostgreSQL schema with RLS policies
│   └── config.toml           ← Supabase CLI config
├── prompts/                  ← AI Prompt Templates & Sample Output JSONs
│   ├── briefing_compiler_prompt.md
│   └── briefing_compiler_example.json
├── docs/                     ← Architecture plans & module decompositions
├── CHATBOT_EVALUATION_2026-09-23.md ← RAG evaluation report
├── PRESENTATION_DECK.md      ← Project presentation deck
├── README.md                 ← General repo overview
└── context.md                ← THIS FILE (LLM & Developer Knowledge Base)
```

---

## 3. Tech Stack & Key Libraries

| Tier | Component | Technology / Library |
| :--- | :--- | :--- |
| **Frontend UI** | Framework | React 19, TanStack Start, Vite, TypeScript |
| | Styling | Tailwind CSS v4, Vanilla CSS variables, Lucide React Icons |
| | State & Audio | Zustand, Web Audio API (`voice-synthesizer.tsx`), SSE streaming |
| **Backend API** | Framework | Python 3.10+, FastAPI, Uvicorn, Pydantic v2 |
| | Scraping & Parsing | Playwright (Headless Chromium), BeautifulSoup4, PyPDF2, Pandas, OpenPyXL |
| | Intelligence LLM | Groq LLaMA-3.3-70B (`groq_client.py`) |
| **RAG & Vector DB**| Vector Database | ChromaDB (`chromadb`), Qdrant Cloud client fallback |
| | Embeddings | `sentence-transformers` (`all-MiniLM-L6-v2`) |
| **Telephony & Media**| Voice Engine | Sarvam AI (Indic STT, TTS, Call Control), Vapi AI Webhook API |
| | Video Persona | Tavus WebRTC Replica API |
| | Messaging | Node.js Express + `@whiskeysockets/baileys` (WhatsApp Gateway) |
| **Database & Auth**| Primary Storage | Async MongoDB (`motor.motor_asyncio`) with in-memory caching fallback |
| | Relational & Auth | Supabase PostgreSQL (SQL schemas in `supabase/schema.sql`) & Supabase Auth |

---

## 4. Core Functional Modules & Pipeline Workflows

### 4.1. Commercial Due-Diligence & Ingestion Engine
```
User Inputs (URLs / PDFs / CSVs) 
  ──> scraper.py (Playwright headless crawl) + doc_processor.py (PDF/CSV/OCR parser)
  ──> data_engine.py (Normalizes text & combines sources)
  ──> briefing_compiler.py (Prompting Groq LLaMA-3.3-70B)
  ──> Output: Structured Report JSON (Overview, Products, SWOT, Competitors, Pricing)
  ──> Indexed into ChromaDB via rag_engine.py
```

### 4.2. Grounded Anti-Hallucination RAG Chat System (`chat_service.py` & `rag_engine.py`)
- **Query Processing**: Calculates vector similarity via ChromaDB + lexical coverage score (`confidence_scorer.py`).
- **Grounding Rules**:
  - Requires source evidence match; if confidence is low, returns: `"I don't have that information on this site."`
  - Strict clarification trigger: If user query lacks a specific subject and multiple items match, returns a short clarifying question instead of hallucinating.
  - Returns structured JSON response with `answer`, `confidence` (`exact`, `inferred`, `not_found`), `sources` (chunk IDs), and `evidence` (exact verbatim sentences).

### 4.3. Autonomous Multilingual Voice Fleet (`voice_engine.py`, `voice_router.py`, `sarvam_service.py`)
- **Call Flow**:
  1. Triggered via API `/api/voice/call` or batch queue `/api/voice/batch-call`.
  2. Initiates call using Vapi API or Sarvam AI telephony gateway.
  3. Real-time STT processes user speech -> LLM generates grounded response -> Sarvam Indic TTS synthesizes audio.
  4. Post-call webhooks (`/webhook/vapi`, `/sarvam/webhook`) save complete transcript, duration, sentiment, and action items to MongoDB/Supabase.

### 4.4. Interactive AI Video Sales Agent (`video_router.py`)
- Communicates with **Tavus API** to create video replicas (`persona_id`) and generate live conversation sessions (`session_id`).
- Returns WebRTC session URL to the frontend for interactive video consultations in the `Video` tab module.

### 4.5. WhatsApp Lead Gateway (`whatsapp-gateway/server.js` & `whatsapp_router.py`)
- Node.js gateway maintains a live WhatsApp socket via `@whiskeysockets/baileys`.
- Incoming messages are posted via HTTP POST to FastAPI `/api/whatsapp/webhook`.
- FastAPI runs `whatsapp_service.py` with RAG retrieval to answer lead questions, assess buying intent, and trigger calendar bookings.

### 4.6. Calendar & Booking System (`calendar_router.py` & `calendar_service.py`)
- Provides endpoints for checking available meeting slots and booking demo calls.
- Creates `calendar_events` records in MongoDB/Supabase and generates Google Meet links.

---

## 5. Data Models & Database Schemas

### 5.1. MongoDB Collections (`app.core.database.py`)

1. **`profiles`**
   ```json
   {
     "_id": "user_id_string",
     "email": "user@company.com",
     "full_name": "Jane Doe",
     "company_name": "Acme Corp",
     "industry": "SaaS / Enterprise",
     "role": "owner",
     "onboarding_completed": true,
     "created_at": "ISO-8601 string"
   }
   ```

2. **`reports`**
   ```json
   {
     "id": "rep_12345678",
     "user_id": "user_id_uuid",
     "input_urls": ["https://example.com"],
     "status": "completed",
     "raw_profile": { "scraped_pages": [...] },
     "analysis": {
       "company_overview": "...",
       "products_services": [...],
       "swot_analysis": { "strengths": [...], "weaknesses": [...] },
       "competitors": [...]
     },
     "created_at": "ISO-8601 string"
   }
   ```

3. **`voice_calls`**
   ```json
   {
     "id": "call_123456",
     "user_id": "user_id_uuid",
     "direction": "outbound",
     "customer_name": "Rahul Sharma",
     "customer_phone": "+919876543210",
     "business_name": "Acme Corp",
     "call_reason": "Product Demo Followup",
     "status": "completed",
     "duration_seconds": 142,
     "transcript": [
       { "role": "assistant", "content": "Hello Rahul..." },
       { "role": "user", "content": "Tell me about pricing..." }
     ],
     "analysis": { "lead_score": 85, "sentiment": "positive", "next_steps": "Send quotation" },
     "created_at": "ISO-8601 string"
   }
   ```

4. **`calendar_events`**
   ```json
   {
     "id": "evt_123456",
     "user_id": "user_id_uuid",
     "title": "Demo with Rahul Sharma",
     "start_time": "2026-09-26T10:00:00Z",
     "end_time": "2026-09-26T10:30:00Z",
     "meet_link": "https://meet.google.com/abc-defg-hij",
     "attendee_email": "rahul@example.com",
     "status": "confirmed"
   }
   ```

### 5.2. Supabase PostgreSQL Schema (`supabase/schema.sql`)
- Contains SQL tables matching `profiles`, `workspaces`, `reports`, `voice_calls`, `voice_settings`.
- Enforces **Row Level Security (RLS)** based on `auth.uid()`.
- Uses a PostgreSQL trigger (`on_auth_user_created`) to automatically generate a `profiles` row and default `workspace` when a user registers via Supabase Auth.

---

## 6. Primary API Endpoints Reference

| Category | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **Health** | `/health` | `GET` | Health check endpoint returning system status |
| **Reports** | `/api/reports` | `POST` | Multipart submission (URLs, Files, Context) for intelligence report generation |
| | `/api/reports/{id}` | `GET` | Fetch single intelligence report status and analysis JSON |
| | `/api/reports` | `GET` | List all recent intelligence reports |
| **RAG Chat** | `/api/chat` | `POST` | Execute grounded RAG query against active report sources |
| **Voice Fleet** | `/api/voice/call` | `POST` | Trigger direct outbound voice call to customer |
| | `/api/voice/batch-call` | `POST` | Queue batch of outbound telephony calls |
| | `/api/voice/calls` | `GET` | List all voice call logs and transcripts |
| | `/webhook/vapi` | `POST` | Webhook callback for Vapi call state & transcript sync |
| | `/sarvam/webhook` | `POST` | Webhook callback for Sarvam AI call state |
| **Video Agent** | `/api/video/persona` | `POST` | Create or update Tavus video persona |
| | `/api/video/session` | `POST` | Create interactive WebRTC video session |
| | `/webhook/tavus` | `POST` | Webhook callback for Tavus video session logs |
| **WhatsApp** | `/api/whatsapp/webhook` | `POST` | Incoming webhook from `whatsapp-gateway` |
| | `/api/whatsapp/send-message` | `POST` | Send outbound WhatsApp message to lead |
| **Calendar** | `/api/calendar/slots` | `GET` | Get available booking slots |
| | `/api/calendar/book` | `POST` | Schedule meeting and generate Google Meet link |
| **User Profile** | `/api/profile` | `GET` / `PUT` | Fetch or update user enterprise profile & onboarding state |

---

## 7. Key Environment Variables

### Backend Environment Variables (`backend/.env`)
```ini
# Core LLM Engine
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# MongoDB Configuration
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=vyepari_x

# Supabase Auth & DB
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=eyJ...
SUPABASE_PUBLISHABLE_KEY=eyJ...

# Telephony & Voice (Sarvam & Vapi)
SARVAM_API_KEY=...
# Website home-page voice preview only (public, rate-limited). Separate from the calling-agent keys;
# served by app/routers/demo_voice_router.py + app/services/demo_voice_service.py. Never falls back to SARVAM_API_KEY.
SARVAM_WEBSITE_DEMO_API_KEY=...
VAPI_API_KEY=...
VAPI_PHONE_NUMBER_ID=...

# Video Agent (Tavus)
TAVUS_API_KEY=...
TAVUS_REPLICA_ID=...

# Search & Vector DB
QDRANT_URL=...
QDRANT_API_KEY=...

# Application Settings
FRONTEND_URL=http://localhost:3000
PORT=8000
```

### Frontend Environment Variables (`frontend/.env`)
```ini
VITE_BACKEND_URL=http://localhost:8000
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_WHATSAPP_GATEWAY_URL=http://localhost:3001
```

---

## 8. Development & Operational Commands

### 8.1. Launching Local Environment

```bash
# 1. Install root dependencies
npm install

# 2. Run Frontend (React 19 / Vite / TanStack Start on http://localhost:3000)
npm run dev:web

# 3. Run Backend (FastAPI on http://localhost:8000)
npm run dev:backend
# Or directly from backend/:
# cd backend && uvicorn app.main:app --reload --port 8000

# 4. Run WhatsApp Gateway (Express / Baileys on http://localhost:3001)
cd whatsapp-gateway && npm start
```

### 8.2. Database & RAG Benchmark Setup
```bash
# Execute Supabase SQL Schema
# Open supabase/schema.sql and execute in Supabase SQL Editor

# Run RAG Evaluation & Accuracy Test Benchmark
cd backend
python -m app.services.chat_evaluation
```

---

## 9. Guidelines for LLMs & AI Coding Assistants

When working on this repository, strictly observe the following rules:

1. **Imports in Backend**: All Python imports in `backend/` must use absolute paths relative to `backend` (e.g., `from app.core import database as db`, `from app.services import rag_engine`).
2. **Database Fallbacks**: Always use `app.core.database` functions for data operations. `database.py` manages async MongoDB operations with built-in in-memory fallback mechanisms for offline testing.
3. **Anti-Hallucination Rigor**: Do not modify `SYSTEM_PROMPT` in `chat_service.py` to bypass source checks. All RAG responses must remain strictly grounded with exact evidence snippets.
4. **State Management**: Frontend state for the executive dashboard (`dashboard.tsx`) is centralized in `frontend/src/components/app/store.tsx` (Zustand). Ensure tab state and active report selection update through the store.
5. **Windows OS Async Loop**: Keep the Windows Proactor event loop initialization block in `backend/app/main.py` (`asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())`) intact to prevent subprocess crashes with Playwright on Windows.
6. **No Dummy Code**: Always write full, production-ready code. Do not remove safety error handling, docstrings, or environment checks.

---
*Updated: September 2026 | Maintainer: VyaperiX Core AI Team*
