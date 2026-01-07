/**
 * useScheduleData - Data hook for Schedule (agenda) view
 * Reuses weekly data fetching logic but exposes it in agenda-friendly format
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import type { TaskType } from "@/types/scheduling";

export interface ScheduleTask {
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
  goalId: string | null;
  goalTitle?: string | null;
  visionIsFocus?: boolean | null;
}

interface UseScheduleDataResult {
  tasksByDate: Record<string, ScheduleTask[]>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateTaskCompletion: (taskId: string, dateKey: string, isCompleted: boolean) => void;
}

const DAY_INDEX_TO_NAME: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"
};

// Simple cache for schedule data
const scheduleCache = new Map<string, { tasksByDate: Record<string, ScheduleTask[]>; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function useScheduleData(
  weekStart: Date,
  weekEnd: Date
): UseScheduleDataResult {
  const { user } = useAuth();
  const [tasksByDate, setTasksByDate] = useState<Record<string, ScheduleTask[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");
  const cacheKey = user ? `${user.id}:${weekStartStr}:schedule` : "";

  const fetchData = useCallback(async () => {
    if (!user) {
      setTasksByDate({});
      setLoading(false);
      return;
    }

    // Check cache
    const cached = scheduleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setTasksByDate(cached.tasksByDate);
      setLoading(false);
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const [
        commitmentsResult,
        completionsResult,
        taskInstancesResult,
        goalsResult,
      ] = await Promise.all([
        supabase
          .from("weekly_commitments")
          .select(`*, goals ( id, title, life_vision_id, life_visions ( id, is_focus ) )`)
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),

        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .gte("completed_date", weekStartStr)
          .lte("completed_date", weekEndStr)
          .or("is_deleted.is.null,is_deleted.eq.false"),

        supabase
          .from("daily_task_instances")
          .select("*")
          .eq("user_id", user.id),

        supabase
          .from("goals")
          .select("id, title")
          .eq("user_id", user.id),
      ]);

      if (commitmentsResult.error) throw commitmentsResult.error;

      const rawCommitments = commitmentsResult.data || [];
      const allCompletions = completionsResult.data || [];
      const taskInstances = taskInstancesResult.data || [];
      const goals = goalsResult.data || [];

      // Build lookup maps
      const goalMap = new Map(goals.map(g => [g.id, g.title]));
      const taskInstanceMap = new Map(taskInstances.map(ti => [ti.completion_id, ti]));

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

      // Build commitment details lookup
      const commitmentDetailsMap = new Map(
        rawCommitments.map((c: any) => [c.id, {
          title: c.title,
          start: c.default_time_start,
          end: c.default_time_end,
          recurrenceType: c.recurrence_type || 'weekly',
          timesPerDay: c.times_per_day || 1,
          daysOfWeek: c.repeat_days_of_week || [],
          startDate: c.start_date,
          endDate: c.end_date,
          goalId: c.goal_id,
          goalTitle: c.goals?.title || null,
          visionIsFocus: c.goals?.life_visions?.is_focus ?? null,
          frequencyJson: c.frequency_json as { times_per_week: number },
        }])
      );

      // Build tasks for each day
      const tasksMap: Record<string, ScheduleTask[]> = {};

      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const dateKey = format(date, "yyyy-MM-dd");
        const dayOfWeek = date.getDay();
        const dayName = DAY_INDEX_TO_NAME[dayOfWeek];
        tasksMap[dateKey] = [];

        // Add recurring tasks
        for (const commitment of rawCommitments) {
          const details = commitmentDetailsMap.get(commitment.id);
          if (!details) continue;

          // Check date bounds
          if (details.startDate && dateKey < details.startDate) continue;
          if (details.endDate && dateKey > details.endDate) continue;

          // Check if should appear on this day
          let shouldShow = false;
          if (details.recurrenceType === 'daily') {
            shouldShow = true;
          } else if (details.recurrenceType === 'weekly') {
            if (details.daysOfWeek.length === 0) {
              const frequency = details.frequencyJson?.times_per_week || 0;
              shouldShow = frequency >= 7;
            } else {
              shouldShow = details.daysOfWeek.includes(dayName);
            }
          }

          if (!shouldShow) continue;

          const completionKey = `${commitment.id}-${dateKey}`;
          const completion = completionMap.get(completionKey);

          if (completion?.is_detached) continue;

          const instanceCount = details.recurrenceType === 'daily' ? details.timesPerDay : 1;

          for (let inst = 1; inst <= instanceCount; inst++) {
            tasksMap[dateKey].push({
              id: `${commitment.id}-${dateKey}-${inst}`,
              commitmentId: commitment.id,
              title: details.title,
              isCompleted: (completion?.is_completed ?? false) && (completion.instance_number === inst || instanceCount === 1),
              timeStart: completion?.time_start || details.start,
              timeEnd: completion?.time_end || details.end,
              taskType: "recurring",
              instanceNumber: inst,
              totalInstances: instanceCount,
              goalId: details.goalId,
              goalTitle: details.goalTitle,
              visionIsFocus: details.visionIsFocus,
            });
          }
        }

        // Add independent/detached tasks
        const dateTasks = independentByDate.get(dateKey) || [];
        for (const task of dateTasks) {
          const taskInstance = taskInstanceMap.get(task.id);
          const linkedCommitment = task.commitment_id
            ? commitmentDetailsMap.get(task.commitment_id)
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
            goalId: linkedCommitment?.goalId || null,
            goalTitle: linkedCommitment?.goalTitle || null,
            visionIsFocus: linkedCommitment?.visionIsFocus ?? null,
          });
        }
      }

      setTasksByDate(tasksMap);

      // Cache result
      scheduleCache.set(cacheKey, {
        tasksByDate: tasksMap,
        timestamp: Date.now(),
      });

    } catch (err: any) {
      console.error("Error fetching schedule data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user, weekStart, weekStartStr, weekEndStr, cacheKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    scheduleCache.delete(cacheKey);
    await fetchData();
  }, [fetchData, cacheKey]);

  const updateTaskCompletion = useCallback((taskId: string, dateKey: string, isCompleted: boolean) => {
    setTasksByDate(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(t =>
        t.id === taskId ? { ...t, isCompleted } : t
      ),
    }));
  }, []);

  return { tasksByDate, loading, error, refetch, updateTaskCompletion };
}
