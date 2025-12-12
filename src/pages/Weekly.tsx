import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences, getWeekStartsOn } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import { formatWeekRange } from "@/lib/formatPreferences";
import FocusFilter from "@/components/FocusFilter";
import AddIconButton from "@/components/AddIconButton";
import NotionWeekCalendar from "@/components/weekly/NotionWeekCalendar";
import WeeklyTotals from "@/components/weekly/WeeklyTotals";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import type { TaskType } from "@/types/scheduling";

/**
 * Weekly Page - Notion-style weekly view with calendar grid
 * Tasks appear inside each day cell (both recurring and independent)
 * 
 * OPTIMIZATION: All data is fetched in a single batch, then processed in-memory
 */

interface DayTask {
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
}

interface CommitmentData {
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
}

interface GoalOption {
  id: string;
  title: string;
}

const Weekly = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { preferences } = useUserPreferences();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);
  
  const [commitments, setCommitments] = useState<CommitmentData[]>([]);
  const [tasksByDate, setTasksByDate] = useState<Record<string, DayTask[]>>({});
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn })
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);
  const [goals, setGoals] = useState<GoalOption[]>([]);

  // Task create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Task detail modal state
  const [selectedTask, setSelectedTask] = useState<DayTask | null>(null);
  const [selectedTaskDate, setSelectedTaskDate] = useState<Date>(new Date());
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Recalculate week start when preferences change
  useEffect(() => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn }));
  }, [weekStartsOn]);

  const getWeekStart = useCallback((date: Date): Date => {
    return startOfWeek(date, { weekStartsOn });
  }, [weekStartsOn]);

  const getWeekEnd = useCallback((date: Date): Date => {
    return endOfWeek(date, { weekStartsOn });
  }, [weekStartsOn]);

  const weekRange = formatWeekRange(currentWeekStart, getWeekEnd(currentWeekStart), preferences.dateFormat);
  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") === format(getWeekStart(new Date()), "yyyy-MM-dd");

  // Day name mapping for checking which days to show
  const dayIndexToName: Record<number, string> = useMemo(() => ({
    0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"
  }), []);

  /**
   * OPTIMIZED: Single batch fetch for all weekly data
   * - Fetches all data in parallel
   * - Processes everything in memory
   * - No N+1 queries
   */
  const fetchWeeklyData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const weekStart = currentWeekStart;
      const weekEnd = getWeekEnd(weekStart);
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      // Generate all date keys for the week
      const dateKeys: string[] = [];
      for (let i = 0; i < 7; i++) {
        dateKeys.push(format(addDays(weekStart, i), "yyyy-MM-dd"));
      }

      // BATCH FETCH: All data in parallel (single request each)
      const [
        commitmentsResult,
        checkinsResult,
        completionsResult,
        independentTasksResult,
        taskInstancesResult,
        goalsResult
      ] = await Promise.all([
        // 1. All active weekly commitments
        supabase
          .from("weekly_commitments")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // 2. Weekly checkins for this week
        supabase
          .from("weekly_checkins")
          .select("*")
          .eq("user_id", user.id)
          .eq("period_start_date", weekStartStr),
        
        // 3. All completions for this week's dates
        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .gte("completed_date", weekStartStr)
          .lte("completed_date", weekEndStr)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // 4. Independent tasks for this week
        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .gte("completed_date", weekStartStr)
          .lte("completed_date", weekEndStr)
          .or("task_type.eq.independent,is_detached.eq.true")
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // 5. All daily task instances for independent tasks
        supabase
          .from("daily_task_instances")
          .select("*")
          .eq("user_id", user.id),
        
        // 6. All goals (for focus status and dropdown)
        supabase
          .from("goals")
          .select("id, title, is_focus")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false")
      ]);

      if (commitmentsResult.error) throw commitmentsResult.error;

      const rawCommitments = commitmentsResult.data || [];
      const existingCheckins = checkinsResult.data || [];
      const allCompletions = completionsResult.data || [];
      const independentTasks = independentTasksResult.data || [];
      const taskInstances = taskInstancesResult.data || [];
      const allGoals = goalsResult.data || [];

      // Build lookup maps for O(1) access
      const checkinByCommitmentId = new Map(
        existingCheckins.map(c => [c.weekly_commitment_id, c])
      );
      const goalFocusMap = new Map(
        allGoals.map(g => [g.id, g.is_focus])
      );
      const taskInstanceMap = new Map(
        taskInstances.map(ti => [ti.completion_id, ti])
      );

      // Build completions map: commitmentId-date -> completion
      const completionMap = new Map<string, any>();
      for (const completion of allCompletions) {
        if (completion.commitment_id) {
          const key = `${completion.commitment_id}-${completion.completed_date}`;
          completionMap.set(key, completion);
        }
      }

      // Create missing checkins in batch
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

      // Batch insert new checkins if any
      if (checkinsToCreate.length > 0) {
        const { data: newCheckins } = await supabase
          .from("weekly_checkins")
          .insert(checkinsToCreate)
          .select();
        
        // Add to lookup map
        for (const checkin of newCheckins || []) {
          checkinByCommitmentId.set(checkin.weekly_commitment_id, checkin);
        }
      }

      // Build enriched commitments (in memory, no queries)
      const enrichedCommitments: CommitmentData[] = rawCommitments.map(commitment => {
        const frequency = commitment.frequency_json as { times_per_week: number };
        const checkin = checkinByCommitmentId.get(commitment.id);
        const goalIsFocus = commitment.goal_id ? goalFocusMap.get(commitment.goal_id) ?? null : null;

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
        };
      });

      setCommitments(enrichedCommitments);

      // Build commitment details map (in memory)
      const commitmentDetailsMap: Record<string, { 
        start: string | null; 
        end: string | null; 
        recurrenceType: string;
        timesPerDay: number;
        daysOfWeek: string[];
      }> = {};
      
      for (const c of rawCommitments) {
        commitmentDetailsMap[c.id] = {
          start: c.default_time_start,
          end: c.default_time_end,
          recurrenceType: c.recurrence_type || 'weekly',
          timesPerDay: c.times_per_day || 1,
          daysOfWeek: c.repeat_days_of_week || [],
        };
      }

      // Build tasks for each day (all in memory)
      const tasksMap: Record<string, DayTask[]> = {};
      
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const dateKey = format(date, "yyyy-MM-dd");
        const dayOfWeek = date.getDay();
        const dayName = dayIndexToName[dayOfWeek];
        tasksMap[dateKey] = [];

        // Add recurring tasks based on recurrence rules
        for (const commitment of enrichedCommitments) {
          const details = commitmentDetailsMap[commitment.id] || { 
            start: null, end: null, recurrenceType: 'weekly', timesPerDay: 1, daysOfWeek: [] 
          };

          // Check if task should appear on this day
          let shouldShow = false;
          if (details.recurrenceType === 'daily') {
            shouldShow = true;
          } else if (details.recurrenceType === 'weekly') {
            if (details.daysOfWeek.length === 0) {
              shouldShow = dayOfWeek >= 1 && dayOfWeek <= 5;
            } else {
              shouldShow = details.daysOfWeek.includes(dayName);
            }
          }

          if (!shouldShow) continue;

          const completionKey = `${commitment.id}-${dateKey}`;
          const completion = completionMap.get(completionKey);

          // Skip if this instance is detached
          if (completion?.is_detached) {
            continue;
          }

          const instanceCount = details.recurrenceType === 'daily' ? details.timesPerDay : 1;
          
          for (let inst = 1; inst <= instanceCount; inst++) {
            tasksMap[dateKey].push({
              id: `${commitment.id}-${dateKey}-${inst}`,
              commitmentId: commitment.id,
              title: commitment.title,
              isCompleted: !!completion && (completion.instance_number === inst || instanceCount === 1),
              timeStart: completion?.time_start || details.start,
              timeEnd: completion?.time_end || details.end,
              taskType: "recurring",
              instanceNumber: inst,
              totalInstances: instanceCount,
            });
          }
        }

        // Add independent/detached tasks for this date (from pre-fetched data)
        const dateIndependentTasks = independentTasks.filter(t => t.completed_date === dateKey);
        
        for (const task of dateIndependentTasks) {
          const taskInstance = taskInstanceMap.get(task.id);

          tasksMap[dateKey].push({
            id: task.id,
            commitmentId: task.is_detached ? task.commitment_id : null,
            title: task.title || "Untitled Task",
            isCompleted: taskInstance?.is_completed ?? false,
            timeStart: task.time_start,
            timeEnd: task.time_end,
            taskType: "independent",
            isDetached: task.is_detached ?? false,
          });
        }
      }

      setTasksByDate(tasksMap);
      
      // Set goals for dropdown (ninety_day only)
      const ninety_day_goals = allGoals.filter((g: any) => 
        goalsResult.data?.find((goal: any) => goal.id === g.id)
      );
      setGoals(allGoals.map(g => ({ id: g.id, title: g.title })));

    } catch (error: any) {
      console.error("Error fetching weekly data:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [user, currentWeekStart, getWeekEnd, dayIndexToName]);

  // Single useEffect with stable dependencies
  useEffect(() => {
    if (user) {
      fetchWeeklyData();
    }
  }, [user, currentWeekStart, fetchWeeklyData]);

  const handleTaskClick = (task: DayTask, date: Date) => {
    setSelectedTask(task);
    setSelectedTaskDate(date);
    setTaskModalOpen(true);
  };

  const handleToggleComplete = async (task: DayTask, date: Date) => {
    if (!user) return;
    const dateKey = format(date, "yyyy-MM-dd");
    const newCompleted = !task.isCompleted;
    
    // Optimistic update - immediately update UI
    setTasksByDate(prev => {
      const updated = { ...prev };
      if (updated[dateKey]) {
        updated[dateKey] = updated[dateKey].map(t => 
          t.id === task.id ? { ...t, isCompleted: newCompleted } : t
        );
      }
      return updated;
    });
    
    try {
      if (task.taskType === "independent") {
        const { data: existingInstance } = await supabase
          .from("daily_task_instances")
          .select("id, is_completed")
          .eq("completion_id", task.id)
          .maybeSingle();

        if (existingInstance) {
          await supabase
            .from("daily_task_instances")
            .update({ is_completed: newCompleted })
            .eq("id", existingInstance.id);
        } else {
          await supabase
            .from("daily_task_instances")
            .insert({
              user_id: user.id,
              completion_id: task.id,
              is_completed: true,
            });
        }
      } else {
        if (task.isCompleted) {
          await supabase
            .from("commitment_completions")
            .delete()
            .eq("commitment_id", task.commitmentId)
            .eq("completed_date", dateKey);
        } else {
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: task.commitmentId,
              completed_date: dateKey,
              instance_number: task.instanceNumber || 1,
            });
        }
      }
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
      // Rollback optimistic update on error
      setTasksByDate(prev => {
        const updated = { ...prev };
        if (updated[dateKey]) {
          updated[dateKey] = updated[dateKey].map(t => 
            t.id === task.id ? { ...t, isCompleted: !newCompleted } : t
          );
        }
        return updated;
      });
    }
  };

  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(getWeekStart(new Date()));

  // Filter commitments based on focus toggle
  const filteredCommitments = showFocusedOnly
    ? commitments.filter(c => c.goal_is_focus === true)
    : commitments;

  // Filter tasks by date based on focused commitments
  const filteredTasksByDate: Record<string, DayTask[]> = {};
  const focusedCommitmentIds = new Set(filteredCommitments.map(c => c.id));
  
  Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
    filteredTasksByDate[dateKey] = tasks.filter(t => 
      t.taskType === "independent" || focusedCommitmentIds.has(t.commitmentId || "")
    );
  });

  const hasAnyTasks = Object.values(filteredTasksByDate).some(tasks => tasks.length > 0);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  // Calculate weekly progress
  const weeklyProgress = Object.values(filteredTasksByDate).reduce(
    (acc, tasks) => {
      const completed = tasks.filter(t => t.isCompleted).length;
      const total = tasks.length;
      return { completed: acc.completed + completed, total: acc.total + total };
    },
    { completed: 0, total: 0 }
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-medium text-foreground">Weekly</h1>
          {weeklyProgress.total > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              {weeklyProgress.completed}/{weeklyProgress.total} completed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <FocusFilter
            showFocusedOnly={showFocusedOnly}
            onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
          />
          <AddIconButton
            onClick={() => setCreateModalOpen(true)}
            tooltip="Add task"
          />
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
        <button 
          onClick={goToPreviousWeek}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <div className="text-center">
          <h2 className="text-base font-medium text-foreground uppercase tracking-wide">
            {weekRange.start} – {weekRange.end}
          </h2>
          {!isCurrentWeek && (
            <button
              onClick={goToCurrentWeek}
              className="text-xs text-primary hover:underline mt-1"
            >
              Go to current week
            </button>
          )}
        </div>
        <button 
          onClick={goToNextWeek}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!hasAnyTasks ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm mb-4">
            {showFocusedOnly
              ? "No focused tasks this week"
              : "No tasks scheduled this week"}
          </p>
          <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(true)}>
            Add a task
          </Button>
        </div>
      ) : (
        <>
          <NotionWeekCalendar
            weekStart={currentWeekStart}
            tasksByDate={filteredTasksByDate}
            selectedDate={selectedDate}
            onDateSelect={(date) => {
              setSelectedDate(date);
              navigate(`/daily?date=${format(date, "yyyy-MM-dd")}`);
            }}
            onTaskClick={handleTaskClick}
            onToggleComplete={handleToggleComplete}
            weekStartsOn={weekStartsOn}
            timeFormat={preferences.timeFormat}
            dateFormat={preferences.dateFormat}
          />

          <WeeklyTotals
            commitments={filteredCommitments.map(c => ({
              id: c.id,
              title: c.title,
              planned: c.checkin?.planned_count || 0,
              actual: c.checkin?.actual_count || 0,
            }))}
          />
        </>
      )}

      {/* Task Create Modal */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goals}
        onSuccess={() => fetchWeeklyData()}
        weekStart={currentWeekStart}
      />

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          open={taskModalOpen}
          onOpenChange={setTaskModalOpen}
          task={{
            id: selectedTask.id,
            commitmentId: selectedTask.commitmentId,
            title: selectedTask.title,
            timeStart: selectedTask.timeStart,
            timeEnd: selectedTask.timeEnd,
            isCompleted: selectedTask.isCompleted,
            taskType: selectedTask.taskType,
            instanceNumber: selectedTask.instanceNumber,
            isDetached: selectedTask.isDetached,
          }}
          date={selectedTaskDate}
          onUpdate={() => fetchWeeklyData()}
        />
      )}
    </div>
  );
};

export default Weekly;
