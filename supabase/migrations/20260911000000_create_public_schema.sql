-- =====================================================================
-- VYAPERI X — Full Supabase Database Schema & RLS Policies
-- Migration: 20260911000000_create_public_schema.sql
-- =====================================================================

-- 1. PROFILES TABLE (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    company_name TEXT,
    industry TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'owner',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. WORKSPACES TABLE
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    domain TEXT,
    industry TEXT,
    step_progress INT DEFAULT 1,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. REPORTS TABLE (Intelligence Suite & Scraper)
CREATE TABLE IF NOT EXISTS public.reports (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    input_urls JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    raw_profile JSONB,
    analysis JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. VOICE CALLS TABLE (Autonomous Telephony & Transcripts)
CREATE TABLE IF NOT EXISTS public.voice_calls (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    campaign_id TEXT,
    direction TEXT DEFAULT 'outbound',
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    business_name TEXT NOT NULL,
    call_reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    vapi_call_id TEXT,
    duration_seconds INT DEFAULT 0,
    started_at TEXT,
    ended_at TEXT,
    transcript JSONB DEFAULT '[]'::jsonb,
    recording_url TEXT,
    analysis JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. VOICE SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.voice_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_settings ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can select and update their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Workspaces: Owners can manage their workspaces
CREATE POLICY "Users can manage own workspaces"
    ON public.workspaces FOR ALL
    USING (auth.uid() = owner_id);

-- Reports: Users can manage their own intelligence reports
CREATE POLICY "Users can manage own reports"
    ON public.reports FOR ALL
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Voice Calls: Users can view and manage their voice calls
CREATE POLICY "Users can manage own voice calls"
    ON public.voice_calls FOR ALL
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Voice Settings: Accessible by authenticated users
CREATE POLICY "Authenticated users can read voice settings"
    ON public.voice_settings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can write voice settings"
    ON public.voice_settings FOR ALL
    TO authenticated
    USING (true);

-- =====================================================================
-- AUTH TRIGGER: Automatic Profile & Workspace Creation on User Signup
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    company_val TEXT;
    industry_val TEXT;
    name_val TEXT;
BEGIN
    name_val := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    company_val := COALESCE(NEW.raw_user_meta_data->>'company_name', NEW.raw_user_meta_data->>'company', 'My Enterprise');
    industry_val := COALESCE(NEW.raw_user_meta_data->>'industry', 'SaaS / Technology');

    -- Insert into profiles
    INSERT INTO public.profiles (id, email, full_name, company_name, industry, role, onboarding_completed)
    VALUES (
        NEW.id,
        NEW.email,
        name_val,
        company_val,
        industry_val,
        'owner',
        FALSE
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        company_name = COALESCE(EXCLUDED.company_name, public.profiles.company_name);

    -- Insert default workspace
    INSERT INTO public.workspaces (owner_id, name, industry, onboarding_completed)
    VALUES (
        NEW.id,
        company_val,
        industry_val,
        FALSE
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
