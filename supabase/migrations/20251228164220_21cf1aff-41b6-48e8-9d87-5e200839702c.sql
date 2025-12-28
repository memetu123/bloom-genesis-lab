-- Add is_completed column to commitment_completions to track completion status separately from record existence
-- This allows notes to be saved without marking the task as completed
ALTER TABLE public.commitment_completions
ADD COLUMN is_completed boolean DEFAULT true;

-- Set all existing records as completed (they were created when completing tasks)
UPDATE public.commitment_completions SET is_completed = true WHERE is_completed IS NULL;