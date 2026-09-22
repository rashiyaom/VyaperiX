-- =====================================================================
-- VYAPERI X — Video Sales Agent (Mitra / Tavus) Database Migration
-- Migration: 20260912000000_create_video_calls.sql
-- =====================================================================

-- 1. VIDEO CALLS TABLE
CREATE TABLE IF NOT EXISTS public.video_calls (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    report_id TEXT REFERENCES public.reports(id) ON DELETE SET NULL,
    customer_name TEXT DEFAULT 'Prospect',
    customer_email TEXT,
    customer_phone TEXT,
    business_name TEXT DEFAULT 'Enterprise',
    call_reason TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    tavus_conversation_id TEXT,
    tavus_persona_id TEXT,
    conversational_context TEXT,
    custom_greeting TEXT,
    conversation_url TEXT,
    duration_seconds INT DEFAULT 0,
    briefing JSONB,
    transcript JSONB DEFAULT '[]'::jsonb,
    recording_url TEXT,
    analysis JSONB,
    error_message TEXT,
    started_at TEXT,
    ended_at TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.video_calls ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES
CREATE POLICY "Users can manage own video calls"
    ON public.video_calls FOR ALL
    USING (auth.uid() = user_id OR user_id IS NULL);
