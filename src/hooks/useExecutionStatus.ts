/**
 * useExecutionStatus - Derives execution states for goals/plans
 * 
 * Primary States (derived automatically):
 * - Planned: Tasks exist, no recent completion
 * - Active: At least one task completed within execution window
 * - Dormant: Tasks exist, no completion within expected window
 * 
 * For 90d plans: Also provides consistency signals and last week stats
 * For 1yr goals: Provides aggregated signals from child 90d plans
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfWeek, endOfWeek, subWeeks, format, differenceInDays } from "date-fns";

export type ExecutionState = "planned" | "active" | "dormant" | "none";
export type VisionExecutionTier = 1 | 2 | 3;

export interface PlanExecutionData {
  goalId: string;
  state: ExecutionState;
  hasTasks: boolean;
  // 90d specific
  consistentWeeks: number;
  lastWeekCompleted: number;
  lastWeekExpected: number;
  // For ordering tie-breakers
  mostRecentCompletionDate: string | null;
}

export interface GoalExecutionData {
  goalId: string;
  state: ExecutionState;
  activePlansCount: number;
  totalPlansCount: number;
}

export interface VisionExecutionData {
  visionId: string;
  tier: VisionExecutionTier;
  activePlansCount: number;
  totalPlansWithTasks: number;
  mostRecentCompletionDate: string | null;
  mostRecentEditDate: string | null;
}

interface CommitmentWithGoal {
  id: string;
  goal_id: string | null;
  frequency_json: unknown;
  times_per_day: number | null;
  repeat_days_of_week: string[] | null;
  recurrence_type: string | null;
  task_type: string | null;
  created_at: string | null;
  start_date: string | null;
}

interface CompletionRecord {
  commitment_id: string | null;
  completed_date: string;
}

interface UseExecutionStatusResult {
  planExecutionMap: Map<string, PlanExecutionData>;
  goalExecutionMap: Map<string, GoalExecutionData>;
  visionExecutionMap: Map<string, VisionExecutionData>;
  loading: boolean;
}

// Execution window in days - tasks must be completed within this period to be "active"
const EXECUTION_WINDOW_DAYS = 14;
// Consistency threshold - percentage of expected tasks that must be completed
const CONSISTENCY_THRESHOLD = 0.6;
// Grace period for newly created tasks before they can become "dormant"
const DAILY_GRACE_PERIOD_DAYS = 3;
const WEEKLY_GRACE_PERIOD_DAYS = 7;
const ONE_TIME_GRACE_PERIOD_DAYS = 1;

export function useExecutionStatus(
  ninetyDayPlanIds: string[],
  oneYearGoalIds: string[],
  goalToChildPlansMap: Map<string, string[]>,
  visionToPlanIdsMap: Map<string, string[]> = new Map(),
  visionEditDates: Map<string, string> = new Map()
): UseExecutionStatusResult {
  const { user } = useAuth();
  const [commitments, setCommitments] = useState<CommitmentWithGoal[]>([]);
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Get date ranges
  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const lastWeekStart = useMemo(() => subWeeks(currentWeekStart, 1), [currentWeekStart]);
  const lastWeekEnd = useMemo(() => endOfWeek(lastWeekStart, { weekStartsOn: 1 }), [lastWeekStart]);
  const executionWindowStart = useMemo(
    () => new Date(today.getTime() - EXECUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    [today]
  );
  // For consistency tracking, look back 4 weeks
  const fourWeeksAgo = useMemo(() => subWeeks(currentWeekStart, 4), [currentWeekStart]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      if (!user || (ninetyDayPlanIds.length === 0 && oneYearGoalIds.length === 0)) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Get all goal IDs we care about (90d plans)
        const allGoalIds = [...ninetyDayPlanIds];
        
        // Fetch commitments for these goals
        const { data: commitmentsData } = await supabase
          .from("weekly_commitments")
          .select("id, goal_id, frequency_json, times_per_day, repeat_days_of_week, recurrence_type, task_type, created_at, start_date")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false")
          .in("goal_id", allGoalIds);

        // Fetch completions for the past 4 weeks
        const fourWeeksAgoStr = format(fourWeeksAgo, "yyyy-MM-dd");
        const todayStr = format(today, "yyyy-MM-dd");

        const commitmentIds = (commitmentsData || []).map(c => c.id);
        
        let completionsData: CompletionRecord[] = [];
        if (commitmentIds.length > 0) {
          const { data } = await supabase
            .from("commitment_completions")
            .select("commitment_id, completed_date")
            .eq("user_id", user.id)
            .gte("completed_date", fourWeeksAgoStr)
            .lte("completed_date", todayStr)
            .or("is_deleted.is.null,is_deleted.eq.false")
            .in("commitment_id", commitmentIds);
          
          completionsData = data || [];
        }

        setCommitments(commitmentsData || []);
        setCompletions(completionsData);
      } catch (err) {
        console.error("Error fetching execution status data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, ninetyDayPlanIds, oneYearGoalIds, fourWeeksAgo, today]);

  // Build commitment to goal mapping
  const commitmentToGoalMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of commitments) {
      if (c.goal_id) {
        map.set(c.id, c.goal_id);
      }
    }
    return map;
  }, [commitments]);

  // Build goal to commitments mapping
  const goalToCommitmentsMap = useMemo(() => {
    const map = new Map<string, CommitmentWithGoal[]>();
    for (const c of commitments) {
      if (c.goal_id) {
        const existing = map.get(c.goal_id) || [];
        existing.push(c);
        map.set(c.goal_id, existing);
      }
    }
    return map;
  }, [commitments]);

  // Calculate expected completions per week for a commitment
  const getExpectedPerWeek = useCallback((commitment: CommitmentWithGoal): number => {
    const timesPerDay = commitment.times_per_day || 1;
    const frequencyJson = commitment.frequency_json as { times_per_week?: number } | null;
    const daysPerWeek = commitment.repeat_days_of_week?.length || 
      frequencyJson?.times_per_week || 3;
    return timesPerDay * daysPerWeek;
  }, []);

  // Calculate grace period for a commitment based on recurrence type
  const getGracePeriodDays = useCallback((commitment: CommitmentWithGoal): number => {
    const recurrenceType = commitment.recurrence_type;
    const taskType = commitment.task_type;
    
    // One-time tasks (independent)
    if (taskType === 'independent' || recurrenceType === 'none') {
      return ONE_TIME_GRACE_PERIOD_DAYS;
    }
    
    // Daily recurrence
    if (recurrenceType === 'daily') {
      return DAILY_GRACE_PERIOD_DAYS;
    }
    
    // Weekly recurrence (default)
    return WEEKLY_GRACE_PERIOD_DAYS;
  }, []);

  // Check if a commitment is still within its grace period
  const isWithinGracePeriod = useCallback((commitment: CommitmentWithGoal, referenceDate: Date): boolean => {
    // Use start_date if available, otherwise fall back to created_at
    const effectiveStartDate = commitment.start_date || commitment.created_at;
    if (!effectiveStartDate) return false;
    
    const startDate = new Date(effectiveStartDate);
    const gracePeriodDays = getGracePeriodDays(commitment);
    const daysSinceStart = differenceInDays(referenceDate, startDate);
    
    // If the task hasn't started yet (daysSinceStart is negative), it's within grace period
    if (daysSinceStart < 0) return true;
    
    return daysSinceStart < gracePeriodDays;
  }, [getGracePeriodDays]);

  // Calculate 90d plan execution data
  const planExecutionMap = useMemo(() => {
    const map = new Map<string, PlanExecutionData>();

    for (const planId of ninetyDayPlanIds) {
      const planCommitments = goalToCommitmentsMap.get(planId) || [];
      const hasTasks = planCommitments.length > 0;

      if (!hasTasks) {
        map.set(planId, {
          goalId: planId,
          state: "none",
          hasTasks: false,
          consistentWeeks: 0,
          lastWeekCompleted: 0,
          lastWeekExpected: 0,
          mostRecentCompletionDate: null,
        });
        continue;
      }

      // Get all commitment IDs for this plan
      const commitmentIds = new Set(planCommitments.map(c => c.id));

      // Get completions for this plan
      const planCompletions = completions.filter(c => 
        c.commitment_id && commitmentIds.has(c.commitment_id)
      );

      // Check for recent activity (within execution window)
      const executionWindowStartStr = format(executionWindowStart, "yyyy-MM-dd");
      const recentCompletions = planCompletions.filter(c => 
        c.completed_date >= executionWindowStartStr
      );

      // Calculate last week stats
      const lastWeekStartStr = format(lastWeekStart, "yyyy-MM-dd");
      const lastWeekEndStr = format(lastWeekEnd, "yyyy-MM-dd");
      const lastWeekCompletions = planCompletions.filter(c =>
        c.completed_date >= lastWeekStartStr && c.completed_date <= lastWeekEndStr
      );

      // Calculate expected per week
      let expectedPerWeek = 0;
      for (const commitment of planCommitments) {
        expectedPerWeek += getExpectedPerWeek(commitment);
      }

      // Calculate consistent weeks (last 4 weeks, excluding current week)
      let consistentWeeks = 0;
      for (let i = 1; i <= 4; i++) {
        const weekStart = subWeeks(currentWeekStart, i);
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const weekStartStr = format(weekStart, "yyyy-MM-dd");
        const weekEndStr = format(weekEnd, "yyyy-MM-dd");

        const weekCompletions = planCompletions.filter(c =>
          c.completed_date >= weekStartStr && c.completed_date <= weekEndStr
        );

        const completionRate = expectedPerWeek > 0 
          ? weekCompletions.length / expectedPerWeek 
          : 0;

        if (completionRate >= CONSISTENCY_THRESHOLD) {
          consistentWeeks++;
        } else {
          // Break streak on first non-consistent week
          break;
        }
      }

      // Check if ALL commitments for this plan are still within their grace period
      const allWithinGracePeriod = planCommitments.every(c => isWithinGracePeriod(c, today));
      const anyCompletionsEver = planCompletions.length > 0;
      
      // Determine state
      let state: ExecutionState;
      if (recentCompletions.length > 0) {
        // Has recent activity - Active
        state = "active";
      } else if (!anyCompletionsEver && allWithinGracePeriod) {
        // No completions yet, but still within grace period - Planned
        state = "planned";
      } else {
        // Grace period passed OR had completions before but stopped - Dormant
        state = "dormant";
      }

      // Find most recent completion date for tie-breaking
      const mostRecentCompletionDate = planCompletions.length > 0
        ? planCompletions.reduce((latest, c) => 
            c.completed_date > latest ? c.completed_date : latest, 
            planCompletions[0].completed_date
          )
        : null;

      map.set(planId, {
        goalId: planId,
        state,
        hasTasks: true,
        consistentWeeks,
        lastWeekCompleted: lastWeekCompletions.length,
        lastWeekExpected: expectedPerWeek,
        mostRecentCompletionDate,
      });
    }

    return map;
  }, [
    ninetyDayPlanIds,
    goalToCommitmentsMap,
    completions,
    executionWindowStart,
    lastWeekStart,
    lastWeekEnd,
    currentWeekStart,
    getExpectedPerWeek,
    isWithinGracePeriod,
    today,
  ]);

  // Calculate 1yr goal execution data (aggregated from child 90d plans)
  const goalExecutionMap = useMemo(() => {
    const map = new Map<string, GoalExecutionData>();

    for (const goalId of oneYearGoalIds) {
      const childPlanIds = goalToChildPlansMap.get(goalId) || [];
      const totalPlansCount = childPlanIds.length;

      if (totalPlansCount === 0) {
        // Check if goal has direct tasks
        const directCommitments = goalToCommitmentsMap.get(goalId) || [];
        if (directCommitments.length === 0) {
          map.set(goalId, {
            goalId,
            state: "none",
            activePlansCount: 0,
            totalPlansCount: 0,
          });
        } else {
          // Has direct tasks but no child plans - treat like a 90d plan
          const commitmentIds = new Set(directCommitments.map(c => c.id));
          const executionWindowStartStr = format(executionWindowStart, "yyyy-MM-dd");
          const recentCompletions = completions.filter(c => 
            c.commitment_id && 
            commitmentIds.has(c.commitment_id) &&
            c.completed_date >= executionWindowStartStr
          );
          
          // Check grace period for direct commitments
          const allDirectCompletions = completions.filter(c =>
            c.commitment_id && commitmentIds.has(c.commitment_id)
          );
          const allWithinGracePeriod = directCommitments.every(c => isWithinGracePeriod(c, today));
          const anyCompletionsEver = allDirectCompletions.length > 0;
          
          let directState: ExecutionState;
          if (recentCompletions.length > 0) {
            directState = "active";
          } else if (!anyCompletionsEver && allWithinGracePeriod) {
            directState = "planned";
          } else {
            directState = "dormant";
          }

          map.set(goalId, {
            goalId,
            state: directState,
            activePlansCount: 0,
            totalPlansCount: 0,
          });
        }
        continue;
      }

      // Count active and planned plans
      let activePlansCount = 0;
      let plannedPlansCount = 0;
      let hasAnyTasks = false;

      for (const planId of childPlanIds) {
        const planData = planExecutionMap.get(planId);
        if (planData) {
          if (planData.hasTasks) hasAnyTasks = true;
          if (planData.state === "active") activePlansCount++;
          if (planData.state === "planned") plannedPlansCount++;
        }
      }

      // Determine state based on child plans
      let state: ExecutionState;
      if (!hasAnyTasks) {
        state = "planned";
      } else if (activePlansCount > 0) {
        state = "active";
      } else if (plannedPlansCount > 0) {
        // If all plans with tasks are still within grace period, goal is "planned"
        state = "planned";
      } else {
        state = "dormant";
      }

      map.set(goalId, {
        goalId,
        state,
        activePlansCount,
        totalPlansCount,
      });
    }

    return map;
  }, [
    oneYearGoalIds,
    goalToChildPlansMap,
    goalToCommitmentsMap,
    planExecutionMap,
    completions,
    executionWindowStart,
    isWithinGracePeriod,
    today,
  ]);

  // Calculate vision execution data for ordering
  const visionExecutionMap = useMemo(() => {
    const map = new Map<string, VisionExecutionData>();

    for (const [visionId, planIds] of visionToPlanIdsMap) {
      let activePlansCount = 0;
      let totalPlansWithTasks = 0;
      let hasAnyPlans = false;
      let hasAnyTasks = false;
      let mostRecentCompletionDate: string | null = null;

      for (const planId of planIds) {
        hasAnyPlans = true;
        const planData = planExecutionMap.get(planId);
        if (planData) {
          if (planData.hasTasks) {
            hasAnyTasks = true;
            totalPlansWithTasks++;
          }
          if (planData.state === "active") activePlansCount++;
          
          // Track most recent completion across all plans
          if (planData.mostRecentCompletionDate) {
            if (!mostRecentCompletionDate || planData.mostRecentCompletionDate > mostRecentCompletionDate) {
              mostRecentCompletionDate = planData.mostRecentCompletionDate;
            }
          }
        }
      }

      // Determine tier
      let tier: VisionExecutionTier;
      if (activePlansCount > 0) {
        // Tier 1: Actively executing
        tier = 1;
      } else if (hasAnyPlans && hasAnyTasks) {
        // Tier 2: Planned but not executing (has plans with tasks, but none active)
        tier = 2;
      } else {
        // Tier 3: Aspirational (no plans or no tasks scheduled)
        tier = 3;
      }

      map.set(visionId, {
        visionId,
        tier,
        activePlansCount,
        totalPlansWithTasks,
        mostRecentCompletionDate,
        mostRecentEditDate: visionEditDates.get(visionId) || null,
      });
    }

    return map;
  }, [visionToPlanIdsMap, planExecutionMap, visionEditDates]);

  return {
    planExecutionMap,
    goalExecutionMap,
    visionExecutionMap,
    loading,
  };
}
