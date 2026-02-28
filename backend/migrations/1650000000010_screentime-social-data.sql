-- Screen Time Data Schema
-- Tables for sessions, baselines, and computed judgments
-- Follows the pattern from 004b_sleep_data.sql

-- =============================================================================
-- SCREEN TIME SESSIONS (Raw Data - one record per day)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.screen_time_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Session date
  session_date date NOT NULL,
  
  -- Duration metrics (minutes)
  total_screen_minutes int NOT NULL CHECK (total_screen_minutes >= 0),
  baseline_screen_minutes int NOT NULL DEFAULT 300 CHECK (baseline_screen_minutes >= 0),
  
  -- Session patterns
  longest_continuous_session int NOT NULL DEFAULT 0 CHECK (longest_continuous_session >= 0),
  late_night_screen_minutes int NOT NULL DEFAULT 0 CHECK (late_night_screen_minutes >= 0),
  
  -- Metadata
  is_simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- One session per user per date
  CONSTRAINT unique_screen_time_session UNIQUE (user_id, session_date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_screen_time_sessions_user ON public.screen_time_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_screen_time_sessions_user_date ON public.screen_time_sessions (user_id, session_date DESC);

-- =============================================================================
-- SCREEN TIME BASELINES (Rolling 7-day averages)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.screen_time_baselines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Duration baseline
  avg_total_minutes numeric(6,2) NOT NULL DEFAULT 300, -- 5h default
  
  -- Session patterns baseline
  avg_longest_session numeric(6,2) NOT NULL DEFAULT 60,
  avg_late_night_minutes numeric(6,2) NOT NULL DEFAULT 20,
  
  -- Metadata
  sessions_count int NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  
  -- One baseline per user
  CONSTRAINT unique_screen_time_baseline UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_screen_time_baselines_user ON public.screen_time_baselines (user_id);

-- =============================================================================
-- SCREEN TIME JUDGMENTS (Computed insights - multiple per session)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.screen_time_judgments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.screen_time_sessions(id) ON DELETE CASCADE,
  
  -- Judgment classification
  domain varchar(20) NOT NULL CHECK (domain IN ('volume', 'distribution', 'pre_sleep')),
  judgment_key varchar(50) NOT NULL,
  severity varchar(10) NOT NULL CHECK (severity IN ('ok', 'warning', 'poor')),
  
  -- Human-readable explanations
  explanation text NOT NULL,           -- Short explanation for UI
  explanation_llm text NOT NULL,       -- Detailed explanation for chatbot
  
  -- Metadata
  computed_at timestamptz NOT NULL DEFAULT now(),
  
  -- One judgment per domain per session
  CONSTRAINT unique_screen_time_judgment UNIQUE (session_id, domain)
);

-- Indexes for chatbot lookups
CREATE INDEX IF NOT EXISTS idx_screen_time_judgments_user ON public.screen_time_judgments (user_id);
CREATE INDEX IF NOT EXISTS idx_screen_time_judgments_session ON public.screen_time_judgments (session_id);
CREATE INDEX IF NOT EXISTS idx_screen_time_judgments_user_computed ON public.screen_time_judgments (user_id, computed_at DESC);

-- =============================================================================
-- DROP SOCIAL MEDIA TABLES (removed from application)
-- =============================================================================
DROP TABLE IF EXISTS public.social_media_judgments CASCADE;
DROP TABLE IF EXISTS public.social_media_baselines CASCADE;
DROP TABLE IF EXISTS public.social_media_sessions CASCADE;
