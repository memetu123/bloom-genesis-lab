-- 1. Add status column to life_visions as TEXT (not enum)
ALTER TABLE public.life_visions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add check constraint for life_visions status
ALTER TABLE public.life_visions 
DROP CONSTRAINT IF EXISTS life_visions_status_check;
ALTER TABLE public.life_visions 
ADD CONSTRAINT life_visions_status_check 
CHECK (status IN ('active', 'completed', 'archived'));

-- 2. Add is_deleted columns for soft delete
ALTER TABLE public.life_visions 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.goals 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.weekly_commitments 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.commitment_completions 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 3. For goals, we need to handle the existing enum
-- First add new values to the enum if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'active' AND enumtypid = 'goal_status'::regtype) THEN
    ALTER TYPE goal_status ADD VALUE 'active';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'archived' AND enumtypid = 'goal_status'::regtype) THEN
    ALTER TYPE goal_status ADD VALUE 'archived';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_life_visions_status ON public.life_visions(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_goals_deleted ON public.goals(is_deleted);
CREATE INDEX IF NOT EXISTS idx_weekly_commitments_deleted ON public.weekly_commitments(is_deleted);
CREATE INDEX IF NOT EXISTS idx_commitment_completions_deleted ON public.commitment_completions(is_deleted);