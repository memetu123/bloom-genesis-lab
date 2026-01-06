import { useState, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, getWeekStartsOn } from "@/hooks/useAppData";
import { useWeeklyData, DayTask } from "@/hooks/useWeeklyData";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import { formatWeekRange } from "@/lib/formatPreferences";
import CalendarLayout from "@/components/calendar/CalendarLayout";
import CalendarDateNav from "@/components/calendar/CalendarDateNav";
import TimeGrid, { TimeGridTask } from "@/components/calendar/TimeGrid";
import MobileWeekList from "@/components/weekly/MobileWeekList";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import MobileFAB from "@/components/mobile/MobileFAB";
import MobileWeekStrip from "@/components/mobile/MobileWeekStrip";

/**
 * Weekly Page - Google Calendar-inspired weekly view
 * Uses shared CalendarLayout with left rail and TimeGrid
 */

const Weekly = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { preferences, goals, visionsMap } = useAppData();
  const isMobile = useIsMobile();
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
  const { commitments, tasksByDate, loading, refetch, updateTaskCompletion } = useWeeklyData(
    currentWeekStart,
    currentWeekEnd
  );

  const weekRangeObj = formatWeekRange(currentWeekStart, currentWeekEnd, preferences.dateFormat);
  const weekRange = `${weekRangeObj.start} – ${weekRangeObj.end}`;
  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") ===
    format(startOfWeek(new Date(), { weekStartsOn }), "yyyy-MM-dd");

  // Stable handlers with useCallback
  const handleTaskClick = useCallback((task: DayTask | TimeGridTask, date: Date) => {
    setSelectedTask(task as DayTask);
    setSelectedTaskDate(date);
    setTaskModalOpen(true);
  }, []);

  const handleToggleComplete = useCallback(async (task: DayTask | TimeGridTask, date: Date) => {
    if (!user) return;
    const dateKey = format(date, "yyyy-MM-dd");
    const newCompleted = !task.isCompleted;
    
    // Optimistic update for instant feedback
    updateTaskCompletion(task.id, dateKey, newCompleted);
    
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
        const dayTask = task as DayTask;
        // Handle recurring task completion
        if (task.isCompleted) {
          // Uncompleting: delete the completion record
          await supabase
            .from("commitment_completions")
            .delete()
            .eq("commitment_id", dayTask.commitmentId)
            .eq("completed_date", dateKey);
        } else {
          // Completing: insert new completion record
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: dayTask.commitmentId,
              completed_date: dateKey,
              instance_number: dayTask.instanceNumber || 1,
            });
        }

        // Update the weekly_checkin actual_count
        if (dayTask.commitmentId) {
          const { data: checkin } = await supabase
            .from("weekly_checkins")
            .select("id, actual_count")
            .eq("weekly_commitment_id", dayTask.commitmentId)
            .eq("period_start_date", format(currentWeekStart, "yyyy-MM-dd"))
            .maybeSingle();

          if (checkin) {
            const newActualCount = newCompleted 
              ? checkin.actual_count + 1 
              : Math.max(0, checkin.actual_count - 1);
            
            await supabase
              .from("weekly_checkins")
              .update({ actual_count: newActualCount })
              .eq("id", checkin.id);
          }
        }
      }
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
      // Rollback optimistic update on error
      updateTaskCompletion(task.id, dateKey, !newCompleted);
    }
  }, [user, currentWeekStart, updateTaskCompletion]);

  const goToPreviousWeek = useCallback(() => 
    setCurrentWeekStart(prev => subWeeks(prev, 1)), []);
  const goToNextWeek = useCallback(() => 
    setCurrentWeekStart(prev => addWeeks(prev, 1)), []);
  const goToCurrentWeek = useCallback(() => 
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn })), [weekStartsOn]);

  // Filter commitments based on focus toggle - memoized
  const filteredCommitments = useMemo(() => {
    if (!showFocusedOnly) return commitments;
    return commitments.filter(c => c.vision_is_focus !== false);
  }, [showFocusedOnly, commitments]);

  // Filter tasks by date based on filtered commitments - memoized
  const filteredTasksByDate = useMemo(() => {
    const focusedCommitmentIds = new Set(filteredCommitments.map(c => c.id));
    const result: Record<string, DayTask[]> = {};
    
    Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
      result[dateKey] = tasks.filter(t => {
        if (t.taskType === "independent") {
          return true;
        }
        return focusedCommitmentIds.has(t.commitmentId || "");
      });
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

  // Commitment totals for left rail progress
  const progressItems = useMemo(() => {
    const commitmentCounts = new Map<string, { planned: number; actual: number }>();
    
    Object.values(filteredTasksByDate).forEach(tasks => {
      tasks.forEach(task => {
        if (task.commitmentId) {
          const existing = commitmentCounts.get(task.commitmentId) || { planned: 0, actual: 0 };
          existing.planned += 1;
          if (task.isCompleted) existing.actual += 1;
          commitmentCounts.set(task.commitmentId, existing);
        }
      });
    });
    
    return filteredCommitments.map(c => {
      const goal = c.goal_id ? goals.find(g => g.id === c.goal_id) : null;
      const counts = commitmentCounts.get(c.id) || { planned: 0, actual: 0 };
      return {
        id: c.id,
        title: c.title,
        planned: counts.planned,
        actual: counts.actual,
        goalTitle: goal?.title || null,
      };
    });
  }, [filteredCommitments, goals, filteredTasksByDate]);

  // Goals for task creation modal
  const goalOptions = useMemo(() => 
    goals
      .filter(g => g.goal_type === "ninety_day" && !g.is_deleted && g.status !== "archived")
      .map(g => ({ id: g.id, title: g.title })),
    [goals]
  );

  // Build columns for TimeGrid
  const timeGridColumns = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(currentWeekStart, i);
      const dateKey = format(date, "yyyy-MM-dd");
      return {
        date,
        dateKey,
        tasks: (filteredTasksByDate[dateKey] || []) as TimeGridTask[],
      };
    });
  }, [currentWeekStart, filteredTasksByDate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Date navigation header content
  const headerContent = (
    <CalendarDateNav
      dateLabel={weekRange}
      onPrev={goToPreviousWeek}
      onNext={goToNextWeek}
      onToday={goToCurrentWeek}
      showTodayButton={!isCurrentWeek}
    />
  );

  // Mobile view
  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Mobile Week Strip */}
        <MobileWeekStrip
          selectedDate={selectedDate}
          onDateSelect={(date) => {
            setSelectedDate(date);
            navigate(`/daily?date=${format(date, "yyyy-MM-dd")}`, { replace: true });
          }}
          weekStartsOn={weekStartsOn}
        />
        
        {/* Mobile Week List */}
        <div className="flex-1 px-4 py-2 pb-20 overflow-y-auto">
          <MobileWeekList
            weekStart={currentWeekStart}
            tasksByDate={filteredTasksByDate}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onTaskClick={handleTaskClick}
            onToggleComplete={handleToggleComplete}
            timeFormat={preferences.timeFormat}
          />
        </div>
        
        {/* Mobile FAB */}
        <MobileFAB onClick={() => setCreateModalOpen(true)} />

        {/* Modals */}
        <TaskCreateModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          defaultDate={selectedDate}
          goals={goalOptions}
          onSuccess={refetch}
          weekStart={currentWeekStart}
        />
        <TaskDetailModal
          open={taskModalOpen}
          onOpenChange={setTaskModalOpen}
          task={selectedTask}
          date={selectedTaskDate}
          onUpdate={refetch}
        />
      </div>
    );
  }

  // Desktop/Tablet: New CalendarLayout with TimeGrid
  return (
    <>
      <CalendarLayout
        totalPlanned={weeklyProgress.total}
        totalActual={weeklyProgress.completed}
        progressItems={progressItems}
        onAddTask={() => setCreateModalOpen(true)}
        showFocusedOnly={showFocusedOnly}
        onToggleFocus={() => setShowFocusedOnly(!showFocusedOnly)}
        headerContent={headerContent}
      >
        <TimeGrid
          columns={timeGridColumns}
          onTaskClick={handleTaskClick}
          onToggleComplete={handleToggleComplete}
          timeFormat={preferences.timeFormat}
          minColumnWidth={140}
        />
      </CalendarLayout>

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
    </>
  );
};

export default Weekly;
