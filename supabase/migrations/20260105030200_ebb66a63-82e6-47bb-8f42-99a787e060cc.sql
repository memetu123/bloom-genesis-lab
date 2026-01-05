-- Add orientation line column to user_preferences
ALTER TABLE public.user_preferences 
ADD COLUMN north_star_orientation TEXT DEFAULT NULL;