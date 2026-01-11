/**
 * useDailyData - Centralized data fetching for Daily page
 * Fetches data for a single day only
 * Uses multi-day cache to reduce lag when navigating between days
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, addDays, subDays } from "date-fns";
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

// Module-level cache for multi-day data persistence across re-renders
interface CachedDayData {
  tasks: DailyTask[];
  timestamp: number;
}

const dayCache = new Map<string, CachedDayData>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 14; // Keep 2 weeks of data max

function getCacheKey(userId: string, dateKey: string): string {
  return `${userId}:${dateKey}`;
}

function getValidCache(key: string): DailyTask[] | null {
  const cached = dayCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tasks;
  }
  return null;
}

function setCache(key: string, tasks: DailyTask[]) {
  // Prune old entries if cache is too large
  if (dayCache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(dayCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    // Remove oldest half
    for (let i = 0; i < MAX_CACHE_SIZE / 2; i++) {
      dayCache.delete(entries[i][0]);
    }
  }
  dayCache.set(key, { tasks, timestamp: Date.now() });
}

function invalidateCacheForUser(userId: string) {
  for (const key of dayCache.keys()) {
    if (key.startsWith(userId)) {
      dayCache.delete(key);
    }
  }
}

export function useDailyData(
  selectedDate: Date,
  weekStartsOn: 0 | 1 = 1
): UseDailyDataResult {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const isFetchingRef = useRef(false);
  const lastFetchedDateRef = useRef<string>("");

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const cacheKey = user ? getCacheKey(user.id, dateKey) : "";

  // Build tasks for a specific date from raw data
  const buildTasksForDate = useCallback((
    rawCommitments: any[],
    allCompletions: any[],
    taskInstances: any[],
    targetDate: Date,
    targetDateKey: string
  ): DailyTask[] => {
    const taskInstanceMap = new Map(
      taskInstances.map(ti => [ti.completion_id, ti])
    );
    
    // Filter completions for this specific date
    const dateCompletions = allCompletions.filter(c => c.completed_date === targetDateKey);
    const completionByCommitmentId = new Map(
      dateCompletions.filter(c => c.commitment_id).map(c => [c.commitment_id, c])
    );

    const dailyTasks: DailyTask[] = [];
    const dayOfWeek = targetDate.getDay();
    const dayName = DAY_INDEX_TO_NAME[dayOfWeek];

    for (const commitment of rawCommitments) {
      const recurrenceType = commitment.recurrence_type || 'weekly';
      const daysOfWeek = commitment.repeat_days_of_week || [];
      
      const startDate = commitment.start_date;
      const endDate = commitment.end_date;
      
      if (startDate && targetDateKey < startDate) continue;
      if (endDate && targetDateKey > endDate) continue;
      
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
      // Skip if this occurrence was deleted or moved (detached)
      if (completion?.is_deleted || completion?.is_detached) continue;

      const goal = commitment.goals ?? null;
      const goalTitle = goal?.title ?? null;
      const vision = goal?.life_visions ?? null;
      const visionTitle = vision?.title ?? null;
      const visionIsFocus = vision?.is_focus ?? null;
      
      const timeStart = completion?.time_start || commitment.default_time_start;
      const timeEnd = completion?.time_end || commitment.default_time_end;
      const timesPerDay = commitment.times_per_day || 1;

      dailyTasks.push({
        id: `${commitment.id}-${targetDateKey}`,
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
        recurrenceType,
        timesPerDay,
        daysOfWeek,
      });
    }

    // Add independent/detached tasks for this date (exclude deleted markers)
    const independentTasks = dateCompletions.filter(
      c => !c.is_deleted && (c.task_type === "independent" || c.is_detached)
    );
    
    for (const task of independentTasks) {
      const taskInstance = taskInstanceMap.get(task.id);
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
        // Use commitment_completions.is_completed as primary source, fallback to daily_task_instances
        isCompleted: task.is_completed ?? taskInstance?.is_completed ?? false,
        taskType: "independent",
        goalId: detachedGoalId,
        goalTitle: detachedGoal?.title ?? null,
        visionTitle: detachedVision?.title ?? null,
        visionIsFocus: detachedVision?.is_focus ?? null,
        isDetached: task.is_detached ?? false,
      });
    }

    return dailyTasks;
  }, []);

  const fetchData = useCallback(async (prefetchOnly = false) => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    // Check cache first - show cached data immediately
    const cachedTasks = getValidCache(cacheKey);
    if (cachedTasks && !prefetchOnly) {
      setTasks(cachedTasks);
      setLoading(false);
      
      // Still fetch in background to refresh, but don't block UI
      if (lastFetchedDateRef.current === dateKey) {
        return; // Already fetched this date recently
      }
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    if (!cachedTasks && !prefetchOnly) {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch data for current week (enables fast navigation within week)
      const weekStart = startOfWeek(selectedDate, { weekStartsOn });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      const [
        commitmentsResult,
        completionsResult,
        taskInstancesResult,
      ] = await Promise.all([
        supabase
          .from("weekly_commitments")
          .select(`*, goals ( id, title, life_vision_id, life_visions ( id, title, is_focus ) )`)
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // Fetch completions for entire week for caching (include deleted markers for exclusion logic)
        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .gte("completed_date", weekStartStr)
          .lte("completed_date", weekEndStr),
        
        supabase
          .from("daily_task_instances")
          .select("*")
          .eq("user_id", user.id),
      ]);

      if (commitmentsResult.error) throw commitmentsResult.error;

      const rawCommitments = commitmentsResult.data || [];
      const allCompletions = completionsResult.data || [];
      const taskInstances = taskInstancesResult.data || [];

      // Build and cache tasks for all days in the week
      for (let i = 0; i < 7; i++) {
        const dayDate = addDays(weekStart, i);
        const dayDateKey = format(dayDate, "yyyy-MM-dd");
        const dayCacheKey = getCacheKey(user.id, dayDateKey);
        
        const dayTasks = buildTasksForDate(
          rawCommitments,
          allCompletions,
          taskInstances,
          dayDate,
          dayDateKey
        );
        
        setCache(dayCacheKey, dayTasks);
        
        // Update current day immediately
        if (dayDateKey === dateKey && !prefetchOnly) {
          setTasks(dayTasks);
        }
      }

      lastFetchedDateRef.current = dateKey;

    } catch (err: any) {
      console.error("Error fetching daily data:", err);
      if (!prefetchOnly) {
        setError(err.message || "Failed to load data");
      }
    } finally {
      if (!prefetchOnly) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [user, selectedDate, dateKey, cacheKey, weekStartsOn, buildTasksForDate]);

  // When date changes, check cache first
  useEffect(() => {
    if (!user) return;
    
    const cachedTasks = getValidCache(cacheKey);
    if (cachedTasks) {
      // Instant update from cache
      setTasks(cachedTasks);
      setLoading(false);
    } else {
      // Need to fetch
      fetchData();
    }
  }, [cacheKey, user, fetchData]);

  // Initial fetch
  useEffect(() => {
    if (user && tasks.length === 0) {
      fetchData();
    }
  }, [user, fetchData, tasks.length]);

  const refetch = useCallback(async () => {
    if (user) {
      invalidateCacheForUser(user.id);
    }
    lastFetchedDateRef.current = "";
    await fetchData();
  }, [fetchData, user]);

  // Optimistic update helper - also update cache
  const updateTaskCompletion = useCallback((taskId: string, isCompleted: boolean) => {
    setTasks(prev => {
      const updated = prev.map(t => 
        t.id === taskId ? { ...t, isCompleted } : t
      );
      // Update cache too
      if (cacheKey) {
        setCache(cacheKey, updated);
      }
      return updated;
    });
  }, [cacheKey]);

  return { tasks, loading, error, refetch, updateTaskCompletion };
}
