-- Add time fields to weekly_commitments
ALTER TABLE public.weekly_commitments
ADD COLUMN default_time_start TIME NULL,
ADD COLUMN default_time_end TIME NULL,
ADD COLUMN flexible_time BOOLEAN DEFAULT true;

-- Add time fields to commitment_completions (used as daily checkins)
ALTER TABLE public.commitment_completions
ADD COLUMN time_start TIME NULL,
ADD COLUMN time_end TIME NULL,
ADD COLUMN is_flexible_time BOOLEAN DEFAULT true;

-- Create daily_task_instances table for multiple instances per day
CREATE TABLE public.daily_task_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  completion_id UUID NOT NULL REFERENCES public.commitment_completions(id) ON DELETE CASCADE,
  time_start TIME NULL,
  time_end TIME NULL,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL
);

-- Enable RLS on daily_task_instances
ALTER TABLE public.daily_task_instances ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for daily_task_instances
CREATE POLICY "Users can view own task instances"
ON public.daily_task_instances
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own task instances"
ON public.daily_task_instances
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own task instances"
ON public.daily_task_instances
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own task instances"
ON public.daily_task_instances
FOR DELETE
USING (auth.uid() = user_id);