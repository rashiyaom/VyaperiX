# VYAPERI X

> AI-Powered Sales & Commercial Intelligence Platform & Multilingual Voice Fleet

## Modular Monorepo Architecture

```
vyepariX-Voice-agent/
├── frontend/                  ← Frontend (TanStack Start / Vite / React 19 / Tailwind v4)
│   ├── src/                   ← React app routes & components
│   │   ├── routes/
│   │   │   ├── index.tsx          ← Landing page
│   │   │   ├── onboarding.tsx     ← Onboarding wizard
│   │   │   ├── dashboard.tsx      ← SaaS dashboard
│   │   │   └── login.tsx          ← Auth page
│   │   └── components/
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
├── backend/                   ← Python FastAPI (Voice Engine & Intelligence Suite API)
│   ├── app/
│   │   ├── main.py            ← FastAPI entrypoint
│   │   ├── core/              ← Database adapter, auth middleware
│   │   ├── routers/           ← Voice Fleet endpoints & webhooks
│   │   └── services/          ← Voice engine, scraper, rag, groq client, etc.
│   ├── docs/                  ← Backend architecture & specs
│   ├── data/                  ← Chroma vector store & database backups
│   ├── requirements.txt
│   └── .env.example
├── supabase/                  ← Database Schemas & Migrations
│   ├── schema.sql             ← Consolidated database schema
│   ├── config.toml
│   └── migrations/
├── .gitignore                 ← Root gitignore (blocks .env, dist, node_modules, __pycache__)
├── package.json               ← Root npm script runners
└── README.md
```

## Running Locally

### 1. Frontend Web App (TanStack Start / Vite)
```bash
# From repository root:
npm run dev:web

# Or directly in frontend:
cd frontend
npm install
npm run dev
```

### 2. Voice & Intelligence Backend (Python FastAPI)
```bash
# From repository root:
npm run dev:backend

# Or directly in backend:
cd backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --port 8000
```

## Environment Setup

Copy the example environment files and populate your API credentials:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

## Deployment Guide

- **Frontend (`frontend`)**: Set Root Directory to `frontend` on Vercel / Netlify.
- **Backend (`backend`)**: Deploy as a Python Web Service on Render / Railway / AWS App Runner.
- **Database (`supabase`)**: Link with Supabase CLI or execute `supabase/schema.sql` in your Supabase SQL editor.
