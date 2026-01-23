-- LMS (Learning Management System) Data Schema
-- Tables for sessions, baselines, and computed judgments
-- Follows the pattern from 008_screentime_social_data.sql
-- 
-- KEY DESIGN: Tracks aggregated "LMS Activity" (single stream)
-- Metrics are per-day
-- (Updated: Subject granularity removed)

-- =============================================================================
-- LMS SESSIONS (Raw Data - one record per day)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.lms_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Session date
  session_date date NOT NULL,
  
  -- Activity & Time metrics
  total_active_minutes int NOT NULL DEFAULT 0 CHECK (total_active_minutes >= 0),
  total_events int NOT NULL DEFAULT 0 CHECK (total_events >= 0),
  number_of_sessions int NOT NULL DEFAULT 0 CHECK (number_of_sessions >= 0),
  session_durations jsonb NOT NULL DEFAULT '[]',  -- Array of session lengths in minutes
  longest_session_minutes int NOT NULL DEFAULT 0 CHECK (longest_session_minutes >= 0),
  days_active_in_period int NOT NULL DEFAULT 0 CHECK (days_active_in_period >= 0),
  
  -- Action Type metrics
  reading_minutes int NOT NULL DEFAULT 0 CHECK (reading_minutes >= 0),
  watching_minutes int NOT NULL DEFAULT 0 CHECK (watching_minutes >= 0),
  exercise_practice_events int NOT NULL DEFAULT 0 CHECK (exercise_practice_events >= 0),
  assignment_work_events int NOT NULL DEFAULT 0 CHECK (assignment_work_events >= 0),
  forum_views int NOT NULL DEFAULT 0 CHECK (forum_views >= 0),
  forum_posts int NOT NULL DEFAULT 0 CHECK (forum_posts >= 0),
  
  -- Metadata
  is_simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- One session per user per date
  CONSTRAINT unique_lms_session UNIQUE (user_id, session_date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lms_sessions_user ON public.lms_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_lms_sessions_user_date ON public.lms_sessions (user_id, session_date DESC);

-- =============================================================================
-- LMS BASELINES (Rolling averages)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.lms_baselines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Baseline metrics
  baseline_active_minutes numeric(6,2) NOT NULL DEFAULT 60,  -- Default 1 hour
  baseline_sessions numeric(5,2) NOT NULL DEFAULT 3,
  baseline_days_active numeric(5,2) NOT NULL DEFAULT 4,
  
  -- Metadata
  sessions_count int NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  
  -- One baseline per user
  CONSTRAINT unique_lms_baseline UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_baselines_user ON public.lms_baselines (user_id);

-- =============================================================================
-- LMS JUDGMENTS (Two sentences per time window)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.lms_judgments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Time window this judgment covers
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- The two sentences (final output)
  sentence_1 text NOT NULL,  -- Activity volume + consistency/distribution
  sentence_2 text NOT NULL,  -- Action mix + practice/discussion style
  
  -- Raw judgment keys for debugging/analysis (optional, stored as JSON)
  judgment_details jsonb NOT NULL DEFAULT '{}',
  
  -- Metadata
  computed_at timestamptz NOT NULL DEFAULT now(),
  
  -- One judgment per user per period
  CONSTRAINT unique_lms_judgment UNIQUE (user_id, period_start, period_end)
);

-- Indexes for chatbot lookups
CREATE INDEX IF NOT EXISTS idx_lms_judgments_user ON public.lms_judgments (user_id);
CREATE INDEX IF NOT EXISTS idx_lms_judgments_user_computed ON public.lms_judgments (user_id, computed_at DESC);
