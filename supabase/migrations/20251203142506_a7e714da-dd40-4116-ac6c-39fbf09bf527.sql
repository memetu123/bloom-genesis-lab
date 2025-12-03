-- Todayoum Database Schema
-- Life planning hierarchy: Pillar → Vision → 3-Year → 1-Year → 90-Day → Weekly Commitments

-- Create enum for goal types
CREATE TYPE public.goal_type AS ENUM ('three_year', 'one_year', 'ninety_day');

-- Create enum for goal status
CREATE TYPE public.goal_status AS ENUM ('not_started', 'in_progress', 'completed', 'paused');

-- Create enum for commitment types
CREATE TYPE public.commitment_type AS ENUM ('habit', 'task');

-- User profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Life Pillars (e.g., Health, Career, Relationships)
CREATE TABLE public.pillars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Life Visions (who user wants to become in each pillar)
CREATE TABLE public.life_visions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pillar_id UUID NOT NULL REFERENCES public.pillars(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Goals (3-Year, 1-Year, 90-Day plans)
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pillar_id UUID NOT NULL REFERENCES public.pillars(id) ON DELETE CASCADE,
  life_vision_id UUID REFERENCES public.life_visions(id) ON DELETE SET NULL,
  parent_goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  goal_type public.goal_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status public.goal_status DEFAULT 'not_started',
  start_date DATE,
  target_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weekly Commitments (habits and recurring tasks)
CREATE TABLE public.weekly_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  commitment_type public.commitment_type NOT NULL DEFAULT 'habit',
  frequency_json JSONB DEFAULT '{"times_per_week": 3}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Commitment completions (track daily check-ins)
CREATE TABLE public.commitment_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID NOT NULL REFERENCES public.weekly_commitments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(commitment_id, completed_date)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.life_visions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitment_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for pillars
CREATE POLICY "Users can view own pillars" ON public.pillars FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own pillars" ON public.pillars FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pillars" ON public.pillars FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pillars" ON public.pillars FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for life_visions
CREATE POLICY "Users can view own visions" ON public.life_visions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own visions" ON public.life_visions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own visions" ON public.life_visions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own visions" ON public.life_visions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for goals
CREATE POLICY "Users can view own goals" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own goals" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for weekly_commitments
CREATE POLICY "Users can view own commitments" ON public.weekly_commitments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own commitments" ON public.weekly_commitments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own commitments" ON public.weekly_commitments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own commitments" ON public.weekly_commitments FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for commitment_completions
CREATE POLICY "Users can view own completions" ON public.commitment_completions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own completions" ON public.commitment_completions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own completions" ON public.commitment_completions FOR DELETE USING (auth.uid() = user_id);

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
  RETURN new;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pillars_updated_at BEFORE UPDATE ON public.pillars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_life_visions_updated_at BEFORE UPDATE ON public.life_visions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_commitments_updated_at BEFORE UPDATE ON public.weekly_commitments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();