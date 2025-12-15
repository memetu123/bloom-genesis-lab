-- Add unique constraint to prevent duplicate pillar names per user
ALTER TABLE public.pillars 
ADD CONSTRAINT pillars_user_id_name_unique UNIQUE (user_id, name);