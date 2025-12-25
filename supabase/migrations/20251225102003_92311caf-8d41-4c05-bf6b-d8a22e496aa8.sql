-- Add notes column to commitment_completions for task notes
ALTER TABLE public.commitment_completions
ADD COLUMN notes text DEFAULT NULL;