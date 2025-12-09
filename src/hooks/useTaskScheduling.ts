import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek, endOfWeek, getDay } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import type { RecurrenceType, RecurrenceRules, DayOfWeek } from "@/types/scheduling";

/**
 * Hook for task scheduling operations
 * 
 * Recurrence Model:
 * - 'none': One-time task, no auto-generation
 * - 'daily': Generate task for every day, with times_per_day instances
 * - 'weekly': Generate task only on selected days_of_week
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

const INDEX_TO_DAY: Record<number, DayOfWeek> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

export const useTaskScheduling = () => {
  const { user } = useAuth();

  /**
   * Create a recurring task with new recurrence model
   */
  const createRecurringTask = useCallback(
    async (params: {
      title: string;
      goalId?: string | null;
      recurrence: RecurrenceRules;
      timeStart?: string;
      timeEnd?: string;
      weekStart?: Date;
    }) => {
      if (!user) throw new Error("User not authenticated");

      const { title, goalId, recurrence, timeStart, timeEnd, weekStart } = params;

      // Create the weekly commitment with new fields
      const { data: commitment, error } = await supabase
        .from("weekly_commitments")
        .insert({
          user_id: user.id,
          title,
          goal_id: goalId || null,
          task_type: "recurring",
          recurrence_type: recurrence.recurrenceType,
          times_per_day: recurrence.timesPerDay || 1,
          repeat_days_of_week: recurrence.daysOfWeek || null,
          default_time_start: timeStart || null,
          default_time_end: timeEnd || null,
          flexible_time: !timeStart,
          commitment_type: "habit",
          is_active: true,
          // Legacy fields for backward compatibility
          repeat_frequency: recurrence.recurrenceType === 'daily' ? 'daily' : 'weekly',
          repeat_times_per_period: recurrence.recurrenceType === 'daily' 
            ? recurrence.timesPerDay 
            : (recurrence.daysOfWeek?.length || 1),
          frequency_json: { 
            times_per_week: recurrence.recurrenceType === 'daily' 
              ? 7 
              : (recurrence.daysOfWeek?.length || 1) 
          },
        })
        .select()
        .single();

      if (error) throw error;

      // Generate weekly checkin for the current week
      if (weekStart && commitment) {
        await ensureWeeklyCheckin(commitment.id, recurrence, weekStart);
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
          task_type: "independent",
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
   * Ensure weekly checkin record exists
   */
  const ensureWeeklyCheckin = useCallback(
    async (
      commitmentId: string,
      recurrence: RecurrenceRules,
      weekStart: Date
    ) => {
      if (!user) return;

      const start = weekStart;
      const end = endOfWeek(start, { weekStartsOn: 1 });
      const weekStartStr = format(start, "yyyy-MM-dd");
      const weekEndStr = format(end, "yyyy-MM-dd");

      // Calculate planned count based on recurrence type
      let plannedCount = 0;
      if (recurrence.recurrenceType === 'daily') {
        plannedCount = 7 * (recurrence.timesPerDay || 1);
      } else if (recurrence.recurrenceType === 'weekly') {
        plannedCount = recurrence.daysOfWeek?.length || 0;
      }

      await supabase.from("weekly_checkins").upsert(
        {
          user_id: user.id,
          weekly_commitment_id: commitmentId,
          period_start_date: weekStartStr,
          period_end_date: weekEndStr,
          planned_count: plannedCount,
          actual_count: 0,
        },
        { onConflict: "weekly_commitment_id,period_start_date" }
      );
    },
    [user]
  );

  /**
   * Check if a task should appear on a given date based on recurrence rules
   */
  const shouldShowOnDate = useCallback(
    (
      recurrenceType: RecurrenceType,
      daysOfWeek: string[] | null,
      date: Date
    ): boolean => {
      if (recurrenceType === 'none') {
        return false; // Independent tasks are handled separately
      }

      if (recurrenceType === 'daily') {
        return true; // Show every day
      }

      if (recurrenceType === 'weekly') {
        if (!daysOfWeek || daysOfWeek.length === 0) {
          return false; // No days selected, don't show
        }
        const dayIndex = getDay(date);
        const dayName = INDEX_TO_DAY[dayIndex];
        return daysOfWeek.includes(dayName);
      }

      return false;
    },
    []
  );

  /**
   * Detach a single day's instance from recurring series
   */
  const detachInstance = useCallback(
    async (commitmentId: string, detachDate: string) => {
      if (!user) throw new Error("User not authenticated");

      const { data: commitment, error: fetchError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("id", commitmentId)
        .single();

      if (fetchError || !commitment) throw fetchError;

      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", commitmentId)
        .eq("completed_date", detachDate)
        .maybeSingle();

      if (existingCompletion) {
        await supabase
          .from("commitment_completions")
          .update({
            is_detached: true,
            task_type: "independent",
          })
          .eq("id", existingCompletion.id);
      } else {
        const { data: newCompletion } = await supabase
          .from("commitment_completions")
          .insert({
            user_id: user.id,
            commitment_id: commitmentId,
            completed_date: detachDate,
            task_type: "independent",
            is_detached: true,
            title: commitment.title,
            time_start: commitment.default_time_start,
            time_end: commitment.default_time_end,
            is_flexible_time: commitment.flexible_time,
          })
          .select()
          .single();

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
    },
    [user]
  );

  /**
   * Update time for a single day's instance
   */
  const updateInstanceTime = useCallback(
    async (
      commitmentId: string,
      instanceDate: string,
      timeStart: string | null,
      timeEnd: string | null
    ) => {
      if (!user) throw new Error("User not authenticated");

      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", commitmentId)
        .eq("completed_date", instanceDate)
        .maybeSingle();

      if (existingCompletion) {
        await supabase
          .from("commitment_completions")
          .update({
            time_start: timeStart,
            time_end: timeEnd,
            is_flexible_time: !timeStart,
          })
          .eq("id", existingCompletion.id);
      } else {
        await supabase
          .from("commitment_completions")
          .insert({
            user_id: user.id,
            commitment_id: commitmentId,
            completed_date: instanceDate,
            task_type: "recurring",
            is_detached: false,
            time_start: timeStart,
            time_end: timeEnd,
            is_flexible_time: !timeStart,
          });
      }
    },
    [user]
  );

  /**
   * Update recurrence rules for an existing task
   */
  const updateRecurrenceRules = useCallback(
    async (commitmentId: string, recurrence: RecurrenceRules) => {
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("weekly_commitments")
        .update({
          recurrence_type: recurrence.recurrenceType,
          times_per_day: recurrence.timesPerDay || 1,
          repeat_days_of_week: recurrence.daysOfWeek || null,
          // Legacy fields
          repeat_frequency: recurrence.recurrenceType === 'daily' ? 'daily' : 'weekly',
          repeat_times_per_period: recurrence.recurrenceType === 'daily' 
            ? recurrence.timesPerDay 
            : (recurrence.daysOfWeek?.length || 1),
          frequency_json: { 
            times_per_week: recurrence.recurrenceType === 'daily' 
              ? 7 
              : (recurrence.daysOfWeek?.length || 1) 
          },
        })
        .eq("id", commitmentId);

      if (error) throw error;
    },
    [user]
  );

  /**
   * Convert independent task to recurring
   */
  const convertToRecurring = useCallback(
    async (completionId: string, recurrence: RecurrenceRules) => {
      if (!user) throw new Error("User not authenticated");

      const { data: completion, error: fetchError } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("id", completionId)
        .single();

      if (fetchError || !completion) throw fetchError;

      const commitment = await createRecurringTask({
        title: completion.title || "Untitled Task",
        recurrence,
        timeStart: completion.time_start || undefined,
        timeEnd: completion.time_end || undefined,
      });

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
   * Convert recurring task to independent (deactivates series)
   */
  const convertToIndependent = useCallback(
    async (commitmentId: string, keepDate: string) => {
      if (!user) throw new Error("User not authenticated");

      const { data: commitment, error: fetchError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("id", commitmentId)
        .single();

      if (fetchError || !commitment) throw fetchError;

      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", commitmentId)
        .eq("completed_date", keepDate)
        .maybeSingle();

      if (existingCompletion) {
        await supabase
          .from("commitment_completions")
          .update({
            commitment_id: null,
            task_type: "independent",
            is_detached: true,
            title: commitment.title,
          })
          .eq("id", existingCompletion.id);
      } else {
        const { data: newCompletion } = await supabase
          .from("commitment_completions")
          .insert({
            user_id: user.id,
            commitment_id: null,
            completed_date: keepDate,
            task_type: "independent",
            is_detached: true,
            title: commitment.title,
            time_start: commitment.default_time_start,
            time_end: commitment.default_time_end,
            is_flexible_time: commitment.flexible_time,
          })
          .select()
          .single();

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

      // Deactivate the weekly commitment
      await supabase
        .from("weekly_commitments")
        .update({ is_active: false })
        .eq("id", commitmentId);
    },
    [user]
  );

  return {
    createRecurringTask,
    createIndependentTask,
    ensureWeeklyCheckin,
    shouldShowOnDate,
    detachInstance,
    updateInstanceTime,
    updateRecurrenceRules,
    convertToRecurring,
    convertToIndependent,
  };
};
