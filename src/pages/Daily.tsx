import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, getWeekStartsOn } from "@/hooks/useAppData";
import { useDailyData, DailyTask } from "@/hooks/useDailyData";
import { supabase } from "@/integrations/supabase/client";
import { useTaskScheduling } from "@/hooks/useTaskScheduling";
import { useThreeYearGoalFilter } from "@/components/calendar/ThreeYearGoalFilterContext";
import { toast } from "sonner";
import { format, addDays, subDays, parseISO, startOfWeek } from "date-fns";
import { formatDateWithDay } from "@/lib/formatPreferences";
import CalendarLayout from "@/components/calendar/CalendarLayout";
import CalendarDateNav from "@/components/calendar/CalendarDateNav";
import ActiveFilterPill from "@/components/calendar/ActiveFilterPill";
import TimeGrid, { TimeGridTask } from "@/components/calendar/TimeGrid";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import MobileWeekStrip from "@/components/mobile/MobileWeekStrip";
import MobileFAB from "@/components/mobile/MobileFAB";
import { Unlink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Daily Page - Google Calendar-inspired daily view
 * Uses shared CalendarLayout with left rail and TimeGrid (single column)
 */

// Mobile task item component
const MobileTaskItem = memo(({ 
  task, 
  onToggle, 
  onClick,
}: { 
  task: DailyTask; 
  onToggle: () => void;
  onClick: () => void;
}) => {
  const instanceLabel = task.totalInstances && task.totalInstances > 1
    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
    : "";

  return (
    <div className="py-2 hover:bg-muted/30 -mx-2 px-2 rounded transition-calm">
      <div className="flex items-start gap-3">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`flex-shrink-0 text-lg ${task.isCompleted ? "text-primary" : "hover:text-primary"}`}
        >
          {task.isCompleted ? "●" : "○"}
        </button>
        <button
          onClick={onClick}
          className="flex-1 text-left"
        >
          <span className={`text-sm ${task.isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {task.title}{instanceLabel}
          </span>
          {(task.timeStart || task.taskType === "independent" || task.isDetached) && (
            <div className="flex items-center gap-2 mt-0.5">
              {task.timeStart && (
                <span className="text-xs text-muted-foreground">
                  {task.timeStart}
                  {task.timeEnd && ` - ${task.timeEnd}`}
                </span>
              )}
              {task.taskType === "independent" && !task.isDetached && (
                <span className="text-[9px] bg-muted px-1 rounded">1x</span>
              )}
              {task.isDetached && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Unlink className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Detached from recurring task
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </button>
      </div>
      {/* Goal context */}
      {task.goalTitle && (
        <div className="mt-1 ml-8">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[hsl(75,20%,90%)] dark:bg-[hsl(75,15%,22%)] text-[hsl(75,30%,40%)] dark:text-[hsl(75,25%,60%)]">
            90d
          </span>
          <span className="text-[11px] text-muted-foreground ml-1.5">
            {task.goalTitle}
          </span>
        </div>
      )}
    </div>
  );
});
MobileTaskItem.displayName = 'MobileTaskItem';

const Daily = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { preferences, goals } = useAppData();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);
  const isMobile = useIsMobile();
  const { createOccurrenceException } = useTaskScheduling();
  const { selectedGoalId: selectedThreeYearGoalId, setSelectedGoalId: setSelectedThreeYearGoalId } = useThreeYearGoalFilter();
  
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  // Get date from URL
  const dateParam = searchParams.get("date");
  const taskIdParam = searchParams.get("taskId");
  
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (dateParam) {
      try {
        return parseISO(dateParam);
      } catch {
        return new Date();
      }
    }
    return new Date();
  });

  // Use centralized data hook
  const { tasks, loading, refetch, updateTaskCompletion } = useDailyData(
    selectedDate,
    weekStartsOn
  );

  // Store taskId to open modal after loading
  useEffect(() => {
    if (taskIdParam) {
      setPendingTaskId(taskIdParam);
    }
  }, [taskIdParam]);

  // Open task modal when tasks are loaded and we have a pending taskId
  useEffect(() => {
    if (pendingTaskId && !loading && tasks.length > 0) {
      const task = tasks.find(t => t.commitmentId === pendingTaskId);
      if (task) {
        setSelectedTask(task);
        setModalOpen(true);
      }
      setPendingTaskId(null);
    }
  }, [pendingTaskId, loading, tasks]);

  const formattedDate = formatDateWithDay(selectedDate, preferences.dateFormat);
  const dateKey = format(selectedDate, "yyyy-MM-dd");

  // Stable handlers
  const handleTaskClick = useCallback((task: DailyTask | TimeGridTask) => {
    setSelectedTask(task as DailyTask);
    setModalOpen(true);
  }, []);

  const handleToggleComplete = useCallback(async (task: DailyTask | TimeGridTask) => {
    if (!user) return;
    const newCompleted = !task.isCompleted;
    
    // Optimistic update
    updateTaskCompletion(task.id, newCompleted);
    
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
        const dailyTask = task as DailyTask;
        // Check if completion record exists
        const { data: existingCompletion } = await supabase
          .from("commitment_completions")
          .select("id")
          .eq("commitment_id", dailyTask.commitmentId)
          .eq("completed_date", dateKey)
          .maybeSingle();

        if (existingCompletion) {
          // Update the is_completed flag
          await supabase
            .from("commitment_completions")
            .update({ is_completed: !task.isCompleted })
            .eq("id", existingCompletion.id);
        } else {
          // Create new completion record
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: dailyTask.commitmentId,
              completed_date: dateKey,
              instance_number: dailyTask.instanceNumber || 1,
              is_completed: true,
            });
        }
      }
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
      // Rollback optimistic update
      updateTaskCompletion(task.id, !newCompleted);
    }
  }, [user, dateKey, updateTaskCompletion]);

  // Handle task drop (drag and drop to reschedule)
  const handleTaskDrop = useCallback(async (
    task: DailyTask | TimeGridTask,
    _sourceDate: Date,
    _targetDate: Date,
    newTimeStart: string,
    newTimeEnd: string
  ) => {
    if (!user) return;
    
    try {
      if (task.taskType === "independent") {
        // Update independent task time directly
        await supabase
          .from("commitment_completions")
          .update({
            time_start: newTimeStart,
            time_end: newTimeEnd,
          })
          .eq("id", task.id);
      } else if ((task as DailyTask).commitmentId) {
        // Create occurrence exception for recurring task
        await createOccurrenceException(
          (task as DailyTask).commitmentId!,
          dateKey,
          { timeStart: newTimeStart, timeEnd: newTimeEnd }
        );
      }
      
      toast.success("Task time updated");
      refetch();
    } catch (error) {
      console.error("Error updating task time:", error);
      toast.error("Failed to update task");
    }
  }, [user, dateKey, createOccurrenceException, refetch]);

  const goToPreviousDay = useCallback(() => {
    const newDate = subDays(selectedDate, 1);
    setSelectedDate(newDate);
    navigate(`/daily?date=${format(newDate, "yyyy-MM-dd")}`, { replace: true });
  }, [selectedDate, navigate]);

  const goToNextDay = useCallback(() => {
    const newDate = addDays(selectedDate, 1);
    setSelectedDate(newDate);
    navigate(`/daily?date=${format(newDate, "yyyy-MM-dd")}`, { replace: true });
  }, [selectedDate, navigate]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setSelectedDate(today);
    navigate(`/daily?date=${format(today, "yyyy-MM-dd")}`, { replace: true });
  }, [navigate]);

  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  // Filter tasks based on focus toggle - memoized
  const filteredTasks = useMemo(() =>
    showFocusedOnly
      ? tasks.filter(t => t.visionIsFocus !== false)
      : tasks,
    [showFocusedOnly, tasks]
  );

  // Separate tasks - memoized
  const { scheduledTasks, unscheduledTasks } = useMemo(() => ({
    scheduledTasks: filteredTasks
      .filter(t => t.timeStart)
      .sort((a, b) => (a.timeStart || "").localeCompare(b.timeStart || "")),
    unscheduledTasks: filteredTasks.filter(t => !t.timeStart)
  }), [filteredTasks]);

  // Daily progress
  const dailyCompleted = filteredTasks.filter(t => t.isCompleted).length;
  const dailyTotal = filteredTasks.length;

  // Goals for task creation modal
  const goalOptions = useMemo(() => 
    goals.filter(g => g.goal_type === "ninety_day").map(g => ({ id: g.id, title: g.title })),
    [goals]
  );

  // 3-Year goals for filter dropdown (only active, non-deleted, non-archived, non-completed)
  const threeYearGoals = useMemo(() => 
    goals
      .filter(g => 
        g.goal_type === "three_year" && 
        !g.is_deleted && 
        g.status !== "archived" && 
        g.status !== "completed"
      )
      .map(g => ({ id: g.id, title: g.title })),
    [goals]
  );

  // Build hierarchy map: 3-Year Goal ID → Set of 90-Day Plan IDs
  const threeYearTo90DayMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const oneYearGoals = goals.filter(g => g.goal_type === "one_year");
    const ninetyDayGoals = goals.filter(g => g.goal_type === "ninety_day");
    
    threeYearGoals.forEach(threeYear => {
      const descendant90Days = new Set<string>();
      const childOneYears = oneYearGoals.filter(g => g.parent_goal_id === threeYear.id);
      childOneYears.forEach(oneYear => {
        ninetyDayGoals
          .filter(g => g.parent_goal_id === oneYear.id)
          .forEach(ninety => descendant90Days.add(ninety.id));
      });
      map.set(threeYear.id, descendant90Days);
    });
    return map;
  }, [goals, threeYearGoals]);

  const selectedThreeYearGoalTitle = useMemo(() => {
    if (!selectedThreeYearGoalId) return null;
    return threeYearGoals.find(g => g.id === selectedThreeYearGoalId)?.title || null;
  }, [selectedThreeYearGoalId, threeYearGoals]);

  // Build single column for TimeGrid with muting
  const timeGridColumns = useMemo(() => {
    const allowed90DayIds = selectedThreeYearGoalId 
      ? threeYearTo90DayMap.get(selectedThreeYearGoalId) 
      : null;
    
    const tasksWithMuting: TimeGridTask[] = filteredTasks.map(task => ({
      ...task,
      isMuted: allowed90DayIds !== null && task.goalId 
        ? !allowed90DayIds.has(task.goalId) 
        : false,
    }));
    
    return [{
      date: selectedDate,
      dateKey: format(selectedDate, "yyyy-MM-dd"),
      tasks: tasksWithMuting,
    }];
  }, [selectedDate, filteredTasks, selectedThreeYearGoalId, threeYearTo90DayMap]);

  // Task list for left rail
  const taskListForRail = useMemo(() => 
    filteredTasks.map(task => ({
      id: task.id,
      title: task.title,
      isCompleted: task.isCompleted,
      goalTitle: task.goalTitle || null,
    })),
    [filteredTasks]
  );
  
  // Handler for task click from left rail
  const handleTaskClickFromRail = useCallback((taskId: string) => {
    const task = filteredTasks.find(t => t.id === taskId);
    if (task) {
      handleTaskClick(task);
    }
  }, [filteredTasks, handleTaskClick]);
  
  // Handler for task toggle from left rail
  const handleTaskToggleFromRail = useCallback((taskId: string) => {
    const task = filteredTasks.find(t => t.id === taskId);
    if (task) {
      handleToggleComplete(task);
    }
  }, [filteredTasks, handleToggleComplete]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Date navigation header content with active filter pill
  const headerContent = (
    <div className="flex items-center gap-3">
      <CalendarDateNav
        dateLabel={formattedDate}
        onPrev={goToPreviousDay}
        onNext={goToNextDay}
        onToday={goToToday}
        showTodayButton={!isToday}
      />
      {selectedThreeYearGoalTitle && (
        <ActiveFilterPill
          goalTitle={selectedThreeYearGoalTitle}
          onClear={() => setSelectedThreeYearGoalId(null)}
        />
      )}
    </div>
  );

  // Mobile: Minimal chrome with week strip
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

        {/* Task list */}
        <div className="flex-1 px-4 pt-3 pb-20 overflow-y-auto">
          {/* Progress indicator */}
          {dailyTotal > 0 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">
                {dailyCompleted}/{dailyTotal} completed
              </span>
            </div>
          )}

          {filteredTasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">
                {showFocusedOnly
                  ? "No focused tasks for this day"
                  : "No tasks scheduled"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Scheduled tasks */}
              {scheduledTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Scheduled
                  </h3>
                  <div className="space-y-1">
                    {scheduledTasks.map((task) => (
                      <MobileTaskItem
                        key={task.id}
                        task={task}
                        onToggle={() => handleToggleComplete(task)}
                        onClick={() => handleTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Unscheduled tasks */}
              {unscheduledTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    No Time Assigned
                  </h3>
                  <div className="space-y-1">
                    {unscheduledTasks.map((task) => (
                      <MobileTaskItem
                        key={task.id}
                        task={task}
                        onToggle={() => handleToggleComplete(task)}
                        onClick={() => handleTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
        />
        <TaskDetailModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          task={selectedTask}
          date={selectedDate}
          onUpdate={refetch}
        />
      </div>
    );
  }

  // Desktop/Tablet: New CalendarLayout with single-column TimeGrid
  return (
    <>
      <CalendarLayout
        totalPlanned={dailyTotal}
        totalActual={dailyCompleted}
        taskList={taskListForRail}
        onTaskClick={handleTaskClickFromRail}
        onTaskToggle={handleTaskToggleFromRail}
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
          onTaskClick={(task) => handleTaskClick(task)}
          onToggleComplete={(task) => handleToggleComplete(task)}
          onTaskDrop={handleTaskDrop}
          timeFormat={preferences.timeFormat}
          minColumnWidth={400}
          className="max-w-3xl mx-auto"
        />
      </CalendarLayout>

      {/* Task create modal */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goalOptions}
        onSuccess={refetch}
      />

      {/* Task detail modal */}
      <TaskDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        task={selectedTask}
        date={selectedDate}
        onUpdate={refetch}
      />
    </>
  );
};

export default Daily;
