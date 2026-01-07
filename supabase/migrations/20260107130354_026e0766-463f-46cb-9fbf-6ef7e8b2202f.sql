-- Add archived_at column to life_visions
ALTER TABLE public.life_visions 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add archived_at column to goals  
ALTER TABLE public.goals 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add archived_at column to weekly_commitments (for task archiving)
ALTER TABLE public.weekly_commitments 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Update life_visions status when archiving (set archived_at)
-- This is already handled by application code, just need the column