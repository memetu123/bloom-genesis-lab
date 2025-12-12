import { useState, useCallback, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
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
 */

// Memoized WeeklyTotals to prevent unnecessary re-renders
const MemoizedWeeklyTotals = memo(WeeklyTotals);

// Memoized Calendar
const MemoizedCalendar = memo(NotionWeekCalendar);

const Weekly = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { preferences, goals } = useAppData();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);
  
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

  // Filter commitments based on focus toggle - memoized
  const filteredCommitments = useMemo(() => 
    showFocusedOnly
      ? commitments.filter(c => c.goal_is_focus === true)
      : commitments,
    [showFocusedOnly, commitments]
  );

  // Filter tasks by date based on focused commitments - memoized
  const filteredTasksByDate = useMemo(() => {
    const focusedCommitmentIds = new Set(filteredCommitments.map(c => c.id));
    const result: Record<string, DayTask[]> = {};
    
    Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
      result[dateKey] = tasks.filter(t => 
        t.taskType === "independent" || focusedCommitmentIds.has(t.commitmentId || "")
      );
    });
    
    return result;
  }, [tasksByDate, filteredCommitments]);

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

      {/* Weekly totals */}
      {commitmentTotals.length > 0 && (
        <MemoizedWeeklyTotals commitments={commitmentTotals} />
      )}

      {/* Task create modal */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goalOptions}
        onSuccess={refetch}
        weekStart={currentWeekStart}
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
