import { useState, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ChevronLeft, X, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, getWeekStartsOn } from "@/hooks/useAppData";
import { useWeeklyData, DayTask, CommitmentData } from "@/hooks/useWeeklyData";
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

/**
 * Weekly Page - Notion-style weekly view with calendar grid
 * OPTIMIZED: Uses useWeeklyData hook for single-batch fetching
 * Consumes preferences/goals from global AppDataProvider
 * 
 * Supports 90-Day Plan context via ?plan=<id> query parameter
 * When active, shows contextual header and filters tasks to that plan
 */

// Memoized WeeklyTotals to prevent unnecessary re-renders
const MemoizedWeeklyTotals = memo(WeeklyTotals);

// Memoized Calendar
const MemoizedCalendar = memo(NotionWeekCalendar);

const Weekly = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { preferences, goals, visionsMap } = useAppData();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);
  
  // Get active 90-day plan from URL
  const activePlanId = searchParams.get("plan");
  const activePlan = useMemo(() => 
    activePlanId ? goals.find(g => g.id === activePlanId && g.goal_type === "ninety_day") : null,
    [activePlanId, goals]
  );
  const activePlanVision = useMemo(() => 
    activePlan?.life_vision_id ? visionsMap.get(activePlan.life_vision_id) : null,
    [activePlan, visionsMap]
  );

  // State for "other tasks" section when plan is active
  const [otherTasksExpanded, setOtherTasksExpanded] = useState(false);
  
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn })
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);

  // Task create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Task detail modal state
  const [selectedTask, setSelectedTask] = useState<DayTask | null>(null);
  const [selectedTaskDate, setSelectedTaskDate] = useState<Date>(new Date());
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Calculate week end
  const currentWeekEnd = useMemo(() => 
    endOfWeek(currentWeekStart, { weekStartsOn }), 
    [currentWeekStart, weekStartsOn]
  );

  // Use centralized data hook
  const { commitments, tasksByDate, loading, refetch } = useWeeklyData(
    currentWeekStart,
    currentWeekEnd
  );

  const weekRangeObj = formatWeekRange(currentWeekStart, currentWeekEnd, preferences.dateFormat);
  const weekRange = `${weekRangeObj.start} – ${weekRangeObj.end}`;
  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") ===
    format(startOfWeek(new Date(), { weekStartsOn }), "yyyy-MM-dd");

  // Clear active plan context
  const clearPlanContext = useCallback(() => {
    setSearchParams({});
    setOtherTasksExpanded(false);
  }, [setSearchParams]);

  // Stable handlers with useCallback
  const handleTaskClick = useCallback((task: DayTask, date: Date) => {
    setSelectedTask(task);
    setSelectedTaskDate(date);
    setTaskModalOpen(true);
  }, []);

  const handleToggleComplete = useCallback(async (task: DayTask, date: Date) => {
    if (!user) return;
    const dateKey = format(date, "yyyy-MM-dd");
    const newCompleted = !task.isCompleted;
    
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
      // Refetch to update state
      refetch();
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
    }
  }, [user, refetch]);

  const goToPreviousWeek = useCallback(() => 
    setCurrentWeekStart(prev => subWeeks(prev, 1)), []);
  const goToNextWeek = useCallback(() => 
    setCurrentWeekStart(prev => addWeeks(prev, 1)), []);
  const goToCurrentWeek = useCallback(() => 
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn })), [weekStartsOn]);

  // Filter commitments based on focus toggle AND active plan - memoized
  const filteredCommitments = useMemo(() => {
    let filtered = commitments;
    
    // Filter by active plan if set
    if (activePlanId) {
      filtered = filtered.filter(c => c.goal_id === activePlanId);
    }
    
    // Then filter by focus if enabled
    if (showFocusedOnly) {
      filtered = filtered.filter(c => c.goal_is_focus === true);
    }
    
    return filtered;
  }, [showFocusedOnly, commitments, activePlanId]);

  // Get commitment IDs for the active plan
  const planCommitmentIds = useMemo(() => {
    if (!activePlanId) return null;
    return new Set(commitments.filter(c => c.goal_id === activePlanId).map(c => c.id));
  }, [activePlanId, commitments]);

  // Filter tasks by date based on filtered commitments - memoized
  const filteredTasksByDate = useMemo(() => {
    const focusedCommitmentIds = new Set(filteredCommitments.map(c => c.id));
    const result: Record<string, DayTask[]> = {};
    
    Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
      result[dateKey] = tasks.filter(t => {
        // Independent tasks: show if linked to active plan's goal or if no plan is active
        if (t.taskType === "independent") {
          if (activePlanId) {
            // When plan is active, only show independent tasks linked to this plan
            return t.goalId === activePlanId;
          }
          return true;
        }
        // Recurring tasks: check if commitment is in filtered set
        return focusedCommitmentIds.has(t.commitmentId || "");
      });
    });
    
    return result;
  }, [tasksByDate, filteredCommitments, activePlanId]);

  // Other tasks (not linked to active plan) - for collapsed section
  const otherTasksByDate = useMemo(() => {
    if (!activePlanId) return {};
    
    const result: Record<string, DayTask[]> = {};
    
    Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
      result[dateKey] = tasks.filter(t => {
        if (t.taskType === "independent") {
          return t.goalId !== activePlanId;
        }
        return !planCommitmentIds?.has(t.commitmentId || "");
      });
    });
    
    return result;
  }, [tasksByDate, activePlanId, planCommitmentIds]);

  // Count other tasks
  const otherTasksCount = useMemo(() => 
    Object.values(otherTasksByDate).reduce((acc, tasks) => acc + tasks.length, 0),
    [otherTasksByDate]
  );

  // Weekly progress - memoized
  const weeklyProgress = useMemo(() => 
    Object.values(filteredTasksByDate).reduce(
      (acc, tasks) => {
        const completed = tasks.filter(t => t.isCompleted).length;
        const total = tasks.length;
        return { completed: acc.completed + completed, total: acc.total + total };
      },
      { completed: 0, total: 0 }
    ),
    [filteredTasksByDate]
  );

  // Commitment totals for WeeklyTotals - memoized
  const commitmentTotals = useMemo(() => 
    filteredCommitments.map(c => ({
      id: c.id,
      title: c.title,
      planned: c.checkin?.planned_count || 0,
      actual: c.checkin?.actual_count || 0,
    })),
    [filteredCommitments]
  );

  // Goals for dropdown - memoized
  const goalOptions = useMemo(() => 
    goals.filter(g => g.goal_type === "ninety_day").map(g => ({ id: g.id, title: g.title })),
    [goals]
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* 90-Day Plan Context Header */}
      {activePlan && (
        <div className="mb-4 flex items-center justify-between py-2 px-3 bg-muted/30 border border-border rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">90-Day Plan</span>
            <span className="text-sm font-medium text-foreground truncate">{activePlan.title}</span>
            {activePlanVision && (
              <span className="text-xs text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
                {activePlanVision.title}
              </span>
            )}
          </div>
          <button
            onClick={clearPlanContext}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Clear plan context"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
          {!activePlanId && (
            <FocusFilter
              showFocusedOnly={showFocusedOnly}
              onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
            />
          )}
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
          <h2 className="text-base font-medium text-foreground">
            {weekRange}
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

      {/* Calendar grid */}
      <MemoizedCalendar
        weekStart={currentWeekStart}
        tasksByDate={filteredTasksByDate}
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        onTaskClick={handleTaskClick}
        onToggleComplete={handleToggleComplete}
        weekStartsOn={weekStartsOn}
        timeFormat={preferences.timeFormat}
        dateFormat={preferences.dateFormat}
      />

      {/* Other tasks section (when plan is active) */}
      {activePlanId && otherTasksCount > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setOtherTasksExpanded(!otherTasksExpanded)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2 flex items-center justify-center gap-1 transition-colors"
          >
            <ChevronDown 
              className={`h-4 w-4 transition-transform ${otherTasksExpanded ? 'rotate-180' : ''}`} 
            />
            Other tasks this week ({otherTasksCount})
          </button>
          
          {otherTasksExpanded && (
            <div className="mt-4 opacity-60">
              <MemoizedCalendar
                weekStart={currentWeekStart}
                tasksByDate={otherTasksByDate}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                onTaskClick={handleTaskClick}
                onToggleComplete={handleToggleComplete}
                weekStartsOn={weekStartsOn}
                timeFormat={preferences.timeFormat}
                dateFormat={preferences.dateFormat}
              />
            </div>
          )}
        </div>
      )}

      {/* Weekly totals */}
      {commitmentTotals.length > 0 && (
        <MemoizedWeeklyTotals commitments={commitmentTotals} />
      )}

      {/* Task create modal - auto-links to active plan if set */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goalOptions}
        onSuccess={refetch}
        weekStart={currentWeekStart}
        defaultGoalId={activePlanId || undefined}
      />

      {/* Task detail modal */}
      <TaskDetailModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        task={selectedTask}
        date={selectedTaskDate}
        onUpdate={refetch}
      />
    </div>
  );
};

export default Weekly;
