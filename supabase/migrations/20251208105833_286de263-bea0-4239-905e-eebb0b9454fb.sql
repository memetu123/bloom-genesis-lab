-- Add is_detached column to commitment_completions for per-day overrides
ALTER TABLE public.commitment_completions 
ADD COLUMN IF NOT EXISTS is_detached boolean DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.commitment_completions.is_detached IS 'When true, this daily instance is detached from its recurring series and operates independently';

-- Add UPDATE policy for commitment_completions (missing from current RLS)
CREATE POLICY "Users can update own completions" 
ON public.commitment_completions 
FOR UPDATE 
USING (auth.uid() = user_id);