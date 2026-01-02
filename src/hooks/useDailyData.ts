/**
 * useDailyData - Centralized data fetching for Daily page
 * Fetches data for a single day only
 * Uses stable cache keys to prevent refetching
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import type { TaskType } from "@/types/scheduling";

export interface DailyTask {
  id: string;
  commitmentId: string | null;
  title: string;
  timeStart: string | null;
  timeEnd: string | null;
  isCompleted: boolean;
  taskType: TaskType;
  instanceNumber?: number;
  totalInstances?: number;
  isDetached?: boolean;
  /** Goal ID linked to this task (via weekly_commitment) */
  goalId: string | null;
  /** Goal title for hierarchy display */
  goalTitle: string | null;
  /** Vision title for hierarchy display */
  visionTitle: string | null;
  /** Vision is_focus for star display */
  visionIsFocus: boolean | null;
  // For TaskDetailModal - avoid extra fetch
  recurrenceType?: string;
  timesPerDay?: number;
  daysOfWeek?: string[];
}

interface UseDailyDataResult {
  tasks: DailyTask[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateTaskCompletion: (taskId: string, isCompleted: boolean) => void;
}

const DAY_INDEX_TO_NAME: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"
};

export function useDailyData(
  selectedDate: Date,
  weekStartsOn: 0 | 1 = 1
): UseDailyDataResult {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cache key to prevent duplicate fetches
  const cacheKeyRef = useRef<string>("");
  const isFetchingRef = useRef(false);

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const currentCacheKey = user ? `${user.id}:${dateKey}` : "";

  const fetchData = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    // Skip if already fetching or same cache key
    if (isFetchingRef.current) return;
    if (cacheKeyRef.current === currentCacheKey && tasks.length > 0) {
      setLoading(false);
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      // SINGLE BATCH: Fetch only what's needed for this day
      const [
        commitmentsResult,
        completionsResult,
        taskInstancesResult,
      ] = await Promise.all([
        // Active weekly commitments (embedded goal + vision data)
        supabase
          .from("weekly_commitments")
          .select(`*, goals ( id, title, life_vision_id, life_visions ( id, title, is_focus ) )`)
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // Completions for this specific day only
        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .eq("completed_date", dateKey)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // Task instances (for independent task completion status)
        supabase
          .from("daily_task_instances")
          .select("*")
          .eq("user_id", user.id),
      ]);

      if (commitmentsResult.error) throw commitmentsResult.error;

      const rawCommitments = commitmentsResult.data || [];
      const allCompletions = completionsResult.data || [];
      const taskInstances = taskInstancesResult.data || [];

      // Build lookup maps
      const taskInstanceMap = new Map(
        taskInstances.map(ti => [ti.completion_id, ti])
      );
      const completionByCommitmentId = new Map(
        allCompletions.filter(c => c.commitment_id).map(c => [c.commitment_id, c])
      );

      // Build daily tasks
      const dailyTasks: DailyTask[] = [];
      const dayOfWeek = selectedDate.getDay();
      const dayName = DAY_INDEX_TO_NAME[dayOfWeek];

      for (const commitment of rawCommitments) {
        const recurrenceType = commitment.recurrence_type || 'weekly';
        const daysOfWeek = commitment.repeat_days_of_week || [];
        
        // Check date bounds (start_date and end_date)
        const startDate = commitment.start_date;
        const endDate = commitment.end_date;
        
        if (startDate && dateKey < startDate) continue; // Before start date
        if (endDate && dateKey > endDate) continue; // After end date
        
        // Check if should appear on this day
        let shouldShow = false;
        if (recurrenceType === 'daily') {
          shouldShow = true;
        } else if (recurrenceType === 'weekly') {
          if (daysOfWeek.length === 0) {
            shouldShow = dayOfWeek >= 1 && dayOfWeek <= 5;
          } else {
            shouldShow = daysOfWeek.includes(dayName);
          }
        }

        if (!shouldShow) continue;

        const completion = completionByCommitmentId.get(commitment.id);

        // Skip if detached
        if (completion?.is_detached) continue;

        const goal = commitment.goals ?? null;
        const goalTitle = goal?.title ?? null;
        const vision = goal?.life_visions ?? null;
        const visionTitle = vision?.title ?? null;
        const visionIsFocus = vision?.is_focus ?? null;
        
        const timeStart = completion?.time_start || commitment.default_time_start;
        const timeEnd = completion?.time_end || commitment.default_time_end;
        const timesPerDay = commitment.times_per_day || 1;

        dailyTasks.push({
          id: `${commitment.id}-${dateKey}`,
          commitmentId: commitment.id,
          title: commitment.title,
          timeStart,
          timeEnd,
          isCompleted: completion?.is_completed ?? false,
          taskType: "recurring",
          instanceNumber: completion?.instance_number || 1,
          totalInstances: timesPerDay,
          goalId: commitment.goal_id,
          goalTitle,
          visionTitle,
          visionIsFocus,
          // Include for TaskDetailModal
          recurrenceType,
          timesPerDay,
          daysOfWeek,
        });
      }

      // Add independent/detached tasks
      const independentTasks = allCompletions.filter(
        c => c.task_type === "independent" || c.is_detached
      );
      
      for (const task of independentTasks) {
        const taskInstance = taskInstanceMap.get(task.id);
        // For detached tasks, lookup the original commitment
        const originalCommitment = task.is_detached && task.commitment_id
          ? rawCommitments.find((c: any) => c.id === task.commitment_id)
          : null;

        const detachedGoal = originalCommitment?.goals ?? null;
        const detachedVision = detachedGoal?.life_visions ?? null;
        const detachedGoalId = originalCommitment?.goal_id || null;

        dailyTasks.push({
          id: task.id,
          commitmentId: task.is_detached ? task.commitment_id : null,
          title: task.title || "Untitled Task",
          timeStart: task.time_start,
          timeEnd: task.time_end,
          isCompleted: taskInstance?.is_completed ?? false,
          taskType: "independent",
          goalId: detachedGoalId,
          goalTitle: detachedGoal?.title ?? null,
          visionTitle: detachedVision?.title ?? null,
          visionIsFocus: detachedVision?.is_focus ?? null,
          isDetached: task.is_detached ?? false,
        });
      }

      setTasks(dailyTasks);
      cacheKeyRef.current = currentCacheKey;

    } catch (err: any) {
      console.error("Error fetching daily data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user, selectedDate, dateKey, currentCacheKey, weekStartsOn]);

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

  // Optimistic update helper
  const updateTaskCompletion = useCallback((taskId: string, isCompleted: boolean) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, isCompleted } : t
    ));
  }, []);

  return { tasks, loading, error, refetch, updateTaskCompletion };
}
