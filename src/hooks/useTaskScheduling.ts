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
      startDate?: string;
      endDate?: string;
    }) => {
      if (!user) throw new Error("User not authenticated");

      const { title, goalId, recurrence, timeStart, timeEnd, weekStart, startDate, endDate } = params;

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
          start_date: startDate || null,
          end_date: endDate || null,
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
   * If goalId is provided, creates a weekly_commitment to link the task to the goal
   */
  const createIndependentTask = useCallback(
    async (params: {
      title: string;
      scheduledDate: string;
      timeStart?: string;
      timeEnd?: string;
      goalId?: string;
    }) => {
      if (!user) throw new Error("User not authenticated");

      const { title, scheduledDate, timeStart, timeEnd, goalId } = params;

      let commitmentId: string | null = null;

      // If a goal is selected, create a weekly_commitment to link the task
      if (goalId) {
        const { data: commitment, error: commitmentError } = await supabase
          .from("weekly_commitments")
          .insert({
            user_id: user.id,
            title,
            goal_id: goalId,
            task_type: "independent",
            recurrence_type: "none",
            times_per_day: 1,
            repeat_days_of_week: null,
            default_time_start: timeStart || null,
            default_time_end: timeEnd || null,
            flexible_time: !timeStart,
            commitment_type: "task",
            is_active: false, // Mark as inactive since it's a one-time task
            repeat_frequency: null,
            repeat_times_per_period: 1,
            frequency_json: { times_per_week: 1 },
          })
          .select()
          .single();

        if (commitmentError) {
          console.error("Error creating weekly_commitment for independent task:", commitmentError);
          // Continue without goal linking if it fails
        } else {
          commitmentId = commitment.id;
        }
      }

      // Create in commitment_completions
      const { data: completion, error } = await supabase
        .from("commitment_completions")
        .insert({
          user_id: user.id,
          commitment_id: commitmentId,
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

      // Create a daily_task_instance for completion tracking
      if (completion) {
        await supabase.from("daily_task_instances").insert({
          user_id: user.id,
          completion_id: completion.id,
          is_completed: false,
          time_start: timeStart || null,
          time_end: timeEnd || null,
        });
      }

      return completion;
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

  /**
   * Create an exception for a single occurrence of a recurring task.
   * This preserves the original series but overrides values for just one date.
   * 
   * When moving to a different date:
   * 1. Creates/updates the moved occurrence at the NEW date (with is_detached: true)
   * 2. Creates a SKIP marker at the ORIGINAL date (is_detached: true, is_deleted: true)
   *    so the original slot is not generated by useWeeklyData
   */
  const createOccurrenceException = useCallback(
    async (
      commitmentId: string,
      occurrenceDate: string,
      updates: {
        title?: string;
        timeStart?: string | null;
        timeEnd?: string | null;
        goalId?: string | null;
        newDate?: string; // Allow moving to a different date
      }
    ) => {
      if (!user) throw new Error("User not authenticated");

      // Get the original commitment for default values
      const { data: commitment, error: fetchError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("id", commitmentId)
        .single();

      if (fetchError || !commitment) throw fetchError;

      // Check if there's already a completion record for this date
      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", commitmentId)
        .eq("completed_date", occurrenceDate)
        .maybeSingle();

      // Determine the final date (use new date if provided, otherwise keep original)
      const finalDate = updates.newDate || occurrenceDate;
      const isMovingDate = updates.newDate && updates.newDate !== occurrenceDate;

      if (isMovingDate) {
        // MOVING TO A DIFFERENT DATE
        // Step 1: Create/update skip marker for the ORIGINAL date
        if (existingCompletion) {
          // Existing completion becomes a skip marker (hidden)
          await supabase
            .from("commitment_completions")
            .update({
              is_detached: true,
              is_deleted: true, // Mark as deleted so it's hidden
              deleted_at: new Date().toISOString(),
            })
            .eq("id", existingCompletion.id);
        } else {
          // Create a skip marker for the original date
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: commitmentId,
              completed_date: occurrenceDate,
              title: commitment.title,
              is_detached: true,
              is_deleted: true, // Mark as deleted/skipped
              deleted_at: new Date().toISOString(),
              task_type: "recurring",
              is_completed: false,
            });
        }

        // Step 2: Check if there's already a completion at the NEW date
        const { data: targetCompletion } = await supabase
          .from("commitment_completions")
          .select("*")
          .eq("commitment_id", commitmentId)
          .eq("completed_date", finalDate)
          .maybeSingle();

        if (targetCompletion) {
          // Update existing record at target date
          await supabase
            .from("commitment_completions")
            .update({
              title: updates.title ?? targetCompletion.title ?? commitment.title,
              time_start: updates.timeStart !== undefined ? updates.timeStart : (targetCompletion.time_start || commitment.default_time_start),
              time_end: updates.timeEnd !== undefined ? updates.timeEnd : (targetCompletion.time_end || commitment.default_time_end),
              is_flexible_time: updates.timeStart !== undefined ? !updates.timeStart : targetCompletion.is_flexible_time,
              is_detached: true,
              is_deleted: false, // Ensure it's visible
              deleted_at: null,
              task_type: "independent",
            })
            .eq("id", targetCompletion.id);
        } else {
          // Create the moved occurrence at the new date
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: commitmentId,
              completed_date: finalDate,
              title: updates.title ?? commitment.title,
              time_start: updates.timeStart !== undefined ? updates.timeStart : commitment.default_time_start,
              time_end: updates.timeEnd !== undefined ? updates.timeEnd : commitment.default_time_end,
              is_flexible_time: updates.timeStart !== undefined ? !updates.timeStart : commitment.flexible_time,
              is_detached: true,
              task_type: "independent",
              is_completed: false,
            });
        }
      } else {
        // NOT MOVING DATE - just updating attributes for this occurrence
        if (existingCompletion) {
          // Update existing completion with overrides
          await supabase
            .from("commitment_completions")
            .update({
              title: updates.title ?? existingCompletion.title ?? commitment.title,
              time_start: updates.timeStart !== undefined ? updates.timeStart : existingCompletion.time_start,
              time_end: updates.timeEnd !== undefined ? updates.timeEnd : existingCompletion.time_end,
              is_flexible_time: updates.timeStart !== undefined ? !updates.timeStart : existingCompletion.is_flexible_time,
              is_detached: true, // Mark as exception
              task_type: "independent",
            })
            .eq("id", existingCompletion.id);
        } else {
          // Create new completion record as an exception
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: commitmentId,
              completed_date: finalDate,
              title: updates.title ?? commitment.title,
              time_start: updates.timeStart !== undefined ? updates.timeStart : commitment.default_time_start,
              time_end: updates.timeEnd !== undefined ? updates.timeEnd : commitment.default_time_end,
              is_flexible_time: updates.timeStart !== undefined ? !updates.timeStart : commitment.flexible_time,
              is_detached: true,
              task_type: "independent",
              is_completed: false,
            });
        }
      }
    },
    [user]
  );

  /**
   * Split a recurring series at a given date.
   * - Ends the original series the day before the split date
   * - Creates a new series starting from the split date with updated values
   */
  const splitRecurringSeries = useCallback(
    async (
      commitmentId: string,
      splitDate: string,
      updates: {
        title?: string;
        timeStart?: string | null;
        timeEnd?: string | null;
        goalId?: string | null;
        recurrenceType?: RecurrenceType;
        timesPerDay?: number;
        daysOfWeek?: DayOfWeek[];
      }
    ) => {
      if (!user) throw new Error("User not authenticated");

      // Get the original commitment
      const { data: commitment, error: fetchError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("id", commitmentId)
        .single();

      if (fetchError || !commitment) throw fetchError;

      // Calculate the day before the split date
      const splitDateObj = new Date(splitDate);
      const dayBefore = new Date(splitDateObj);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const endDateStr = format(dayBefore, "yyyy-MM-dd");

      // End the original series
      await supabase
        .from("weekly_commitments")
        .update({
          end_date: endDateStr,
        })
        .eq("id", commitmentId);

      // Create the new series with updated values
      const newRecurrenceType = updates.recurrenceType ?? (commitment.recurrence_type as RecurrenceType) ?? "weekly";
      const newTimesPerDay = updates.timesPerDay ?? commitment.times_per_day ?? 1;
      const newDaysOfWeek = updates.daysOfWeek ?? (commitment.repeat_days_of_week as DayOfWeek[]) ?? null;

      const { data: newCommitment, error: insertError } = await supabase
        .from("weekly_commitments")
        .insert({
          user_id: user.id,
          title: updates.title ?? commitment.title,
          goal_id: updates.goalId !== undefined ? updates.goalId : commitment.goal_id,
          task_type: "recurring",
          recurrence_type: newRecurrenceType,
          times_per_day: newTimesPerDay,
          repeat_days_of_week: newDaysOfWeek,
          default_time_start: updates.timeStart !== undefined ? updates.timeStart : commitment.default_time_start,
          default_time_end: updates.timeEnd !== undefined ? updates.timeEnd : commitment.default_time_end,
          flexible_time: updates.timeStart !== undefined ? !updates.timeStart : commitment.flexible_time,
          commitment_type: commitment.commitment_type,
          is_active: true,
          start_date: splitDate,
          end_date: commitment.end_date, // Preserve original end date if any
          // Legacy fields
          repeat_frequency: newRecurrenceType === 'daily' ? 'daily' : 'weekly',
          repeat_times_per_period: newRecurrenceType === 'daily' 
            ? newTimesPerDay 
            : (newDaysOfWeek?.length || 1),
          frequency_json: { 
            times_per_week: newRecurrenceType === 'daily' 
              ? 7 
              : (newDaysOfWeek?.length || 1) 
          },
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return newCommitment;
    },
    [user]
  );

  /**
   * Delete a single occurrence of a recurring task.
   * Creates a soft-deleted exception for that date without affecting other occurrences.
   */
  const deleteOccurrence = useCallback(
    async (commitmentId: string, occurrenceDate: string) => {
      if (!user) throw new Error("User not authenticated");

      // Get the original commitment for default values
      const { data: commitment, error: fetchError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("id", commitmentId)
        .single();

      if (fetchError || !commitment) throw fetchError;

      // Check if there's already a completion record for this date
      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", commitmentId)
        .eq("completed_date", occurrenceDate)
        .maybeSingle();

      if (existingCompletion) {
        // Soft delete the existing completion
        await supabase
          .from("commitment_completions")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            is_detached: true, // Mark as exception so it's excluded from the series
          })
          .eq("id", existingCompletion.id);
      } else {
        // Create a new completion record marked as deleted (an exclusion exception)
        await supabase
          .from("commitment_completions")
          .insert({
            user_id: user.id,
            commitment_id: commitmentId,
            completed_date: occurrenceDate,
            title: commitment.title,
            time_start: commitment.default_time_start,
            time_end: commitment.default_time_end,
            is_flexible_time: commitment.flexible_time,
            is_detached: true,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            task_type: "recurring",
            is_completed: false,
          });
      }
    },
    [user]
  );

  /**
   * Delete this and all future occurrences by ending the series.
   * Sets the end_date to the day before the selected date.
   */
  const deleteFutureOccurrences = useCallback(
    async (commitmentId: string, fromDate: string) => {
      if (!user) throw new Error("User not authenticated");

      // Calculate the day before the selected date
      const fromDateObj = new Date(fromDate);
      const dayBefore = new Date(fromDateObj);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const endDateStr = format(dayBefore, "yyyy-MM-dd");

      // Get the original commitment to check start_date
      const { data: commitment, error: fetchError } = await supabase
        .from("weekly_commitments")
        .select("start_date")
        .eq("id", commitmentId)
        .single();

      if (fetchError || !commitment) throw fetchError;

      // If the end date would be before or equal to start date, delete the entire series
      if (commitment.start_date && endDateStr < commitment.start_date) {
        await supabase
          .from("weekly_commitments")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
          })
          .eq("id", commitmentId);
      } else {
        // End the series the day before
        await supabase
          .from("weekly_commitments")
          .update({
            end_date: endDateStr,
          })
          .eq("id", commitmentId);
      }

      // Also soft-delete any future completion records
      await supabase
        .from("commitment_completions")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("commitment_id", commitmentId)
        .gte("completed_date", fromDate);
    },
    [user]
  );

  /**
   * Delete the entire recurring series including all past, present, and future occurrences.
   */
  const deleteEntireSeries = useCallback(
    async (commitmentId: string) => {
      if (!user) throw new Error("User not authenticated");

      // Soft delete the weekly commitment
      await supabase
        .from("weekly_commitments")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", commitmentId);

      // Soft delete all completion records
      await supabase
        .from("commitment_completions")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("commitment_id", commitmentId);
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
    createOccurrenceException,
    splitRecurringSeries,
    deleteOccurrence,
    deleteFutureOccurrences,
    deleteEntireSeries,
  };
};
