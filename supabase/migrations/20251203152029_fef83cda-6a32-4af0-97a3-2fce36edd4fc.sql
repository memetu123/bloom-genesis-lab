-- Create weekly_checkins table for tracking commitments per calendar week
CREATE TABLE public.weekly_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  weekly_commitment_id UUID NOT NULL REFERENCES public.weekly_commitments(id) ON DELETE CASCADE,
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  planned_count INTEGER NOT NULL DEFAULT 0,
  actual_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one checkin per commitment per week
  UNIQUE (weekly_commitment_id, period_start_date)
);

-- Enable Row Level Security
ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own checkins"
ON public.weekly_checkins
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own checkins"
ON public.weekly_checkins
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checkins"
ON public.weekly_checkins
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own checkins"
ON public.weekly_checkins
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_weekly_checkins_updated_at
BEFORE UPDATE ON public.weekly_checkins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_weekly_checkins_user_week ON public.weekly_checkins(user_id, period_start_date);
CREATE INDEX idx_weekly_checkins_commitment ON public.weekly_checkins(weekly_commitment_id);