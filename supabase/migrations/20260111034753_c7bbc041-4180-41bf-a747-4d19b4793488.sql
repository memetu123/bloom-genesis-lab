-- Add completed_at timestamp to goals table
ALTER TABLE public.goals 
ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add completed_at timestamp to life_visions table
ALTER TABLE public.life_visions 
ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;