-- Add is_focus column to life_visions
ALTER TABLE public.life_visions 
ADD COLUMN is_focus boolean NOT NULL DEFAULT false;

-- Add is_focus column to goals
ALTER TABLE public.goals 
ADD COLUMN is_focus boolean NOT NULL DEFAULT false;