-- Add task scheduling columns to weekly_commitments
ALTER TABLE weekly_commitments 
ADD COLUMN task_type TEXT CHECK (task_type IN ('recurring', 'independent')) DEFAULT 'recurring',
ADD COLUMN repeat_frequency TEXT CHECK (repeat_frequency IN ('daily', 'weekly', 'custom')),
ADD COLUMN repeat_times_per_period INT,
ADD COLUMN repeat_days_of_week TEXT[];

-- Modify commitment_completions for independent tasks and repetition instances
ALTER TABLE commitment_completions 
ALTER COLUMN commitment_id DROP NOT NULL,
ADD COLUMN task_type TEXT CHECK (task_type IN ('recurring', 'independent')) DEFAULT 'recurring',
ADD COLUMN instance_number INT,
ADD COLUMN title TEXT;

-- Add index for efficient queries on independent tasks
CREATE INDEX idx_commitment_completions_task_type ON commitment_completions(task_type);
CREATE INDEX idx_commitment_completions_date ON commitment_completions(completed_date);