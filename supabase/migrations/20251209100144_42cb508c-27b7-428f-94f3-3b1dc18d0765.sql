-- Simplify recurrence model for weekly_commitments
-- Add recurrence_type field with clear semantics

ALTER TABLE public.weekly_commitments
ADD COLUMN IF NOT EXISTS recurrence_type TEXT DEFAULT 'weekly' CHECK (recurrence_type IN ('none', 'daily', 'weekly'));

-- Add times_per_day for daily recurrence (how many times to repeat each day)
ALTER TABLE public.weekly_commitments
ADD COLUMN IF NOT EXISTS times_per_day INTEGER DEFAULT 1;

-- Migration: Convert existing data to new model
-- If repeat_frequency = 'daily', set recurrence_type = 'daily'
UPDATE public.weekly_commitments
SET recurrence_type = 'daily', times_per_day = COALESCE(repeat_times_per_period, 1)
WHERE repeat_frequency = 'daily';

-- If repeat_frequency = 'weekly' without specific days, set recurrence_type = 'weekly'
-- and default to the day of creation (or monday if unknown)
UPDATE public.weekly_commitments
SET recurrence_type = 'weekly'
WHERE repeat_frequency = 'weekly' AND (repeat_days_of_week IS NULL OR array_length(repeat_days_of_week, 1) IS NULL);

-- If repeat_frequency = 'custom' with specific days, set recurrence_type = 'weekly'
UPDATE public.weekly_commitments
SET recurrence_type = 'weekly'
WHERE repeat_frequency = 'custom' AND repeat_days_of_week IS NOT NULL AND array_length(repeat_days_of_week, 1) > 0;

-- For commitments with 'none' task type (independent), set recurrence_type = 'none'
UPDATE public.weekly_commitments
SET recurrence_type = 'none'
WHERE task_type = 'independent' OR is_active = false;