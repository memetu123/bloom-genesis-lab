/**
 * useWeeklyData - Centralized data fetching for Weekly page
 * Fetches all data in a single batch, processes in memory
 * Uses stable cache keys to prevent refetching
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import type { TaskType } from "@/types/scheduling";

export interface DayTask {
  id: string;
  commitmentId: string | null;
  title: string;
  isCompleted: boolean;
  timeStart: string | null;
  timeEnd: string | null;
  taskType: TaskType;
  instanceNumber?: number;
  totalInstances?: number;
  isDetached?: boolean;
  /** Goal ID linked to this task (via weekly_commitment) */
  goalId: string | null;
}

export interface CommitmentData {
  id: string;
  title: string;
  frequency_json: { times_per_week: number };
  goal_id: string | null;
  checkin: {
    id: string;
    planned_count: number;
    actual_count: number;
  } | null;
  goal_is_focus: boolean | null;
  // For TaskDetailModal - avoid extra fetch
  recurrence_type: string;
  times_per_day: number;
  repeat_days_of_week: string[];
  default_time_start: string | null;
  default_time_end: string | null;
}

interface UseWeeklyDataResult {
  commitments: CommitmentData[];
  tasksByDate: Record<string, DayTask[]>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DAY_INDEX_TO_NAME: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"
};

