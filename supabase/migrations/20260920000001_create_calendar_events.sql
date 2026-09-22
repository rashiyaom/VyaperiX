-- Migration: 20260920000001_create_calendar_events.sql
-- Purpose: Create calendar_events table for AI-scheduled meetings, Google Meet links, and reminders.

CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    call_id TEXT,
    report_id TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    company_name TEXT,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    meeting_type TEXT NOT NULL DEFAULT 'google_meet',
    meet_url TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    reminder_minutes INT NOT NULL DEFAULT 15,
    remind_via TEXT NOT NULL DEFAULT 'popup',
    google_event_id TEXT,
    synced_to_google BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast calendar queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON public.calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON public.calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_customer_name ON public.calendar_events(customer_name);
