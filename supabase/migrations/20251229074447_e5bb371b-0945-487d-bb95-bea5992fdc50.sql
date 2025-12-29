-- Add start_date and end_date columns to weekly_commitments for recurring tasks
ALTER TABLE public.weekly_commitments 
ADD COLUMN start_date date DEFAULT NULL,
ADD COLUMN end_date date DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.weekly_commitments.start_date IS 'Date when the recurring task becomes active';
COMMENT ON COLUMN public.weekly_commitments.end_date IS 'Date when the recurring task stops recurring';