-- Chatbot Schema
-- Creates tables for chat sessions, messages, and summarized history

-- Chat sessions table (tracks conversation sessions per user)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Session state
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Cached initial greeting (generated once per session)
    initial_greeting TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    
    -- Timeout configuration (30 minutes = 1800 seconds)
    timeout_seconds INT NOT NULL DEFAULT 1800
);

-- Chat messages table (stores individual messages)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- For alignment tracking
    alignment_passed BOOLEAN,
    alignment_retries INT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat summaries table (caches daily summaries for token efficiency)
CREATE TABLE IF NOT EXISTS public.chat_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Summary for a specific date
    summary_date DATE NOT NULL,
    summary_text TEXT NOT NULL,
    
    -- Number of messages summarized
    message_count INT NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One summary per user per day
    CONSTRAINT unique_daily_summary UNIQUE (user_id, summary_date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_active 
    ON public.chat_sessions (user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_created 
    ON public.chat_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session 
    ON public.chat_messages (session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created 
    ON public.chat_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_summaries_user_date 
    ON public.chat_summaries (user_id, summary_date DESC);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_summaries TO postgres;

-- Function to check and expire inactive sessions
CREATE OR REPLACE FUNCTION expire_inactive_sessions()
RETURNS void AS $$
BEGIN
    UPDATE public.chat_sessions
    SET is_active = false,
        ended_at = NOW()
    WHERE is_active = true
      AND last_activity_at < NOW() - (timeout_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql;
