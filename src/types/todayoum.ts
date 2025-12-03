/**
 * Todayoum Type Definitions
 * Core types for the life planning hierarchy
 */

export interface Pillar {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LifeVision {
  id: string;
  user_id: string;
  pillar_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type GoalType = "three_year" | "one_year" | "ninety_day";
export type GoalStatus = "not_started" | "in_progress" | "completed" | "paused";
export type CommitmentType = "habit" | "task";

export interface Goal {
  id: string;
  user_id: string;
  pillar_id: string;
  life_vision_id: string | null;
  parent_goal_id: string | null;
  goal_type: GoalType;
  title: string;
  description: string | null;
  status: GoalStatus;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyCommitment {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  commitment_type: CommitmentType;
  frequency_json: { times_per_week: number };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommitmentCompletion {
  id: string;
  commitment_id: string;
  user_id: string;
  completed_date: string;
  created_at: string;
}

export interface WeeklyCheckin {
  id: string;
  user_id: string;
  weekly_commitment_id: string;
  period_start_date: string;
  period_end_date: string;
  planned_count: number;
  actual_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Onboarding state
export interface OnboardingData {
  selectedPillars: { name: string; description: string }[];
  selectedPillarForVision: string | null;
  vision: { title: string; description: string } | null;
  threeYearGoal: { title: string; description: string } | null;
  oneYearGoal: { title: string; description: string } | null;
  ninetyDayGoal: { title: string; description: string } | null;
  commitments: { title: string; timesPerWeek: number }[];
}

// Default pillar suggestions
export const SUGGESTED_PILLARS = [
  { name: "Health & Wellness", description: "Physical health, fitness, nutrition, and mental well-being" },
  { name: "Career & Work", description: "Professional growth, skills development, and career goals" },
  { name: "Relationships", description: "Family, friendships, romantic relationships, and community" },
  { name: "Learning & Growth", description: "Education, intellectual development, and personal skills" },
  { name: "Finance", description: "Financial health, savings, investments, and security" },
  { name: "Creativity & Hobbies", description: "Creative pursuits, hobbies, and personal interests" },
  { name: "Spirituality & Purpose", description: "Inner life, values, meaning, and contribution" },
  { name: "Environment & Lifestyle", description: "Home, surroundings, daily routines, and quality of life" }
];