export function useWeeklyData(
  weekStart: Date,
  weekEnd: Date
): UseWeeklyDataResult {
  const { user } = useAuth();
  const { goalsMap } = useAppData();
  
  const [commitments, setCommitments] = useState<CommitmentData[]>([]);
  const [tasksByDate, setTasksByDate] = useState<Record<string, DayTask[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cache key to prevent duplicate fetches
  const cacheKeyRef = useRef<string>("");
  const isFetchingRef = useRef(false);

  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");
  const currentCacheKey = user ? `${user.id}:${weekStartStr}:${weekEndStr}` : "";

  const fetchData = useCallback(async () => {
    if (!user) {
      setCommitments([]);
      setTasksByDate({});
      setLoading(false);
      return;
    }

    // Skip if already fetching or same cache key
    if (isFetchingRef.current) return;
    if (cacheKeyRef.current === currentCacheKey && commitments.length > 0) {
      setLoading(false);
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Generate date keys for the week
      const dateKeys: string[] = [];
      for (let i = 0; i < 7; i++) {
        dateKeys.push(format(addDays(weekStart, i), "yyyy-MM-dd"));
      }

      // SINGLE BATCH: Fetch all data in parallel
      const [
        commitmentsResult,
        checkinsResult,
        completionsResult,
        taskInstancesResult,
      ] = await Promise.all([
        // Active weekly commitments
        supabase
          .from("weekly_commitments")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // Weekly checkins for this week
        supabase
          .from("weekly_checkins")
          .select("*")
          .eq("user_id", user.id)
          .eq("period_start_date", weekStartStr),
        
        // All completions for this week
        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .gte("completed_date", weekStartStr)
          .lte("completed_date", weekEndStr)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // Task instances for completion tracking
        supabase
          .from("daily_task_instances")
          .select("*")
          .eq("user_id", user.id),
      ]);

      if (commitmentsResult.error) throw commitmentsResult.error;

      const rawCommitments = commitmentsResult.data || [];
      const existingCheckins = checkinsResult.data || [];
      const allCompletions = completionsResult.data || [];
      const taskInstances = taskInstancesResult.data || [];

      // Build lookup maps (O(1) access)
      const checkinByCommitmentId = new Map(
        existingCheckins.map(c => [c.weekly_commitment_id, c])
      );
      const taskInstanceMap = new Map(
        taskInstances.map(ti => [ti.completion_id, ti])
      );

      // Completions by commitment-date key
      const completionMap = new Map<string, any>();
      for (const completion of allCompletions) {
        if (completion.commitment_id) {
          const key = `${completion.commitment_id}-${completion.completed_date}`;
          completionMap.set(key, completion);
        }
      }

      // Independent/detached tasks by date
      const independentByDate = new Map<string, any[]>();
      for (const c of allCompletions) {
        if (c.task_type === "independent" || c.is_detached) {
          const list = independentByDate.get(c.completed_date) || [];
          list.push(c);
          independentByDate.set(c.completed_date, list);
        }
      }

      // Create missing checkins in batch (single INSERT)
      const checkinsToCreate: any[] = [];
      for (const commitment of rawCommitments) {
        if (!checkinByCommitmentId.has(commitment.id)) {
          const frequency = commitment.frequency_json as { times_per_week: number };
          checkinsToCreate.push({
            user_id: user.id,
            weekly_commitment_id: commitment.id,
            period_start_date: weekStartStr,
            period_end_date: weekEndStr,
            planned_count: frequency.times_per_week || 1,
            actual_count: 0
          });
        }
      }

      if (checkinsToCreate.length > 0) {
        const { data: newCheckins } = await supabase
          .from("weekly_checkins")
          .insert(checkinsToCreate)
          .select();
        
        for (const checkin of newCheckins || []) {
          checkinByCommitmentId.set(checkin.weekly_commitment_id, checkin);
        }
      }

      // Build enriched commitments
      const enrichedCommitments: CommitmentData[] = rawCommitments.map(commitment => {
        const frequency = commitment.frequency_json as { times_per_week: number };
        const checkin = checkinByCommitmentId.get(commitment.id);
        const goalIsFocus = commitment.goal_id ? goalsMap.get(commitment.goal_id)?.is_focus ?? null : null;

        return {
          id: commitment.id,
          title: commitment.title,
          frequency_json: frequency,
          goal_id: commitment.goal_id,
          checkin: checkin ? {
            id: checkin.id,
            planned_count: checkin.planned_count,
            actual_count: checkin.actual_count
          } : null,
          goal_is_focus: goalIsFocus,
          // Include recurrence details for TaskDetailModal
          recurrence_type: commitment.recurrence_type || 'weekly',
          times_per_day: commitment.times_per_day || 1,
          repeat_days_of_week: commitment.repeat_days_of_week || [],
          default_time_start: commitment.default_time_start,
          default_time_end: commitment.default_time_end,
        };
      });

      setCommitments(enrichedCommitments);

      // Build commitment details lookup (including date bounds)
      const commitmentDetailsMap = new Map(
        rawCommitments.map(c => [c.id, {
          start: c.default_time_start,
          end: c.default_time_end,
          recurrenceType: c.recurrence_type || 'weekly',
          timesPerDay: c.times_per_day || 1,
          daysOfWeek: c.repeat_days_of_week || [],
          startDate: c.start_date,
          endDate: c.end_date,
        }])
      );

      // Build tasks for each day (all in memory)
      const tasksMap: Record<string, DayTask[]> = {};
      
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const dateKey = format(date, "yyyy-MM-dd");
        const dayOfWeek = date.getDay();
        const dayName = DAY_INDEX_TO_NAME[dayOfWeek];
        tasksMap[dateKey] = [];

        // Add recurring tasks
        for (const commitment of enrichedCommitments) {
          const details = commitmentDetailsMap.get(commitment.id);
          if (!details) continue;

          // Check date bounds (start_date and end_date)
          if (details.startDate && dateKey < details.startDate) continue; // Before start date
          if (details.endDate && dateKey > details.endDate) continue; // After end date

          // Check if should appear on this day
          let shouldShow = false;
          if (details.recurrenceType === 'daily') {
            shouldShow = true;
          } else if (details.recurrenceType === 'weekly') {
            if (details.daysOfWeek.length === 0) {
              // Fallback: check frequency_json for times_per_week
              const frequency = commitment.frequency_json?.times_per_week || 0;
              shouldShow = frequency >= 7; // If 7x/week, show all days
            } else {
              shouldShow = details.daysOfWeek.includes(dayName);
            }
          }

          if (!shouldShow) continue;

          const completionKey = `${commitment.id}-${dateKey}`;
          const completion = completionMap.get(completionKey);

          // Skip if detached
          if (completion?.is_detached) continue;

          const instanceCount = details.recurrenceType === 'daily' ? details.timesPerDay : 1;
          
          for (let inst = 1; inst <= instanceCount; inst++) {
            tasksMap[dateKey].push({
              id: `${commitment.id}-${dateKey}-${inst}`,
              commitmentId: commitment.id,
              title: commitment.title,
              isCompleted: (completion?.is_completed ?? false) && (completion.instance_number === inst || instanceCount === 1),
              timeStart: completion?.time_start || details.start,
              timeEnd: completion?.time_end || details.end,
              taskType: "recurring",
              instanceNumber: inst,
              totalInstances: instanceCount,
              goalId: commitment.goal_id,
            });
          }
        }

        // Add independent/detached tasks
        const dateTasks = independentByDate.get(dateKey) || [];
        for (const task of dateTasks) {
          const taskInstance = taskInstanceMap.get(task.id);
          // Look up goal_id from the associated weekly_commitment
          const linkedCommitment = task.commitment_id 
            ? enrichedCommitments.find(c => c.id === task.commitment_id) 
            : null;
          tasksMap[dateKey].push({
            id: task.id,
            commitmentId: task.is_detached ? task.commitment_id : null,
            title: task.title || "Untitled Task",
            isCompleted: taskInstance?.is_completed ?? false,
            timeStart: task.time_start,
            timeEnd: task.time_end,
            taskType: "independent",
            isDetached: task.is_detached ?? false,
            goalId: linkedCommitment?.goal_id || null,
          });
        }
      }

      setTasksByDate(tasksMap);
      cacheKeyRef.current = currentCacheKey;

    } catch (err: any) {
      console.error("Error fetching weekly data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user, weekStart, weekStartStr, weekEndStr, currentCacheKey, goalsMap]);

  // Fetch when cache key changes
  useEffect(() => {
    if (currentCacheKey && cacheKeyRef.current !== currentCacheKey) {
      fetchData();
    }
  }, [currentCacheKey, fetchData]);

  // Initial fetch
  useEffect(() => {
    if (user && !cacheKeyRef.current) {
      fetchData();
    }
  }, [user, fetchData]);

  const refetch = useCallback(async () => {
    cacheKeyRef.current = ""; // Force refetch
    await fetchData();
  }, [fetchData]);

  return { commitments, tasksByDate, loading, error, refetch };
}
