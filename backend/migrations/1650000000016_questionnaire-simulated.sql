-- Add is_simulated flag to questionnaire_results so simulated SRL entries
-- (created by srlDataSimulator on new-user registration) can be distinguished
-- from genuine student submissions when checking today's completion status.
ALTER TABLE public.questionnaire_results
    ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;

-- Index to make the today-check fast
CREATE INDEX IF NOT EXISTS idx_questionnaire_results_user_date_real
    ON public.questionnaire_results (user_id, created_at)
    WHERE is_simulated = false;
