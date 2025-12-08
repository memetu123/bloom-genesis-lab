import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek, endOfWeek, getDay } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import type { TaskType, RepetitionRules, DayOfWeek } from "@/types/scheduling";

/**
 * Hook for task scheduling operations
 * Handles creating, updating, and generating task instances
 */

const DAY_INDEX_MAP: Record<DayOfWeek, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export const useTaskScheduling = () => {
  const { user } = useAuth();

  /**
   * Create a recurring task (weekly commitment) with optional repetition rules
   */
  const createRecurringTask = useCallback(
    async (params: {
      title: string;
      goalId?: string | null;
      repetition?: RepetitionRules;
      timeStart?: string;
      timeEnd?: string;
      weekStart?: Date;
    }) => {
      if (!user) throw new Error("User not authenticated");

      const { title, goalId, repetition, timeStart, timeEnd, weekStart } = params;

      // Create the weekly commitment
      const { data: commitment, error } = await supabase
        .from("weekly_commitments")
        .insert({
          user_id: user.id,
          title,
          goal_id: goalId || null,
          task_type: "recurring" as TaskType,
          repeat_frequency: repetition?.frequency || "weekly",
          repeat_times_per_period: repetition?.timesPerPeriod || 1,
          repeat_days_of_week: repetition?.daysOfWeek || null,
          frequency_json: { times_per_week: repetition?.timesPerPeriod || 3 },
          default_time_start: timeStart || null,
          default_time_end: timeEnd || null,
          flexible_time: !timeStart,
          commitment_type: "habit",
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Generate daily checkins for the current week if weekStart is provided
      if (weekStart && commitment) {
        await generateCheckins(commitment.id, repetition, weekStart);
      }

      return commitment;
    },
    [user]
  );

  /**
   * Create an independent (one-time) task
   */
  const createIndependentTask = useCallback(
    async (params: {
      title: string;
      scheduledDate: string;
      timeStart?: string;
      timeEnd?: string;
    }) => {
      if (!user) throw new Error("User not authenticated");

      const { title, scheduledDate, timeStart, timeEnd } = params;

      // Create directly in commitment_completions without a weekly commitment
      const { data, error } = await supabase
        .from("commitment_completions")
        .insert({
          user_id: user.id,
          commitment_id: null,
          completed_date: scheduledDate,
          task_type: "independent" as TaskType,
          title,
          time_start: timeStart || null,
          time_end: timeEnd || null,
          is_flexible_time: !timeStart,
          instance_number: 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [user]
  );

  /**
   * Generate daily checkin records based on repetition rules
   */
  const generateCheckins = useCallback(
    async (
      commitmentId: string,
      repetition?: RepetitionRules,
      weekStart?: Date
    ) => {
      if (!user) return;

      const start = weekStart || startOfWeek(new Date(), { weekStartsOn: 1 });
      const end = endOfWeek(start, { weekStartsOn: 1 });

      const frequency = repetition?.frequency || "weekly";
      const timesPerPeriod = repetition?.timesPerPeriod || 1;
      const daysOfWeek = repetition?.daysOfWeek || [];

      // Create weekly checkin first
      const weekStartStr = format(start, "yyyy-MM-dd");
      const weekEndStr = format(end, "yyyy-MM-dd");

      await supabase.from("weekly_checkins").upsert(
        {
          user_id: user.id,
          weekly_commitment_id: commitmentId,
          period_start_date: weekStartStr,
          period_end_date: weekEndStr,
          planned_count: frequency === "weekly" ? timesPerPeriod : timesPerPeriod * 7,
          actual_count: 0,
        },
        { onConflict: "weekly_commitment_id,period_start_date" }
      );

      // For custom frequency, generate for specific days
      if (frequency === "custom" && daysOfWeek.length > 0) {
        for (let i = 0; i < 7; i++) {
          const date = addDays(start, i);
          const dayIndex = getDay(date);
          const dayName = Object.keys(DAY_INDEX_MAP).find(
            (key) => DAY_INDEX_MAP[key as DayOfWeek] === dayIndex
          ) as DayOfWeek;

          if (daysOfWeek.includes(dayName)) {
            // Create completion placeholder for this day
            // (This is just for tracking - actual completion happens when user marks complete)
          }
        }
      }
    },
    [user]
  );

  /**
   * Convert an independent task to recurring
   */
  const convertToRecurring = useCallback(
    async (
      completionId: string,
      repetition: RepetitionRules
    ) => {
      if (!user) throw new Error("User not authenticated");

      // Get the existing completion
      const { data: completion, error: fetchError } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("id", completionId)
        .single();

      if (fetchError || !completion) throw fetchError;

      // Create a new weekly commitment
      const commitment = await createRecurringTask({
        title: completion.title || "Untitled Task",
        repetition,
        timeStart: completion.time_start || undefined,
        timeEnd: completion.time_end || undefined,
      });

      // Update the existing completion to link to the new commitment
      await supabase
        .from("commitment_completions")
        .update({
          commitment_id: commitment.id,
          task_type: "recurring",
        })
        .eq("id", completionId);

      return commitment;
    },
    [user, createRecurringTask]
  );

  /**
   * Convert a recurring task to independent (keep only today's instance)
   */
  const convertToIndependent = useCallback(
    async (commitmentId: string, keepDate: string) => {
      if (!user) throw new Error("User not authenticated");

      // Get the commitment details
      const { data: commitment, error: fetchError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("id", commitmentId)
        .single();

      if (fetchError || !commitment) throw fetchError;

      // Update the specific date's completion to be independent
      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", commitmentId)
        .eq("completed_date", keepDate)
        .maybeSingle();

      if (existingCompletion) {
        // Update existing completion to independent
        await supabase
          .from("commitment_completions")
          .update({
            commitment_id: null,
            task_type: "independent",
            title: commitment.title,
          })
          .eq("id", existingCompletion.id);
      } else {
        // Create new independent completion (not completed yet)
        const { data: newCompletion } = await supabase
          .from("commitment_completions")
          .insert({
            user_id: user.id,
            commitment_id: null,
            completed_date: keepDate,
            task_type: "independent",
            title: commitment.title,
            time_start: commitment.default_time_start,
            time_end: commitment.default_time_end,
            is_flexible_time: commitment.flexible_time,
          })
          .select()
          .single();

        // Create a daily_task_instance with is_completed = false
        if (newCompletion) {
          await supabase.from("daily_task_instances").insert({
            user_id: user.id,
            completion_id: newCompletion.id,
            is_completed: false,
            time_start: commitment.default_time_start,
            time_end: commitment.default_time_end,
          });
        }
      }

      // Delete future completions for this commitment
      await supabase
        .from("commitment_completions")
        .delete()
        .eq("commitment_id", commitmentId)
        .gt("completed_date", keepDate);

      // Deactivate the weekly commitment
      await supabase
        .from("weekly_commitments")
        .update({ is_active: false })
        .eq("id", commitmentId);
    },
    [user]
  );

  /**
   * Update task repetition rules
   */
  const updateRepetitionRules = useCallback(
    async (commitmentId: string, repetition: RepetitionRules) => {
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("weekly_commitments")
        .update({
          repeat_frequency: repetition.frequency,
          repeat_times_per_period: repetition.timesPerPeriod,
          repeat_days_of_week: repetition.daysOfWeek,
          frequency_json: { times_per_week: repetition.timesPerPeriod },
        })
        .eq("id", commitmentId);

      if (error) throw error;
    },
    [user]
  );

  return {
    createRecurringTask,
    createIndependentTask,
    generateCheckins,
    convertToRecurring,
    convertToIndependent,
    updateRepetitionRules,
  };
};
