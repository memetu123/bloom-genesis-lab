import { useState, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, getWeekStartsOn } from "@/hooks/useAppData";
import { useWeeklyData, DayTask } from "@/hooks/useWeeklyData";
import { useTaskScheduling } from "@/hooks/useTaskScheduling";
import { useIsMobile } from "@/hooks/use-mobile";
import { useThreeYearGoalFilter } from "@/components/calendar/ThreeYearGoalFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import { formatWeekRange } from "@/lib/formatPreferences";
import CalendarLayout from "@/components/calendar/CalendarLayout";
import CalendarDateNav from "@/components/calendar/CalendarDateNav";
import ActiveFilterPill from "@/components/calendar/ActiveFilterPill";
import TimeGrid, { TimeGridTask } from "@/components/calendar/TimeGrid";
import MobileWeekList from "@/components/weekly/MobileWeekList";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import MobileFAB from "@/components/mobile/MobileFAB";
import MobileWeekStrip from "@/components/mobile/MobileWeekStrip";
import TaskDragScopeDialog from "@/components/calendar/TaskDragScopeDialog";

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
  const { selectedGoalId: selectedThreeYearGoalId, setSelectedGoalId: setSelectedThreeYearGoalId } = useThreeYearGoalFilter();
  
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

  // Drag-drop scope dialog state
  const [dragScopeDialogOpen, setDragScopeDialogOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{
    task: TimeGridTask;
    sourceDate: Date;
    targetDate: Date;
    newTimeStart: string;
    newTimeEnd: string;
  } | null>(null);

  const { createOccurrenceException, updateInstanceTime } = useTaskScheduling();

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

  // Handle task drop (drag and drop to reschedule)
  const handleTaskDrop = useCallback(async (
    task: TimeGridTask,
    sourceDate: Date,
    targetDate: Date,
    newTimeStart: string,
    newTimeEnd: string
  ) => {
    if (!user) return;
    
    const sourceDateKey = format(sourceDate, "yyyy-MM-dd");
    const targetDateKey = format(targetDate, "yyyy-MM-dd");
    const dateChanged = sourceDateKey !== targetDateKey;
    
    // For recurring tasks that change date, show scope dialog
    if (task.taskType === "recurring" && task.commitmentId && dateChanged) {
      setPendingDrop({ task, sourceDate, targetDate, newTimeStart, newTimeEnd });
      setDragScopeDialogOpen(true);
      return;
    }
    
    try {
      if (task.taskType === "independent") {
        // Update independent task directly
        await supabase
          .from("commitment_completions")
          .update({
            completed_date: targetDateKey,
            time_start: newTimeStart,
            time_end: newTimeEnd,
          })
          .eq("id", task.id);
      } else if (task.commitmentId) {
        // For recurring task time-only change, create occurrence exception
        await createOccurrenceException(
          task.commitmentId,
          sourceDateKey,
          { timeStart: newTimeStart, timeEnd: newTimeEnd }
        );
      }
      
      toast.success("Task rescheduled");
      refetch();
    } catch (error) {
      console.error("Error rescheduling task:", error);
      toast.error("Failed to reschedule task");
    }
  }, [user, createOccurrenceException, refetch]);

  // Handle drag scope dialog confirm
  const handleDragScopeConfirm = useCallback(async (scope: "this" | "all") => {
    if (!pendingDrop || !user) return;
    
    const { task, sourceDate, targetDate, newTimeStart, newTimeEnd } = pendingDrop;
    const sourceDateKey = format(sourceDate, "yyyy-MM-dd");
    const targetDateKey = format(targetDate, "yyyy-MM-dd");
    
    try {
      if (scope === "this" && task.commitmentId) {
        // Create exception for this occurrence only
        await createOccurrenceException(
          task.commitmentId,
          sourceDateKey,
          { timeStart: newTimeStart, timeEnd: newTimeEnd, newDate: targetDateKey }
        );
      } else if (scope === "all" && task.commitmentId) {
        // Update the default time for all occurrences
        await updateInstanceTime(task.commitmentId, sourceDateKey, newTimeStart, newTimeEnd);
      }
      
      toast.success("Task rescheduled");
      refetch();
    } catch (error) {
      console.error("Error rescheduling task:", error);
      toast.error("Failed to reschedule task");
    } finally {
      setPendingDrop(null);
      setDragScopeDialogOpen(false);
    }
  }, [pendingDrop, user, createOccurrenceException, updateInstanceTime, refetch]);

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

  // Build hierarchy map: 3-Year Goal ID → Set of 90-Day Plan IDs
  const threeYearTo90DayMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    
    // Get all goals by type
    const oneYearGoals = goals.filter(g => g.goal_type === "one_year");
    const ninetyDayGoals = goals.filter(g => g.goal_type === "ninety_day");
    const threeYearGoalsList = goals.filter(g => 
      g.goal_type === "three_year" && 
      !g.is_deleted && 
      g.status !== "archived" && 
      g.status !== "completed"
    );
    
    // For each 3-year goal, find its descendants
    threeYearGoalsList.forEach(threeYear => {
      const descendant90Days = new Set<string>();
      
      // Find 1-year goals under this 3-year
      const childOneYears = oneYearGoals.filter(g => g.parent_goal_id === threeYear.id);
      
      // Find 90-day plans under each 1-year
      childOneYears.forEach(oneYear => {
        ninetyDayGoals
          .filter(g => g.parent_goal_id === oneYear.id)
          .forEach(ninety => descendant90Days.add(ninety.id));
      });
      
      map.set(threeYear.id, descendant90Days);
    });
    
    return map;
  }, [goals]);

  // 3-Year goals for filter dropdown (only those with active tasks on the schedule)
  const threeYearGoals = useMemo(() => {
    // Get all 90-day goal IDs that have active commitments
    const active90DayIds = new Set(
      filteredCommitments
        .filter(c => c.goal_id)
        .map(c => c.goal_id!)
    );
    
    // Filter 3-Year goals to only those with active tasks
    return goals
      .filter(g => 
        g.goal_type === "three_year" && 
        !g.is_deleted && 
        g.status !== "archived" && 
        g.status !== "completed"
      )
      .filter(threeYear => {
        const descendant90Days = threeYearTo90DayMap.get(threeYear.id);
        if (!descendant90Days || descendant90Days.size === 0) return false;
        // Check if any descendant 90-day has active commitments
        return Array.from(descendant90Days).some(id => active90DayIds.has(id));
      })
      .map(g => ({ id: g.id, title: g.title }));
  }, [goals, filteredCommitments, threeYearTo90DayMap]);

  // Get selected 3-Year goal title for filter pill
  const selectedThreeYearGoalTitle = useMemo(() => {
    if (!selectedThreeYearGoalId) return null;
    return threeYearGoals.find(g => g.id === selectedThreeYearGoalId)?.title || null;
  }, [selectedThreeYearGoalId, threeYearGoals]);

  // Build columns for TimeGrid with muting logic
  const timeGridColumns = useMemo(() => {
    const allowed90DayIds = selectedThreeYearGoalId 
      ? threeYearTo90DayMap.get(selectedThreeYearGoalId) 
      : null;
    
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(currentWeekStart, i);
      const dateKey = format(date, "yyyy-MM-dd");
      const dayTasks = filteredTasksByDate[dateKey] || [];
      
      // Apply muting based on 3-Year filter
      const tasksWithMuting: TimeGridTask[] = dayTasks.map(task => ({
        ...task,
        isMuted: allowed90DayIds !== null && task.goalId 
          ? !allowed90DayIds.has(task.goalId) 
          : false,
      }));
      
      return {
        date,
        dateKey,
        tasks: tasksWithMuting,
      };
    });
  }, [currentWeekStart, filteredTasksByDate, selectedThreeYearGoalId, threeYearTo90DayMap]);

  // Filtered progress for left rail (when 3-Year filter is active)
  const filteredProgressItems = useMemo(() => {
    if (!selectedThreeYearGoalId) return progressItems;
    
    const allowed90DayIds = threeYearTo90DayMap.get(selectedThreeYearGoalId);
    if (!allowed90DayIds) return progressItems;
    
    // Filter commitments to only those under selected 3-Year goal
    return progressItems.filter(item => {
      const commitment = filteredCommitments.find(c => c.id === item.id);
      if (!commitment?.goal_id) return false;
      return allowed90DayIds.has(commitment.goal_id);
    });
  }, [progressItems, selectedThreeYearGoalId, threeYearTo90DayMap, filteredCommitments]);

  // Filtered progress totals
  const filteredWeeklyProgress = useMemo(() => {
    if (!selectedThreeYearGoalId) return weeklyProgress;
    
    const allowed90DayIds = threeYearTo90DayMap.get(selectedThreeYearGoalId);
    if (!allowed90DayIds) return weeklyProgress;
    
    return Object.values(filteredTasksByDate).reduce(
      (acc, tasks) => {
        const filteredTasks = tasks.filter(t => t.goalId && allowed90DayIds.has(t.goalId));
        const completed = filteredTasks.filter(t => t.isCompleted).length;
        const total = filteredTasks.length;
        return { completed: acc.completed + completed, total: acc.total + total };
      },
      { completed: 0, total: 0 }
    );
  }, [selectedThreeYearGoalId, threeYearTo90DayMap, filteredTasksByDate, weeklyProgress]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Date navigation header content with active filter pill
  const headerContent = (
    <div className="flex items-center gap-3">
      <CalendarDateNav
        dateLabel={weekRange}
        onPrev={goToPreviousWeek}
        onNext={goToNextWeek}
        onToday={goToCurrentWeek}
        showTodayButton={!isCurrentWeek}
      />
      {selectedThreeYearGoalTitle && (
        <ActiveFilterPill
          goalTitle={selectedThreeYearGoalTitle}
          onClear={() => setSelectedThreeYearGoalId(null)}
        />
      )}
    </div>
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
    <div className="h-full overflow-hidden flex flex-col">
      <CalendarLayout
        totalPlanned={filteredWeeklyProgress.total}
        totalActual={filteredWeeklyProgress.completed}
        progressItems={filteredProgressItems}
        onAddTask={() => setCreateModalOpen(true)}
        showFocusedOnly={showFocusedOnly}
        onToggleFocus={() => setShowFocusedOnly(!showFocusedOnly)}
        threeYearGoals={threeYearGoals}
        selectedThreeYearGoalId={selectedThreeYearGoalId}
        onSelectThreeYearGoal={setSelectedThreeYearGoalId}
        headerContent={headerContent}
      >
        <TimeGrid
          columns={timeGridColumns}
          onTaskClick={handleTaskClick}
          onToggleComplete={handleToggleComplete}
          onTaskDrop={handleTaskDrop}
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

      {/* Drag scope dialog for recurring tasks */}
      <TaskDragScopeDialog
        open={dragScopeDialogOpen}
        onOpenChange={setDragScopeDialogOpen}
        onConfirm={handleDragScopeConfirm}
        sourceDate={pendingDrop ? format(pendingDrop.sourceDate, "yyyy-MM-dd") : ""}
        targetDate={pendingDrop ? format(pendingDrop.targetDate, "yyyy-MM-dd") : ""}
      />
    </div>
  );
};

export default Weekly;
